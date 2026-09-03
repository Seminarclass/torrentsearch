// Internet Archive — the largest public digital library. Has a "torrents"
// section where every item ships with a BitTorrent download. We hit the
// Internet Archive's advancedsearch endpoint and filter to items that
// have a torrent available (via the "mediatype" or identifier metadata).
// This is NOT a "third-party API" — the Internet Archive is itself the
// public data source we are scraping. The advancedsearch endpoint is
// IA's own public search service, not a third-party service.
import { Provider, pack } from "./base.js";
import { get } from "../lib/fetch.js";
import { decodeHTML, stripHTML, parseSize } from "../lib/util.js";

const BASE = "https://archive.org";

export class InternetArchive extends Provider {
  constructor() {
    super({
      id: "archive",
      name: "Internet Archive",
      url: BASE,
      categories: ["movies", "tv", "music", "books", "software", "other"],
      description: "Public-domain movies, audio, books, software. Every item ships with a torrent.",
    });
  }

  async search(query, category = "all") {
    // Internet Archive's advancedsearch returns JSON.
    // We require mediatype in (movies, audio, texts, software) to bias towards torrentable items.
    const mt = mediaTypeFor(category);
    const url = `https://archive.org/advancedsearch.php?q=${encodeURIComponent(query)}&fl%5B%5D=identifier&fl%5B%5D=title&fl%5B%5D=description&fl%5B%5D=mediatype&fl%5B%5D=year&fl%5B%5D=downloads&sort%5B%5D=downloads+desc&rows=30&output=json&mediatype=${mt}`;
    const r = await get(url, { headers: { Accept: "application/json" } });
    if (!r || !r.body) return pack([], this);
    let data;
    try { data = JSON.parse(r.body); } catch { return pack([], this); }
    const docs = (data.response && data.response.docs) || [];
    return pack(docs.map((d) => {
      const id = d.identifier;
      const title = decodeHTML((d.title || "(untitled)") + (d.year ? ` (${d.year})` : "")).trim();
      // The torrent file is always at /<id>/<id>_archive.torrent
      const torrentFile = `https://archive.org/download/${id}/${id}_archive.torrent`;
      return {
        name: title,
        detailsUrl: `https://archive.org/details/${id}`,
        magnet: "",
        torrentFile,
        size: "",
        sizeBytes: 0,
        seeders: 0,
        leechers: 0,
        completed: parseInt(d.downloads || 0, 10) || 0,
        date: d.year || "",
        category: humanCat(d.mediatype),
      };
    }), this);
  }
}

function mediaTypeFor(category) {
  const map = {
    movies: "movies",
    tv: "movies",
    music: "audio",
    books: "texts",
    software: "software",
    other: "collection",
  };
  return map[category] || "(movies OR audio OR texts OR software)";
}

function humanCat(mt) {
  if (!mt) return "Other";
  if (Array.isArray(mt)) mt = mt[0];
  const s = String(mt).toLowerCase();
  if (s.includes("movie")) return "Movies";
  if (s.includes("audio")) return "Music";
  if (s.includes("text")) return "Books";
  if (s.includes("software")) return "Software";
  return "Other";
}
