/**
 * Værdata — klientapp. Ren JS (ESM), ingen rammeverk.
 * Data: MET Locationforecast live (CORS åpen) + statiske JSON-filer samlet av
 * scripts/fetch-vaerdata.mjs (NVE-observasjoner, forecast-snapshots, treffsikkerhet).
 * Merkelapper i UI: [Observert]=NVE-grid, [Varslet]=MET, [Modellert]=vår beregning,
 * [Registrert]=dine lokale registreringer (localStorage), [Antatt]=antakelse.
 */
import { golfMoisture, rainSummary, greenspeed, classifySnow, waxAdvice, evidenceLevel, isNum, round1, aggregateForecastDays } from 'vd-models';

const ROOT = document.getElementById('vaerdata-app');

const RAW ='https://raw.githubusercontent.com/Einar-Storvestre/Einar-Storvestre.github.io/main/static/vaerdata/data/';
const LOCAL = '/vaerdata/data/';
const LS = {
  get(k, fb) { try { return JSON.parse(localStorage.getItem('vd.' + k)) ?? fb; } catch { return fb; } },
  set(k, v) { try { localStorage.setItem('vd.' + k, JSON.stringify(v)); } catch { /* privat modus o.l. */ } },
};

let CFG = null;
const metCache = new Map();
const dataCache = new Map();

/* ---------------- datalast ---------------- */
async function fetchJSON(url) {
  // no-cache: revalider alltid — datafilene oppdateres 2×/døgn og et stale svar
  // ville vist gårsdagens «siste observasjon» som dagens
  const r = await fetch(url, { headers: { Accept: 'application/json' }, cache: 'no-cache' });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
}
/** Statiske datafiler: ferskest fra raw.githubusercontent (Action-oppdatert), fallback lokal kopi. */
async function loadData(rel) {
  if (dataCache.has(rel)) return dataCache.get(rel);
  let out = null;
  try { out = await fetchJSON(RAW + rel); }
  catch { try { out = await fetchJSON(LOCAL + rel); } catch { out = null; } }
  if (out) dataCache.set(rel, out); // aldri cache feil — nytt fanebesøk prøver igjen
  return out;
}
async function metForecast(loc) {
  const key = loc.id;
  if (metCache.has(key)) return metCache.get(key);
  const d = await fetchJSON(`https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=${loc.lat}&lon=${loc.lon}`);
  const hours = d.properties.timeseries.map(p => {
    const inst = p.data?.instant?.details || {};
    const n1 = p.data?.next_1_hours?.details?.precipitation_amount;
    const n6 = p.data?.next_6_hours?.details?.precipitation_amount;
    return {
      time: p.time, temp: inst.air_temperature, wind: inst.wind_speed, rh: inst.relative_humidity,
      precip: isNum(n1) ? n1 : (isNum(n6) ? n6 : null), span: isNum(n1) ? 1 : (isNum(n6) ? 6 : null),
      symbol: p.data?.next_1_hours?.summary?.symbol_code || p.data?.next_6_hours?.summary?.symbol_code || null,
    };
  });
  const out = { updatedAt: d.properties?.meta?.updated_at, hours, fetchedAt: new Date().toISOString() };
  metCache.set(key, out);
  return out;
}
/** Observasjonsfil → array [{date, rr, tm, ...}] (null = mangler). */
function obsRows(obs) {
  if (!obs?.dates?.length) return [];
  return obs.dates.map((date, i) => {
    const row = { date };
    for (const [k, arr] of Object.entries(obs.params || {})) row[k] = isNum(arr[i]) ? arr[i] : null;
    return row;
  });
}

/* ---------------- init + faner ---------------- */
async function init() {
  CFG = await fetchJSON(LOCAL.replace('data/', '') + 'config.json');
  const tabs = [...ROOT.querySelectorAll('.vd__tab')];
  const panels = { golfvaer: q('#vd-panel-golf'), skifore: q('#vd-panel-ski'), varsel: q('#vd-panel-acc') };
  const renderers = { golfvaer: renderGolf, skifore: renderSki, varsel: renderAccuracy };
  const rendered = {};

  function activate(name, pushHash = true) {
    if (!panels[name]) name = 'golfvaer';
    tabs.forEach(t => {
      const on = t.dataset.tab === name;
      t.classList.toggle('is-active', on);
      t.setAttribute('aria-selected', on);
      t.tabIndex = on ? 0 : -1;
    });
    for (const [n, p] of Object.entries(panels)) p.hidden = n !== name;
    if (pushHash) history.replaceState(null, '', '#' + name);
    if (!rendered[name]) {
      rendered[name] = true;
      renderers[name](panels[name]).catch(e => {
        rendered[name] = false; // neste fanebesøk prøver på nytt
        panels[name].innerHTML = errBox('Kunne ikke laste denne fanen: ' + esc(e.message) + '. Sjekk nettverket og åpne fanen igjen.');
      });
    }
  }
  tabs.forEach((t, i) => {
    t.addEventListener('click', () => activate(t.dataset.tab));
    t.addEventListener('keydown', e => {
      const dir = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : null;
      let j = null;
      if (dir != null) j = (i + dir + tabs.length) % tabs.length;
      if (e.key === 'Home') j = 0;
      if (e.key === 'End') j = tabs.length - 1;
      if (j != null) { e.preventDefault(); tabs[j].focus(); activate(tabs[j].dataset.tab); }
    });
  });
  window.addEventListener('hashchange', () => activate(location.hash.slice(1), false));
  activate(location.hash.slice(1) || 'golfvaer', false);
}

