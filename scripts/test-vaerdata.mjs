/**
 * Tester for Værdata-modellene. Kjør: node --test scripts/test-vaerdata.mjs
 * ALLE data her er SYNTETISKE TESTFIXTURES — de beskriver ikke ekte forhold.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { utm33, golfMoisture, rainSummary, greenspeed, calibratedGreenspeed, classifySnow, waxAdvice, accuracyStats, precipEvents, evidenceLevel, shrunkBias, walkForwardBacktest, aggregateForecastDays } from '../static/vaerdata/models.mjs';

/* ---------- FIXTURES (syntetiske) ---------- */
const day = (date, rr, eva = 1.5, tm = 12) => ({ date, rr, eva, tm });
const WET_WEEK = ['2026-01-01', '2026-01-02', '2026-01-03', '2026-01-04', '2026-01-05', '2026-01-06', '2026-01-07'].map(d => day(d, 18, 0.5, 8));
const DRY_MONTH = Array.from({ length: 30 }, (_, i) => day(`2026-06-${String(i + 1).padStart(2, '0')}`, 0, 3.0, 22));

test('UTM33-konvertering matcher referanseverdier (Snyder/USGS; celle validert mot GTS-API 2026-07-22)', () => {
  const oslo = utm33(59.9139, 10.7522);
  assert.ok(Math.abs(oslo.x - 262560) < 5 && Math.abs(oslo.y - 6649444) < 5, `Oslo: ${oslo.x},${oslo.y}`);
  const vagslid = utm33(59.76, 7.65);
  assert.ok(Math.abs(vagslid.x - 87628) < 5 && Math.abs(vagslid.y - 6647582) < 5);
});

test('golfmodell: en uke med mye regn gir svært våt/vannmettet bane', () => {
  const r = golfMoisture(WET_WEEK, { drainage: 0.88 });
  assert.ok(['svaert_vaat', 'vannmettet'].includes(r.catKey), `fikk ${r.catKey} (indeks ${r.index})`);
});

test('golfmodell: 30 dagers tørke gir tørr bane', () => {
  const r = golfMoisture(DRY_MONTH, { drainage: 0.88 });
  assert.equal(r.catKey, 'torr');
  assert.ok(r.index < 8);
});

test('golfmodell: dårligere drenering gir våtere resultat på samme vær', () => {
  const mixed = [...DRY_MONTH.slice(0, 20), day('2026-06-21', 25, 1.5, 15), ...DRY_MONTH.slice(21, 26)];
  const god = golfMoisture(mixed, { drainage: 0.80 });
  const daarlig = golfMoisture(mixed, { drainage: 0.94 });
  assert.ok(daarlig.index > god.index);
});

test('golfmodell: eldre nedbør teller gradvis mindre (avtakende indeks etter regn)', () => {
  const days = [day('2026-06-01', 30, 2), ...Array.from({ length: 10 }, (_, i) => day(`2026-06-${String(i + 2).padStart(2, '0')}`, 0, 2, 18))];
  const r = golfMoisture(days, { drainage: 0.88 });
  const idx = r.series.map(s => s.index);
  for (let i = 1; i < idx.length; i++) assert.ok(idx[i] <= idx[i - 1], 'indeksen skal aldri øke på tørre dager');
  assert.ok(idx[idx.length - 1] < idx[0] * 0.5, 'indeksen skal ha falt klart etter 10 tørre dager');
});

test('rainSummary: summer og dager siden betydelig regn', () => {
  const days = [day('2026-06-01', 12), day('2026-06-02', 0), day('2026-06-03', 0.4)];
  const s = rainSummary(days, 5);
  assert.equal(s.d1, 0.4);
  assert.equal(s.d3, 12.4);
  assert.equal(s.daysSinceSignificantRain, 2);
});

test('calibratedGreenspeed uten målinger gir INGEN tall (kategorien må brukes)', () => {
  const r = calibratedGreenspeed([], 40, {});
  assert.equal(r.verdi, null);
  assert.equal(r.mode, 'ingen');
  // Manglende indeks skal heller ikke gi et tall
  assert.equal(calibratedGreenspeed([{ index: 40, verdi: 7 }], null, {}).verdi, null);
});

