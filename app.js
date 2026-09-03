// TorrentSearch — pure vanilla JS, no framework, no build step.
// Two modes:
//   1. "live" — when a backend is reachable, queries it via /api/search
//   2. "cache" — when no backend, uses pre-built data/latest.json
// Status indicator in the topbar shows which mode is active.

(async () => {
  const html = document.documentElement;
  const savedTheme = localStorage.getItem('theme') || 'dark';
  html.setAttribute('data-theme', savedTheme);
  document.getElementById('themeToggle').addEventListener('click', () => {
    const next = html.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    html.setAttribute('data-theme', next);
    localStorage.setItem('theme', next);
  });

  // Inject keyframes
  const style = document.createElement('style');
  style.textContent = `@keyframes fadeUp { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }`;
  document.head.appendChild(style);

  // ----- Detect backend mode -----
  const state = {
    mode: 'cache',  // 'live' | 'cache'
    providers: [],
    latest: null,
    selectedCategory: 'all',
  };

  async function detectMode() {
    const dot = document.getElementById('statusDot');
    const text = document.getElementById('statusText');
    // Try backend on a few candidate URLs (self-hosted: /api, GH Pages: no backend)
    const candidates = [
      '/api/health',                          // same-origin (self-hosted)
      `${location.origin}/api/health`,         // explicit
    ];
    for (const url of candidates) {
      try {
        const r = await fetch(url, { cache: 'no-store' });
        if (r.ok) {
          const j = await r.json();
          state.providers = await fetchProviders();
          state.mode = 'live';
          dot.classList.add('live');
          text.textContent = `${j.providers} providers live`;
          return;
        }
      } catch {}
    }
    // Fall back to cache
    state.mode = 'cache';
    dot.classList.add('cache');
    text.textContent = 'cache mode';
  }

  async function fetchProviders() {
    try {
      const r = await fetch('/api/providers', { cache: 'no-store' });
      if (r.ok) return (await r.json()).providers || [];
    } catch {}
    return [];
  }

  // ----- Render provider list -----
  function renderProviders() {
    const grid = document.getElementById('providerGrid');
    const list = state.providers.length ? state.providers : (state.latest?.providers || FALLBACK_PROVIDERS);
    grid.innerHTML = list.map((p, i) => {
      const initial = (p.name || '?').charAt(0).toUpperCase();
      return `
        <div class="provider-card" style="animation: fadeUp .4s var(--ease) ${i * 0.03}s backwards">
          <div class="provider-head">
            <div class="provider-icon">${initial}</div>
            <div class="provider-name">${escapeHTML(p.name)}</div>
          </div>
          <div class="provider-desc">${escapeHTML(p.description || '')}</div>
          <div class="provider-tags">
            ${(p.categories || []).slice(0, 6).map(c => `<span class="tag">${escapeHTML(c)}</span>`).join('')}
            <a class="tag" href="${escapeHTML(p.url)}" target="_blank" rel="noopener" style="color: var(--accent)">${escapeHTML(p.url.replace(/^https?:\/\//, '').split('/')[0])}</a>
          </div>
        </div>
      `;
    }).join('');
    document.getElementById('statProviders').textContent = list.length;
  }

  const FALLBACK_PROVIDERS = [
    { id: '1337x', name: '1337x', url: 'https://1337x.to', categories: ['movies','tv','games','music','apps','books','anime'], description: 'General-purpose public torrent index.' },
    { id: 'nyaa', name: 'Nyaa', url: 'https://nyaa.si', categories: ['anime'], description: 'Anime-focused torrent index with magnet links.' },
    { id: 'yts', name: 'YTS', url: 'https://yts.mx', categories: ['movies'], description: 'Movie-focused torrent index. 720p/1080p/2160p.' },
    { id: 'knaben', name: 'Knaben', url: 'https://knaben.xyz', categories: ['movies','tv','games','music','apps','anime','books'], description: 'Meta-search across many torrent indexes.' },
    { id: 'archive', name: 'Internet Archive', url: 'https://archive.org', categories: ['movies','tv','music','books','software'], description: 'Public-domain movies, audio, books, software.' },
    { id: 'bitsearch', name: 'BitSearch', url: 'https://bitsearch.to', categories: ['movies','tv','games','music','apps','books','anime'], description: 'Public torrent search engine.' },
    { id: 'tokyotoshokan', name: 'TokyoToshokan', url: 'https://www.tokyotosho.info', categories: ['anime'], description: 'Japanese anime torrent index.' },
    { id: 'torrentdownload', name: 'TorrentDownload', url: 'https://www.torrentdownload.info', categories: ['movies','tv','games','music','apps','books'], description: 'Large general-purpose index.' },
  ];

  // ----- Search -----
  let searchSeq = 0;
  let lastTimer = null;
  async function runSearch(query, category) {
    if (!query.trim()) {
      renderEmpty();
      return;
    }
    const seq = ++searchSeq;
    document.getElementById('results').innerHTML = `<div class="empty"><div class="empty-icon">⏳</div><div class="empty-title">Searching…</div><div class="empty-sub">Querying providers in parallel</div></div>`;

    if (state.mode === 'live') {
      try {
        const params = new URLSearchParams({ q: query, category, limit: 80 });
        const r = await fetch(`/api/search?${params}`, { cache: 'no-store' });
        if (seq !== searchSeq) return; // stale
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const data = await r.json();
        renderResults(data);
      } catch (e) {
        if (seq !== searchSeq) return;
        renderEmpty(`Live search failed: ${e.message}. Try cache mode.`);
      }
    } else {
      // Cache mode: filter data/latest.json
      await loadCache();
      if (seq !== searchSeq) return;
      const data = searchCache(query, category);
      renderResults(data);
    }
  }

  async function loadCache() {
    if (state.latest) return;
    try {
      const r = await fetch('data/latest.json', { cache: 'no-store' });
      if (r.ok) {
        state.latest = await r.json();
        if (state.latest.providers) state.providers = state.latest.providers;
        if (state.latest.generatedAt) {
          const d = new Date(state.latest.generatedAt);
          document.getElementById('statUpdated').textContent = formatRelative(d);
        }
        document.getElementById('statQueries').textContent = (state.latest.queries || []).length;
      } else {
        state.latest = { results: [], providers: FALLBACK_PROVIDERS };
      }
    } catch {
      state.latest = { results: [], providers: FALLBACK_PROVIDERS };
    }
  }

  function searchCache(query, category) {
    const q = query.toLowerCase();
    const cat = category === 'all' ? null : category;
    const all = state.latest?.results || [];
    let matched = all.filter((t) => {
      if (!t.name) return false;
      if (!t.name.toLowerCase().includes(q)) return false;
      if (cat && t.category && t.category.toLowerCase() !== cat) return false;
      return true;
    });
    if (!matched.length) {
      // Fall back to any match ignoring category
      matched = all.filter((t) => t.name && t.name.toLowerCase().includes(q));
    }
    return {
      query,
      category,
      totalResults: matched.length,
      totalRaw: matched.length,
      elapsedMs: 0,
      providers: (state.latest?.providers || []).map((p) => ({ ...p, count: 0, ok: true, ms: 0 })),
      errors: 0,
      results: matched.slice(0, 80),
      cached: true,
    };
  }

  function renderResults(data) {
    const root = document.getElementById('results');
    if (!data.results || !data.results.length) {
      root.innerHTML = `
        <div class="empty">
          <div class="empty-icon">🔍</div>
          <div class="empty-title">No results for "${escapeHTML(data.query || '')}"</div>
          <div class="empty-sub">${data.cached ? 'Cache has no matching torrents. Try the live backend.' : 'Try a different query or check back later.'}</div>
        </div>
      `;
      return;
    }

    const meta = `
      <div class="results-meta">
        <span><strong>${data.totalResults}</strong> results</span>
        <span>in <strong>${data.elapsedMs}ms</strong></span>
        <span class="provider-stats">
          ${(data.providers || []).slice(0, 10).map(p => `<span class="provider-stat ${p.ok ? 'ok' : 'error'}" title="${escapeHTML(p.name || p.id)}${p.error ? ' — ' + escapeHTML(p.error) : ''}">${escapeHTML((p.name || p.id).slice(0, 8))}: ${p.count}</span>`).join('')}
        </span>
      </div>
    `;

    root.innerHTML = meta + data.results.map((t, i) => renderResult(t, i)).join('');
    // Bind action buttons
    root.querySelectorAll('[data-action="copy-magnet"]').forEach((btn) => {
      btn.addEventListener('click', () => copyMagnet(btn, btn.dataset.magnet));
    });
    root.querySelectorAll('[data-action="open"]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const url = btn.dataset.url;
        if (url) window.open(url, '_blank', 'noopener');
      });
    });
  }

  function renderResult(t, i) {
    const initial = (t.name || '?').charAt(0).toUpperCase();
    const size = t.size || '';
    const seeders = t.seeders || 0;
    const leechers = t.leechers || 0;
    const completed = t.completed || 0;
    const hasMagnet = !!t.magnet;
    const hasDetails = !!t.detailsUrl;
    return `
      <div class="result" style="animation-delay: ${Math.min(i * 0.02, 0.6)}s">
        <div class="provider-icon" style="width: 40px; height: 40px; font-size: 16px">${initial}</div>
        <div class="result-info">
          <div class="result-name" title="${escapeHTML(t.name)}">${escapeHTML(t.name)}</div>
          <div class="result-meta">
            ${size ? `<span class="badge">${escapeHTML(size)}</span>` : ''}
            ${seeders > 0 ? `<span class="seeders">▲ ${seeders.toLocaleString()}</span>` : ''}
            ${leechers > 0 ? `<span class="leechers">▼ ${leechers.toLocaleString()}</span>` : ''}
            ${completed > 0 ? `<span class="badge">${completed.toLocaleString()} dl</span>` : ''}
            ${t.date ? `<span>${escapeHTML(t.date.slice(0, 16))}</span>` : ''}
            ${t.category ? `<span class="badge">${escapeHTML(t.category)}</span>` : ''}
            ${t.provider ? `<span class="provider">via ${escapeHTML(t.provider)}</span>` : ''}
          </div>
        </div>
        <div class="result-actions">
          ${hasDetails ? `<a class="action-btn" href="${escapeHTML(t.detailsUrl)}" target="_blank" rel="noopener" data-url="${escapeHTML(t.detailsUrl)}" data-action="open">↗</a>` : ''}
          ${hasMagnet ? `<button class="action-btn primary" data-action="copy-magnet" data-magnet="${escapeHTML(t.magnet)}" title="Copy magnet link">⧉ Magnet</button>` : (t.torrentFile ? `<a class="action-btn primary" href="${escapeHTML(t.torrentFile)}" target="_blank" rel="noopener">.torrent</a>` : '<span class="action-btn" style="opacity:.5" title="No magnet available">—</span>')}
        </div>
      </div>
    `;
  }

  async function copyMagnet(btn, magnet) {
    try {
      await navigator.clipboard.writeText(magnet);
      const orig = btn.textContent;
      btn.textContent = '✓ Copied';
      btn.classList.add('copied');
      setTimeout(() => { btn.textContent = orig; btn.classList.remove('copied'); }, 1500);
    } catch (e) {
      // Fallback: select a hidden input
      const ta = document.createElement('textarea');
      ta.value = magnet;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
      btn.textContent = '✓ Copied';
      btn.classList.add('copied');
      setTimeout(() => { btn.textContent = '⧉ Magnet'; btn.classList.remove('copied'); }, 1500);
    }
  }

  function renderEmpty(subtext) {
    document.getElementById('results').innerHTML = `
      <div class="empty">
        <div class="empty-icon">🔍</div>
        <div class="empty-title">${subtext ? 'No results' : 'Search for a torrent'}</div>
        <div class="empty-sub">${subtext || 'Type a query above or press / to focus the search bar.'}</div>
        <div class="empty-hint">All searches are performed in your browser via the self-hosted backend, or fall back to the latest cached scrape from GitHub Actions.</div>
      </div>
    `;
  }

  function formatRelative(d) {
    const diff = (Date.now() - d.getTime()) / 1000;
    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  }

  function escapeHTML(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // ----- Wire up search inputs -----
  const big = document.getElementById('bigSearch');
  const top = document.getElementById('search');
  const catChips = document.getElementById('catChips');

  function debounce(fn, ms) {
    let t = null;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
  }
  const onInput = debounce((q) => runSearch(q, state.selectedCategory), 250);

  big.addEventListener('input', (e) => { top.value = e.target.value; onInput(e.target.value); });
  top.addEventListener('input', (e) => { big.value = e.target.value; onInput(e.target.value); });
  big.addEventListener('keydown', (e) => { if (e.key === 'Enter') onInput(e.target.value); });
  top.addEventListener('keydown', (e) => { if (e.key === 'Enter') onInput(e.target.value); });

  catChips.addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    catChips.querySelectorAll('.chip').forEach(c => c.classList.toggle('active', c === chip));
    state.selectedCategory = chip.dataset.cat;
    onInput(big.value || top.value);
  });

  document.addEventListener('keydown', (e) => {
    const tag = (e.target.tagName || '').toLowerCase();
    const isInput = ['input', 'textarea'].includes(tag);
    if (e.key === '/' && !isInput) { e.preventDefault(); big.focus(); big.select(); }
    if (e.key === 'Escape') { if (isInput) e.target.blur(); }
  });

  // ----- Init -----
  await detectMode();
  if (state.mode === 'cache') {
    await loadCache();
  }
  await renderProviders();
  if (state.latest) {
    document.getElementById('statUpdated').textContent = formatRelative(new Date(state.latest.generatedAt));
  }
})();