/* ================= GOLFVÆR ================= */
async function renderGolf(el) {
  const locs = CFG.locations.filter(l => l.type === 'golf');
  const loc = locs[0];
  el.innerHTML = '<p class="vd__loading">Henter observasjoner (NVE) og varsel (MET) …</p>';

  const [obs, met, latest] = await Promise.all([
    loadData(`observations/${loc.id}.json`),
    metForecast(loc).catch(() => null),
    loadData('latest.json'),
  ]);
  const rows = obsRows(obs);
  const gm = CFG.golf_model;
  const drainKey = LS.get('drainage', gm.default_drainage);
  const drainage = gm.drainage_presets[drainKey] ?? gm.drainage_presets.middels;

  if (!rows.length && !met) { el.innerHTML = emptyBox('Ingen data tilgjengelig ennå', 'Verken observasjonshistorikk eller værvarsel kunne hentes. Prøv å laste siden på nytt.'); return; }

  const days = rows.slice(-gm.history_days).map(r => ({ date: r.date, rr: r.rr, eva: r.gwb_eva, tm: r.tm }));
  const lastObsDate = rows.length ? rows[rows.length - 1].date : null;
  const obsFreshness = lastObsDate ? `observert t.o.m. ${fmtDate(lastObsDate)} kl. 06 UTC` : '';
  const wet = days.length ? golfMoisture(days, { drainage, ...gm }) : null;
  const rain = rainSummary(days.map(d => ({ ...d, rr: d.rr })), gm.significant_rain_mm);
  const sssrel = rows.length ? rows[rows.length - 1].gwb_sssrel : null;
  const gs = wet ? greenspeed(wet.catKey, rain.d1, rain.daysSinceSignificantRain) : null;

  // Live nå + utvikling fremover (varslet nedbør inn i samme modell)
  const nowH = met?.hours?.[0];
  const evaRecent = days.slice(-7).map(d => d.eva).filter(isNum);
  const evaAssumed = evaRecent.length ? evaRecent.reduce((a, b) => a + b, 0) / evaRecent.length : 1.5;
  let outlook = [];
  if (met && wet) {
    // Kun tilnærmet komplette 06–06-varselvinduer (nHours ≥ 22) — et partielt
    // første vindu ville gitt kunstig lav «varslet nedbør» i tabellen.
    const fcDaily = aggregateForecastDays(met.hours.filter(h => h.span === 1 || (h.span === 6 && [0, 6, 12, 18].includes(new Date(h.time).getUTCHours()))).map(h => ({ time: h.time, temp: h.temp, precip: h.precip, wind: h.wind, spanH: h.span })), 6).filter(d => d.covH >= 22).slice(0, 5);
    let sim = days.map(d => ({ ...d }));
    for (const fd of fcDaily) {
      if (sim.some(s => s.date === fd.date)) continue;
      sim.push({ date: fd.date, rr: fd.precip, eva: evaAssumed, tm: fd.tmean });
      outlook.push({ date: fd.date, precip: fd.precip, res: golfMoisture(sim, { drainage, ...gm }) });
    }
  }

  const wetTagBits = wet ? `${conf(wet.confidence)} <span class="vd__tag vd__tag--mod">Modellert</span>` : '';
  el.innerHTML = `
    <div class="vd__seg">
      <strong>${esc(loc.name)}</strong>
      <label>Drenering <span class="vd__tag vd__tag--ant">Antatt</span>
        <select id="vd-drain">
          ${Object.keys(gm.drainage_presets).map(k => `<option value="${k}" ${k === drainKey ? 'selected' : ''}>${{ godt_drenert: 'Godt drenert', middels: 'Middels', daarlig: 'Dårlig drenert' }[k] || k}</option>`).join('')}
        </select>
      </label>
    </div>
    <div class="vd__grid">
      <div class="vd__card vd__card--hero${wet ? ` vd__wet vd__wet--${wet.catKey}` : ''}">
        <h4>Banefuktighet ${wetTagBits}</h4>
        ${wet ? `<div class="vd__big">${esc(wet.category)}</div>
          <div class="vd__sub">Våthetsindeks ${wet.index} mm-ekv. · ${wet.dataDays} døgn historikk, ${obsFreshness} — regn ETTER det er ikke med ennå</div>`
        : emptyInline('Mangler observasjonshistorikk — samles automatisk fremover.')}
      </div>
      <div class="vd__card">
        <h4>Relativ greenspeed ${wet ? '<span class="vd__tag vd__tag--mod">Modellert</span>' : ''}</h4>
        ${gs ? `<div class="vd__big">${esc(gs.speed)}</div><div class="vd__sub">${esc(gs.why)} Kategori, ikke Stimpmeter — krever kalibrering med målinger for tall.</div>` : emptyInline('Krever fuktighetsmodellen.')}
      </div>
      <div class="vd__card">
        <h4>Nedbør <span class="vd__tag vd__tag--obs">Observert</span></h4>
        <dl>
          ${kv('Siste obs-døgn', fmtMm(rain.d1))}
          ${kv('Siste 3 døgn', fmtMm(rain.d3))}
          ${kv('Siste 7 døgn', fmtMm(rain.d7))}
          ${kv(`Døgn siden > ${gm.significant_rain_mm} mm regn`, rain.daysSinceSignificantRain ?? '—')}
        </dl>
      </div>
      <div class="vd__card">
        <h4>Akkurat nå ${met ? '<span class="vd__tag vd__tag--fc">Varslet</span>' : '<span class="vd__tag vd__tag--mangler">Mangler</span>'}</h4>
        ${nowH ? `<dl>
          ${kv('Temperatur', fmt(nowH.temp, ' °C'))}
          ${kv('Vind', fmt(nowH.wind, ' m/s'))}
          ${kv('Luftfuktighet', fmt(nowH.rh, ' %'))}
          ${kv('Nedbør neste time', fmtMm(nowH.precip))}
        </dl>` : emptyInline('Fikk ikke kontakt med api.met.no.')}
      </div>
      <div class="vd__card">
        <h4>NVE jordvannsmetning <span class="vd__tag vd__tag--mod">Modellert (NVE)</span></h4>
        ${isNum(sssrel) ? `<div class="vd__big">${sssrel} %</div><div class="vd__sub">Uavhengig kryssjekk: NVEs HBV-modell for vannmetning i jorda i denne grid-cella (${obs?.altitude ?? '?'} moh). Høy % = våt mark.</div>` : emptyInline('Ikke tilgjengelig.')}
      </div>
      <div class="vd__card vd__card--wide">
        <h4>Utvikling fremover <span class="vd__tag vd__tag--fc">Varslet</span> <span class="vd__tag vd__tag--mod">Modellert</span></h4>
        ${outlook.length ? `<div class="vd__tablewrap"><table>
          <thead><tr><th>Dag</th><th>Varslet nedbør</th><th>Modellert banefuktighet</th></tr></thead>
          <tbody>${outlook.map(o => `<tr><td title="${esc(fmtDate(o.date))} — vindu slutter kl. 06 UTC">${esc(weekdayLong(o.date))}</td><td>${fmtMm(o.precip)}</td><td class="vd__wetcell vd__wet--${esc(o.res.catKey)}"><span class="vd__dot"></span>${esc(o.res.category)} (${o.res.index} mm-ekv.)</td></tr>`).join('')}</tbody>
        </table></div><div class="vd__sub">Hver dag = døgnet som slutter kl. 06 UTC (08 norsk sommertid) — «Fredag» dekker altså torsdag dag + natt til fredag. Simuleringen starter fra siste observerte døgn (${obsFreshness}); fordampning fremover er antatt lik snittet siste 7 døgn (${round1(evaAssumed)} mm/døgn) <span class="vd__tag vd__tag--ant">Antatt</span></div>` : emptyInline('Krever både varsel og historikk.')}
      </div>
    </div>
    ${wet ? `<h3>Hva påvirket vurderingen?</h3>
    <ul class="vd__reasons">
      <li>Nedbør tilfører vann; eldre nedbør teller gradvis mindre (retensjon ${esc(String(drainage))}/døgn før fordampningsjustering) <span class="vd__tag vd__tag--mod">Modellert</span></li>
      <li>Fordampning fra NVEs HBV-modell tørker banen, dempet med faktor ${esc(String(gm.drying_factor ?? 0.8))} (grid-snittet overvurderer trolig en pleiet green; jf. FAO-56 for cool-season turf, men gwb_eva-definisjonen er uverifisert) <span class="vd__tag vd__tag--mod">Modellert (NVE)</span></li>
      <li>Drenering er en justerbar antakelse — endre den over hvis banen oppleves feil <span class="vd__tag vd__tag--ant">Antatt</span></li>
      ${wet.missing.length ? `<li><span class="vd__tag vd__tag--mangler">Mangler</span> ${wet.missing.length} datapunkter i perioden — konfidensen er justert ned.</li>` : ''}
    </ul>
    <p class="vd__caveat">Modellen kjenner ikke klipping, valsing, vanning, dugg, gressart, jordtype eller andre greenkeeper-tiltak. Kategorigrensene er antakelser inntil de er kalibrert mot registreringene dine under.</p>` : ''}
    ${rows.length ? precipBars('Nedbør siste 30 døgn (mm/døgn, NVE-grid)', rows.slice(-30).map(r => r.rr ?? 0), rows.slice(-30).map(r => r.date)) : ''}
    <hr class="vd__hr">
    <h3>Registrer baneobservasjon <span class="vd__tag vd__tag--reg">Registrert</span></h3>
    <p class="vd__sub">Lagres kun i din nettleser (localStorage). Brukes til personlig kalibrering når det finnes minst 10 registreringer — frem til da vises de bare som observasjoner.</p>
    <form class="vd__form" id="vd-golfform">
      <label>Dato/tid <input type="datetime-local" name="ts" value="${nowLocalInput()}" required></label>
      <label>Opplevd fuktighet <select name="felt">${['Tørr', 'Normal', 'Myk', 'Svært våt', 'Vannmettet'].map(o => `<option>${o}</option>`).join('')}</select></label>
      <label>Greenspeed <select name="speed">${['Sakte', 'Normal', 'Rask', 'Målt Stimp (skriv i kommentar)'].map(o => `<option>${o}</option>`).join('')}</select></label>
      <label>Forhold <select name="extra">${['—', 'Dugg', 'Overvann', 'Myke områder', 'Nyklippet', 'Nylig vannet'].map(o => `<option>${o}</option>`).join('')}</select></label>
      <textarea name="kommentar" placeholder="Kommentar (valgfritt)"></textarea>
      <div class="vd__btnrow"><button class="vd__btn vd__btn--primary" type="submit">Lagre lokalt</button></div>
    </form>
    <div id="vd-golflog"></div>
    ${meta(`Observasjoner: NVE seNorge-grid 1×1 km (${obs?.window || '06–06 UTC-døgn'}), oppdatert ${fmtTs(obs?.updated)} · Varsel: MET, modellkjøring ${fmtTs(met?.updatedAt)} · Innsamling: ${fmtTs(latest?.updated)}`)}
  `;
  q('#vd-drain').addEventListener('change', e => { LS.set('drainage', e.target.value); rerender(el, renderGolf); });
  wireLog('golfobs', '#vd-golfform', '#vd-golflog', f => `${fmtTs(f.ts)} — ${esc(f.felt)}, greenspeed ${esc(f.speed)}${f.extra && f.extra !== '—' ? ', ' + esc(f.extra) : ''}${f.kommentar ? ' — ' + esc(f.kommentar) : ''}`, 10);
}

