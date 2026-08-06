/**
 * Værdata — delte modellfunksjoner (ren ESM, ingen avhengigheter).
 * Brukes av både nettleser-appen (app.js), innsamleren (scripts/fetch-vaerdata.mjs)
 * og testene (scripts/test-vaerdata.mjs).
 *
 * Alle modeller her er BEREGNINGER, ikke målinger. Se static/vaerdata/README.md
 * for datakilder, antakelser og begrensninger.
 */

/* ============================================================
 * Koordinater: WGS84 → UTM sone 33N (EPSG:32633)
 * Snyder-formler (USGS «Map Projections: A Working Manual», 1987).
 * NVE GridTimeSeries krever UTM33-koordinater.
 * ============================================================ */
export function utm33(lat, lon) {
  const a = 6378137.0, f = 1 / 298.257223563;
  const e2 = f * (2 - f), ep2 = e2 / (1 - e2), k0 = 0.9996;
  const lon0 = (15.0 * Math.PI) / 180;
  const la = (lat * Math.PI) / 180, lo = (lon * Math.PI) / 180;
  const sin = Math.sin(la), cos = Math.cos(la), tan = Math.tan(la);
  const N = a / Math.sqrt(1 - e2 * sin * sin);
  const T = tan * tan, C = ep2 * cos * cos;
  const A = cos * (lo - lon0);
  const M = a * (
    (1 - e2 / 4 - (3 * e2 * e2) / 64 - (5 * e2 ** 3) / 256) * la
    - ((3 * e2) / 8 + (3 * e2 * e2) / 32 + (45 * e2 ** 3) / 1024) * Math.sin(2 * la)
    + ((15 * e2 * e2) / 256 + (45 * e2 ** 3) / 1024) * Math.sin(4 * la)
    - ((35 * e2 ** 3) / 3072) * Math.sin(6 * la)
  );
  const x = k0 * N * (A + ((1 - T + C) * A ** 3) / 6 + ((5 - 18 * T + T * T + 72 * C - 58 * ep2) * A ** 5) / 120) + 500000;
  const y = k0 * (M + N * tan * ((A * A) / 2 + ((5 - T + 9 * C + 4 * C * C) * A ** 4) / 24 + ((61 - 58 * T + T * T + 600 * C - 330 * ep2) * A ** 6) / 720));
  return { x: Math.round(x), y: Math.round(y) };
}

/* ============================================================
 * GOLF: vannbalanse-/våthetsmodell (API-type, forklarbar)
 *
 * Idé: en «våthetsindeks» i mm-ekvivalenter. Hvert døgn:
 *   W = W * retensjon − fordampning_effekt + nedbør
 * der retensjonen (hvor mye vann som blir liggende til neste dag)
 * styres av drenering (justerbar antakelse) og reduseres av høy
 * fordampning (varme/vind/tørr luft, via NVE gwb_eva).
 * Eldre nedbør teller dermed gradvis mindre. Alt er en MODELL —
 * klipping, valsing, vanning, gressart og jordtype inngår ikke.
 * ============================================================ */
