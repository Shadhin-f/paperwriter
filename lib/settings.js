import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DATA } from './util.js';

const FILE = path.join(DATA, 'settings.json');

const DEFAULTS = {
  keys: { anthropic: '', openai: '', gemini: '', openrouter: '', compat: '' },
  // Shown to collaborators on the join screen and in the app.
  workspaceName: '',
  // The address people use to reach this PaperWriter (for share links), e.g. https://papers.example.org
  publicUrl: '',
  // Collaborators may chat with their own API keys (kept in their browser, never stored here).
  guestKeys: true,
  // New share links let people use the host's AI.
  defaultLinkAI: false,
  setupDone: false,
  // scrypt hash of the host password, for signing in as the host from any device.
  hostPassword: '',
  // Lets your browser use this PaperWriter's AI while you're in a workspace hosted elsewhere. Empty = off.
  bridgeKey: '',
  ollamaUrl: 'http://127.0.0.1:11434',
  compatUrl: 'http://127.0.0.1:1234/v1',
  engine: 'auto',
  allowOnline: false,
  // Let other devices on the network connect (they still need a share link).
  lanAccess: false,
};

const ENV_KEYS = {
  anthropic: ['ANTHROPIC_API_KEY'],
  openai: ['OPENAI_API_KEY'],
  gemini: ['GEMINI_API_KEY', 'GOOGLE_API_KEY'],
  openrouter: ['OPENROUTER_API_KEY'],
  compat: ['OPENAI_COMPAT_API_KEY'],
};

let cache = null;

export function getSettings() {
  if (!cache) {
    let saved = {};
    let existed = false;
    try {
      saved = JSON.parse(fs.readFileSync(FILE, 'utf8'));
      existed = true;
    } catch {}
    cache = { ...DEFAULTS, ...saved, keys: { ...DEFAULTS.keys, ...(saved.keys || {}) } };
    // Installs from before the setup guide existed are already set up.
    if (existed && !('setupDone' in saved)) cache.setupDone = true;
  }
  return cache;
}

function persist() {
  fs.mkdirSync(DATA, { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(cache, null, 2), { mode: 0o600 });
}

/** Saved key first, then environment variables. */
export function apiKey(provider) {
  const saved = getSettings().keys[provider];
  if (saved) return saved;
  for (const name of ENV_KEYS[provider] || []) if (process.env[name]) return process.env[name];
  return '';
}

export function updateSettings(patch = {}) {
  const s = getSettings();
  if (patch.keys && typeof patch.keys === 'object') {
    for (const [k, v] of Object.entries(patch.keys)) {
      if (k in s.keys && typeof v === 'string') s.keys[k] = v.trim();
    }
  }
  for (const k of ['ollamaUrl', 'compatUrl', 'engine']) {
    if (typeof patch[k] === 'string') s[k] = patch[k].trim();
  }
  if (typeof patch.workspaceName === 'string') s.workspaceName = patch.workspaceName.trim().slice(0, 60);
  if (typeof patch.publicUrl === 'string') s.publicUrl = normalizeUrl(patch.publicUrl);
  for (const k of ['allowOnline', 'lanAccess', 'guestKeys', 'defaultLinkAI', 'setupDone']) {
    if (typeof patch[k] === 'boolean') s[k] = patch[k];
  }
  if (patch.bridge === false) s.bridgeKey = '';
  else if ((patch.bridge === true && !s.bridgeKey) || patch.bridgeRotate === true) s.bridgeKey = crypto.randomBytes(18).toString('base64url');
  persist();
  return publicSettings();
}

function normalizeUrl(u) {
  u = String(u || '').trim().replace(/\/+$/, '');
  if (!u) return '';
  if (!/^https?:\/\//i.test(u)) u = `https://${u}`;
  try {
    const url = new URL(u);
    return `${url.protocol}//${url.host}${url.pathname.replace(/\/+$/, '')}`;
  } catch {
    throw Object.assign(new Error('That address doesn’t look right. Try something like https://papers.example.org'), { status: 400 });
  }
}

/** The public address from PUBLIC_URL (or DOMAIN, served over https), else the one saved in setup. */
const envUrl = () => process.env.PUBLIC_URL || (process.env.DOMAIN && process.env.DOMAIN !== 'localhost' ? `https://${process.env.DOMAIN}` : '');
export const publicUrl = () => normalizeUrl(envUrl()) || getSettings().publicUrl;

/** scrypt hash of the host password ("salt:hash"), saved to settings. Empty removes it. */
export function setHostPassword(password) {
  const s = getSettings();
  if (!password) s.hostPassword = '';
  else {
    if (String(password).length < 8) throw Object.assign(new Error('Use at least 8 characters for the host password.'), { status: 400 });
    const salt = crypto.randomBytes(16).toString('base64url');
    s.hostPassword = `${salt}:${crypto.scryptSync(String(password), salt, 32).toString('base64url')}`;
  }
  persist();
}

export function checkHostPassword(password) {
  const [salt, hash] = String(getSettings().hostPassword || '').split(':');
  if (!salt || !hash || typeof password !== 'string' || !password) return false;
  const got = crypto.scryptSync(password, salt, 32);
  const want = Buffer.from(hash, 'base64url');
  return got.length === want.length && crypto.timingSafeEqual(got, want);
}

const mask = (k) => (k.length > 10 ? `${k.slice(0, 4)}…${k.slice(-4)}` : '••••');

/** Settings safe to send to the browser: keys are never returned, only their status. */
export function publicSettings() {
  const s = getSettings();
  const keyStatus = {};
  for (const p of Object.keys(DEFAULTS.keys)) {
    const saved = s.keys[p];
    const env = (ENV_KEYS[p] || []).find((n) => process.env[n]);
    keyStatus[p] = saved
      ? { set: true, source: 'saved', hint: mask(saved) }
      : env
        ? { set: true, source: 'env', hint: env }
        : { set: false };
  }
  return {
    ollamaUrl: s.ollamaUrl,
    compatUrl: s.compatUrl,
    engine: s.engine,
    allowOnline: s.allowOnline,
    keyStatus,
    workspaceName: s.workspaceName,
    publicUrl: publicUrl(),
    publicUrlFromEnv: !!envUrl(),
    guestKeys: s.guestKeys,
    defaultLinkAI: s.defaultLinkAI,
    setupDone: s.setupDone,
    hasHostPassword: !!s.hostPassword,
    // Shown only to the host, in Settings, to paste into a workspace they join.
    bridgeKey: s.bridgeKey,
  };
}
