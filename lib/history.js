// Version history: snapshots of a project's text files, taken automatically as people write
// (and on request, with a name). Stored inside the project in .history/, which is hidden from
// the file list and left out of exports. File contents are stored once per distinct version.
import crypto from 'node:crypto';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { projectDir } from './projects.js';

const DIR = '.history';
const INDEX = 'versions.json';
const KEEP = 300; // automatic versions kept; named versions are always kept

const hash = (text) => crypto.createHash('sha256').update(text).digest('hex').slice(0, 40);

export class History {
  constructor(project) {
    this.project = project;
    this.versions = [];
    this.queue = Promise.resolve();
  }

  get dir() {
    return path.join(projectDir(this.project), DIR);
  }

  async load() {
    try {
      this.versions = JSON.parse(await fsp.readFile(path.join(this.dir, INDEX), 'utf8'));
    } catch {
      this.versions = [];
    }
    return this;
  }

  /** Versions newest first, without file contents. */
  list() {
    return this.versions
      .map(({ files, ...v }, i) => ({ ...v, first: i === 0, fileCount: Object.keys(files).length }))
      .reverse();
  }

  /**
   * Saves a version if anything changed since the last one (or if it has a name).
   * @param {Map<string,string>} texts  path → contents
   * @param {{ by?: string[], label?: string }} o
   */
  record(texts, o = {}) {
    // One at a time, so two quick snapshots can't interleave their writes.
    const run = this.queue.then(() => this.#record(texts, o));
    this.queue = run.catch(() => {});
    return run;
  }

  async #record(texts, { by = [], label = '' }) {
    const prev = this.versions.at(-1)?.files || {};
    const files = {};
    await fsp.mkdir(path.join(this.dir, 'blobs'), { recursive: true });
    for (const [p, text] of texts) {
      const h = hash(text);
      files[p] = h;
      if (prev[p] !== h) await fsp.writeFile(path.join(this.dir, 'blobs', h), text, { flag: 'wx' }).catch((e) => e.code !== 'EEXIST' && Promise.reject(e));
    }
    const changed = [];
    for (const p of Object.keys(files)) if (prev[p] !== files[p]) changed.push({ path: p, kind: p in prev ? 'modified' : 'added' });
    for (const p of Object.keys(prev)) if (!(p in files)) changed.push({ path: p, kind: 'removed' });
    if (!changed.length && !label) return null;
    const at = Date.now();
    const v = { id: `${at.toString(36)}${crypto.randomBytes(2).toString('hex')}`, at, by: [...new Set(by)].slice(0, 12), label: String(label).slice(0, 80), changed, files };
    this.versions.push(v);
    await this.#prune();
    await fsp.writeFile(path.join(this.dir, INDEX), JSON.stringify(this.versions));
    return v;
  }

  async #prune() {
    const auto = this.versions.filter((v) => !v.label);
    if (auto.length <= KEEP) return;
    const drop = new Set(auto.slice(1, auto.length - KEEP + 1)); // keep the very first version as the starting point
    this.versions = this.versions.filter((v) => !drop.has(v));
    const used = new Set(this.versions.flatMap((v) => Object.values(v.files)));
    for (const f of await fsp.readdir(path.join(this.dir, 'blobs')).catch(() => [])) {
      if (!used.has(f)) await fsp.rm(path.join(this.dir, 'blobs', f), { force: true });
    }
  }

  get(id) {
    return this.versions.find((v) => v.id === id) || null;
  }

  /** A file's contents in a version (null if it didn't exist then). */
  async read(id, file) {
    const h = this.get(id)?.files[file];
    if (!h) return null;
    return fsp.readFile(path.join(this.dir, 'blobs', h), 'utf8');
  }

  /** The same file in the version before `id`, for showing what changed. */
  async readPrevious(id, file) {
    const i = this.versions.findIndex((v) => v.id === id);
    return i > 0 ? this.read(this.versions[i - 1].id, file) : null;
  }
}
