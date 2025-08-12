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
  sentinel: null,
  selectAll: null,
  selectNone: null
};

function setLoadStatus(msg){ if (els.loadStatus) els.loadStatus.textContent = msg; }

// --- Loading overlay (minimal, attractive) ---
function ensureLoader() {
  if (!document.getElementById('otk-loader-style')) {
    const style = document.createElement('style');
    style.id = 'otk-loader-style';
    style.textContent = `
#otk-loader-overlay {
  position: fixed;
  inset: 0;
  background: rgba(14,14,18,0.6);
  backdrop-filter: blur(2px);
  display: none;
  align-items: center;
  justify-content: center;
  z-index: 9999;
}
#otk-loader-overlay.visible { display: flex; }
#otk-loader {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 18px;
  border-radius: 14px;
  background: var(--panel-bg, #111827);
  color: var(--fg, #f3f4f6);
  box-shadow: 0 10px 25px rgba(0,0,0,.35);
  border: 1px solid rgba(255,255,255,.08);
}
#otk-loader .spinner {
  width: 28px; height: 28px;
  border-radius: 50%;
  border: 3px solid rgba(255,255,255,.25);
  border-top-color: currentColor;
  animation: otkspin 0.9s linear infinite;
}
#otk-loader .text { font-weight: 500; letter-spacing: .2px; }
@keyframes otkspin { to { transform: rotate(360deg); } }
:root[data-theme="light"] #otk-loader { background: #ffffff; color: #111827; border-color: rgba(0,0,0,.08); }
`;
    document.head.appendChild(style);
  }
  if (!document.getElementById('otk-loader-overlay')) {
    const overlay = document.createElement('div');
    overlay.id = 'otk-loader-overlay';
    overlay.innerHTML = '<div id="otk-loader"><div class="spinner"></div><div class="text">Loading data…</div></div>';
    document.body.appendChild(overlay);
  }
}
function showLoader(text) {
  ensureLoader();
  const overlay = document.getElementById('otk-loader-overlay');
  const label = overlay?.querySelector('.text');
  if (label && text) label.textContent = text;
  overlay?.classList.add('visible');
}
f

function setLoader(text){
  // Back-compat shim: update overlay text if present; no-op if overlay missing
  try {
    ensureLoader();
    const overlay = document.getElementById('otk-loader-overlay');
    const label = overlay ? overlay.querySelector('.text') : null;
    if (label && text) label.textContent = String(text);
  } catch {}
}
unction hideLoader() {
  const overlay = document.getElementById('otk-loader-overlay');
  overlay?.classList.remove('visible');
}

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
  els.debugMeta.textContent = `items:${state.items.length} filtered:${state.filtered.length} sort:${state.sortKey}${state.statKey?'/'+state.statKey:''} dir:${state.sortDir} page:${state.page} size:${state.pageSize} | cats:${selCats.join(',')} paths:${selPaths.join(',')} levels:${selTiers.join(',')}`;
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
  // Replace reset with Select all / Select none
  if (els.resetBtn && !document.getElementById('select-all')) {
    const allBtn = document.createElement('button');
    allBtn.id = 'select-all'; allBtn.className = 'btn'; allBtn.textContent = 'Select all';
    const noneBtn = document.createElement('button');
    noneBtn.id = 'select-none'; noneBtn.className = 'btn'; noneBtn.textContent = 'Select none';
    els.resetBtn.insertAdjacentElement('beforebegin', allBtn);
    els.resetBtn.insertAdjacentElement('beforebegin', noneBtn);
    els.resetBtn.style.display = 'none';
    els.selectAll = allBtn; els.selectNone = noneBtn;
  }
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
    const tierRaw = String(it.level_tier || '').toLowerCase();
    const isNumericLevel = /^\d{1,3}$/.test(tierRaw);
    const isItem = String(it.category || '').toLowerCase() === 'item';
    const tierHit = isItem || checkedTiers.size === 0
      || checkedTiers.has(tierRaw)
      || (isNumericLevel && checkedTiers.has('1-99'));
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


