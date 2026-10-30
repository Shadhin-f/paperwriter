// Live co-editing: one Yjs document per open project, synced to browsers over WebSocket
// (the standard y-websocket protocol) and written back to the project's files on disk.
import fsp from 'node:fs/promises';
import path from 'node:path';
import * as Y from 'yjs';
import * as syncProtocol from 'y-protocols/sync';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';
import { WebSocketServer } from 'ws';
import { projectDir, listFiles, getMeta, setMeta, resolveIn, kindOf } from './projects.js';
import { HttpError } from './util.js';

const MSG_SYNC = 0;
const MSG_AWARENESS = 1;
const MSG_QUERY_AWARENESS = 3;
// Keeps Yjs item identities across restarts, so browsers that reconnect merge cleanly instead of duplicating text.
const STATE_FILE = '.paperwriter.ydoc';
const IDLE_CLOSE_MS = 30000;

const rooms = new Map(); // project → Promise<Room>

/** Smallest edit that turns the Y.Text into `next` (used when a file was changed outside PaperWriter). */
function replaceText(ytext, next) {
  const cur = ytext.toString();
  let a = 0;
  while (a < cur.length && a < next.length && cur[a] === next[a]) a++;
  let b = 0;
  while (b < cur.length - a && b < next.length - a && cur[cur.length - 1 - b] === next[next.length - 1 - b]) b++;
  if (cur.length - a - b > 0) ytext.delete(a, cur.length - a - b);
  if (next.length - a - b > 0) ytext.insert(a, next.slice(a, next.length - b));
}

class Room {
  constructor(project) {
    this.project = project;
    this.doc = new Y.Doc();
    this.files = this.doc.getMap('files');
    this.meta = this.doc.getMap('meta');
    this.awareness = new awarenessProtocol.Awareness(this.doc);
    this.awareness.setLocalState(null);
    this.conns = new Set();
    this.dirty = new Set();
  }

  async load() {
    const dir = projectDir(this.project);
    try {
      Y.applyUpdate(this.doc, await fsp.readFile(path.join(dir, STATE_FILE)), 'load');
    } catch {}
    // Disk is the source of truth: reconcile the saved state with the files as they are now.
    const onDisk = await listFiles(this.project);
    const contents = new Map();
    for (const f of onDisk) if (f.kind === 'text') contents.set(f.path, await fsp.readFile(path.join(dir, f.path), 'utf8'));
    const { main } = await getMeta(this.project);
    this.doc.transact(() => {
      const seen = new Set();
      for (const f of onDisk) {
        seen.add(f.path);
        const cur = this.files.get(f.path);
        if (f.kind === 'text') {
          if (cur instanceof Y.Text) replaceText(cur, contents.get(f.path));
          else this.files.set(f.path, new Y.Text(contents.get(f.path)));
        } else if (!cur || cur instanceof Y.Text || cur.size !== f.size) {
          this.files.set(f.path, { kind: f.kind, size: f.size, at: Date.now() });
        }
      }
      for (const key of [...this.files.keys()]) if (!seen.has(key)) this.files.delete(key);
      if (this.meta.get('main') !== main) this.meta.set('main', main);
    }, 'load');

    this.files.observeDeep((events, tr) => {
      if (tr.origin === 'load' || tr.origin === 'server') return;
      for (const e of events) {
        if (e.target === this.files) {
          for (const [key, change] of e.changes.keys) if (change.action !== 'delete' && this.files.get(key) instanceof Y.Text) this.dirty.add(key);
        } else if (e.path.length) this.dirty.add(String(e.path[0]));
      }
      if (this.dirty.size) this.scheduleFlush();
    });
    this.doc.on('update', (update, origin) => {
      const enc = encoding.createEncoder();
      encoding.writeVarUint(enc, MSG_SYNC);
      syncProtocol.writeUpdate(enc, update);
      this.broadcast(encoding.toUint8Array(enc), origin);
      if (origin !== 'load') this.stateDirty = true;
    });
    this.awareness.on('update', ({ added, updated, removed }, origin) => {
      const changed = added.concat(updated, removed);
      if (origin && origin.ids) {
        for (const id of added.concat(updated)) origin.ids.add(id);
        for (const id of removed) origin.ids.delete(id);
      }
      const enc = encoding.createEncoder();
      encoding.writeVarUint(enc, MSG_AWARENESS);
      encoding.writeVarUint8Array(enc, awarenessProtocol.encodeAwarenessUpdate(this.awareness, changed));
      this.broadcast(encoding.toUint8Array(enc));
    });
    return this;
  }

