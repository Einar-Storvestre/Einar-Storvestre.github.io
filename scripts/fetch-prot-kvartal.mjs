// Henter Protectors siste kvartals-/finansrapport fra Oslo Børs NewsWeb og
// parser nøkkeltallene rett ut av meldingsteksten (combined ratio, EPS, GWP-vekst,
// resultat, Solvens II, utbytte). Skriver static/prot-kvartal.json.
//
// Samme API/mønster som scripts/fetch-innside.mjs. Kjør lokalt:
//   node scripts/fetch-prot-kvartal.mjs static
//
// MERK: NewsWeb-meldingstekst er fri tekst og formatet KAN endres. Derfor settes
// `needsReview: true` når kjernetall (combined ratio / EPS) ikke lar seg parse, slik
// at dashboardet kan flagge i stedet for å vise feil tall. En LLM-fallback (Claude API)
// kan legges til senere for å gjøre parsingen robust mot formatendringer.

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const LIST_URL = "https://api3.oslo.oslobors.no/v1/newsreader/list";
const MSG_URL = "https://api3.oslo.oslobors.no/v1/newsreader/message";
const PROT_ISSUER = 8322; // Protector Forsikrings issuerId på NewsWeb
const PROT_SIGN = "PROT";

function daysAgoISO(days) {
  return new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
}

async function getJSON(url) {
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

async function fetchList({ fromDate = "", toDate = "" } = {}) {
  // issuer-filtrert liste over alle Protector-meldinger i vinduet
  const url = `${LIST_URL}?category=&issuer=${PROT_ISSUER}&messageTitle=&fromDate=${fromDate}&toDate=${toDate}&market=`;
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
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&nbsp;/g, " ");
}

function cleanText(html) {
  if (!html) return "";
  let t = html.replace(/<br\s*\/?>(\n)?/gi, " ").replace(/<\/p>|<\/li>/gi, " ");
  t = t.replace(/<[^>]+>/g, " ");
  return decodeEntities(t).replace(/\s+/g, " ").trim();
}

// Er meldingen en kvartals-/finansrapport? (tittel-basert, robust mot kategori-rot)
function isFinancialReport(title = "") {
  const t = title.toLowerCase();
  if (/(invitation|presentation|webcast|silent period|capital markets|agm|annual general)/.test(t)) return false;
  return /(quarter|kvartal|half.?year|halvår|interim|financial report|\bresults?\b|year-end|full.?year|q[1-4]\b)/i.test(t);
}

// Hvilken periode? Q1/Q2/Q3/Q4 + år, ut fra tittel.
function parsePeriod(title = "") {
  const q = title.match(/\bQ([1-4])\b/i) || title.match(/(first|second|third|fourth)\s+quarter/i);
  const yr = title.match(/20(\d{2})/);
  const year = yr ? `20${yr[1]}` : "";
  let quarter = "";
  if (q) {
    const map = { first: "Q1", second: "Q2", third: "Q3", fourth: "Q4" };
    quarter = /^[1-4]$/.test(q[1]) ? `Q${q[1]}` : map[q[1].toLowerCase()] || "";
  } else if (/(year-end|full.?year|annual)/i.test(title)) {
    quarter = "FY";
  } else if (/(half.?year|halvår)/i.test(title)) {
    quarter = "H1";
  }
  return [quarter, year].filter(Boolean).join(" ");
}

// Tall like etter et nøkkelord, f.eks. "Combined ratio 84.9% (85.1)" -> 84.9
function num(text, label, unit) {
  const re = new RegExp(label + "[^0-9%+-]*([0-9]+(?:[.,][0-9]+)?)\\s*" + (unit || ""), "i");
  const m = text.match(re);
  return m ? parseFloat(m[1].replace(",", ".")) : null;
}

function parseFigures(body, title) {
  const text = cleanText(body);
  const hay = text + " " + (title || "");
  const combinedRatio = num(hay, "combined ratio", "%");
  const lossRatio = num(hay, "(?:net )?(?:loss|claims) ratio", "%");
  const costRatio = num(hay, "(?:net )?(?:cost|expense) ratio", "%");
  const gwpGrowth = num(hay, "(?:gross written premium|premium) growth", "%");
  const eps = num(hay, "earnings per share[^0-9]*NOK", "");
  const solvency = num(hay, "solvency (?:ii )?ratio", "%");
  const dividend = num(hay, "dividend(?: per share)?[^0-9]*NOK", "");
  const profit = num(hay, "(?:profit for the period|profit before tax)[^0-9]*NOK", "");
  const investmentReturn = num(hay, "(?:total )?investment return[^0-9]*NOK", "");
  return { combinedRatio, lossRatio, costRatio, gwpGrowth, eps, solvency, dividend, profit, investmentReturn };
}

export async function buildKvartal() {
  const list = await fetchList({ fromDate: daysAgoISO(400), toDate: daysAgoISO(0) });
  const reports = list
    .filter((m) => (m.issuerSign === PROT_SIGN || /protector/i.test(m.issuerName || "")) && isFinancialReport(m.title))
    .sort((a, b) => (b.publishedTime || "").localeCompare(a.publishedTime || ""));

  if (!reports.length) {
    return { updated: new Date().toISOString(), needsReview: true, note: "Fant ingen finansrapport-melding i vinduet." };
  }

  const m = reports[0];
  const body = await fetchBody(m.messageId);
  const figures = parseFigures(body, m.title);
  const core = figures.combinedRatio != null && figures.eps != null;

  return {
    updated: new Date().toISOString(),
    period: parsePeriod(m.title) || null,
    date: (m.publishedTime || "").slice(0, 10),
    title: m.title,
    messageId: m.messageId,
    url: `https://newsweb.oslobors.no/message/${m.messageId}`,
    ...figures,
    needsReview: !core, // sjekkes manuelt om kjernetall mangler
  };
}

// CLI: skriv static/prot-kvartal.json
const { pathToFileURL } = await import("node:url");
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const fs = await import("node:fs");
  const path = await import("node:path");
  const payload = await buildKvartal();
  const outDir = path.resolve(process.argv[2] || "static");
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "prot-kvartal.json"), JSON.stringify(payload, null, 0));
  console.log(`Skrev prot-kvartal.json (${payload.period || "ukjent periode"}, needsReview=${payload.needsReview}) til ${outDir}`);
}
