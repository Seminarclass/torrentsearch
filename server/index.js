// HTTP API: serves the frontend's search requests. The frontend on GitHub
// Pages calls this server to get live results.
import express from "express";
import cors from "cors";
import { searchAll, listProviderMeta } from "./lib/orchestrator.js";

const app = express();
app.use(cors());
app.use(express.json());

// Lightweight request log
app.use((req, _res, next) => {
  console.log(`[HTTP] ${req.method} ${req.url}`);
  next();
});

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, providers: listProviderMeta().length });
});

app.get("/api/providers", (_req, res) => {
  res.json({ providers: listProviderMeta() });
});

// Search endpoint: GET /api/search?q=ubuntu&category=movies&limit=40
app.get("/api/search", async (req, res) => {
  const q = String(req.query.q || "").trim();
  if (!q) return res.status(400).json({ error: "missing 'q' parameter" });
  const category = String(req.query.category || "all");
  const limit = Math.min(parseInt(req.query.limit, 10) || 80, 200);
  try {
    const r = await searchAll(q, { category, limit });
    res.json(r);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 404 fallback
app.use((_req, res) => res.status(404).json({ error: "not found" }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`\n🚀 TorrentSearch backend on http://0.0.0.0:${PORT}`);
  console.log(`   Providers: ${listProviderMeta().length}`);
  for (const p of listProviderMeta()) console.log(`     - ${p.name} (${p.url})`);
});
