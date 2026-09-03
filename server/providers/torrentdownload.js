// TorrentDownload.info — large general-purpose index. HTML-only.
import { Provider, pack } from "./base.js";
import { get } from "../lib/fetch.js";
import { absURL, decodeHTML, stripHTML, parseCount, parseSize, cleanMagnet } from "../lib/util.js";

const BASE = "https://www.torrentdownload.info";

export class TorrentDownload extends Provider {
  constructor() {
    super({
      id: "torrentdownload",
      name: "TorrentDownload",
      url: BASE,
      categories: ["movies", "tv", "games", "music", "apps", "books", "other"],
      description: "Large general-purpose torrent index.",
    });
  }

  async search(query, category = "all") {
    const url = `${BASE}/search?q=${encodeURIComponent(query)}`;
    const r = await get(url);
    if (!r || !r.body) return pack([], this);
    return pack(parseRows(r.body, r.finalUrl), this);
  }
}

function parseRows(html, base) {
  const out = [];
  // Table-based layout: each row is a <tr> with name link + size + seeds + leech.
  const tbody = html.match(/<table[^>]+class="table2"[^>]*>([\s\S]*?)<\/table>/);
  const haystack = tbody ? tbody[1] : html;
  const re = /<tr[^>]*>([\s\S]*?)<\/tr>/g;
  let m;
  while ((m = re.exec(haystack))) {
    const row = m[1];
    if (/<th[\s>]/i.test(row)) continue;
    const nameMatch = row.match(/<td[^>]*>\s*<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/);
    if (!nameMatch) continue;
    const detailsUrl = absURL(base, nameMatch[1]);
    const name = decodeHTML(stripHTML(nameMatch[2])).trim();
    const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(x => stripHTML(x[1]).trim());
    // Layout: [icon, name, comments, size, seeds, leech, uploaded]
    const size = cells[3] || "";
    const seeders = parseCount(cells[4] || "0");
    const leechers = parseCount(cells[5] || "0");
    const date = cells[6] || "";
    out.push({
      name, detailsUrl, magnet: "", torrentFile: "", size,
      sizeBytes: parseSize(size),
      seeders, leechers, completed: 0, date, category: "Other",
    });
    if (out.length >= 50) break;
  }
  return out;
}
