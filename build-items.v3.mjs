// build-items.v3.mjs
// Robust item scraper with explicit support for legacy table layout (e.g., drops.php):
// - Detects <td bgcolor="#B1300D"> header rows, extracts <b>Name</b>
// - Parses the following detail row's left and right <td>s to capture fields
// Also keeps generic fallback for other item pages.
//
// Captures only the requested fields:
// name, stats.Vita, stats.Mana, stack_size, crafts[], other_uses[], effect, obtain[], comments, npc_buys, path(optional)
// Dedupe by name (case-insensitive), merging arrays (union), numbers (max), text (prefer value or join with " | ").
//
// Usage:
//   node build-items.v3.mjs --out ./data --chunk 80 --prefix otk-items-chunk- --dry --debug

import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { load } from 'cheerio';
import yargs from 'yargs/yargs';
import { hideBin } from 'yargs/helpers';

const argv = yargs(hideBin(process.argv))
  .option('out',   { type: 'string', default: './data' })
  .option('chunk', { type: 'number', default: 80 })
  .option('prefix',{ type: 'string', default: 'otk-items-chunk-' })
  .option('dry',   { type: 'boolean', default: false })
  .option('debug', { type: 'boolean', default: false })
  .help().argv;

const URLS = [
  'https://originaltk.com/items/drops.php',
  'https://originaltk.com/items/crafts.php',
  'https://originaltk.com/items/events.php',
  'https://originaltk.com/items/bombs.php',
  'https://originaltk.com/items/keys.php',
  'https://originaltk.com/items/mana.php',
  'https://originaltk.com/items/potions.php',
  'https://originaltk.com/items/quests.php',
  'https://originaltk.com/items/rocks.php',
  'https://originaltk.com/items/shop.php',
  'https://originaltk.com/items/vita.php',
  'https://originaltk.com/items/other.php',
];

function slugify(name) { return name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, ''); }
function normText(s) { return String(s || '').replace(/\s+/g, ' ').trim(); }
function toLines(block) { return normText(block).split('\n').map(s => s.trim()).filter(Boolean); }
function parseNumber(val) {
  if (val == null) return null;
  const m = String(val).replace(/,/g,'').match(/-?\d+(?:\.\d+)?/);
  return m ? (m[0].includes('.') ? parseFloat(m[0]) : parseInt(m[0],10)) : null;
}
function uniq(arr) { return Array.from(new Set((arr||[]).map(normText).filter(Boolean))); }

function parseListFromText(text, label) {
  const m = text.match(new RegExp(label + "\\s*:\\s*([\\s\\S]*?)(?:\\n\\s*[A-Z][^:]+:|$)", "i"));
  if (!m) return [];
  const payload = m[1].trim();
  if (/^None$/i.test(payload)) return [];
  return payload.split(/\n|,|;/).map(s => normText(s)).filter(Boolean);
}