export function golfMoisture(days, cfg) {
  // days: kronologisk [{date, rr, eva, tm, sssrel?}] — rr/eva i mm (NVE GTS).
  const p = cfg || {};
  const retBase = clamp(p.drainage ?? 0.88, 0.5, 0.99);
  const evaSens = p.eva_sensitivity ?? 0.025;
  const retMin = p.retention_min ?? 0.55, retMax = p.retention_max ?? 0.97;
  // Tørkedempningsfaktor: NVEs grid-fordampning (gwb_eva) kan overvurdere vanntapet
  // fra en pleiet green, så vi demper den. ~0,8 samsvarer med at cool-season turf
  // bruker ~0,8–0,9 av referanse-ET0 (FAO-56) — MEN gwb_eva sin ET-definisjon er
  // uverifisert, så dette er en justerbar antakelse, ikke en streng FAO-56 Kc.
  const dryF = clamp(p.drying_factor ?? 0.8, 0.3, 1.2);
  const th = p.category_thresholds_mm || { torr: 8, normal: 22, myk: 45, svaert_vaat: 80 };

  let W = 0;
  const series = [];
  const missing = [];
  for (const d of days) {
    const rr = isNum(d.rr) ? d.rr : 0;
    const eva = isNum(d.eva) ? d.eva : 1.0; // mangler fordampning → antatt 1 mm/d
    if (!isNum(d.rr)) missing.push(d.date + ':rr');
    if (!isNum(d.eva)) missing.push(d.date + ':eva');
    const evaEff = eva * dryF; // dempet fordampning (grid overvurderer pleiet green)
    const ret = clamp(retBase - evaSens * evaEff, retMin, retMax);
    W = Math.max(0, W * ret - evaEff * 0.5) + rr;
    series.push({ date: d.date, index: round1(W), rr: round1(rr), eva: round1(eva) });
  }
  const idx = W;
  let category, catKey;
  if (idx < th.torr) { category = 'Tørr'; catKey = 'torr'; }
  else if (idx < th.normal) { category = 'Normal'; catKey = 'normal'; }
  else if (idx < th.myk) { category = 'Myk'; catKey = 'myk'; }
  else if (idx < th.svaert_vaat) { category = 'Svært våt'; catKey = 'svaert_vaat'; }
  else { category = 'Mulig vannmettet'; catKey = 'vannmettet'; }

  const dataDays = days.filter(d => isNum(d.rr)).length;
  const confidence = dataDays >= 14 && missing.length / Math.max(1, days.length * 2) < 0.2
    ? 'høy' : dataDays >= 7 ? 'middels' : 'lav';

  return { index: round1(idx), category, catKey, series, confidence, missing, dataDays };
}

/** Nedbørsummer og «tid siden betydelig regn» fra observert døgnserie. */
export function rainSummary(days, significantMm = 5) {
  const valid = days.filter(d => isNum(d.rr));
  const last = n => round1(valid.slice(-n).reduce((s, d) => s + d.rr, 0));
  let since = null;
  for (let i = valid.length - 1; i >= 0; i--) {
    if (valid[i].rr >= significantMm) { since = valid.length - 1 - i; break; }
  }
  return { d1: valid.length ? last(1) : null, d3: valid.length >= 3 ? last(3) : null, d7: valid.length >= 7 ? last(7) : null, daysSinceSignificantRain: since, nDays: valid.length };
}

/**
 * Relativ greenspeed — KATEGORI, ikke Stimpmeter. Krever kalibrering for tall.
 * rainLastObsDayMm = nedbør i siste komplette 06–06-observasjonsdøgn (kan være
 * opptil ~24 t gammelt) — terskel 4 mm for å ikke la én gammel byge dominere.
 */
export function greenspeed(catKey, rainLastObsDayMm, daysSinceRain) {
  if (catKey === 'vannmettet' || catKey === 'svaert_vaat' || (isNum(rainLastObsDayMm) && rainLastObsDayMm >= 4)) {
    return { speed: 'Sakte', why: 'Våt eller nylig fuktet overflate bremser ballen.' };
  }
  if (catKey === 'torr' && (daysSinceRain == null || daysSinceRain >= 3)) {
    return { speed: 'Rask', why: 'Tørr bane over flere døgn gir fastere og raskere greener.' };
  }
  return { speed: 'Normal', why: 'Verken markert opptørking eller ny fukting.' };
}

/**
 * Kalibrert greenspeed på EINARS EGEN 1–10-SKALA (1 = tregest, 10 = raskest),
 * forankret i egne vurderinger på banen. Dette er IKKE Stimpmeter og ikke fot —
 * tallet er kun sammenlignbart med Einars egne målinger på samme bane.
 *
 * points        [{ index, verdi }] — modellert våthetsindeks (mm-ekv.) på
 *               måletidspunktet, parret med den MÅLTE greenspeeden (1–10).
 * currentIndex  våthetsindeksen det skal predikeres for.
 * cfg           assumed_slope_per_mm, min_points_for_fit,
 *               min_index_spread_mm, clamp_skala.
 *
 * Sammenhengen modelleres som verdi = nivå − helning · indeks (våtere = tregere).
 * Med få målinger kan bare NIVÅET bestemmes av data:
 *   'ingen'     ingen målinger → verdi = null (bruk kategorien Sakte/Normal/Rask)
 *   'forankret' for få målinger eller for lik fuktighet → helningen er en ANTAKELSE
 *               fra cfg, nivået legges gjennom snittet av målingene. Linja treffer
 *               målingene eksakt ved n = 1, men si ALDRI at prediksjonen er
 *               validert: én måling kan ikke skille nivå fra helning.
 *   'tilpasset' nok målinger med nok spredning i fuktighet → både nivå og helning
 *               er minste kvadraters tilpasning, og rmse er en ekte treffsikkerhet.
 */
