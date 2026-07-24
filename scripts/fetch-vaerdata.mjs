/**
 * Værdata-innsamler.
 * Kjøres av GitHub Action (.github/workflows/update-vaerdata.yml) og manuelt:
 *   node scripts/fetch-vaerdata.mjs [staticRoot=static]
 *
 * Gjør tre ting per konfigurert sted (static/vaerdata/config.json):
 *  1) FORECAST-SNAPSHOT: henter MET Locationforecast 2.0 og lagrer et kompakt,
 *     tidsstemplet snapshot (48 t timeserie + 10 døgn 06–06-UTC-aggregat).
 *     Dette er grunnlaget for varseltreffsikkerhet — varselet lagres FØR fasiten finnes.
 *  2) OBSERVASJONER: henter NVE GridTimeSeries (seNorge-grid 1×1 km, UTM33)
 *     og vedlikeholder en rullende døgnserie per sted (backfill ved hull).
 *  3) TREFFSIKKERHET: matcher lagrede varsler mot observasjoner på identisk
 *     06–06-UTC-døgn og forhåndsberegner statistikk + walk-forward-backtest.
 *
 * Kilder (dokumentert i static/vaerdata/README.md):
 *  - https://api.met.no/weatherapi/locationforecast/2.0/documentation (NLOD/CC BY 4.0)
 *  - https://api.nve.no/doc/gridtimeseries-data-gts/ (NLOD)
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { utm33, aggregateForecastDays, accuracyStats, precipEvents, precipCalibration, walkForwardBacktest, isNum, round1 } from '../static/vaerdata/models.mjs';

const STATIC = process.argv[2] || 'static';
const BASE = path.join(STATIC, 'vaerdata');
const DATA = path.join(BASE, 'data');
const OBS_BACKFILL_DAYS = 90;   // første kjøring henter 90 dagers historikk
const OBS_KEEP_DAYS = 400;      // rullende vindu i observasjonsfilene
const FC_HOURS_KEPT = 48;       // timer med timeserie per snapshot

const cfg = JSON.parse(await readFile(path.join(BASE, 'config.json'), 'utf8'));
const UA = cfg.user_agent;
const status = { updated: new Date().toISOString(), locations: {}, sources: cfg.sources, errors: [] };

await mkdir(path.join(DATA, 'forecasts'), { recursive: true });
await mkdir(path.join(DATA, 'observations'), { recursive: true });
await mkdir(path.join(DATA, 'accuracy'), { recursive: true });

async function getJSON(url, headers = {}) {
  const r = await fetch(url, { headers: { 'Accept': 'application/json', ...headers } });
  if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
  return r.json();
}
async function readJSONIf(p, fallback) {
  if (!existsSync(p)) return fallback;
  try { return JSON.parse(await readFile(p, 'utf8')); } catch { return fallback; }
}
const iso = d => d.toISOString().slice(0, 10);
const addDays = (d, n) => new Date(d.getTime() + n * 86400e3);

/* ---------- 1) Forecast-snapshot fra MET ---------- */
async function collectForecast(loc) {
  const url = `https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=${loc.lat}&lon=${loc.lon}`;
  const d = await getJSON(url, { 'User-Agent': UA });
  const updatedAt = d.properties?.meta?.updated_at || null;
  const series = d.properties.timeseries;

  // Timeserie: instant + nedbør fra next_1_hours (fallback next_6_hours/6 pr time er
  // feil — vi lagrer 6t-blokker som egen verdi kun når 1t mangler, merket i felt 4)
  const hours = [];
  for (const p of series) {
    const inst = p.data?.instant?.details || {};
    const n1 = p.data?.next_1_hours?.details?.precipitation_amount;
    const n6 = p.data?.next_6_hours?.details?.precipitation_amount;
    hours.push({
      time: p.time,
      temp: inst.air_temperature,
      wind: inst.wind_speed,
      rh: inst.relative_humidity,
      precip: isNum(n1) ? n1 : (isNum(n6) ? n6 : null),
      precipSpanH: isNum(n1) ? 1 : (isNum(n6) ? 6 : null),
      symbol: p.data?.next_1_hours?.summary?.symbol_code || p.data?.next_6_hours?.summary?.symbol_code || null,
    });
  }
  // Døgnaggregat 06–06 UTC — samme vindu som NVE-observasjonene (kompatibel matching).
  // Bruk kun punkter med 1t-nedbør + de 6t-blokkene som starter 00/06/12/18 (unngå dobbelttelling).
  const aggInput = [];
  for (const h of hours) {
    if (h.precipSpanH === 1) aggInput.push({ time: h.time, temp: h.temp, precip: h.precip, wind: h.wind, spanH: 1 });
    else if (h.precipSpanH === 6 && [0, 6, 12, 18].includes(new Date(h.time).getUTCHours())) {
      aggInput.push({ time: h.time, temp: h.temp, precip: h.precip, wind: h.wind, spanH: 6 });
    } else aggInput.push({ time: h.time, temp: h.temp, precip: null, wind: h.wind, spanH: null });
  }
  const daily = aggregateForecastDays(aggInput, 10);

  const collected = new Date().toISOString();
  const snapshot = {
    c: collected,
    m: updatedAt, // MET-modellkjøringens updated_at
    h: hours.slice(0, FC_HOURS_KEPT).map(h => [h.time, round1(h.temp), h.precip, round1(h.wind), h.precipSpanH]),
    d: daily.map(x => [x.date, x.tmean, x.tmin, x.tmax, x.precip, x.windmax, x.covH]),
  };

  const month = collected.slice(0, 7);
  const fp = path.join(DATA, 'forecasts', `${loc.id}-${month}.json`);
  const file = await readJSONIf(fp, { location: loc.id, month, format: { d: '[måldato (vindu D−1 06:00 → D 06:00 UTC), tmean, tmin, tmax, precipSum, windMax, covH (timer dekket av nedbørsvarselet)]', h: '[isoTime, tempC, precipMm, windMs, precipSpanH]' }, snapshots: [] });
  file.snapshots.push(snapshot);
  await writeFile(fp, JSON.stringify(file));
  return { snapshots: file.snapshots.length, metModelRun: updatedAt, dailyDays: daily.length };
}

