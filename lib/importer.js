// Import a project exported from another LaTeX platform (Overleaf, Prism, Authorea, arXiv, …):
// .zip, .tar / .tar.gz / .tgz, a gzipped single .tex, or a plain .tex file.
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';
import { unzipSync } from 'fflate';
import { PROJECTS, HttpError } from './util.js';
import { setMeta, kindOf } from './projects.js';

const MAX_FILES = 3000;
const MAX_FILE_BYTES = 50 * 1024 * 1024;
const MAX_TOTAL_BYTES = 300 * 1024 * 1024;

// Build output and OS clutter that other platforms include in exports.
const JUNK = /(^|\/)(__MACOSX|\.DS_Store|Thumbs\.db|desktop\.ini)(\/|$)|\.(aux|log|out|toc|lof|lot|fls|fdb_latexmk|synctex(\.gz)?|blg|bcf|run\.xml|nav|snm|vrb|xdv|dvi)$/i;
const MAIN_NAMES = ['main.tex', 'paper.tex', 'manuscript.tex', 'ms.tex', 'article.tex', 'thesis.tex', 'report.tex', 'document.tex'];

function cleanPath(p) {
  const raw = String(p).replace(/\\/g, '/');
  if (raw.startsWith('/')) return null; // absolute entries are refused, not re-rooted
  const clean = raw.replace(/^(\.\/)+/, '');
  if (!clean || clean.endsWith('/')) return null;
  const segs = clean.split('/');
  // No absolute paths, parent references or hidden files (they could escape the project or be config).
  if (/^[A-Za-z]:/.test(clean) || segs.some((s) => !s || s === '.' || s === '..' || s.startsWith('.'))) return null;
  return clean;
}

function readZip(buf) {
  let count = 0;
  let total = 0;
  const files = unzipSync(new Uint8Array(buf), {
    // Checked before anything is decompressed, so a zip bomb never expands.
    filter: (f) => {
      if (f.name.endsWith('/')) return false;
      if (++count > MAX_FILES) throw new HttpError(413, `The archive has more than ${MAX_FILES} files.`);
      if (f.originalSize > MAX_FILE_BYTES) throw new HttpError(413, `"${f.name}" is larger than 50 MB.`);
      total += f.originalSize;
      if (total > MAX_TOTAL_BYTES) throw new HttpError(413, 'The archive unpacks to more than 300 MB.');
      return true;
    },
  });
  return Object.entries(files).map(([name, data]) => ({ name, data: Buffer.from(data) }));
}

function readTar(buf) {
  const out = [];
  let longName = null;
  let total = 0;
  for (let off = 0; off + 512 <= buf.length; ) {
    const header = buf.subarray(off, off + 512);
    if (header.every((b) => b === 0)) break;
    const str = (a, b) => header.subarray(a, b).toString('utf8').replace(/\0.*$/s, '');
    const size = parseInt(str(124, 136).trim() || '0', 8) || 0;
    const type = String.fromCharCode(header[156] || 48);
    let name = longName || (str(345, 500) ? `${str(345, 500)}/${str(0, 100)}` : str(0, 100));
    longName = null;
    const data = buf.subarray(off + 512, off + 512 + size);
    off += 512 + Math.ceil(size / 512) * 512;
    if (type === 'L') {
      longName = data.toString('utf8').replace(/\0.*$/s, '');
      continue;
    }
    if (type !== '0' && type !== '\0' && type !== '7') continue; // only regular files (no links or devices)
    if (out.length >= MAX_FILES) throw new HttpError(413, `The archive has more than ${MAX_FILES} files.`);
    if (size > MAX_FILE_BYTES) throw new HttpError(413, `"${name}" is larger than 50 MB.`);
    total += size;
    if (total > MAX_TOTAL_BYTES) throw new HttpError(413, 'The archive unpacks to more than 300 MB.');
    out.push({ name, data: Buffer.from(data) });
  }
  return out;
}

const isTar = (buf) => buf.length > 262 && buf.subarray(257, 262).toString() === 'ustar';
const isZip = (buf) => buf[0] === 0x50 && buf[1] === 0x4b;
const isGzip = (buf) => buf[0] === 0x1f && buf[1] === 0x8b;

