// Appender daglig PROT-verdsettelse (kurs, P/E, P/B) til static/prot-valuation-history.json
// slik at dashboardet kan vise persentil-bånd (billig/normal/dyrt vs egen historikk).
// Live-tall (P/E, P/B) hentes fra samme Cloudflare Worker som dashboardet bruker.
// Ved første kjøring (tom historikk) backfilles ~2 år daglig KURS fra Yahoo (P/E/P/B = null historisk).
// Kjør lokalt:  node scripts/append-valuation.mjs static

const WORKER = "https://snowy-sea-dcd6.einargaard.workers.dev/";
const FILE = "prot-valuation-history.json";
const MAX_POINTS = 800; // ~3 år med hverdager
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

// Best-effort backfill av daglig kurs (range=2y) fra Yahoo, med cookie+crumb som prisworkflowen.
async function backfillPrices() {
  try {
    const h = { "User-Agent": UA };
    let cookies = "";
    try {
      const r = await fetch("https://fc.yahoo.com", { headers: h });
      const raw = r.headers.get("set-cookie") || "";
      cookies = raw.split(",").map((c) => c.split(";")[0].trim()).filter(Boolean).join("; ");
    } catch {}
    const h2 = { ...h, Cookie: cookies };
    let crumb = "";
    try {
      crumb = await fetch("https://query2.finance.yahoo.com/v1/test/getcrumb", { headers: h2 }).then((r) => r.text());
    } catch {}
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/PROT.OL?interval=1d&range=2y&crumb=${encodeURIComponent(crumb)}`;
    const data = await fetch(url, { headers: h2 }).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); });
    const res = data?.chart?.result?.[0];
    const ts = res?.timestamp || [];
    const closes = res?.indicators?.quote?.[0]?.close || [];
    const out = [];
    for (let i = 0; i < ts.length; i++) {
      if (closes[i] == null) continue;
      out.push({ date: new Date(ts[i] * 1000).toISOString().slice(0, 10), price: Math.round(closes[i] * 10) / 10, pe: null, pb: null });
    }
    return out;
  } catch (e) {
    console.error(`Backfill feilet: ${e.message}`);
    return [];
  }
}

async function main() {
  const fs = await import("node:fs");
  const path = await import("node:path");
  const outDir = path.resolve(process.argv[2] || "static");
  const outPath = path.join(outDir, FILE);

  let history = [];
  try {
    history = JSON.parse(fs.readFileSync(outPath, "utf8"));
    if (!Array.isArray(history)) history = [];
  } catch {
    history = [];
  }

  // Førstegangs-backfill av kurshistorikk
  if (history.length < 30) {
    const back = await backfillPrices();
    const seen = new Set(history.map((h) => h.date));
    for (const p of back) if (!seen.has(p.date)) history.push(p);
    if (back.length) console.log(`Backfill: la til ${back.length} historiske kurspunkter.`);
  }

  // Dagens punkt med live P/E, P/B fra Worker
  try {
    const data = await fetch(WORKER, { headers: { Accept: "application/json" } }).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); });
    if (data?.price != null) {
      const entry = {
        date: todayISO(),
        price: Math.round(data.price * 10) / 10,
        pe: data.pe != null ? Math.round(data.pe * 100) / 100 : null,
        pb: data.pb != null ? Math.round(data.pb * 100) / 100 : null,
      };
      const i = history.findIndex((h) => h.date === entry.date);
      if (i >= 0) history[i] = entry;
      else history.push(entry);
    }
  } catch (e) {
    console.error(`Kunne ikke hente Worker-data: ${e.message}. Beholder historikk.`);
  }

  history.sort((a, b) => a.date.localeCompare(b.date));
  if (history.length > MAX_POINTS) history = history.slice(history.length - MAX_POINTS);

  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(history, null, 0));
  console.log(`Historikk: ${history.length} punkter, siste ${history[history.length - 1]?.date}.`);
}

main();
