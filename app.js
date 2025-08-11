// Master Search frontend-only app
// - Loads JSON chunk files listed in data/manifest.json
// - Simple partial (substring) search on 'name'
// - Filters by path and level tier
// - Sorts by header click (asc/desc)
// - Exports filtered view to JSON/CSV

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
  q: null, tier: null, paths: [],
  tableBody: null, resultsInfo: null,
  exportJson: null, exportCsv: null
};

async function loadManifest() {
  setLoadStatus('Loading manifest…');
  dbg('loadManifest: start');
  const res = await fetch('data/manifest.json', {cache: 'no-store'});
  if (!res.ok) { setLoadStatus('Failed to load data/manifest.json'); dbg('manifest fetch failed', {status: res.status}); throw new Error('Failed to load data/manifest.json'); }
  const manifest = await res.json();
  dbg('loadManifest: ok', manifest);
  debugLog('Manifest: ' + JSON.stringify(manifest));
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

function debugLog(msg){ if(els.debugPanel){ els.debugPanel.textContent += msg + '\n'; } }

function setLoadStatus(msg){ if (els.loadStatus) els.loadStatus.textContent = msg; }
function dbg(msg, obj){
  try{
    const line = (obj!==undefined) ? msg + ' ' + JSON.stringify(obj) : msg;
    if (els.debugLog){ els.debugLog.textContent += line + '\n'; }
  }catch(e){ if (els.debugLog){ els.debugLog.textContent += msg + ' [unserializable]\n'; } }
}
function setDebugMeta(){
  if (!els.debugMeta) return;
  const selCats = Array.from(document.querySelectorAll('input[name="category"]:checked')).map(x=>x.value);
  const selPaths = Array.from(document.querySelectorAll('input[name="path"]:checked')).map(x=>x.value);
  const selTiers = Array.from(document.querySelectorAll('input[name="tier"]:checked')).map(x=>x.value);
  els.debugMeta.textContent = `items:${state.items.length} filtered:${state.filtered.length} sort:${state.sortKey}${state.statKey?'/'+state.statKey:''} dir:${state.sortDir} page:${state.page} size:${state.pageSize} | cats:${selCats.join(',')} paths:${selPaths.join(',')} tiers:${selTiers.join(',')}`;
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

function initEls() {
  els.q = document.querySelector('#q');
  els.sortedIndicator = document.querySelector('#sorted-indicator');
  els.themeToggle = document.querySelector('#theme-toggle');
  els.debugToggle = document.querySelector('#debug-toggle');
  els.debugPanel = document.querySelector('#debug-panel');
  els.debugLog = document.querySelector('#debug-log');
  els.debugCopy = document.querySelector('#debug-copy');
  els.debugClear = document.querySelector('#debug-clear');
  els.debugMeta = document.querySelector('#debug-meta');
  els.resetBtn = document.querySelector('#reset-filters');
  els.categories = Array.from(document.querySelectorAll('input[name="category"]'));
  els.tiers = Array.from(document.querySelectorAll('input[name="tier"]'));
  els.paths = Array.from(document.querySelectorAll('input[name="path"]'));
  els.tableBody = document.querySelector('#results tbody');
  els.resultsInfo = document.querySelector('#results-info');
  els.loadStatus = document.querySelector('#load-status');
  els.debugPanel = document.querySelector('#debug-panel');
  els.exportJson = document.querySelector('#export-json');
  els.exportCsv = document.querySelector('#export-csv');
  els.sentinel = document.querySelector('#scroll-sentinel');
  els.showMore = document.querySelector('#show-more');
}

function normalize(item) {
  // Ensure consistent shapes for downstream code
  return {
    id: item.id || crypto.randomUUID(),
    name: item.name || '',
    path: Array.isArray(item.path) ? item.path.map(p=>String(p).toLowerCase()) : (item.path ? [String(item.path).toLowerCase()] : []),
    category: (item.category || inferCategory(item)).toLowerCase(),
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
    // name match (substring)
    const nameHit = q === '' || it.name.toLowerCase().includes(q);
    if (!nameHit) return false;

    // category filter
    const catHit = checkedCats.size === 0 || checkedCats.has(it.category || inferCategory(it));
    if (!catHit) return false;

    // path filter (OR across selected), treat empty path as passing
    const pathHit = it.path.length === 0 || it.path.some(p => checkedPaths.has(p));
    if (!pathHit) return false;

    // tier filter (OR match)
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
      // AC special-case: lower is better (more negative first)
      if (key === 'AC') {
        if (av < bv) return -1; // always ascending for AC by value
        if (av > bv) return 1;
        return 0;
      }
      // Generic numeric sort by dir
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


function render() {
  // Info
  const total = state.filtered.length;
  const visibleCount = Math.min(total, state.page * state.pageSize);
  els.resultsInfo.textContent = `${visibleCount} of ${total} result${total === 1 ? '' : 's'}`;

  // Rows
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

  // Toggle "Show more" visibility
  /* Infinite scroll active; no Show More button needed */

  updateSortedIndicator();
  setDebugMeta();
}


function escapeHtml(s) {
  return s.replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
}

function inferCategory(item){
  // If category not provided, infer from type or slot
  const t = (item.type||'').toString().toLowerCase();
  const slot = (item.slot||'').toString().toLowerCase();
  if (item.category) return String(item.category).toLowerCase();
  if (['armor','weapon','item','hand','head','helm','shield','subaccessory'].includes(t)) return t;
  if (['hand','head','helm','shield','subaccessory'].includes(slot)) return slot;
  if (t === 'armor') return 'armor';
  if (t === 'weapon') return 'weapon';
  if (t === 'item') return 'item';
  return 'item';
}

function bind() {
  // Debounced search
  let t;
  els.q.addEventListener('input', () => {
    clearTimeout(t);
    t = setTimeout(applyFilters, 120);
  });

  els.tiers.forEach(t => t.addEventListener('change', applyFilters));
  els.paths.forEach(p => p.addEventListener('change', applyFilters));
  els.categories.forEach(c => c.addEventListener('change', applyFilters));

  // Sorting
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

  // Stat click sorting
  document.querySelector('#results').addEventListener('click', (e) => {
    const el = e.target.closest('.stat');
    if (!el) return;
    const key = el.getAttribute('data-stat');
    if (state.sortKey === 'stat' && state.statKey === key && !e.shiftKey) {
      // toggle off -> default (unless shift held)
      state.sortKey = 'name';
      state.sortDir = 'asc';
      state.statKey = null;
    } else {
      state.sortKey = 'stat';
      state.statKey = key;
      // default direction: AC asc (lower is better), others desc
      state.sortDir = (key === 'AC') ? 'asc' : 'desc';
      if (e.shiftKey) {
        // reverse on shift
        state.sortDir = (state.sortDir === 'asc') ? 'desc' : 'asc';
      }
    }
    state.page = 1;
    sortData();
    render();
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

  // Theme toggle
  function setTheme(theme) {
    document.documentElement.classList.remove('light', 'dark');
    document.documentElement.classList.add(theme);
    localStorage.setItem('theme', theme);
  }
  const savedTheme = localStorage.getItem('theme') || 'dark';
  setTheme(savedTheme);
  els.themeToggle.addEventListener('click', () => {
    const current = document.documentElement.classList.contains('light') ? 'light' : 'dark';
    setTheme(current === 'light' ? 'dark' : 'light');
  });

  // Reset filters
  els.resetBtn.addEventListener('click', () => {
    els.q.value = '';
    // select all categories/paths/tiers
    els.categories.forEach(c => c.checked = true);
    els.paths.forEach(p => p.checked = true);
    els.tiers.forEach(t => t.checked = true);
    // reset sorting
    state.sortKey = 'name';
    state.sortDir = 'asc';
    state.statKey = null;
    applyFilters();
  });

  // Export
  els.exportJson.addEventListener('click', () => {
    const blob = new Blob([JSON.stringify({items: state.filtered}, null, 2)], {type: 'application/json'});
    downloadBlob(blob, 'filtered-items.json');
  });
  els.exportCsv.addEventListener('click', () => {
    const csv = toCSV(state.filtered);
    const blob = new Blob([csv], {type: 'text/csv'});
    downloadBlob(blob, 'filtered-items.csv');
  });
}

function toCSV(items) {
  const headers = ['name','type','path','level_tier','stats','enchants','info','obtain'];
  const lines = [headers.join(',')];
  for (const it of items) {
    const row = [
      it.name,
      it.type,
      (it.path || []).join('; '),
      it.level_tier,
      Object.entries(it.stats).map(([k,v])=>`${k}:${v}`).join('; '),
      (it.enchants || []).join('; '),
      (it.info || '').replace(/\n/g,' '),
      (it.obtain || []).join(' | ')
    ].map(v => '"' + String(v).replace(/"/g,'""') + '"');
    lines.push(row.join(','));
  }
  return lines.join('\n');
}

function downloadBlob(blob, filename) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
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
  alert('Failed to load data. Check the console and data/manifest.json.');
});
window.addEventListener('error', e => { debugLog('Error: ' + e.message + ' @ ' + e.filename + ':' + e.lineno); });