/* ================= SKIFØRE & SMØRING ================= */
async function renderSki(el) {
  const locs = CFG.locations.filter(l => l.type === 'ski');
  const locId = LS.get('skiloc', locs[0].id);
  const loc = locs.find(l => l.id === locId) || locs[0];
  el.innerHTML = '<p class="vd__loading">Henter snødata (NVE) og varsel (MET) …</p>';

  const [obs, met] = await Promise.all([loadData(`observations/${loc.id}.json`), metForecast(loc).catch(() => null)]);
  const rows = obsRows(obs);
  const last = rows.length ? rows[rows.length - 1] : null;
  const nowH = met?.hours?.[0];
  const tempNow = nowH?.temp ?? null;

  const selector = `<div class="vd__seg"><label>Sted
      <select id="vd-skiloc">${locs.map(l => `<option value="${l.id}" ${l.id === loc.id ? 'selected' : ''}>${esc(l.name)}</option>`).join('')}</select>
    </label><span class="vd__sub">${obs?.altitude ? obs.altitude + ' moh (grid-celle)' : ''}</span></div>`;

  if (!last) {
    el.innerHTML = selector + emptyBox('Ingen snødata ennå', 'Observasjonshistorikk samles automatisk. Kom tilbake etter neste innsamling.');
    wireSkiloc(el);
    return;
  }

  // Manuell prep-logg → prep-objekt for modellen
  const preps = LS.get('preplog', []).filter(p => p.loc === loc.id).sort((a, b) => a.ts < b.ts ? 1 : -1);
  const lastPrep = preps[0] || null;
  const prep = lastPrep ? {
    hoursAgo: (Date.now() - Date.parse(lastPrep.ts)) / 3600e3,
    tempAtPrep: lastPrep.temp !== '' && lastPrep.temp != null ? Number(lastPrep.temp) : null,
    snowWetAtPrep: lastPrep.vaat === 'ja' ? true : lastPrep.vaat === 'nei' ? false : null,
  } : null;

  const obsIn = {
    sd: last.sd, lwc: last.lwc, age: last.age, fsw: last.fsw, qsw: last.qsw, rrToday: last.rr,
    tmSeries: rows.slice(-14).map(r => ({ date: r.date, tm: r.tm })),
  };
  const snow = classifySnow(obsIn, { tempNow }, prep, CFG.ski_model);
  const noSnow = snow.catKey === 'ikke-snø';
  const wax = noSnow ? null : waxAdvice(snow.catKey, tempNow);

  const tms = rows.slice(-21).filter(r => isNum(r.tm));
  const mnd = new Date().getUTCMonth() + 1; // 1–12
  const iSesong = mnd >= 11 || mnd <= 4;     // skisesong nov–apr
  const sesongNote = iSesong ? '' : `<div class="vd__empty" style="margin:.2rem 0 .8rem"><strong>Utenfor skisesong (nov–apr).</strong> Snø- og smøremodellen er dvale-relevant nå; løypekjørings- og smøreregistrering trengs først til vinteren. Snødataene under samles likevel hele året for historikk.</div>`;
  el.innerHTML = `
    ${selector}
    ${sesongNote}
    <div class="vd__grid">
      <div class="vd__card vd__card--hero">
        <h4>Forventet føre ${conf(snow.confidence)} <span class="vd__tag vd__tag--mod">Modellert</span></h4>
        <div class="vd__big">${esc(snow.category)}</div>
        ${snow.uncertain ? '<div class="vd__sub">⚠️ Stor usikkerhet — se forbeholdene under.</div>' : ''}
      </div>
      <div class="vd__card">
        <h4>Snø siste obs-døgn (t.o.m. ${fmtDate(last.date)} 06 UTC) <span class="vd__tag vd__tag--mod">Modellert (NVE)</span></h4>
        <dl>
          ${kv('Snødybde', fmt(last.sd, ' cm'))}
          ${kv('Nysnø siste døgn', fmt(last.fsw, ' mm vannekv.'))}
          ${kv('Nysnø 3 døgn', fmt(last.sdfsw3d, ' cm'))}
          ${kv('Snøens alder', isNum(last.age) ? Math.round(last.age) + ' døgn' : '—')}
          ${kv('Vann i snøen', fmt(last.lwc, ' %'))}
          ${kv('Smelting siste døgn', fmt(last.qsw, ' mm'))}
        </dl>
        <div class="vd__sub">seNorge-snømodellen (beregnet fra temp/nedbør), grid-celle ${obs?.altitude ?? '?'} moh — ikke målt i løypa. Snøfall ETTER kl. 06 UTC er ikke med ennå.</div>
      </div>
      <div class="vd__card">
        <h4>Akkurat nå ${met ? '<span class="vd__tag vd__tag--fc">Varslet</span>' : '<span class="vd__tag vd__tag--mangler">Mangler</span>'}</h4>
        ${nowH ? `<dl>
          ${kv('Temperatur', fmt(nowH.temp, ' °C'))}
          ${kv('Vind', fmt(nowH.wind, ' m/s'))}
          ${kv('Nedbør neste 6 t', fmtMm(sum6h(met)))}
        </dl>` : emptyInline('Fikk ikke kontakt med api.met.no.')}
      </div>
      ${wax ? `<div class="vd__card vd__card--wide">
        <h4>Smøreanbefaling ${conf(wax.confidence)} <span class="vd__tag vd__tag--mod">Modellert</span></h4>
        <dl>
          ${kv('Klassisk feste — primær', `${esc(wax.classic.primary)} <span class="vd__sub">(${esc(wax.classic.range)})</span>`)}
          ${kv('Reserve', esc(wax.classic.reserve))}
          ${kv('Glid', `${esc(wax.glide.cat)} <span class="vd__sub">(${esc(wax.glide.range)})</span>`)}
        </dl>
        <div class="vd__sub">${esc(wax.classic.why)} Kategorier og temperaturspenn — ikke merkeprodukter, siden smørebeholdningen din ikke er registrert.</div>
      </div>` : ''}
    </div>
    <h3>Hvorfor denne vurderingen?</h3>
    <ul class="vd__reasons">${snow.reasons.map(r => `<li>${esc(r)}</li>`).join('')}</ul>
    ${[...snow.caveats, ...(wax?.caveats || [])].map(c => `<p class="vd__caveat">${esc(c)}</p>`).join('')}
    ${tms.length >= 2 ? tempChart(`Døgntemperatur siste ${tms.length} døgn (°C, NVE-grid) — fryse/tine-mønsteret bak vurderingen`, tms.map(r => r.tm), tms.map(r => r.date)) : ''}
    <hr class="vd__hr">
    <h3>Registrer løypekjøring <span class="vd__tag vd__tag--reg">Registrert</span></h3>
    <p class="vd__sub">Ingen åpen, dokumentert datakilde for løypepreparering finnes (loyper.net er en Next.js-app uten API/robots; skisporet.no redirigerer). ${loc.loyper_url ? `Sjekk «Groomed …» manuelt på <a href="${esc(loc.loyper_url)}" target="_blank" rel="noopener noreferrer">loyper.net ↗</a> og skriv det inn her.` : 'Registrer manuelt her.'} Lagres i nettleseren. Feltet <code>loc</code> i eksporten er adapter-sømmen mot en framtidig automatisk kilde.</p>
    <form class="vd__form" id="vd-prepform">
      <label>Tidspunkt <input type="datetime-local" name="ts" value="${nowLocalInput()}" required></label>
      <label>Løype/sted <input name="beskrivelse" placeholder="f.eks. lysløypa Vågslid"></label>
      <label>Temp ved kjøring (°C) <input name="temp" type="number" step="0.5" placeholder="f.eks. -4"></label>
      <label>Våt snø da? <select name="vaat"><option value="vetikke">Vet ikke</option><option value="ja">Ja</option><option value="nei">Nei</option></select></label>
      <label>Type <select name="type"><option>Klassisk + skøyting</option><option>Kun klassisk</option><option>Kun skøyting</option><option>Scooter/tråkket</option></select></label>
      <textarea name="kommentar" placeholder="Kommentar (valgfritt)"></textarea>
      <div class="vd__btnrow"><button class="vd__btn vd__btn--primary" type="submit">Lagre lokalt</button></div>
    </form>
    <div id="vd-preplog"></div>
    <h3>Smørelogg <span class="vd__tag vd__tag--reg">Registrert</span></h3>
    <p class="vd__sub">Noter hva du faktisk smurte og hvordan det gikk — grunnlag for personlig kalibrering senere.</p>
    <form class="vd__form" id="vd-waxform">
      <label>Dato <input type="date" name="ts" value="${new Date().toISOString().slice(0, 10)}" required></label>
      <label>Føre <input name="fore" placeholder="f.eks. skare -3°C"></label>
      <label>Smøring <input name="smoring" placeholder="f.eks. universalklister"></label>
      <label>Feste <select name="feste">${['Godt', 'Middels', 'Dårlig'].map(o => `<option>${o}</option>`).join('')}</select></label>
      <label>Glid <select name="glid">${['God', 'Middels', 'Dårlig'].map(o => `<option>${o}</option>`).join('')}</select></label>
      <textarea name="kommentar" placeholder="Resultat/kommentar"></textarea>
      <div class="vd__btnrow"><button class="vd__btn vd__btn--primary" type="submit">Lagre lokalt</button></div>
    </form>
    <div id="vd-waxlog"></div>
    ${meta(`Snø/vær-observasjoner: NVE seNorge (oppdatert ${fmtTs(obs?.updated)}) · Varsel: MET (modellkjøring ${fmtTs(met?.updatedAt)}). Koordinat er ${esc(loc._koordinatkilde || 'konfigurert i config.json')}`)}
  `;
  wireSkiloc(el);
  wireLog('preplog', '#vd-prepform', '#vd-preplog', f => `${fmtTs(f.ts)} — ${esc(f.beskrivelse || loc.name)} (${esc(f.type)})${f.temp !== '' && f.temp != null ? ', ' + esc(String(f.temp)) + ' °C' : ''}, våt snø: ${esc(f.vaat)}${f.kommentar ? ' — ' + esc(f.kommentar) : ''}`, 8, { loc: loc.id }, () => rerender(el, renderSki));
  wireLog('waxlog', '#vd-waxform', '#vd-waxlog', f => `${esc(f.ts)} — ${esc(f.fore || '?')} → ${esc(f.smoring || '?')} (feste: ${esc(f.feste)}, glid: ${esc(f.glid)})${f.kommentar ? ' — ' + esc(f.kommentar) : ''}`, 8, { loc: loc.id });

  function wireSkiloc(root) {
    root.querySelector('#vd-skiloc')?.addEventListener('change', e => { LS.set('skiloc', e.target.value); rerender(el, renderSki); });
  }
  function sum6h(m) {
    const h6 = m.hours.slice(0, 6).map(h => h.span === 1 ? h.precip : null).filter(isNum);
    if (h6.length >= 4) return round1(h6.reduce((a, b) => a + b, 0));
    const b6 = m.hours.find(h => h.span === 6);
    return b6 ? b6.precip : null;
  }
}

