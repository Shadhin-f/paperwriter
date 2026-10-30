import { execFile, spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DATA = path.join(ROOT, '.data');
export const BIN = path.join(DATA, 'bin');
export const PROJECTS = path.join(ROOT, 'projects');
export const IS_WIN = process.platform === 'win32';

/** Resolve a command on PATH. Returns the full path or null. */
export function which(cmd) {
  return new Promise((resolve) => {
    execFile(IS_WIN ? 'where' : 'which', [cmd], { timeout: 5000, windowsHide: true }, (err, out) => {
      if (err) return resolve(null);
      const hits = String(out).split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
      // Prefer real executables over shell shims on Windows.
      resolve(hits.find((h) => /\.exe$/i.test(h)) || hits[0] || null);
    });
  });
}

/** Spawn a program, transparently handling Windows .cmd/.bat shims. */
export function spawnProgram(file, args, opts = {}) {
  if (IS_WIN && /\.(cmd|bat)$/i.test(file)) {
    const q = (s) => `"${String(s).replace(/"/g, '""')}"`;
    return spawn([q(file), ...args.map(q)].join(' '), { ...opts, shell: true, windowsHide: true });
  }
  return spawn(file, args, { ...opts, windowsHide: true });
}

/** Run a program to completion and collect its output. Never rejects. */
export function run(file, args, { cwd, env, timeout = 300000, input } = {}) {
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let child;
    try {
      child = spawnProgram(file, args, { cwd, env: env ? { ...process.env, ...env } : process.env });
    } catch (e) {
      return resolve({ code: -1, stdout, stderr: String(e.message || e) });
    }
    const timer = setTimeout(() => {
      stderr += `\n[PaperWriter] Timed out after ${Math.round(timeout / 1000)}s.`;
      child.kill();
    }, timeout);
    child.stdout?.on('data', (d) => (stdout += d));
    child.stderr?.on('data', (d) => (stderr += d));
    child.on('error', (e) => (stderr += `\n${e.message}`));
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? -1, stdout, stderr });
    });
    if (input != null) child.stdin.end(input);
    else child.stdin?.end();
  });
}

export function sendJson(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(body);
}

export async function readBody(req, limit = 50 * 1024 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > limit) throw Object.assign(new Error('Request body too large'), { status: 413 });
    chunks.push(c);
  }
  return Buffer.concat(chunks);
}

export async function readJson(req) {
  // Vercel's Node runtime has already parsed the body.
  if (req.body !== undefined) return typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
  const buf = await readBody(req);
  if (!buf.length) return {};
  try {
    return JSON.parse(buf.toString('utf8'));
  } catch {
    throw Object.assign(new Error('Invalid JSON body'), { status: 400 });
  }
}

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