export function calibratedGreenspeed(points, currentIndex, cfg = {}) {
  const slopeAssumed = cfg.assumed_slope_per_mm ?? 0.06;
  const minN = cfg.min_points_for_fit ?? 3;
  const minSpread = cfg.min_index_spread_mm ?? 15;
  const lo = cfg.clamp_skala?.[0] ?? 1, hi = cfg.clamp_skala?.[1] ?? 10;

  const pts = (points || []).filter(p => isNum(p.index) && isNum(p.verdi));
  const n = pts.length;
  if (!n || !isNum(currentIndex)) return { verdi: null, n, mode: 'ingen', trengerFlere: minN };

  const xs = pts.map(p => p.index), ys = pts.map(p => p.verdi);
  const mean = a => a.reduce((s, v) => s + v, 0) / a.length;
  const mx = mean(xs), my = mean(ys);
  const spread = Math.max(...xs) - Math.min(...xs);

  let slope, mode;
  if (n >= minN && spread >= minSpread) {
    const sxx = xs.reduce((s, x) => s + (x - mx) ** 2, 0);
    const sxy = xs.reduce((s, x, i) => s + (x - mx) * (ys[i] - my), 0);
    slope = sxx > 0 ? -(sxy / sxx) : slopeAssumed; // positiv = tregere når våtere
    mode = 'tilpasset';
  } else {
    slope = slopeAssumed;
    mode = 'forankret';
  }
  const level = my + slope * mx;              // linja gjennom snittet av målingene
  const raw = level - slope * currentIndex;
  const verdi = clamp(raw, lo, hi);

  let rmse = null;
  if (mode === 'tilpasset') {
    const se = pts.reduce((s, p) => s + (p.verdi - (level - slope * p.index)) ** 2, 0);
    rmse = round1(Math.sqrt(se / n));
  }
  return {
    verdi: round1(verdi),
    klippet: raw !== verdi,
    n, mode, rmse,
    helning: Math.round(slope * 1000) / 1000,
    helningKilde: mode === 'tilpasset' ? 'tilpasset egne målinger' : 'ANTATT — ikke målt',
    spredning: round1(spread),
    trengerFlere: mode === 'tilpasset' ? 0 : Math.max(0, minN - n),
    trengerSpredning: mode === 'tilpasset' ? 0 : round1(Math.max(0, minSpread - spread)),
  };
}

/* ============================================================
 * SKI: regelbasert føreklassifisering
 * obs: { sd, fsw, sdfsw3d, lwc, age, tmSeries:[{date,tm}], qsw, rrToday }
 * fc:  { tempNow, next24hMinC, next24hMaxC, freshSnowForecastCm }
 * prep: siste løypekjøring fra manuell logg:
 *       { hoursAgo, tempAtPrep, snowWetAtPrep (bool|null) } | null
 * ============================================================ */