function patchUILevelsAndStyles() {
  // Rename table header "Tier" -> "Level"
  try {
    const thLevel = document.querySelector('#results thead th[data-key="level_tier"]');
    if (thLevel) thLevel.textContent = 'Level';
    else {
      const ths = Array.from(document.querySelectorAll('#results thead th'));
      const guess = ths.find(th => /\btier\b/i.test(th.textContent.trim()));
      if (guess) guess.textContent = 'Level';
    }
  } catch {}
  // Rename the filter group title in the sidebar from "Tier(s)" to "Level"
  try {
    const filterTitles = Array.from(document.querySelectorAll('.filter-group h3, .filter-group legend, .filter-group-label'));
    filterTitles.forEach(el => {
      const txt = (el.textContent || '').trim();
      if (/tier/i.test(txt)) {
        el.textContent = txt.replace(/tier(s)?/i, 'Level');
      }
    });
  } catch {}


  

  // Hide duplicate filter labels like "Category:" / "Paths:" / "Level:" that appear next to headings
  try {
    const hideIfMatches = (el) => {
      const t = (el.textContent || '').trim();
      if (/^(Category|Paths|Level)\s*:?$/i.test(t)) el.classList.add('visually-hidden');
    };
    document.querySelectorAll('.filter-group label, .filter-group .group-label, .filter-group .title').forEach(hideIfMatches);
    // Ensure we have visually-hidden helper
    if (!document.getElementById('vh-style')) {
      const s = document.createElement('style'); s.id='vh-style';
      s.textContent = '.visually-hidden{position:absolute!important;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0;}';
      document.head.appendChild(s);
    }
  } catch {}
// Update '0-99' checkbox label/value -> '1-99'
  try {
    document.querySelectorAll('input[name="tier"]').forEach(input => {
      if (String(input.value).trim().toLowerCase() === '0-99') {
        input.value = '1-99';
        const label = input.closest('label');
        if (label) {
          // Replace plain text "0-99" with "1-99" while preserving other content
          label.innerHTML = label.innerHTML.replace(/0-99/g, '1-99');
        }
      }
    });
  } catch {}

  // Add classes to header cells so we can style widths
  try {
    const ths = Array.from(document.querySelectorAll('#results thead th'));
    if (ths[4]) ths[4].classList.add('stats');
    if (ths[5]) ths[5].classList.add('enchants');
    if (ths[6]) ths[6].classList.add('info');
  } catch {}

  // Inject table width/style tweaks: reduce Stats col width ~1/3 and allow wrapping
  try {
    if (!document.getElementById('results-style-patch')) {
      const css = `
#results td.stats, #results th.stats {
  max-width: 240px;
  width: 240px;
  white-space: normal;
  overflow-wrap: anywhere;
}
#results td.enchants, #results td.info { white-space: normal; }
@media (max-width: 900px) {
  #results td.stats, #results th.stats { max-width: none; width: auto; }
}`;
      const style = document.createElement('style');
      style.id = 'results-style-patch';
      style.textContent = css;
      document.head.appendChild(style);
    }
  } catch {}
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
    const headers = ['name','category','path','level','stats','enchants','info','obtain'];
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

  // Select all / Select none
  if (els.selectAll) els.selectAll.addEventListener('click', () => {
    els.categories.forEach(c => c.checked = true);
    els.paths.forEach(p => p.checked = true);
    els.tiers.forEach(t => t.checked = true);
    applyFilters();
  });
  if (els.selectNone) els.selectNone.addEventListener('click', () => {
    els.categories.forEach(c => c.checked = false);
    els.paths.forEach(p => p.checked = false);
    els.tiers.forEach(t => t.checked = false);
    applyFilters();
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

async function main() {
  initEls();
  setTheme(getTheme());
  setupInfiniteScroll();
  bind();
  patchUILevelsAndStyles();
  showLoader('Loading items…');

  const files = await loadManifest();
  const items = await loadChunks(files);
  state.items = items.map(normalize);
  dbg('Loaded items', {total: state.items.length});
  setLoadStatus(`Loaded ${state.items.length} item(s)`);
  if (state.items.length === 0 && els.debugPanel) els.debugPanel.classList.remove('hidden');
  applyFilters();
  hideLoader();
}

main().catch(err => {
  console.error(err);
  dbg('main error', {message: err?.message});
  alert('Failed to initialize. See console for details.');
});
