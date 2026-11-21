import http from 'node:http';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, sendJson, readJson, readBody, HttpError } from './lib/util.js';
import { getSettings, publicSettings, updateSettings, setHostPassword, publicUrl } from './lib/settings.js';
import * as projects from './lib/projects.js';
import { compileProject, detectEngines, installTectonic } from './lib/compile.js';
import { providerStatus, listModels, streamChat, buildMessages, SYSTEM_PROMPT, verifyKey } from './lib/ai.js';
import * as access from './lib/access.js';
import { attachCollab, room, flushProject, closeRoom, kickGuests } from './lib/rooms.js';
import * as network from './lib/network.js';
import { importProject } from './lib/importer.js';
import { inverseSearch } from './lib/synctex.js';
import { exportProject } from './lib/exporter.js';

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

/** Who's asking, plus what the join screen needs (the workspace name, whether host sign-in is set up). */
route('GET', '/api/me', async (req, { who }) => {
  const s = getSettings();
  const workspace = { name: s.workspaceName || 'PaperWriter', hostSignIn: !!s.hostPassword };
  if (who.owner) return { owner: true, local: !!who.local, setupDone: s.setupDone, workspace };
  return { owner: false, workspace, projects: [...who.grants].map(([name, g]) => ({ name, role: g.role, ai: g.ai })) };
});

/** Host sign-in with the password chosen during setup. */
route('POST', '/api/login', async (req, { res }) => {
  const { password } = await readJson(req);
  res.setHeader('Set-Cookie', access.hostLogin(req, password));
  return { ok: true };
});

/** Leave: forgets this browser's host sign-in and invites. */
route('POST', '/api/logout', async (req, { res }) => {
  res.setHeader('Set-Cookie', access.signOutCookies());
  return { ok: true };
});

/** Join with a typed invite code (the short form of a share link). */
route('POST', '/api/join', async (req, { res }) => {
  const { code } = await readJson(req);
  const r = await access.joinWithCode(req, code);
  res.setHeader('Set-Cookie', r.cookie);
  return { project: r.project };
});

/* ───────── settings & AI ───────── */

const guestCanUseAI = (who) => [...who.grants.values()].some((g) => g.ai);



route('GET', '/api/status', async (req, { who, url }) => {
  if (who.owner) {
    // ?fresh=1 checks again right away (after installing or signing in to an AI).
    const [engines, providers] = await Promise.all([detectEngines(), providerStatus(url.searchParams.has('fresh'))]);
    return { settings: publicSettings(), engines, providers, platform: process.platform };
  }
  // Guests see which models they may use, never keys, paths or settings.
  const providers = {};
  if (guestCanUseAI(who)) {
    for (const [id, p] of Object.entries(await providerStatus())) providers[id] = { id, label: p.label, sub: p.sub, kind: p.kind, available: p.available, detail: p.available ? 'Provided by the owner' : 'Not available' };
  }
  const s = getSettings();
  return { settings: { engine: s.engine }, engines: {}, providers, guest: true, guestKeys: s.guestKeys };
});

route('POST', '/api/settings', async (req, { who }) => {
  access.requireOwner(who);
  const body = await readJson(req);
  if (typeof body.hostPassword === 'string') setHostPassword(body.hostPassword);
  const settings = updateSettings(body);
  return { settings, providers: await providerStatus(true) };
});

