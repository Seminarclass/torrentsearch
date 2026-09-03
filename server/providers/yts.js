// YTS — movie-focused torrent index. Has a public API we could use, but
// to keep with the "no third-party APIs" rule we scrape the HTML search
// results page (https://yts.mx/browse-movies/<query>).
import { Provider, pack } from "./base.js";
import { get } from "../lib/fetch.js";
import { absURL, decodeHTML, stripHTML, parseCount, parseSize } from "../lib/util.js";

const BASE = "https://yts.mx";

export class Yts extends Provider {
  constructor() {
    super({
      id: "yts",
      name: "YTS",
      url: BASE,
      categories: ["movies"],
      description: "Movie-focused torrent index. High-quality 720p/1080p/2160p releases.",
    });
  }

  async search(query, category = "all") {
    const url = `${BASE}/browse-movies/${encodeURIComponent(query)}`;
    const r = await get(url);
    if (!r) return pack([], this);
    return pack(parseMovies(r.body, r.finalUrl), this);
  }
}

function parseMovies(html, base) {
  const out = [];
  // Each movie card is an <div class="browse-movie-wrap"> with:
  //   <a href="/movies/..." class="browse-movie-link">
  //     <img class="img-responsive" src="...">
  //     ...
  //     <h4 class="browse-movie-title">TITLE (YEAR)</h4>
  //   </a>
  // Torrents for a movie are on the detail page; the listing shows movie-level
  // info. We emit one row per movie and resolve magnets from the details page
  // (best-effort) if the user opens the link.
  const re = /<div class="browse-movie-wrap">([\s\S]*?)<\/div>\s*<\/a>/g;
  let m;
  while ((m = re.exec(html))) {
    const block = m[1];
    const hrefMatch = block.match(/<a[^>]+href="([^"]+)"/);
    const titleMatch = block.match(/<h4[^>]+class="browse-movie-title"[^>]*>([^<]+)<\/h4>/);
    const yearMatch = block.match(/<div class="browse-movie-year">(\d{4})<\/div>/);
    if (!hrefMatch || !titleMatch) continue;
    const detailsUrl = absURL(base, hrefMatch[1]);
    const title = decodeHTML(titleMatch[1]).trim();
    const year = yearMatch ? yearMatch[1] : "";
    out.push({
      name: year ? `${title} (${year})` : title,
      detailsUrl,
      magnet: "", // requires details page
      torrentFile: "",
      size: "",
      sizeBytes: 0,
      seeders: 0,
      leechers: 0,
      completed: 0,
      date: "",
      category: "Movies",
    });
    if (out.length >= 30) break;
  }
  return out;
}
