// OTK Master Search app.js — loader + chips + streaming + filters

// ---------- State & elements ----------
const state = {
  items: [],       // normalized items
  filtered: [],
  sortKey: 'name',
  sortDir: 'asc',
  statKey: null,
  page: 1,
  pageSize: 50
};

const els = {
  q: null, categories: [], paths: [], tiers: [],
  tableBody: null, resultsInfo: null, loadStatus: null,
  sortedIndicator: null, sentinel: null,
  selectAll: null, selectNone: null
};

// ---------- Loader helpers ----------
function showLoader(text, sub, current=0, total=0){
  const o = document.getElementById('loader-overlay'); if (!o) return;
  o.classList.add('show'); o.setAttribute('aria-hidden','false');
  setLoader(text, sub, current, total);
}
function setLoader(text, sub, current=0, total=0){
  const t = document.getElementById('loader-title'); if (t && text) t.textContent = text;
  const s = document.getElementById('loader-sub'); if (s) s.textContent = sub || '';
  const b = document.getElementById('loader-bar'); if (b){
    const pct = total>0 ? Math.max(0, Math.min(100, Math.round((current/total)*100))) : 0;
    b.style.width = pct + '%';
  }
}
function hideLoader(){
  const o = document.getElementById('loader-overlay'); if (!o) return;
  o.classList.remove('show'); o.setAttribute('aria-hidden','true');
}

