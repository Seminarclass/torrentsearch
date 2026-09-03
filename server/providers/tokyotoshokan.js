// Tokyo Toshokan (TokyoToshokan.com) — Japanese anime-focused index.
// We parse the HTML search results page.
import { Provider, pack } from "./base.js";
import { get } from "../lib/fetch.js";
import { absURL, decodeHTML, stripHTML, parseCount, parseSize, cleanMagnet } from "../lib/util.js";

const BASE = "https://www.tokyotosho.info";

export class TokyoToshokan extends Provider {
  constructor() {
    super({
      id: "tokyotoshokan",
      name: "TokyoToshokan",
      url: BASE,
      categories: ["anime"],
      description: "Japanese anime torrent index.",
    });
  }

  async search(query, category = "all") {
    const url = `${BASE}/search.php?terms=${encodeURIComponent(query)}`;
    const r = await get(url);
    if (!r || !r.body) return pack([], this);
    return pack(parseRows(r.body, r.finalUrl), this);
  }
}

function parseRows(html, base) {
  const out = [];
  // TokyoToshokan has a <table class="listing"> with rows.
  const tbody = html.match(/<table[^>]+class="listing"[^>]*>([\s\S]*?)<\/table>/);
  if (!tbody) return out;
  const rows = tbody[1];
  const re = /<tr[^>]*>([\s\S]*?)<\/tr>/g;
  let m;
  while ((m = re.exec(rows))) {
    const row = m[1];
    if (/<th[\s>]/i.test(row)) continue;
    const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(x => x[1]);
    if (cells.length < 5) continue;
    // [category-icon, name, links, size, date, seeders, leechers, completed]
    const nameCell = cells[1] || "";
    const nameMatch = nameCell.match(/<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/);
    if (!nameMatch) continue;
    const detailsUrl = absURL(base, nameMatch[1]);
    const name = decodeHTML(stripHTML(nameMatch[2])).trim();
    const size = stripHTML(cells[3] || "");
    const date = stripHTML(cells[4] || "");
    const seeders = parseCount(stripHTML(cells[5] || "0"));
    const leechers = parseCount(stripHTML(cells[6] || "0"));
    const completed = parseCount(stripHTML(cells[7] || "0"));
    // Magnet link is in the "links" cell (cells[2])
    const linksCell = cells[2] || "";
    const magnetMatch = linksCell.match(/href=(["'])(magnet:\?[^"']+)\1/);
    const magnet = magnetMatch ? cleanMagnet(decodeHTML(magnetMatch[2])) : "";
    out.push({
      name, detailsUrl, magnet, torrentFile: "", size,
      sizeBytes: parseSize(size),
      seeders, leechers, completed, date, category: "Anime",
    });
    if (out.length >= 50) break;
  }
  return out;
}