// Legacy drops.php style: header TD with bgcolor="#B1300D", then detail row
function extractFromLegacyDrops($) {
  const items = [];
  $('td[bgcolor="#B1300D"]').each((_, td) => {
    const $td = $(td);
    const name = normText($td.find('b').first().text());
    if (!name) return;

    // Find next TR (details), then its two main TDs (left/right)
    const $headerTr = $td.closest('tr');
    const $detailTr = $headerTr.next('tr');
    const $cells = $detailTr.find('> td');
    if ($cells.length < 2) return;

    const $left = $($cells[1 - 1]);  // index 0 is image col, 1 is the left content
    const $right = $($cells[2 - 1]); // index 1 or 2 depending on image cell; in provided HTML index 2 is right
    // Be defensive: if first td contains <img>, then left is the next td
    let left = $cells.eq(0), right = $cells.eq(1);
    if (left.find('img').length) { left = $cells.eq(1); right = $cells.eq(2); }

    const leftText = left.text();
    const rightText = right.text();

    // Vita/Mana/Stack
    const vita = leftText.match(/Vita\s*:\s*(-?\d+)/i);
    const mana = leftText.match(/Mana\s*:\s*(-?\d+)/i);
    const stack = leftText.match(/Max\.?\s*Held\s*in\s*1\s*Slot\s*:\s*(\d+)/i);

    // Crafts / Other Uses (on left)
    const crafts = parseListFromText(leftText, 'Crafts');
    const other_uses = parseListFromText(leftText, 'Other Uses');

    // Effect (right)
    let effect = null;
    const eff = rightText.match(/Effect\s*:\s*([^\n]+)/i);
    if (eff) {
      const v = normText(eff[1]);
      effect = /^None$/i.test(v) ? null : v;
    }

    // Obtain (right)
    let obtain = [];
    {
      const m = rightText.match(/How to Obtain\s*:\s*([\s\S]*?)(?:\n\s*[A-Z][^:]+:|$)/i);
      if (m) obtain = toLines(m[1]);
    }

    // Comments (right)
    let comments = null;
    const cm = rightText.match(/Comments\s*:\s*([^\n]+)/i);
    if (cm) {
      const v = normText(cm[1]);
      comments = /^None$/i.test(v) ? null : v;
    }

    // NPC Buys (right)
    let npc_buys = null;
    const nb = rightText.match(/NPC\s*Buys\s*:\s*(-?\d+)/i);
    if (nb) npc_buys = parseInt(nb[1],10);

    const item = {
      id: slugify(name),
      name,
      category: 'item',
      level_tier: '',
      stats: {}
    };
    if (vita) item.stats.Vita = parseInt(vita[1],10);
    if (mana) item.stats.Mana = parseInt(mana[1],10);
    if (stack) item.stack_size = parseInt(stack[1],10);
    if (crafts.length) item.crafts = uniq(crafts);
    if (other_uses.length) item.other_uses = uniq(other_uses);
    if (effect) item.effect = effect;
    if (obtain.length) item.obtain = uniq(obtain);
    if (comments) item.comments = comments;
    if (npc_buys != null) item.npc_buys = npc_buys;

    items.push(item);
  });
  return items;
}

// Generic fallback (for other, more modern pages)
function extractGeneric($) {
  const items = [];
  // Look for blocks that include fields and have a bold title somewhere
  $('tr, .row, .item, table tr').each((_, el) => {
    const $el = $(el);
    const html = $.html($el);
    const text = $el.text().trim();
    if (!text || text.length < 40) return;
    if (!/Vita\s*:|Mana\s*:|How to Obtain\s*:|Crafts\s*:|Other Uses\s*:|NPC\s*Buys\s*:/i.test(text)) return;

    // Name: first boldish thing
    let name = normText($el.find('h1,h2,h3,h4,strong,b').first().text());
    if (!name) {
      // try raw HTML pattern around a bold tag
      const m = html && html.match(/<b[^>]*>([^<]{2,80})<\/b>/i);
      if (m && m[1]) name = normText(m[1]);
    }
    if (!name) return;

    // Parse fields from combined text
    const vita = text.match(/Vita\s*:\s*(-?\d+)/i);
    const mana = text.match(/Mana\s*:\s*(-?\d+)/i);
    const stack = text.match(/Max\.?\s*Held\s*in\s*1\s*Slot\s*:\s*(\d+)/i);
    const crafts = parseListFromText(text, 'Crafts');
    const other_uses = parseListFromText(text, 'Other Uses');

    let effect = null;
    const eff = text.match(/Effect\s*:\s*([^\n]+)/i);
    if (eff) { const v = normText(eff[1]); effect = /^None$/i.test(v) ? null : v; }

    let obtain = [];
    { const m = text.match(/How to Obtain\s*:\s*([\s\S]*?)(?:\n\s*[A-Z][^:]+:|$)/i); if (m) obtain = toLines(m[1]); }

    let comments = null;
    const cm = text.match(/Comments\s*:\s*([^\n]+)/i);
    if (cm) { const v = normText(cm[1]); comments = /^None$/i.test(v) ? null : v; }

    let npc_buys = null;
    const nb = text.match(/NPC\s*Buys\s*:\s*(-?\d+)/i);
    if (nb) npc_buys = parseInt(nb[1],10);

    const item = { id: slugify(name), name, category: 'item', level_tier: '', stats: {} };
    if (vita) item.stats.Vita = parseInt(vita[1],10);
    if (mana) item.stats.Mana = parseInt(mana[1],10);
    if (stack) item.stack_size = parseInt(stack[1],10);
    if (crafts.length) item.crafts = uniq(crafts);
    if (other_uses.length) item.other_uses = uniq(other_uses);
    if (effect) item.effect = effect;
    if (obtain.length) item.obtain = uniq(obtain);
    if (comments) item.comments = comments;
    if (npc_buys != null) item.npc_buys = npc_buys;

    items.push(item);
  });
  return items;
}

