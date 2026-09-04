// Orchestrator: runs all providers, deduplicates, ranks, and returns
// a unified list. Uses the magnet link (or info hash derived from it) as
// the canonical key so the same torrent across multiple providers is
// collapsed into a single result.
import { X1337 } from "../providers/1337x.js";
import { Nyaa } from "../providers/nyaa.js";
import { Yts } from "../providers/yts.js";
import { Knaben } from "../providers/knaben.js";
import { InternetArchive } from "../providers/archive.js";
import { BitSearch } from "../providers/bitsearch.js";
import { TokyoToshokan } from "../providers/tokyotoshokan.js";
import { TorrentDownload } from "../providers/torrentdownload.js";
import { AcademicTorrents } from "../providers/academictorrents.js";
import { LinuxTracker } from "../providers/linuxtracker.js";
import { Eztv } from "../providers/eztv.js";

const ALL_PROVIDERS = [
  // Free / always-accessible providers first (most reliable)
  AcademicTorrents,    // works from anywhere, clean JSON
  InternetArchive,     // public-domain content
  LinuxTracker,        // Linux ISOs
  Eztv,                // TV shows, JSON API
  // Often-blocked-by-datacenter providers (work from home IPs)
  Nyaa,                // anime, RSS
  Yts,                 // movies
  Knaben,              // meta-search
  BitSearch,           // meta-search
  TokyoToshokan,       // anime
  TorrentDownload,     // general
  X1337,               // general
];

let _instances = null;
export function getProviders() {
  if (_instances) return _instances;
  _instances = ALL_PROVIDERS.map((C) => new C());
  return _instances;
}

// Test hook: allows unit tests to inject mock providers. Production code
// should never call this; it's only used by server/test/*.js.
export function _setProvidersForTesting(instances) { _instances = instances; }

export function listProviderMeta() {
  return getProviders().map((p) => ({
    id: p.id,
    name: p.name,
    url: p.url,
    categories: p.categories,
    enabled: p.enabled,
    description: p.description,
  }));
}

// Run a search across all enabled providers in parallel. Each provider has
// a 12s hard timeout; we never wait for all — we return as soon as providers
// respond. The result is deduplicated by info hash and ranked.
export async function searchAll(query, { category = "all", limit = 80, timeoutMs = 12000 } = {}) {
  const providers = getProviders().filter((p) => p.enabled);
  const start = Date.now();
  const tasks = providers.map(async (p) => {
    const t0 = Date.now();
    try {
      const list = await raceWithTimeout(p.search(query, category), timeoutMs);
      return { provider: p, list, ok: true, ms: Date.now() - t0 };
    } catch (e) {
      return { provider: p, list: [], ok: false, error: String(e?.message || e), ms: Date.now() - t0 };
    }
  });
  const settled = await Promise.allSettled(tasks);
  const results = settled
    .filter((r) => r.status === "fulfilled")
    .map((r) => r.value);
  const errors = results.filter((r) => !r.ok);
  const all = results.flatMap((r) => r.list || []);

  // Deduplicate by info hash (from magnet). Items without magnet are kept by name+size.
  const byHash = new Map();
  const noHash = [];
  for (const t of all) {
    const hash = extractHash(t.magnet);
    if (hash) {
      if (!byHash.has(hash)) byHash.set(hash, t);
      else {
        // Prefer the entry with more metadata (magnet wins; if same, keep existing)
        const existing = byHash.get(hash);
        if (!existing.magnet && t.magnet) byHash.set(hash, { ...existing, ...t });
        else byHash.set(hash, { ...existing, ...t, seeders: Math.max(existing.seeders || 0, t.seeders || 0) });
      }
    } else {
      // Fall back to name+size key
      const key = (t.name + "|" + t.sizeBytes).toLowerCase();
      if (!byHash.has(key)) byHash.set(key, t);
      noHash.push(t);
    }
  }
  let merged = Array.from(byHash.values());
  // Sort: most seeders first, then by name
  merged.sort((a, b) => (b.seeders || 0) - (a.seeders || 0) || a.name.localeCompare(b.name));
  merged = merged.slice(0, limit);

  return {
    query,
    category,
    totalResults: merged.length,
    totalRaw: all.length,
    elapsedMs: Date.now() - start,
    providers: results.map((r) => ({
      id: r.provider.id,
      name: r.provider.name,
      count: (r.list || []).length,
      ok: r.ok,
      ms: r.ms,
      error: r.error || null,
    })),
    errors: errors.length,
    results: merged,
  };
}

function raceWithTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("timeout")), ms);
    promise.then(
      (v) => { clearTimeout(t); resolve(v); },
      (e) => { clearTimeout(t); reject(e); }
    );
  });
}

function extractHash(magnet) {
  if (!magnet) return "";
  const m = magnet.match(/xt=urn:btih:([a-fA-F0-9]{40})/i);
  return m ? m[1].toLowerCase() : "";
}