export function classifySnow(obs, fc, prep, cfg) {
  const p = cfg || {};
  const minSd = p.min_snow_depth_cm ?? 5;
  const thaw = p.thaw_temp_c ?? 1.0, refreeze = p.refreeze_temp_c ?? -1.0;
  const freshSig = p.fresh_snow_significant_mm_we ?? 3; // mm VANNEKVIVALENT (≈ 1:10 mot cm snø)
  const nearZero = p.near_zero_band_c ?? 1.0;
  const oldAge = p.old_snow_age_days ?? 7;
  const coldT = p.cold_snow_temp_c ?? -5;

  const reasons = [];
  const caveats = [];
  let uncertain = false;

  const sd = obs?.sd, lwc = obs?.lwc, age = obs?.age, fsw = obs?.fsw;
  const tempNow = fc?.tempNow;
  const tms = (obs?.tmSeries || []).filter(d => isNum(d.tm));

  if (!isNum(sd)) return noSnowResult('Mangler snødybdedata', 'mangler-data');
  if (sd < minSd) return noSnowResult(`Modellert snødybde ${round1(sd)} cm (< ${minSd} cm) — ikke skiføre.`, 'ikke-snø');

  // Tine/fryse-analyse fra temperaturforløpet (siste 5 døgn mest relevant)
  const recent = tms.slice(-5);
  const maxRecent = recent.length ? Math.max(...recent.map(d => d.tm)) : null;
  const thawedRecently = isNum(maxRecent) && maxRecent > thaw;
  const wetNow = isNum(lwc) && lwc > 0;
  const frozenNow = isNum(tempNow) && tempNow < refreeze;
  const rainOnSnow = isNum(obs?.rrToday) && obs.rrToday >= 1 && isNum(tempNow) && tempNow > 0.5;
  const melting = isNum(obs?.qsw) && obs.qsw > 0;

  let catKey = null, category = null;

  // 1. Regn på snø i siste observasjonsdøgn
  if (rainOnSnow) {
    catKey = 'vaat'; category = 'Våt/grovkornet snø';
    reasons.push(`Regn siste observasjonsdøgn (${round1(obs.rrToday)} mm, NVE, t.o.m. kl. 06 UTC) med plussgrader — snøen tar til seg vann.`);
  }
  // 2. Våt/fuktig snø (vann i snøen og ikke frost nå)
  else if (wetNow && !frozenNow) {
    catKey = isNum(tempNow) && tempNow > 1.5 ? 'vaat' : 'fuktig';
    category = catKey === 'vaat' ? 'Våt/grovkornet snø' : 'Fuktig snø';
    reasons.push(`Modellert vanninnhold i snøen ${round1(lwc)} % (NVE «snøtilstand»).`);
    if (melting) reasons.push(`Pågående snøsmelting (${round1(obs.qsw)} mm/døgn, NVE).`);
  }
  // 3. Skare/is: mildvær eller våt snø som så har frosset
  else if ((thawedRecently || wetNow) && frozenNow) {
    catKey = 'skare'; category = 'Skare / hardt';
    if (thawedRecently) reasons.push(`Mildvær siste døgn (maks døgntemp ${round1(maxRecent)} °C) etterfulgt av frost (${round1(tempNow)} °C nå) — overflaten har frosset til skare.`);
    if (wetNow) reasons.push('Snøen hadde fritt vann som nå fryser.');
  }
  // 4. Nysnø
  else if (isNum(fsw) && fsw >= freshSig) {
    if (isNum(tempNow) && tempNow < -2) {
      catKey = 'torr-nysno'; category = 'Tørr nysnø';
      reasons.push(`${round1(fsw)} mm nysnø (vannekvivalent) siste døgn (NVE) i kulde (${round1(tempNow)} °C).`);
    } else {
      catKey = 'fuktig'; category = 'Fuktig nysnø';
      reasons.push(`Nysnø siste døgn nær null grader — fuktig og krevende.`);
      uncertain = true;
    }
  }
  // 5. Kald finkornet (fersk-ish snø i stabil kulde)
  else if (isNum(age) && age <= 3 && isNum(tempNow) && tempNow <= coldT) {
    catKey = 'kald-fin'; category = 'Kald, finkornet snø';
    reasons.push(`Snøoverflaten er ${Math.round(age)} døgn gammel (NVE) og det er stabilt kaldt (${round1(tempNow)} °C).`);
  }
  // 6. Gammel/omdannet
  else if (isNum(age) && age >= oldAge) {
    catKey = 'omdannet'; category = 'Omdannet/gammel snø';
    reasons.push(`Snøoverflaten er ~${Math.round(age)} døgn gammel (NVE) uten vesentlig nysnø.`);
    if (frozenNow) reasons.push('Frost nå — regn med hard, omdannet overflate.');
  }
  // 7. Restkategori
  else {
    catKey = 'blandet'; category = 'Blandet/usikkert føre';
    reasons.push('Ingen enkeltfaktor dominerer — føret er trolig blandet.');
    uncertain = true;
  }

  // Løypekjøring modifiserer vurderingen (brukerregistrert)
  if (prep && isNum(prep.hoursAgo)) {
    if (prep.hoursAgo <= 36 && (prep.snowWetAtPrep === true || (isNum(prep.tempAtPrep) && prep.tempAtPrep > 0)) && frozenNow) {
      catKey = 'is'; category = 'Hardt/isete i preparert løype';
      reasons.push(`Løypa ble kjørt for ~${Math.round(prep.hoursAgo)} t siden mens snøen var våt/mild (registrert), og det har siden frosset — pakket våt snø fryser til betong/is.`);
    } else if (prep.hoursAgo <= 24 && isNum(fsw) && fsw >= freshSig) {
      reasons.push(`Nysnø etter siste løypekjøring (~${Math.round(prep.hoursAgo)} t siden) — løs snø oppå pakket såle.`);
    } else if (prep.hoursAgo <= 24 && isNum(prep.tempAtPrep) && prep.tempAtPrep < -3 && !wetNow) {
      reasons.push(`Løypa ble kjørt i stabil kulde for ~${Math.round(prep.hoursAgo)} t siden — normalt fine, faste spor.`);
    } else if (prep.hoursAgo > 72) {
      caveats.push(`Over 3 døgn siden registrert løypekjøring — sporene kan være gjensnødd eller nedslitt.`);
    }
  } else {
    caveats.push('Ingen registrert løypekjøring — vurderingen gjelder upreparert snø. Registrer prepping under for bedre vurdering.');
  }

  // Nær null grader → usikkerheten opp
  if (isNum(tempNow) && Math.abs(tempNow) <= nearZero) {
    uncertain = true;
    caveats.push(`Temperaturen er nær frysepunktet (${round1(tempNow)} °C) — små endringer i sol, vind eller høyde kan endre føret helt. Usikkerheten er STOR.`);
  }
  if (!isNum(lwc)) caveats.push('Mangler modellert snøtilstand (vanninnhold) — våt/tørr-skillet er mer usikkert.');

  const confidence = uncertain ? 'lav' : (reasons.length >= 2 && isNum(lwc) && isNum(age) ? 'middels' : 'middels');
  return { catKey, category, reasons, caveats, uncertain, confidence, snowDepthCm: round1(sd) };

  function noSnowResult(msg, key) {
    return { catKey: key, category: key === 'ikke-snø' ? 'Ikke skiføre' : 'Mangler data', reasons: [msg], caveats: [], uncertain: false, confidence: key === 'ikke-snø' ? 'høy' : 'lav', snowDepthCm: isNum(sd) ? round1(sd) : null };
  }
}

