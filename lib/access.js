// Who is making a request: the owner (the person running PaperWriter), a guest holding
// share links, or nobody. Nothing leaves this computer; share links are random tokens
// stored in each project's .paperwriter.json.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DATA, HttpError } from './util.js';
import { listProjects, getMeta, setMeta } from './projects.js';
import { checkHostPassword } from './settings.js';

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
export const safeEqual = (a, b) => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));

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

/** A request from a browser on this very computer (not via a proxy or tunnel). */
export function isLocalRequest(req) {
  return LOOPBACK.has(req.socket.remoteAddress) && !PROXY_HEADERS.some((h) => req.headers[h]);
}

/* ───────── rate limiting (sign-in and invite codes) ───────── */

const attempts = new Map(); // key → { n, reset }

/** The caller's address. Behind a reverse proxy, set TRUST_PROXY=1 so X-Forwarded-For is used. */
export function clientIp(req) {
  if (process.env.TRUST_PROXY) {
    const fwd = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    if (fwd) return fwd;
  }
  return req.socket.remoteAddress || '?';
}

/** Throws 429 after `max` attempts within `windowMs` for this caller and purpose. */
export function rateLimit(req, purpose, max = 10, windowMs = 10 * 60 * 1000) {
  const key = `${purpose}:${clientIp(req)}`;
  const now = Date.now();
  let a = attempts.get(key);
  if (!a || a.reset < now) attempts.set(key, (a = { n: 0, reset: now + windowMs }));
  if (++a.n > max) throw new HttpError(429, `Too many attempts. Try again in ${Math.ceil((a.reset - now) / 60000)} minutes.`);
  if (attempts.size > 5000) for (const [k, v] of attempts) if (v.reset < now) attempts.delete(k);
}

/* ───────── share links & invite codes ───────── */

// Invite codes avoid look-alike characters (0/O, 1/I/L), so they're easy to read out or type.
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
function newCode() {
  const bytes = crypto.randomBytes(8);
  let c = '';
  for (const b of bytes) c += CODE_ALPHABET[b % CODE_ALPHABET.length];
  return `${c.slice(0, 4)}-${c.slice(4)}`;
}
/** "k7qf 3mxa", "K7QF-3MXA" and "k7qf3mxa" are the same code. */
export const normalizeCode = (code) => {
  const c = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return c.length === 8 ? `${c.slice(0, 4)}-${c.slice(4)}` : '';
};

let tokenIndex = null; // { tokens: token → grant, codes: code → token }

async function index() {
  if (tokenIndex) return tokenIndex;
  const tokens = new Map();
  const codes = new Map();
  for (const { name } of await listProjects()) {
    const shares = await listShares(name).catch(() => []);
    for (const s of shares) {
      tokens.set(s.token, { project: name, role: s.role, ai: !!s.ai, expires: s.expires || 0 });
      if (s.code) codes.set(s.code, s.token);
    }
  }
  tokenIndex = { tokens, codes };
  return tokenIndex;
}

export const invalidateShares = () => (tokenIndex = null);

/** A project's links. Links made before invite codes existed get one now. */
export async function listShares(project) {
  const shares = (await getMeta(project)).shares || [];
  if (shares.some((s) => !s.code)) {
    for (const s of shares) s.code ||= newCode();
    await setMeta(project, { shares });
  }
  return shares;
}

const EXPIRY = { never: 0, '1d': 864e5, '7d': 7 * 864e5, '30d': 30 * 864e5 };

export async function createShare(project, { role, ai, expires }) {
  if (!['editor', 'viewer'].includes(role)) throw new HttpError(400, 'Role must be editor or viewer');
  const shares = await listShares(project);
  const ttl = EXPIRY[expires] ?? 0;
  const share = { token: newToken(), code: newCode(), role, ai: !!ai, created: Date.now(), expires: ttl ? Date.now() + ttl : 0 };
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
  const local = isLocalOwner(req);
  if (local || (cookies[OWNER_COOKIE] && safeEqual(cookies[OWNER_COOKIE], secret))) {
    return { owner: true, local, grants: new Map() };
  }
  const grants = new Map();
  const tokens = String(cookies[SHARES_COOKIE] || '').split('.').filter(Boolean);
  if (tokens.length) {
    const idx = await index();
    for (const t of tokens) {
      const g = idx.tokens.get(t);
      if (!g || (g.expires && g.expires < Date.now())) continue;
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
  if (!who.owner) throw new HttpError(403, 'Only the host of this PaperWriter can do that.');
}

const secureFlag = (req) => (req.headers['x-forwarded-proto'] === 'https' || req.headers['cf-visitor']?.includes('https') ? '; Secure' : '');

/** Handles /s/<token>: remembers the link in an HttpOnly cookie, then opens the project. */
export async function joinWithToken(req, token) {
  const g = (await index()).tokens.get(token);
  if (!g || (g.expires && g.expires < Date.now())) return { ok: false };
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

/** Turns a typed invite code into the same thing as opening its link. */
export async function joinWithCode(req, code) {
  rateLimit(req, 'code', 20);
  const token = (await index()).codes.get(normalizeCode(code));
  if (!token) throw new HttpError(404, 'That code doesn’t match an invite. Check it with the person who sent it.');
  const r = await joinWithToken(req, token);
  if (!r.ok) throw new HttpError(410, 'This invite has expired. Ask for a new one.');
  return r;
}

const ownerCookie = (req, secret) => `${OWNER_COOKIE}=${secret}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 90}${secureFlag(req)}`;

/** Signs the host in with their password (set in setup). */
export function hostLogin(req, password) {
  rateLimit(req, 'login', 8);
  if (!checkHostPassword(password)) throw new HttpError(401, 'That password isn’t right.');
  return ownerCookie(req, ownerSecret());
}

/** Forget this browser's host sign-in and invites. */
export const signOutCookies = () => [`${OWNER_COOKIE}=; Path=/; Max-Age=0`, `${SHARES_COOKIE}=; Path=/; Max-Age=0`];

/** Handles /owner/<secret>: lets the owner in from another device. */
export function ownerLogin(req, secret) {
  if (!secret || !safeEqual(secret, ownerSecret())) return null;
  return ownerCookie(req, secret);
}
