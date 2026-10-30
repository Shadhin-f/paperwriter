import fs from 'node:fs';
import path from 'node:path';
import { DATA } from './util.js';

const FILE = path.join(DATA, 'settings.json');

const DEFAULTS = {
  keys: { anthropic: '', openai: '', gemini: '', compat: '' },
  ollamaUrl: 'http://127.0.0.1:11434',
  compatUrl: 'http://127.0.0.1:1234/v1',
  engine: 'auto',
  allowOnline: false,
};

const ENV_KEYS = {
  anthropic: ['ANTHROPIC_API_KEY'],
  openai: ['OPENAI_API_KEY'],
  gemini: ['GEMINI_API_KEY', 'GOOGLE_API_KEY'],
  compat: ['OPENAI_COMPAT_API_KEY'],
};

let cache = null;

export function getSettings() {
  if (!cache) {
    let saved = {};
    try {
      saved = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    } catch {}
    cache = { ...DEFAULTS, ...saved, keys: { ...DEFAULTS.keys, ...(saved.keys || {}) } };
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
  if (typeof patch.allowOnline === 'boolean') s.allowOnline = patch.allowOnline;
  persist();
  return publicSettings();
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
  return { ollamaUrl: s.ollamaUrl, compatUrl: s.compatUrl, engine: s.engine, allowOnline: s.allowOnline, keyStatus };
}
