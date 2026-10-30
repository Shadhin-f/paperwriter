// SyncTeX inverse search: which source line produced the text at a point on a PDF page.
// Reads the .synctex(.gz) file the compiler writes next to the PDF.
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';

const SP_PER_BP = 65781.76; // TeX scaled points per PDF point
const RECORD = /^([[(vhxkg$r])(\d+),(\d+)(?::(-?\d+),(-?\d+)(?::(-?\d+)(?:,(-?\d+),(-?\d+))?)?)?/;
const BOXES = new Set(['(', 'h', '[', 'v', 'r']);

const cache = new Map(); // synctex path → { mtime, data }

function parse(text) {
  const inputs = new Map();
  const pages = new Map();
  let unit = 1;
  let mag = 1000;
  let xOff = 0;
  let yOff = 0;
  let page = null;
  for (const line of text.split('\n')) {
    let m;
    if (page !== null) {
      if (line[0] === '}') {
        page = null;
        continue;
      }
      if ((m = RECORD.exec(line)) && m[4] !== undefined) {
        const f = (unit * mag) / 1000 / SP_PER_BP;
        pages.get(page).push({
          type: m[1],
          tag: +m[2],
          line: +m[3],
          x: (+m[4] + xOff) * f,
          y: (+m[5] + yOff) * f,
          w: m[6] !== undefined ? +m[6] * f : 0,
          h: m[7] !== undefined ? +m[7] * f : 0,
          d: m[8] !== undefined ? +m[8] * f : 0,
        });
      }
      continue;
    }
    if ((m = line.match(/^Input:(\d+):(.*)$/))) inputs.set(+m[1], m[2].trim());
    else if ((m = line.match(/^Unit:(-?\d+)/))) unit = +m[1];
    else if ((m = line.match(/^Magnification:(\d+)/))) mag = +m[1] || 1000;
    else if ((m = line.match(/^X Offset:(-?\d+)/))) xOff = +m[1];
    else if ((m = line.match(/^Y Offset:(-?\d+)/))) yOff = +m[1];
    else if ((m = line.match(/^\{(\d+)/))) {
      page = +m[1];
      pages.set(page, []);
    }
  }
  return { inputs, pages };
}

async function load(dir, main) {
  const base = path.join(dir, '.out', path.basename(main, '.tex'));
  for (const file of [`${base}.synctex.gz`, `${base}.synctex`]) {
    let st;
    try {
      st = await fsp.stat(file);
    } catch {
      continue;
    }
    const hit = cache.get(file);
    if (hit && hit.mtime === st.mtimeMs) return hit.data;
    const raw = await fsp.readFile(file);
    const data = parse((file.endsWith('.gz') ? zlib.gunzipSync(raw) : raw).toString('utf8'));
    cache.set(file, { mtime: st.mtimeMs, data });
    return data;
  }
  return null;
}

/** Map synctex input tags to project-relative paths (files outside the project, like packages, are dropped). */
function projectTags(inputs, dir) {
  const tags = new Map();
  const root = path.resolve(dir);
  for (const [tag, p] of inputs) {
    if (!p) continue;
    const abs = path.resolve(root, p);
    const rel = path.relative(root, abs).replace(/\\/g, '/');
    if (!rel || rel.startsWith('..') || path.isAbsolute(rel) || rel.startsWith('.out/')) continue;
    if (fs.existsSync(abs)) tags.set(tag, rel);
  }
  return tags;
}

/**
 * @param {string} dir   project folder
 * @param {string} main  main .tex file
 * @param {number} page  1-based PDF page
 * @param {number} x     PDF points from the left edge
 * @param {number} y     PDF points from the top edge
 * @returns {Promise<{file: string, line: number} | null>}
 */
export async function inverseSearch(dir, main, page, x, y) {
  const data = await load(dir, main);
  if (!data) return null;
  const records = data.pages.get(page);
  if (!records?.length) return null;
  const tags = projectTags(data.inputs, dir);
  const mine = records.filter((r) => tags.has(r.tag) && r.line > 0);
  if (!mine.length) return null;

  // 1. The innermost box (a typeset line, a math formula, a rule…) under the point.
  const pad = 1.5;
  const under = mine
    .map((r, order) => ({ ...r, order }))
    .filter((r) => BOXES.has(r.type) && r.w > 0 && x >= r.x - pad && x <= r.x + r.w + pad && y >= r.y - r.h - pad && y <= r.y + r.d + pad);
  const contains = (a, b) => a !== b && a.x <= b.x + 0.5 && a.x + a.w >= b.x + b.w - 0.5 && a.y - a.h <= b.y - b.h + 0.5 && a.y + a.d >= b.y + b.d - 0.5;
  // Drop boxes that merely enclose another candidate. If unrelated boxes still overlap (say a wide table
  // spilling into the next column), the one typeset later is drawn on top, so that's what was clicked.
  const leaves = under.filter((a) => !under.some((b) => contains(a, b) && !contains(b, a)));
  const box = leaves.sort((a, b) => b.order - a.order)[0] || null;

  // 2. Within that line, the nearest character/glue/kern record: most precise line number.
  // Same typeset line, and the same column (two-column papers put unrelated text at the same height).
  const inLine = (r) =>
    box
      ? r.y >= box.y - box.h - pad && r.y <= box.y + box.d + pad && r.x >= box.x - pad && r.x <= box.x + box.w + pad
      : Math.abs(r.y - y) < 12 && Math.abs(r.x - x) < 120;
  let best = null;
  for (const r of mine) {
    if (BOXES.has(r.type) || !inLine(r)) continue;
    // Prefer marks just left of the click (where the clicked word starts).
    const dx = r.x <= x ? x - r.x : (r.x - x) * 3;
    const dist = dx + Math.abs(r.y - y) * 2;
    if (!best || dist < best.dist) best = { ...r, dist };
  }
  const hit = best || box;
  if (hit) return { file: tags.get(hit.tag), line: hit.line };

  // 3. Nothing on that line: the closest record on the page.
  let near = null;
  for (const r of mine) {
    const dist = Math.hypot(r.x - x, r.y - y);
    if (!near || dist < near.dist) near = { ...r, dist };
  }
  return near ? { file: tags.get(near.tag), line: near.line } : null;
}