test('calibratedGreenspeed med 1 måling treffer målingen eksakt, men merkes «forankret»', () => {
  const cfg = { assumed_slope_per_mm: 0.06, min_points_for_fit: 3, min_index_spread_mm: 15, clamp_skala: [1, 10] };
  const pts = [{ index: 42.7, verdi: 7.0 }];
  assert.equal(calibratedGreenspeed(pts, 42.7, cfg).verdi, 7);
  const r = calibratedGreenspeed(pts, 49, cfg);
  assert.equal(r.mode, 'forankret');
  assert.equal(r.helningKilde, 'ANTATT — ikke målt');
  assert.equal(r.rmse, null, 'én måling kan ikke gi en ekte treffsikkerhet');
  assert.equal(r.trengerFlere, 2);
  assert.ok(r.verdi < 7, 'våtere bane skal gi lavere tall på skalaen');
});

test('calibratedGreenspeed tilpasser helningen når nok målinger med nok spredning finnes', () => {
  const cfg = { assumed_slope_per_mm: 0.06, min_points_for_fit: 3, min_index_spread_mm: 15, clamp_skala: [1, 10] };
  // Syntetisk: eksakt verdi = 10 − 0.05·indeks
  const pts = [10, 30, 50, 70].map(index => ({ index, verdi: 10 - 0.05 * index }));
  const r = calibratedGreenspeed(pts, 40, cfg);
  assert.equal(r.mode, 'tilpasset');
  assert.ok(Math.abs(r.helning - 0.05) < 1e-6, `helning ${r.helning}`);
  assert.ok(Math.abs(r.verdi - 8) < 0.05, `verdi ${r.verdi}`);
  assert.equal(r.rmse, 0, 'perfekt lineære punkter gir null residual');
});

test('calibratedGreenspeed faller tilbake til antatt helning når målingene har for lik fuktighet', () => {
  const cfg = { assumed_slope_per_mm: 0.06, min_points_for_fit: 3, min_index_spread_mm: 15, clamp_skala: [1, 10] };
  const pts = [{ index: 40, verdi: 7 }, { index: 42, verdi: 7.1 }, { index: 41, verdi: 6.9 }];
  const r = calibratedGreenspeed(pts, 40, cfg);
  assert.equal(r.mode, 'forankret', 'spredning 2 mm < kravet 15 mm');
  assert.equal(r.helning, 0.06);
});

test('calibratedGreenspeed klippes til skalaens endepunkter (1–10)', () => {
  const cfg = { assumed_slope_per_mm: 0.06, min_points_for_fit: 3, min_index_spread_mm: 15, clamp_skala: [1, 10] };
  const r = calibratedGreenspeed([{ index: 42.7, verdi: 7.0 }], 300, cfg);
  assert.equal(r.verdi, 1, 'ekstrem fuktighet skal klippes til skalaens bunn, ikke gå under 1');
  assert.equal(r.klippet, true);
  // ...og motsatt vei: knusktørt skal ikke kunne gi mer enn 10
  const tort = calibratedGreenspeed([{ index: 42.7, verdi: 7.0 }], -200, cfg);
  assert.equal(tort.verdi, 10);
  assert.equal(tort.klippet, true);
});

test('greenspeed er kategori, ikke tall — våt bane gir Sakte, tørket bane Rask', () => {
  assert.equal(greenspeed('svaert_vaat', 0, 0).speed, 'Sakte');
  assert.equal(greenspeed('torr', 0, 5).speed, 'Rask');
  assert.equal(greenspeed('normal', 0, 1).speed, 'Normal');
});

test('skiføre: våt snø etterfulgt av frost gir skare/hardt-signal', () => {
  const r = classifySnow(
    { sd: 60, lwc: 3, age: 5, fsw: 0, tmSeries: [{ date: 'd1', tm: 2.5 }, { date: 'd2', tm: 1.8 }], qsw: 0, rrToday: 0 },
    { tempNow: -6 }, null, {}
  );
  assert.equal(r.catKey, 'skare', `fikk ${r.catKey}: ${r.reasons.join(' | ')}`);
});