/* ---------- 2) Observasjoner fra NVE GTS ---------- */
async function collectObservations(loc) {
  const { x, y } = utm33(loc.lat, loc.lon);
  const fp = path.join(DATA, 'observations', `${loc.id}.json`);
  const file = await readJSONIf(fp, { location: loc.id, name: loc.name, utm33: { x, y }, altitude: null, dates: [], params: {}, updated: null });

  // GTS-døgnverdien merket dato D dekker D−1 06:00 → D 06:00 UTC (verifisert
  // empirisk 2026-07-22). Verdien for DAGENS dato er altså komplett kl. 06 UTC:
  const now = new Date();
  const lastComplete = now.getUTCHours() >= 6 ? iso(now) : iso(addDays(now, -1));
  const lastDate = file.dates.length ? file.dates[file.dates.length - 1] : null;
  const start = lastDate ? iso(addDays(new Date(lastDate + 'T00:00:00Z'), 1)) : iso(addDays(now, -OBS_BACKFILL_DAYS));
  if (start > lastComplete) return { upToDate: true, days: file.dates.length };

  // Datoliste for perioden — aldri utover lastComplete (GTS serverer prognoser
  // for fremtidige datoer UTEN markør; de må ikke lagres som fasit)
  const newDates = [];
  for (let d = new Date(start + 'T00:00:00Z'); iso(d) <= lastComplete; d = addDays(d, 1)) newDates.push(iso(d));

  // Alt-eller-ingenting: feiler ett tema, lagres ingenting for perioden —
  // ellers ville null-hull fryses permanent inn (lastDate rykker frem uten re-henting).
  const fetched = {};
  for (const theme of loc.gts_params) {
    const url = `https://gts.nve.no/api/GridTimeSeries/${x}/${y}/${start}/${lastComplete}/${theme}.json`;
    const r = await getJSON(url); // kast → hele stedet hoppes over denne kjøringen, re-hentes neste
    const noData = r.NoDataValue;
    file.altitude = r.Altitude ?? file.altitude;
    fetched[theme] = (r.Data || []).map(v => (v === noData || !isNum(v)) ? null : v);
  }
  // Append i takt med datoene
  file.dates.push(...newDates);
  for (const theme of loc.gts_params) {
    if (!file.params[theme]) file.params[theme] = file.dates.slice(0, file.dates.length - newDates.length).map(() => null);
    const vals = fetched[theme] || [];
    for (let i = 0; i < newDates.length; i++) file.params[theme].push(vals[i] ?? null);
  }
  // Rullende vindu
  if (file.dates.length > OBS_KEEP_DAYS) {
    const cut = file.dates.length - OBS_KEEP_DAYS;
    file.dates = file.dates.slice(cut);
    for (const k of Object.keys(file.params)) file.params[k] = file.params[k].slice(cut);
  }
  file.updated = new Date().toISOString();
  file.window = 'Døgnverdi merket dato D dekker D−1 06:00 → D 06:00 UTC (seNorge-døgnet; vinduet SLUTTER på datoen)';
  await writeFile(fp, JSON.stringify(file));
  return { days: file.dates.length, newDays: newDates.length, altitude: file.altitude };
}