// Merge helpers
function mergeNumber(x, y) { if (x == null) return y; if (y == null) return x; return Math.max(x, y); }
function mergeText(x, y) {
  const nx = normText(x), ny = normText(y);
  if (!nx) return ny || null; if (!ny) return nx || null;
  if (nx.toLowerCase() === ny.toLowerCase()) return nx;
  return `${nx} | ${ny}`;
}
function mergeArray(x = [], y = []) { return Array.from(new Set([...(x||[]), ...(y||[])].map(normText).filter(Boolean))); }

function mergeItems(a, b) {
  const Vita = mergeNumber(a?.stats?.Vita, b?.stats?.Vita);
  const Mana = mergeNumber(a?.stats?.Mana, b?.stats?.Mana);
  const stats = {}; if (Vita != null) stats.Vita = Vita; if (Mana != null) stats.Mana = Mana;
  const out = {
    id: a.id, name: a.name, category: 'item', level_tier: '', stats,
    stack_size: mergeNumber(a.stack_size, b.stack_size),
    crafts: mergeArray(a.crafts, b.crafts),
    other_uses: mergeArray(a.other_uses, b.other_uses),
    effect: mergeText(a.effect, b.effect),
    obtain: mergeArray(a.obtain, b.obtain),
    comments: mergeText(a.comments, b.comments),
    npc_buys: mergeNumber(a.npc_buys, b.npc_buys)
  };
  const pth = mergeArray(a.path, b.path); if (pth.length) out.path = pth;
  return out;
}

async function fetchFrom(url) {
  const { data: html } = await axios.get(url, { timeout: 35000 });
  const $ = load(html);

  // Prefer legacy-drops extraction if header TDs exist
  const hasLegacyHeaders = $('td[bgcolor="#B1300D"]').length > 0;
  if (hasLegacyHeaders) {
    const a = extractFromLegacyDrops($);
    if (argv.debug) console.log(`[debug] legacy extractor @ ${url}: ${a.length} items`);
    if (a.length) return a;
  }
  // Fallback
  const b = extractGeneric($);
  if (argv.debug) console.log(`[debug] generic extractor @ ${url}: ${b.length} items`);
  return b;
}

function consolidate(items) {
  const map = new Map();
  for (const it of items) {
    const key = it.name.toLowerCase();
    if (!map.has(key)) map.set(key, it);
    else map.set(key, mergeItems(map.get(key), it));
  }
  return Array.from(map.values()).sort((a,b) => a.name.localeCompare(b.name));
}

(async function main() {
  const outDir = path.resolve(argv.out);
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const all = [];
  for (const url of URLS) {
    try {
      const list = await fetchFrom(url);
      all.push(...list);
      console.log(`[parse] ${list.length} items from ${url}`);
    } catch (e) {
      console.warn(`[warn] failed ${url}:`, e.message);
    }
  }

  const consolidated = consolidate(all);
  console.log('[total] raw:', all.length, 'unique:', consolidated.length);

  const per = Math.max(1, argv.chunk|0);
  let fileCount = 0;
  for (let i=0; i<consolidated.length; i+=per) {
    const slice = consolidated.slice(i, i+per);
    const idx = Math.floor(i/per) + 1;
    const fname = `${argv.prefix}${idx}.json`;
    const full = path.join(outDir, fname);
    if (!argv.dry) fs.writeFileSync(full, JSON.stringify({ items: slice }, null, 2));
    console.log(`[write] ${fname} (${slice.length} items)`);
    fileCount++;
  }
  console.log(`[done] wrote ${fileCount} chunk file(s) to ${outDir}`);
})().catch(err => { console.error(err); process.exit(1); });
