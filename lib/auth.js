import { HttpError } from './util.js';

/** Supabase settings come from the environment (.env locally, project settings on Vercel). */
export function cloudEnv() {
  return {
    url: (process.env.SUPABASE_URL || '').replace(/\/+$/, ''),
    anon: process.env.SUPABASE_ANON_KEY || '',
    service: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  };
}

export const cloudEnabled = () => {
  const { url, anon } = cloudEnv();
  return !!(url && anon);
};

const tokenOf = (req) => {
  const h = req.headers.authorization || '';
  return h.startsWith('Bearer ') ? h.slice(7).trim() : '';
};

const cache = new Map();

/**
 * In cloud mode every API call must carry the user's Supabase access token.
 * Returns the user, or null when cloud mode is off (local, single-user).
 */
export async function requireUser(req) {
  if (!cloudEnabled()) return null;
  const token = tokenOf(req);
  if (!token) throw new HttpError(401, 'Please sign in first.');
  const hit = cache.get(token);
  if (hit && Date.now() - hit.at < 60000) return hit.user;
  const { url, anon } = cloudEnv();
  const r = await fetch(`${url}/auth/v1/user`, { headers: { apikey: anon, Authorization: `Bearer ${token}` } });
  if (!r.ok) throw new HttpError(401, 'Your session expired. Please sign in again.');
  const user = await r.json();
  user.token = token;
  if (cache.size > 500) cache.clear();
  cache.set(token, { user, at: Date.now() });
  return user;
}

/** Query PostgREST as the signed-in user, so Row Level Security applies. */
export async function restAsUser(user, pathAndQuery, init = {}) {
  const { url, anon } = cloudEnv();
  const r = await fetch(`${url}/rest/v1/${pathAndQuery}`, {
    ...init,
    headers: { apikey: anon, Authorization: `Bearer ${user.token}`, 'content-type': 'application/json', ...(init.headers || {}) },
  });
  const text = await r.text();
  const data = text ? JSON.parse(text) : null;
  if (!r.ok) throw new HttpError(r.status, data?.message || `Database error ${r.status}`);
  return data;
}

/** `key` goes in both headers: works for legacy JWT keys and the newer sb_publishable_/sb_secret_ keys. */
async function gotrue(path, body, key, query = '') {
  const { url } = cloudEnv();
  const r = await fetch(`${url}/auth/v1/${path}${query}`, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, data };
}

/**
 * Email someone a link into a project. New people get Supabase's invite email (needs the
 * service-role key); people who already have an account get a magic sign-in link.
 */
export async function sendInviteEmail(email, redirectTo) {
  const { anon, service } = cloudEnv();
  const q = `?redirect_to=${encodeURIComponent(redirectTo)}`;
  if (service) {
    const r = await gotrue('invite', { email }, service, q);
    if (r.ok) return { emailed: true, kind: 'invite' };
    const msg = String(r.data?.msg || r.data?.message || r.data?.error_description || '');
    if (!/already|registered|exists/i.test(msg)) throw new HttpError(r.status, msg || 'Could not send the invite email');
  }
  const r = await gotrue('otp', { email, create_user: true, data: {} }, anon, q);
  if (!r.ok) {
    const msg = r.data?.msg || r.data?.message || r.data?.error_description || 'Could not send the email';
    throw new HttpError(r.status === 429 ? 429 : 400, r.status === 429 ? `Email rate limit reached: ${msg}` : msg);
  }
  return { emailed: true, kind: 'magiclink' };
}