/** Turns an upload into a list of { name, data } entries. */
function unpack(buf, filename) {
  if (isZip(buf)) return readZip(buf);
  if (isGzip(buf)) {
    let inner;
    try {
      inner = zlib.gunzipSync(buf, { maxOutputLength: MAX_TOTAL_BYTES });
    } catch {
      throw new HttpError(400, 'This .gz file is damaged or too large.');
    }
    if (isTar(inner)) return readTar(inner);
    // arXiv sometimes ships a single gzipped .tex file.
    return [{ name: filename.replace(/\.gz$/i, '').replace(/\.(tgz)$/i, '.tex') || 'main.tex', data: inner }];
  }
  if (isTar(buf)) return readTar(buf);
  if (/\.(tex|ltx)$/i.test(filename)) return [{ name: path.basename(filename), data: buf }];
  throw new HttpError(415, 'Unsupported file. Import a .zip, .tar.gz, .tgz, .tar, .gz or .tex export.');
}

/** Exports often wrap everything in one folder ("my-paper/…"); drop it. */
function stripCommonFolder(entries) {
  const firsts = new Set(entries.map((e) => (e.name.includes('/') ? e.name.split('/')[0] : '')));
  if (firsts.size !== 1 || firsts.has('')) return entries;
  const prefix = [...firsts][0] + '/';
  return entries.map((e) => ({ ...e, name: e.name.slice(prefix.length) }));
}

/** The file to compile: a root-level .tex with \documentclass, preferring the usual names. */
export function detectMain(entries) {
  const texs = entries.filter((e) => /\.tex$/i.test(e.name));
  const isRoot = (e) => /^\\documentclass/m.test(e.data.toString('utf8')) && /\\begin\{document\}/.test(e.data.toString('utf8'));
  const candidates = texs.filter(isRoot);
  const pool = candidates.length ? candidates : texs;
  if (!pool.length) return null;
  const score = (e) => {
    const base = path.basename(e.name).toLowerCase();
    const named = MAIN_NAMES.indexOf(base);
    return (e.name.includes('/') ? 100 : 0) + (named >= 0 ? named : 50);
  };
  return pool.sort((a, b) => score(a) - score(b) || a.name.localeCompare(b.name))[0].name;
}

/** Make a valid, unused project name from what the user typed (or the file name). */
function uniqueName(wanted) {
  let base = String(wanted || 'Imported project')
    .replace(/\.(zip|tar\.gz|tgz|tar|gz|tex)$/i, '')
    .replace(/[^\w .-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[^\w]+/, '')
    .slice(0, 56);
  if (!base) base = 'Imported project';
  let name = base;
  for (let i = 2; fs.existsSync(path.join(PROJECTS, name)); i++) name = `${base} ${i}`;
  return name;
}

export async function importProject(buf, { filename = '', name } = {}) {
  if (!buf?.length) throw new HttpError(400, 'The file is empty.');
  let entries = unpack(buf, filename);
  const skipped = [];
  entries = stripCommonFolder(entries).filter((e) => {
    const clean = cleanPath(e.name);
    if (!clean || JUNK.test(clean)) {
      if (clean || e.name) skipped.push(e.name);
      return false;
    }
    e.name = clean;
    return true;
  });
  if (!entries.length) throw new HttpError(400, 'No usable files were found in this export.');
  if (!entries.some((e) => /\.tex$/i.test(e.name))) throw new HttpError(400, 'This export has no .tex files.');

  const project = uniqueName(name || filename);
  const dir = path.join(PROJECTS, project);
  await fsp.mkdir(dir, { recursive: true });
  try {
    for (const e of entries) {
      const full = path.resolve(dir, e.name);
      if (!full.startsWith(path.resolve(dir) + path.sep)) continue;
      await fsp.mkdir(path.dirname(full), { recursive: true });
      await fsp.writeFile(full, e.data);
    }
    const main = detectMain(entries);
    await setMeta(project, { main: main || 'main.tex', importedFrom: path.basename(filename) || null, importedAt: Date.now() });
    return {
      name: project,
      main,
      files: entries.length,
      images: entries.filter((e) => kindOf(e.name) === 'image').length,
      skipped: skipped.length,
    };
  } catch (err) {
    await fsp.rm(dir, { recursive: true, force: true });
    throw err;
  }
}
