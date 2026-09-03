// Knaben — meta-search engine that aggregates many torrent indexes
// (1337x, ThePirateBay, RarBG mirrors, Nyaa, etc.).
// We use the JSON-style search endpoint and parse the HTML response.
// Knaben's home: https://knaben.xyz/
import { Provider, pack } from "./base.js";
import { get } from "../lib/fetch.js";
import { decodeHTML, stripHTML, parseCount, parseSize, cleanMagnet, absURL } from "../lib/util.js";

const BASE = "https://knaben.xyz";

export class Knaben extends Provider {
  constructor() {
    super({
      id: "knaben",
      name: "Knaben",
      url: BASE,
      categories: ["movies", "tv", "games", "music", "apps", "anime", "books", "other"],
      description: "Meta-search across 1337x, TPB mirrors, Nyaa, RarBG, and more.",
    });
  }

  async search(query, category = "all") {
    // Knaben uses a simple GET search page; results are server-rendered HTML.
    const url = `${BASE}/search/${encodeURIComponent(query)}/`;
    const r = await get(url);
    if (!r || !r.body) return pack([], this);
    return pack(parseRows(r.body, r.finalUrl), this);
  }
}

function parseRows(html, base) {
  const out = [];
  // Knaben rows: <article class="search-result"> with:
  //   <h2 class="result-title"><a href="...">TITLE</a></h2>
  //   <div class="result-meta">SEEDERS · LEECHERS · SIZE · DATE</div>
  //   <a class="magnet" href="magnet:...">Magnet</a>
  //   <a class="dl" href="/download/...">.torrent</a>
  const re = /<article[^>]+class="search-result"[\s\S]*?<\/article>/g;
  let m;
  while ((m = re.exec(html))) {
    const block = m[0];
    const titleMatch = block.match(/<a[^>]+href="([^"]+)"[^>]*>([^<]+)<\/a>/);
    if (!titleMatch) continue;
    const detailsUrl = absURL(base, titleMatch[1]);
    const name = decodeHTML(titleMatch[2]).trim();
    const magnetMatch = block.match(/href=(["'])(magnet:\?[^"']+)\1/);
    const magnet = magnetMatch ? cleanMagnet(decodeHTML(magnetMatch[2])) : "";
    const dlMatch = block.match(/<a[^>]+class="dl"[^>]+href="([^"]+)"/);
    const torrentFile = dlMatch ? absURL(base, dlMatch[1]) : "";
    // Stats line
    const metaText = stripHTML(block.replace(/<[^>]+>/g, " | "));
    const seeders = parseCount(grabStat(metaText, /[▲↑]\s*([\d.KMkm]+)/) || "0");
    const leechers = parseCount(grabStat(metaText, /[▼↓]\s*([\d.KMkm]+)/) || "0");
    const size = grabStat(metaText, /Size\s*([\d.]+\s*[KMGT]?B)/i) || "";
    const date = grabStat(metaText, /(\d+\s*(?:min|hour|day|week|month|year)s?\s*ago)/i) || "";
    out.push({
      name, detailsUrl, magnet, torrentFile, size,
      sizeBytes: parseSize(size),
      seeders, leechers, completed: 0, date, category: "Other",
    });
    if (out.length >= 50) break;
  }
  return out;
}

function grabStat(text, re) {
  const m = text.match(re);
  return m ? m[1].trim() : "";
}