/* ================= VARSELTREFFSIKKERHET ================= */
async function renderAccuracy(el) {
  el.innerHTML = '<p class="vd__loading">Henter treffsikkerhetsdata …</p>';
  const loc = CFG.locations.find(l => l.type === 'golf') || CFG.locations[0];
  const [acc, latest, narrative] = await Promise.all([
    loadData(`accuracy/${loc.id}.json`),
    loadData('latest.json'),
    loadData(`accuracy/${loc.id}-narrative.json`),
  ]);

  const selector = `<div class="vd__seg"><strong>${esc(loc.name)}</strong> <span class="vd__sub">— treffsikkerhet måles foreløpig kun her (fjellstasjonene har for spredt datagrunnlag)</span></div>`;

  const method = `
    <h3>Slik måles det</h3>
    <ul class="vd__reasons">
      <li>Hvert varsel (MET Locationforecast) lagres som snapshot <em>før</em> fasiten finnes — to ganger daglig.</li>
      <li>Fasit = NVE/seNorge-grid for samme punkt. Varsel og fasit sammenlignes kun på identisk 06–06 UTC-døgn (vinduet slutter kl. 06 på merkedatoen, som i seNorge), og bare når varselsnapshotet dekker tilnærmet hele vinduet (≥ 22 av 24 timer).</li>
      <li><strong>Bias</strong> = snitt av (varslet − observert): positiv betyr at varselet ligger for høyt. <strong>MAE</strong> = snittet av absolutte feil. <strong>Treffsikkerhet på nedbør</strong>: PoD = andel av faktiske nedbørsdøgn (≥ ${CFG.accuracy.precip_event_threshold_mm} mm) som ble varslet; falsk alarm-andel = andel nedbørsvarsler uten nedbør; frekvensbias &gt; 1 betyr at regn varsles oftere enn det kommer.</li>
      <li>Påstander krever data: «systematisk skjevhet» hevdes aldri under ${CFG.accuracy.evidence_levels.mulig_skjevhet} sammenlignbare par, og bare når skjevheten er større enn to standardfeil.</li>
      <li>Bias-korrigert varsel aktiveres kun hvis det slår rått varsel i en walk-forward-backtest (bruker aldri fremtidige data).</li>
    </ul>`;

  if (!acc || !acc.nPairs) {
    const nSnap = acc?.nSnapshots ?? 0;
    el.innerHTML = selector + emptyBox('📊 Samler data — for tidlig å konkludere',
      `Innsamlingen startet ${fmtDate(CFG.accuracy.collection_started)} (kilde: config). ${nSnap} varsel-snapshot${nSnap === 1 ? '' : 's'} er lagret for ${esc(loc.name)}, men ingen har fått fasit ennå — første sammenlignbare par kommer når NVE-observasjonen for varseldøgnet foreligger (neste innsamling). Meningsfull statistikk fra ~30 par (~2–3 uker), skjevhetspåstander tidligst ved ${CFG.accuracy.evidence_levels.mulig_skjevhet} par.`) + method + meta(`Siste innsamling: ${fmtTs(latest?.updated)}${latest?.errors?.length ? ' · delfeil: ' + esc(latest.errors.join('; ')) : ''}`);
    return;
  }

  const V = { temp: 'Temperatur (døgnmiddel, °C)', precip: 'Nedbør (døgnsum, mm)' };
  const rowsHtml = Object.entries(V).map(([k, label]) => {
    const v = acc.variables[k];
    if (!v) return '';
    const lev = evidenceLevel(v.all.n, v.all.bias, v.all.se, CFG.accuracy.evidence_levels);
    const leadRows = Object.entries(v.byLead).map(([lead, s]) => `
      <tr><td>${lead} døgn frem</td><td>${s.n}</td><td>${fmtSigned(s.bias)}</td><td>${s.mae ?? '—'}</td><td>${s.rmse ?? '—'}</td>
      ${k === 'precip' && s.events ? `<td>${pct(s.events.pod)}</td><td>${pct(s.events.far)}</td>` : (k === 'precip' ? '<td>—</td><td>—</td>' : '')}</tr>`).join('');
    return `
      <h3>${label} <span class="vd__level vd__level--${lev.level}">${lev.label}</span></h3>
      <div class="vd__sub">Alle ledetider samlet: n=${v.all.n}, bias ${fmtSigned(v.all.bias)} ± ${v.all.se ?? '?'} (±1 SE), MAE ${v.all.mae ?? '—'}${lev.claim ? '' : ' — for lite data til å kalle avvik systematiske'}</div>
      <div class="vd__tablewrap"><table>
        <thead><tr><th>Ledetid</th><th>n</th><th>Bias</th><th>MAE</th><th>RMSE</th>${k === 'precip' ? '<th>PoD</th><th>Falsk alarm</th>' : ''}</tr></thead>
        <tbody>${leadRows}</tbody>
      </table></div>
      ${k === 'precip' && v.events ? `<div class="vd__sub">Nedbør som hendelse (≥ ${CFG.accuracy.precip_event_threshold_mm} mm): ${v.events.hits} treff, ${v.events.misses} bom, ${v.events.falseAlarms} falske alarmer → frekvensbias ${v.events.fbias ?? '—'}${v.events.n >= 30 && v.events.fbias > 1.2 ? ' (tendens: regn varsles oftere enn det kommer)' : v.events.n >= 30 && v.events.fbias < 0.8 && v.events.fbias != null ? ' (tendens: regn varsles sjeldnere enn det kommer)' : v.events.n < 30 ? ' (for få hendelser til å tolke)' : ''}</div>` : ''}
      ${k === 'precip' && v.calibration ? calibrationTable(v.calibration, v.calibrationShortLead) : ''}
      ${isNum(v.nearZero?.n) && v.nearZero.n > 0 ? `<div class="vd__sub">Rundt frysepunktet (observert døgnmiddel ±2 °C): n=${v.nearZero.n}, bias ${fmtSigned(v.nearZero.bias)}, MAE ${v.nearZero.mae} ${v.nearZero.n < 30 ? '— for lite til konklusjon' : ''}</div>` : ''}
      <div class="vd__sub">Bias-korrigering: ${v.backtest.enabled ? `<strong>PÅ</strong> — slo rått varsel i backtest (MAE ${v.backtest.maeCorr} mot ${v.backtest.maeRaw}, ${v.backtest.nHoldout} par holdout)` : `AV — ${esc(v.backtest.reason)}`}</div>`;
  }).join('<hr class="vd__hr">');

  el.innerHTML = `${selector}
    <div class="vd__grid">
      <div class="vd__card vd__card--hero"><h4>Datagrunnlag</h4>
        <div class="vd__big">${acc.nPairs} par</div>
        <div class="vd__sub">${acc.nSnapshots} varsel-snapshots siden ${fmtDate(acc.collectionStarted)} · varsel [Varslet] møter fasit [Observert] på samme 06–06-døgn</div></div>
      ${narrative && narrative.text ? `<div class="vd__card vd__card--wide">
        <h4>Ukentlig oppsummering <span class="vd__tag vd__tag--mod">LLM-tolkning</span></h4>
        <div class="vd__sub" style="white-space:pre-wrap">${esc(narrative.text)}</div>
        <div class="vd__meta">Generert ${fmtTs(narrative.updated)} av ${esc(narrative.model || '?')} · basert på ${narrative.basedOnNPairs ?? '?'} par.${isNum(narrative.basedOnNPairs) && acc.nPairs > narrative.basedOnNPairs * 1.25 ? ` ⚠️ Tallene under er oppdatert siden (nå ${acc.nPairs} par) — tolkningen kan være utdatert.` : ''} Dette er en språklig tolkning av tallene under — ikke en ny måling.</div>
      </div>` : ''}
    </div>
    ${rowsHtml}
    ${method}
    ${meta(`Beregnet ${fmtTs(acc.updated)} av innsamlingsjobben · Siste innsamling: ${fmtTs(latest?.updated)}`)}`;
}

