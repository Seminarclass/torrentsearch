// Nyaa.si — anime-focused torrent index with a clean RSS / JSON-friendly site.
// We use the HTML search page (nyaa.si/?page=rss&q=...&c=...&f=0) and the
// regular HTML page for fallback. RSS is well-structured XML so this is the
// most reliable provider in the set.
import { Provider, pack } from "./base.js";
import { get } from "../lib/fetch.js";
import { decodeHTML, stripHTML, parseCount, parseSize } from "../lib/util.js";

const BASE = "https://nyaa.si";

export class Nyaa extends Provider {
  constructor() {
    super({
      id: "nyaa",
      name: "Nyaa",
      url: BASE,
      categories: ["anime"],
      description: "Anime-focused torrent index with magnet links. Anime, manga, drama.",
    });
  }

  async search(query, category = "all") {
    // Try the RSS feed first (most reliable)
    const rssUrl = `${BASE}/?page=rss&q=${encodeURIComponent(query)}&c=0_0&f=0`;
    const r = await get(rssUrl, { headers: { Accept: "application/rss+xml, application/xml, text/xml" } });
    if (r && r.body && r.body.startsWith("<?xml")) {
      return pack(parseRSS(r.body), this);
    }
    // Fall back to HTML page
    const htmlUrl = `${BASE}/?q=${encodeURIComponent(query)}&c=0_0&f=0`;
    const r2 = await get(htmlUrl);
    if (r2 && r2.body) {
      return pack(parseHTMLRows(r2.body), this);
    }
    return pack([], this);
  }

  async latest(category = "all") {
    // Latest torrents across all categories
    const r = await get(`${BASE}/?page=rss&q=&c=0_0&f=0`);
    if (r && r.body) return pack(parseRSS(r.body).slice(0, 30), this);
    return pack([], this);
  }
}

function parseRSS(xml) {
  const out = [];
  // Each <item> has: <title>, <link>, <guid isPermaLink="true">,
  // <pubDate>, <nyaa:category>, <nyaa:size>, <nyaa:seeders>, <nyaa:leechers>,
  // <nyaa:downloads>, <nyaa:infoHash>, <description>
  const itemRe = /<item>([\s\S]*?)<\/item>/g;
  let m;
  while ((m = itemRe.exec(xml))) {
    const block = m[1];
    const title = pick(block, "title");
    const link = pick(block, "link");
    const pubDate = pick(block, "pubDate");
    const size = pick(block, "nyaa:size");
    const seeders = parseCount(pick(block, "nyaa:seeders") || "0");
    const leechers = parseCount(pick(block, "nyaa:leechers") || "0");
    const downloads = parseCount(pick(block, "nyaa:downloads") || "0");
    const infoHash = pick(block, "nyaa:infoHash");
    const cat = pick(block, "nyaa:category");
    const desc = pick(block, "description");
    // Description often contains "Trusted" + a magnet link
    const magnetMatch = (desc || "").match(/href=(["'])(magnet:\?xt=urn:btih:[^"' >]+)\1/);
    const magnet = magnetMatch ? decodeHTML(magnetMatch[2]) : (infoHash ? `magnet:?xt=urn:btih:${infoHash}` : "");
    if (!title) continue;
    out.push({
      name: decodeHTML(title).trim(),
      detailsUrl: link ? link.trim() : "",
      magnet,
      size: size || "",
      sizeBytes: parseSize(size || ""),
      seeders, leechers, completed: downloads,
      date: pubDate || "",
      category: cat ? decodeHTML(cat).trim() : "Anime",
    });
  }
  return out;
}

function parseHTMLRows(html) {
  const out = [];
  // Nyaa HTML has a single <table class="torrent-list"> with <tbody> rows.
  const tbodyMatch = html.match(/<tbody>([\s\S]*?)<\/tbody>/);
  if (!tbodyMatch) return out;
  const tbody = tbodyMatch[1];
  const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/g;
  let m;
  while ((m = rowRe.exec(tbody))) {
    const row = m[1];
    if (/<th[\s>]/i.test(row)) continue;
    const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(x => stripHTML(x[1]).trim());
    // Standard Nyaa row: [category, name, link, size, date, seeders, leechers, downloads]
    if (cells.length < 7) continue;
    const [category, name, link, size, date, seeders, leechers, downloads] = cells;
    const detailsUrl = (row.match(/href="([^"]+view[^"]+)"/) || [])[1] || "";
    const infoHash = (row.match(/info[-_]?hash"?\s*[=:]\s*"?([a-fA-F0-9]{40})/i) || [])[1];
    const magnet = infoHash ? `magnet:?xt=urn:btih:${infoHash}` : "";
    out.push({
      name, detailsUrl, magnet, size,
      sizeBytes: parseSize(size),
      seeders: parseCount(seeders), leechers: parseCount(leechers),
      completed: parseCount(downloads), date, category: "Anime",
    });
  }
  return out;
}

function pick(block, tag) {
  // Support both <tag> and <ns:tag> forms.
  const re = new RegExp(`<(?:[a-z0-9-]+:)?${tag}[^>]*>([\\s\\S]*?)<\\/(?:[a-z0-9-]+:)?${tag}>`, "i");
  const m = block.match(re);
  if (m) return m[1].trim();
  // CDATA wrapper?
  const reC = new RegExp(`<(?:[a-z0-9-]+:)?${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/(?:[a-z0-9-]+:)?${tag}>`, "i");
  const m2 = block.match(reC);
  return m2 ? m2[1].trim() : "";
}