/* ============================================================
 * SKI: smøreguide — PRODUKTKATEGORIER og temperaturspenn,
 * ikke merkeprodukter (smørebeholdningen er ukjent).
 * ============================================================ */
export function waxAdvice(catKey, tempNow) {
  const t = isNum(tempNow) ? tempNow : null;
  const glide = t == null ? { cat: 'Ukjent', range: '—' }
    : t <= -8 ? { cat: 'Kald glider', range: 'ca. −8 °C og kaldere' }
    : t <= -2 ? { cat: 'Middels glider', range: 'ca. −2 til −8 °C' }
    : { cat: 'Våt glider', range: 'ca. −2 °C og varmere' };

  const map = {
    'torr-nysno': t != null && t <= -8
      ? adv('Hard festevoks, kald', 'ca. −8 til −15 °C', 'Ekstra kald hardvoks', 'Tørr, kald nysnø gir godt feste med hardvoks.')
      : adv('Hard festevoks, middels', 'ca. −2 til −8 °C', 'Ett trinn mykere hardvoks', 'Tørr nysnø — start hardt, gå mykere ved behov.'),
    'kald-fin': adv('Hard festevoks, kald', 'ca. −5 til −15 °C', 'Tynn klisterbunn under ved slitasje', 'Kald finkornet snø sliter voks — flere tynne lag.'),
    'omdannet': t != null && t < -3
      ? adv('Hardvoks på klisterbunn', 'ca. −3 til −10 °C', 'Fiolett-kategori voks', 'Omdannet kald snø er skarp — bunnklister øker slitestyrken.')
      : adv('Universalklister', 'ca. −3 til +3 °C', 'Skins/feller', 'Omdannet snø nær null krever normalt klister.'),
    'fuktig': adv('Rubb/zero eller universalklister', 'ca. −1 til +1 °C', 'Skins/feller', 'Fuktig nysnø rundt null er det vanskeligste smøreføret — rubbski/zero er ofte redningen.'),
    'vaat': adv('Universalklister eller rødt klister (varmt)', 'ca. 0 °C og varmere', 'Skins/feller', 'Våt, grovkornet snø gir godt klisterfeste.'),
    'skare': adv('Klister (fiolett/universal-kategori)', 'ca. −5 til 0 °C', 'Skins/feller', 'Skare og harde spor krever klister for feste.'),
    'is': adv('Klister på isete spor — eller skins', 'ca. −5 til 0 °C', 'Skins/feller (anbefalt)', 'Isete preparerte spor gir dårlig voksfeste; skins er tryggest.'),
    'blandet': adv('Universalklister eller skins', 'bredt spenn', 'Rubb/zero hvis rundt null', 'Blandet føre — velg noe som tåler variasjon.'),
  };
  const classic = map[catKey] || adv('Ukjent — for lite data', '—', '—', 'Mangler grunnlag for anbefaling.');

  const caveats = [
    'Anbefalingen er regelbasert ut fra modellert snøtilstand og temperatur — ikke testet i løypa i dag.',
    'Sol på snøen, høydeforskjeller langs løypa og nylig løypekjøring kan flytte føret en hel kategori.',
  ];
  if (t != null && Math.abs(t) <= 1) caveats.push('Nær null grader: ha alltid en våtere reserve i sekken.');

  const confidence = catKey === 'blandet' || (t != null && Math.abs(t) <= 1) ? 'lav' : 'middels';
  return { classic, glide, caveats, confidence };

  function adv(primary, range, reserve, why) { return { primary, range, reserve, why }; }
}