/* ---------------- registreringslogg (localStorage) ---------------- */
function wireLog(key, formSel, logSel, fmtRow, calibN, extra = {}, onSave) {
  const form = q(formSel), logEl = q(logSel);
  if (!form || !logEl) return;
  const draw = () => {
    const all = LS.get(key, []);
    const items = extra.loc ? all.filter(x => x.loc === extra.loc) : all;
    logEl.innerHTML = items.length ? `
      <ul class="vd__log">${items.slice(-8).reverse().map(f => `<li>${fmtRow(f)}</li>`).join('')}</ul>
      <div class="vd__sub">${items.length} registrering${items.length === 1 ? '' : 'er'} lagret lokalt${items.length < calibN ? ` — brukes kun som notater til du har ${calibN} (da starter personlig kalibrering)` : ' — nok til å begynne kalibrering (kommer i senere versjon)'}.</div>
      <div class="vd__btnrow">
        <button type="button" class="vd__btn" data-act="export">Eksporter JSON</button>
        <button type="button" class="vd__btn" data-act="clear">Slett alle</button>
      </div>` : '<p class="vd__sub">Ingen registreringer ennå.</p>';
    logEl.querySelector('[data-act="export"]')?.addEventListener('click', () => {
      const blob = new Blob([JSON.stringify({ exported: new Date().toISOString(), key, items: LS.get(key, []) }, null, 1)], { type: 'application/json' });
      const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `vaerdata-${key}.json` });
      a.click(); URL.revokeObjectURL(a.href);
    });
    logEl.querySelector('[data-act="clear"]')?.addEventListener('click', () => {
      if (confirm('Slette alle lokale registreringer i denne loggen?')) { LS.set(key, []); draw(); }
    });
  };
  form.addEventListener('submit', e => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(form).entries());
    LS.set(key, [...LS.get(key, []), { ...f, ...extra, saved: new Date().toISOString() }]);
    form.querySelector('textarea')?.blur();
    draw();
    if (onSave) onSave();
  });
  draw();
}