// ---------- Utilities ----------
function escapeHtml(s){ return String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
function norm(x){ return String(x||'').trim(); }
function inferCategory(item){
  const slot = (item.slot||'').toString().toLowerCase();
  const cat = (item.category||'').toString().toLowerCase();
  if (cat) return cat;
  if (['hand','head','helm','shield','subaccessory','armor','weapon','item'].includes(slot)) return slot;
  return 'item';
}
function isItem(entry){ return entry && String(entry.category||'').toLowerCase()==='item'; }

function setLoadStatus(msg){ const e=document.getElementById('load-status'); if (e) e.textContent = msg; setLoader(msg); }
function dbg(){ /* no-op log stub; wire to a panel if needed */ }

// ---------- Manifest & chunk loading (with streaming counts) ----------
async function loadManifest(){
  setLoadStatus('Loading manifest…');
  const res = await fetch('data/manifest.json', { cache: 'no-store' });
  if (!res.ok) throw new Error('Failed to load data/manifest.json');
  const manifest = await res.json();
  const files = manifest.files || [];
  return files;
}

async function loadChunks(files){
  setLoadStatus(`Loading ${files.length} data file(s)…`);
  showLoader('Loading data files…','0 items loaded',0,files.length);
  const all = [];
  let itemsLoaded = 0;
  for (let i=0;i<files.length;i++){
    const file = files[i];
    const res = await fetch('data/' + file, { cache: 'no-store' });
    if (!res.ok) { console.warn('Missing chunk:', file); continue; }
    const json = await res.json();
    const count = Array.isArray(json.items) ? json.items.length : 0;
    if (count && Array.isArray(json.items)){
      all.push(...json.items);
      itemsLoaded += count;
    }
    setLoader('Loading data files…', `${itemsLoaded} items loaded`, i+1, files.length);
    setLoadStatus(`Loading data… ${itemsLoaded} item(s) loaded`);
  }
  return all;
}

// ---------- Normalization ----------
function normalize(item){
  const cat = (item.category || inferCategory(item)).toLowerCase();
  const path = Array.isArray(item.path) ? item.path.map(p=>String(p).toLowerCase()) : (item.path ? [String(item.path).toLowerCase()] : []);
  let level = item.level_tier;
  if (typeof level === 'string') level = level.trim().toLowerCase();
  return {
    id: item.id || crypto.randomUUID(),
    name: item.name || '',
    category: cat,
    path,
    level_tier: level ?? '',
    stats: item.stats || {},
    enchants: item.enchants || [],
    info: item.info || '',
    obtain: item.obtain || [],
    stack_size: item.stack_size,
    crafts: item.crafts || [],
    other_uses: item.other_uses || [],
    effect: item.effect || null,
    comments: item.comments || null,
    npc_buys: item.npc_buys
  };
}

// ---------- Filters ----------
function applyFilters(){
  const q = els.q.value.trim().toLowerCase();
  const checkedCats = new Set(els.categories.filter(x=>x.checked).map(x=>x.value));
  const checkedPaths = new Set(els.paths.filter(x=>x.checked).map(x=>x.value));
  const checkedTiers = new Set(els.tiers.filter(x=>x.checked).map(x=>x.value));

  state.filtered = state.items.filter(it => {
    if (q && !it.name.toLowerCase().includes(q)) return false;

    const cat = it.category || inferCategory(it);
    if (checkedCats.size && !checkedCats.has(cat)) return false;

    if (it.path && it.path.length){
      if (checkedPaths.size && !it.path.some(p => checkedPaths.has(p))) return false;
    } else if (checkedPaths.size){ return false; }

    // Level rule: Items ignore level filters.
    if (cat !== 'item'){
      const lvl = String(it.level_tier ?? '').toLowerCase();
      const isNumeric = /^\d{1,3}$/.test(lvl);
      if (checkedTiers.size === 0){
        // none selected => include all
      } else {
        const hasRange = checkedTiers.has('1-99');
        const tierOk = checkedTiers.has(lvl) || (isNumeric && hasRange);
        if (!tierOk) return false;
      }
    }
    return true;
  });

  sortData();
  render();
}

function sortData(){
  const dir = state.sortDir === 'asc' ? 1 : -1;

  if (state.sortKey === 'stat'){
    const key = state.statKey || '';
    state.filtered.sort((a,b) => {
      const av = Number(a.stats?.[key] ?? (key==='AC' ? 9999 : -9999));
      const bv = Number(b.stats?.[key] ?? (key==='AC' ? 9999 : -9999));
      if (key === 'AC') return av - bv; // lower is better
      return (av < bv ? -1 : av > bv ? 1 : 0) * (key==='AC' ? 1 : -1 * dir);
    });
    return;
  }

  state.filtered.sort((a,b) => {
    let va = a[state.sortKey], vb = b[state.sortKey];
    if (state.sortKey === 'stats'){
      va = Object.entries(va||{}).map(([k,v])=>`${k}:${v}`).join('|');
      vb = Object.entries(vb||{}).map(([k,v])=>`${k}:${v}`).join('|');
    } else if (state.sortKey === 'path' || state.sortKey === 'enchants' || state.sortKey === 'obtain'){
      va = (va||[]).join('|'); vb = (vb||[]).join('|');
    } else { va = va ?? ''; vb = vb ?? ''; }
    va = String(va).toLowerCase(); vb = String(vb).toLowerCase();
    if (va < vb) return -1 * dir; if (va > vb) return 1 * dir; return 0;
  });
}

// ---------- Render ----------
function render(){
  const tbody = els.tableBody;
  const total = state.filtered.length;
  const subset = state.filtered; // full list; can add pagination/infinite scroll later
  document.getElementById('results-info').textContent = `${subset.length} of ${total} result${total===1?'':'s'}`;

  const rows = subset.map(it => {
    const stats = Object.entries(it.stats||{}).map(([k,v]) => {
      const active = (state.sortKey === 'stat' && state.statKey === k);
      return `<span class="stat${active?' active':''}" data-stat="${escapeHtml(k)}">${escapeHtml(k)}: ${escapeHtml(v)}</span>`;
    }).join(' ');
    const ench = (it.enchants||[]).map(e => `<span class="badge">${escapeHtml(String(e))}</span>`).join(' ');
    const path = (it.path||[]).map(p => `<span class="badge">${escapeHtml(String(p))}</span>`).join(' ');
    const obtain = (it.obtain||[]).map(o => `<div>${escapeHtml(String(o))}</div>`).join('');

    return `<tr>
      <td>${escapeHtml(it.name)}</td>
      <td>${escapeHtml(it.category)}</td>
      <td>${path}</td>
      <td>${escapeHtml(String(it.level_tier))}</td>
      <td>${stats}</td>
      <td>${ench}</td>
      <td>${escapeHtml(String(it.info||''))}</td>
      <td>${obtain}</td>
    </tr>`;
  }).join('');

  tbody.innerHTML = rows || `<tr><td colspan="8" class="muted">No results.</td></tr>`;
  try { hideLoader(); } catch {}
}

// ---------- Chips inside filter container ----------
function ensureFilterChipStyles(){ /* styles are in CSS */ }
function enhanceFilterChips(){
  const root = document.getElementById('filters');
  if (!root) return;

  function buildChips(inputs, title){
    if (!inputs || !inputs.length) return;
    const row = document.createElement('div'); row.className='filter-row';
    const label = document.createElement('span'); label.className='title'; label.textContent = title;
    const chips = document.createElement('div'); chips.className='filter-chips';
    row.appendChild(label); row.appendChild(chips); root.querySelector('.controls').appendChild(row);

    inputs.forEach(inp => {
      if (!inp.id) inp.id = 'f_' + Math.random().toString(36).slice(2,9);
      const chip = document.createElement('button'); chip.type='button'; chip.className='chip'; chip.dataset.inputId = inp.id;
      const text = (inp.closest('label')?.textContent || inp.value || '').trim().replace(/\s+/g,' ');
      chip.textContent = text.replace(/Level\s*Tiers?\s*:\s*/i,'').replace(/0-99/g,'1-99');
      chip.setAttribute('aria-pressed', inp.checked ? 'true' : 'false');
      chip.addEventListener('click', () => {
        const active = chip.getAttribute('aria-pressed') === 'true';
        chip.setAttribute('aria-pressed', active ? 'false' : 'true');
        inp.checked = !active;
        inp.dispatchEvent(new Event('change', { bubbles: true }));
      });
      chips.appendChild(chip);
      // Hide original checkbox labels but keep them for a11y
      inp.closest('label')?.classList.add('visually-hidden');
    });
  }

  buildChips(els.categories, 'Category');
  buildChips(els.paths, 'Paths');
  buildChips(els.tiers, 'Level');

  // Hide duplicate labels inside filter container
  root.querySelectorAll('.group-label').forEach(el => el.classList.add('visually-hidden'));
}

function syncFilterChips(){
  document.querySelectorAll('.filter-chips .chip[data-input-id]').forEach(chip => {
    const id = chip.getAttribute('data-input-id'); const inp = document.getElementById(id);
    if (!inp) return; chip.setAttribute('aria-pressed', inp.checked ? 'true' : 'false');
  });
}

// ---------- Bindings ----------
function bind(){
  // Debounced search
  let t; els.q.addEventListener('input', () => { clearTimeout(t); t=setTimeout(applyFilters, 120); });

  els.categories.forEach(el=> el.addEventListener('change', () => { applyFilters(); syncFilterChips(); }));
  els.paths.forEach(el=> el.addEventListener('change', () => { applyFilters(); syncFilterChips(); }));
  els.tiers.forEach(el=> el.addEventListener('change', () => { applyFilters(); syncFilterChips(); }));

  // Sort by header
  document.querySelectorAll('#results thead th').forEach(th => {
    th.addEventListener('click', () => {
      const key = th.dataset.key;
      if (!key) return;
      if (state.sortKey === key) state.sortDir = (state.sortDir==='asc'?'desc':'asc');
      else { state.sortKey = key; state.sortDir = 'asc'; state.statKey=null; }
      sortData(); render();
    });
  });

  // Sort by stat badge (click); shift-click reverses
  document.getElementById('results').addEventListener('click', (e) => {
    const el = e.target.closest('.stat'); if (!el) return;
    const key = el.getAttribute('data-stat');
    if (state.sortKey === 'stat' && state.statKey === key && !e.shiftKey){
      state.sortKey = 'name'; state.sortDir='asc'; state.statKey=null;
    } else {
      state.sortKey='stat'; state.statKey=key; state.sortDir = (key==='AC') ? 'asc' : 'desc';
      if (e.shiftKey) state.sortDir = (state.sortDir==='asc'?'desc':'asc');
    }
    sortData(); render();
  });

  // Select all / none
  els.selectAll.addEventListener('click', (e)=>{
    e.preventDefault();
    els.categories.forEach(c=>c.checked=true);
    els.paths.forEach(p=>p.checked=true);
    els.tiers.forEach(t=>t.checked=true);
    applyFilters(); syncFilterChips();
  });
  els.selectNone.addEventListener('click', (e)=>{
    e.preventDefault();
    els.categories.forEach(c=>c.checked=false);
    els.paths.forEach(p=>p.checked=false);
    els.tiers.forEach(t=>t.checked=false);
    applyFilters(); syncFilterChips();
  });
}

// ---------- Init ----------
function initEls(){
  els.q = document.getElementById('q');
  els.categories = Array.from(document.querySelectorAll('input[name="category"]'));
  els.paths = Array.from(document.querySelectorAll('input[name="path"]'));
  els.tiers = Array.from(document.querySelectorAll('input[name="tier"]'));
  els.tableBody = document.querySelector('#results tbody');
  els.resultsInfo = document.getElementById('results-info');
  els.sortedIndicator = document.getElementById('sorted-indicator');
  els.selectAll = document.getElementById('select-all');
  els.selectNone = document.getElementById('select-none');
}

async function main(){
  initEls();
  enhanceFilterChips();
  bind();
  showLoader('Loading data…','',0,1);
  const files = await loadManifest();
  const items = await loadChunks(files);
  state.items = items.map(normalize);
  setLoadStatus(`Loaded ${state.items.length} item(s)`);
  applyFilters();
  hideLoader();
}

main().catch(err => {
  console.error(err);
  try { hideLoader(); } catch {}
  alert('Failed to initialize. See console for details.');
});