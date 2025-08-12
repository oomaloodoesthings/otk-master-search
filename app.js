// Clean app.js with: chunked loading, filters, stat sorting (AC special), indicator, reset, theme, debug, infinite scroll, 20-per page
const state = {
  items: [],
  filtered: [],
  sortKey: 'name',
  sortDir: 'asc',
  statKey: null,
  page: 1,
  pageSize: 20
};

const els = {
  q: null, categories: [], paths: [], tiers: [],
  tableBody: null, resultsInfo: null, loadStatus: null,
  exportJson: null, exportCsv: null,
  themeToggle: null, resetBtn: null, sortedIndicator: null,
  debugToggle: null, debugPanel: null, debugLog: null, debugCopy: null, debugClear: null, debugMeta: null,
  sentinel: null
};

function setLoadStatus(msg){ if (els.loadStatus) els.loadStatus.textContent = msg; }
function dbg(msg, obj){
  try { const line = (obj!==undefined) ? msg + ' ' + JSON.stringify(obj) : msg;
        if (els.debugLog){ els.debugLog.textContent += line + '\n'; } }
  catch(e){ if (els.debugLog){ els.debugLog.textContent += msg + ' [unserializable]\n'; } }
}
function setDebugMeta(){
  if (!els.debugMeta) return;
  const selCats = Array.from(document.querySelectorAll('input[name="category"]:checked')).map(x=>x.value);
  const selPaths = Array.from(document.querySelectorAll('input[name="path"]:checked')).map(x=>x.value);
  const selTiers = Array.from(document.querySelectorAll('input[name="tier"]:checked')).map(x=>x.value);
  els.debugMeta.textContent = `items:${state.items.length} filtered:${state.filtered.length} sort:${state.sortKey}${state.statKey?'/'+state.statKey:''} dir:${state.sortDir} page:${state.page} size:${state.pageSize} | cats:${selCats.join(',')} paths:${selPaths.join(',')} tiers:${selTiers.join(',')}`;
}