/* ============================================================
 * VARSELTREFFSIKKERHET
 * pair: { date, lead (døgn), fc (varslet verdi), obs (observert verdi) }
 * Kun par med kompatibelt tidsvindu skal sendes inn (06–06 UTC-døgn).
 * ============================================================ */
export function accuracyStats(pairs) {
  const v = pairs.filter(p => isNum(p.fc) && isNum(p.obs));
  const n = v.length;
  if (!n) return { n: 0, bias: null, mae: null, rmse: null, se: null };
  const errs = v.map(p => p.fc - p.obs);
  const bias = errs.reduce((a, b) => a + b, 0) / n;
  const mae = errs.reduce((a, b) => a + Math.abs(b), 0) / n;
  const rmse = Math.sqrt(errs.reduce((a, b) => a + b * b, 0) / n);
  const sd = Math.sqrt(errs.reduce((a, b) => a + (b - bias) ** 2, 0) / Math.max(1, n - 1));
  return { n, bias: round2(bias), mae: round2(mae), rmse: round2(rmse), se: round2(sd / Math.sqrt(n)) };
}

/**
 * Nedbørskalibrering: for hvert varslet nedbørsintervall, hvor ofte kom det
 * faktisk nedbør, og hvor mye i snitt? Svarer på «når varselet sier 0–3 mm,
 * hva er sannsynligheten for regn?». Ren telling — ingen LLM.
 */
