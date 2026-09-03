// 1337x — one of the largest public torrent indexes. HTML-only, no API.
// We scrape the search results page and parse the result rows.
// Site is reachable via several mirror domains; we use the official one with
// automatic fallback to known proxies.
import { Provider, pack } from "./base.js";
import { get } from "../lib/fetch.js";
import { absURL, decodeHTML, stripHTML, parseCount, parseSize, cleanMagnet } from "../lib/util.js";

const PRIMARY = "https://1337x.to";
const MIRRORS = [
  "https://1337x.st",
  "https://x1337x.ws",
  "https://x1337x.eu",
  "https://x1337x.se",
];

export class X1337 extends Provider {
  constructor() {
    super({
      id: "1337x",
      name: "1337x",
      url: PRIMARY,
      categories: ["movies", "tv", "games", "music", "apps", "books", "anime", "documentaries", "other"],
      description: "General-purpose public torrent index. Movies, TV, games, music, apps.",
    });
  }

  async search(query, category = "all") {
    const catSlug = categoryMap[category] || "";
    const queryPath = encodeURIComponent(query);
    const searchPath = catSlug
      ? `/category-search/${queryPath}/${catSlug}/1/`
      : `/search/${queryPath}/1/`;
    const r = await get(PRIMARY + searchPath);
    if (!r) return pack([], this);
    // Try each mirror if primary failed
    let html = r.body;
    let base = PRIMARY;
    if (!html || /No results found|Cloudflare|Access Denied/i.test(html)) {
      for (const m of MIRRORS) {
        const r2 = await get(m + searchPath);
        if (r2 && r2.body && !/No results found|Cloudflare|Access Denied/i.test(r2.body)) {
          html = r2.body; base = m; break;
        }
      }
    }
    if (!html) return pack([], this);
    return pack(parseRows(html, base), this);
  }
}

function parseRows(html, base) {
  const out = [];
  // 1337x results: <tbody>...</tbody> with <tr class> rows. Each row has:
  //   <a href="/torrent/ID/NAME/">NAME</a>  in column 1
  //   <td class="coll-2 seeds">SEEDERS</td>   in column with "seeds" class
  //   <td class="coll-3 leeches">LEECHERS</td>
  //   <td class="coll-4 size">SIZE</td>     or "coll-date"
  //   <td class="coll-date">DATE</td>
  // We use a forgiving regex-based extraction that works even if the table structure varies.
  const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/g;
  let m;
  while ((m = rowRe.exec(html))) {
    const row = m[1];
    // Skip header rows
    if (/<th[\s>]/i.test(row)) continue;
    const nameMatch = row.match(/<a[^>]+href="\/torrent\/(\d+)\/([^"\/]+)\/"[^>]*>([^<]+)<\/a>/);
    if (!nameMatch) continue;
    const torrentId = nameMatch[1];
    const nameSlug = nameMatch[2];
    const name = decodeHTML(nameMatch[3]).trim();
    const detailsUrl = absURL(base, `/torrent/${torrentId}/${nameSlug}/`);
    const seeders = parseCount(extractCell(row, /seeds/i) || "0");
    const leechers = parseCount(extractCell(row, /leeches?|peers/i) || "0");
    const size = (extractCell(row, /size/i) || "").trim();
    const date = (extractCell(row, /date|uploaded/i) || "").trim();
    // Magnet / .torrent links are on the details page; we can also try the
    // download endpoint directly: /torrent/<id>/<slug>/download/
    const torrentFile = absURL(base, `/torrent/${torrentId}/${nameSlug}/download/`);
    out.push({
      name,
      detailsUrl,
      torrentFile,
      magnet: "", // populated on details if needed
      seeders,
      leechers,
      size,
      sizeBytes: parseSize(size),
      date,
      category: guessCategoryFromName(name),
    });
    if (out.length >= 50) break;
  }
  return out;
}

function extractCell(row, classRe) {
  const m = row.match(new RegExp(`<td[^>]+class="[^"]*${classRe.source}[^"]*"[^>]*>([\\s\\S]*?)<\/td>`, "i"));
  if (m) return stripHTML(m[1]);
  // Fallback: any cell containing the class name
  const m2 = row.match(new RegExp(`<td[^>]+class="[^"]*${classRe.source}[^"]*"[^>]*>([\\s\\S]*?)<\/td>`, "i"));
  if (m2) return stripHTML(m2[1]);
  return "";
}

const categoryMap = {
  movies: "Movies",
  tv: "TV",
  games: "Games",
  music: "Music",
  apps: "Apps",
  books: "Books",
  anime: "Anime",
  documentaries: "Documentaries",
  other: "Other",
};

function guessCategoryFromName(name) {
  const n = name.toLowerCase();
  if (/\b(season|s\d{1,2}e\d{1,2}|episode|complete)\b/.test(n)) return "TV";
  if (/\b(1080p|720p|2160p|4k|bluray|brrip|dvdrip|web-?rip|hdtv|cam|ts)\b/.test(n)) return "Movies";
  if (/\b(game|repack|fitgirl|skidrow|codex|plaza)\b/.test(n)) return "Games";
  if (/\b(flac|mp3|album|ost|single)\b/.test(n)) return "Music";
  if (/\b(linux|windows|mac|android|ios|crack|portable|keygen)\b/.test(n)) return "Apps";
  if (/\b(epub|mobi|pdf|azw3)\b/.test(n)) return "Books";
  if (/\b(anime|subbed|dubbed)\b/.test(n)) return "Anime";
  if (/\b(docu)\b/.test(n)) return "Documentaries";
  return "Other";
}
