// Live co-editing with this PaperWriter server: a Yjs document per project, synced over WebSocket.
import { Y, WebsocketProvider, CodemirrorBinding } from '/vendor/sync.js';

export { CodemirrorBinding, Y };

const COLORS = ['#2563eb', '#db2777', '#16a34a', '#ea580c', '#7c3aed', '#0891b2', '#ca8a04', '#dc2626', '#4f46e5', '#059669'];

export function colorFor(id = '') {
  let h = 0;
  for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return COLORS[h % COLORS.length];
}

/** One open project. File contents are Y.Texts in a shared map; file operations go through the server. */
export class Workspace {
  /**
   * @param {string} project
   * @param {{ role: string, me: { name: string, color: string }, api: Function }} o
   */
  constructor(project, { role, me, api }) {
    this.project = project;
    this.role = role;
    this.canEdit = role === 'owner' || role === 'editor';
    this.me = me;
    this.api = api;
    this.ydoc = new Y.Doc();
    this.files = this.ydoc.getMap('files');
    this.meta = this.ydoc.getMap('meta');
    this.folders = this.ydoc.getMap('folders');
    this.undoManagers = new Map();
    this.listeners = { status: new Set(), presence: new Set() };
    this.connected = false;
    this.saveState = 'saved';
    const wsBase = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;
    // disableBc: every change goes through the server, which enforces view-only links.
    this.provider = new WebsocketProvider(wsBase, encodeURIComponent(project), this.ydoc, { connect: false, disableBc: true });
    this.awareness = this.provider.awareness;
    this.awareness.setLocalStateField('user', { name: me.name, color: me.color, role });
    // The owner changed or revoked this person's link: reload so access is checked again.
    this.provider.on('connection-close', (event) => {
      if (event?.code === 4001 && role !== 'owner') location.reload();
    });
    this.provider.on('status', ({ status }) => {
      this.connected = status === 'connected';
      this.emit('status');
    });
    this.awareness.on('change', () => this.emit('presence', this.people()));
    this.ydoc.on('update', (_u, origin) => {
      if (origin === this.provider) return;
      // Local edit: the server writes it to disk a moment after it arrives.
      this.saveState = 'saving';
      this.emit('status');
      clearTimeout(this.savedTimer);
      this.savedTimer = setTimeout(() => {
        this.saveState = 'saved';
        this.emit('status');
      }, 700);
    });
  }

  on(event, fn) {
    this.listeners[event].add(fn);
    return () => this.listeners[event].delete(fn);
  }

  emit(event, data) {
    for (const fn of this.listeners[event]) fn(data);
  }

  /** Resolves once the document has arrived from the server. */
  connect() {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Couldn’t reach the live session. Check that PaperWriter is still running.')), 10000);
      this.provider.once('sync', () => {
        clearTimeout(timer);
        resolve(this);
      });
      this.provider.connect();
    });
  }

  people() {
    const out = [];
    for (const [id, st] of this.awareness.getStates()) {
      if (st.user) out.push({ ...st.user, id, me: id === this.ydoc.clientID });
    }
    return out;
  }

  destroy() {
    for (const um of this.undoManagers.values()) um.destroy();
    this.provider.destroy();
    this.ydoc.destroy();
  }

  /* ───────── files ───────── */

  fileList() {
    const out = [];
    for (const [path, v] of this.files.entries()) {
      if (v instanceof Y.Text) out.push({ path, kind: 'text', size: new Blob([v.toString()]).size });
      else if (v && typeof v === 'object') out.push({ path, kind: v.kind || 'binary', size: v.size || 0 });
    }
    return out.sort((a, b) => a.path.localeCompare(b.path));
  }

  folderList() {
    return [...this.folders.keys()];
  }

  text(path) {
    const v = this.files.get(path);
    return v instanceof Y.Text ? v : null;
  }

  /** Per-file undo that only undoes this person's own edits. */
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

  url(suffix) {
    return `/api/projects/${encodeURIComponent(this.project)}${suffix}`;
  }

  setMain(path) {
    return this.api(this.url('/meta'), { method: 'POST', body: { main: path } });
  }

  createText(path, content = '') {
    return this.api(this.url('/files'), { method: 'POST', body: { path, content } });
  }

  async rename(from, to) {
    await this.api(this.url('/rename'), { method: 'POST', body: { from, to } });
    this.undoManagers.get(from)?.destroy();
    this.undoManagers.delete(from);
  }

  createFolder(path) {
    return this.api(this.url('/folders'), { method: 'POST', body: { path } });
  }

  async renameFolder(from, to) {
    await this.api(this.url('/rename'), { method: 'POST', body: { from, to, folder: true } });
    for (const [p, um] of this.undoManagers) {
      if (!p.startsWith(`${from}/`)) continue;
      um.destroy();
      this.undoManagers.delete(p);
    }
  }

  removeFolder(path) {
    return this.api(`${this.url('/file')}?path=${encodeURIComponent(path)}&folder=1`, { method: 'DELETE' });
  }

  remove(path) {
    return this.api(`${this.url('/file')}?path=${encodeURIComponent(path)}`, { method: 'DELETE' });
  }

  async upload(path, file) {
    return this.api(`${this.url('/file')}?path=${encodeURIComponent(path)}`, {
      method: 'PUT',
      body: await file.arrayBuffer(),
      headers: { 'content-type': 'application/octet-stream' },
    });
  }

  fileUrl(path) {
    return `${this.url('/file')}?path=${encodeURIComponent(path)}`;
  }
}
