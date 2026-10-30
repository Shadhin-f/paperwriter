// Cloud mode: Supabase auth + database + storage, and live co-editing with Yjs over Supabase Realtime.
import { createClient, Y, CodemirrorBinding, Awareness, encodeAwarenessUpdate, applyAwarenessUpdate, removeAwarenessStates } from '/vendor/collab.js';
import { TEMPLATES } from './templates.js';

export { CodemirrorBinding, Y };

const BUCKET = 'project-files';
const TEXT_RE = /\.(tex|bib|sty|cls|bst|bbx|cbx|def|cfg|clo|ltx|dtx|ins|txt|md|csv|dat|tikz|json|ya?ml|lua|py|r|m)$/i;
const IMAGE_RE = /\.(png|jpe?g|gif|svg|pdf|eps|webp)$/i;
const COLORS = ['#2563eb', '#db2777', '#16a34a', '#ea580c', '#7c3aed', '#0891b2', '#ca8a04', '#dc2626', '#4f46e5', '#059669'];

export const isTextPath = (p) => TEXT_RE.test(p);
export const kindOfPath = (p) => (TEXT_RE.test(p) ? 'text' : IMAGE_RE.test(p) ? 'image' : 'binary');

const b64 = (u8) => {
  let s = '';
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  return btoa(s);
};
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export function colorFor(id = '') {
  let h = 0;
  for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return COLORS[h % COLORS.length];
}

