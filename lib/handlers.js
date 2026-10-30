// Request handlers shared by the local Node server (server.js) and Vercel functions (api/*.js).
import { sendJson, readJson, HttpError } from './util.js';
import { publicSettings } from './settings.js';
import { detectEngines, compileFiles, HOSTED } from './compile.js';
import { providerStatus, listModels, streamChat, buildMessages, SYSTEM_PROMPT, withUserKeys } from './ai.js';
import { cloudEnabled, cloudEnv, requireUser, restAsUser, sendInviteEmail } from './auth.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function userKeysFrom(req) {
  try {
    const raw = req.headers['x-pw-keys'];
    return raw ? JSON.parse(Buffer.from(String(raw), 'base64').toString('utf8')) : {};
  } catch {
    return {};
  }
}

function appOrigin(req) {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/+$/, '');
  const proto = req.headers['x-forwarded-proto'] || (HOSTED ? 'https' : 'http');
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  return `${proto}://${host}`;
}

/** Which mode the browser should run in. Public: holds no secrets (the anon key is meant to be public). */
export async function config() {
  const { url, anon } = cloudEnv();
  return { cloud: cloudEnabled(), hosted: HOSTED, supabaseUrl: url || null, supabaseAnonKey: anon || null };
}

export async function status(req) {
  await requireUser(req);
  const [engines, providers] = await Promise.all([detectEngines(), providerStatus()]);
  const settings = publicSettings();
  if (HOSTED) Object.assign(settings, { engine: 'online', allowOnline: true });
  return { settings, engines, providers, platform: process.platform, hosted: HOSTED };
}

export async function models(req, url) {
  await requireUser(req);
  return withUserKeys(userKeysFrom(req), async () => ({ models: await listModels(url.searchParams.get('provider')) }));
}

export async function compile(req) {
  await requireUser(req);
  const { files, main, engine } = await readJson(req);
  return compileFiles(files, main, { engine });
}

/** Streams the model's reply as server-sent events. */
export async function chat(req, url, res) {
  await requireUser(req);
  const body = await readJson(req);
  const messages = buildMessages(body.messages, body.context);
  const ctrl = new AbortController();
  res.on('close', () => ctrl.abort());
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-store',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  const send = (obj) => !res.writableEnded && res.write(`data: ${JSON.stringify(obj)}\n\n`);
  send({ type: 'start' });
  await withUserKeys(userKeysFrom(req), async () => {
    try {
      for await (const text of streamChat({ provider: body.provider, model: body.model, system: SYSTEM_PROMPT, messages, signal: ctrl.signal })) {
        send({ type: 'text', text });
      }
      send({ type: 'done' });
    } catch (e) {
      if (!ctrl.signal.aborted) send({ type: 'error', error: e.message || String(e) });
    }
  });
  res.end();
  return { __handled: true };
}

/**
 * Emails an invitation. The browser first adds the member row itself (Row Level Security only
 * lets owners/editors do that); here we check that row exists before sending anything.
 */
export async function invite(req) {
  if (!cloudEnabled()) throw new HttpError(400, 'Sharing needs cloud mode (Supabase).');
  const user = await requireUser(req);
  const { projectId, email } = await readJson(req);
  const to = String(email || '').trim().toLowerCase();
  if (!EMAIL_RE.test(to)) throw new HttpError(400, 'Please enter a valid email address.');
  if (!/^[0-9a-f-]{36}$/i.test(String(projectId))) throw new HttpError(400, 'Invalid project');

  const rows = await restAsUser(user, `project_members?project_id=eq.${projectId}&select=email,user_id,role`);
  const me = rows.find((r) => r.user_id === user.id || r.email?.toLowerCase() === user.email?.toLowerCase());
  if (!me || !['owner', 'editor'].includes(me.role)) throw new HttpError(403, 'Only owners and editors can invite people.');
  if (!rows.some((r) => r.email?.toLowerCase() === to)) throw new HttpError(400, 'Add the person to the project before emailing them.');

  const result = await sendInviteEmail(to, `${appOrigin(req)}/?project=${projectId}`);
  return { ok: true, ...result };
}

/** Adapts a handler to Vercel's (req, res) function signature. */
export function vercel(handler) {
  return async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      const result = await handler(req, url, res);
      if (result?.__handled) return;
      sendJson(res, 200, result ?? { ok: true });
    } catch (e) {
      const statusCode = e.status || 500;
      if (statusCode >= 500) console.error(e);
      if (!res.headersSent) sendJson(res, statusCode, { error: e.message || String(e) });
      else res.end();
    }
  };
}
