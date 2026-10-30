import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { BIN, IS_WIN, which, run, HttpError } from './util.js';
import { getSettings } from './settings.js';
import { projectDir, getMeta, kindOf } from './projects.js';

const LOCAL_ENGINES = ['tectonic', 'latexmk', 'pdflatex', 'xelatex', 'lualatex'];
const TECTONIC_LOCAL = path.join(BIN, IS_WIN ? 'tectonic.exe' : 'tectonic');
/** On Vercel there is no TeX install, so the only engine is texlive.net. */
export const HOSTED = !!process.env.VERCEL;

let engineCache = null;
let engineCacheAt = 0;

export async function detectEngines(force = false) {
  if (HOSTED) return Object.fromEntries([...LOCAL_ENGINES, 'bibtex', 'biber'].map((n) => [n, null]));
  if (!force && engineCache && Date.now() - engineCacheAt < 30000) return engineCache;
  const found = {};
  const names = [...LOCAL_ENGINES, 'bibtex', 'biber'];
  const hits = await Promise.all(names.map((n) => which(n)));
  names.forEach((n, i) => (found[n] = hits[i]));
  if (fs.existsSync(TECTONIC_LOCAL)) found.tectonic = TECTONIC_LOCAL;
  engineCache = found;
  engineCacheAt = Date.now();
  return found;
}

/** Pick the engine: explicit choice if available, else the best local one, else online (if allowed). */
function chooseEngine(requested, found, allowOnline) {
  if (HOSTED) return 'online';
  if (requested && requested !== 'auto') {
    if (requested === 'online') return allowOnline ? 'online' : null;
    return found[requested] ? requested : null;
  }
  for (const e of LOCAL_ENGINES) if (found[e]) return e;
  return allowOnline ? 'online' : null;
}

/** fontspec/polyglossia need a Unicode engine. */
function wantsUnicodeEngine(src) {
  return /\\usepackage(\[[^\]]*\])?\{[^}]*\b(fontspec|polyglossia|unicode-math|xeCJK)\b/.test(src);
}

const locks = new Map();

/** Serialize compiles per key so rapid saves don't trample each other's output. */
async function withLock(key, fn) {
  const prev = locks.get(key) || Promise.resolve();
  const next = prev.catch(() => {}).then(fn);
  locks.set(key, next);
  try {
    return await next;
  } finally {
    if (locks.get(key) === next) locks.delete(key);
  }
}

/** Compile a project stored on disk (local mode). */
export async function compileProject(project, opts = {}) {
  return withLock(`project:${project}`, async () => {
    const dir = projectDir(project);
    const { main } = await getMeta(project);
    const r = await compileDir(dir, main, opts);
    const { pdfPath, ...result } = r;
    return { ...result, pdf: r.hasPdf ? `/api/projects/${encodeURIComponent(project)}/pdf?t=${Date.now()}` : null };
  });
}

/**
 * Compile files sent by the browser (cloud projects): [{ path, content } | { path, base64 }].
 * Returns the PDF inline as base64.
 */