/* ---------- 3) Treffsikkerhet: match varsler mot observasjoner ---------- */
async function computeAccuracy(loc) {
  const obs = await readJSONIf(path.join(DATA, 'observations', `${loc.id}.json`), null);
  if (!obs || !obs.dates.length) return { pairs: 0 };
  const obsIdx = new Map(obs.dates.map((d, i) => [d, i]));

  // Les alle snapshot-månedsfiler for stedet
  const { readdir } = await import('node:fs/promises');
  const dir = path.join(DATA, 'forecasts');
  const files = (await readdir(dir)).filter(f => f.startsWith(loc.id + '-') && f.endsWith('.json'));
  const pairs = []; // [date, leadDays, var, fc, obs]
  let nSnapshots = 0;
  for (const f of files) {
    const mf = await readJSONIf(path.join(dir, f), null);
    if (!mf) continue;
    for (const s of mf.snapshots) {
      nSnapshots++;
      const collectedDate = s.c.slice(0, 10);
      for (const row of s.d) {
        const [date, tmean, , , precip, , covH] = row;
        const i = obsIdx.get(date);
        if (i == null) continue; // fasit ikke kjent ennå
        // Kun tilnærmet KOMPLETT dekkede varselvinduer (≥ 22 av 24 t) kan matches
        // mot 24-timersfasit — et kveldssnapshot dekker bare resten av inneværende
        // vindu og ville fabrikkert «undervarsling» på kort ledetid.
        if (!isNum(covH) || covH < 22) continue;
        const lead = Math.round((Date.parse(date) - Date.parse(collectedDate)) / 86400e3);
        if (lead < 0) continue;
        const oTm = obs.params.tm?.[i], oRr = obs.params.rr?.[i];
        if (isNum(tmean) && isNum(oTm)) pairs.push({ date, lead, v: 'temp', fc: tmean, obs: oTm, s: collectedDate });
        if (isNum(precip) && isNum(oRr)) pairs.push({ date, lead, v: 'precip', fc: precip, obs: oRr, s: collectedDate });
      }
    }
  }

  const leadBuckets = { '0-1': l => l <= 1, '2-3': l => l >= 2 && l <= 3, '4-6': l => l >= 4 && l <= 6, '7-9': l => l >= 7 };
  const out = { updated: new Date().toISOString(), location: loc.id, nSnapshots, nPairs: pairs.length, collectionStarted: cfg.accuracy.collection_started, variables: {} };
  for (const v of ['temp', 'precip']) {
    const pv = pairs.filter(p => p.v === v);
    const byLead = {};
    for (const [k, fn] of Object.entries(leadBuckets)) {
      const sub = pv.filter(p => fn(p.lead));
      byLead[k] = accuracyStats(sub);
      if (v === 'precip') byLead[k].events = precipEvents(sub, cfg.accuracy.precip_event_threshold_mm);
    }
    // Situasjoner
    const nearZero = pv.filter(p => {
      const i = obsIdx.get(p.date); const t = obs.params.tm?.[i];
      return isNum(t) && Math.abs(t) <= 2;
    });
    const heavy = v === 'precip' ? pv.filter(p => p.obs >= 10) : [];
    const byMonth = {};
    for (const p of pv) { const m = p.date.slice(0, 7); (byMonth[m] ||= []).push(p); }
    out.variables[v] = {
      all: accuracyStats(pv),
      byLead,
      nearZero: accuracyStats(nearZero),
      heavyPrecip: v === 'precip' ? accuracyStats(heavy) : undefined,
      events: v === 'precip' ? precipEvents(pv, cfg.accuracy.precip_event_threshold_mm) : undefined,
      calibration: v === 'precip' ? precipCalibration(pv, cfg.accuracy.precip_event_threshold_mm) : undefined,
      calibrationShortLead: v === 'precip' ? precipCalibration(pv.filter(p => p.lead <= 1), cfg.accuracy.precip_event_threshold_mm) : undefined,
      byMonth: Object.fromEntries(Object.entries(byMonth).map(([m, ps]) => [m, accuracyStats(ps)])),
      backtest: walkForwardBacktest(pv, cfg.accuracy.shrinkage_k, cfg.accuracy.backtest_holdout_fraction),
    };
  }
  await writeFile(path.join(DATA, 'accuracy', `${loc.id}.json`), JSON.stringify(out));
  await writeFile(path.join(DATA, 'accuracy', `${loc.id}-pairs.json`), JSON.stringify({ format: '[måldato (vindu slutter D 06 UTC), leadDøgn, variabel, varslet, observert, snapshotDato]', pairs: pairs.map(p => [p.date, p.lead, p.v, p.fc, p.obs, p.s]) }));
  return { pairs: pairs.length, snapshots: nSnapshots };
}

/* ---------- Kjør ---------- */
for (const loc of cfg.locations) {
  const st = {};
  try { st.forecast = await collectForecast(loc); } catch (e) { st.forecast = { error: e.message }; status.errors.push(`MET ${loc.id}: ${e.message}`); }
  try { st.observations = await collectObservations(loc); } catch (e) { st.observations = { error: e.message }; status.errors.push(`OBS ${loc.id}: ${e.message}`); }
  // Treffsikkerhet beregnes KUN for Bergen (golf) — bevisst avgrenset (Einars ønske).
  if (loc.type === 'golf') {
    try { st.accuracy = await computeAccuracy(loc); } catch (e) { st.accuracy = { error: e.message }; status.errors.push(`ACC ${loc.id}: ${e.message}`); }
  }
  status.locations[loc.id] = st;
  console.log(loc.id, JSON.stringify(st));
}
await writeFile(path.join(DATA, 'latest.json'), JSON.stringify(status, null, 1));
if (Object.values(status.locations).every(s => s.forecast?.error && s.observations?.error)) {
  console.error('Alt feilet:', status.errors);
  process.exit(1);
}
console.log('Værdata oppdatert.', status.errors.length ? `Delfeil: ${status.errors.join('; ')}` : 'Ingen feil.');
