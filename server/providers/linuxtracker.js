// LinuxTracker — public BitTorrent tracker for Linux ISOs and distros.
// Works from any IP, plain HTML, no rate limit.
import { Provider, pack } from "./base.js";
import { get } from "../lib/fetch.js";
import { absURL, decodeHTML, stripHTML, parseCount, parseSize, cleanMagnet } from "../lib/util.js";

const BASE = "https://linuxtracker.org";

export class LinuxTracker extends Provider {
  constructor() {
    super({
      id: "linuxtracker",
      name: "LinuxTracker",
      url: BASE,
      categories: ["apps", "other"],
      description: "Public BitTorrent tracker for Linux distributions and open-source ISOs.",
    });
  }

  async search(query, category = "all") {
    const url = `${BASE}/?search=${encodeURIComponent(query)}&cat=0`;
    const r = await get(url);
    if (!r || !r.body) return pack([], this);
    return pack(parseRows(r.body, r.finalUrl), this);
  }
}

function parseRows(html, base) {
  const out = [];
  // LinuxTracker is a TBDEV-style site. Each torrent row is a <tr> with a name link
  // and a download link.
  const re = /<tr[^>]*class="[^"]*torrent[^"]*"[\s\S]*?<\/tr>/g;
  let m;
  while ((m = re.exec(html))) {
    const row = m[0];
    const nameMatch = row.match(/<td[^>]*class="[^"]*name[^"]*"[^>]*>[\s\S]*?<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/);
    if (!nameMatch) continue;
    const detailsUrl = absURL(base, nameMatch[1]);
    const name = decodeHTML(stripHTML(nameMatch[2])).trim();
    const dlMatch = row.match(/href="([^"]*download\.php\?id=\d+[^"]*)"/);
    const torrentFile = dlMatch ? absURL(base, dlMatch[1]) : "";
    const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(x => stripHTML(x[1]).trim());
    // Approximate: [category, name, comments, size, seeds, leech, uploaded, dl]
    const size = cells[3] || "";
    const seeders = parseCount(cells[4] || "0");
    const leechers = parseCount(cells[5] || "0");
    const date = cells[6] || "";
    out.push({
      name, detailsUrl, magnet: "", torrentFile, size,
      sizeBytes: parseSize(size),
      seeders, leechers, completed: 0, date, category: "Software",
    });
    if (out.length >= 50) break;
  }
  return out;
}