export async function compileFiles(files, main, opts = {}) {
  if (!Array.isArray(files) || !files.length) throw new HttpError(400, 'No files to compile');
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'paperwriter-'));
  try {
    for (const f of files) {
      const clean = String(f.path || '').replace(/\\/g, '/').replace(/^\/+/, '');
      if (!clean || clean.split('/').some((s) => s === '..' || s === '')) throw new HttpError(400, `Invalid file path "${f.path}"`);
      const full = path.join(dir, clean);
      await fsp.mkdir(path.dirname(full), { recursive: true });
      await fsp.writeFile(full, f.base64 != null ? Buffer.from(f.base64, 'base64') : String(f.content ?? ''));
    }
    const r = await compileDir(dir, main, opts);
    const { pdfPath, ...result } = r;
    return { ...result, pdfBase64: r.hasPdf ? (await fsp.readFile(pdfPath)).toString('base64') : null };
  } finally {
    fsp.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

async function compileDir(dir, main, { engine: requested } = {}) {
  const mainFull = path.join(dir, main || '');
  if (!main || !fs.existsSync(mainFull)) return { ok: false, errors: [], warnings: [], log: `Main file "${main}" not found.` };

  const settings = getSettings();
  const found = await detectEngines();
  const engine = chooseEngine(requested || settings.engine, found, settings.allowOnline);
  if (!engine) {
    return {
      ok: false,
      needsEngine: true,
      errors: [],
      warnings: [],
      log: 'No LaTeX engine available. Install Tectonic from Settings → Compiler (one click), install TeX Live / MiKTeX, or enable the online compiler.',
    };
  }

  const outDir = path.join(dir, '.out');
  await fsp.mkdir(outDir, { recursive: true });
  const base = path.basename(main, '.tex');
  const pdfPath = path.join(outDir, `${base}.pdf`);
  const logPath = path.join(outDir, `${base}.log`);
  const src = await fsp.readFile(mainFull, 'utf8');
  const started = Date.now();
  const before = fs.existsSync(pdfPath) ? fs.statSync(pdfPath).mtimeMs : 0;
  let output = '';

  if (engine === 'tectonic') {
    const r = await run(found.tectonic, ['--keep-logs', '--keep-intermediates', '--synctex', '--outdir', '.out', main], { cwd: dir });
    output = r.stdout + r.stderr;
  } else if (engine === 'latexmk') {
    const flavor = wantsUnicodeEngine(src) ? '-xelatex' : '-pdf';
    const r = await run(found.latexmk, [flavor, '-interaction=nonstopmode', '-file-line-error', '-synctex=1', '-outdir=.out', main], { cwd: dir });
    output = r.stdout + r.stderr;
  } else if (engine === 'online') {
    output = await compileOnline(dir, main, src, pdfPath, logPath);
  } else {
    output = await compileManual(engine, found, dir, main, base, outDir);
  }

  const after = fs.existsSync(pdfPath) ? fs.statSync(pdfPath).mtimeMs : 0;
  let log = '';
  try {
    log = await fsp.readFile(logPath, 'utf8');
  } catch {}
  const full = [output.trim(), log.trim()].filter(Boolean).join('\n\n──────── log ────────\n\n');
  const { errors, warnings } = parseLog(full, main);
  const produced = after > 0 && after >= before && after >= started - 1000;

  return {
    ok: produced && errors.length === 0,
    engine,
    hasPdf: after > 0,
    pdfPath,
    stale: !produced && after > 0,
    durationMs: Date.now() - started,
    errors,
    warnings: warnings.slice(0, 50),
    log: full.length > 300000 ? '…(truncated)…\n' + full.slice(-300000) : full,
  };
}

async function compileManual(engine, found, dir, main, base, outDir) {
  const args = ['-interaction=nonstopmode', '-file-line-error', '-synctex=1', '-output-directory=.out', main];
  let out = '';
  const pass = async () => {
    const r = await run(found[engine], args, { cwd: dir, timeout: 180000 });
    out = r.stdout + r.stderr;
  };
  await pass();
  const aux = path.join(outDir, `${base}.aux`);
  const auxSrc = fs.existsSync(aux) ? await fsp.readFile(aux, 'utf8') : '';
  const bcf = path.join(outDir, `${base}.bcf`);
  if (fs.existsSync(bcf) && found.biber) {
    await run(found.biber, [`--input-directory=${dir}`, `--output-directory=${outDir}`, base], { cwd: dir });
    await pass();
  } else if (/\\(citation|bibdata)/.test(auxSrc) && found.bibtex) {
    const sep = IS_WIN ? ';' : ':';
    await run(found.bibtex, [base], { cwd: outDir, env: { BIBINPUTS: `${dir}${sep}`, BSTINPUTS: `${dir}${sep}` } });
    await pass();
  }
  for (let i = 0; i < 2 && /Rerun to get|Label\(s\) may have changed|undefined references/i.test(out); i++) await pass();
  return out;
}

async function listDir(dir, sub = '') {
  const out = [];
  for (const e of await fsp.readdir(path.join(dir, sub), { withFileTypes: true })) {
    if (e.name.startsWith('.')) continue;
    const rel = sub ? `${sub}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...(await listDir(dir, rel)));
    else out.push(rel);
  }
  return out;
}

async function compileOnline(dir, main, src, pdfPath, logPath) {
  const fd = new FormData();
  const skipped = [];
  for (const rel of await listDir(dir)) {
    if (kindOf(rel) !== 'text') {
      skipped.push(rel);
      continue;
    }
    fd.append('filecontents[]', await fsp.readFile(path.join(dir, rel), 'utf8'));
    fd.append('filename[]', rel === main ? 'document.tex' : rel);
  }
  const eng = wantsUnicodeEngine(src) ? 'xelatex' : 'pdflatex';
  fd.append('engine', eng);
  fd.append('return', 'pdf');
  let note = `Compiled online with texlive.net (${eng}).`;
  if (skipped.length) note += `\nNote: the online compiler only receives text files. Not sent: ${skipped.join(', ')}`;
  try {
    const r = await fetch('https://texlive.net/cgi-bin/latexcgi', { method: 'POST', body: fd, signal: AbortSignal.timeout(120000) });
    const buf = Buffer.from(await r.arrayBuffer());
    const isPdf = (r.headers.get('content-type') || '').includes('pdf') || buf.subarray(0, 5).toString() === '%PDF-';
    if (isPdf) {
      await fsp.writeFile(pdfPath, buf);
      await fsp.writeFile(logPath, note);
      return '';
    }
    await fsp.writeFile(logPath, buf.toString('utf8'));
    return note;
  } catch (e) {
    return `${note}\nOnline compile failed: ${e.message}`;
  }
}

/** Pull errors/warnings with file + line out of TeX/Tectonic output. */
export function parseLog(text, main) {
  const errors = [];
  const warnings = [];
  const seen = new Set();
  const add = (list, file, line, message) => {
    message = message.trim();
    if (/^(something bad happened inside|the \w+ engine had an unrecoverable error|halted on potentially-recoverable error|failed to execute|emergency stop|==> fatal error occurred)/i.test(message)) return;
    const key = `${file || main}:${line}:${message.replace(/\.$/, '')}`;
    if (!message || seen.has(key)) return;
    seen.add(key);
    list.push({ file: file || main, line: line ? Number(line) : null, message });
  };
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    let m;
    if ((m = l.match(/^(error|warning):\s*(?:([^\s:]+\.\w+):(\d+):\s*)?(.*)$/i))) {
      // Tectonic: "error: main.tex:12: Undefined control sequence"
      if (/^warning/i.test(m[1])) add(warnings, m[2], m[3], m[4]);
      else add(errors, m[2], m[3], m[4]);
    } else if ((m = l.match(/^(?:\.\/)?([^\s:]+\.(?:tex|sty|cls|bib)):(\d+):\s*(.*)$/))) {
      // -file-line-error: "./main.tex:12: Undefined control sequence."
      const ctx = lines[i + 1]?.startsWith('l.') ? ` (${lines[i + 1].replace(/^l\.\d+\s*/, '').trim()})` : '';
      add(errors, m[1], m[2], m[3] + ctx);
    } else if ((m = l.match(/^! (.*)$/))) {
      let line = null;
      for (let j = i + 1; j < Math.min(i + 12, lines.length); j++) {
        const lm = lines[j].match(/^l\.(\d+)/);
        if (lm) {
          line = lm[1];
          break;
        }
      }
      add(errors, null, line, m[1]);
    } else if ((m = l.match(/^(?:LaTeX|Package \w+) Warning: (.*?)(?: on input line (\d+))?\.?$/))) {
      add(warnings, null, m[2], m[1]);
    }
  }
  return { errors, warnings };
}

/** Download the latest Tectonic release into .data/bin. */
export async function installTectonic() {
  const plat = process.platform;
  const arch = process.arch;
  const target =
    plat === 'win32' ? 'x86_64-pc-windows-msvc.zip'
    : plat === 'darwin' ? (arch === 'arm64' ? 'aarch64-apple-darwin.tar.gz' : 'x86_64-apple-darwin.tar.gz')
    : arch === 'arm64' ? 'aarch64-unknown-linux-musl.tar.gz' : 'x86_64-unknown-linux-musl.tar.gz';

  const rel = await fetch('https://api.github.com/repos/tectonic-typesetting/tectonic/releases/latest', {
    headers: { 'User-Agent': 'PaperWriter', Accept: 'application/vnd.github+json' },
  });
  if (!rel.ok) throw new Error(`GitHub API error ${rel.status}`);
  const info = await rel.json();
  const asset = info.assets?.find((a) => a.name.endsWith(target));
  if (!asset) throw new Error(`No Tectonic build for ${plat}/${arch} in release ${info.tag_name}`);

  await fsp.mkdir(BIN, { recursive: true });
  const archive = path.join(BIN, asset.name);
  const dl = await fetch(asset.browser_download_url, { headers: { 'User-Agent': 'PaperWriter' } });
  if (!dl.ok) throw new Error(`Download failed (${dl.status})`);
  await fsp.writeFile(archive, Buffer.from(await dl.arrayBuffer()));

  // Windows 10+ ships bsdtar, which also extracts .zip files.
  const r = await run('tar', ['-xf', archive, '-C', BIN], { timeout: 120000 });
  await fsp.rm(archive, { force: true });
  if (!fs.existsSync(TECTONIC_LOCAL)) throw new Error(`Extraction failed: ${r.stderr || r.stdout}`);
  if (!IS_WIN) await fsp.chmod(TECTONIC_LOCAL, 0o755);
  await detectEngines(true);
  return { ok: true, version: info.tag_name, path: TECTONIC_LOCAL };
}
