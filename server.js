import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, sendJson, readJson, readBody, HttpError } from './lib/util.js';
import { getSettings, publicSettings, updateSettings } from './lib/settings.js';
import * as projects from './lib/projects.js';
import { compileProject, detectEngines, installTectonic } from './lib/compile.js';
import { providerStatus, listModels, streamChat, buildMessages, SYSTEM_PROMPT } from './lib/ai.js';
import * as access from './lib/access.js';
import { attachCollab, room, flushProject, closeRoom, kickGuests } from './lib/rooms.js';
import * as network from './lib/network.js';
import { importProject } from './lib/importer.js';
import { inverseSearch } from './lib/synctex.js';

const PORT = Number(process.env.PORT) || 5178;

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

const PUBLIC = path.join(ROOT, 'public');
const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
};

function serveFile(res, file, extraHeaders = {}, req = null) {
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) return sendJson(res, 404, { error: 'Not found' });
    const modified = new Date(Math.floor(st.mtimeMs / 1000) * 1000);
    const since = req?.headers['if-modified-since'];
    if (since && new Date(since) >= modified) {
      res.writeHead(304, { 'Last-Modified': modified.toUTCString(), ...extraHeaders });
      return res.end();
    }
    res.writeHead(200, {
      'Last-Modified': modified.toUTCString(),
      'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Content-Length': st.size,
      ...SECURITY_HEADERS,
      ...extraHeaders,
    });
    fs.createReadStream(file).pipe(res);
  });
}

/** The app shell is public; it holds no data. Everything else goes through access checks. */
function serveStatic(req, res, pathname) {
  const rel = decodeURIComponent(pathname.slice(1)) || 'index.html';
  const full = path.resolve(PUBLIC, rel);
  if (!full.startsWith(PUBLIC + path.sep)) return sendJson(res, 403, { error: 'Forbidden' });
  // Always revalidate (cheap 304s), so a `git pull` + restart is picked up immediately.
  serveFile(res, full, { 'Cache-Control': 'no-cache' }, req);
}

function redirect(res, location, cookie) {
  res.writeHead(302, { Location: location, 'Cache-Control': 'no-store', ...SECURITY_HEADERS, ...(cookie ? { 'Set-Cookie': cookie } : {}) });
  res.end();
}

/** Only pages served by this server may call the API (blocks other websites from using your browser against it). */
function checkOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return;
  try {
    if (new URL(origin).host === req.headers.host) return;
  } catch {}
  throw new HttpError(403, 'Cross-origin request blocked');
}

const routes = [];
const route = (method, pattern, handler) => {
  const keys = [];
  const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => (keys.push(k), '([^/]+)')) + '$');
  routes.push({ method, re, keys, handler });
};

/* ───────── who am I ───────── */

route('GET', '/api/me', async (req, { who }) => {
  if (who.owner) return { owner: true };
  return { owner: false, projects: [...who.grants].map(([name, g]) => ({ name, role: g.role, ai: g.ai })) };
});

/* ───────── settings & AI ───────── */

const guestCanUseAI = (who) => [...who.grants.values()].some((g) => g.ai);

route('GET', '/api/status', async (req, { who }) => {
  if (who.owner) {
    const [engines, providers] = await Promise.all([detectEngines(), providerStatus()]);
    return { settings: publicSettings(), engines, providers, platform: process.platform };
  }
  // Guests see which models they may use, never keys, paths or settings.
  const providers = {};
  if (guestCanUseAI(who)) {
    for (const [id, p] of Object.entries(await providerStatus())) providers[id] = { id, label: p.label, sub: p.sub, kind: p.kind, available: p.available, detail: p.available ? 'Provided by the owner' : 'Not available' };
  }
  return { settings: { engine: getSettings().engine }, engines: {}, providers, guest: true };
});

route('POST', '/api/settings', async (req, { who }) => {
  access.requireOwner(who);
  const settings = updateSettings(await readJson(req));
  return { settings, providers: await providerStatus(true) };
});

route('POST', '/api/tectonic/install', async (req, { who }) => {
  access.requireOwner(who);
  return installTectonic();
});

route('GET', '/api/models', async (req, { who, url }) => {
  if (!who.owner && !guestCanUseAI(who)) throw new HttpError(403, 'The owner hasn’t enabled AI for your link.');
  return { models: await listModels(url.searchParams.get('provider')) };
});

/** Streams the model's reply as server-sent events. */
route('POST', '/api/chat', async (req, { who, res }) => {
  const body = await readJson(req);
  if (!who.owner) {
    const g = access.requireProject(who, String(body.project || ''), 'viewer');
    if (!g.ai) throw new HttpError(403, 'The owner hasn’t enabled AI for your link.');
  }
  const messages = buildMessages(body.messages, body.context);
  const ctrl = new AbortController();
  res.on('close', () => ctrl.abort());
  res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  const send = (obj) => !res.writableEnded && res.write(`data: ${JSON.stringify(obj)}\n\n`);
  send({ type: 'start' });
  try {
    for await (const text of streamChat({ provider: body.provider, model: body.model, system: SYSTEM_PROMPT, messages, signal: ctrl.signal })) send({ type: 'text', text });
    send({ type: 'done' });
  } catch (e) {
    if (!ctrl.signal.aborted) send({ type: 'error', error: e.message || String(e) });
  }
  res.end();
  return { __handled: true };
});