export function precipCalibration(pairs, wetThreshold = 1.0) {
  const bins = [[0, 0.1], [0.1, 1], [1, 3], [3, 6], [6, 10], [10, 20], [20, Infinity]];
  const labels = ['0', '0–1', '1–3', '3–6', '6–10', '10–20', '20+'];
  const v = pairs.filter(p => isNum(p.fc) && isNum(p.obs));
  return bins.map((b, i) => {
    const inb = v.filter(p => p.fc >= b[0] && p.fc < b[1]);
    const n = inb.length;
    const rained = inb.filter(p => p.obs >= wetThreshold).length;
    return {
      label: labels[i], n,
      pRain: n ? round2(rained / n) : null,
      meanObs: n ? round1(inb.reduce((s, p) => s + p.obs, 0) / n) : null,
    };
  });
}

/** Nedbør som hendelse: varslet ≥ terskel vs. observert ≥ terskel. */
export function precipEvents(pairs, thresholdMm = 1.0) {
  const v = pairs.filter(p => isNum(p.fc) && isNum(p.obs));
  let hits = 0, misses = 0, fa = 0, corrNeg = 0;
  for (const p of v) {
    const f = p.fc >= thresholdMm, o = p.obs >= thresholdMm;
    if (f && o) hits++; else if (!f && o) misses++; else if (f && !o) fa++; else corrNeg++;
  }
  const pod = hits + misses ? hits / (hits + misses) : null;         // treffandel når det faktisk kom nedbør
  const far = hits + fa ? fa / (hits + fa) : null;                    // andel falske alarmer blant nedbørsvarsler
  const fbias = hits + misses ? (hits + fa) / (hits + misses) : null; // >1: varsler nedbør oftere enn den kommer
  return { n: v.length, hits, misses, falseAlarms: fa, correctNegatives: corrNeg, pod: roundN(pod, 2), far: roundN(far, 2), fbias: roundN(fbias, 2) };
}

/** Ærlighetsnivå for påstander om skjevhet. Krever både utvalg og signifikans. */
export function evidenceLevel(n, bias, se, cfgLevels) {
  const L = cfgLevels || { tidlig_tendens: 30, mulig_skjevhet: 100, dokumentert: 300 };
  if (!n || n < L.tidlig_tendens) return { level: 'for-lite-data', label: 'For lite data', claim: false };
  const significant = isNum(bias) && isNum(se) && se > 0 && Math.abs(bias) > 2 * se;
  if (n < L.mulig_skjevhet) return { level: 'tidlig-tendens', label: 'Tidlig tendens', claim: false };
  if (n < L.dokumentert) return significant
    ? { level: 'mulig-skjevhet', label: 'Mulig stabil skjevhet', claim: true }
    : { level: 'tidlig-tendens', label: 'Tidlig tendens', claim: false };
  return significant
    ? { level: 'dokumentert', label: 'Godt dokumentert mønster', claim: true }
    : { level: 'ingen-skjevhet', label: 'Ingen påvisbar skjevhet (godt utvalg)', claim: false };
}

/** Bias-korreksjon krympet mot 0 ved små utvalg: b·n/(n+k). */
export function shrunkBias(bias, n, k = 50) {
  if (!isNum(bias) || !n) return 0;
  return bias * (n / (n + k));
}

/**
 * Walk-forward-backtest av bias-korrigering — bruker KUN par som lå før
 * hvert prognosetidspunkt (ingen datalekkasje). Aktiverer bare korrigering
 * hvis den slår rått varsel på de siste `holdout`-parene.
 */