  broadcast(msg, except) {
    for (const c of this.conns) if (c !== except) this.send(c, msg);
  }

  send(conn, msg) {
    if (conn.ws.readyState !== 1) return;
    conn.ws.send(msg, (err) => err && conn.ws.close());
  }

  addConn(ws, role) {
    const conn = { ws, role, ids: new Set() };
    this.conns.add(conn);
    clearTimeout(this.closeTimer);
    ws.binaryType = 'arraybuffer';
    ws.on('message', (data) => {
      try {
        this.onMessage(conn, new Uint8Array(data));
      } catch (e) {
        console.error(`[collab] bad message in ${this.project}:`, e.message);
      }
    });
    ws.on('close', () => this.removeConn(conn));
    // Start the handshake: send our state vector, plus everyone's cursors.
    const enc = encoding.createEncoder();
    encoding.writeVarUint(enc, MSG_SYNC);
    syncProtocol.writeSyncStep1(enc, this.doc);
    this.send(conn, encoding.toUint8Array(enc));
    this.sendAwareness(conn);
  }

  sendAwareness(conn) {
    const states = this.awareness.getStates();
    if (!states.size) return;
    const enc = encoding.createEncoder();
    encoding.writeVarUint(enc, MSG_AWARENESS);
    encoding.writeVarUint8Array(enc, awarenessProtocol.encodeAwarenessUpdate(this.awareness, [...states.keys()]));
    this.send(conn, encoding.toUint8Array(enc));
  }

  onMessage(conn, msg) {
    const dec = decoding.createDecoder(msg);
    const type = decoding.readVarUint(dec);
    if (type === MSG_SYNC) {
      // Viewers may only request the document; their edits never reach it.
      if (conn.role === 'viewer' && decoding.peekVarUint(dec) !== syncProtocol.messageYjsSyncStep1) return;
      const enc = encoding.createEncoder();
      encoding.writeVarUint(enc, MSG_SYNC);
      syncProtocol.readSyncMessage(dec, enc, this.doc, conn);
      if (encoding.length(enc) > 1) this.send(conn, encoding.toUint8Array(enc));
    } else if (type === MSG_AWARENESS) {
      awarenessProtocol.applyAwarenessUpdate(this.awareness, decoding.readVarUint8Array(dec), conn);
    } else if (type === MSG_QUERY_AWARENESS) {
      this.sendAwareness(conn);
    }
  }

  removeConn(conn) {
    this.conns.delete(conn);
    awarenessProtocol.removeAwarenessStates(this.awareness, [...conn.ids], null);
    if (!this.conns.size) {
      this.closeTimer = setTimeout(async () => {
        if (this.conns.size) return;
        await this.flush();
        rooms.delete(this.project);
        this.doc.destroy();
      }, IDLE_CLOSE_MS);
    }
  }

  scheduleFlush() {
    clearTimeout(this.flushTimer);
    this.flushTimer = setTimeout(() => this.flush().catch((e) => console.error('[collab] save failed:', e.message)), 300);
  }

  /** Write changed text files (and the Yjs state) to disk. */
  async flush() {
    clearTimeout(this.flushTimer);
    const paths = [...this.dirty];
    this.dirty.clear();
    for (const p of paths) {
      const v = this.files.get(p);
      if (!(v instanceof Y.Text)) continue;
      const { full } = resolveIn(this.project, p);
      await fsp.mkdir(path.dirname(full), { recursive: true });
      await fsp.writeFile(full, v.toString());
    }
    if (this.stateDirty) {
      this.stateDirty = false;
      await fsp.writeFile(path.join(projectDir(this.project), STATE_FILE), Y.encodeStateAsUpdate(this.doc));
    }
  }

  /* ───────── file operations requested over HTTP ───────── */

  async createText(rel, content = '') {
    const { full, rel: clean } = resolveIn(this.project, rel);
    if (this.files.has(clean)) throw new HttpError(409, 'A file with that name already exists');
    if (kindOf(clean) !== 'text') throw new HttpError(400, 'Only text files can be created; upload other files instead.');
    await fsp.mkdir(path.dirname(full), { recursive: true });
    await fsp.writeFile(full, content);
    this.doc.transact(() => this.files.set(clean, new Y.Text(content)), 'server');
    this.stateDirty = true;
  }