/* ---------------- småting ---------------- */
function q(sel) { return ROOT.querySelector(sel); }
function rerender(el, fn) { fn(el).catch(e => { el.innerHTML = errBox('Feil ved oppdatering: ' + esc(e.message)); }); }
function esc(s) { return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function kv(k, v) { return `<div class="vd__kv"><dt>${k}</dt><dd>${v ?? '—'}</dd></div>`; }
function fmt(x, unit = '') { return isNum(x) ? round1(x) + unit : '—'; }
function fmtMm(x) { return isNum(x) ? round1(x) + ' mm' : '—'; }
function fmtSigned(x) { return isNum(x) ? (x > 0 ? '+' : '') + x : '—'; }
function pct(x) { return isNum(x) ? Math.round(x * 100) + ' %' : '—'; }
function fmtDate(d) { if (!d) return '—'; const p = String(d).slice(0, 10).split('-'); return p.length === 3 ? `${p[2]}.${p[1]}.${p[0]}` : d; }
function fmtTs(ts) { if (!ts) return '—'; try { return new Date(ts).toLocaleString('nb-NO', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); } catch { return ts; } }
function nowLocalInput() { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); }
function conf(c) { return c ? `<span class="vd__conf vd__conf--${c === 'høy' ? 'hoy' : c}">${c} konfidens</span>` : ''; }
function meta(s) { return `<p class="vd__meta">${s}</p>`; }
function errBox(s) { return `<div class="vd__error">⚠️ ${s}</div>`; }
function emptyBox(title, body) { return `<div class="vd__empty"><strong>${esc(title)}</strong><br>${esc(body)}</div>`; }
function emptyInline(s) { return `<div class="vd__sub">${esc(s)}</div>`; }
function calibrationTable(cal, calShort) {
  const rows = cal.filter(b => b.n > 0);
  if (!rows.length) return '';
  const short = new Map((calShort || []).map(b => [b.label, b]));
  return `<div class="vd__sub" style="margin-top:.55rem">Kalibrering — «når varselet sier X mm, hva skjer faktisk?»</div>
    <div class="vd__tablewrap"><table>
      <thead><tr><th>Varslet</th><th>n</th><th>Sanns. for regn (≥ 1 mm)</th><th>Snitt faktisk</th><th>Herav lead 0–1 d</th></tr></thead>
      <tbody>${rows.map(b => { const s = short.get(b.label); return `<tr><td>${esc(b.label)} mm</td><td>${b.n}</td><td>${b.n >= 10 ? pct(b.pRain) : '<span style="opacity:.55">' + pct(b.pRain) + ' *</span>'}</td><td>${fmtMm(b.meanObs)}</td><td>${s && s.n ? pct(s.pRain) + ' (n=' + s.n + ')' : '—'}</td></tr>`; }).join('')}</tbody>
    </table></div>
    <div class="vd__sub">* under 10 par i intervallet — tallet er retningsgivende, ikke en påstand. Eksempel på tolkning: står det «1–3 mm» og kolonnen viser 60 %, regnet det faktisk 6 av 10 slike ganger.</div>`;
}

