// BitSearch.to — public torrent search engine, scrape HTML results.
import { Provider, pack } from "./base.js";
import { get } from "../lib/fetch.js";
import { absURL, decodeHTML, stripHTML, parseCount, parseSize, cleanMagnet } from "../lib/util.js";

const BASE = "https://bitsearch.to";

export class BitSearch extends Provider {
  constructor() {
    super({
      id: "bitsearch",
      name: "BitSearch",
      url: BASE,
      categories: ["movies", "tv", "games", "music", "apps", "books", "anime", "other"],
      description: "Public torrent search engine. Aggregates results from many trackers.",
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
  // Each result is <li class="card search-result"> with magnet link inside
  const re = /<li[^>]+class="[^"]*search-result[^"]*"[\s\S]*?<\/li>/g;
  let m;
  while ((m = re.exec(html))) {
    const block = m[0];
    const titleMatch = block.match(/<h5[^>]+class="title"[^>]*>[\s\S]*?<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/);
    if (!titleMatch) continue;
    const detailsUrl = absURL(base, titleMatch[1]);
    const name = decodeHTML(stripHTML(titleMatch[2])).trim();
    const magnetMatch = block.match(/href=(["'])(magnet:\?[^"']+)\1/);
    const magnet = magnetMatch ? cleanMagnet(decodeHTML(magnetMatch[2])) : "";
    const sizeMatch = block.match(/<span[^>]+class="[^"]*length[^"]*"[^>]*>([\s\S]*?)<\/span>/);
    const size = sizeMatch ? stripHTML(sizeMatch[1]) : "";
    const seeders = parseCount(extract(block, /seed/i) || "0");
    const leechers = parseCount(extract(block, /leech/i) || "0");
    const date = extract(block, /date/i) || "";
    out.push({
      name, detailsUrl, magnet, torrentFile: "", size,
      sizeBytes: parseSize(size),
      seeders, leechers, completed: 0, date, category: "Other",
    });
    if (out.length >= 50) break;
  }
  return out;
}

function extract(block, classRe) {
  const re = new RegExp(`<div[^>]+class="[^"]*${classRe.source}[^"]*"[^>]*>([\\s\\S]*?)<\\/div>`, "i");
  const m = block.match(re);
  return m ? stripHTML(m[1]).trim() : "";
}