function escapeHtml(s) { return String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
function inferCategory(item){
  const slot = (item.slot||'').toString().toLowerCase();
  const cat = (item.category||'').toString().toLowerCase();
  if (cat) return cat;
  if (['hand','head','helm','shield','subaccessory','armor','weapon','item'].includes(slot)) return slot;
  return 'item';
}

async function loadManifest() {
  setLoadStatus('Loading manifest…');
  dbg('loadManifest: start');
  const res = await fetch('data/manifest.json', {cache: 'no-store'});
  if (!res.ok) { setLoadStatus('Failed to load data/manifest.json'); dbg('manifest fetch failed', {status: res.status}); throw new Error('Failed to load data/manifest.json'); }
  const manifest = await res.json();
  dbg('loadManifest: ok', manifest);
  return manifest.files || [];
}

async function loadChunks(files) {
  setLoadStatus(`Loading ${files.length} data file(s)…`);
  dbg('loadChunks: files', files);
  const all = [];
  for (const file of files) {
    const res = await fetch('data/' + file, {cache: 'no-store'});
    if (!res.ok) {
      console.warn('Missing chunk:', file);
      setLoadStatus(`Missing chunk: ${file}`);
      dbg('missing chunk', {file, status: res.status});
      continue;
    }
    const json = await res.json();
    dbg('chunk loaded', {file, count: Array.isArray(json.items)? json.items.length : 0});
    if (Array.isArray(json.items)) all.push(...json.items);
  }
  return all;
}

function initEls() {
  els.q = document.querySelector('#q');
  els.categories = Array.from(document.querySelectorAll('input[name="category"]'));
  els.paths = Array.from(document.querySelectorAll('input[name="path"]'));
  els.tiers = Array.from(document.querySelectorAll('input[name="tier"]'));
  els.tableBody = document.querySelector('#results tbody');
  els.resultsInfo = document.querySelector('#results-info');
  els.loadStatus = document.querySelector('#load-status');
  els.exportJson = document.querySelector('#export-json');
  els.exportCsv = document.querySelector('#export-csv');
  els.themeToggle = document.querySelector('#theme-toggle');
  els.resetBtn = document.querySelector('#reset-filters');
  els.sortedIndicator = document.querySelector('#sorted-indicator');
  els.debugToggle = document.querySelector('#debug-toggle');
  els.debugPanel = document.querySelector('#debug-panel');
  els.debugLog = document.querySelector('#debug-log');
  els.debugCopy = document.querySelector('#debug-copy');
  els.debugClear = document.querySelector('#debug-clear');
  els.debugMeta = document.querySelector('#debug-meta');
  els.sentinel = document.querySelector('#scroll-sentinel');
}

function setTheme(mode){
  const root = document.documentElement;
  root.classList.toggle('theme-light', mode === 'light');
  localStorage.setItem('otk_theme', mode);
  if (els.themeToggle) els.themeToggle.textContent = (mode === 'light') ? 'Light mode' : 'Dark mode';
}
function getTheme(){
  const saved = localStorage.getItem('otk_theme');
  if (saved === 'light' || saved === 'dark') return saved;
  return 'dark';
}

function normalize(item) {
  return {
    id: item.id || crypto.randomUUID(),
    name: item.name || '',
    category: (item.category || inferCategory(item)).toLowerCase(),
    path: Array.isArray(item.path) ? item.path.map(p=>String(p).toLowerCase()) : (item.path ? [String(item.path).toLowerCase()] : []),
    level_tier: (item.level_tier || '').toString().toLowerCase(),
    stats: item.stats || {},
    enchants: item.enchants || [],
    info: item.info || '',
    obtain: item.obtain || []
  };
}

function applyFilters() {
  const q = els.q.value.trim().toLowerCase();
  const checkedPaths = new Set(els.paths.filter(p=>p.checked).map(p=>p.value));
  const checkedCats = new Set(els.categories.filter(c=>c.checked).map(c=>c.value));
  const checkedTiers = new Set(els.tiers.filter(t=>t.checked).map(t=>t.value));

  state.filtered = state.items.filter(it => {
    const nameHit = q === '' || it.name.toLowerCase().includes(q);
    if (!nameHit) return false;
    const catHit = checkedCats.size === 0 || checkedCats.has(it.category || inferCategory(it));
    if (!catHit) return false;
    const pathHit = it.path.length === 0 || it.path.some(p => checkedPaths.has(p));
    if (!pathHit) return false;
    const tierHit = checkedTiers.size === 0 || checkedTiers.has((it.level_tier || '').toLowerCase());
    return tierHit;
  });

  state.page = 1;
  sortData();
  render();
}

function sortData() {
  const { sortKey, sortDir } = state;
  const dir = sortDir === 'asc' ? 1 : -1;

  if (sortKey === 'stat') {
    const key = state.statKey || '';
    state.filtered.sort((a, b) => {
      const av = Number(a.stats?.[key] ?? (key === 'AC' ? 9999 : -9999));
      const bv = Number(b.stats?.[key] ?? (key === 'AC' ? 9999 : -9999));
      if (key === 'AC') {
        if (av < bv) return -1;
        if (av > bv) return 1;
        return 0;
      }
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });
    return;
  }

  state.filtered.sort((a, b) => {
    let va = a[sortKey], vb = b[sortKey];
    if (sortKey === 'stats') {
      va = Object.entries(va).map(([k,v])=>k+':'+v).join('|');
      vb = Object.entries(vb).map(([k,v])=>k+':'+v).join('|');
    } else if (sortKey === 'enchants' || sortKey === 'path' || sortKey === 'obtain') {
      va = (va || []).join('|');
      vb = (vb || []).join('|');
    } else {
      va = va ?? ''; vb = vb ?? '';
    }
    va = va.toString().toLowerCase();
    vb = vb.toString().toLowerCase();
    if (va < vb) return -1 * dir;
    if (va > vb) return 1 * dir;
    return 0;
  });
}

function render() {
  const total = state.filtered.length;
  const visibleCount = Math.min(total, state.page * state.pageSize);
  els.resultsInfo.textContent = `${visibleCount} of ${total} result${total === 1 ? '' : 's'}`;

  const subset = state.filtered.slice(0, visibleCount);
  const rows = subset.map(it => {
    const stats = Object.entries(it.stats).map(([k,v]) => {
      const kStr = String(k);
      const vStr = String(v);
      const isActive = (state.sortKey === 'stat' && state.statKey === kStr);
      const cls = 'stat' + (isActive ? ' active' : '');
      return `<span class="${cls}" data-stat="${escapeHtml(kStr)}" data-value="${escapeHtml(vStr)}">${escapeHtml(kStr)}: ${escapeHtml(vStr)}</span>`;
    }).join('');
    const ench = (it.enchants || []).map(e => `<span class="badge">${escapeHtml(String(e))}</span>`).join('');
    const path = (it.path || []).map(p => `<span class="badge">${escapeHtml(String(p))}</span>`).join('');
    const obtain = (it.obtain || []).map(o => `<div>${escapeHtml(String(o))}</div>`).join('');

    return `<tr>
      <td>${escapeHtml(it.name)}</td>
      <td>${escapeHtml(it.category || inferCategory(it))}</td>
      <td>${path}</td>
      <td>${escapeHtml(it.level_tier)}</td>
      <td class="stats">${stats}</td>
      <td class="enchants">${ench}</td>
      <td class="info">${escapeHtml(it.info)}</td>
      <td class="obtain">${obtain}</td>
    </tr>`;
  }).join('');

  els.tableBody.innerHTML = rows || `<tr><td colspan="8" class="muted">No results.</td></tr>`;
  updateSortedIndicator();
  setDebugMeta();
}

function updateSortedIndicator(){
  if (state.sortKey === 'stat' && state.statKey){
    const dir = (state.statKey === 'AC') ? 'asc' : state.sortDir;
    const arrow = dir === 'asc' ? '↑' : '↓';
    els.sortedIndicator.textContent = `Sorted by ${state.statKey} ${arrow}`;
  } else if (state.sortKey && state.sortKey !== 'name') {
    const arrow = state.sortDir === 'asc' ? '↑' : '↓';
    els.sortedIndicator.textContent = `Sorted by ${state.sortKey} ${arrow}`;
  } else {
    els.sortedIndicator.textContent = '';
  }
}

let io;
function setupInfiniteScroll(){
  if (!els.sentinel) return;
  if (io && io.disconnect) io.disconnect();
  io = new IntersectionObserver((entries) => {
    if (!entries.some(e => e.isIntersecting)) return;
    const total = state.filtered.length;
    const visible = Math.min(total, state.page * state.pageSize);
    if (visible < total){
      state.page += 1;
      render();
    }
  }, { root: null, rootMargin: '0px 0px 300px 0px' });
  io.observe(els.sentinel);
}

function bind() {
  // Search (debounced)
  let t;
  els.q.addEventListener('input', () => { clearTimeout(t); t = setTimeout(applyFilters, 120); });

  // Filters
  els.categories.forEach(c => c.addEventListener('change', applyFilters));
  els.paths.forEach(p => p.addEventListener('change', applyFilters));
  els.tiers.forEach(t => t.addEventListener('change', applyFilters));

  // Sorting via headers
  document.querySelectorAll('#results thead th').forEach(th => {
    th.addEventListener('click', () => {
      const key = th.dataset.key;
      if (state.sortKey === key) {
        state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
      } else {
        state.sortKey = key;
        state.sortDir = 'asc';
      }
      state.page = 1;
      sortData();
      render();
    });
  });

  // Stat click sorting with shift reverse
  document.querySelector('#results').addEventListener('click', (e) => {
    const el = e.target.closest('.stat');
    if (!el) return;
    const key = el.getAttribute('data-stat');
    if (state.sortKey === 'stat' && state.statKey === key && !e.shiftKey) {
      state.sortKey = 'name';
      state.sortDir = 'asc';
      state.statKey = null;
    } else {
      state.sortKey = 'stat';
      state.statKey = key;
      state.sortDir = (key === 'AC') ? 'asc' : 'desc';
      if (e.shiftKey) state.sortDir = (state.sortDir === 'asc') ? 'desc' : 'asc';
    }
    state.page = 1;
    sortData();
    render();
  });

  // Export
  els.exportJson.addEventListener('click', () => {
    const blob = new Blob([JSON.stringify({items: state.filtered}, null, 2)], {type: 'application/json'});
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'filtered-items.json'; a.click(); URL.revokeObjectURL(a.href);
  });
  els.exportCsv.addEventListener('click', () => {
    const headers = ['name','category','path','level_tier','stats','enchants','info','obtain'];
    const lines = [headers.join(',')];
    for (const it of state.filtered) {
      const row = [
        it.name,
        it.category,
        (it.path || []).join('; '),
        it.level_tier,
        Object.entries(it.stats).map(([k,v])=>`${k}:${v}`).join('; '),
        (it.enchants || []).join('; '),
        (it.info || '').replace(/\n/g,' '),
        (it.obtain || []).join(' | ')
      ].map(v => '"' + String(v).replace(/"/g,'""') + '"');
      lines.push(row.join(','));
    }
    const blob = new Blob([lines.join('\n')], {type: 'text/csv'});
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'filtered-items.csv'; a.click(); URL.revokeObjectURL(a.href);
  });

  // Theme toggle
  if (els.themeToggle){
    els.themeToggle.addEventListener('click', () => {
      const next = (getTheme() === 'dark') ? 'light' : 'dark';
      setTheme(next);
    });
  }

  // Reset filters
  els.resetBtn.addEventListener('click', () => {
    els.q.value = '';
    els.categories.forEach(c => c.checked = true);
    els.paths.forEach(p => p.checked = true);
    els.tiers.forEach(t => t.checked = true);
    state.sortKey = 'name'; state.sortDir = 'asc'; state.statKey = null;
    applyFilters();
  });

  // Debug panel
  if (els.debugToggle && els.debugPanel){
    els.debugToggle.addEventListener('click', () => {
      els.debugPanel.classList.toggle('hidden');
      setDebugMeta();
    });
  }
  if (els.debugCopy && els.debugLog){
    els.debugCopy.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(els.debugLog.textContent || ''); } catch(e) {}
    });
  }
  if (els.debugClear && els.debugLog){
    els.debugClear.addEventListener('click', () => { els.debugLog.textContent=''; });
  }
}


