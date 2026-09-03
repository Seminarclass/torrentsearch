// Common helpers used by all torrent providers.
// Pure stdlib, no third-party HTML parsers.
import { URL } from "node:url";

// Decode HTML entities (named + numeric). Minimal but covers the common cases.
const NAMED = {
  "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"',
  "&#39;": "'", "&apos;": "'", "&nbsp;": " ", "&copy;": "©",
  "&reg;": "®", "&trade;": "™", "&hellip;": "…", "&mdash;": "—",
  "&ndash;": "–", "&lsquo;": "‘", "&rsquo;": "’",
  "&ldquo;": "“", "&rdquo;": "”", "&middot;": "·", "&bull;": "•",
  "&deg;": "°", "&para;": "¶", "&euro;": "€", "&pound;": "£",
};
export function decodeHTML(s) {
  if (s == null) return "";
  return String(s)
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(parseInt(n, 10)))
    .replace(/&(amp|lt|gt|quot|#39|apos|nbsp|copy|reg|trade|hellip|mdash|ndash|lsquo|rsquo|ldquo|rdquo|middot|bull|deg|para|euro|pound);/g, (m) => NAMED[m] || m);
}

// Strip HTML tags and collapse whitespace. Used for free-text fields where we don't
// care about structure, only the text content (e.g. torrent descriptions).
export function stripHTML(s) {
  if (s == null) return "";
  return decodeHTML(String(s).replace(/<[^>]*>/g, "")).replace(/\s+/g, " ").trim();
}

// Truncate a string to max chars, with an ellipsis if cut.
export function truncate(s, max = 200) {
  if (!s) return "";
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

// Convert a free-form size string to bytes.
// Handles: "1.4 GB", "812 MiB", "700 MB", "1024", "1.2Kb" etc.
export function parseSize(s) {
  if (!s) return 0;
  const m = String(s).trim().match(/^([\d.,]+)\s*([a-zA-Z]+)?$/);
  if (!m) return 0;
  let n = parseFloat(m[1].replace(/,/g, ""));
  if (!isFinite(n)) return 0;
  const unit = (m[2] || "B").toUpperCase();
  const mult = {
    B: 1, KB: 1024, KIB: 1024, MB: 1024 ** 2, MIB: 1024 ** 2,
    GB: 1024 ** 3, GIB: 1024 ** 3, TB: 1024 ** 4, TIB: 1024 ** 4,
  }[unit];
  return mult ? Math.round(n * mult) : 0;
}

// Format a byte count into a short human-readable string. Used when the provider
// doesn't already give us a formatted size.
export function formatSize(bytes) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let n = bytes;
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(n >= 100 || i === 0 ? 0 : 1)} ${units[i]}`;
}

// Parse a "1.4K", "12.3K", "999" seeders/leechers count. Returns 0 on failure.
export function parseCount(s) {
  if (s == null) return 0;
  const m = String(s).trim().match(/^([\d.,]+)\s*([KkMm]?)$/);
  if (!m) return 0;
  let n = parseFloat(m[1].replace(/,/g, ""));
  if (!isFinite(n)) return 0;
  const mult = { "": 1, K: 1_000, k: 1_000, M: 1_000_000, m: 1_000_000 }[m[2]] || 1;
  return Math.round(n * mult);
}

// Normalize magnet links and torrent file URLs. Some sites return junk like
// "magnet:?xt=urn:btih:..." with embedded HTML; clean those up.
export function cleanMagnet(m) {
  if (!m) return "";
  // Drop everything after the first "xt=urn:btih:" payload that looks broken
  const out = m.replace(/&amp;/g, "&").replace(/&#[0-9]+;/g, "").trim();
  if (!out.startsWith("magnet:?")) return "";
  return out;
}

// Resolve a relative URL against a base. If url is already absolute, returns it.
export function absURL(base, url) {
  if (!url) return "";
  try { return new URL(url, base).toString(); } catch { return ""; }
}

// Common HTTP headers for scraping. Some torrent sites reject requests without
// a realistic User-Agent or Accept-Language.
export function browserHeaders(extra = {}) {
  return {
    "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate",
    "Cache-Control": "no-cache",
    ...extra,
  };
}

// Normalize a torrent result into the canonical shape consumed by the frontend.
export function normalizeTorrent(input) {
  return {
    name: String(input.name || "").trim(),
    magnet: cleanMagnet(input.magnet || ""),
    torrentFile: input.torrentFile || "",
    size: typeof input.size === "string" ? input.size : formatSize(input.size || 0),
    sizeBytes: typeof input.size === "number" ? input.size : parseSize(input.size || ""),
    seeders: Number(input.seeders) || 0,
    leechers: Number(input.leechers) || 0,
    completed: Number(input.completed) || 0,
    date: String(input.date || "").trim(),
    category: String(input.category || "").trim(),
    provider: String(input.provider || "").trim(),
    providerId: String(input.providerId || "").trim(),
    detailsUrl: String(input.detailsUrl || "").trim(),
    description: truncate(String(input.description || "").trim(), 400),
  };
}