/* ---- diagram-hjelpere (uniform skalering → tekst forvrenges ikke) ---- */
function weekdayShort(d) { try { return new Date(String(d).slice(0, 10) + 'T12:00:00Z').toLocaleDateString('nb-NO', { weekday: 'short', timeZone: 'UTC' }).replace('.', ''); } catch { return ''; } }
function weekdayLong(d) { try { const s = new Date(String(d).slice(0, 10) + 'T12:00:00Z').toLocaleDateString('nb-NO', { weekday: 'long', timeZone: 'UTC' }); return s.charAt(0).toUpperCase() + s.slice(1); } catch { return String(d); } }
function niceStep(raw) { const p = Math.pow(10, Math.floor(Math.log10(raw || 1))); const f = (raw || 1) / p; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p; }
function daysBetween(a, b) { return Math.round((Date.parse(String(b).slice(0, 10)) - Date.parse(String(a).slice(0, 10))) / 86400e3); }

/** Nedbørs-histogram med ukedager (rotert) på x-aksen + y-gridlinjer. */
function precipBars(title, vals, dates) {
  const W = 720, H = 210, ml = 34, mr = 8, mt = 12, mb = 56;
  const iw = W - ml - mr, ih = H - mt - mb;
  const rawMax = Math.max(...vals, 1);
  const step = niceStep(rawMax / 3);
  const max = Math.ceil(rawMax / step) * step;
  const n = vals.length, bw = iw / n;
  const y = v => mt + ih - (v / max) * ih;
  const grid = [];
  for (let t = 0; t <= max + 1e-9; t += step) grid.push(t);
  const gridSvg = grid.map(t => `<line class="vd__gl" x1="${ml}" x2="${W - mr}" y1="${y(t).toFixed(1)}" y2="${y(t).toFixed(1)}"/><text class="vd__axtext" x="${ml - 4}" y="${(y(t) + 3.5).toFixed(1)}" text-anchor="end">${round1(t)}</text>`).join('');
  const bars = vals.map((v, i) => {
    const bx = ml + i * bw, top = y(v), hgt = mt + ih - top;
    return `<rect x="${(bx + bw * 0.12).toFixed(1)}" width="${(bw * 0.76).toFixed(1)}" y="${top.toFixed(1)}" height="${Math.max(0, hgt).toFixed(1)}" rx="1"><title>${esc(weekdayLong(dates?.[i]))} ${esc(fmtDate(dates?.[i]))}: ${round1(v)} mm</title></rect>`;
  }).join('');
  // Ukedag under hver stolpe, rotert -60°
  const labels = vals.map((v, i) => {
    const lx = ml + i * bw + bw / 2, ly = mt + ih + 10;
    return `<text class="vd__axtext" x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" text-anchor="end" transform="rotate(-60 ${lx.toFixed(1)} ${ly.toFixed(1)})">${esc(weekdayShort(dates?.[i]))}</text>`;
  }).join('');
  return `<div class="vd__card vd__card--wide"><h4>${esc(title)} <span class="vd__tag vd__tag--obs">Observert</span></h4>
    <svg class="vd__chart vd__bars" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(title)}">${gridSvg}${bars}${labels}<text class="vd__axtext" x="${ml - 4}" y="${mt + 2}" text-anchor="end">mm</text></svg>
    <div class="vd__sub">Høyeste døgn: ${round1(rawMax)} mm. Hold over en stolpe for dato.</div></div>`;
}