export function walkForwardBacktest(pairs, k = 50, holdoutFraction = 0.3) {
  const v = pairs.filter(p => isNum(p.fc) && isNum(p.obs)).slice().sort((a, b) => a.date < b.date ? -1 : 1);
  const n = v.length;
  const hStart = Math.floor(n * (1 - holdoutFraction));
  if (n < 20 || hStart < 10) return { enabled: false, reason: 'For lite data til backtest (< 20 par).', maeRaw: null, maeCorr: null, nHoldout: 0 };
  let sumRaw = 0, sumCorr = 0, m = 0;
  for (let i = hStart; i < n; i++) {
    // Kun fasit som forelå FØR holdout-varselet ble utstedt: måldato strengt før
    // snapshot-datoen (p.s) når den finnes, ellers strengt før måldatoen.
    // Ekskluderer også andre snapshots par for samme måldato (samme fasitverdi).
    const cutoff = v[i].s || v[i].date;
    const past = v.slice(0, i).filter(p => p.date < cutoff);
    if (past.length < 5) { sumRaw += Math.abs(v[i].fc - v[i].obs); sumCorr += Math.abs(v[i].fc - v[i].obs); m++; continue; }
    const errs = past.map(p => p.fc - p.obs);
    const b = errs.reduce((a, x) => a + x, 0) / past.length;
    const corr = v[i].fc - shrunkBias(b, past.length, k);
    sumRaw += Math.abs(v[i].fc - v[i].obs);
    sumCorr += Math.abs(corr - v[i].obs);
    m++;
  }
  const maeRaw = sumRaw / m, maeCorr = sumCorr / m;
  const enabled = maeCorr < maeRaw * 0.97; // krev ≥3 % forbedring — ren støy skal ikke aktivere
  return { enabled, maeRaw: round2(maeRaw), maeCorr: round2(maeCorr), nHoldout: m, reason: enabled ? 'Korrigering slo rått varsel i backtest (≥3 % bedre MAE).' : 'Korrigering slo IKKE rått varsel klart nok — holdes av.' };
}

/* ============================================================
 * Hjelpere for forecast-aggregering (06–06 UTC, som NVE-døgnet)
 * hours: [{time (ISO), temp, precip, wind}] med precip = mm den timen/perioden
 * ============================================================ */
export function aggregateForecastDays(hours, maxDays = 10) {
  // Grupper timepunkter i 06:00Z→06:00Z-vinduer, merket med SLUTTDATO —
  // samme semantikk som NVE GTS: døgnverdien for dato D dekker D−1 06:00 → D 06:00
  // (empirisk verifisert 2026-07-22: regn kl. 20–22 UTC 21. juli ligger i
  // døgnverdien merket 22. juli, og n døgn spenner (n−1)·24 t mellom Start/EndDate).
  const buckets = new Map();
  for (const h of hours) {
    const t = new Date(h.time);
    const shifted = new Date(t.getTime() + 18 * 3600e3); // [D−1 06:00, D 06:00) → D
    const key = shifted.toISOString().slice(0, 10);
    if (!buckets.has(key)) buckets.set(key, { temps: [], precip: 0, winds: [], covH: 0 });
    const b = buckets.get(key);
    if (isNum(h.temp)) b.temps.push(h.temp);
    // covH = timer av vinduet som nedbørsvarselet faktisk dekker. MET compact går
    // over til 6-timersblokker lenger frem — 4 blokker dekker hele døgnet selv om
    // punktantallet er lavt, så dekket TID (ikke antall punkter) er riktig mål.
    if (isNum(h.precip)) { b.precip += h.precip; b.covH += (isNum(h.spanH) ? h.spanH : 1); }
    if (isNum(h.wind)) b.winds.push(h.wind);
  }
  const out = [];
  for (const [date, b] of [...buckets.entries()].sort()) {
    if (out.length >= maxDays) break;
    // Krev rimelig dekning av døgnet for å kalle det et døgnaggregat
    if (b.temps.length < 4) continue;
    out.push({
      date,
      tmean: round1(b.temps.reduce((a, x) => a + x, 0) / b.temps.length),
      tmin: round1(Math.min(...b.temps)),
      tmax: round1(Math.max(...b.temps)),
      precip: round1(b.precip),
      windmax: b.winds.length ? round1(Math.max(...b.winds)) : null,
      covH: Math.min(24, b.covH),
    });
  }
  return out;
}

/* ---------- småhjelpere ---------- */
export function isNum(x) { return typeof x === 'number' && Number.isFinite(x); }
export function clamp(x, lo, hi) { return Math.min(hi, Math.max(lo, x)); }
export function round1(x) { return isNum(x) ? Math.round(x * 10) / 10 : x; }
export function round2(x) { return isNum(x) ? Math.round(x * 100) / 100 : x; }
function roundN(x, n) { return isNum(x) ? Math.round(x * 10 ** n) / 10 ** n : x; }