export function displayName(email = '') {
  const local = String(email).split('@')[0] || 'Guest';
  return local.replace(/[._-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function check({ data, error }) {
  if (error) throw new Error(error.message || String(error));
  return data;
}

export class Cloud {
  constructor(url, anonKey) {
    this.url = url.replace(/\/+$/, '');
    this.anonKey = anonKey;
    // Read these before Supabase consumes the URL: a password-reset link, or an error sent back by Google/GitHub.
    const hash = new URLSearchParams(location.hash.slice(1));
    const query = new URLSearchParams(location.search);
    this.recovery = hash.get('type') === 'recovery';
    this.urlError = hash.get('error_description') || query.get('error_description') || null;
    this.sb = createClient(url, anonKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
    this.sb.auth.onAuthStateChange((ev) => {
      if (ev === 'PASSWORD_RECOVERY') this.recovery = true;
    });
    this.session = null;
  }

  async init() {
    const { data } = await this.sb.auth.getSession();
    this.session = data.session;
    this.sb.auth.onAuthStateChange((_ev, s) => {
      this.session = s;
      if (s?.access_token) this.sb.realtime.setAuth(s.access_token);
    });
    if (this.session) await this.sb.realtime.setAuth(this.session.access_token);
    return this.session;
  }

  get user() {
    return this.session?.user || null;
  }

  token() {
    return this.session?.access_token || '';
  }

  async sendMagicLink(email, redirectTo) {
    check(await this.sb.auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo } }));
  }

  /** Which sign-in methods are switched on in Supabase (Authentication → Sign In / Providers). */
  async providers() {
    try {
      const r = await fetch(`${this.url}/auth/v1/settings`, { headers: { apikey: this.anonKey } });
      const j = await r.json();
      return { google: !!j.external?.google, github: !!j.external?.github, email: j.external?.email !== false };
    } catch {
      return { google: false, github: false, email: true };
    }
  }

  async signInWithPassword(email, password) {
    return check(await this.sb.auth.signInWithPassword({ email, password }));
  }

  /** Returns { session } when signed in straight away, or { needsConfirm: true } when Supabase emails a confirmation link. */
  async signUp(email, password, redirectTo) {
    const data = check(await this.sb.auth.signUp({ email, password, options: { emailRedirectTo: redirectTo } }));
    // Supabase hides whether an address is taken; an existing confirmed account comes back with no identities.
    if (data.user && !data.user.identities?.length) throw new Error('An account with this email already exists. Sign in instead.');
    return data.session ? { session: data.session } : { needsConfirm: true };
  }

  async signInWithOAuth(provider, redirectTo) {
    check(await this.sb.auth.signInWithOAuth({ provider, options: { redirectTo } }));
  }

  async sendPasswordReset(email, redirectTo) {
    check(await this.sb.auth.resetPasswordForEmail(email, { redirectTo }));
  }

  async updatePassword(password) {
    check(await this.sb.auth.updateUser({ password }));
  }

  async signOut() {
    await this.sb.auth.signOut();
  }

  /* ───────── projects ───────── */

  async listProjects() {
    await this.sb.rpc('claim_invites');
    const projects = check(await this.sb.from('projects').select('id,name,updated_at,owner_id,link_role').order('updated_at', { ascending: false }));
    const me = this.user;
    const mine = check(
      await this.sb.from('project_members').select('project_id,role').or(`user_id.eq.${me.id},email.eq.${(me.email || '').toLowerCase()}`),
    );
    const roles = new Map(mine.map((m) => [m.project_id, m.role]));
    return projects.map((p) => ({ ...p, role: roles.get(p.id) || (p.owner_id === me.id ? 'owner' : 'viewer') }));
  }

  async createProject(name, template = 'article') {
    const project = check(await this.sb.from('projects').insert({ name }).select().single());
    const doc = new Y.Doc();
    doc.transact(() => {
      const files = doc.getMap('files');
      for (const [path, content] of Object.entries(TEMPLATES[template] || TEMPLATES.article)) files.set(path, new Y.Text(content));
      doc.getMap('meta').set('main', 'main.tex');
    });
    check(await this.sb.from('project_updates').insert({ project_id: project.id, update: b64(Y.encodeStateAsUpdate(doc)) }));
    doc.destroy();
    return project;
  }

  async deleteProject(id) {
    const objs = (await this.sb.storage.from(BUCKET).list(id, { limit: 1000 })).data || [];
    if (objs.length) await this.sb.storage.from(BUCKET).remove(objs.map((o) => `${id}/${o.name}`));
    check(await this.sb.from('projects').delete().eq('id', id));
  }

  async renameProject(id, name) {
    check(await this.sb.from('projects').update({ name }).eq('id', id));
  }

  async joinByToken(token) {
    return check(await this.sb.rpc('join_project', { token }));
  }

  /* ───────── sharing ───────── */

  async getProject(id) {
    return check(await this.sb.from('projects').select('id,name,owner_id,link_role,share_token').eq('id', id).single());
  }

  async members(projectId) {
    return check(await this.sb.from('project_members').select('email,user_id,role,created_at').eq('project_id', projectId).order('created_at'));
  }

  async addMember(projectId, email, role) {
    check(await this.sb.from('project_members').upsert({ project_id: projectId, email: email.toLowerCase(), role }, { onConflict: 'project_id,email', ignoreDuplicates: false }));
  }

  async updateMember(projectId, email, role) {
    check(await this.sb.from('project_members').update({ role }).eq('project_id', projectId).eq('email', email));
  }

  async removeMember(projectId, email) {
    check(await this.sb.from('project_members').delete().eq('project_id', projectId).eq('email', email));
  }

  async setLinkRole(projectId, linkRole) {
    check(await this.sb.from('projects').update({ link_role: linkRole }).eq('id', projectId));
  }

  async resetShareToken(projectId) {
    return check(await this.sb.rpc('reset_share_token', { pid: projectId }));
  }

  open(project, role) {
    return new Workspace(this, project, role);
  }
}

/** One open project: a Yjs document with a Y.Map of files, synced live with everyone else in it. */
export class Workspace {
  constructor(cloud, project, role) {
    this.cloud = cloud;
    this.sb = cloud.sb;
    this.project = project;
    this.id = project.id;
    this.role = role;
    this.canEdit = role === 'owner' || role === 'editor';
    this.ydoc = new Y.Doc();
    this.files = this.ydoc.getMap('files');
    this.meta = this.ydoc.getMap('meta');
    this.awareness = new Awareness(this.ydoc);
    this.undoManagers = new Map();
    this.pending = [];
    this.saveState = 'saved';
    this.connected = false;
    this.listeners = { status: new Set(), presence: new Set() };
    this.urlCache = new Map();
    const user = cloud.user;
    this.me = { name: displayName(user.email), email: user.email, color: colorFor(user.id), id: user.id };
    this.awareness.setLocalStateField('user', { name: this.me.name, color: this.me.color });
  }

  on(event, fn) {
    this.listeners[event].add(fn);
    return () => this.listeners[event].delete(fn);
  }

  emit(event, data) {
    for (const fn of this.listeners[event]) fn(data);
  }

  setSaveState(s, detail) {
    this.saveState = s;
    this.emit('status', { save: s, connected: this.connected, detail });
  }

  async connect() {
    // 1. Load the stored log of updates.
    const rows = [];
    for (let from = 0; ; from += 1000) {
      const page = check(await this.sb.from('project_updates').select('id,update').eq('project_id', this.id).order('id').range(from, from + 999));
      rows.push(...page);
      if (page.length < 1000) break;
    }
    if (rows.length) Y.applyUpdate(this.ydoc, Y.mergeUpdates(rows.map((r) => unb64(r.update))), 'db');
    if (this.canEdit && rows.length > 40) this.compact(rows).catch(() => {});

    // 2. Every local change is broadcast right away and saved shortly after.
    this.onDocUpdate = (update, origin) => {
      if (origin === 'db' || origin === this) return;
      this.broadcast('u', { u: b64(update) });
      if (this.canEdit) {
        this.pending.push(update);
        this.schedulePersist();
      }
    };
    this.ydoc.on('update', this.onDocUpdate);

    this.onAwareness = ({ added, updated, removed }, origin) => {
      if (origin === 'remote') return;
      this.broadcast('a', { a: b64(encodeAwarenessUpdate(this.awareness, added.concat(updated, removed))) });
    };
    this.awareness.on('update', this.onAwareness);

    // 3. Live channel, private to project members (enforced by RLS on realtime.messages).
    const ch = this.sb.channel(`project:${this.id}`, {
      config: { private: true, broadcast: { self: false, ack: false }, presence: { key: `${this.me.id}:${this.ydoc.clientID}` } },
    });
    this.channel = ch;
    ch.on('broadcast', { event: 'u' }, ({ payload }) => Y.applyUpdate(this.ydoc, unb64(payload.u), this));
    ch.on('broadcast', { event: 'a' }, ({ payload }) => applyAwarenessUpdate(this.awareness, unb64(payload.a), 'remote'));
    ch.on('broadcast', { event: 'sync' }, ({ payload }) => {
      // A newcomer sent its state vector: reply with whatever it is missing.
      const diff = Y.encodeStateAsUpdate(this.ydoc, unb64(payload.sv));
      if (diff.length > 2) this.broadcast('u', { u: b64(diff) });
      this.broadcast('a', { a: b64(encodeAwarenessUpdate(this.awareness, [this.ydoc.clientID])) });
    });
    ch.on('presence', { event: 'sync' }, () => this.emit('presence', this.people()));

    await new Promise((resolve) => {
      const giveUp = setTimeout(resolve, 8000);
      ch.subscribe(async (status, err) => {
        if (status === 'SUBSCRIBED') {
          this.connected = true;
          clearTimeout(giveUp);
          this.broadcast('sync', { sv: b64(Y.encodeStateVector(this.ydoc)) });
          await ch.track({ name: this.me.name, email: this.me.email, color: this.me.color });
          this.emit('status', { save: this.saveState, connected: true });
          resolve();
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          this.connected = false;
          this.emit('status', { save: this.saveState, connected: false, detail: err?.message || status });
        }
      });
    });

    this.onUnload = () => this.flushOnUnload();
    window.addEventListener('pagehide', this.onUnload);
    return this;
  }

  broadcast(event, payload) {
    if (this.channel && this.connected) this.channel.send({ type: 'broadcast', event, payload }).catch(() => {});
  }

  people() {
    const state = this.channel?.presenceState() || {};
    const seen = new Map();
    for (const metas of Object.values(state)) {
      for (const m of metas) if (m.email && !seen.has(m.email)) seen.set(m.email, { name: m.name, email: m.email, color: m.color, me: m.email === this.me.email });
    }
    return [...seen.values()];
  }

  schedulePersist() {
    this.setSaveState('saving');
    clearTimeout(this.persistTimer);
    this.persistTimer = setTimeout(() => this.persist(), 700);
  }

  async persist() {
    if (this.saving || !this.pending.length) return;
    this.saving = true;
    const batch = this.pending.splice(0);
    const { error } = await this.sb.from('project_updates').insert({ project_id: this.id, update: b64(Y.mergeUpdates(batch)) });
    this.saving = false;
    if (error) {
      this.pending.unshift(...batch);
      this.setSaveState('error', error.message);
      clearTimeout(this.persistTimer);
      this.persistTimer = setTimeout(() => this.persist(), 4000);
      return;
    }
    if (this.pending.length) return this.schedulePersist();
    this.setSaveState('saved');
    if (!this.touchedAt || Date.now() - this.touchedAt > 30000) {
      this.touchedAt = Date.now();
      this.sb.from('projects').update({ updated_at: new Date().toISOString() }).eq('id', this.id).then(() => {});
    }
  }

  async flush() {
    clearTimeout(this.persistTimer);
    while (this.saving) await new Promise((r) => setTimeout(r, 50));
    await this.persist();
  }

  /** Last-chance save when the tab closes (keepalive survives page unload). */
  flushOnUnload() {
    if (!this.pending.length || !this.canEdit) return;
    const update = b64(Y.mergeUpdates(this.pending.splice(0)));
    fetch(`${this.cloud.url}/rest/v1/project_updates`, {
      method: 'POST',
      keepalive: true,
      headers: { apikey: this.cloud.anonKey, Authorization: `Bearer ${this.cloud.token()}`, 'content-type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ project_id: this.id, update }),
    }).catch(() => {});
  }

  /** Merge old rows into one. Insert first, then delete only what was merged, so concurrent writers never lose data. */
  async compact(rows) {
    const maxId = rows.at(-1).id;
    const merged = Y.mergeUpdates(rows.map((r) => unb64(r.update)));
    check(await this.sb.from('project_updates').insert({ project_id: this.id, update: b64(merged) }));
    check(await this.sb.from('project_updates').delete().eq('project_id', this.id).lte('id', maxId));
  }

  destroy() {
    window.removeEventListener('pagehide', this.onUnload);
    this.flush().catch(() => {});
    removeAwarenessStates(this.awareness, [this.ydoc.clientID], 'local');
    if (this.channel) this.sb.removeChannel(this.channel);
    this.ydoc.off('update', this.onDocUpdate);
    this.awareness.off('update', this.onAwareness);
    for (const um of this.undoManagers.values()) um.destroy();
  }

  /* ───────── files ───────── */

  fileList() {
    const out = [];
    for (const [path, v] of this.files.entries()) {
      if (v instanceof Y.Text) out.push({ path, kind: 'text', size: new Blob([v.toString()]).size });
      else if (v && typeof v === 'object') out.push({ path, kind: v.kind || kindOfPath(path), size: v.size || 0 });
    }
    return out.sort((a, b) => a.path.localeCompare(b.path));
  }

  text(path) {
    const v = this.files.get(path);
    return v instanceof Y.Text ? v : null;
  }

  undoManager(path) {
    let um = this.undoManagers.get(path);
    if (!um) {
      um = new Y.UndoManager(this.text(path), { trackedOrigins: new Set() });
      this.undoManagers.set(path, um);
    }
    return um;
  }

  main() {
    const m = this.meta.get('main');
    if (m && this.files.has(m)) return m;
    const texs = this.fileList().filter((f) => f.path.endsWith('.tex'));
    return texs.find((f) => /\\documentclass/.test(this.text(f.path)?.toString() || ''))?.path || texs[0]?.path || 'main.tex';
  }

  setMain(path) {
    this.meta.set('main', path);
  }

  createText(path, content = '') {
    if (this.files.has(path)) throw new Error('A file with that name already exists');
    this.files.set(path, new Y.Text(content));
  }

  async rename(from, to) {
    if (this.files.has(to)) throw new Error('A file with that name already exists');
    const v = this.files.get(from);
    if (v instanceof Y.Text) {
      this.ydoc.transact(() => {
        this.files.set(to, new Y.Text(v.toString()));
        this.files.delete(from);
      });
    } else {
      check(await this.sb.storage.from(BUCKET).move(`${this.id}/${from}`, `${this.id}/${to}`));
      this.ydoc.transact(() => {
        this.files.set(to, v);
        this.files.delete(from);
      });
    }
    this.undoManagers.get(from)?.destroy();
    this.undoManagers.delete(from);
    if (this.meta.get('main') === from) this.meta.set('main', to);
  }

  async remove(path) {
    const v = this.files.get(path);
    if (v && !(v instanceof Y.Text)) await this.sb.storage.from(BUCKET).remove([`${this.id}/${path}`]);
    this.files.delete(path);
  }

  async upload(path, file) {
    if (isTextPath(path)) {
      const content = await file.text();
      const existing = this.text(path);
      if (existing) {
        this.ydoc.transact(() => {
          existing.delete(0, existing.length);
          existing.insert(0, content);
        });
      } else this.files.set(path, new Y.Text(content));
      return;
    }
    check(await this.sb.storage.from(BUCKET).upload(`${this.id}/${path}`, file, { upsert: true, contentType: file.type || undefined }));
    this.urlCache.delete(path);
    this.files.set(path, { kind: kindOfPath(path), size: file.size, type: file.type || '', at: Date.now() });
  }

  async fileUrl(path) {
    const hit = this.urlCache.get(path);
    if (hit && hit.until > Date.now()) return hit.url;
    const { signedUrl } = check(await this.sb.storage.from(BUCKET).createSignedUrl(`${this.id}/${path}`, 3600));
    this.urlCache.set(path, { url: signedUrl, until: Date.now() + 3500 * 1000 });
    return signedUrl;
  }

  /** Files for the compiler. Binary files are only fetched when the compiler can use them. */
  async collect({ includeBinary }) {
    const out = [];
    for (const f of this.fileList()) {
      if (f.kind === 'text') out.push({ path: f.path, content: this.text(f.path).toString() });
      else if (includeBinary) {
        const blob = check(await this.sb.storage.from(BUCKET).download(`${this.id}/${f.path}`));
        out.push({ path: f.path, base64: b64(new Uint8Array(await blob.arrayBuffer())) });
      }
    }
    return out;
  }
}