  async rename(from, to) {
    const a = resolveIn(this.project, from);
    const b = resolveIn(this.project, to);
    const v = this.files.get(a.rel);
    if (v === undefined) throw new HttpError(404, 'File not found');
    if (this.files.has(b.rel)) throw new HttpError(409, 'A file with that name already exists');
    await this.flush();
    await fsp.mkdir(path.dirname(b.full), { recursive: true });
    await fsp.rename(a.full, b.full);
    this.doc.transact(() => {
      this.files.set(b.rel, v instanceof Y.Text ? new Y.Text(v.toString()) : { ...v });
      this.files.delete(a.rel);
      if (this.meta.get('main') === a.rel) this.meta.set('main', b.rel);
    }, 'server');
    if (this.meta.get('main') === b.rel) await setMeta(this.project, { main: b.rel });
    this.stateDirty = true;
  }

  async remove(rel) {
    const { full, rel: clean } = resolveIn(this.project, rel);
    await fsp.rm(full, { force: true });
    this.doc.transact(() => this.files.delete(clean), 'server');
    this.stateDirty = true;
  }

  /** A file was just written to disk by an upload: show it to everyone (text files become editable). */
  async uploaded(rel, size) {
    const { full, rel: clean } = resolveIn(this.project, rel);
    const kind = kindOf(clean);
    const content = kind === 'text' ? await fsp.readFile(full, 'utf8') : null;
    this.doc.transact(() => {
      const cur = this.files.get(clean);
      if (kind !== 'text') this.files.set(clean, { kind, size, at: Date.now() });
      else if (cur instanceof Y.Text) replaceText(cur, content);
      else this.files.set(clean, new Y.Text(content));
    }, 'server');
    this.stateDirty = true;
  }

  async setMain(rel) {
    const { rel: clean } = resolveIn(this.project, rel);
    await setMeta(this.project, { main: clean });
    this.doc.transact(() => this.meta.set('main', clean), 'server');
  }
}

/** Opens (or reuses) the live room for a project. */
export function room(project) {
  projectDir(project); // validates the name
  if (!rooms.has(project)) {
    const p = new Room(project).load();
    rooms.set(project, p);
    p.catch(() => rooms.delete(project));
  }
  return rooms.get(project);
}

/** Makes sure everything typed so far is on disk (before compiling). */
export async function flushProject(project) {
  const r = rooms.get(project);
  if (r) await (await r).flush();
}

/**
 * After a share link is revoked or changed: disconnect every guest. They reconnect and are
 * re-checked, so revoked links lose access at once and changed roles take effect.
 */
export async function kickGuests(project) {
  const r = await rooms.get(project)?.catch(() => null);
  if (!r) return;
  for (const c of r.conns) if (c.role !== 'owner') c.ws.close(4001, 'Access changed');
}

/** Drops a room without saving (the project was deleted). */
export async function closeRoom(project) {
  const p = rooms.get(project);
  if (!p) return;
  rooms.delete(project);
  const r = await p.catch(() => null);
  if (!r) return;
  clearTimeout(r.flushTimer);
  for (const c of r.conns) c.ws.close(4404, 'Project deleted');
}

/**
 * Accepts WebSocket upgrades on /ws/<project>.
 * `authorize(req, project)` returns the caller's role or throws.
 */
export function attachCollab(server, authorize) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 20 * 1024 * 1024 });
  server.on('upgrade', async (req, socket, head) => {
    const reject = (code, text) => {
      socket.write(`HTTP/1.1 ${code} ${text}\r\nConnection: close\r\n\r\n`);
      socket.destroy();
    };
    try {
      const url = new URL(req.url, 'http://localhost');
      const m = url.pathname.match(/^\/ws\/([^/]+)$/);
      if (!m) return reject(404, 'Not Found');
      const project = decodeURIComponent(m[1]);
      const role = await authorize(req, project);
      const r = await room(project);
      wss.handleUpgrade(req, socket, head, (ws) => r.addConn(ws, role));
    } catch (e) {
      reject(e.status === 403 ? 403 : e.status === 404 ? 404 : 400, e.status === 403 ? 'Forbidden' : 'Bad Request');
    }
  });
  return wss;
}