/* ───────── projects (owner) ───────── */

route('GET', '/api/projects', async (req, { who }) => {
  if (who.owner) return { projects: await projects.listProjects() };
  return { projects: [...who.grants].map(([name, g]) => ({ name, role: g.role, ai: g.ai })) };
});

route('POST', '/api/projects', async (req, { who }) => {
  access.requireOwner(who);
  const { name, template } = await readJson(req);
  return projects.createProject(name, template);
});

/** Import an export from Overleaf, Prism, arXiv, … (zip / tar.gz / tex) as a new project. */
route('POST', '/api/projects/import', async (req, { who, url }) => {
  access.requireOwner(who);
  const buf = await readBody(req, 300 * 1024 * 1024);
  return importProject(buf, { filename: url.searchParams.get('filename') || '', name: url.searchParams.get('name') || '' });
});

route('DELETE', '/api/projects/:p', async (req, { who, params }) => {
  access.requireOwner(who);
  await closeRoom(params.p);
  await projects.deleteProject(params.p);
  access.invalidateShares();
  return { ok: true };
});

/* ───────── files (owner or guests with a link) ───────── */

route('GET', '/api/projects/:p/files', async (req, { who, params }) => {
  access.requireProject(who, params.p);
  const { main } = await projects.getMeta(params.p);
  return { files: await projects.listFiles(params.p), meta: { main } };
});

route('GET', '/api/projects/:p/file', async (req, { who, params, url }) => {
  access.requireProject(who, params.p);
  const { full } = projects.resolveIn(params.p, url.searchParams.get('path'));
  return { __file: full, __headers: { 'Cache-Control': 'no-store', 'Content-Security-Policy': "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'" } };
});

route('POST', '/api/projects/:p/files', async (req, { who, params }) => {
  access.requireProject(who, params.p, 'editor');
  const { path: rel, content } = await readJson(req);
  await (await room(params.p)).createText(rel, typeof content === 'string' ? content : '');
  return { ok: true };
});

route('PUT', '/api/projects/:p/file', async (req, { who, params, url }) => {
  access.requireProject(who, params.p, 'editor');
  const rel = url.searchParams.get('path');
  const buf = await readBody(req);
  await projects.writeFile(params.p, rel, buf);
  await (await room(params.p)).uploaded(rel, buf.length);
  return { ok: true };
});

route('DELETE', '/api/projects/:p/file', async (req, { who, params, url }) => {
  access.requireProject(who, params.p, 'editor');
  await (await room(params.p)).remove(url.searchParams.get('path'));
  return { ok: true };
});

route('POST', '/api/projects/:p/rename', async (req, { who, params }) => {
  access.requireProject(who, params.p, 'editor');
  const { from, to } = await readJson(req);
  await (await room(params.p)).rename(from, to);
  return { ok: true };
});

route('POST', '/api/projects/:p/meta', async (req, { who, params }) => {
  access.requireProject(who, params.p, 'editor');
  const { main } = await readJson(req);
  await (await room(params.p)).setMain(main);
  return { ok: true };
});

route('POST', '/api/projects/:p/compile', async (req, { who, params }) => {
  access.requireProject(who, params.p);
  const { engine } = await readJson(req);
  await flushProject(params.p);
  const guard = (await access.listShares(params.p)).some((s) => s.role === 'editor');
  return compileProject(params.p, { engine: who.owner ? engine : undefined, guard });
});

route('GET', '/api/projects/:p/pdf', async (req, { who, params }) => {
  access.requireProject(who, params.p);
  const meta = await projects.getMeta(params.p);
  return { __file: path.join(projects.projectDir(params.p), '.out', path.basename(meta.main, '.tex') + '.pdf'), __headers: { 'Cache-Control': 'no-store' } };
});

/** Click in the PDF → source file and line (SyncTeX). */
route('GET', '/api/projects/:p/synctex', async (req, { who, params, url }) => {
  access.requireProject(who, params.p);
  const { main } = await projects.getMeta(params.p);
  const num = (k) => Number(url.searchParams.get(k));
  const [page, x, y] = [num('page'), num('x'), num('y')];
  if (!Number.isInteger(page) || page < 1 || !Number.isFinite(x) || !Number.isFinite(y)) throw new HttpError(400, 'page, x and y are required');
  const hit = await inverseSearch(projects.projectDir(params.p), main, page, x, y);
  return hit ? { found: true, ...hit } : { found: false };
});

/* ───────── sharing (owner) ───────── */

