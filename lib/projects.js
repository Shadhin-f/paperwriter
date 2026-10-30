import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { PROJECTS, HttpError } from './util.js';
import { TEMPLATES } from '../public/templates.js';

export const TEXT_EXT = new Set([
  '.tex', '.bib', '.sty', '.cls', '.bst', '.bbx', '.cbx', '.def', '.cfg', '.clo', '.ltx', '.dtx', '.ins',
  '.txt', '.md', '.csv', '.dat', '.tikz', '.json', '.yaml', '.yml', '.lua', '.py', '.r', '.m',
]);
export const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.svg', '.pdf', '.eps', '.webp']);

const META = '.paperwriter.json';

export function kindOf(file) {
  const ext = path.extname(file).toLowerCase();
  if (TEXT_EXT.has(ext)) return 'text';
  if (IMAGE_EXT.has(ext)) return 'image';
  return 'binary';
}

export function projectDir(name) {
  if (typeof name !== 'string' || !/^[\w][\w .-]{0,63}$/.test(name) || name.includes('..')) {
    throw new HttpError(400, 'Invalid project name');
  }
  const dir = path.join(PROJECTS, name);
  if (!fs.existsSync(dir)) throw new HttpError(404, `Project "${name}" not found`);
  return dir;
}

/** Resolve a project-relative path, refusing anything that escapes the project or touches hidden dirs. */
export function resolveIn(project, rel) {
  const dir = projectDir(project);
  if (typeof rel !== 'string' || !rel.trim()) throw new HttpError(400, 'Missing file path');
  const clean = rel.replace(/\\/g, '/').replace(/^\/+/, '');
  if (clean.split('/').some((seg) => seg === '..' || seg.startsWith('.') || seg === '')) {
    throw new HttpError(400, 'Invalid file path');
  }
  const full = path.resolve(dir, clean);
  if (!full.startsWith(path.resolve(dir) + path.sep)) throw new HttpError(400, 'Invalid file path');
  return { dir, full, rel: clean };
}

export async function listProjects() {
  await fsp.mkdir(PROJECTS, { recursive: true });
  const entries = await fsp.readdir(PROJECTS, { withFileTypes: true });
  const out = [];
  for (const e of entries) {
    if (!e.isDirectory() || e.name.startsWith('.')) continue;
    const st = await fsp.stat(path.join(PROJECTS, e.name));
    out.push({ name: e.name, modified: st.mtimeMs });
  }
  return out.sort((a, b) => b.modified - a.modified);
}

export async function createProject(name, template = 'article') {
  if (typeof name !== 'string' || !/^[\w][\w .-]{0,63}$/.test(name.trim()) || name.includes('..')) {
    throw new HttpError(400, 'Use letters, numbers, spaces, dots, dashes or underscores (max 64).');
  }
  name = name.trim();
  const dir = path.join(PROJECTS, name);
  if (fs.existsSync(dir)) throw new HttpError(409, 'A project with that name already exists');
  await fsp.mkdir(dir, { recursive: true });
  const tpl = TEMPLATES[template] || TEMPLATES.article;
  for (const [file, content] of Object.entries(tpl)) await fsp.writeFile(path.join(dir, file), content);
  await setMeta(name, { main: 'main.tex' });
  return { name };
}

export async function deleteProject(name) {
  const dir = projectDir(name);
  await fsp.rm(dir, { recursive: true, force: true });
}

export async function getMeta(project) {
  const dir = projectDir(project);
  let meta = {};
  try {
    meta = JSON.parse(await fsp.readFile(path.join(dir, META), 'utf8'));
  } catch {}
  if (!meta.main || !fs.existsSync(path.join(dir, meta.main))) {
    const files = await listFiles(project);
    const texs = files.filter((f) => f.path.endsWith('.tex'));
    let main = texs.find((f) => f.path === 'main.tex')?.path;
    if (!main) {
      for (const f of texs) {
        const src = await fsp.readFile(path.join(dir, f.path), 'utf8');
        if (/\\documentclass/.test(src)) {
          main = f.path;
          break;
        }
      }
    }
    meta.main = main || texs[0]?.path || 'main.tex';
  }
  return meta;
}

export async function setMeta(project, patch) {
  const dir = projectDir(project);
  let meta = {};
  try {
    meta = JSON.parse(await fsp.readFile(path.join(dir, META), 'utf8'));
  } catch {}
  Object.assign(meta, patch);
  await fsp.writeFile(path.join(dir, META), JSON.stringify(meta, null, 2));
  return meta;
}

export async function listFiles(project) {
  const dir = projectDir(project);
  const out = [];
  async function walk(sub) {
    const entries = await fsp.readdir(path.join(dir, sub), { withFileTypes: true });
    for (const e of entries) {
      if (e.name.startsWith('.')) continue;
      const rel = sub ? `${sub}/${e.name}` : e.name;
      if (e.isDirectory()) await walk(rel);
      else {
        const st = await fsp.stat(path.join(dir, rel));
        out.push({ path: rel, size: st.size, kind: kindOf(rel) });
      }
    }
  }
  await walk('');
  return out.sort((a, b) => a.path.localeCompare(b.path));
}

/** Every folder in the project, including empty ones (hidden folders like .out are skipped). */
export async function listFolders(project) {
  const dir = projectDir(project);
  const out = [];
  async function walk(sub) {
    for (const e of await fsp.readdir(path.join(dir, sub), { withFileTypes: true })) {
      if (!e.isDirectory() || e.name.startsWith('.')) continue;
      const rel = sub ? `${sub}/${e.name}` : e.name;
      out.push(rel);
      await walk(rel);
    }
  }
  await walk('');
  return out.sort((a, b) => a.localeCompare(b));
}

export async function readText(project, rel) {
  const { full } = resolveIn(project, rel);
  if (kindOf(full) !== 'text') throw new HttpError(415, 'Not a text file');
  return fsp.readFile(full, 'utf8');
}

export async function writeFile(project, rel, data) {
  const { full } = resolveIn(project, rel);
  await fsp.mkdir(path.dirname(full), { recursive: true });
  await fsp.writeFile(full, data);
}

export async function deleteFile(project, rel) {
  const { full } = resolveIn(project, rel);
  await fsp.rm(full, { force: true });
}

export async function renameFile(project, from, to) {
  const a = resolveIn(project, from);
  const b = resolveIn(project, to);
  if (fs.existsSync(b.full)) throw new HttpError(409, 'A file with that name already exists');
  await fsp.mkdir(path.dirname(b.full), { recursive: true });
  await fsp.rename(a.full, b.full);
}

export async function ensureWelcomeProject() {
  const existing = await listProjects();
  if (existing.length) return;
  await createProject('Welcome', 'welcome');
}
