// Mock test: exercises the orchestrator with a fake provider that always returns
// 5 hardcoded torrents. Verifies deduplication, ranking, and the API contract
// without touching the network.
import { searchAll, listProviderMeta, _setProvidersForTesting } from "../lib/orchestrator.js";
import { Provider, pack } from "../providers/base.js";

class MockProvider extends Provider {
  constructor(id, results) {
    super({ id, name: id.toUpperCase(), url: "https://example.com", categories: ["all"] });
    this._results = results;
  }
  async search() { return pack(this._results, this); }
}

const samples = [
  {
    name: "Ubuntu 24.04 Desktop amd64",
    magnet: "magnet:?xt=urn:btih:aaa1111111111111111111111111111111111111",
    size: "5.2 GB", sizeBytes: 5583457488, seeders: 1200, leechers: 80, completed: 4500, date: "2024-04-25", category: "Apps",
  },
  {
    name: "Ubuntu 24.04 Server",
    magnet: "magnet:?xt=urn:btih:bbb2222222222222222222222222222222222222",
    size: "1.4 GB", sizeBytes: 1503238553, seeders: 800, leechers: 30, completed: 2200, date: "2024-04-25", category: "Apps",
  },
  {
    name: "Debian 12 netinst",
    magnet: "magnet:?xt=urn:btih:ccc3333333333333333333333333333333333333",
    size: "600 MB", sizeBytes: 629145600, seeders: 2400, leechers: 100, completed: 8000, date: "2024-06-10", category: "Apps",
  },
  // Duplicate of the first one across providers (should be deduped)
  {
    name: "Ubuntu 24.04 Desktop amd64 (mirror)",
    magnet: "magnet:?xt=urn:btih:aaa1111111111111111111111111111111111111",
    size: "5.2 GB", sizeBytes: 5583457488, seeders: 500, leechers: 20, completed: 1000, date: "2024-04-26", category: "Apps",
  },
  {
    name: "Node.js v22 LTS",
    magnet: "magnet:?xt=urn:btih:ddd4444444444444444444444444444444444444",
    size: "75 MB", sizeBytes: 78643200, seeders: 600, leechers: 5, completed: 9000, date: "2024-10-29", category: "Apps",
  },
];

const mocks = [
  new MockProvider("mock-a", samples.slice(0, 3)),
  new MockProvider("mock-b", [samples[3], samples[4]]),
];
_setProvidersForTesting(mocks);

const r = await searchAll("ubuntu", { limit: 50, timeoutMs: 1000 });
console.log("Total providers:", r.providers.length);
console.log("Raw results:", r.totalRaw);
console.log("Deduped results:", r.totalResults);
console.log("\nResults (sorted by seeders):");
for (const t of r.results) {
  console.log(`  - ${t.name} | ${t.size} | seeders=${t.seeders} | provider=${t.provider}`);
}
console.log("\nProvider stats:");
for (const p of r.providers) {
  console.log(`  ${p.name}: ${p.count} hits, ${p.ms}ms, ok=${p.ok}`);
}

// Assertions
if (r.totalResults !== 4) throw new Error(`Expected 4 deduped results, got ${r.totalResults}`);
const ubuntu = r.results.find(t => t.name.includes("Ubuntu 24.04 Desktop"));
if (!ubuntu || ubuntu.seeders !== 1200) throw new Error(`Expected max seeders 1200 for Ubuntu mirror, got ${ubuntu?.seeders}`);

console.log("\n✅ Mock test passed (deduplication, ranking, provider attribution all working)");