test('skiføre: løypekjøring på våt snø + påfølgende frost gir isete løype', () => {
  const r = classifySnow(
    { sd: 60, lwc: 1, age: 4, fsw: 0, tmSeries: [{ date: 'd1', tm: 2 }], qsw: 0, rrToday: 0 },
    { tempNow: -5 },
    { hoursAgo: 12, tempAtPrep: 1.5, snowWetAtPrep: true }, {}
  );
  assert.equal(r.catKey, 'is');
});

test('skiføre: kald nysnø gir tørr nysnø; nær null øker usikkerheten', () => {
  const cold = classifySnow({ sd: 40, lwc: 0, age: 1, fsw: 8, tmSeries: [{ date: 'd', tm: -7 }], qsw: 0, rrToday: 0 }, { tempNow: -8 }, null, {});
  assert.equal(cold.catKey, 'torr-nysno');
  assert.equal(cold.uncertain, false);
  const zero = classifySnow({ sd: 40, lwc: 0, age: 1, fsw: 8, tmSeries: [{ date: 'd', tm: 0.5 }], qsw: 0, rrToday: 0 }, { tempNow: 0.3 }, null, {});
  assert.equal(zero.uncertain, true, 'nær frysepunktet skal flagges usikkert');
});

test('skiføre: under 5 cm modellert snø gir «ikke skiføre», ikke en føretype', () => {
  const r = classifySnow({ sd: 1.2, lwc: 0, age: 0, fsw: 0, tmSeries: [], qsw: 0, rrToday: 0 }, { tempNow: 10 }, null, {});
  assert.equal(r.catKey, 'ikke-snø');
});

test('smøreguide: kategorier og temperaturspenn, aldri merkevarer; is anbefaler skins som reserve', () => {
  const w = waxAdvice('is', -3);
  assert.match(w.classic.reserve, /[Ss]kins/);
  assert.ok(w.classic.range.includes('°C') || w.classic.range === '—');
  const nearZero = waxAdvice('fuktig', 0.2);
  assert.equal(nearZero.confidence, 'lav');
});

test('accuracyStats: kjent bias og MAE regnes riktig', () => {
  const pairs = [1, 2, 3, 4].map((v, i) => ({ date: `2026-01-0${i + 1}`, lead: 1, fc: v + 2, obs: v }));
  const s = accuracyStats(pairs);
  assert.equal(s.n, 4);
  assert.equal(s.bias, 2);
  assert.equal(s.mae, 2);
});

test('precipEvents: PoD/FAR/frekvensbias', () => {
  // 2 treff, 1 bom, 1 falsk alarm, 1 korrekt tørt (syntetisk)
  const mk = (fc, obs, i) => ({ date: `2026-01-0${i}`, lead: 1, fc, obs });
  const e = precipEvents([mk(5, 4, 1), mk(2, 1.5, 2), mk(0, 3, 3), mk(4, 0, 4), mk(0, 0, 5)], 1);
  assert.equal(e.hits, 2); assert.equal(e.misses, 1); assert.equal(e.falseAlarms, 1);
  assert.equal(e.pod, 0.67); assert.equal(e.far, 0.33); assert.equal(e.fbias, 1);
});

test('evidensnivå: lite utvalg BLOKKERER påstand om systematisk skjevhet', () => {
  assert.equal(evidenceLevel(10, 5, 0.1).claim, false);
  assert.equal(evidenceLevel(10, 5, 0.1).level, 'for-lite-data');
  assert.equal(evidenceLevel(60, 5, 0.1).claim, false, '30–99 er bare tidlig tendens');
  assert.equal(evidenceLevel(150, 5, 0.1).level, 'mulig-skjevhet');
  assert.equal(evidenceLevel(400, 5, 0.1).level, 'dokumentert');
  assert.equal(evidenceLevel(400, 0.05, 0.1).claim, false, 'ikke-signifikant bias er ingen skjevhet');
});

test('shrunkBias krymper mot null ved små utvalg', () => {
  assert.ok(Math.abs(shrunkBias(2, 5, 50)) < 0.2);
  assert.ok(shrunkBias(2, 5000, 50) > 1.9);
});