route('GET', '/api/projects/:p/shares', async (req, { who, params }) => {
  access.requireOwner(who);
  return { shares: await access.listShares(params.p) };
});

route('POST', '/api/projects/:p/shares', async (req, { who, params }) => {
  access.requireOwner(who);
  projects.projectDir(params.p);
  return access.createShare(params.p, await readJson(req));
});

route('PATCH', '/api/projects/:p/shares/:token', async (req, { who, params }) => {
  access.requireOwner(who);
  const share = await access.updateShare(params.p, params.token, await readJson(req));
  await kickGuests(params.p);
  return share;
});

route('DELETE', '/api/projects/:p/shares/:token', async (req, { who, params }) => {
  access.requireOwner(who);
  await access.revokeShare(params.p, params.token);
  await kickGuests(params.p);
  return { ok: true };
});

/* ───────── network (owner) ───────── */

let currentHost = null;
const hostFromEnv = process.env.HOST || null;

function networkInfo() {
  const lan = currentHost === '0.0.0.0' || currentHost === '::';
  return {
    port: PORT,
    lan,
    lanLocked: !!hostFromEnv,
    addresses: lan ? network.lanAddresses().map((a) => `http://${a.address}:${PORT}`) : [],
    tunnel: network.tunnelStatus(),
  };
}

route('GET', '/api/network', async (req, { who }) => {
  access.requireOwner(who);
  return { ...networkInfo(), cloudflared: !!(await network.cloudflaredPath()) };
});

route('POST', '/api/network', async (req, { who }) => {
  access.requireOwner(who);
  const { lan } = await readJson(req);
  if (hostFromEnv) throw new HttpError(400, 'The address is fixed by the HOST environment variable.');
  updateSettings({ lanAccess: !!lan });
  await listen(lan ? '0.0.0.0' : '127.0.0.1');
  return { ...networkInfo(), cloudflared: !!(await network.cloudflaredPath()) };
});

route('POST', '/api/tunnel/start', async (req, { who }) => {
  access.requireOwner(who);
  await network.startTunnel(PORT);
  return { ...networkInfo(), cloudflared: true };
});

route('POST', '/api/tunnel/stop', async (req, { who }) => {
  access.requireOwner(who);
  network.stopTunnel();
  return { ...networkInfo(), cloudflared: !!(await network.cloudflaredPath()) };
});

route('POST', '/api/tunnel/install', async (req, { who }) => {
  access.requireOwner(who);
  await network.installCloudflared();
  return { ...networkInfo(), cloudflared: true };
});

/* ───────── server ───────── */

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const { pathname } = url;
  try {
    // Share link: remember it in an HttpOnly cookie, then open the project (the token never stays in the address bar).
    let m;
    if ((m = pathname.match(/^\/s\/([A-Za-z0-9_-]{16,64})$/))) {
      const r = await access.joinWithToken(req, m[1]);
      return r.ok ? redirect(res, `/?project=${encodeURIComponent(r.project)}`, r.cookie) : redirect(res, '/?link=invalid');
    }
    if ((m = pathname.match(/^\/owner\/([A-Za-z0-9_-]{16,64})$/))) {
      const cookie = access.ownerLogin(req, m[1]);
      return cookie ? redirect(res, '/', cookie) : redirect(res, '/?link=invalid');
    }
    if (!pathname.startsWith('/api/')) {
      if (req.method !== 'GET' && req.method !== 'HEAD') return sendJson(res, 405, { error: 'Method not allowed' });
      return serveStatic(req, res, pathname);
    }
    checkOrigin(req);
    const who = await access.identify(req);
    for (const r of routes) {
      if (r.method !== req.method) continue;
      const match = pathname.match(r.re);
      if (!match) continue;
      const params = Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(match[i + 1])]));
      const result = await r.handler(req, { who, params, url, res });
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

attachCollab(server, async (req, project) => {
  checkOrigin(req);
  const who = await access.identify(req);
  const g = access.requireProject(who, project);
  return who.owner ? 'owner' : g.role;
});

/** (Re)binds the server: 127.0.0.1 = only this computer, 0.0.0.0 = also other devices on the network. */
function listen(host) {
  return new Promise((resolve, reject) => {
    const start = () => {
      server.once('error', reject);
      server.listen(PORT, host, () => {
        server.off('error', reject);
        currentHost = host;
        resolve();
      });
    };
    if (server.listening) {
      server.close();
      server.closeIdleConnections?.();
    }
    start();
  });
}

await projects.ensureWelcomeProject();
await listen(hostFromEnv || (getSettings().lanAccess ? '0.0.0.0' : '127.0.0.1'));
const info = networkInfo();
console.log(`\n  PaperWriter is running → http://localhost:${PORT}`);
if (info.lan) for (const a of info.addresses) console.log(`  On your network         → ${a}`);
console.log(`\n  Owner sign-in from another device (keep this private):\n  http://<this-computer>:${PORT}/owner/${access.ownerSecret()}\n`);
