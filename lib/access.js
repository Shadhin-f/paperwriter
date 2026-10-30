// Who is making a request: the owner (the person running PaperWriter), a guest holding
// share links, or nobody. Nothing leaves this computer; share links are random tokens
// stored in each project's .paperwriter.json.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DATA, HttpError } from './util.js';
import { listProjects, getMeta, setMeta } from './projects.js';

const OWNER_COOKIE = 'pw_owner';
const SHARES_COOKIE = 'pw_shares';
const SECRET_FILE = path.join(DATA, 'owner-secret');
const MAX_SHARE_COOKIES = 20;

/** A per-install secret that lets the owner sign in from another device (printed at startup). */
export function ownerSecret() {
  try {
    return fs.readFileSync(SECRET_FILE, 'utf8').trim();
  } catch {
    const s = crypto.randomBytes(24).toString('base64url');
    fs.mkdirSync(DATA, { recursive: true });
    fs.writeFileSync(SECRET_FILE, s, { mode: 0o600 });
    return s;
  }
}

const newToken = () => crypto.randomBytes(24).toString('base64url');
const safeEqual = (a, b) => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));

export function parseCookies(req) {
  const out = {};
  for (const part of String(req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);
const PROXY_HEADERS = ['x-forwarded-for', 'x-forwarded-host', 'forwarded', 'cf-connecting-ip', 'x-real-ip', 'true-client-ip'];

/**
 * The owner is someone browsing on this very computer, at a localhost address, not through a
 * tunnel or proxy. The Host check stops DNS-rebinding sites from posing as localhost.
 */
function isLocalOwner(req) {
  if (!LOOPBACK.has(req.socket.remoteAddress)) return false;
  const host = String(req.headers.host || '').replace(/:\d+$/, '').toLowerCase();
  if (!LOCAL_HOSTS.has(host)) return false;
  return !PROXY_HEADERS.some((h) => req.headers[h]);
}

/* ───────── share links ───────── */

let tokenIndex = null; // token → { project, role, ai }

async function index() {
  if (tokenIndex) return tokenIndex;
  const map = new Map();
  for (const { name } of await listProjects()) {
    const meta = await getMeta(name).catch(() => ({}));
    for (const s of meta.shares || []) map.set(s.token, { project: name, role: s.role, ai: !!s.ai });
  }
  tokenIndex = map;
  return map;
}

export const invalidateShares = () => (tokenIndex = null);

export async function listShares(project) {
  return (await getMeta(project)).shares || [];
}

export async function createShare(project, { role, ai }) {
  if (!['editor', 'viewer'].includes(role)) throw new HttpError(400, 'Role must be editor or viewer');
  const shares = await listShares(project);
  const share = { token: newToken(), role, ai: !!ai, created: Date.now() };
  await setMeta(project, { shares: [...shares, share] });
  invalidateShares();
  return share;
}

export async function updateShare(project, token, patch) {
  const shares = await listShares(project);
  const s = shares.find((x) => x.token === token);
  if (!s) throw new HttpError(404, 'Link not found');
  if (patch.role) {
    if (!['editor', 'viewer'].includes(patch.role)) throw new HttpError(400, 'Role must be editor or viewer');
    s.role = patch.role;
  }
  if (typeof patch.ai === 'boolean') s.ai = patch.ai;
  await setMeta(project, { shares });
  invalidateShares();
  return s;
}

export async function revokeShare(project, token) {
  const shares = (await listShares(project)).filter((s) => s.token !== token);
  await setMeta(project, { shares });
  invalidateShares();
}

/* ───────── identifying requests ───────── */

/**
 * @returns {Promise<{ owner: boolean, grants: Map<string, {role: string, ai: boolean}>, setCookie?: string }>}
 */
export async function identify(req) {
  const cookies = parseCookies(req);
  const secret = ownerSecret();
  if (isLocalOwner(req) || (cookies[OWNER_COOKIE] && safeEqual(cookies[OWNER_COOKIE], secret))) {
    return { owner: true, grants: new Map() };
  }
  const grants = new Map();
  const tokens = String(cookies[SHARES_COOKIE] || '').split('.').filter(Boolean);
  if (tokens.length) {
    const idx = await index();
    for (const t of tokens) {
      const g = idx.get(t);
      if (!g) continue;
      // Several links to one project: keep the strongest of each permission.
      const prev = grants.get(g.project) || { role: 'viewer', ai: false };
      grants.set(g.project, { role: prev.role === 'editor' || g.role === 'editor' ? 'editor' : 'viewer', ai: prev.ai || g.ai });
    }
  }
  return { owner: false, grants };
}

/** Throws unless the caller may use this project with at least the given role. */
export function requireProject(who, project, need = 'viewer') {
  if (who.owner) return { role: 'owner', ai: true };
  const g = who.grants.get(project);
  if (!g) throw new HttpError(403, 'You don’t have access to this project.');
  if (need === 'editor' && g.role !== 'editor') throw new HttpError(403, 'This link only allows viewing.');
  return g;
}

export function requireOwner(who) {
  if (!who.owner) throw new HttpError(403, 'Only the owner of this PaperWriter can do that.');
}

const secureFlag = (req) => (req.headers['x-forwarded-proto'] === 'https' || req.headers['cf-visitor']?.includes('https') ? '; Secure' : '');

/** Handles /s/<token>: remembers the link in an HttpOnly cookie, then opens the project. */
export async function joinWithToken(req, token) {
  const g = (await index()).get(token);
  if (!g) return { ok: false };
  const cookies = parseCookies(req);
  const tokens = String(cookies[SHARES_COOKIE] || '').split('.').filter((t) => t && t !== token);
  tokens.push(token);
  const value = tokens.slice(-MAX_SHARE_COOKIES).join('.');
  return {
    ok: true,
    project: g.project,
    cookie: `${SHARES_COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 90}${secureFlag(req)}`,
  };
}

/** Handles /owner/<secret>: lets the owner in from another device. */
export function ownerLogin(req, secret) {
  if (!secret || !safeEqual(secret, ownerSecret())) return null;
  return `${OWNER_COOKIE}=${secret}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 90}${secureFlag(req)}`;
}
