// Scraper CLI: runs a series of sample queries and writes the latest results
// to data/latest.json. This is used by the GitHub Actions workflow to keep
// the static frontend populated even when the backend is not running.
//
// Usage: node server/scrape.js [--queries=ubuntu,debian,nodejs,arch] [--per-query=8]
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { searchAll, listProviderMeta } from "./lib/orchestrator.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, "..", "data");

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? true];
  })
);

const queries = (args.queries || "ubuntu,debian,arch linux,nodejs,python,vscode,windows 11,github,open source,linux mint")
  .split(",").map((s) => s.trim()).filter(Boolean);
const perQuery = parseInt(args["per-query"], 10) || 8;
const limit = parseInt(args.limit, 10) || 30;
const category = args.category || "all";

async function main() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const stamp = new Date().toISOString();
  console.log(`\n[torrentsearch-scrape] ${stamp}`);
  console.log(`  queries: ${queries.length}, per-query: ${perQuery}, limit: ${limit}, category: ${category}`);

  const all = [];
  const providerStats = {};
  for (const q of queries) {
    console.log(`  → searching: "${q}"`);
    try {
      const r = await searchAll(q, { category, limit: perQuery, timeoutMs: 10000 });
      // Stash top perQuery results
      const top = r.results.slice(0, perQuery).map((t) => ({ ...t, query: q }));
      all.push(...top);
      for (const p of r.providers) {
        providerStats[p.id] = providerStats[p.id] || { id: p.id, name: p.name, hits: 0, ok: true, totalMs: 0 };
        providerStats[p.id].hits += p.count;
        providerStats[p.id].ok = providerStats[p.id].ok && p.ok;
        providerStats[p.id].totalMs += p.ms;
      }
    } catch (e) {
      console.log(`    error: ${e.message}`);
    }
  }

  // Deduplicate across queries (by info hash or name+size)
  const seen = new Set();
  const dedup = [];
  for (const t of all) {
    const hash = (t.magnet || "").match(/xt=urn:btih:([a-fA-F0-9]{40})/i)?.[1] || (t.name + "|" + t.sizeBytes);
    if (seen.has(hash)) continue;
    seen.add(hash);
    dedup.push(t);
  }

  const output = {
    generatedAt: stamp,
    queries,
    category,
    totalResults: dedup.length,
    totalProviders: listProviderMeta().length,
    providers: Object.values(providerStats),
    results: dedup,
  };
  const outFile = path.join(DATA_DIR, "latest.json");
  fs.writeFileSync(outFile, JSON.stringify(output, null, 2));
  console.log(`\n  ✅ Wrote ${outFile}  (${dedup.length} unique results)`);
}

main().catch((e) => { console.error("FATAL", e); process.exit(1); });