test('backtest er walk-forward: bias som KUN finnes i fremtiden (holdout) utnyttes ikke', () => {
  // Fortid (70 %): ingen bias. Holdout (30 %): stor bias. Med datalekkasje ville
  // korrigeringen «visst om» holdout-biasen og forbedret MAE der. Uten lekkasje
  // skal korrigert ≈ rå (ingen aktivering av korrigering).
  const pairs = [];
  for (let i = 0; i < 70; i++) pairs.push({ date: dstr(i), lead: 1, fc: 10, obs: 10 });
  for (let i = 70; i < 100; i++) pairs.push({ date: dstr(i), lead: 1, fc: 15, obs: 10 });
  const bt = walkForwardBacktest(pairs, 50, 0.3);
  assert.ok(Math.abs(bt.maeCorr - bt.maeRaw) < 0.7, `corr ${bt.maeCorr} skal ligge nær raw ${bt.maeRaw} — stor forbedring ville avslørt lekkasje`);
  function dstr(i) { const d = new Date(Date.UTC(2026, 0, 1) + i * 86400e3); return d.toISOString().slice(0, 10); }
});

test('backtest aktiverer korrigering ved stabil historisk bias — og bare da', () => {
  const stable = [];
  for (let i = 0; i < 100; i++) stable.push({ date: dstr(i), lead: 1, fc: 12, obs: 10 });
  assert.equal(walkForwardBacktest(stable, 50, 0.3).enabled, true);
  const unbiased = [];
  for (let i = 0; i < 100; i++) unbiased.push({ date: dstr(i), lead: 1, fc: 10 + (i % 2 ? 1 : -1), obs: 10 });
  assert.equal(walkForwardBacktest(unbiased, 50, 0.3).enabled, false);
  assert.equal(walkForwardBacktest(stable.slice(0, 10), 50, 0.3).enabled, false, 'for lite data → av');
  function dstr(i) { const d = new Date(Date.UTC(2026, 0, 1) + i * 86400e3); return d.toISOString().slice(0, 10); }
});

test('06–06 UTC-døgnaggregat merkes med SLUTTDATO (GTS-semantikk, empirisk verifisert)', () => {
  const hours = [];
  for (let h = 0; h < 60; h++) {
    const t = new Date(Date.UTC(2026, 0, 1, h)).toISOString();
    hours.push({ time: t, temp: 5, precip: 1, wind: 3 });
  }
  const d = aggregateForecastDays(hours, 5);
  // Vinduet 1. jan 06Z → 2. jan 06Z SLUTTER 2. jan og skal merkes 2026-01-02
  const full = d.find(x => x.date === '2026-01-02');
  assert.ok(full, 'fant ikke vinduet som slutter 2. jan 06Z');
  assert.equal(full.precip, 24);
  assert.equal(full.covH, 24);
  // Kl. 21:00 1. jan ligger i vinduet som slutter 2. jan — aldri i 1. jan-vinduet
  const jan1 = d.find(x => x.date === '2026-01-01');
  assert.ok(!jan1 || jan1.covH === 6, '1. jan-vinduet skal bare ha timene 00–05Z (partielt)');
});

test('partielle vinduer bærer covH (dekket tid) så matching kan avvise dem', () => {
  // Kveldssnapshot: timer fra 18Z — vinduet som slutter neste dag har bare 12 t dekning
  const hours = [];
  for (let h = 18; h < 30; h++) hours.push({ time: new Date(Date.UTC(2026, 0, 1, h)).toISOString(), temp: 5, precip: 1, wind: 3, spanH: 1 });
  const d = aggregateForecastDays(hours, 5);
  const w = d.find(x => x.date === '2026-01-02');
  assert.ok(w && w.covH === 12 && w.covH < 22, 'partielt vindu må være identifiserbart via covH');
});

test('6-timersblokker gir full covH — lav punkttetthet skal IKKE avvises som partiell', () => {
  // MET compact bruker 6 t-oppløsning langt frem: 4 blokker (06/12/18/00) dekker hele vinduet
  const hours = [];
  for (const hh of [6, 12, 18, 24]) hours.push({ time: new Date(Date.UTC(2026, 0, 1, hh)).toISOString(), temp: -3, precip: 2, wind: 4, spanH: 6 });
  const d = aggregateForecastDays(hours, 5);
  const w = d.find(x => x.date === '2026-01-02');
  assert.ok(w, 'fant ikke vinduet');
  assert.equal(w.covH, 24, '4 × 6 t-blokker = 24 t dekning');
  assert.equal(w.precip, 8);
});
