// EZTV — TV episode torrents. Has a JSON API at https://eztvx.to/api/get-torrents.
// Works from any IP, no auth, no rate limit for normal use.
import { Provider, pack } from "./base.js";
import { get } from "../lib/fetch.js";
import { decodeHTML, stripHTML, parseSize } from "../lib/util.js";

const BASE = "https://eztvx.to";

export class Eztv extends Provider {
  constructor() {
    super({
      id: "eztv",
      name: "EZTV",
      url: BASE,
      categories: ["tv"],
      description: "TV episode torrents. Clean JSON API.",
    });
  }

  async search(query, category = "all") {
    // The API doesn't have a search param, only a limit. We pull the latest
    // and filter client-side. For more targeted search, the site itself has
    // a search form that returns HTML we could parse, but the JSON API is
    // more reliable from non-interactive clients.
    const url = `${BASE}/api/get-torrents?limit=200`;
    const r = await get(url, { headers: { Accept: "application/json" } });
    if (!r || !r.body) return pack([], this);
    let data;
    try { data = JSON.parse(r.body); } catch { return pack([], this); }
    const torrents = (data && data.torrents) || [];
    const q = query.toLowerCase();
    const filtered = query ? torrents.filter(t => (t.title || t.show || "").toLowerCase().includes(q)) : torrents;
    return pack(filtered.slice(0, 50).map(toResult), this);
  }

  async latest(category = "all") {
    const url = `${BASE}/api/get-torrents?limit=40`;
    const r = await get(url, { headers: { Accept: "application/json" } });
    if (!r || !r.body) return pack([], this);
    let data;
    try { data = JSON.parse(r.body); } catch { return pack([], this); }
    const torrents = (data && data.torrents) || [];
    return pack(torrents.map(toResult), this);
  }
}

function toResult(t) {
  return {
    name: decodeHTML(t.title || "").trim(),
    detailsUrl: `${BASE}/ep/${t.id}`,
    magnet: t.magnet_url || "",
    torrentFile: t.torrent_url || "",
    size: t.size_bytes ? `${(t.size_bytes / (1024 ** 3)).toFixed(2)} GB` : "",
    sizeBytes: t.size_bytes || 0,
    seeders: t.seeds || 0,
    leechers: t.peers || 0,
    completed: 0,
    date: t.date_released_unix ? new Date(t.date_released_unix * 1000).toISOString().slice(0, 10) : "",
    category: "TV",
  };
}