// --- Changelog UI (toggleable, persists in localStorage) ---
function ensureChangelogUI() {
  if (document.getElementById('otk-changelog-style')) return; // already added

  const style = document.createElement('style');
  style.id = 'otk-changelog-style';
  style.textContent = `
#changelog-toggle {
  position: fixed; right: 16px; bottom: 16px; z-index: 10000;
  padding: 10px 14px; border-radius: 999px; border: 1px solid rgba(127,127,127,.25);
  background: var(--panel-bg, #111827); color: var(--fg, #f3f4f6); cursor: pointer;
  box-shadow: 0 8px 20px rgba(0,0,0,.25);
}
:root[data-theme="light"] #changelog-toggle { background: #fff; color: #111827; border-color: rgba(0,0,0,.15); }

#changelog-panel {
  position: fixed; right: 16px; bottom: 64px; width: min(520px, calc(100vw - 32px));
  max-height: min(70vh, 680px); overflow: hidden; z-index: 10000;
  background: var(--panel-bg, #0b1220); color: var(--fg, #f3f4f6);
  border: 1px solid rgba(127,127,127,.25); border-radius: 16px;
  box-shadow: 0 16px 36px rgba(0,0,0,.35); display: none;
}
:root[data-theme="light"] #changelog-panel { background: #ffffff; color: #111827; border-color: rgba(0,0,0,.15); }
#changelog-panel.visible { display: grid; grid-template-rows: auto 1fr auto; }

#chg-header { display:flex; align-items:center; justify-content: space-between; padding: 10px 12px; border-bottom: 1px solid rgba(127,127,127,.2); }
#chg-header h3 { margin: 0; font-size: 15px; }
#chg-body { overflow: auto; padding: 10px 12px; }
#chg-list { display: grid; gap: 10px; }
.chg-item { padding: 10px 12px; border: 1px solid rgba(127,127,127,.18); border-radius: 12px; background: rgba(255,255,255,.02); }
.chg-item .when { font-size: 12px; opacity: .75; margin-bottom: 6px; }
.chg-item .title { font-weight: 600; margin-bottom: 4px; }
.chg-item .body { white-space: pre-wrap; line-height: 1.35; }

#chg-footer { display:flex; gap: 8px; padding: 10px 12px; border-top: 1px solid rgba(127,127,127,.2); }
#chg-footer .btn { padding: 8px 12px; border-radius: 10px; border: 1px solid rgba(127,127,127,.25); background: transparent; color: inherit; cursor: pointer; }
#chg-footer .btn.primary { background: rgba(59,130,246,.15); border-color: rgba(59,130,246,.4); }
`;
  document.head.appendChild(style);

  const toggle = document.createElement('button');
  toggle.id = 'changelog-toggle';
  toggle.textContent = 'Changelog';
  document.body.appendChild(toggle);

  const panel = document.createElement('div');
  panel.id = 'changelog-panel';
  panel.innerHTML = `
    <div id="chg-header">
      <h3>Project Changelog</h3>
      <div>
        <button class="btn" id="chg-close">Close</button>
      </div>
    </div>
    <div id="chg-body"><div id="chg-list"></div></div>
    <div id="chg-footer">
      <button class="btn primary" id="chg-add" style="display:none">Add Entry</button>
      <button class="btn" id="chg-copy">Copy</button>
      <button class="btn" id="chg-export">Export JSON</button>
      <button class="btn" id="chg-clear" style="display:none">Clear</button>
    </div>`;
  document.body.appendChild(panel);

  
  const storageKey = 'otk_changelog_v1';
  const admin = (localStorage.getItem('otk_changelog_admin') === '1') || (window.__OTK_ADMIN === true) || location.hostname === 'localhost';

  async function fetchRemoteChangelog() {
    try {
      const res = await fetch('data/changelog.json', { cache: 'no-store' });
      if (!res.ok) throw new Error('http ' + res.status);
      return await res.json();
    } catch (e) {
      return null; // fallback to local cache
    }
  }

  async function loadChanges() {
    const remote = await fetchRemoteChangelog();
    if (Array.isArray(remote)) { localStorage.setItem(storageKey, JSON.stringify(remote)); return remote; }
    try { return JSON.parse(localStorage.getItem(storageKey) || '[]'); } catch { return []; }
  }
  function saveChanges(arr) {
    localStorage.setItem(storageKey, JSON.stringify(arr));
  }
  async function renderList() {
    const list = document.getElementById('chg-list');
    const items = await loadChanges();
    list.innerHTML = items.map((it, idx) => `
      <div class="chg-item" data-idx="${idx}">
        <div class="when">${new Date(it.when).toLocaleString()}</div>
        ${it.title ? `<div class="title">${escapeHtml(it.title)}</div>` : ''}
        ${it.body ? `<div class="body">${escapeHtml(it.body)}</div>` : ''}
      </div>`).join('');
  }
  async function addEntry(title, body) {
    const arr = await loadChanges();
    arr.unshift({ when: Date.now(), title: title || '', body: body || '' });
    saveChanges(arr);
    renderList();
    // For security: export updated JSON and instruct admin to commit to repo
    const blob = new Blob([JSON.stringify(arr, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'changelog.json'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    alert('Download complete. Commit changelog.json to /data in the repo to publish.');
  }

  // UI events
  toggle.addEventListener('click', () => panel.classList.toggle('visible'));
  document.getElementById('chg-close').addEventListener('click', () => panel.classList.remove('visible'));
  document.getElementById('chg-add').addEventListener('click', () => {
    const title = prompt('Changelog title (optional):', '');
    if (title === null) return;
    const body = prompt('Details (shift+enter for new line in later editor):', '');
    if (body === null) return;
    addEntry(title, body);
  });
  document.getElementById('chg-copy').addEventListener('click', async () => {
    const items = await loadChanges();
    const text = items.map(it => `- ${new Date(it.when).toLocaleString()} — ${it.title || '(no title)'}\n  ${it.body || ''}`).join('\n');
    try { await navigator.clipboard.writeText(text); alert('Changelog copied to clipboard'); } catch { alert('Copy failed.'); }
  });
  document.getElementById('chg-export').addEventListener('click', async () => {
    const items = await loadChanges();
    const blob = new Blob([JSON.stringify(items || [], null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'changelog.json'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  document.getElementById('chg-clear').addEventListener('click', () => {
    if (confirm('Clear all changelog entries?')) { localStorage.removeItem(storageKey); renderList(); }
  });

  // admin controls
  if (admin) { document.getElementById('chg-add').style.display='inline-block'; document.getElementById('chg-clear').style.display='inline-block'; }
  // initial render
  renderList();

  // Expose minimal API
  window.changelog = {
    open: () => panel.classList.add('visible'),
    close: () => panel.classList.remove('visible'),
    add: (title, body) => addEntry(title, body),
    list: () => JSON.parse(localStorage.getItem(storageKey) || '[]')
  };
}

async function main() {
  initEls();
  setTheme(getTheme());
  setupInfiniteScroll();
  bind();

  const files = await loadManifest();
  const items = await loadChunks(files);
  state.items = items.map(normalize);
  dbg('Loaded items', {total: state.items.length});
  setLoadStatus(`Loaded ${state.items.length} item(s)`);
  if (state.items.length === 0 && els.debugPanel) els.debugPanel.classList.remove('hidden');
  applyFilters();
}

main().catch(err => {
  console.error(err);
  dbg('main error', {message: err?.message});
  alert('Failed to initialize. See console for details.');
});
