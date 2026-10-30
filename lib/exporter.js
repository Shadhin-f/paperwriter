// Export a project as a .zip that other LaTeX platforms (and PaperWriter's own importer) can open.
// Source files only: build output, share links and live-sync state stay behind.
import fsp from 'node:fs/promises';
import path from 'node:path';
import { zip } from 'fflate';
import { listFiles, projectDir } from './projects.js';

// Already compressed: storing them as-is is faster and no bigger.
const STORE_ONLY = /\.(png|jpe?g|gif|webp|pdf|zip|gz|tgz)$/i;

export async function exportProject(project) {
  const dir = projectDir(project);
  const entries = {};
  for (const f of await listFiles(project)) {
    const data = await fsp.readFile(path.join(dir, f.path));
    entries[f.path] = [new Uint8Array(data), { level: STORE_ONLY.test(f.path) ? 0 : 6 }];
  }
  return new Promise((resolve, reject) => {
    zip(entries, (err, out) => (err ? reject(err) : resolve(Buffer.from(out))));
  });
}
