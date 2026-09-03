// Provider interface — all providers export the same shape so the orchestrator
// can run them uniformly. Implementations are written by hand for each site we
// scrape; no third-party scraper libraries.
import { normalizeTorrent } from "../lib/util.js";

export class Provider {
  constructor(meta) {
    this.id = meta.id;             // short slug
    this.name = meta.name;         // display name
    this.url = meta.url;           // canonical homepage
    this.categories = meta.categories || ["all"];
    this.enabled = meta.enabled !== false;
    this.description = meta.description || "";
  }
  // Search for torrents. Return array of normalized Torrent objects.
  // Providers SHOULD return [] on failure, never throw.
  async search(_query, _category = "all") { return []; }
  // Optional: list latest torrents (used for the home page "trending" section).
  async latest(_category = "all") { return []; }
}

// Helper: wrap a list of raw objects in normalizeTorrent with this provider's metadata.
export function pack(rawList, provider) {
  return rawList.map((r) =>
    normalizeTorrent({ ...r, provider: provider.name, providerId: provider.id })
  );
}
