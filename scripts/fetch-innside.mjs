// Henter meldepliktig innsidehandel (primærinnsidere) fra Oslo Børs NewsWeb.
// Brukes BÅDE som CLI (GitHub Action skriver static/innside-*.json) OG kan importeres.
// Kjør lokalt:  node scripts/fetch-innside.mjs
//
// Kilde: https://api3.oslo.oslobors.no/v1/newsreader  (kategori 1102 = Managers' transaction)

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const LIST_URL = "https://api3.oslo.oslobors.no/v1/newsreader/list";
const MSG_URL = "https://api3.oslo.oslobors.no/v1/newsreader/message";
const CAT_INSIDE = 1102; // Meldepliktig handel for primærinnsidere
const PROT_SIGN = "PROT";

function daysAgoISO(days) {
  const d = new Date(Date.now() - days * 86400000);
  return d.toISOString().slice(0, 10);
}

async function getJSON(url) {
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

async function fetchList({ fromDate = "", toDate = "" } = {}) {
  const url = `${LIST_URL}?category=${CAT_INSIDE}&issuer=&messageTitle=&fromDate=${fromDate}&toDate=${toDate}&market=`;
  const data = await getJSON(url);
  return data?.data?.messages || [];
}

async function fetchBody(messageId) {
  try {
    const data = await getJSON(`${MSG_URL}?messageId=${messageId}`);
    return data?.data?.message?.body || "";
  } catch {
    return "";
  }
}

function decodeEntities(s) {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function cleanText(html) {
  if (!html) return "";
  let t = html.replace(/<br\s*\/?>(\n)?/gi, " ").replace(/<\/p>/gi, " ");
  t = t.replace(/<[^>]+>/g, " ");
  t = decodeEntities(t);
  return t.replace(/\s+/g, " ").trim();
}

// Klipp til hele setninger, maks ~340 tegn
function snippet(text, max = 340) {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const lastDot = cut.lastIndexOf(". ");
  return (lastDot > 120 ? cut.slice(0, lastDot + 1) : cut.trim() + "…");
}

function classifySide(text) {
  const t = text.toLowerCase();
  // Bonus/tildeling/opsjon/overføring = nøytral ("other") — ikke et åpent kjøp/salg.
  const grant =
    /(bonus|incentive|insentiv|tildeling|allocation|aksjeprogram|aksjespareprogram|share saving|share program|tegningsrett|\boption\b|opsjon|vesting|relocat|reloker|egne ansatte|own employees|to employees|to its employees)/;
  // Stammer uten etterfølgende ordgrense (fanger acquired/acquiring, purchased/purchasing, kjøpt/kjøpte ...)
  const buy =
    /(acquir|bought|\bbuy\b|purchas|subscrib|\bkjøp|ervervet|\berverv|increased (its|his|her) (share|holding))/;
  const sell =
    /(\bsold\b|\bsale\b|\bsells\b|dispos|solgt|\bsalg\b|avhend|reduced (its|his|her) (share|holding))/;
  if (buy.test(t) && !sell.test(t) && !grant.test(t)) return "buy";
  if (sell.test(t) && !buy.test(t) && !grant.test(t)) return "sell";
  if (grant.test(t)) return "other";
  if (buy.test(t)) return "buy";
  if (sell.test(t)) return "sell";
  return "other";
}

function toTrade(m, body) {
  const summary = cleanText(body);
  return {
    date: (m.publishedTime || "").slice(0, 10),
    publishedTime: m.publishedTime,
    issuerSign: m.issuerSign,
    issuerName: m.issuerName,
    title: m.title,
    messageId: m.messageId,
    side: classifySide(summary + " " + (m.title || "")),
    summary: snippet(summary),
    url: `https://newsweb.oslobors.no/message/${m.messageId}`,
  };
}

async function withBodies(messages) {
  const bodies = await Promise.all(messages.map((m) => fetchBody(m.messageId)));
  return messages.map((m, i) => toTrade(m, bodies[i]));
}

function isNorsk(s) {
  return /[æøå]/i.test(s) || /\baksjer\b/i.test(s);
}

// Slår sammen norsk/engelsk-par av SAMME melding (samme utsteder, dato og tallverdier),
// men beholder genuint ulike handler. Foretrekker norsk versjon når den finnes.
function dedupe(trades) {
  const seen = new Map();
  for (const t of trades) {
    const digits = (t.summary.match(/\d+/g) || []).join("-");
    const sig = `${t.issuerSign}|${t.date}|${digits}`;
    const prev = seen.get(sig);
    if (!prev) {
      seen.set(sig, t);
    } else if (isNorsk(t.summary) && !isNorsk(prev.summary)) {
      seen.set(sig, t); // behold norsk, behold posisjon
    }
  }
  return Array.from(seen.values());
}

// NB: API-et sorterer nyeste-først kun når BÅDE fromDate og toDate er satt.
const TODAY = () => daysAgoISO(0);

export async function buildProtector(limit = 12) {
  const list = await fetchList({ fromDate: daysAgoISO(900), toDate: TODAY() });
  const prot = list.filter(
    (m) => m.issuerSign === PROT_SIGN || /protector/i.test(m.issuerName || "")
  );
  const trades = await withBodies(prot.slice(0, limit + 6));
  return dedupe(trades).slice(0, limit);
}

export async function buildAll(limit = 20) {
  const list = await fetchList({ fromDate: daysAgoISO(120), toDate: TODAY() });
  const trades = await withBodies(list.slice(0, limit + 16));
  return dedupe(trades).slice(0, limit);
}

export async function buildPayload() {
  const [protector, all] = await Promise.all([buildProtector(), buildAll()]);
  return { updated: new Date().toISOString(), protector, all };
}

// CLI: skriv static/innside-protector.json og static/innside-all.json
// (pathToFileURL håndterer mellomrom/spesialtegn i stien, f.eks. "Einar website")
const { pathToFileURL } = await import("node:url");
const isCLI = import.meta.url === pathToFileURL(process.argv[1]).href;
if (isCLI) {
  const fs = await import("node:fs");
  const path = await import("node:path");
  const payload = await buildPayload();
  const outDir = path.resolve(process.argv[2] || "static");
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(
    path.join(outDir, "innside-protector.json"),
    JSON.stringify({ updated: payload.updated, trades: payload.protector }, null, 0)
  );
  fs.writeFileSync(
    path.join(outDir, "innside-all.json"),
    JSON.stringify({ updated: payload.updated, trades: payload.all }, null, 0)
  );
  console.log(
    `Skrev ${payload.protector.length} Protector-handler og ${payload.all.length} Oslo Børs-handler til ${outDir}`
  );
}
