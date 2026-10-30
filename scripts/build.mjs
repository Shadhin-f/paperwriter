// Copies browser libraries into public/vendor and bundles the collaboration stack.
// Runs before `npm start` and as Vercel's build command.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const NM = path.join(ROOT, 'node_modules');
const OUT = path.join(ROOT, 'public', 'vendor');

const COPIES = [
  ['codemirror/lib/codemirror.js', 'codemirror/lib/codemirror.js'],
  ['codemirror/lib/codemirror.css', 'codemirror/lib/codemirror.css'],
  ['codemirror/mode/stex/stex.js', 'codemirror/mode/stex/stex.js'],
  ['codemirror/addon/edit/matchbrackets.js', 'codemirror/addon/edit/matchbrackets.js'],
  ['codemirror/addon/edit/closebrackets.js', 'codemirror/addon/edit/closebrackets.js'],
  ['codemirror/addon/search/searchcursor.js', 'codemirror/addon/search/searchcursor.js'],
  ['codemirror/addon/search/search.js', 'codemirror/addon/search/search.js'],
  ['codemirror/addon/dialog/dialog.js', 'codemirror/addon/dialog/dialog.js'],
  ['codemirror/addon/dialog/dialog.css', 'codemirror/addon/dialog/dialog.css'],
  ['codemirror/addon/selection/active-line.js', 'codemirror/addon/selection/active-line.js'],
  ['codemirror/addon/comment/comment.js', 'codemirror/addon/comment/comment.js'],
  ['pdfjs-dist/build/pdf.min.mjs', 'pdfjs/build/pdf.min.mjs'],
  ['pdfjs-dist/build/pdf.worker.min.mjs', 'pdfjs/build/pdf.worker.min.mjs'],
  ['katex/dist/katex.min.css', 'katex/katex.min.css'],
  ['katex/dist/katex.mjs', 'katex/katex.mjs'],
  ['katex/dist/fonts', 'katex/fonts'],
];

const started = Date.now();
await fs.rm(OUT, { recursive: true, force: true });
for (const [from, to] of COPIES) {
  const dest = path.join(OUT, to);
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.cp(path.join(NM, from), dest, { recursive: true });
}

// y-codemirror imports `codemirror`; point it at the global CodeMirror 5 the page already loads.
const useGlobalCodeMirror = {
  name: 'global-codemirror',
  setup(b) {
    b.onResolve({ filter: /^codemirror$/ }, () => ({ path: 'codemirror', namespace: 'cm-global' }));
    b.onLoad({ filter: /.*/, namespace: 'cm-global' }, () => ({ contents: 'export default window.CodeMirror;', loader: 'js' }));
  },
};

await build({
  entryPoints: [path.join(ROOT, 'src', 'collab-entry.js')],
  outfile: path.join(OUT, 'collab.js'),
  bundle: true,
  format: 'esm',
  minify: true,
  target: 'es2022',
  platform: 'browser',
  legalComments: 'none',
  plugins: [useGlobalCodeMirror],
  logLevel: 'warning',
});

console.log(`✓ vendor assets built in ${Date.now() - started}ms`);
