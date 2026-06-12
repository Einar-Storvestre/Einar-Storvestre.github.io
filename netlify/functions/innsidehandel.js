// Live innsidehandel fra Oslo Børs NewsWeb (kategori 1102 = Managers' transaction).
// Kalles fra nettsiden: /.netlify/functions/innsidehandel?scope=protector | all
// Speiler logikken i scripts/fetch-innside.mjs. Cachet 5 min på Netlify-kanten.

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const LIST_URL = "https://api3.oslo.oslobors.no/v1/newsreader/list";
const MSG_URL = "https://api3.oslo.oslobors.no/v1/newsreader/message";
const CAT_INSIDE = 1102;
const PROT_SIGN = "PROT";

function daysAgoISO(days) {
  return new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
}

async function getJSON(url) {
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function fetchList({ fromDate = "", toDate = "" }) {
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
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&nbsp;/g, " ");
}
function cleanText(html) {
  if (!html) return "";
  let t = html.replace(/<br\s*\/?>(\n)?/gi, " ").replace(/<\/p>/gi, " ").replace(/<[^>]+>/g, " ");
  return decodeEntities(t).replace(/\s+/g, " ").trim();
}
function snippet(text, max = 340) {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const lastDot = cut.lastIndexOf(". ");
  return lastDot > 120 ? cut.slice(0, lastDot + 1) : cut.trim() + "…";
}
function classifySide(text) {
  const t = text.toLowerCase();
  const grant = /(bonus|incentive|insentiv|tildeling|allocation|aksjeprogram|aksjespareprogram|share saving|share program|tegningsrett|\boption\b|opsjon|vesting|relocat|reloker|egne ansatte|own employees|to employees|to its employees)/;
  const buy = /(acquir|bought|\bbuy\b|purchas|subscrib|\bkjøp|ervervet|\berverv|increased (its|his|her) (share|holding))/;
  const sell = /(\bsold\b|\bsale\b|\bsells\b|dispos|solgt|\bsalg\b|avhend|reduced (its|his|her) (share|holding))/;
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
const isNorsk = (s) => /[æøå]/i.test(s) || /\baksjer\b/i.test(s);
function dedupe(trades) {
  const seen = new Map();
  for (const t of trades) {
    const sig = `${t.issuerSign}|${t.date}|${(t.summary.match(/\d+/g) || []).join("-")}`;
    const prev = seen.get(sig);
    if (!prev) seen.set(sig, t);
    else if (isNorsk(t.summary) && !isNorsk(prev.summary)) seen.set(sig, t);
  }
  return Array.from(seen.values());
}

async function buildProtector(limit = 12) {
  const list = await fetchList({ fromDate: daysAgoISO(900), toDate: daysAgoISO(0) });
  const prot = list.filter((m) => m.issuerSign === PROT_SIGN || /protector/i.test(m.issuerName || ""));
  const trades = await withBodies(prot.slice(0, limit + 6));
  return dedupe(trades).slice(0, limit);
}
async function buildAll(limit = 20) {
  const list = await fetchList({ fromDate: daysAgoISO(120), toDate: daysAgoISO(0) });
  const trades = await withBodies(list.slice(0, limit + 14));
  return dedupe(trades).slice(0, limit);
}

exports.handler = async (event) => {
  const scope = (event.queryStringParameters && event.queryStringParameters.scope) || "protector";
  try {
    const trades = scope === "all" ? await buildAll() : await buildProtector();
    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=300, s-maxage=300",
        "Access-Control-Allow-Origin": "*",
      },
      body: JSON.stringify({ updated: new Date().toISOString(), scope, trades }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ error: err.message, scope }),
    };
  }
};