/** Temperaturlinje: rød over 0 °C, blå under; gridlinjer; x-akse hver 3. dag. */
function tempChart(title, vals, dates) {
  const W = 720, H = 220, ml = 40, mr = 10, mt = 12, mb = 40;
  const iw = W - ml - mr, ih = H - mt - mb;
  const n = vals.length;
  let lo = Math.min(...vals, 0), hi = Math.max(...vals, 0);
  if (lo === hi) { lo -= 1; hi += 1; }
  const pad = (hi - lo) * 0.12 || 1; lo -= pad; hi += pad;
  const X = i => ml + (n <= 1 ? iw / 2 : (i / (n - 1)) * iw);
  const Y = v => mt + ih - ((v - lo) / (hi - lo)) * ih;
  // horisontale gridlinjer
  const step = niceStep((hi - lo) / 5);
  const gl = [];
  for (let t = Math.ceil(lo / step) * step; t <= hi; t += step) gl.push(round1(t));
  const gridSvg = gl.map(t => `<line class="${Math.abs(t) < 1e-9 ? 'vd__zeroline' : 'vd__gl'}" x1="${ml}" x2="${W - mr}" y1="${Y(t).toFixed(1)}" y2="${Y(t).toFixed(1)}"/><text class="vd__axtext" x="${ml - 5}" y="${(Y(t) + 3.5).toFixed(1)}" text-anchor="end">${t}</text>`).join('');
  // fargede linjesegmenter (splitt ved 0-kryssing)
  const segs = [];
  for (let i = 0; i < n - 1; i++) {
    const a = vals[i], b = vals[i + 1], ax = X(i), bx = X(i + 1);
    if ((a >= 0) === (b >= 0)) { segs.push([ax, Y(a), bx, Y(b), a >= 0]); }
    else { const t = (0 - a) / (b - a), zx = ax + (bx - ax) * t; segs.push([ax, Y(a), zx, Y(0), a >= 0]); segs.push([zx, Y(0), bx, Y(b), b >= 0]); }
  }
  const line = segs.map(s => `<line x1="${s[0].toFixed(1)}" y1="${s[1].toFixed(1)}" x2="${s[2].toFixed(1)}" y2="${s[3].toFixed(1)}" stroke="${s[4] ? '#d23b3b' : '#2f77d0'}" stroke-width="2.2" stroke-linecap="round"/>`).join('');
  const dots = vals.map((v, i) => `<circle cx="${X(i).toFixed(1)}" cy="${Y(v).toFixed(1)}" r="2.4" fill="${v >= 0 ? '#d23b3b' : '#2f77d0'}"><title>${esc(weekdayLong(dates?.[i]))} ${esc(fmtDate(dates?.[i]))}: ${round1(v)} °C</title></circle>`).join('');
  // x-akse: tick hver 3. dag talt bakover fra siste (faktisk datodiff, robust mot hull)
  const lastD = dates?.[n - 1];
  const xt = [];
  for (let i = 0; i < n; i++) {
    const ago = lastD ? daysBetween(dates[i], lastD) : (n - 1 - i);
    if (ago % 3 === 0) xt.push(`<line class="vd__gl" x1="${X(i).toFixed(1)}" x2="${X(i).toFixed(1)}" y1="${mt}" y2="${mt + ih}"/><text class="vd__axtext" x="${X(i).toFixed(1)}" y="${mt + ih + 14}" text-anchor="middle">${ago === 0 ? 'i dag' : '−' + ago + 'd'}</text>`);
  }
  return `<div class="vd__card vd__card--wide"><h4>${esc(title)}</h4>
    <svg class="vd__chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(title)}">${gridSvg}${xt.join('')}${line}${dots}<text class="vd__axtext" x="${ml - 5}" y="${mt + 2}" text-anchor="end">°C</text></svg>
    <div class="vd__sub"><span style="color:#d23b3b">■</span> pluss&shy;grader &nbsp; <span style="color:#2f77d0">■</span> minus&shy;grader &nbsp;·&nbsp; x-aksen: døgn tilbake i tid. Hold over et punkt for dato.</div></div>`;
}

if (ROOT) init().catch(e => { ROOT.innerHTML = errBox('Klarte ikke å starte Værdata: ' + esc(e.message)); });
