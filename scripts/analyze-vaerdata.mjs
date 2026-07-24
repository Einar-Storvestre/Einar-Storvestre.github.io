/**
 * Værdata — ukentlig LLM-tolkning av treffsikkerheten (VALGFRITT, HVILENDE).
 *
 * De harde tallene (bias/MAE/PoD/FAR/kalibrering) beregnes gratis og uten tokens
 * av scripts/fetch-vaerdata.mjs. Dette skriptet legger KUN en språklig tolkning
 * oppå — «undervurderes regn?», «hvor fort blir varselet dårligere?» osv.
 *
 * Kjører ALDRI av seg selv og koster ALDRI tokens før:
 *   1) miljøvariabelen ANTHROPIC_API_KEY er satt (GitHub-secret), OG
 *   2) det finnes nok sammenlignbare par (>= accuracy.evidence_levels.tidlig_tendens).
 * Uten nøkkel skriver den ingen fil og avslutter med kode 0 (hvilende).
 *
 * Modell: claude-opus-4-8 (kilde: claude-api-skill «Current Models», cache 2026-06-24,
 * $5/$25 per 1M tokens inn/ut). Overstyr med VAERDATA_MODEL (f.eks. claude-haiku-4-5,
 * $1/$5). Estimert kostnad ~0,03 USD/kjøring på Opus / ~0,006 USD på Haiku (ANSLAG,
 * bygger på ~3000 inn + ~600 ut tokens og prislisten over) → ~1,6 / ~0,3 USD per år
 * ved ukentlig kjøring. Verifiser mot faktisk forbruk i Anthropic Console.
 *
 * Kjør manuelt:  ANTHROPIC_API_KEY=sk-ant-... node scripts/analyze-vaerdata.mjs static
 */
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const STATIC = process.argv[2] || 'static';
const BASE = path.join(STATIC, 'vaerdata');
const ACC_DIR = path.join(BASE, 'data', 'accuracy');
const cfg = JSON.parse(await readFile(path.join(BASE, 'config.json'), 'utf8'));
const LOC = 'bergen_gk'; // treffsikkerhet måles kun for Bergen (Einars ønske)
const MODEL = process.env.VAERDATA_MODEL || 'claude-opus-4-8';
const KEY = process.env.ANTHROPIC_API_KEY;

const accPath = path.join(ACC_DIR, `${LOC}.json`);
if (!existsSync(accPath)) { console.log('Ingen treffsikkerhetsdata ennå — hopper over.'); process.exit(0); }
const acc = JSON.parse(await readFile(accPath, 'utf8'));

const minPairs = cfg.accuracy.evidence_levels.tidlig_tendens;
if (!acc.nPairs || acc.nPairs < minPairs) {
  console.log(`For få par (${acc.nPairs || 0} < ${minPairs}) — LLM-tolkning ikke verdt tokens ennå. Hviler.`);
  process.exit(0);
}
if (!KEY) {
  console.log('ANTHROPIC_API_KEY ikke satt — LLM-tolkning er hvilende. Sett en GitHub-secret for å aktivere.');
  process.exit(0);
}

const prompt = `Du er en nøktern meteorologi-analytiker. Under er forhåndsberegnet treffsikkerhet for værvarselet (MET Locationforecast) mot observasjon (NVE seNorge) på Bergen Golfklubb, matchet på identiske 06–06 UTC-døgn. Bias = varslet minus observert (positiv = varselet ligger for høyt). n = antall par.

Skriv en KORT norsk oppsummering (3–5 avsnitt, ingen overskrifter) som svarer på:
- Ligger temperaturvarselet systematisk for høyt eller lavt her?
- Overvurderes eller undervurderes nedbør? Varsles regn for ofte (frekvensbias) eller for sjelden?
- Hvor raskt blir varselet dårligere med lengre ledetid?
- Er feilene større rundt frysepunktet?
- Hva sier nedbørskalibreringen (når varselet sier X mm, hvor ofte kom det faktisk regn)?

STRENGE REGLER:
- Kall ALDRI noe en «systematisk skjevhet» med færre enn ${cfg.accuracy.evidence_levels.mulig_skjevhet} par, eller når |bias| ikke er større enn 2×standardfeil. Bruk «tidlig tendens» / «for lite data» der grunnlaget er tynt.
- Ikke finn opp tall som ikke står i dataene. Oppgi n når du nevner et tall.
- Vær ærlig om usikkerhet. Dette er en tolkning av tallene, ikke en ny måling.

DATA (JSON):
${JSON.stringify(acc)}`;

const body = {
  model: MODEL,
  max_tokens: 800,
  output_config: { effort: 'low' }, // billig tolkningsoppgave
  messages: [{ role: 'user', content: prompt }],
};

const ctrl = new AbortController();
const t = setTimeout(() => ctrl.abort(), 120000);
let text = '', usage = null;
try {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST', signal: ctrl.signal,
    headers: { 'content-type': 'application/json', 'x-api-key': KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify(body),
  });
  if (!r.ok) { console.error(`Anthropic HTTP ${r.status}: ${(await r.text()).slice(0, 300)}`); process.exit(1); }
  const data = await r.json();
  if (data.stop_reason === 'refusal') { console.error('Modellen avslo forespørselen — ingen fil skrevet.'); process.exit(1); }
  text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
  usage = data.usage || null;
} catch (e) {
  // nettverksfeil / timeout (abort) → feil trygt, ingen fil skrives (writeFile ligger etter)
  console.error(`Kall til Anthropic feilet (${e.name}): ${e.message}`);
  process.exit(1);
} finally { clearTimeout(t); }

if (!text) { console.error('Tomt svar fra modellen — ingen fil skrevet.'); process.exit(1); }

await writeFile(path.join(ACC_DIR, `${LOC}-narrative.json`), JSON.stringify({
  updated: new Date().toISOString(),
  model: MODEL,
  basedOnNPairs: acc.nPairs,
  usage,
  text,
}, null, 1));
console.log(`Narrativ skrevet for ${LOC} (${acc.nPairs} par, ${MODEL}). Tokens: ${usage ? usage.input_tokens + ' inn / ' + usage.output_tokens + ' ut' : 'ukjent'}.`);
