// Common HTTP fetch helper used by all providers.
// Uses node:https + zlib for transparent gzip/deflate decompression.
import http from "node:http";
import https from "node:https";
import zlib from "node:zlib";
import { URL } from "node:url";
import { browserHeaders } from "./util.js";

const UA = browserHeaders()["User-Agent"];

function pick(url) { return url.startsWith("https:") ? https : http; }

export async function fetchHTML(url, { timeout = 15000, headers = {}, maxRedirects = 5 } = {}) {
  return new Promise((resolve, reject) => {
    let redirects = 0;
    const go = (target) => {
      let u;
      try { u = new URL(target); } catch (e) { return reject(new Error(`bad url: ${target}`)); }
      const lib = pick(u.protocol);
      const req = lib.get(u, {
        timeout,
        headers: {
          "User-Agent": UA,
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
          "Accept-Encoding": "gzip, deflate, br",
          ...headers,
        },
      }, (res) => {
        if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
          res.resume();
          if (++redirects > maxRedirects) return reject(new Error("too many redirects"));
          const next = new URL(res.headers.location, target).toString();
          return go(next);
        }
        const chunks = [];
        const stream = res;
        const enc = (res.headers["content-encoding"] || "").toLowerCase();
        let decoder = stream;
        if (enc === "gzip") decoder = stream.pipe(zlib.createGunzip());
        else if (enc === "deflate") decoder = stream.pipe(zlib.createInflate());
        else if (enc === "br") decoder = stream.pipe(zlib.createBrotliDecompress());
        decoder.on("data", (c) => chunks.push(c));
        decoder.on("end", () => {
          const body = Buffer.concat(chunks).toString("utf8");
          resolve({ status: res.statusCode, headers: res.headers, body, finalUrl: target });
        });
        decoder.on("error", reject);
        res.on("error", reject);
      });
      req.on("timeout", () => { req.destroy(new Error("timeout")); });
      req.on("error", reject);
    };
    go(url);
  });
}

// Convenience: return null on failure so providers can chain `?` cleanly.
export async function get(url, opts) {
  try { return await fetchHTML(url, opts); } catch { return null; }
}
