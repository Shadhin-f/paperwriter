import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, sendJson, readJson, readBody, HttpError } from './lib/util.js';
import { publicSettings, updateSettings } from './lib/settings.js';
import * as projects from './lib/projects.js';
import { compileProject, installTectonic } from './lib/compile.js';
import { providerStatus } from './lib/ai.js';
import * as handlers from './lib/handlers.js';
import { cloudEnabled, requireUser } from './lib/auth.js';

const PORT = Number(process.env.PORT) || 5178;
const HOST = process.env.HOST || '127.0.0.1';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.pdf': 'application/pdf',
  '.json': 'application/json',
  '.ico': 'image/x-icon',
  '.map': 'application/json',
  '.bcmap': 'application/octet-stream',
  '.wasm': 'application/wasm',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
};

// Everything the browser needs lives in public/ (vendor files are copied there by `npm run build`).
const STATIC_ROOTS = { '/': path.join(ROOT, 'public') };

function serveFile(res, file, extraHeaders = {}) {
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) return sendJson(res, 404, { error: 'Not found' });
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Content-Length': st.size,
      ...extraHeaders,
    });
    fs.createReadStream(file).pipe(res);
  });
}

function serveStatic(req, res, pathname) {
  for (const [prefix, dir] of Object.entries(STATIC_ROOTS)) {
    if (!pathname.startsWith(prefix)) continue;
    let rel = decodeURIComponent(pathname.slice(prefix.length)) || 'index.html';
    const full = path.resolve(dir, rel);
    if (!full.startsWith(path.resolve(dir))) return sendJson(res, 403, { error: 'Forbidden' });
    return serveFile(res, full, { 'Cache-Control': rel.startsWith('vendor/') ? 'max-age=86400' : 'no-cache' });
  }
  sendJson(res, 404, { error: 'Not found' });
}

/** Block cross-site requests: only pages served by this server may call the API. */
function checkOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return;
  try {
    const u = new URL(origin);
    if (u.host === req.headers.host) return;
  } catch {}
  throw new HttpError(403, 'Cross-origin request blocked');
}

const routes = [];
const route = (method, pattern, handler, local = false) => {
  const keys = [];
  const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => (keys.push(k), '([^/]+)')) + '$');
  routes.push({ method, re, keys, handler, local });
};

/* ───────── status & settings ───────── */

route('GET', '/api/config', handlers.config);
route('GET', '/api/status', handlers.status);
route('GET', '/api/models', handlers.models);
route('POST', '/api/chat', handlers.chat);
route('POST', '/api/compile', handlers.compile);
route('POST', '/api/invite', handlers.invite);

route('POST', '/api/settings', async (req) => {
  if (cloudEnabled()) await requireUser(req);
  const body = await readJson(req);
  const settings = updateSettings(body);
  const providers = await providerStatus(true);
  return { settings, providers };
});

route('POST', '/api/tectonic/install', async () => installTectonic());

/* ───────── projects & files ───────── */

route('GET', '/api/projects', async () => ({ projects: await projects.listProjects() }));

route('POST', '/api/projects', async (req) => {
  const { name, template } = await readJson(req);
  return projects.createProject(name, template);
});

route('DELETE', '/api/projects/:p', async (req, { p }) => {
  await projects.deleteProject(p);
  return { ok: true };
});

route('GET', '/api/projects/:p/files', async (req, { p }) => ({
  files: await projects.listFiles(p),
  meta: await projects.getMeta(p),
}));

route('POST', '/api/projects/:p/meta', async (req, { p }) => {
  const { main } = await readJson(req);
  projects.resolveIn(p, main);
  return projects.setMeta(p, { main });
});

route('GET', '/api/projects/:p/file', async (req, { p }, url) => {
  const rel = url.searchParams.get('path');
  if (url.searchParams.get('raw')) {
    const { full } = projects.resolveIn(p, rel);
    return { __file: full };
  }
  return { path: rel, content: await projects.readText(p, rel) };
});

route('PUT', '/api/projects/:p/file', async (req, { p }, url) => {
  const rel = url.searchParams.get('path');
  const buf = await readBody(req);
  await projects.writeFile(p, rel, buf);
  return { ok: true, savedAt: Date.now() };
});

route('DELETE', '/api/projects/:p/file', async (req, { p }, url) => {
  await projects.deleteFile(p, url.searchParams.get('path'));
  return { ok: true };
});

route('POST', '/api/projects/:p/rename', async (req, { p }) => {
  const { from, to } = await readJson(req);
  await projects.renameFile(p, from, to);
  return { ok: true };
});

route('POST', '/api/projects/:p/compile', async (req, { p }) => {
  const { engine } = await readJson(req);
  return compileProject(p, { engine });
});

route('GET', '/api/projects/:p/pdf', async (req, { p }) => {
  const dir = projects.projectDir(p);
  const meta = await projects.getMeta(p);
  return { __file: path.join(dir, '.out', path.basename(meta.main, '.tex') + '.pdf'), __headers: { 'Cache-Control': 'no-store' } };
});

/* ───────── server ───────── */

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const { pathname } = url;
  if (!pathname.startsWith('/api/')) {
    if (req.method !== 'GET' && req.method !== 'HEAD') return sendJson(res, 405, { error: 'Method not allowed' });
    return serveStatic(req, res, pathname);
  }
  try {
    checkOrigin(req);
    for (const r of routes) {
      if (r.method !== req.method) continue;
      const m = pathname.match(r.re);
      if (!m) continue;
      const params = Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
      const result = r.keys.length || r.local ? await r.handler(req, params, url, res) : await r.handler(req, url, res);
      if (result?.__handled) return;
      if (result?.__file) return serveFile(res, result.__file, result.__headers);
      return sendJson(res, 200, result ?? { ok: true });
    }
    sendJson(res, 404, { error: 'Unknown API route' });
  } catch (e) {
    const status = e.status || 500;
    if (status >= 500) console.error(e);
    if (!res.headersSent) sendJson(res, status, { error: e.message || String(e) });
    else res.end();
  }
});

await projects.ensureWelcomeProject();
server.listen(PORT, HOST, () => {
  console.log(`\n  ✿ PaperWriter is running → http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}\n`);
});