/** Setup guide: check an API key with its provider, and save it only if it works. */
route('POST', '/api/ai/connect', async (req, { who }) => {
  access.requireOwner(who);
  const { provider, key } = await readJson(req);
  if (!['anthropic', 'openai', 'gemini', 'openrouter'].includes(provider)) throw new HttpError(400, 'Unknown provider');
  const clean = typeof key === 'string' ? key.trim() : '';
  if (!clean) throw new HttpError(400, 'Paste your key first.');
  let found;
  try {
    found = await verifyKey(provider, clean);
  } catch (e) {
    throw new HttpError(400, e.message);
  }
  updateSettings({ keys: { [provider]: clean } });
  await providerStatus(true);
  return { ok: true, ...found };
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
    if (!g.ai) throw new HttpError(403, 'The host hasn’t shared their AI with your invite. Use your own AI from the model menu.');
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

route('POST', '/api/projects/:p/folders', async (req, { who, params }) => {
  access.requireProject(who, params.p, 'editor');
  const { path: rel } = await readJson(req);
  await (await room(params.p)).createFolder(rel);
  return { ok: true };
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
  const r = await room(params.p);
  const rel = url.searchParams.get('path');
  await (url.searchParams.get('folder') ? r.removeFolder(rel) : r.remove(rel));
  return { ok: true };
});

route('POST', '/api/projects/:p/rename', async (req, { who, params }) => {
  access.requireProject(who, params.p, 'editor');
  const { from, to, folder } = await readJson(req);
  const r = await room(params.p);
  await (folder ? r.renameFolder(from, to) : r.rename(from, to));
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

/** The whole project as a .zip, for moving to another computer or platform. */
route('GET', '/api/projects/:p/export', async (req, { who, params, res }) => {
  access.requireProject(who, params.p);
  await flushProject(params.p);
  const zipped = await exportProject(params.p);
  res.writeHead(200, {
    'Content-Type': 'application/zip',
    'Content-Length': zipped.length,
    'Content-Disposition': `attachment; filename="${params.p}.zip"`,
    'Cache-Control': 'no-store',
    ...SECURITY_HEADERS,
  });
  res.end(zipped);
  return { __handled: true };
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

/* ───────── shared AI chat (everyone in the project) ───────── */

const str = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');

/** Records a finished question and answer so everyone in the project sees it. */
route('POST', '/api/projects/:p/chat', async (req, { who, params }) => {
  access.requireProject(who, params.p, 'viewer');
  const b = await readJson(req);
  if (!str(b.prompt, 1) || !str(b.reply, 1)) throw new HttpError(400, 'A question and an answer are required.');
  const color = /^#[0-9a-f]{6}$/i.test(b.by?.color || '') ? b.by.color : '#8e8e93';
  const entry = {
    id: str(b.id, 40) || Math.random().toString(36).slice(2),
    at: Date.now(),
    by: { name: str(b.by?.name, 40) || (who.owner ? 'Host' : 'Guest'), color, host: !!who.owner },
    prompt: str(b.prompt, 20000),
    reply: str(b.reply, 200000),
    file: str(b.file, 300),
    sel: str(b.sel, 40),
    provider: str(b.provider, 60),
    model: str(b.model, 120),
    via: ['host', 'own', 'pc'].includes(b.via) ? b.via : 'host',
  };
  (await room(params.p)).addChat(entry);
  return { ok: true };
});

route('DELETE', '/api/projects/:p/chat', async (req, { who, params }) => {
  access.requireOwner(who);
  (await room(params.p)).clearChat();
  return { ok: true };
});

/* ───────── version history ───────── */

route('GET', '/api/projects/:p/history', async (req, { who, params }) => {
  access.requireProject(who, params.p);
  return { versions: (await room(params.p)).history.list() };
});

/** A file as it was in a version, plus the version before it (to show what changed). */
route('GET', '/api/projects/:p/history/:id/file', async (req, { who, params, url }) => {
  access.requireProject(who, params.p);
  const r = await room(params.p);
  const file = url.searchParams.get('path') || '';
  if (!r.history.get(params.id)) throw new HttpError(404, 'That version no longer exists.');
  const [text, prev] = await Promise.all([r.history.read(params.id, file), r.history.readPrevious(params.id, file)]);
  return { text, prev };
});

/** Save a named version now. */
route('POST', '/api/projects/:p/history', async (req, { who, params }) => {
  access.requireProject(who, params.p, 'editor');
  const { label, name } = await readJson(req);
  if (!str(label, 1).trim()) throw new HttpError(400, 'Give this version a name.');
  const r = await room(params.p);
  await r.flush();
  return { version: await r.snapshot({ label: str(label, 80).trim(), by: str(name, 40) ? [str(name, 40)] : [] }) };
});

route('POST', '/api/projects/:p/history/:id/restore', async (req, { who, params }) => {
  access.requireProject(who, params.p, 'editor');
  const { path: file, name } = await readJson(req);
  return (await room(params.p)).restore(params.id, { file: file ? String(file) : null, by: str(name, 40) });
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
    publicUrl: publicUrl(),
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

/* ───────── your AI, lent to workspaces you join ─────────
 * When you join someone else's PaperWriter, your browser can use the AI set up in *your own*
 * PaperWriter (Claude Code, Ollama, your API keys) through http://localhost on your computer.
 * Your keys never leave your computer. Requests need the link key from your Settings, and only
 * come from this computer (the browser you're using).
 */
function bridgeHeaders(req) {
  return {
    'Access-Control-Allow-Origin': req.headers.origin || '*',
    'Access-Control-Allow-Headers': 'content-type, x-pw-bridge',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Private-Network': 'true',
    'Access-Control-Max-Age': '600',
    Vary: 'Origin',
  };
}

async function handleBridge(req, res, url) {
  const cors = bridgeHeaders(req);
  for (const [k, v] of Object.entries(cors)) res.setHeader(k, v);
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }
  const key = getSettings().bridgeKey;
  const given = String(req.headers['x-pw-bridge'] || '');
  if (!key) throw new HttpError(403, 'Sharing your AI is turned off in this PaperWriter’s Settings.');
  if (!access.isLocalRequest(req)) throw new HttpError(403, 'Your AI can only be used from the browser on this computer.');
  if (!access.safeEqual(given, key)) throw new HttpError(401, 'That link key doesn’t match. Copy it again from your PaperWriter’s Settings.');
  const sub = url.pathname.slice('/bridge/'.length);
  if (req.method === 'GET' && sub === 'status') {
    const providers = {};
    for (const [id, p] of Object.entries(await providerStatus())) if (p.available) providers[id] = { id, label: p.label, detail: p.detail };
    return sendJson(res, 200, { name: getSettings().workspaceName || 'PaperWriter', providers });
  }
  if (req.method === 'GET' && sub === 'models') return sendJson(res, 200, { models: await listModels(url.searchParams.get('provider')) });
  if (req.method === 'POST' && sub === 'chat') {
    const body = await readJson(req);
    const messages = buildMessages(body.messages, body.context);
    const ctrl = new AbortController();
    res.on('close', () => ctrl.abort());
    res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no' });
    const send = (obj) => !res.writableEnded && res.write(`data: ${JSON.stringify(obj)}\n\n`);
    send({ type: 'start' });
    try {
      for await (const text of streamChat({ provider: body.provider, model: body.model, system: SYSTEM_PROMPT, messages, signal: ctrl.signal })) send({ type: 'text', text });
      send({ type: 'done' });
    } catch (e) {
      if (!ctrl.signal.aborted) send({ type: 'error', error: e.message || String(e) });
    }
    return res.end();
  }
  throw new HttpError(404, 'Unknown bridge route');
}

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
    if ((m = pathname.match(/^\/j\/([A-Za-z0-9-]{8,12})$/))) {
      try {
        const r = await access.joinWithCode(req, m[1]);
        return redirect(res, `/?project=${encodeURIComponent(r.project)}`, r.cookie);
      } catch {
        return redirect(res, '/?link=invalid');
      }
    }
    if ((m = pathname.match(/^\/owner\/([A-Za-z0-9_-]{16,64})$/))) {
      const cookie = access.ownerLogin(req, m[1]);
      return cookie ? redirect(res, '/', cookie) : redirect(res, '/?link=invalid');
    }
    if (pathname.startsWith('/bridge/')) return await handleBridge(req, res, url);
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

const IN_CONTAINER = !!process.env.PW_DOCKER || fs.existsSync('/.dockerenv');

/** Opens the app in the default browser (first run, or when started from the start scripts). */
function openBrowser(url) {
  const [cmd, args] = process.platform === 'win32' ? ['cmd', ['/c', 'start', '""', url]] : process.platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]];
  try {
    spawn(cmd, args, { detached: true, stdio: 'ignore', windowsHide: true }).on('error', () => {}).unref();
  } catch {}
}

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

// One failed background task must not take the server down for everyone connected.
process.on('unhandledRejection', (e) => console.error('[server] unhandled error:', e));
process.on('uncaughtException', (e) => console.error('[server] uncaught error:', e));

await projects.ensureWelcomeProject();
await listen(hostFromEnv || (getSettings().lanAccess ? '0.0.0.0' : '127.0.0.1'));
const info = networkInfo();
const local = `http://localhost:${PORT}`;
const ownerLink = `${info.publicUrl || `http://<this-computer>:${PORT}`}/owner/${access.ownerSecret()}`;
console.log(`\n  PaperWriter is running → ${local}`);
if (info.publicUrl) console.log(`  Public address          → ${info.publicUrl}`);
if (info.lan) for (const a of info.addresses) console.log(`  On your network         → ${a}`);
if (!getSettings().setupDone) {
  console.log(`\n  ▸ Finish setup in your browser: ${IN_CONTAINER ? ownerLink : local}`);
  if (IN_CONTAINER) console.log('    (open this link once: it signs you in as the host)');
}
console.log(`\n  Host sign-in link for other devices (keep this private):\n  ${ownerLink}\n`);
if (!IN_CONTAINER && !process.env.NO_OPEN && process.stdout.isTTY && (process.env.PW_OPEN === '1' || !getSettings().setupDone)) openBrowser(local);
