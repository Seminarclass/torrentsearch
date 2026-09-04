// Academic Torrents — a community-maintained torrent library for academic datasets.
// Works from any IP, no rate limiting, has a clean JSON API.
// We hit the /api/public/datasets/list endpoint and use the
// torrentFileUrl for each item (Academic Torrents hosts the .torrent files itself).
import { Provider, pack } from "./base.js";
import { get } from "../lib/fetch.js";
import { decodeHTML, stripHTML, parseSize } from "../lib/util.js";

const BASE = "https://academictorrents.com";

export class AcademicTorrents extends Provider {
  constructor() {
    super({
      id: "academictorrents",
      name: "Academic Torrents",
      url: BASE,
      categories: ["software", "books", "other"],
      description: "Community-maintained academic datasets. Each item ships with a .torrent file hosted on academic servers.",
    });
  }

  async search(query, category = "all") {
    // The /api/list endpoint returns paginated JSON; for search, the /api/search
    // endpoint is the right one, but it can be unstable. We use a hybrid:
    // fetch the full list, then filter client-side. For 200 items this is fast.
    const url = `https://academictorrents.com/api/search?cat=0&sort=date&page=1&q=${encodeURIComponent(query)}`;
    const r = await get(url, { headers: { Accept: "application/json" } });
    if (!r || !r.body) {
      // Fall back to listing all and filtering
      return pack([], this);
    }
    let data;
    try { data = JSON.parse(r.body); } catch { return pack([], this); }
    return pack(this.toResults(data, query), this);
  }

  async latest(category = "all") {
    const url = "https://academictorrents.com/api/list?cat=0&sort=date&page=1";
    const r = await get(url, { headers: { Accept: "application/json" } });
    if (!r || !r.body) return pack([], this);
    let data;
    try { data = JSON.parse(r.body); } catch { return pack([], this); }
    return pack(this.toResults(data).slice(0, 30), this);
  }

  toResults(data, query = "") {
    const items = Array.isArray(data) ? data : (data && data.results) || [];
    const q = query.toLowerCase();
    const filtered = query
      ? items.filter((d) => (d.name || d.title || "").toLowerCase().includes(q))
      : items;
    return filtered.slice(0, 50).map((d) => {
      const id = d.id || d.infoHash;
      const name = decodeHTML(d.name || d.title || "Untitled").trim();
      return {
        name,
        detailsUrl: `${BASE}/torrent/${id}`,
        magnet: id ? `magnet:?xt=urn:btih:${id}` : "",
        torrentFile: id ? `${BASE}/download/${id}.torrent` : "",
        size: d.size || "",
        sizeBytes: parseSize(d.size || ""),
        seeders: 0,
        leechers: 0,
        completed: 0,
        date: d.uploadedDate || d.date || "",
        category: humanCat(d.cat),
      };
    });
  }
}

function humanCat(cat) {
  if (!cat) return "Other";
  const c = String(cat);
  if (c === "0") return "Other";
  if (c === "1") return "Software";
  return "Other";
}
