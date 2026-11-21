import { markdown, parseReply, locate, lineDiff, esc } from './md.js';
import * as pdfjs from '/vendor/pdfjs/build/pdf.min.mjs';
import { VisualEditor } from './visual.js';
import { DIRECT, directModels, directChat, Bridge } from './ai-client.js';

pdfjs.GlobalWorkerOptions.workerSrc = '/vendor/pdfjs/build/pdf.worker.min.mjs';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const enc = encodeURIComponent;
const uid = () => Math.random().toString(36).slice(2, 10);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ───────────────────────── icons ───────────────────────── */

const ICONS = {
  folder: '<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>',
  chevron: '<path d="m6 9 6 6 6-6"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  play: '<path d="M7 4.5v15a1 1 0 0 0 1.5.86l12.5-7.5a1 1 0 0 0 0-1.72L8.5 3.64A1 1 0 0 0 7 4.5Z" fill="currentColor"/>',
  moon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>',
  settings: '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>',
  sparkle: '<path d="M9.94 15.5A2 2 0 0 0 8.5 14.06l-6.14-1.58a.5.5 0 0 1 0-.96L8.5 9.94A2 2 0 0 0 9.94 8.5l1.58-6.14a.5.5 0 0 1 .96 0l1.58 6.14a2 2 0 0 0 1.44 1.44l6.14 1.58a.5.5 0 0 1 0 .96l-6.14 1.58a2 2 0 0 0-1.44 1.44l-1.58 6.14a.5.5 0 0 1-.96 0z"/><path d="M20 3v4M22 5h-4"/>',
  files: '<path d="M15 2H8a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7Z"/><path d="M15 2v5h5"/><path d="M4 7v13a2 2 0 0 0 2 2h10"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  send: '<path d="M12 19V5M5 12l7-7 7 7"/>',
  stop: '<rect x="7" y="7" width="10" height="10" rx="2" fill="currentColor"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
  star: '<path d="m12 2 3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z" fill="currentColor"/>',
  starOutline: '<path d="m12 2 3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z"/>',
  file: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v5h6M8 13h8M8 17h5"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.09-3.09a2 2 0 0 0-2.82 0L6 21"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
  redo: '<path d="m15 14 5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13"/>',
  info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
  alert: '<circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/>',
  ok: '<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>',
  code: '<path d="m16 18 6-6-6-6M8 6l-6 6 6 6"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  trash: '<path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
  pencil: '<path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>',
  copy: '<rect x="8" y="8" width="14" height="14" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
  select: '<path d="M5 3a2 2 0 0 0-2 2M19 3a2 2 0 0 1 2 2M21 19a2 2 0 0 1-2 2M5 21a2 2 0 0 1-2-2M9 3h1M9 21h1M14 3h1M14 21h1M3 9v1M21 9v1M3 14v1M21 14v1"/>',
  refresh: '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8M21 3v5h-5M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16M8 16H3v5"/>',
  terminal: '<path d="m4 17 6-6-6-6M12 19h8"/>',
  key: '<circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6M15.5 7.5l3 3L22 7l-3-3"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
  mail: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 5L2 7"/>',
  eye: '<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
  history: '<path d="M3 12a9 9 0 1 0 2.64-6.36L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l3 2"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
  globe: '<circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>',
  folderOpen: '<path d="m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2"/>',
  folderPlus: '<path d="M12 10v6M9 13h6M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>',
  filePlus: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v5h6M9 15h6M12 12v6"/>',
  book: '<path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/>',
  collapseAll: '<path d="m7 20 5-5 5 5M7 4l5 5 5-5"/>',
  lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
};
const svg = (body) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
const icon = (name) => `<i data-icon="${name}">${svg(ICONS[name] || '')}</i>`;
function hydrateIcons(root = document) {
  for (const el of $$('i[data-icon]', root)) if (!el.firstElementChild) el.innerHTML = svg(ICONS[el.dataset.icon] || '');
}

/* ───────────────────────── prefs & state ───────────────────────── */

const prefs = Object.assign(
  { provider: null, model: null, autoCompile: true, autoApply: true, theme: 'system', leftW: null, rightW: null, zoom: 'fit', lastProject: null, lastFiles: {}, fontSize: 14 },
  (() => {
    try {
      return JSON.parse(localStorage.getItem('pw.prefs') || '{}');
    } catch {
      return {};
    }
  })(),
);
const savePrefs = () => {
  try {
    localStorage.setItem('pw.prefs', JSON.stringify(prefs));
  } catch {}
};

const state = {
  project: null,
  files: [],
  meta: { main: 'main.tex' },
  file: null,
  folders: [],
  fileFilter: '',
  moving: false, // a move of ours is in progress, so its open file shouldn't be closed
  drag: null,
  docs: new Map(),
  status: null,
  modelCache: {},
  chat: [],
  streaming: null,
  lastResult: null,
  errors: [],
  warnings: [],
  log: '',
  compiling: false,
  compileQueued: false,
  pdfDoc: null,
  pdfUrl: null,
  pdfScale: 1,
  useSelection: true,
  useErrors: true,
  errorLines: [],
  // live session
  me: null, // { owner: true } or { owner: false, projects: [{ name, role, ai }] }
  collab: null, // the collab.js module
  ws: null, // open Workspace
  binding: null,
  role: 'owner',
  ai: true,
  people: [],
};

const isOwner = () => !!state.me?.owner;
const canEdit = () => !!state.ws?.canEdit;

const PROVIDER_ORDER = ['claude-cli', 'anthropic', 'openai', 'gemini', 'ollama', 'compat', 'gemini-cli', 'codex-cli'];
const PREFERRED_MODEL = { 'claude-cli': 'sonnet', anthropic: 'claude-sonnet-5-5', openai: 'gpt-5', gemini: 'gemini-2.5-pro', 'gemini-cli': 'default', 'codex-cli': 'default' };
const P = () => enc(state.project);

/*
 * A collaborator's own AI never goes through the host:
 *   own:<provider>  their API key, kept in this browser and sent straight to the provider
 *   pc:<provider>   the AI in their own PaperWriter on their computer (Claude Code, Ollama, saved keys)
 */
const OWN = 'own:';
const PC = 'pc:';
const viaOf = (id) => (String(id || '').startsWith(OWN) ? 'own' : String(id || '').startsWith(PC) ? 'pc' : 'host');
const baseId = (id) => String(id || '').replace(/^(own|pc):/, '');
function ownKeys() {
  try {
    return JSON.parse(localStorage.getItem('pw.ownKeys') || '{}');
  } catch {
    return {};
  }
}
function setOwnKey(id, key) {
  const k = ownKeys();
  if (key) k[id] = key;
  else delete k[id];
  try {
    localStorage.setItem('pw.ownKeys', JSON.stringify(k));
  } catch {}
}
/** Guests may bring their own AI unless the host turned that off. */
const ownAllowed = () => !isOwner() && !!state.status?.guestKeys;
function bridgeConf() {
  try {
    return JSON.parse(localStorage.getItem('pw.bridge') || 'null');
  } catch {
    return null;
  }
}
function saveBridgeConf(conf) {
  try {
    if (conf) localStorage.setItem('pw.bridge', JSON.stringify(conf));
    else localStorage.removeItem('pw.bridge');
  } catch {}
}

/* ───────────────────────── api helpers ───────────────────────── */

async function api(path, { method = 'GET', body, headers = {} } = {}) {
  const isRaw = typeof body === 'string' || body instanceof Blob || body instanceof ArrayBuffer;
  const res = await fetch(path, {
    method,
    headers: { ...(body && !isRaw ? { 'content-type': 'application/json' } : {}), ...headers },
    body: body == null ? undefined : isRaw ? body : JSON.stringify(body),
  });
  const ct = res.headers.get('content-type') || '';
  const data = ct.includes('json') ? await res.json() : await res.text();
  if (!res.ok) throw new Error(data?.error || data || res.statusText);
  return data;
}

async function* sseEvents(body) {
  const reader = body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf('\n\n')) >= 0) {
      const chunk = buf.slice(0, i);
      buf = buf.slice(i + 2);
      const data = chunk.split('\n').filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trim()).join('\n');
      if (data) {
        try {
          yield JSON.parse(data);
        } catch {}
      }
    }
  }
}

/* ───────────────────────── toasts, popovers, modals ───────────────────────── */

function toast(text, kind = '', ms = 3200) {
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.innerHTML = `${icon(kind === 'err' ? 'alert' : kind === 'ok' ? 'ok' : 'sparkle')}<span>${esc(text)}</span>`;
  $('#toasts').append(el);
  setTimeout(() => {
    el.classList.add('out');
    setTimeout(() => el.remove(), 220);
  }, ms);
}

let popAnchor = null;
function openPopover(anchor, html, cls = '') {
  const pop = $('#popover');
  pop.className = `popover ${cls}`;
  pop.innerHTML = html;
  pop.hidden = false;
  popAnchor = anchor;
  hydrateIcons(pop);
  positionPopover();
  return pop;
}
function positionPopover() {
  const pop = $('#popover');
  if (pop.hidden || !popAnchor) return;
  const r = popAnchor.getBoundingClientRect();
  const w = pop.offsetWidth;
  const h = pop.offsetHeight;
  let left = Math.min(Math.max(10, r.left), window.innerWidth - w - 10);
  let top = r.bottom + 8;
  if (top + h > window.innerHeight - 10) top = Math.max(10, r.top - h - 8);
  pop.style.left = `${left}px`;
  pop.style.top = `${top}px`;
}
function closePopover() {
  $('#popover').hidden = true;
  popAnchor = null;
}
document.addEventListener('pointerdown', (e) => {
  const pop = $('#popover');
  if (!pop.hidden && !pop.contains(e.target) && !popAnchor?.contains(e.target)) closePopover();
});

function openModal(html, { onClose } = {}) {
  const m = $('#modal');
  m.innerHTML = `<div class="modal" role="dialog" aria-modal="true">${html}</div>`;
  m.hidden = false;
  hydrateIcons(m);
  const close = () => {
    m.hidden = true;
    m.innerHTML = '';
    onClose?.();
  };
  m.onclick = (e) => {
    if (e.target === m || e.target.closest('[data-close]')) close();
  };
  return { el: $('.modal', m), close };
}

function askText(title, { value = '', placeholder = '', okLabel = 'OK', extra = '', type = 'text', note = '' } = {}) {
  return new Promise((resolve) => {
    let done = false;
    const { el, close } = openModal(
      `<div class="modal-head"><h2>${esc(title)}</h2><button class="icon-btn" data-close>${icon('x')}</button></div>
       <form class="modal-body"><input class="input" name="v" type="${type}" value="${esc(value)}" placeholder="${esc(placeholder)}" autocomplete="off" spellcheck="false" />${extra}${note ? `<p class="note">${note}</p>` : ''}</form>
       <div class="modal-foot"><button class="btn-ghost" data-close>Cancel</button><button class="btn-primary" data-ok>${esc(okLabel)}</button></div>`,
      { onClose: () => !done && resolve(null) },
    );
    const input = $('input', el);
    input.focus();
    input.select();
    const submit = (e) => {
      e?.preventDefault();
      done = true;
      const extraVals = Object.fromEntries(new FormData($('form', el)));
      close();
      resolve(extra ? { value: input.value.trim(), ...extraVals } : input.value.trim());
    };
    $('form', el).onsubmit = submit;
    $('[data-ok]', el).onclick = submit;
  });
}

function confirmBox(title, text, okLabel = 'Delete') {
  return new Promise((resolve) => {
    let done = false;
    const { el, close } = openModal(
      `<div class="modal-head"><h2>${esc(title)}</h2></div><div class="modal-body"><p>${esc(text)}</p></div>
       <div class="modal-foot"><button class="btn-ghost" data-close>Cancel</button><button class="btn-primary" data-ok>${esc(okLabel)}</button></div>`,
      { onClose: () => !done && resolve(false) },
    );
    $('[data-ok]', el).onclick = () => {
      done = true;
      close();
      resolve(true);
    };
  });
}

/* ───────────────────────── theme & layout ───────────────────────── */

function applyTheme() {
  const dark = prefs.theme === 'dark' || (prefs.theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  $('#themeBtn').innerHTML = icon(dark ? 'sun' : 'moon');
}
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);

function applyLayout() {
  const root = document.documentElement.style;
  if (prefs.leftW) root.setProperty('--left-w', `${prefs.leftW}px`);
  if (prefs.rightW) root.setProperty('--right-w', `${prefs.rightW}px`);
  root.setProperty('--editor-size', `${prefs.fontSize}px`);
}

function setupResizers() {
  for (const g of $$('.gutter')) {
    g.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      g.setPointerCapture(e.pointerId);
      g.classList.add('dragging');
      document.body.classList.add('resizing');
      const ws = $('#workspace').getBoundingClientRect();
      const MIN_EDITOR = 240;
      const move = (ev) => {
        // Keep every panel usable: each side is bounded by what the other side leaves for the editor.
        if (g.dataset.resize === 'left') {
          const other = $('#pdfPanel').offsetWidth;
          prefs.leftW = Math.round(Math.min(Math.max(240, ev.clientX - ws.left - 14), ws.width - other - MIN_EDITOR - 40));
        } else {
          const other = $('#sidePanel').offsetWidth;
          prefs.rightW = Math.round(Math.min(Math.max(260, ws.right - ev.clientX - 14), ws.width - other - MIN_EDITOR - 40));
        }
        applyLayout();
        cm.refresh();
      };
      const up = () => {
        g.classList.remove('dragging');
        document.body.classList.remove('resizing');
        g.removeEventListener('pointermove', move);
        g.removeEventListener('pointerup', up);
        savePrefs();
        if (prefs.zoom === 'fit') renderPdf();
      };
      g.addEventListener('pointermove', move);
      g.addEventListener('pointerup', up);
    });
  }
}

const isMobile = () => matchMedia('(max-width: 960px)').matches;

function setView(view) {
  $('#workspace').dataset.view = view;
  for (const b of $$('#mobileNav button')) b.classList.toggle('active', b.dataset.view === view);
  if (view === 'chat' || view === 'files') setSideTab(view);
  if (view === 'editor') setTimeout(() => cm.refresh(), 0);
  if (view === 'pdf' && prefs.zoom === 'fit') setTimeout(renderPdf, 0);
}

function setSideTab(tab) {
  for (const b of $$('[data-side]')) b.classList.toggle('active', b.dataset.side === tab);
  $('#chatView').hidden = tab !== 'chat';
  $('#filesView').hidden = tab !== 'files';
}

/* ───────────────────────── editor ───────────────────────── */

const cm = CodeMirror($('#editor'), {
  mode: 'stex',
  lineNumbers: true,
  lineWrapping: true,
  matchBrackets: true,
  autoCloseBrackets: '()[]{}',
  styleActiveLine: true,
  indentUnit: 2,
  tabSize: 2,
  gutters: ['pw-errors', 'CodeMirror-linenumbers'],
  extraKeys: {
    'Ctrl-S': () => saveAndCompile(),
    'Cmd-S': () => saveAndCompile(),
    'Ctrl-Enter': () => compile(),
    'Cmd-Enter': () => compile(),
    'Ctrl-K': () => askAboutSelection(),
    'Cmd-K': () => askAboutSelection(),
    'Ctrl-/': 'toggleComment',
    'Cmd-/': 'toggleComment',
    Tab: (c) => (c.somethingSelected() ? c.indentSelection('add') : c.replaceSelection('  ')),
    'Shift-Tab': (c) => c.indentSelection('subtract'),
  },
});
cm.setOption('readOnly', 'nocursor');

let compileTimer = 0;
let statsTimer = 0;

cm.on('changes', (_cm, changes) => {
  visual?.onDocChange();
  clearTimeout(statsTimer);
  statsTimer = setTimeout(updateStats, 300);
  if (changes.every((c) => c.origin === 'setValue')) return;
  // Edits (yours or a collaborator's) are synced and saved by the server; we only recompile.
  if (prefs.autoCompile && state.ws) scheduleCompile(1500);
});
cm.on('cursorActivity', () => {
  const c = cm.getCursor();
  $('#cursorPos').textContent = `Ln ${c.line + 1}, Col ${c.ch + 1}`;
  renderCtxChips();
});

function modeFor(path) {
  return /\.(tex|sty|cls|bib|ltx|dtx|bbx|cbx|def|tikz)$/i.test(path) ? 'stex' : 'text/plain';
}

function setSaveStatus(s) {
  const el = $('#saveStatus');
  el.dataset.state = s;
  const map = {
    saved: ['check', 'Saved'],
    saving: ['refresh', 'Saving…'],
    error: ['alert', 'Save failed'],
    offline: ['alert', 'Reconnecting…'],
    connecting: ['refresh', 'Connecting…'],
    viewonly: ['eye', 'View only'],
  };
  const [ic, label] = map[s];
  el.innerHTML = `${icon(ic)}<span>${label}</span>`;
}

/** Edits are saved by the server as they sync; there is nothing to flush from the browser. */
async function saveAll() {}

/** Server-side file operations reach us over the live connection; wait for them before using the file. */
async function waitFor(cond, ms = 3000) {
  const end = Date.now() + ms;
  while (!cond() && Date.now() < end) await sleep(40);
}

function updateStats() {
  const text = cm.getValue();
  const words = text
    .replace(/(^|[^\\])%.*$/gm, '$1')
    .replace(/\\(begin|end)\{[^}]*\}/g, ' ')
    .replace(/\\[a-zA-Z@]+\*?(\[[^\]]*\])?/g, ' ')
    .replace(/\$[^$]*\$/g, ' x ')
    .replace(/[{}[\]\\$&_^~#]/g, ' ')
    .split(/\s+/)
    .filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
  $('#wordCount').textContent = `${words.toLocaleString()} words`;
}

async function openFile(path) {
  const f = state.files.find((x) => x.path === path);
  if (!f || !state.ws) return;
  if (f.kind !== 'text') return previewAsset(f);
  // Bind the editor to this file's shared text: live cursors, and undo that only undoes your own edits.
  state.binding?.destroy();
  const doc = CodeMirror.Doc('', modeFor(path));
  doc.pwFile = path;
  cm.swapDoc(doc);
  state.file = path;
  state.binding = new state.collab.CodemirrorBinding(state.ws.text(path), cm, state.ws.awareness, { yUndoManager: state.ws.undoManager(path) });
  cm.setOption('readOnly', state.ws.canEdit ? false : true);
  prefs.lastFiles[state.project] = path;
  savePrefs();
  $('#currentFileName').textContent = path;
  renderFiles();
  markErrors();
  updateStats();
  renderCtxChips();
  applyEditorMode();
}

function previewAsset(f) {
  const url = state.ws.fileUrl(f.path);
  if (f.kind === 'image' && !/\.(pdf|eps)$/i.test(f.path)) {
    openModal(
      `<div class="modal-head">${icon('image')}<h2>${esc(f.path)}</h2><button class="icon-btn" data-close>${icon('x')}</button></div>
       <div class="modal-body" style="text-align:center"><img src="${url}" alt="" style="max-width:100%;border-radius:12px" />
       <p class="note">Use it with <code>\\includegraphics[width=\\linewidth]{${esc(f.path)}}</code></p></div>`,
    );
  } else window.open(url, '_blank', 'noopener');
}

function askAboutSelection() {
  state.useSelection = true;
  if (isMobile()) setView('chat');
  else setSideTab('chat');
  renderCtxChips();
  $('#prompt').focus();
}

/* ───────────────────────── projects & files ───────────────────────── */

async function loadProject(name) {
  if (state.ws) {
    state.binding?.destroy();
    state.binding = null;
    state.ws.destroy();
    state.ws = null;
  }
  const grant = isOwner() ? { role: 'owner', ai: true } : state.me.projects.find((p) => p.name === name);
  if (!grant) throw new Error('You don’t have access to that project.');
  Object.assign(state, { project: name, role: grant.role, ai: grant.ai, file: null, files: [], folders: [], fileFilter: '', errors: [], warnings: [], lastResult: null, log: '', people: [] });
  prefs.lastProject = name;
  savePrefs();
  $('#projectName').textContent = name;
  document.title = `${name} · PaperWriter`;
  $('#roleChip').hidden = grant.role !== 'viewer';
  renderPresence();
  loadChat();
  renderChatAccess();
  renderLog();
  clearPdf();
  $('#fileFilter').value = '';
  renderFiles();
  cm.swapDoc(CodeMirror.Doc('', 'stex'));
  cm.setOption('readOnly', 'nocursor');
  setSaveStatus('connecting');

  const ws = new state.collab.Workspace(name, { role: grant.role, me: myIdentity(), api });
  state.ws = ws;
  ws.on('status', renderSyncStatus);
  ws.on('presence', (people) => {
    state.people = people;
    renderPresence();
  });
  ws.files.observe(() => {
    if (state.ws !== ws) return;
    refreshFiles();
    if (state.file && !state.moving && !ws.files.has(state.file)) {
      const next = ws.main();
      if (ws.files.has(next)) openFile(next);
    }
  });
  ws.meta.observe(() => state.ws === ws && refreshFiles());
  ws.folders.observe(() => state.ws === ws && refreshFiles());
  ws.chat.observe(() => state.ws === ws && renderChat());
  await ws.connect();
  if (state.ws !== ws) return;
  renderChat();
  renderSyncStatus();
  refreshFiles();
  const last = prefs.lastFiles[name];
  const target = state.files.some((f) => f.path === last && f.kind === 'text') ? last : state.meta.main;
  if (state.files.some((f) => f.path === target)) await openFile(target);
  const existing = loadPdf(`/api/projects/${P()}/pdf?t=${Date.now()}`, true);
  if (state.status && hasAnyEngine()) compile();
  else if (!(await existing)) showNoEngine();
}

function refreshFiles() {
  if (!state.ws) return;
  state.files = state.ws.fileList();
  state.folders = state.ws.folderList();
  state.meta = { main: state.ws.main() };
  renderFiles();
}

const sortNames = (a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
const parentOf = (p) => (p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '');
const baseName = (p) => p.slice(p.lastIndexOf('/') + 1);

function fileIcon(f) {
  if (f.kind === 'image') return 'image';
  if (/\.bib$/i.test(f.path)) return 'book';
  if (/\.(sty|cls|bst)$/i.test(f.path)) return 'settings';
  if (/\.tex$/i.test(f.path)) return 'file';
  return f.kind === 'text' ? 'code' : 'files';
}

function fmtSize(n) {
  return n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(1)} MB`;
}

/** Collapsed folders are remembered per project, in this browser. */
function collapsedFolders() {
  return new Set(prefs.collapsed?.[state.project] || []);
}

function setCollapsed(folders, on) {
  const set = collapsedFolders();
  for (const f of folders) {
    if (on) set.add(f);
    else set.delete(f);
  }
  prefs.collapsed = { ...prefs.collapsed, [state.project]: [...set] };
  savePrefs();
}

/** Nest the flat file list under its folders. */
function buildTree(files, folders) {
  const root = { path: '', name: '', folders: new Map(), files: [] };
  const nodeFor = (dir) => {
    let node = root;
    if (!dir) return node;
    let path = '';
    for (const seg of dir.split('/')) {
      path = path ? `${path}/${seg}` : seg;
      if (!node.folders.has(seg)) node.folders.set(seg, { path, name: seg, folders: new Map(), files: [] });
      node = node.folders.get(seg);
    }
    return node;
  };
  for (const d of folders) nodeFor(d);
  for (const f of files) nodeFor(parentOf(f.path)).files.push(f);
  return root;
}

const countFiles = (node) => node.files.length + [...node.folders.values()].reduce((n, c) => n + countFiles(c), 0);
const subtreeMatches = (node, q) => node.path.toLowerCase().includes(q) || node.files.some((f) => f.path.toLowerCase().includes(q)) || [...node.folders.values()].some((c) => subtreeMatches(c, q));

/** Flatten the tree into visible rows: folders first, then files, each sorted naturally. */
function treeRows(node, depth, q, collapsed, rows = []) {
  for (const child of [...node.folders.values()].sort((a, b) => sortNames(a.name, b.name))) {
    if (q && !subtreeMatches(child, q)) continue;
    const open = q ? true : !collapsed.has(child.path);
    rows.push({ folder: child, depth, open });
    // A folder whose own name matches shows everything inside it.
    if (open) treeRows(child, depth + 1, q && child.path.toLowerCase().includes(q) ? '' : q, collapsed, rows);
  }
  for (const f of [...node.files].sort((a, b) => sortNames(baseName(a.path), baseName(b.path)))) {
    if (!q || f.path.toLowerCase().includes(q)) rows.push({ file: f, depth });
  }
  return rows;
}

function folderRow({ folder, depth, open }) {
  const edit = canEdit();
  return `<li class="tree-row folder-row" role="treeitem" aria-level="${depth + 1}" aria-expanded="${open}" tabindex="0" data-folder="${esc(folder.path)}" draggable="${edit}" style="--depth:${depth}">
    <span class="twist ${open ? 'open' : ''}">${icon('chevron')}</span>${icon(open ? 'folderOpen' : 'folder')}<span class="name" title="${esc(folder.path)}">${esc(folder.name)}</span>
    <span class="acts" ${edit ? '' : 'hidden'}>
      <button data-fact="newfile" title="New file here">${icon('filePlus')}</button>
      <button data-fact="newfolder" title="New folder here">${icon('folderPlus')}</button>
      <button data-fact="upload" title="Upload here">${icon('upload')}</button>
      <button data-fact="rename" title="Rename or move">${icon('pencil')}</button>
      <button data-fact="delete" title="Delete folder">${icon('trash')}</button>
    </span>
    <span class="size">${countFiles(folder) || ''}</span>
  </li>`;
}

function fileRow({ file: f, depth }) {
  const isMain = f.path === state.meta.main;
  const edit = canEdit();
  return `<li class="tree-row file-item ${f.path === state.file ? 'active' : ''}" role="treeitem" aria-level="${depth + 1}" tabindex="0" data-path="${esc(f.path)}" draggable="${edit}" style="--depth:${depth}">
    <span class="twist"></span>${icon(fileIcon(f))}<span class="name" title="${esc(f.path)}">${esc(baseName(f.path))}</span>
    ${isMain ? `<span class="main-star" title="Main file (compiled)">${icon('star')}</span>` : ''}
    <span class="acts" ${edit ? '' : 'hidden'}>
      ${!isMain && /\.tex$/i.test(f.path) ? `<button data-fact="main" title="Set as main file">${icon('starOutline')}</button>` : ''}
      <button data-fact="rename" title="Rename or move">${icon('pencil')}</button>
      <button data-fact="delete" title="Delete">${icon('trash')}</button>
    </span>
    <span class="size">${fmtSize(f.size)}</span>
  </li>`;
}

function renderFiles() {
  const ul = $('#fileList');
  const focused = document.activeElement?.closest?.('.tree-row');
  const focusKey = focused && ul.contains(focused) ? (focused.dataset.folder ?? focused.dataset.path) : null;
  const q = state.fileFilter.trim().toLowerCase();
  const rows = treeRows(buildTree(state.files, state.folders), 0, q, collapsedFolders());
  ul.innerHTML = rows.length
    ? rows.map((r) => (r.folder ? folderRow(r) : fileRow(r))).join('')
    : `<li class="tree-empty">${q ? 'No files match that filter.' : 'No files yet.'}</li>`;
  if (focusKey != null) [...ul.querySelectorAll('.tree-row')].find((r) => (r.dataset.folder ?? r.dataset.path) === focusKey)?.focus();
  for (const id of ['#newFileBtn', '#newFolderBtn', '#uploadBtn']) $(id).hidden = !canEdit();
}

/** Move or rename a file or folder, keeping it open if it was. */
async function relocate(from, to, folder = false) {
  const ws = state.ws;
  state.moving = true;
  try {
    if (folder) await ws.renameFolder(from, to);
    else await ws.rename(from, to);
    await waitFor(() => (folder ? ws.folders.has(to) : ws.files.has(to)));
    refreshFiles();
    const open = state.file;
    const target = open === from ? to : folder && open?.startsWith(`${from}/`) ? to + open.slice(from.length) : null;
    if (target) {
      await waitFor(() => ws.files.has(target));
      await openFile(target);
    }
  } finally {
    state.moving = false;
  }
  // Moving a file doesn't rewrite \input or \includegraphics paths, so say when one still points at the old place.
  const stem = from.replace(/\.[^./]+$/, '');
  const stale = stem.includes('/') || folder ? stem : null;
  const mentioned = state.ws.fileList().some((f) => f.kind === 'text' && state.ws.text(f.path)?.toString().includes(stale ?? `{${stem}`));
  if (mentioned) toast(`Moved. "${stem}" is still referenced in your LaTeX, so update that path.`, '', 7000);
}

async function moveInto(item, dir) {
  const to = dir ? `${dir}/${baseName(item.path)}` : baseName(item.path);
  if (to === item.path) return;
  if (item.folder && (dir === item.path || dir.startsWith(`${item.path}/`))) return toast('A folder can’t be moved into itself.', 'err');
  if (dir) setCollapsed([dir], false);
  await relocate(item.path, to, item.folder);
}

async function folderAction(folder, act) {
  if (act === 'newfile') return newFile(folder);
  if (act === 'newfolder') return newFolder(folder);
  if (act === 'upload') return uploadFiles(await pickFiles(), folder);
  if (act === 'rename') {
    const to = await askText('Rename or move folder', { value: folder, okLabel: 'Save' });
    if (to && to !== folder) await relocate(folder, to.replace(/\/+$/, ''), true);
  } else if (act === 'delete') {
    const n = state.files.filter((f) => f.path.startsWith(`${folder}/`)).length;
    if (!(await confirmBox('Delete folder?', `"${folder}"${n ? ` and the ${n} file${n > 1 ? 's' : ''} inside it` : ''} will be removed for everyone.`))) return;
    await state.ws.removeFolder(folder);
  } else {
    setCollapsed([folder], !collapsedFolders().has(folder));
    renderFiles();
  }
}

$('#fileList').addEventListener('click', async (e) => {
  const row = e.target.closest('.tree-row');
  if (!row) return;
  const act = e.target.closest('[data-fact]')?.dataset.fact;
  try {
    if (row.dataset.folder !== undefined) return await folderAction(row.dataset.folder, act);
    const path = row.dataset.path;
    if (act === 'main') {
      await state.ws.setMain(path);
      await waitFor(() => state.ws.main() === path);
      toast(`${path} is now the main file`, 'ok');
      compile();
    } else if (act === 'rename') {
      const to = await askText('Rename or move file', { value: path, okLabel: 'Save' });
      if (to && to !== path) await relocate(path, to);
    } else if (act === 'delete') {
      if (!(await confirmBox('Delete file?', `"${path}" will be removed from this project for everyone.`))) return;
      await state.ws.remove(path);
    } else {
      await openFile(path);
      if (isMobile() && state.files.find((f) => f.path === path)?.kind === 'text') setView('editor');
    }
  } catch (err) {
    toast(err.message, 'err');
  }
});

// Keyboard: arrows move and open/close folders, Enter activates.
$('#fileList').addEventListener('keydown', (e) => {
  const row = e.target.closest('.tree-row');
  if (!row || e.target !== row) return;
  const rows = $$('.tree-row', $('#fileList'));
  const i = rows.indexOf(row);
  const folder = row.dataset.folder;
  if (e.key === 'ArrowDown') rows[i + 1]?.focus();
  else if (e.key === 'ArrowUp') rows[i - 1]?.focus();
  else if (e.key === 'Enter' || e.key === ' ') row.click();
  else if (e.key === 'ArrowRight' && folder !== undefined && collapsedFolders().has(folder)) row.click();
  else if (e.key === 'ArrowLeft' && folder !== undefined && !collapsedFolders().has(folder)) row.click();
  else return;
  e.preventDefault();
});

/* Drag a row onto a folder to move it, or onto empty space to move it to the top level. */
const dropDir = (target) => {
  const row = target.closest?.('.tree-row');
  if (!row) return '';
  return row.dataset.folder ?? parentOf(row.dataset.path);
};
function markDrop(dir) {
  const ul = $('#fileList');
  for (const r of $$('.drop-target', ul)) r.classList.remove('drop-target');
  ul.classList.toggle('drop-root', dir === '');
  if (dir) [...ul.querySelectorAll('.folder-row')].find((r) => r.dataset.folder === dir)?.classList.add('drop-target');
}
const clearDrop = () => {
  markDrop(null);
  $$('.dragging', $('#fileList')).forEach((r) => r.classList.remove('dragging'));
};
$('#fileList').addEventListener('dragstart', (e) => {
  const row = e.target.closest?.('.tree-row');
  if (!row || !canEdit()) return e.preventDefault();
  state.drag = row.dataset.folder !== undefined ? { path: row.dataset.folder, folder: true } : { path: row.dataset.path, folder: false };
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', state.drag.path);
  row.classList.add('dragging');
});
$('#fileList').addEventListener('dragover', (e) => {
  if (!state.drag) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  markDrop(dropDir(e.target));
});
$('#fileList').addEventListener('dragleave', (e) => {
  if (state.drag && !$('#fileList').contains(e.relatedTarget)) markDrop(null);
});
$('#fileList').addEventListener('drop', (e) => {
  const item = state.drag;
  if (!item) return;
  e.preventDefault();
  e.stopPropagation();
  state.drag = null;
  clearDrop();
  moveInto(item, dropDir(e.target)).catch((err) => toast(err.message, 'err'));
});
$('#fileList').addEventListener('dragend', () => {
  state.drag = null;
  clearDrop();
});

const pickFiles = () =>
  new Promise((resolve) => {
    const input = Object.assign(document.createElement('input'), { type: 'file', multiple: true });
    input.onchange = () => resolve([...input.files]);
    input.click();
  });

async function newFile(dir = '') {
  const name = await askText(dir ? `New file in ${dir}/` : 'New file', { placeholder: 'e.g. intro.tex, refs.bib or sections/intro.tex', okLabel: 'Create' });
  if (!name) return;
  const path = dir ? `${dir}/${name}` : name;
  try {
    await state.ws.createText(path, path.endsWith('.tex') ? `% ${path}\n` : '');
    await waitFor(() => state.ws.files.has(path));
    if (dir) setCollapsed([dir], false);
    refreshFiles();
    await openFile(path);
    if (isMobile()) setView('editor');
  } catch (e) {
    toast(e.message, 'err');
  }
}

async function newFolder(dir = '') {
  const name = await askText(dir ? `New folder in ${dir}/` : 'New folder', { placeholder: 'e.g. figures or sections', okLabel: 'Create' });
  if (!name) return;
  const path = dir ? `${dir}/${name}` : name;
  try {
    await state.ws.createFolder(path);
    await waitFor(() => state.ws.folders.has(path.replace(/\/+$/, '')));
    if (dir) setCollapsed([dir], false);
    refreshFiles();
  } catch (e) {
    toast(e.message, 'err');
  }
}

async function uploadFiles(list, dir = '') {
  if (!canEdit()) return toast('This link only allows viewing.', 'err');
  if (dir) setCollapsed([dir], false);
  for (const f of list) {
    try {
      await state.ws.upload(dir ? `${dir}/${f.name}` : f.name, f);
      toast(`Uploaded ${f.name}`, 'ok');
    } catch (e) {
      toast(`${f.name}: ${e.message}`, 'err');
    }
  }
}

/** Download the whole project as a .zip that other platforms (and Import project) can open. */
async function exportProject() {
  const name = state.project;
  if (!name) return;
  const res = await fetch(`/api/projects/${P()}/export`);
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || res.statusText);
  const url = URL.createObjectURL(await res.blob());
  const a = Object.assign(document.createElement('a'), { href: url, download: `${name}.zip` });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
  toast(`Exported ${name}.zip`, 'ok');
}

async function openProjectMenu() {
  const guest = !isOwner();
  const projects = guest ? state.me.projects : (await api('/api/projects')).projects;
  const roleText = { editor: 'Can edit', viewer: 'Can view' };
  const pop = openPopover(
    $('#projectBtn'),
    `<div class="pop-title">${guest ? 'Shared with you' : 'Projects'}</div>
     ${projects
       .map(
         (p) => `<button class="pop-item ${p.name === state.project ? 'active' : ''}" data-proj="${esc(p.name)}">
           ${icon(guest ? 'users' : 'folder')}<span class="grow"><span>${esc(p.name)}</span><span class="sub">${guest ? roleText[p.role] : new Date(p.modified).toLocaleDateString()}</span></span>
           ${p.name === state.project ? `<span class="check">${icon('check')}</span>` : ''}</button>`,
       )
       .join('')}
     <div class="pop-sep"></div>
     <button class="pop-item" data-pact="export">${icon('download')}<span class="grow"><span>Export project as .zip</span><span class="sub">For backup, or to move to another platform</span></span></button>
     ${
       guest
         ? ''
         : `<button class="pop-item" data-pact="new">${icon('plus')}<span class="grow">New project…</span></button>
     <button class="pop-item" data-pact="import">${icon('upload')}<span class="grow"><span>Import project…</span><span class="sub">Overleaf, Prism, arXiv… (.zip, .tar.gz, .tex)</span></span></button>
     <button class="pop-item btn-danger" data-pact="delete">${icon('trash')}<span class="grow">Delete “${esc(state.project)}”…</span></button>`
     }`,
  );
  pop.onclick = async (e) => {
    const item = e.target.closest('[data-proj],[data-pact]');
    if (!item) return;
    closePopover();
    try {
      if (item.dataset.proj && item.dataset.proj !== state.project) await loadProject(item.dataset.proj);
      else if (item.dataset.pact === 'new') {
        const r = await askText('New project', {
          placeholder: 'My amazing paper',
          okLabel: 'Create',
          extra: `<p class="note">Start from</p><select class="input" name="template"><option value="article">Article</option><option value="blank">Blank</option><option value="welcome">Welcome tour</option></select>`,
        });
        if (!r?.value) return;
        const { name } = await api('/api/projects', { method: 'POST', body: { name: r.value, template: r.template } });
        await loadProject(name);
        toast('Project created', 'ok');
      } else if (item.dataset.pact === 'import') {
        await importProjectFlow();
      } else if (item.dataset.pact === 'export') {
        await exportProject();
      } else if (item.dataset.pact === 'delete') {
        if (!(await confirmBox('Delete project?', `"${state.project}" and all its files will be permanently deleted. Its share links stop working.`))) return;
        await api(`/api/projects/${P()}`, { method: 'DELETE' });
        localStorage.removeItem(`pw.chat.${state.project}`);
        state.project = null;
        const { projects: rest } = await api('/api/projects');
        if (rest.length) await loadProject(rest[0].name);
        else {
          await api('/api/projects', { method: 'POST', body: { name: 'Welcome', template: 'welcome' } });
          await loadProject('Welcome');
        }
      }
    } catch (err) {
      toast(err.message, 'err');
    }
  };
}

const pickFile = (accept) =>
  new Promise((resolve) => {
    const input = Object.assign(document.createElement('input'), { type: 'file', accept });
    input.onchange = () => resolve(input.files[0] || null);
    input.click();
  });

/** Import an export from Overleaf, Prism, Authorea, arXiv, … as a new project. */
async function importProjectFlow(file) {
  file ??= await pickFile('.zip,.tar,.tgz,.gz,.tex,application/zip,application/gzip');
  if (!file) return;
  const suggested = file.name.replace(/\.(zip|tar\.gz|tgz|tar|gz|tex)$/i, '').replace(/[_-]+/g, ' ').trim() || 'Imported project';
  const name = await askText('Import project', { value: suggested, placeholder: 'Project name', okLabel: 'Import' });
  if (!name) return;
  toast(`Importing ${file.name}…`, '', 2500);
  const r = await api(`/api/projects/import?name=${enc(name)}&filename=${enc(file.name)}`, {
    method: 'POST',
    body: await file.arrayBuffer(),
    headers: { 'content-type': 'application/octet-stream' },
  });
  await loadProject(r.name);
  const extras = [r.images ? `${r.images} image${r.images > 1 ? 's' : ''}` : '', r.skipped ? `${r.skipped} build file${r.skipped > 1 ? 's' : ''} skipped` : ''].filter(Boolean).join(', ');
  toast(`Imported ${r.files} files${extras ? ` (${extras})` : ''}. Main file: ${r.main || 'none found'}`, 'ok', 6000);
  if (!r.main) toast('No file with \\documentclass was found. Pick the main file with ☆ in the Files tab.', 'err', 8000);
}

/* ───────────────────────── compile ───────────────────────── */

function hasAnyEngine() {
  if (!isOwner()) return true; // the owner's server decides
  const e = state.status?.engines || {};
  return ['tectonic', 'latexmk', 'pdflatex', 'xelatex', 'lualatex'].some((k) => e[k]) || state.status?.settings.allowOnline;
}

function scheduleCompile(delay = 400) {
  clearTimeout(compileTimer);
  compileTimer = setTimeout(compile, delay);
}

async function saveAndCompile() {
  try {
    await saveAll();
  } catch {
    return;
  }
  compile();
}

let slowTimer = 0;
function setCompiling(on) {
  const btn = $('#compileBtn');
  btn.classList.toggle('busy', on);
  btn.innerHTML = on ? `${icon('refresh')}<span>Compiling</span>` : `${icon('play')}<span>Compile</span>`;
  $('#pdfBusy').hidden = !on;
  $('#busyText').textContent = 'Compiling…';
  clearTimeout(slowTimer);
  if (on) slowTimer = setTimeout(() => ($('#busyText').textContent = 'Still working — first runs fetch LaTeX packages ☕'), 7000);
}

async function compile() {
  if (!state.project) return;
  if (state.compiling) {
    state.compileQueued = true;
    return;
  }
  clearTimeout(compileTimer);
  state.compiling = true;
  setCompiling(true);
  try {
    await saveAll();
    const r = await api(`/api/projects/${P()}/compile`, { method: 'POST', body: {} });
    state.lastResult = r;
    state.errors = r.errors || [];
    state.warnings = r.warnings || [];
    state.log = r.log || '';
    renderLog();
    markErrors();
    renderCtxChips();
    if (r.needsEngine) showNoEngine();
    else if (r.pdf) await loadPdf(r.pdf);
    if (state.errors.length && !$('#logDrawer').classList.contains('open')) toggleLog(true);
  } catch (e) {
    toast(`Compile failed: ${e.message}`, 'err');
  } finally {
    state.compiling = false;
    setCompiling(false);
    if (state.compileQueued) {
      state.compileQueued = false;
      compile();
    }
  }
}

function renderLog() {
  const r = state.lastResult;
  const st = $('#logState');
  let cls = '';
  let ic = 'info';
  let text = 'Not compiled yet';
  if (r?.needsEngine) {
    cls = 'warn';
    ic = 'alert';
    text = 'No LaTeX engine — set one up';
  } else if (r && state.errors.length) {
    cls = 'err';
    ic = 'alert';
    text = `${state.errors.length} error${state.errors.length > 1 ? 's' : ''}${r.pdf ? ' · showing last good PDF' : ''}`;
  } else if (r?.ok) {
    cls = 'ok';
    ic = 'ok';
    text = `Compiled in ${(r.durationMs / 1000).toFixed(1)}s · ${r.engine}${state.warnings.length ? ` · ${state.warnings.length} warning${state.warnings.length > 1 ? 's' : ''}` : ''}`;
  } else if (r) {
    cls = 'err';
    ic = 'alert';
    text = 'Compile failed — see raw log';
  }
  st.className = `log-state ${cls}`;
  st.innerHTML = `${icon(ic)}<span>${esc(text)}</span>`;
  $('#engineLabel').textContent = r?.engine || state.status?.settings.engine || 'auto';

  const items = [
    ...state.errors.map((e) => ({ ...e, level: 'err' })),
    ...state.warnings.map((e) => ({ ...e, level: 'warn' })),
  ];
  $('#issueList').innerHTML = items.length
    ? items
        .map(
          (e) => `<li class="issue ${e.level}" data-file="${esc(e.file || '')}" data-line="${e.line ?? ''}">
            <span class="badge">${esc((e.file || '').replace(/^\.\//, ''))}${e.line ? `:${e.line}` : ''}</span><span class="text">${esc(e.message)}</span></li>`,
        )
        .join('')
    : `<li class="issue-empty">${r?.ok ? 'All clear — no issues ✨' : r ? 'No parsed issues. Check the raw log.' : 'Compile to see issues here.'}</li>`;
  $('#rawLog').textContent = state.log || '(empty)';
  $('#fixErrorsBtn').hidden = !state.errors.length && !(r && !r.ok && !r.needsEngine);
}

function toggleLog(force) {
  $('#logDrawer').classList.toggle('open', force);
}

function normPath(p) {
  return (p || '').replace(/\\/g, '/').replace(/^\.\//, '');
}

function markErrors() {
  cm.clearGutter('pw-errors');
  for (const h of state.errorLines) cm.removeLineClass(h, 'background', 'line-error');
  state.errorLines = [];
  if (!state.file) return;
  const mine = (e) => e.line && (normPath(e.file) === state.file || (!e.file && state.file === state.meta.main));
  const add = (e, warn) => {
    const ln = Math.min(e.line - 1, cm.lastLine());
    const el = document.createElement('div');
    el.className = `err-marker ${warn ? 'warn' : ''}`;
    el.title = e.message;
    cm.setGutterMarker(ln, 'pw-errors', el);
    if (!warn) state.errorLines.push(cm.addLineClass(ln, 'background', 'line-error'));
  };
  state.warnings.filter(mine).forEach((e) => add(e, true));
  state.errors.filter(mine).forEach((e) => add(e, false));
}

async function jumpTo(file, line) {
  file = normPath(file) || state.meta.main;
  if (file !== state.file && state.files.some((f) => f.path === file)) await openFile(file);
  if (isMobile()) setView('editor');
  if (line) {
    const ln = Math.min(Number(line) - 1, cm.lastLine());
    cm.setCursor(ln, 0);
    cm.scrollIntoView({ line: ln, ch: 0 }, 120);
  }
  cm.focus();
}

function showNoEngine() {
  const empty = $('#pdfEmpty');
  if (state.pdfDoc) return;
  empty.hidden = false;
  if (!isOwner()) {
    empty.innerHTML = `<img src="/logo.svg" alt="" width="72" height="72" class="bob" /><h3>No PDF yet</h3><p>The host hasn’t set up a LaTeX engine yet.</p>`;
    return;
  }
  empty.innerHTML = `
    <img src="/logo.svg" alt="" width="72" height="72" class="bob" />
    <h3>Let's set up a LaTeX engine</h3>
    <p>No TeX installation was found on this computer.</p>
    <div class="actions">
      <button class="btn-primary" data-eng="tectonic">${icon('download')}Install Tectonic (one click)</button>
      <button class="btn-ghost" data-eng="online">Use online compiler (texlive.net)</button>
      <button class="chip-btn" data-eng="settings">${icon('settings')}More options</button>
    </div>
    <p class="note" style="max-width:340px;margin:12px auto 0">Tectonic is a small, self-contained TeX engine that downloads packages on demand. The online option sends your text files to texlive.net.</p>`;
  hydrateIcons(empty);
}

async function installTectonic(btn) {
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner"></span>Downloading Tectonic…`;
  }
  toast('Downloading Tectonic from GitHub…', '', 4000);
  try {
    const r = await api('/api/tectonic/install', { method: 'POST' });
    toast(`Tectonic ${r.version.replace(/^tectonic@/, '')} installed 🎉`, 'ok');
    await refreshStatus();
    resetPdfEmpty();
    compile();
  } catch (e) {
    toast(`Install failed: ${e.message}`, 'err', 6000);
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `${icon('download')}Try again`;
    }
  }
}

async function enableOnline() {
  await api('/api/settings', { method: 'POST', body: { allowOnline: true, engine: 'online' } });
  await refreshStatus();
  resetPdfEmpty();
  compile();
}

$('#pdfEmpty').addEventListener('click', (e) => {
  const b = e.target.closest('[data-eng]');
  if (!b) return;
  if (b.dataset.eng === 'tectonic') installTectonic(b);
  else if (b.dataset.eng === 'online') enableOnline();
  else openSettings('compiler');
});

function resetPdfEmpty() {
  $('#pdfEmpty').innerHTML = `<img src="/logo.svg" alt="" width="72" height="72" class="bob" /><h3>No PDF yet</h3><p>Press <kbd>Ctrl</kbd> + <kbd>S</kbd> to compile your paper.</p>`;
  $('#pdfEmpty').hidden = !!state.pdfDoc;
}

function openCompileMenu() {
  const s = state.status?.settings || {};
  const eng = state.status?.engines || {};
  const opts = [
    ['auto', 'Automatic', 'Best available engine'],
    ['tectonic', 'Tectonic', eng.tectonic ? 'Installed' : 'Not installed'],
    ['latexmk', 'latexmk', eng.latexmk ? 'Installed' : 'Not found'],
    ['pdflatex', 'pdfLaTeX', eng.pdflatex ? 'Installed' : 'Not found'],
    ['xelatex', 'XeLaTeX', eng.xelatex ? 'Installed' : 'Not found'],
    ['lualatex', 'LuaLaTeX', eng.lualatex ? 'Installed' : 'Not found'],
    ['online', 'Online (texlive.net)', s.allowOnline ? 'Enabled' : 'Disabled in settings'],
  ];
  const pop = openPopover(
    $('#compileMenuBtn'),
    `<div class="pop-title">Engine</div>
     ${opts
       .map(
         ([id, label, sub]) => `<button class="pop-item ${s.engine === id ? 'active' : ''} ${id !== 'auto' && !(id === 'online' ? s.allowOnline : eng[id]) ? 'disabled' : ''}" data-engine="${id}">
           <span class="grow"><span>${label}</span><span class="sub">${sub}</span></span>${s.engine === id ? `<span class="check">${icon('check')}</span>` : ''}</button>`,
       )
       .join('')}
     <div class="pop-sep"></div>
     <div class="pop-item"><label class="toggle"><input type="checkbox" id="autoCompileToggle" ${prefs.autoCompile ? 'checked' : ''}/><span class="track"></span><span>Compile automatically while typing</span></label></div>
     <button class="pop-item" data-engine-settings>${icon('settings')}<span class="grow">Compiler settings…</span></button>`,
  );
  const r = $('#compileMenuBtn').getBoundingClientRect();
  pop.style.left = `${Math.max(10, r.right - pop.offsetWidth)}px`;
  $('#autoCompileToggle', pop).onchange = (e) => {
    prefs.autoCompile = e.target.checked;
    savePrefs();
  };
  pop.onclick = async (e) => {
    if (e.target.closest('[data-engine-settings]')) {
      closePopover();
      return openSettings('compiler');
    }
    const b = e.target.closest('[data-engine]');
    if (!b) return;
    closePopover();
    await api('/api/settings', { method: 'POST', body: { engine: b.dataset.engine } });
    await refreshStatus();
    compile();
  };
}

/* ───────────────────────── pdf viewer ───────────────────────── */

let renderToken = 0;

function clearPdf() {
  closePdfDoc(state.pdfDoc);
  state.pdfDoc = null;
  $('#pdfPages').innerHTML = '';
  $('#pageInd').textContent = '–';
  resetPdfEmpty();
}

/** pdf.js 6 frees a document through the task that loaded it. */
const closePdfDoc = (doc) => doc?.loadingTask?.destroy();

let pdfLoadSeq = 0;

async function loadPdf(url, quiet = false) {
  const seq = ++pdfLoadSeq;
  let doc;
  try {
    doc = await pdfjs.getDocument({ url, isEvalSupported: false }).promise;
  } catch (e) {
    if (!quiet && seq === pdfLoadSeq) toast(`Couldn't open PDF: ${e.message}`, 'err');
    return false;
  }
  // A newer load (e.g. a fresh compile) started meanwhile — drop this stale one.
  if (seq !== pdfLoadSeq) {
    closePdfDoc(doc);
    return true;
  }
  const old = state.pdfDoc;
  state.pdfDoc = doc;
  state.pdfUrl = url;
  const dl = $('#downloadBtn');
  dl.href = url;
  dl.download = `${state.project}.pdf`;
  $('#pdfEmpty').hidden = true;
  await renderPdf();
  if (old && old !== doc) closePdfDoc(old);
  return true;
}

async function renderPdf() {
  const doc = state.pdfDoc;
  if (!doc) return;
  const token = ++renderToken;
  const scroller = $('#pdfScroll');
  const ratio = scroller.scrollHeight > scroller.clientHeight ? scroller.scrollTop / scroller.scrollHeight : 0;
  const first = await doc.getPage(1);
  const base = first.getViewport({ scale: 1 });
  const avail = Math.max(200, scroller.clientWidth - 34);
  const scale = prefs.zoom === 'fit' ? avail / base.width : prefs.zoom;
  state.pdfScale = scale;
  $('#zoomFitBtn').textContent = prefs.zoom === 'fit' ? 'Fit' : `${Math.round(scale * 100)}%`;
  const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  const wrap = document.createElement('div');
  wrap.className = 'pdf-pages';
  wrap.id = 'pdfPages';
  for (let i = 1; i <= doc.numPages; i++) {
    const page = i === 1 ? first : await doc.getPage(i);
    if (token !== renderToken) return;
    const vp = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.floor(vp.width * dpr);
    canvas.height = Math.floor(vp.height * dpr);
    canvas.style.width = `${Math.floor(vp.width)}px`;
    canvas.style.height = `${Math.floor(vp.height)}px`;
    const pageEl = document.createElement('div');
    pageEl.className = 'pdf-page';
    pageEl.dataset.page = i;
    pageEl.append(canvas);
    wrap.append(pageEl);
    await page.render({ canvas, viewport: vp, transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined }).promise;
    if (token !== renderToken) return;
  }
  $('#pdfPages').replaceWith(wrap);
  scroller.scrollTop = ratio * scroller.scrollHeight;
  updatePageInd();
}

function updatePageInd() {
  const scroller = $('#pdfScroll');
  const pages = $$('.pdf-page', scroller);
  if (!pages.length) return;
  const mid = scroller.scrollTop + scroller.clientHeight / 3;
  let cur = 1;
  for (const p of pages) if (p.offsetTop <= mid) cur = Number(p.dataset.page);
  $('#pageInd').textContent = `Page ${cur} / ${pages.length}`;
}

function zoom(dir) {
  const cur = state.pdfScale || 1;
  prefs.zoom = dir === 'fit' ? 'fit' : Math.min(4, Math.max(0.3, +(cur * (dir > 0 ? 1.15 : 1 / 1.15)).toFixed(3)));
  savePrefs();
  renderPdf();
}

$('#pdfScroll').addEventListener('scroll', updatePageInd, { passive: true });

const measure = document.createElement('canvas').getContext('2d');

/** The word at a point on a PDF page, with its neighbours (they tell repeated words apart). */
async function wordAt(pageNum, x, y) {
  const page = await state.pdfDoc.getPage(pageNum);
  const fromBottom = page.getViewport({ scale: 1 }).height - y;
  const { items } = await page.getTextContent();
  const it = items.find((i) => {
    const [, , , , left, base] = i.transform;
    const size = i.height || 10;
    return i.str.trim() && x >= left - 1 && x <= left + i.width + 1 && fromBottom >= base - size * 0.35 && fromBottom <= base + size;
  });
  if (!it) return null;
  const str = it.str.normalize('NFKC'); // ligatures like "ﬁ" back to plain letters
  // Character widths vary, so estimate the clicked character from measured text rather than a simple ratio.
  measure.font = '100px serif';
  const target = ((x - it.transform[4]) / (it.width || 1)) * measure.measureText(str).width;
  let at = 0;
  while (at < str.length && measure.measureText(str.slice(0, at + 1)).width < target) at++;
  const words = [...str.matchAll(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu)];
  if (!words.length) return null;
  const k = words.findIndex((m) => at < m.index + m[0].length);
  const i = k < 0 ? words.length - 1 : k;
  return { word: words[i][0].replace(/-$/, ''), before: words[i - 1]?.[0], after: words[i + 1]?.[0] };
}

/** Find a PDF word in the source, near the line SyncTeX gave. Longer phrases first, closest line first. */
function findInSource(line, { word, before, after }) {
  const near = (range) => [0, ...Array.from({ length: range }, (_, i) => [-(i + 1), i + 1]).flat()].map((d) => line + d);
  const search = (needle, offset, range) => {
    const re = new RegExp(`(?<![\\p{L}\\p{N}])${needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}\\p{N}])`, 'u');
    for (const l of near(range)) {
      const m = l >= 0 && l <= cm.lastLine() ? re.exec(cm.getLine(l)) : null;
      if (m) return { line: l, ch: m.index + offset };
    }
    return null;
  };
  return (
    (before && after && search(`${before} ${word} ${after}`, before.length + 1, 15)) ||
    (after && search(`${word} ${after}`, 0, 15)) ||
    (before && search(`${before} ${word}`, before.length + 1, 15)) ||
    search(word, 0, 8)
  );
}

// Click text in the PDF to jump to it in the source: SyncTeX gives the line, the word gives the exact spot.
$('#pdfScroll').addEventListener('click', async (e) => {
  const pageEl = e.target.closest('.pdf-page');
  if (!pageEl || !state.project || getSelection().toString()) return;
  const rect = pageEl.getBoundingClientRect();
  const x = (e.clientX - rect.left) / state.pdfScale;
  const y = (e.clientY - rect.top) / state.pdfScale;
  try {
    const r = await api(`/api/projects/${P()}/synctex?page=${pageEl.dataset.page}&x=${x.toFixed(2)}&y=${y.toFixed(2)}`);
    if (!r.found) return toast('Couldn’t find that spot in the source. Try recompiling.', '', 2500);
    if (prefs.editorMode === 'visual') setEditorMode('code');
    await jumpTo(r.file, r.line);
    const ln = Math.min(r.line - 1, cm.lastLine());
    const clicked = await wordAt(Number(pageEl.dataset.page), x, y).catch(() => null);
    const spot = clicked && findInSource(ln, clicked);
    if (spot) {
      // A cursor, not a selection: typing right after a click shouldn't replace the word.
      cm.setCursor(spot);
      cm.scrollIntoView(spot, 120);
      const mark = cm.markText(spot, { line: spot.line, ch: spot.ch + clicked.word.length }, { className: 'sync-word' });
      setTimeout(() => mark.clear(), 2200);
    } else {
      const h = cm.addLineClass(ln, 'background', 'sync-flash');
      setTimeout(() => cm.removeLineClass(h, 'background', 'sync-flash'), 1600);
    }
  } catch (err) {
    toast(err.message, 'err');
  }
});
$('#pdfScroll').addEventListener(
  'wheel',
  (e) => {
    if (!e.ctrlKey || !state.pdfDoc) return;
    e.preventDefault();
    zoom(e.deltaY < 0 ? 1 : -1);
  },
  { passive: false },
);
let resizeTimer = 0;
new ResizeObserver(() => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => prefs.zoom === 'fit' && renderPdf(), 150);
}).observe($('#pdfScroll'));

/* ───────────────────────── AI providers & model picker ───────────────────────── */

async function refreshStatus() {
  state.status = await api('/api/status');
  renderModelPill();
  renderLog();
}

function providerInfo(id) {
  const via = viaOf(id);
  const base = baseId(id);
  if (via === 'own') {
    const d = DIRECT[base];
    if (!d || !ownAllowed()) return null;
    const has = !!ownKeys()[base];
    return { id, label: d.label, available: has, own: true, detail: has ? `Your key · sent from this browser straight to ${d.label}` : `Add your ${d.label} key to use it` };
  }
  if (via === 'pc') {
    const p = state.bridgeStatus?.providers?.[base];
    return p && ownAllowed() ? { id, label: p.label, available: true, pc: true, detail: `On your computer · ${p.detail || ''}` } : null;
  }
  return state.status?.providers?.[id];
}

async function ensureModelChoice() {
  const provs = state.status?.providers || {};
  if (prefs.provider && providerInfo(prefs.provider) && prefs.model) return;
  let pick = PROVIDER_ORDER.find((p) => provs[p]?.available);
  if (!pick && state.bridgeStatus) pick = PROVIDER_ORDER.map((p) => PC + p).find((p) => providerInfo(p));
  if (!pick && ownAllowed()) {
    const keys = ownKeys();
    pick = OWN + (Object.keys(DIRECT).find((p) => keys[p]) || 'anthropic');
  }
  pick ||= 'claude-cli';
  prefs.provider = pick;
  prefs.model = PREFERRED_MODEL[baseId(pick)] || null;
  if (!prefs.model) {
    try {
      const models = await getModels(pick);
      prefs.model = models[0]?.id || null;
    } catch {}
  }
  savePrefs();
  renderModelPill();
}

async function getModels(provider, force = false) {
  if (!force && state.modelCache[provider]) return state.modelCache[provider];
  let models;
  const via = viaOf(provider);
  if (via === 'own') {
    const key = ownKeys()[baseId(provider)];
    if (!key) throw new Error('Add your key above to see its models.');
    models = await directModels(baseId(provider), key);
  } else if (via === 'pc') {
    if (!state.bridge) throw new Error('Connect your computer first.');
    models = await state.bridge.models(baseId(provider));
  } else ({ models } = await api(`/api/models?provider=${enc(provider)}`));
  state.modelCache[provider] = models;
  return models;
}

function renderModelPill() {
  const info = providerInfo(prefs.provider);
  $('#providerLabel').textContent = info?.label || 'Choose a model';
  $('#modelLabel').textContent = prefs.model ? prefs.model : 'No model selected';
  const dot = $('#modelDot');
  dot.className = `dot ${info ? (info.available ? 'on' : 'off') : ''}`;
  dot.title = info?.detail || '';
}

function openModelPicker(selected = prefs.provider) {
  const provs = state.status?.providers || {};
  const hostTitle = (t) => (isOwner() ? t : `Shared by the host · ${t}`);
  const groups = [
    [hostTitle('Logged-in CLI'), ['claude-cli', 'gemini-cli', 'codex-cli']],
    [hostTitle('Cloud API'), ['anthropic', 'openai', 'gemini', 'openrouter']],
    [hostTitle('Local machine'), ['ollama', 'compat']],
    ...(ownAllowed() && state.bridgeStatus ? [['Your computer', Object.keys(state.bridgeStatus.providers || {}).map((p) => PC + p)]] : []),
    ...(ownAllowed() ? [['Your keys · straight from this browser', Object.keys(DIRECT).map((p) => OWN + p)]] : []),
  ];
  const shown = (id) => {
    const p = providerInfo(id);
    if (!p) return false;
    if (p.own || p.pc) return true;
    if (!isOwner()) return p.available && state.ai;
    return p.available || !id.endsWith('-cli') || id === 'claude-cli';
  };
  const info = providerInfo(selected);
  const action = !info ? '' : info.own ? ` · <a data-own-key="${esc(baseId(selected))}">${info.available ? 'Change key' : 'Add key'}</a>` : !info.available && isOwner() ? ` · <a data-open-settings>Set up</a>` : '';
  const pcRow = ownAllowed()
    ? `<button class="pop-item pc-row" data-connect-pc>${icon('terminal')}<span class="grow"><span>${state.bridgeStatus ? 'Your computer is connected' : 'Use AI from your computer'}</span><span class="sub">Claude Code, Ollama or your saved keys, via your own PaperWriter</span></span></button>`
    : '';
  const html = `
    ${groups
      .map(([title, ids]) => [title, ids.filter(shown)])
      .filter(([, ids]) => ids.length)
      .map(
        ([title, ids]) => `<div class="pop-title">${title}</div><div class="provider-grid">
        ${ids
          .map((id) => {
            const p = providerInfo(id);
            return `<button class="prov ${id === selected ? 'active' : ''}" data-prov="${id}" title="${esc(p.detail)}"><span class="dot ${p.available ? 'on' : 'off'}"></span><span>${esc(p.label)}</span></button>`;
          })
          .join('')}</div>`,
      )
      .join('')}
    ${pcRow}
    <div class="pop-sep"></div>
    <div class="prov-detail">${esc(info?.detail || 'Pick where your co-author runs.')}${action}</div>
    <div class="pop-title">Model</div>
    <div class="model-list" id="modelList"><div class="pop-item"><span class="spinner"></span><span class="grow">Loading models…</span></div></div>
    <div class="pop-row"><input class="input" id="customModel" placeholder="Custom model id…" value="" /><button class="chip-btn accent" id="useCustom">Use</button></div>`;
  const pop = openPopover($('#modelBtn'), html, 'model-pop');
  pop.onclick = (e) => {
    const prov = e.target.closest('[data-prov]');
    if (prov) return openModelPicker(prov.dataset.prov);
    if (e.target.closest('[data-open-settings]')) {
      closePopover();
      return openSettings('ai');
    }
    const own = e.target.closest('[data-own-key]');
    if (own) {
      closePopover();
      return askOwnKey(own.dataset.ownKey).then((ok) => ok && openModelPicker(OWN + own.dataset.ownKey));
    }
    if (e.target.closest('[data-connect-pc]')) {
      closePopover();
      return openBridgeDialog();
    }
    const m = e.target.closest('[data-model]');
    if (m) chooseModel(selected, m.dataset.model);
    if (e.target.closest('#useCustom')) {
      const v = $('#customModel', pop).value.trim();
      if (v) chooseModel(selected, v);
    }
  };
  $('#customModel', pop).onkeydown = (e) => {
    if (e.key === 'Enter' && e.target.value.trim()) chooseModel(selected, e.target.value.trim());
  };
  getModels(selected)
    .then((models) => {
      if ($('#popover').hidden) return;
      $('#modelList').innerHTML = models.length
        ? models
            .map(
              (m) => `<button class="pop-item ${selected === prefs.provider && m.id === prefs.model ? 'active' : ''}" data-model="${esc(m.id)}">
            <span class="grow"><span>${esc(m.label)}</span>${m.label !== m.id ? `<span class="sub">${esc(m.id)}</span>` : ''}</span>
            ${selected === prefs.provider && m.id === prefs.model ? `<span class="check">${icon('check')}</span>` : ''}</button>`,
            )
            .join('')
        : `<div class="prov-detail">No models found. ${selected === 'ollama' ? 'Pull one with <code>ollama pull qwen2.5</code>.' : 'Type a model id below.'}</div>`;
      hydrateIcons($('#modelList'));
      positionPopover();
    })
    .catch((e) => {
      $('#modelList').innerHTML = `<div class="prov-detail">${esc(e.message)}</div>`;
    });
}

/** Asks a collaborator for their own API key. It's saved in this browser only. */
async function askOwnKey(id) {
  const d = DIRECT[id];
  const key = await askText(`Your ${d?.label || id} key`, {
    type: 'password',
    placeholder: d?.placeholder || 'Paste your API key',
    okLabel: 'Save key',
    note: `Get one at <a href="${d?.keyUrl}" target="_blank" rel="noopener">${(d?.keyUrl || '').replace(/^https:\/\//, '')}</a>. It’s saved in this browser and sent straight to ${esc(d?.label || id)} with your own chats. The host’s server never sees it.${ownKeys()[id] ? ' Leave empty and save to remove it.' : ''}`,
  });
  if (key === null) return false;
  setOwnKey(id, key);
  delete state.modelCache[OWN + id];
  renderModelPill();
  renderChatAccess();
  toast(key ? 'Key saved in this browser' : 'Key removed', 'ok');
  return true;
}

/** Connects to the person's own PaperWriter on this computer, to use its AI here. */
async function connectBridge(conf, quiet = false) {
  const bridge = new Bridge(conf);
  try {
    state.bridgeStatus = await bridge.status();
    state.bridge = bridge;
    for (const k of Object.keys(state.modelCache)) if (k.startsWith(PC)) delete state.modelCache[k];
    return true;
  } catch (e) {
    state.bridge = null;
    state.bridgeStatus = null;
    if (!quiet) throw e;
    return false;
  } finally {
    renderModelPill();
    renderChatAccess();
  }
}

function openBridgeDialog() {
  const conf = bridgeConf() || { url: 'http://localhost:5178', key: '' };
  const provs = Object.values(state.bridgeStatus?.providers || {});
  const { el, close } = openModal(`
    <div class="modal-head">${icon('terminal')}<h2>Use AI from your computer</h2><button class="icon-btn" data-close>${icon('x')}</button></div>
    <form class="modal-body" id="bridgeForm">
      ${state.bridgeStatus ? `<div class="status-line ok">${icon('check')}<span>Connected. Available here: ${provs.map((p) => esc(p.label)).join(', ') || 'no AI set up yet'}.</span></div>` : ''}
      <ol class="steps">
        <li>Run PaperWriter on your own computer (free, from <a href="https://github.com/Shadhin-f/paperwriter" target="_blank" rel="noopener">github.com/Shadhin-f/paperwriter</a>) and set up Claude Code, Ollama or your API keys there.</li>
        <li>In that PaperWriter, open <b>Settings</b>, turn on <b>Use my AI in workspaces I join</b> and copy its link key.</li>
        <li>Paste it below.</li>
      </ol>
      <label class="field"><span>Link key</span><input class="input mono" type="password" name="key" value="${esc(conf.key)}" placeholder="Paste the link key" autocomplete="off" /></label>
      <label class="field"><span>Address of your PaperWriter</span><input class="input mono" name="url" value="${esc(conf.url)}" placeholder="http://localhost:5178" /></label>
      <p class="note">Your keys and logins stay on your computer, and the chats run there. The host of this workspace never sees them. Your browser may ask to let this page reach devices on your local network: allow it.</p>
    </form>
    <div class="modal-foot">${bridgeConf() ? '<button class="btn-ghost" data-disconnect>Disconnect</button><span class="spacer"></span>' : ''}<button class="btn-ghost" data-close>Cancel</button><button class="btn-primary" data-connect>${icon('link')}<span>Connect</span></button></div>`);
  const form = $('#bridgeForm', el);
  const go = async () => {
    const next = { url: form.url.value.trim() || 'http://localhost:5178', key: form.key.value.trim() };
    if (!next.key) return toast('Paste the link key from your PaperWriter’s Settings.', 'err');
    const btn = $('[data-connect]', el);
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span><span>Connecting…</span>';
    try {
      await connectBridge(next);
      saveBridgeConf(next);
      close();
      const names = Object.values(state.bridgeStatus.providers).map((p) => p.label);
      toast(names.length ? `Connected: ${names.join(', ')}` : 'Connected, but no AI is set up on your computer yet', names.length ? 'ok' : 'err', 5000);
      if (names.length) openModelPicker(PC + Object.keys(state.bridgeStatus.providers)[0]);
    } catch (e) {
      toast(e.message, 'err', 7000);
      btn.disabled = false;
      btn.innerHTML = `${icon('link')}<span>Connect</span>`;
      hydrateIcons(btn);
    }
  };
  form.onsubmit = (e) => {
    e.preventDefault();
    go();
  };
  $('[data-connect]', el).onclick = go;
  $('[data-disconnect]', el)?.addEventListener('click', () => {
    saveBridgeConf(null);
    state.bridge = null;
    state.bridgeStatus = null;
    if (viaOf(prefs.provider) === 'pc') prefs.provider = prefs.model = null;
    savePrefs();
    ensureModelChoice();
    renderChatAccess();
    close();
    toast('Disconnected from your computer', 'ok');
  });
}

function chooseModel(provider, model) {
  prefs.provider = provider;
  prefs.model = model;
  savePrefs();
  renderModelPill();
  closePopover();
  const info = providerInfo(provider);
  toast(`Chatting with ${info?.label || provider} · ${model}`);
}

/* ───────────────────────── settings ───────────────────────── */

function openSettings(focus) {
  const st = state.status;
  const s = st.settings;
  const prov = st.providers;
  const eng = st.engines;
  const badge = (ok, yes = 'Ready', no = 'Not set') => `<span class="badge-pill ${ok ? 'ok' : 'warn'}">${ok ? yes : no}</span>`;
  const keyCard = (id, title, link, placeholder) => {
    const k = s.keyStatus[id];
    return `<div class="setting-card">
      <div class="setting-row"><span class="label"><b>${title}</b><small>${k.set ? `Using ${k.source === 'env' ? `env var ${esc(k.hint)}` : `saved key ${esc(k.hint)}`}` : `Get a key at <a href="${link}" target="_blank" rel="noopener">${link.replace(/^https:\/\//, '')}</a>`}</small></span>${badge(k.set, 'Key set')}</div>
      <div class="key-row"><input class="input" type="password" data-key="${id}" placeholder="${k.set ? 'Paste a new key to replace' : placeholder}" autocomplete="off" />
      ${k.set && k.source === 'saved' ? `<button class="btn-ghost" data-clear="${id}">Remove</button>` : ''}</div></div>`;
  };
  const cliCard = (id, install) => {
    const p = prov[id];
    return `<div class="setting-card"><div class="setting-row">${icon('terminal')}<span class="label"><b>${esc(p.label)}</b><small>${esc(p.detail)}</small></span>${badge(p.available, 'Connected', 'Unavailable')}</div>
      ${!p.available ? `<p class="note">${install}</p>` : ''}</div>`;
  };
  const engineRow = ['tectonic', 'latexmk', 'pdflatex', 'xelatex', 'lualatex'].map((e) => `<span class="badge-pill ${eng[e] ? 'ok' : ''}">${e}${eng[e] ? ' ✓' : ''}</span>`).join('');

  const { el, close } = openModal(`
    <div class="modal-head"><img src="/logo.svg" alt="" /><h2>Settings</h2><button class="icon-btn" data-close>${icon('x')}</button></div>
    <div class="modal-body">
      <div class="modal-section" id="sec-ai">
        <h3>AI co-author</h3>
        ${cliCard('claude-cli', 'Install Claude Code with <code>npm i -g @anthropic-ai/claude-code</code>, then run <code>claude</code> in a terminal once and sign in. No API key needed — it uses your Claude subscription.')}
        ${keyCard('anthropic', 'Claude API (Anthropic)', 'https://console.anthropic.com/settings/keys', 'sk-ant-…')}
        ${keyCard('openai', 'ChatGPT API (OpenAI)', 'https://platform.openai.com/api-keys', 'sk-…')}
        ${keyCard('gemini', 'Gemini API (Google)', 'https://aistudio.google.com/apikey', 'AIza…')}
        <div class="setting-card">
          <div class="setting-row"><span class="label"><b>Ollama (local)</b><small>${esc(prov.ollama.detail)}</small></span>${badge(prov.ollama.available, 'Running', 'Offline')}</div>
          <div class="key-row"><input class="input" data-field="ollamaUrl" value="${esc(s.ollamaUrl)}" placeholder="http://127.0.0.1:11434" /></div>
        </div>
        <div class="setting-card">
          <div class="setting-row"><span class="label"><b>OpenAI-compatible server</b><small>LM Studio, llama.cpp, vLLM, OpenRouter… · ${esc(prov.compat.detail)}</small></span>${badge(prov.compat.available, 'Reachable', 'Offline')}</div>
          <div class="key-row"><input class="input" data-field="compatUrl" value="${esc(s.compatUrl)}" placeholder="http://127.0.0.1:1234/v1" /></div>
          <div class="key-row"><input class="input" type="password" data-key="compat" placeholder="${s.keyStatus.compat.set ? 'Key set — paste to replace' : 'API key (optional)'}" autocomplete="off" /></div>
        </div>
        <div class="setting-card">
          <div class="setting-row"><span class="label"><b>Use my AI in workspaces I join</b><small>When you join someone else’s PaperWriter, your browser can use this computer’s AI: Claude Code, Ollama and your keys. They stay here; the other host never sees them.</small></span>
            <label class="toggle"><input type="checkbox" id="bridgeToggle" ${s.bridgeKey ? 'checked' : ''} /><span class="track"></span></label></div>
          ${
            s.bridgeKey
              ? `<div class="key-row"><input class="input" readonly value="${esc(s.bridgeKey)}" id="bridgeKeyField" aria-label="Link key" /><button class="btn-ghost" type="button" data-bridge="copy">${icon('copy')}Copy</button><button class="btn-ghost" type="button" data-bridge="rotate">New key</button></div>
                 <p class="note">In the other workspace: model menu → <b>Use AI from your computer</b>, then paste this key. Keep PaperWriter running here while you work. A new key disconnects browsers using the old one.</p>`
              : ''
          }
        </div>
        ${prov['gemini-cli'].available ? cliCard('gemini-cli', '') : ''}
        ${prov['codex-cli'].available ? cliCard('codex-cli', '') : ''}
        <p class="note">Keys are stored only on this computer in <code>.data/settings.json</code> and never sent to the browser. Environment variables (<code>ANTHROPIC_API_KEY</code>, <code>OPENAI_API_KEY</code>, <code>GEMINI_API_KEY</code>) also work.</p>
      </div>

      <div class="modal-section" id="sec-compiler">
        <h3>Compiler</h3>
        <div class="setting-card">
          <div class="setting-row"><span class="label"><b>Engine</b><small>Automatic picks Tectonic → latexmk → pdfLaTeX…</small></span>
            <select class="input" data-field="engine" style="width:auto">
              ${['auto', 'tectonic', 'latexmk', 'pdflatex', 'xelatex', 'lualatex', 'online'].map((e) => `<option value="${e}" ${s.engine === e ? 'selected' : ''}>${e}</option>`).join('')}
            </select></div>
          <div class="engine-grid">${engineRow}</div>
          ${eng.tectonic ? '' : `<div class="setting-row" style="margin-top:12px"><span class="label"><b>Tectonic</b><small>Small self-contained engine (~30 MB) from github.com/tectonic-typesetting. Fetches packages on demand.</small></span><button class="btn-primary" id="installTectonicBtn">${icon('download')}Install</button></div>`}
        </div>
        <div class="setting-card">
          <div class="setting-row"><span class="label"><b>Online compiler</b><small>Sends your project's text files to texlive.net to compile. Handy when no engine is installed.</small></span>
            <label class="toggle"><input type="checkbox" data-field="allowOnline" ${s.allowOnline ? 'checked' : ''} /><span class="track"></span></label></div>
        </div>
      </div>

      <div class="modal-section">
        <h3>Editor</h3>
        <div class="setting-card">
          <div class="setting-row"><span class="label"><b>Font size</b></span><input type="range" min="11" max="20" value="${prefs.fontSize}" id="fontSizeRange" /><span class="badge-pill" id="fontSizeVal">${prefs.fontSize}px</span></div>
          <div class="setting-row"><span class="label"><b>Theme</b></span>
            <select class="input" id="themeSelect" style="width:auto">${['system', 'light', 'dark'].map((t) => `<option ${prefs.theme === t ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
          <div class="setting-row"><span class="label"><b>Compile automatically while typing</b></span><label class="toggle"><input type="checkbox" id="autoCompileSetting" ${prefs.autoCompile ? 'checked' : ''} /><span class="track"></span></label></div>
          <div class="setting-row"><span class="label"><b>Auto-apply AI edits</b><small>Every change can be reverted from the chat.</small></span><label class="toggle"><input type="checkbox" id="autoApplySetting" ${prefs.autoApply ? 'checked' : ''} /><span class="track"></span></label></div>
        </div>
      </div>
    </div>
    <div class="modal-foot"><button class="btn-ghost" data-close>Close</button><button class="btn-primary" id="saveSettings">${icon('check')}Save</button></div>`);

  if (focus) $(`#sec-${focus}`, el)?.scrollIntoView({ block: 'start' });

  $('#fontSizeRange', el).oninput = (e) => {
    prefs.fontSize = Number(e.target.value);
    $('#fontSizeVal', el).textContent = `${prefs.fontSize}px`;
    applyLayout();
    cm.refresh();
    savePrefs();
  };
  $('#themeSelect', el).onchange = (e) => {
    prefs.theme = e.target.value;
    applyTheme();
    savePrefs();
  };
  $('#autoCompileSetting', el).onchange = (e) => {
    prefs.autoCompile = e.target.checked;
    savePrefs();
  };
  $('#autoApplySetting', el).onchange = (e) => {
    prefs.autoApply = e.target.checked;
    $('#autoApply').checked = prefs.autoApply;
    savePrefs();
  };
  $('#installTectonicBtn', el)?.addEventListener('click', (e) => installTectonic(e.currentTarget));
  $('#bridgeToggle', el).onchange = async (e) => {
    await api('/api/settings', { method: 'POST', body: { bridge: e.target.checked } }).catch((err) => toast(err.message, 'err'));
    await refreshStatus();
    close();
    openSettings('ai');
  };
  el.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-bridge]');
    if (!b) return;
    if (b.dataset.bridge === 'copy') {
      await navigator.clipboard.writeText($('#bridgeKeyField', el).value).catch(() => {});
      return toast('Link key copied', 'ok');
    }
    await api('/api/settings', { method: 'POST', body: { bridgeRotate: true } });
    await refreshStatus();
    close();
    openSettings('ai');
    toast('New link key made. Paste it in the workspaces you use.', 'ok');
  });
  el.addEventListener('click', async (e) => {
    const c = e.target.closest('[data-clear]');
    if (!c) return;
    await api('/api/settings', { method: 'POST', body: { keys: { [c.dataset.clear]: '' } } });
    await refreshStatus();
    close();
    openSettings('ai');
  });
  $('#saveSettings', el).onclick = async () => {
    const body = { keys: {} };
    for (const inp of $$('[data-key]', el)) if (inp.value.trim()) body.keys[inp.dataset.key] = inp.value.trim();
    for (const inp of $$('[data-field]', el)) body[inp.dataset.field] = inp.type === 'checkbox' ? inp.checked : inp.value;
    try {
      await api('/api/settings', { method: 'POST', body });
      state.modelCache = {};
      await refreshStatus();
      close();
      toast('Settings saved', 'ok');
      if (state.lastResult?.needsEngine && hasAnyEngine()) {
        resetPdfEmpty();
        compile();
      }
    } catch (err) {
      toast(err.message, 'err');
    }
  };
}

/* ───────────────────────── chat ───────────────────────── */

function loadChat() {
  try {
    state.chat = JSON.parse(localStorage.getItem(`pw.chat.${state.project}`) || '[]');
  } catch {
    state.chat = [];
  }
  renderChat();
}

function saveChat() {
  try {
    const slim = state.chat.slice(-60).map(({ _prev, streaming, ...m }) => m);
    localStorage.setItem(`pw.chat.${state.project}`, JSON.stringify(slim));
  } catch {}
}

function selectionInfo() {
  if (!cm.somethingSelected()) return null;
  const from = cm.getCursor('from');
  const to = cm.getCursor('to');
  return { text: cm.getSelection(), fromLine: from.line + 1, toLine: to.line + 1 };
}

function renderCtxChips() {
  const chips = [];
  if (state.file) chips.push(`<span class="ctx-chip" title="The open file is shared with the AI">${icon('file')}${esc(state.file)}&nbsp;</span>`);
  const sel = selectionInfo();
  if (sel) {
    chips.push(
      `<span class="ctx-chip ${state.useSelection ? '' : 'off'}">${icon('select')}Selection L${sel.fromLine}${sel.toLine !== sel.fromLine ? `–${sel.toLine}` : ''}<button data-chip="sel" title="Toggle">${icon(state.useSelection ? 'x' : 'plus')}</button></span>`,
    );
  }
  if (state.errors.length) {
    chips.push(
      `<span class="ctx-chip warn ${state.useErrors ? '' : 'off'}">${icon('alert')}${state.errors.length} compile error${state.errors.length > 1 ? 's' : ''}<button data-chip="err" title="Toggle">${icon(state.useErrors ? 'x' : 'plus')}</button></span>`,
    );
  }
  $('#ctxChips').innerHTML = chips.join('');
}

$('#ctxChips').addEventListener('click', (e) => {
  const b = e.target.closest('[data-chip]');
  if (!b) return;
  if (b.dataset.chip === 'sel') state.useSelection = !state.useSelection;
  else state.useErrors = !state.useErrors;
  renderCtxChips();
});

const SUGGESTIONS = [
  ['✍️', 'Draft an introduction for my paper'],
  ['🛠️', 'Fix my compile errors'],
  ['📊', 'Add a nicely formatted results table'],
  ['🎓', 'Convert this to an IEEE two-column paper'],
  ['🔍', 'Proofread and polish the selected text'],
];

/**
 * Everyone's AI chats in this project, oldest first. Your own exchanges use your local copies
 * (they remember which edits you applied); everyone else's are shown as they were shared.
 */
function chatTimeline() {
  const groups = [];
  const used = new Set();
  const mine = new Map(state.chat.map((m, i) => [m.id, i]));
  for (const e of state.ws?.chat?.toArray() || []) {
    if (mine.has(e.id)) {
      const i = mine.get(e.id);
      const u = state.chat[i - 1]?.role === 'user' ? state.chat[i - 1] : null;
      groups.push({ at: e.at, msgs: u ? [u, state.chat[i]] : [state.chat[i]] });
      if (u) used.add(u.id);
      used.add(e.id);
      continue;
    }
    const by = e.by || { name: 'Someone', color: '#8e8e93' };
    groups.push({
      at: e.at,
      msgs: [
        { id: `${e.id}-q`, role: 'user', content: e.prompt, file: e.file, sel: e.sel, by, other: true },
        { id: e.id, role: 'assistant', content: e.reply, providerLabel: e.provider, model: e.model, file: e.file, by, via: e.via, other: true },
      ],
    });
  }
  // Your messages that aren't shared (yet): the one being written, failed ones, and older local history.
  let pending = null;
  for (const m of state.chat) {
    if (used.has(m.id)) continue;
    if (m.role === 'user' || !pending) groups.push((pending = { at: m.at || 0, msgs: [] }));
    pending.msgs.push(m);
    if (m.role === 'assistant') pending = null;
  }
  groups.sort((a, b) => a.at - b.at);
  const since = prefs.chatFrom?.[state.project] || 0;
  const out = [];
  let divided = !since;
  for (const g of groups) {
    if (!divided && g.at >= since) {
      if (out.length) out.push({ id: 'divider', role: 'divider' });
      divided = true;
    }
    out.push(...g.msgs);
  }
  state.timeline = out;
  return out;
}

const findMsg = (id) => state.chat.find((m) => m.id === id) || state.timeline?.find((m) => m.id === id);

function renderChat() {
  const box = $('#messages');
  const items = chatTimeline();
  if (!items.length) {
    box.innerHTML = `<div class="chat-empty">
      <img src="/logo.svg" alt="" class="bob" />
      <h3>Hi! I'm your LaTeX buddy</h3>
      <p>Ask me to write, restructure or fix anything in your paper. Everyone in this project sees these chats.</p>
      <div class="suggestions">${SUGGESTIONS.map(([e, t]) => `<button class="suggestion" data-suggest="${esc(t)}"><span class="emo">${e}</span>${esc(t)}</button>`).join('')}</div>
    </div>`;
    return;
  }
  box.innerHTML = '';
  for (const m of items) box.append(messageEl(m));
  hydrateIcons(box);
  box.scrollTop = box.scrollHeight;
}

function messageEl(m) {
  const el = document.createElement('div');
  el.className = `msg ${m.role}${m.other ? ' other' : ''}`;
  el.dataset.id = m.id;
  fillMessage(el, m);
  return el;
}

function fillMessage(el, m) {
  if (m.role === 'divider') {
    el.innerHTML = '<span>New conversation · the AI only sees your messages below</span>';
    return;
  }
  if (m.role === 'user') {
    el.innerHTML = `${m.other ? `<div class="msg-author">${avatar(m.by, 'tiny')}<span>${esc(m.by.name)}</span>${m.by.host ? '<span class="host-tag">Host</span>' : ''}</div>` : ''}<div class="bubble">${esc(m.content)}</div>${m.sel || m.file ? `<div class="msg-meta">${m.file ? `<span>${esc(m.file)}</span>` : ''}${m.sel ? `<span class="ctx">${esc(m.sel)}</span>` : ''}</div>` : ''}`;
    return;
  }
  const info = m.other ? null : providerInfo(m.provider);
  const where = m.via === 'pc' ? ` · on ${esc(m.by?.name || 'their')}’s computer` : '';
  el.innerHTML = `
    <div class="msg-meta"><img src="/logo.svg" alt="" />${esc(m.providerLabel || info?.label || baseId(m.provider) || '')} · ${esc(m.model || '')}${where}</div>
    <div class="bubble">${assistantBody(m)}</div>
    ${m.streaming ? '' : m.other ? `<div class="msg-actions"><button data-act="copy-msg" data-msg="${m.id}">Copy</button></div>` : `<div class="msg-actions">
      <button data-act="copy-msg" data-msg="${m.id}">${'Copy'}</button>
      ${(m.edits || []).includes('applied') ? `<button data-act="revert-all" data-msg="${m.id}">Revert all</button>` : ''}
      <button data-act="retry-msg" data-msg="${m.id}">Retry</button></div>`}`;
}

function isFullDoc(code) {
  return /\\documentclass/.test(code) && /\\end\{document\}/.test(code);
}

function assistantBody(m) {
  if (!m.content && m.streaming) return '<span class="typing"><span></span><span></span><span></span></span>';
  const segs = parseReply(m.content);
  let ei = -1;
  let ci = -1;
  const out = [];
  for (const s of segs) {
    if (s.type === 'md') out.push(markdown(s.text));
    else if (s.type === 'edit') out.push(editCard(m, s, ++ei));
    else out.push(codeCard(m, s, ++ci));
  }
  if (m.streaming) out.push('<span class="typing"><span></span><span></span><span></span></span>');
  if (m.error) out.push(`<p class="err">⚠ ${esc(m.error)}</p>`);
  if (m.stopped) out.push('<p><i>Stopped.</i></p>');
  return out.join('');
}

function editCard(m, s, i) {
  const st = !s.complete ? 'writing' : m.other ? 'shared' : m.edits?.[i] || 'ready';
  const label = { applied: 'Applied', failed: 'Not found', reverted: 'Reverted', writing: 'writing…' }[st] || '';
  const btn =
    st === 'applied' ? `<button data-act="revert" data-msg="${m.id}" data-i="${i}">Revert</button>`
    : st === 'failed' ? `<button data-act="apply" data-msg="${m.id}" data-i="${i}">Retry</button>`
    : st === 'writing' || st === 'shared' ? ''
    : `<button data-act="apply" data-msg="${m.id}" data-i="${i}">Apply</button>`;
  const diff = lineDiff(s.search, s.replace)
    .map((o) => `<div class="${o.k}">${esc(o.t) || ' '}</div>`)
    .join('');
  return `<div class="card ${st === 'writing' ? 'pending' : st}"><div class="card-head">${icon('pencil')}<span>Edit</span><span class="tag">${esc(m.file || '')}</span><span class="spacer"></span>${label ? `<span class="state">${label}</span>` : ''}${btn}</div><div class="diff">${diff}</div></div>`;
}

function codeCard(m, s, i) {
  const tex = /^(latex|tex|)$/i.test(s.lang);
  const full = tex && isFullDoc(s.code);
  const st = m.code?.[i];
  const btns = [`<button data-act="copy" data-msg="${m.id}" data-i="${i}">Copy</button>`];
  if (tex && s.complete && !m.other) {
    if (full) btns.push(st === 'replaced' ? `<button data-act="undo-replace" data-msg="${m.id}" data-i="${i}">Revert</button>` : `<button data-act="replace-file" data-msg="${m.id}" data-i="${i}">Replace file</button>`);
    else btns.push(`<button data-act="insert" data-msg="${m.id}" data-i="${i}">Insert</button>`);
  }
  return `<div class="card ${st === 'replaced' ? 'applied' : ''}"><div class="card-head">${icon('code')}<span>${esc(s.lang || 'code')}</span>${full ? '<span class="tag">full document</span>' : ''}<span class="spacer"></span>${st === 'replaced' ? '<span class="state">Applied</span>' : ''}${btns.join('')}</div><pre class="code">${esc(s.code)}</pre></div>`;
}

let renderQueued = new Set();
let renderRaf = 0;
function queueRender(m) {
  renderQueued.add(m);
  if (renderRaf) return;
  renderRaf = requestAnimationFrame(() => {
    renderRaf = 0;
    const box = $('#messages');
    const atBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 80;
    for (const msg of renderQueued) {
      const el = $(`.msg[data-id="${msg.id}"]`, box);
      if (el) {
        fillMessage(el, msg);
        hydrateIcons(el);
      }
    }
    renderQueued.clear();
    if (atBottom) box.scrollTop = box.scrollHeight;
  });
}

function setSendMode(streaming) {
  const b = $('#sendBtn');
  b.classList.toggle('stop', streaming);
  b.innerHTML = icon(streaming ? 'stop' : 'send');
  b.title = streaming ? 'Stop' : 'Send';
}

async function send(text) {
  text = (text || '').trim();
  if (!text || state.streaming) return;
  if (!prefs.provider || !prefs.model) return openModelPicker();
  const via = viaOf(prefs.provider);
  const base = baseId(prefs.provider);
  const ownKey = via === 'own' ? ownKeys()[base] : '';
  if (via === 'own' && !ownKey) return askOwnKey(base);
  if (via === 'pc' && !state.bridge) return openBridgeDialog();
  const project = state.project;
  const sel = state.useSelection ? selectionInfo() : null;
  const now = Date.now();
  const userMsg = { id: uid(), at: now, role: 'user', content: text, file: state.file, sel: sel ? `L${sel.fromLine}${sel.toLine !== sel.fromLine ? `–${sel.toLine}` : ''}` : null };
  const msg = { id: uid() + uid(), at: now, role: 'assistant', content: '', provider: prefs.provider, model: prefs.model, file: state.file, edits: [], code: [], streaming: true };
  // The AI sees only your own conversation (since your last "New chat"), even though everyone sees every chat.
  const since = prefs.chatFrom?.[project] || 0;
  const history = [...state.chat.filter((m) => (m.at || 0) >= since && !m.error), userMsg].map((m) => ({ role: m.role, content: m.content }));
  state.chat.push(userMsg, msg);
  renderChat();
  $('#prompt').value = '';
  autosizePrompt();

  const context = {
    fileName: state.file,
    content: state.file ? cm.getValue() : '',
    selection: sel,
    cursorLine: cm.getCursor().line + 1,
    files: state.files.map((f) => f.path),
    main: state.meta.main,
    errors: state.useErrors ? state.errors : [],
  };
  const ctrl = new AbortController();
  state.streaming = { ctrl, msg };
  setSendMode(true);
  try {
    const args = { model: msg.model, history, context, signal: ctrl.signal };
    const chunks =
      via === 'own' ? directChat({ ...args, provider: base, key: ownKey })
      : via === 'pc' ? state.bridge.chat({ ...args, provider: base })
      : hostChat({ ...args, provider: msg.provider, project });
    for await (const t of chunks) {
      msg.content += t;
      queueRender(msg);
    }
  } catch (e) {
    if (e.name === 'AbortError') msg.stopped = true;
    else msg.error = e.message;
  } finally {
    msg.streaming = false;
    state.streaming = null;
    setSendMode(false);
  }
  if (!msg.error && !msg.stopped && msg.content.trim() && state.project === project) shareExchange(project, userMsg, msg);
  if (!msg.error && !msg.stopped && prefs.autoApply) await autoApply(msg);
  queueRender(msg);
  saveChat();
}

/** The host's AI, through the host's server. */
async function* hostChat({ provider, model, history, context, signal, project }) {
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ project, provider, model, messages: history, context }),
    signal,
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || res.statusText);
  for await (const ev of sseEvents(res.body)) {
    if (ev.type === 'text') yield ev.text;
    else if (ev.type === 'error') throw new Error(ev.error);
  }
}

/** Adds a finished question and answer to the project's shared chat, so everyone sees it. */
function shareExchange(project, u, m) {
  const me = myIdentity();
  const info = providerInfo(m.provider);
  api(`/api/projects/${enc(project)}/chat`, {
    method: 'POST',
    body: { id: m.id, prompt: u.content, reply: m.content, file: u.file || '', sel: u.sel || '', provider: info?.label || baseId(m.provider), model: m.model || '', via: viaOf(m.provider), by: { name: me.name, color: me.color } },
  }).catch((e) => toast(`Couldn’t share this chat with the others: ${e.message}`, 'err'));
}

async function autoApply(msg) {
  const segs = parseReply(msg.content);
  const edits = segs.filter((s) => s.type === 'edit' && s.complete);
  if (edits.length) return applyEdits(msg, edits.map((_, i) => i));
  const codes = segs.filter((s) => s.type === 'code');
  const idx = codes.findIndex((s) => s.complete && /^(latex|tex|)$/i.test(s.lang) && isFullDoc(s.code));
  if (idx >= 0 && /\.tex$/.test(msg.file || '')) await replaceFile(msg, idx);
}

async function ensureFile(path) {
  if (path && path !== state.file && state.files.some((f) => f.path === path)) await openFile(path);
}

async function applyEdits(msg, indices) {
  await ensureFile(msg.file);
  const edits = parseReply(msg.content).filter((s) => s.type === 'edit');
  const marks = [];
  let first = null;
  let failed = 0;
  cm.operation(() => {
    for (const i of indices) {
      const e = edits[i];
      if (!e?.complete) continue;
      const text = cm.getValue();
      let loc = locate(text, e.search);
      if (!loc && !e.search.trim() && !text.trim()) loc = [0, text.length];
      if (!loc) {
        msg.edits[i] = 'failed';
        failed++;
        continue;
      }
      const from = cm.posFromIndex(loc[0]);
      cm.replaceRange(e.replace, from, cm.posFromIndex(loc[1]), '+ai');
      const end = cm.posFromIndex(loc[0] + e.replace.length);
      marks.push(cm.markText(from, end, { className: 'ai-flash' }));
      first ??= from;
      msg.edits[i] = 'applied';
    }
  });
  if (first) {
    cm.scrollIntoView(first, 120);
    if (isMobile() && $('#workspace').dataset.view === 'chat') toast('Edits applied — tap Code to see them', 'ok');
  }
  setTimeout(() => marks.forEach((mk) => mk.clear()), 1800);
  if (failed) toast(`${failed} edit${failed > 1 ? 's' : ''} couldn't be matched — the text may have changed.`, 'err', 4500);
  queueRender(msg);
  saveChat();
}

async function revertEdit(msg, i, quiet = false) {
  await ensureFile(msg.file);
  const e = parseReply(msg.content).filter((s) => s.type === 'edit')[i];
  if (!e) return false;
  const text = cm.getValue();
  const loc = e.replace.trim() ? locate(text, e.replace) : null;
  if (!loc) {
    if (!quiet) toast("Couldn't find that change any more — try Ctrl+Z in the editor.", 'err');
    return false;
  }
  cm.replaceRange(e.search, cm.posFromIndex(loc[0]), cm.posFromIndex(loc[1]), '+ai-revert');
  msg.edits[i] = 'reverted';
  return true;
}

async function replaceFile(msg, i) {
  await ensureFile(msg.file);
  const code = parseReply(msg.content).filter((s) => s.type === 'code')[i]?.code;
  if (code == null) return;
  msg._prev ??= {};
  msg._prev[i] = cm.getValue();
  cm.replaceRange(code.endsWith('\n') ? code : code + '\n', { line: 0, ch: 0 }, { line: cm.lastLine() }, '+ai');
  msg.code ??= [];
  msg.code[i] = 'replaced';
  queueRender(msg);
  saveChat();
}

$('#messages').addEventListener('click', async (e) => {
  const sug = e.target.closest('[data-suggest]');
  if (sug) return send(sug.dataset.suggest);
  const b = e.target.closest('[data-act]');
  if (!b) return;
  const msg = findMsg(b.dataset.msg);
  if (!msg) return;
  if (msg.other && !['copy', 'copy-msg'].includes(b.dataset.act)) return;
  const i = Number(b.dataset.i);
  const act = b.dataset.act;
  if (act === 'apply') await applyEdits(msg, [i]);
  else if (act === 'revert') {
    await revertEdit(msg, i);
    queueRender(msg);
    saveChat();
  } else if (act === 'revert-all') {
    const idx = (msg.edits || []).map((s, k) => (s === 'applied' ? k : -1)).filter((k) => k >= 0).reverse();
    let ok = 0;
    for (const k of idx) if (await revertEdit(msg, k, true)) ok++;
    toast(`Reverted ${ok} of ${idx.length} edit${idx.length > 1 ? 's' : ''}`, ok === idx.length ? 'ok' : 'err');
    queueRender(msg);
    saveChat();
  } else if (act === 'copy' || act === 'insert') {
    const code = parseReply(msg.content).filter((s) => s.type === 'code')[i]?.code || '';
    if (act === 'copy') {
      await navigator.clipboard.writeText(code);
      toast('Copied to clipboard', 'ok');
    } else {
      await ensureFile(msg.file);
      const sel = cm.somethingSelected();
      cm.replaceSelection(sel ? code : `${code}\n`, 'around', '+ai');
      cm.focus();
      toast(sel ? 'Replaced selection' : 'Inserted at cursor', 'ok');
    }
  } else if (act === 'replace-file') await replaceFile(msg, i);
  else if (act === 'undo-replace') {
    if (msg._prev?.[i] == null) return toast('Original not available any more — use Ctrl+Z in the editor.', 'err');
    await ensureFile(msg.file);
    cm.replaceRange(msg._prev[i], { line: 0, ch: 0 }, { line: cm.lastLine() }, '+ai-revert');
    msg.code[i] = null;
    queueRender(msg);
    saveChat();
  } else if (act === 'copy-msg') {
    await navigator.clipboard.writeText(msg.content);
    toast('Copied', 'ok');
  } else if (act === 'retry-msg') {
    const idx = state.chat.indexOf(msg);
    const user = state.chat[idx - 1];
    if (user?.role !== 'user' || state.streaming) return;
    state.chat.splice(idx - 1, 2);
    send(user.content);
  }
});

function autosizePrompt() {
  const t = $('#prompt');
  t.style.height = 'auto';
  t.style.height = `${Math.min(t.scrollHeight, 180)}px`;
}

/* ───────────────────────── wiring ───────────────────────── */

function wire() {
  $('#prompt').addEventListener('input', autosizePrompt);
  $('#prompt').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      send($('#prompt').value);
    }
  });
  $('#sendBtn').onclick = () => (state.streaming ? state.streaming.ctrl.abort() : send($('#prompt').value));
  $('#newChatBtn').onclick = () => {
    if (state.streaming) state.streaming.ctrl.abort();
    prefs.chatFrom = { ...(prefs.chatFrom || {}), [state.project]: Date.now() };
    savePrefs();
    renderChat();
    toast('New conversation. Earlier chats stay visible to everyone.', 'ok');
  };
  $('#clearChatBtn').onclick = async () => {
    if (!(await confirmBox('Clear the chat for everyone?', 'Every AI conversation in this project is removed for all collaborators. This can’t be undone.', 'Clear chat'))) return;
    try {
      await api(`/api/projects/${P()}/chat`, { method: 'DELETE' });
      state.chat = [];
      saveChat();
      renderChat();
      toast('Chat cleared for everyone', 'ok');
    } catch (e) {
      toast(e.message, 'err');
    }
  };
  $('#historyBtn').onclick = () => openHistory().catch((e) => toast(e.message, 'err'));
  $('#autoApply').checked = prefs.autoApply;
  $('#autoApply').onchange = (e) => {
    prefs.autoApply = e.target.checked;
    savePrefs();
  };
  $('#modelBtn').onclick = () => ($('#popover').hidden || popAnchor !== $('#modelBtn') ? openModelPicker() : closePopover());
  $('#projectBtn').onclick = () => openProjectMenu().catch((e) => toast(e.message, 'err'));
  $('#compileBtn').onclick = () => saveAndCompile();
  $('#compileMenuBtn').onclick = () => openCompileMenu();
  $('#settingsBtn').onclick = () => openSettings();
  $('#themeBtn').onclick = () => {
    prefs.theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    applyTheme();
    savePrefs();
  };
  for (const b of $$('[data-side]')) b.onclick = () => setSideTab(b.dataset.side);
  for (const b of $$('#mobileNav button')) b.onclick = () => setView(b.dataset.view);
  $('#newFileBtn').onclick = () => newFile();
  $('#newFolderBtn').onclick = () => newFolder();
  $('#exportBtn').onclick = () => exportProject().catch((err) => toast(err.message, 'err'));
  $('#collapseAllBtn').onclick = () => {
    const all = state.folders;
    const anyOpen = all.some((f) => !collapsedFolders().has(f));
    setCollapsed(all, anyOpen);
    renderFiles();
  };
  $('#fileFilter').addEventListener('input', (e) => {
    state.fileFilter = e.target.value;
    renderFiles();
  });
  $('#fileFilter').addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    e.stopPropagation();
    e.target.value = '';
    state.fileFilter = '';
    renderFiles();
  });
  $('#uploadInput').onchange = (e) => {
    uploadFiles([...e.target.files]);
    e.target.value = '';
  };
  const fv = $('#sidePanel');
  fv.addEventListener('dragover', (e) => {
    if (!e.dataTransfer?.types.includes('Files')) return;
    e.preventDefault();
    setSideTab('files');
    $('#filesView').classList.add('drop');
    markDrop(dropDir(e.target) || null);
  });
  fv.addEventListener('dragleave', () => {
    $('#filesView').classList.remove('drop');
    markDrop(null);
  });
  fv.addEventListener('drop', (e) => {
    e.preventDefault();
    $('#filesView').classList.remove('drop');
    markDrop(null);
    const dropped = [...e.dataTransfer.files];
    // A dropped export archive becomes a new project; anything else is added to this one.
    if (dropped.length === 1 && isOwner() && /\.(zip|tgz|tar|tar\.gz)$/i.test(dropped[0].name)) importProjectFlow(dropped[0]).catch((err) => toast(err.message, 'err'));
    else if (dropped.length) uploadFiles(dropped, dropDir(e.target));
  });

  $('#findBtn').onclick = () => cm.execCommand('findPersistent');
  $('#undoBtn').onclick = () => (state.ws && state.file ? state.ws.undoManager(state.file).undo() : cm.undo());
  $('#redoBtn').onclick = () => (state.ws && state.file ? state.ws.undoManager(state.file).redo() : cm.redo());
  $('#shareBtn').onclick = () => openShare().catch((e) => toast(e.message, 'err'));
  $('#accountBtn').onclick = () => openAccountMenu();
  for (const b of $$('[data-mode]')) b.onclick = () => setEditorMode(b.dataset.mode);
  $('#askSelBtn').onclick = askAboutSelection;
  $('#zoomInBtn').onclick = () => zoom(1);
  $('#zoomOutBtn').onclick = () => zoom(-1);
  $('#zoomFitBtn').onclick = () => zoom('fit');
  $('#logBar').onclick = () => toggleLog();
  for (const b of $$('[data-log]')) {
    b.onclick = () => {
      for (const x of $$('[data-log]')) x.classList.toggle('active', x === b);
      $('#issueList').hidden = b.dataset.log !== 'issues';
      $('#rawLog').hidden = b.dataset.log !== 'raw';
    };
  }
  $('#issueList').addEventListener('click', (e) => {
    const li = e.target.closest('.issue[data-line]');
    if (li) jumpTo(li.dataset.file, li.dataset.line);
  });
  $('#fixErrorsBtn').onclick = () => {
    state.useErrors = true;
    if (isMobile()) setView('chat');
    else setSideTab('chat');
    send(state.errors.length ? 'Fix my compile errors.' : `My document fails to compile. Here is the end of the log:\n\n${state.log.slice(-1500)}`);
  };

  document.addEventListener('keydown', (e) => {
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === 's') {
      e.preventDefault();
      saveAndCompile();
    } else if (mod && e.key === 'Enter' && !cm.hasFocus()) {
      e.preventDefault();
      compile();
    } else if (e.key === 'Escape') {
      if (!$('#popover').hidden) closePopover();
      else if (!$('#modal').hidden) $('#modal').click();
    }
  });
  window.addEventListener('resize', positionPopover);
}

/* ───────────────────────── boot ───────────────────────── */

async function boot() {
  hydrateIcons();
  applyTheme();
  applyLayout();
  setupResizers();
  wire();
  setSendMode(false);
  if (isMobile()) setView('editor');
  const params = new URLSearchParams(location.search);
  const invalidLink = params.get('link') === 'invalid';
  if (invalidLink) history.replaceState(null, '', location.pathname);
  try {
    state.me = await api('/api/me');
  } catch (e) {
    $('#authScreen').hidden = true;
    return toast(`Couldn't reach the PaperWriter server: ${e.message}`, 'err', 8000);
  }
  try {
    state.collab = await import('./collab.js');
  } catch (e) {
    // Usually a stale copy of an older version still in the browser cache.
    $('#authScreen').hidden = true;
    return toast(`PaperWriter couldn't load part of the app (${e.message}). Press Ctrl+Shift+R to reload it.`, 'err', 15000);
  }
  if (invalidLink && !state.me.owner) return showWelcome('invalid');
  if (!state.me.owner && !state.me.projects.length) return showWelcome();
  if (state.me.owner && !state.me.setupDone) await runSetup();
  $('#authScreen').hidden = true;
  document.body.classList.toggle('guest', !state.me.owner);
  if (!state.me.owner) await askNameOnce();
  renderAccount();
  try {
    await refreshStatus();
    const conf = ownAllowed() && bridgeConf();
    if (conf) await Promise.race([connectBridge(conf, true), sleep(2500)]);
    await ensureModelChoice();
    const wanted = params.get('project');
    if (wanted) history.replaceState(null, '', location.pathname);
    const names = isOwner() ? (await api('/api/projects')).projects.map((p) => p.name) : state.me.projects.map((p) => p.name);
    const name = [wanted, prefs.lastProject, names[0]].find((n) => n && names.includes(n));
    if (name) await loadProject(name);
  } catch (e) {
    toast(e.message, 'err', 8000);
  }
  renderCtxChips();
}

/* ───────────────────────── visual editor ───────────────────────── */

let visual = new VisualEditor({
  host: $('#visual'),
  cm,
  readOnly: () => !canEdit(),
  resolveImage: async (p) => {
    const names = /\.\w{2,4}$/.test(p) ? [p] : ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp'].map((e) => p + e);
    for (const n of names) {
      const f = state.files.find((x) => x.path === n || x.path.endsWith(`/${n}`));
      if (f && !/\.(pdf|eps)$/i.test(f.path)) return state.ws?.fileUrl(f.path) ?? null;
    }
    return null;
  },
  // Keep the code cursor on the block being edited, so the AI's "cursor line" context stays right.
  onFocusBlock: (b) => cm.setCursor(cm.posFromIndex(b.start)),
});

function setEditorMode(mode) {
  prefs.editorMode = mode;
  savePrefs();
  applyEditorMode();
}

function applyEditorMode() {
  const isTex = /\.tex$/i.test(state.file || '');
  const want = prefs.editorMode === 'visual' && isTex;
  for (const b of $$('[data-mode]')) b.classList.toggle('active', b.dataset.mode === (want ? 'visual' : 'code'));
  $('[data-mode="visual"]').disabled = !isTex;
  $('#editor').hidden = want;
  if (want) {
    if (visual.visible) visual.reset();
    else visual.show();
  } else {
    visual.hide();
    setTimeout(() => cm.refresh(), 0);
  }
}

/* ───────────────────────── identity & presence ───────────────────────── */

/** Your display name for cursors and avatars (stored only in this browser). */
function myIdentity() {
  let id = localStorage.getItem('pw.id');
  if (!id) localStorage.setItem('pw.id', (id = uid() + uid()));
  const name = localStorage.getItem('pw.name') || (isOwner() ? 'Host' : 'Guest');
  return { name, color: state.collab.colorFor(id) };
}

const initials = (name) =>
  String(name || '?')
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');

function avatar(person, cls = '') {
  return `<span class="avatar ${cls}" style="--c:${person.color}" title="${esc(person.name)}${person.role === 'viewer' ? ' (viewing)' : ''}">${esc(initials(person.name))}</span>`;
}

function renderAccount() {
  const btn = $('#accountBtn');
  btn.hidden = false;
  btn.innerHTML = avatar(myIdentity());
}

function openAccountMenu() {
  const me = myIdentity();
  const pop = openPopover(
    $('#accountBtn'),
    `<div class="pop-title">${isOwner() ? `You host ${esc(state.me.workspace?.name || 'this workspace')}` : `Guest in ${esc(state.me.workspace?.name || 'this workspace')}`}</div>
     <div class="pop-item"><span class="grow"><span>${esc(me.name)}</span><span class="sub">Shown to collaborators</span></span></div>
     <div class="pop-sep"></div>
     <button class="pop-item" data-rename>${icon('pencil')}<span class="grow">Change your name</span></button>
     ${isOwner() ? `<button class="pop-item" data-setup>${icon('settings')}<span class="grow">Open the setup guide</span></button>` : `<button class="pop-item" data-join>${icon('link')}<span class="grow">Join with an invite code</span></button>`}
     ${ownAllowed() ? `<button class="pop-item" data-keys>${icon('sparkle')}<span class="grow">Your own AI</span></button>` : ''}
     ${isOwner() && state.me.local ? '' : `<div class="pop-sep"></div><button class="pop-item btn-danger" data-signout>${icon('logout')}<span class="grow">${isOwner() ? 'Sign out' : 'Leave this workspace'}</span></button>`}`,
  );
  const r = $('#accountBtn').getBoundingClientRect();
  pop.style.left = `${Math.max(10, r.right - pop.offsetWidth)}px`;
  pop.onclick = async (e) => {
    if (e.target.closest('[data-setup]')) {
      closePopover();
      await runSetup();
      return location.reload();
    }
    if (e.target.closest('[data-join]')) {
      closePopover();
      const code = await askText('Join with an invite code', { placeholder: 'XXXX-XXXX', okLabel: 'Join' });
      if (!code) return;
      try {
        const { project } = await api('/api/join', { method: 'POST', body: { code } });
        location.href = `/?project=${enc(project)}`;
      } catch (err) {
        toast(err.message, 'err', 5000);
      }
      return;
    }
    if (e.target.closest('[data-keys]')) {
      closePopover();
      return openModelPicker(viaOf(prefs.provider) !== 'host' ? prefs.provider : OWN + 'anthropic');
    }
    if (e.target.closest('[data-signout]')) {
      closePopover();
      if (!(await confirmBox(isOwner() ? 'Sign out?' : 'Leave this workspace?', isOwner() ? 'You can sign in again with your host password.' : 'You’ll need an invite again to come back.', isOwner() ? 'Sign out' : 'Leave'))) return;
      await api('/api/logout', { method: 'POST' });
      return location.replace('/');
    }
    if (!e.target.closest('[data-rename]')) return;
    closePopover();
    const name = await askText('Your name', { value: me.name, placeholder: 'How collaborators see you', okLabel: 'Save' });
    if (!name) return;
    localStorage.setItem('pw.name', name.slice(0, 40));
    renderAccount();
    state.ws?.awareness.setLocalStateField('user', { ...myIdentity(), role: state.role });
  };
}

function renderPresence() {
  const others = state.people.filter((p) => !p.me);
  const shown = others.slice(0, 4);
  $('#presence').innerHTML = shown.map((p) => avatar(p, 'small')).join('') + (others.length > 4 ? `<span class="avatar small more">+${others.length - 4}</span>` : '');
}

function renderSyncStatus() {
  const ws = state.ws;
  if (!ws) return;
  if (!ws.canEdit) setSaveStatus('viewonly');
  else if (!ws.connected) setSaveStatus('offline');
  else setSaveStatus(ws.saveState === 'saving' ? 'saving' : 'saved');
}

/** Guests only get AI when the owner switched it on for their link. */
function renderChatAccess() {
  const locked = !isOwner() && !state.ai && !ownAllowed();
  $('#composer').classList.toggle('locked', locked);
  $('#prompt').disabled = locked;
  $('#prompt').placeholder = locked ? 'The host hasn’t shared AI with your invite.' : 'Ask your co-author to write or edit…';
  $('#clearChatBtn').hidden = !isOwner();
  $('#modelBtn').disabled = locked;
}

/* ───────────────────────── welcome (join) screen & setup guide ───────────────────────── */

/** The front door for anyone who isn't the host yet: enter an invite code, or sign in as the host. */
function showWelcome(reason) {
  const el = $('#authScreen');
  el.hidden = false;
  const ws = state.me?.workspace || { name: 'PaperWriter', hostSignIn: false };
  el.innerHTML = `
    <div class="welcome">
      <div class="welcome-copy">
        <div class="welcome-brand"><img src="/logo.svg" alt="" width="36" height="36" /><span>${esc(ws.name)}</span></div>
        <h1 class="display">Write <em>together.</em></h1>
        <p class="lede">Enter the invite code you were sent to open the paper shared with you.</p>
        <form class="code-form" id="codeForm" autocomplete="off">
          <input class="code-input" id="codeInput" autocapitalize="characters" spellcheck="false" maxlength="9" placeholder="XXXX-XXXX" aria-label="Invite code" />
          <button class="btn-primary pill" type="submit"><span>Join</span>${icon('arrow')}</button>
        </form>
        <p class="form-msg ${reason === 'invalid' ? 'err' : ''}" id="codeMsg" role="status">${
          reason === 'invalid' ? 'That invite link doesn’t work any more. It may have expired or been revoked. Ask for a new one, or enter its code.' : 'Codes look like K7QF-3MXA. Opening an invite link works too.'
        }</p>
        <div class="host-entry">
          ${
            ws.hostSignIn
              ? `<button class="link-btn" id="hostBtn" type="button">Hosting this workspace? Sign in</button>
                 <form class="host-form" id="hostForm" hidden>
                   <input class="input" type="password" name="password" placeholder="Host password" autocomplete="current-password" aria-label="Host password" />
                   <button class="btn-ghost" type="submit">Sign in</button>
                 </form>`
              : `<p class="note">Hosting this workspace? Open it on the computer where it runs, or use the host link it printed when it started.</p>`
          }
        </div>
      </div>
      <div class="welcome-art" aria-hidden="true">
        <div class="sheet">
          <div class="sheet-title">A Short Proof of the Spectral Gap</div>
          <div class="sheet-authors">M. Okafor &nbsp;·&nbsp; J. Lindqvist</div>
          <p class="sheet-abstract"><b>Abstract.</b> We show that the spectral gap of the random walk on the slice is at least <i>c/n</i>, where <span class="peer-sel" style="--c:#0a84ff">the constant <i>c</i> does not depend on <i>n</i></span><span class="peer-caret" style="--c:#0a84ff" data-name="Maya"></span>.</p>
          <p class="sheet-h">1&ensp;Introduction</p>
          <p>Mixing times of Markov chains have been studied for decades. Here we give a short proof using a coupling<span class="peer-caret late" style="--c:#ff9f0a" data-name="Jon"></span> argument, and</p>
          <div class="sheet-lines"><span></span><span></span><span></span><span></span><span></span><span></span></div>
        </div>
      </div>
    </div>`;
  hydrateIcons(el);
  const input = $('#codeInput', el);
  const msg = $('#codeMsg', el);
  input.focus();
  input.addEventListener('input', () => {
    const raw = input.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
    input.value = raw.length > 4 ? `${raw.slice(0, 4)}-${raw.slice(4)}` : raw;
    msg.classList.remove('err');
  });
  $('#codeForm', el).addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('button', e.target);
    if (input.value.replace(/-/g, '').length !== 8) {
      msg.textContent = 'An invite code has 8 letters and numbers.';
      msg.classList.add('err');
      return input.focus();
    }
    btn.disabled = true;
    try {
      const { project } = await api('/api/join', { method: 'POST', body: { code: input.value } });
      location.href = `/?project=${enc(project)}`;
    } catch (err) {
      msg.textContent = err.message;
      msg.classList.add('err');
      btn.disabled = false;
    }
  });
  $('#hostBtn', el)?.addEventListener('click', (e) => {
    e.currentTarget.hidden = true;
    $('#hostForm', el).hidden = false;
    $('#hostForm input', el).focus();
  });
  $('#hostForm', el)?.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await api('/api/login', { method: 'POST', body: { password: e.target.password.value } });
      location.replace('/');
    } catch (err) {
      msg.textContent = err.message;
      msg.classList.add('err');
    }
  });
}

/**
 * The first-run guide for the host: workspace name, who can join, AI, and the LaTeX engine.
 * Every step saves as you go and can be skipped; it all lives in Settings and Share afterwards.
 */
async function runSetup() {
  const el = $('#authScreen');
  el.hidden = false;
  el.innerHTML = '<span class="spinner" aria-label="Loading"></span>';
  let [st, net] = await Promise.all([api('/api/status'), api('/api/network')]);
  const s = st.settings;
  const local = !!state.me.local;
  const reaches = [
    ...(local && !net.lanLocked ? [['local', 'lock', 'Just me, for now', 'PaperWriter stays private to this computer. You can open it up any time from Share.']] : []),
    ...(!net.lanLocked ? [['network', 'users', 'People on my network', 'Colleagues on the same Wi-Fi or office network join with an invite.']] : []),
    ['internet', 'globe', 'Anyone, from anywhere', 'A free, encrypted Cloudflare link. No account or router setup. The address changes each time PaperWriter starts.'],
    ['server', 'link', 'This is a server with a domain', 'Collaborators use your own address, like papers.example.org. Serve it over HTTPS (the included docker-compose does this).'],
  ];
  const draft = {
    workspaceName: s.workspaceName || '',
    name: localStorage.getItem('pw.name') || '',
    reach: s.publicUrl ? 'server' : net.tunnel.running ? 'internet' : net.lan ? 'network' : reaches[0][0],
    publicUrl: s.publicUrl || '',
    password: '',
    aiProvider: 'anthropic',
    guestKeys: s.guestKeys !== false,
    defaultLinkAI: !!s.defaultLinkAI,
    allowOnline: !!s.allowOnline,
  };
  const steps = ['Workspace', 'Sharing', 'AI', 'LaTeX'];
  let i = 0;
  let installing = null;
  const save = (body) => api('/api/settings', { method: 'POST', body });
  const needsPassword = () => !s.hasHostPassword && (!local || draft.reach === 'server');

  const engines = () => Object.entries(st.engines || {}).filter(([, v]) => v).map(([k]) => k);
  const views = [
    () => `
      <h1 class="display-sm">Welcome to PaperWriter.</h1>
      <p class="lede">A few choices and you’re writing. Everything here can be changed later.</p>
      <label class="field"><span>Workspace name</span><input class="input lg" name="workspaceName" value="${esc(draft.workspaceName)}" placeholder="e.g. Chen Lab, or Thesis 2026" maxlength="60" /><small>Collaborators see this when they join.</small></label>
      <label class="field"><span>Your name</span><input class="input lg" name="name" value="${esc(draft.name)}" placeholder="Shown next to your cursor" maxlength="40" /></label>`,
    () => `
      <h1 class="display-sm">Who will write with you?</h1>
      <p class="lede">Everyone you invite gets a link and a short code. Nobody gets in without one.</p>
      <div class="choices" role="radiogroup">
        ${reaches
          .map(
            ([id, ic, title, sub]) => `<label class="choice ${draft.reach === id ? 'on' : ''}"><input type="radio" name="reach" value="${id}" ${draft.reach === id ? 'checked' : ''} />
              <span class="choice-icon">${icon(ic)}</span><span class="grow"><b>${title}</b><small>${sub}</small></span><span class="radio"></span></label>`,
          )
          .join('')}
      </div>
      ${
        draft.reach === 'server'
          ? `<label class="field"><span>Public address</span><input class="input lg" name="publicUrl" value="${esc(s.publicUrl || draft.publicUrl)}" placeholder="https://papers.example.org" ${s.publicUrlFromEnv ? 'disabled' : ''} />
             <small>${s.publicUrlFromEnv ? 'Set by the DOMAIN or PUBLIC_URL setting on the server.' : 'The address people type to reach this PaperWriter.'}</small></label>`
          : ''
      }
      ${
        draft.reach !== 'local'
          ? `<label class="field"><span>Host password ${needsPassword() ? '' : '<em>optional</em>'}</span><input class="input lg" type="password" name="password" autocomplete="new-password" placeholder="${s.hasHostPassword ? 'Leave empty to keep your current password' : 'At least 8 characters'}" />
             <small>Lets you sign in as the host from any device.</small></label>`
          : ''
      }`,
    () => {
      const found = Object.values(st.providers || {}).filter((p) => p.available);
      const keyFor = (id) => s.keyStatus[id]?.set;
      return `
      <h1 class="display-sm">Choose your co-author.</h1>
      <p class="lede">PaperWriter works with the AI you already have. Add one now, or skip and decide later.</p>
      ${
        found.length
          ? `<ul class="found">${found.map((p) => `<li>${icon('check')}<span class="grow"><b>${esc(p.label)}</b><small>${esc(p.detail)}</small></span></li>`).join('')}</ul>`
          : '<p class="note">No AI found on this computer yet. Paste a key below to use one.</p>'
      }
      <div class="field"><span>Add an API key</span>
        <div class="seg pills" role="tablist">${[['anthropic', 'Claude'], ['openai', 'ChatGPT'], ['gemini', 'Gemini'], ['openrouter', 'OpenRouter']]
          .map(([id, label]) => `<button type="button" class="seg-btn ${draft.aiProvider === id ? 'active' : ''}" data-ai="${id}">${label}${keyFor(id) ? ' ✓' : ''}</button>`)
          .join('')}</div>
        <input class="input lg mono" type="password" name="aiKey" autocomplete="off" placeholder="${keyFor(draft.aiProvider) ? 'Key saved. Paste a new one to replace it' : 'Paste your key'}" />
        <small>Saved only on this server, never sent to anyone’s browser.</small>
      </div>
      <div class="setting-card">
        <div class="setting-row"><span class="label"><b>Collaborators can use their own AI</b><small>Their keys, Claude Code or local models stay on their own computer and pay for their own chats.</small></span><label class="toggle"><input type="checkbox" name="guestKeys" ${draft.guestKeys ? 'checked' : ''} /><span class="track"></span></label></div>
        <div class="setting-row"><span class="label"><b>New invites can use my AI</b><small>Their chats then use your keys or subscription, and its cost. You can change it per invite.</small></span><label class="toggle"><input type="checkbox" name="defaultLinkAI" ${draft.defaultLinkAI ? 'checked' : ''} /><span class="track"></span></label></div>
      </div>`;
    },
    () => {
      const have = engines();
      return `
      <h1 class="display-sm">Set up typesetting.</h1>
      <p class="lede">PaperWriter turns your LaTeX into a PDF as you type.</p>
      ${
        have.length
          ? `<div class="status-line ok">${icon('check')}<span>Ready. Found ${have.map(esc).join(', ')}.</span></div>`
          : installing === 'failed'
            ? `<div class="status-line err">${icon('alert')}<span>Tectonic couldn’t be installed. Check the internet connection and try again, or compile online.</span></div>
               <button class="btn-ghost" type="button" data-install>Try again</button>`
            : `<div class="status-line">${installing ? '<span class="spinner"></span>' : icon('download')}<span>${installing ? 'Installing Tectonic, a small self-contained LaTeX engine (about 30 MB)…' : 'Preparing to install Tectonic…'}</span></div>`
      }
      <div class="setting-card">
        <div class="setting-row"><span class="label"><b>Compile online when no engine is installed</b><small>Sends the project’s text files to texlive.net.</small></span><label class="toggle"><input type="checkbox" name="allowOnline" ${draft.allowOnline ? 'checked' : ''} /><span class="track"></span></label></div>
      </div>`;
    },
    () => `
      <div class="done-mark">${icon('check')}</div>
      <h1 class="display-sm">You’re all set.</h1>
      <p class="lede">Open a paper and press <b>Share</b> to invite people. Each invite has a link and a short code they can type.</p>`,
  ];

  // Read the inputs on the current step into the draft.
  const collect = () => {
    for (const inp of $$('.setup-stage [name]', el)) {
      if (inp.type === 'radio') {
        if (inp.checked) draft[inp.name] = inp.value;
      } else if (inp.type === 'checkbox') draft[inp.name] = inp.checked;
      else if (!inp.disabled) draft[inp.name] = inp.value.trim();
    }
  };

  const apply = async () => {
    collect();
    if (i === 0) {
      if (draft.name) localStorage.setItem('pw.name', draft.name.slice(0, 40));
      await save({ workspaceName: draft.workspaceName });
      state.me.workspace = { ...state.me.workspace, name: draft.workspaceName || 'PaperWriter' };
    } else if (i === 1) {
      if (needsPassword() && !draft.password) throw new Error('Choose a host password so you can sign in again from anywhere.');
      const body = {};
      if (draft.password) body.hostPassword = draft.password;
      if (!s.publicUrlFromEnv) body.publicUrl = draft.reach === 'server' ? draft.publicUrl : '';
      if (draft.reach === 'server' && !s.publicUrlFromEnv && !draft.publicUrl) throw new Error('Enter the address people will use, like https://papers.example.org');
      const r = await save(body);
      Object.assign(s, r.settings);
      if (!net.lanLocked && net.lan !== (draft.reach === 'network')) net = await api('/api/network', { method: 'POST', body: { lan: draft.reach === 'network' } });
      if (draft.reach === 'internet' && !net.tunnel.running) {
        if (!net.cloudflared) net = await api('/api/tunnel/install', { method: 'POST' });
        net = await api('/api/tunnel/start', { method: 'POST' });
      }
    } else if (i === 2) {
      const body = { guestKeys: draft.guestKeys, defaultLinkAI: draft.defaultLinkAI };
      if (draft.aiKey) body.keys = { [draft.aiProvider]: draft.aiKey };
      const r = await save(body);
      Object.assign(s, r.settings);
    } else if (i === 3) {
      await save({ allowOnline: draft.allowOnline });
    }
  };

  let render = () => {};
  let shownStep = -1; // the entrance animation plays only when the step changes
  const installTectonicNow = async () => {
    installing = true;
    render();
    try {
      await api('/api/tectonic/install', { method: 'POST' });
      st = await api('/api/status');
      installing = null;
    } catch {
      installing = 'failed';
    }
    if (i === 3) render();
  };

  return new Promise((resolve) => {
    const finish = async () => {
      try {
        await save({ setupDone: true });
      } catch {}
      state.me.setupDone = true;
      el.onclick = el.onchange = el.onsubmit = null;
      el.innerHTML = '<span class="spinner" aria-label="Loading"></span>';
      resolve();
    };
    render = () => {
      const last = i === views.length - 1;
      el.innerHTML = `
        <div class="setup">
          <header class="setup-top">
            <div class="welcome-brand"><img src="/logo.svg" alt="" width="28" height="28" /><span>PaperWriter</span></div>
            <ol class="setup-steps" aria-label="Setup steps">${steps.map((n, k) => `<li class="${k < i ? 'done' : k === i ? 'current' : ''}" ${k === i ? 'aria-current="step"' : ''}>${n}</li>`).join('')}</ol>
            ${last ? '' : '<button class="link-btn" type="button" data-skip>Skip setup</button>'}
          </header>
          <form class="setup-stage ${shownStep !== i ? 'enter' : ''}" novalidate>${views[i]()}</form>
          <footer class="setup-foot">
            ${i > 0 && !last ? '<button class="btn-ghost pill" type="button" data-back>Back</button>' : ''}
            <span class="spacer"></span>
            <button class="btn-primary pill lg" type="button" data-next>${last ? 'Start writing' : 'Continue'}${icon('arrow')}</button>
          </footer>
        </div>`;
      hydrateIcons(el);
      const stepChanged = shownStep !== i;
      shownStep = i;
      if (stepChanged) $('.setup-stage input:not([type=radio]):not([type=checkbox]):not([disabled])', el)?.focus();
      else $(`.setup-stage [name="${document.activeElement?.name || ''}"]:checked`, el)?.focus();
    };
    el.onchange = (e) => {
      if (e.target.name === 'reach') {
        collect();
        render();
      }
    };
    el.onsubmit = (e) => {
      e.preventDefault();
      $('[data-next]', el)?.click();
    };
    el.onclick = async (e) => {
      const ai = e.target.closest('[data-ai]');
      if (ai) {
        collect();
        draft.aiProvider = ai.dataset.ai;
        return render();
      }
      if (e.target.closest('[data-install]')) return installTectonicNow();
      if (e.target.closest('[data-skip]')) return finish();
      if (e.target.closest('[data-back]')) {
        collect();
        i--;
        return render();
      }
      const next = e.target.closest('[data-next]');
      if (!next) return;
      if (i === views.length - 1) return finish();
      next.disabled = true;
      next.innerHTML = `<span class="spinner"></span><span>${i === 1 && draft.reach === 'internet' && !net.tunnel.running ? 'Starting your secure link…' : 'Saving…'}</span>`;
      try {
        await apply();
        i++;
        render();
        if (i === 3 && !engines().length && !installing) installTectonicNow();
      } catch (err) {
        toast(err.message, 'err', 6000);
        render();
      }
    };
    render();
  });
}

async function askNameOnce() {
  if (localStorage.getItem('pw.name')) return;
  const name = await askText('What’s your name?', { placeholder: 'Shown to the people you write with', okLabel: 'Continue' });
  localStorage.setItem('pw.name', (name || 'Guest').slice(0, 40));
}

/* ───────────────────────── sharing (owner) ───────────────────────── */

async function openShare() {
  if (!isOwner()) {
    const people = state.people.map((p) => `<li>${avatar(p)}<span class="grow"><b>${esc(p.name)}${p.me ? ' (you)' : ''}</b><small>${p.role === 'viewer' ? 'Viewing' : p.role === 'owner' ? 'Host' : 'Editing'}</small></span></li>`).join('');
    openModal(`<div class="modal-head">${icon('users')}<h2>People here now</h2><button class="icon-btn" data-close>${icon('x')}</button></div>
      <div class="modal-body share"><ul class="member-list">${people}</ul><p class="note">Only the host can create or change invites.</p></div>`);
    return;
  }
  const pid = state.project;
  let [{ shares }, net] = await Promise.all([api(`/api/projects/${P()}/shares`), api('/api/network')]);
  const defaultAI = !!state.status?.settings?.defaultLinkAI;

  const { el } = openModal(`
    <div class="modal-head">${icon('users')}<h2>Share “${esc(pid)}”</h2><button class="icon-btn" data-close>${icon('x')}</button></div>
    <div class="modal-body share">
      <h3 class="share-h">Invites</h3>
      <ul class="link-list" id="linkList"></ul>
      <form class="invite-row" id="newLink">
        <select class="input" name="role"><option value="editor">Can edit</option><option value="viewer">Can view</option></select>
        <select class="input" name="expires" title="When the invite stops working"><option value="never">Never expires</option><option value="1d">Expires in 1 day</option><option value="7d">Expires in 7 days</option><option value="30d">Expires in 30 days</option></select>
        <label class="toggle" title="Lets them chat with your AI models (your subscription or API keys, and their cost)"><input type="checkbox" name="ai" ${defaultAI ? 'checked' : ''} /><span class="track"></span><span>Can use my AI</span></label>
        <button class="btn-primary" type="submit">${icon('link')}<span>Create invite</span></button>
      </form>
      <p class="note">Each invite has a link and a short code. People can open the link, or enter the code at <b id="joinAt"></b>.${state.status?.settings?.guestKeys ? ' Anyone you invite can also chat using their own AI key.' : ''}</p>

      <h3 class="share-h">Where people can join from</h3>
      <div id="reach"></div>

      <h3 class="share-h">People here now</h3>
      <ul class="member-list" id="hereNow"></ul>

      <p class="note">Files, your AI keys and chats stay with this PaperWriter. An invite only opens this one project.
      People with an <b>edit</b> invite change files that compile here; PaperWriter blocks LaTeX from reading anything outside the project, but only give edit invites to people you trust. Revoking an invite disconnects them immediately.</p>
    </div>`);

  const base = () => net.tunnel.url || net.publicUrl || net.addresses[0] || location.origin;
  const inviteText = (s) => `Join “${pid}” on PaperWriter: ${base()}/j/${s.code}\nOr enter the code ${s.code} at ${base()}`;
  const expiry = (s) => (!s.expires ? '' : s.expires < Date.now() ? ' · expired' : ` · expires ${new Date(s.expires).toLocaleDateString()}`);
  const renderLinks = () => {
    $('#joinAt', el).textContent = base().replace(/^https?:\/\//, '');
    $('#linkList', el).innerHTML = shares.length
      ? shares
          .map(
            (s) => `<li data-token="${esc(s.token)}" class="${s.expires && s.expires < Date.now() ? 'expired' : ''}">
              <span class="access-icon">${icon(s.role === 'editor' ? 'pencil' : 'eye')}</span>
              <span class="grow"><button class="invite-code" data-act="code" title="Copy code">${esc(s.code || '')}</button>
                <small>Created ${new Date(s.created).toLocaleDateString()}${expiry(s)}${s.ai ? ' · can use your AI' : ''}</small></span>
              <select class="input role-select" data-act="role"><option value="viewer" ${s.role === 'viewer' ? 'selected' : ''}>Can view</option><option value="editor" ${s.role === 'editor' ? 'selected' : ''}>Can edit</option></select>
              <label class="toggle" title="Can use my AI"><input type="checkbox" data-act="ai" ${s.ai ? 'checked' : ''} /><span class="track"></span><span>AI</span></label>
              <button class="btn-ghost small" data-act="copy">${icon('copy')}<span>Copy invite</span></button>
              <button class="icon-btn small btn-danger" data-act="revoke" title="Revoke this link">${icon('trash')}</button>
            </li>`,
          )
          .join('')
      : '<li class="empty">No invites yet. Create one below.</li>';
    hydrateIcons(el);
  };
  const renderReach = () => {
    const local = !net.lan && !net.tunnel.running && !net.publicUrl;
    if (net.publicUrl) {
      $('#reach', el).innerHTML = `<div class="setting-card"><div class="setting-row">${icon('globe')}<span class="label"><b>Online at ${esc(net.publicUrl.replace(/^https?:\/\//, ''))}</b><small>Anyone with an invite can join from anywhere. Change the address in the setup guide.</small></span><span class="badge-pill ok">Live</span></div></div>`;
      return hydrateIcons(el);
    }
    $('#reach', el).innerHTML = `
      ${local ? `<p class="warn-line">${icon('lock')}Right now only this computer can open PaperWriter, so links won’t work for anyone else yet.</p>` : ''}
      <div class="setting-card">
        <div class="setting-row"><span class="label"><b>Devices on my Wi-Fi / network</b><small>${net.lan ? `Others on your network use ${net.addresses.map(esc).join(' or ') || 'this computer’s address'}` : 'Off. Turn on so people on the same network can open your links.'}${net.lanLocked ? ' (set by the HOST variable)' : ''}</small></span>
          <label class="toggle"><input type="checkbox" id="lanToggle" ${net.lan ? 'checked' : ''} ${net.lanLocked ? 'disabled' : ''} /><span class="track"></span></label></div>
      </div>
      <div class="setting-card">
        <div class="setting-row"><span class="label"><b>Anywhere on the internet</b><small>${
          net.tunnel.running
            ? `Public address: <code>${esc(net.tunnel.url)}</code>. It changes each time you start it.`
            : net.cloudflared
              ? 'Uses a free, encrypted Cloudflare Tunnel. No account or router setup needed.'
              : 'Needs cloudflared (free, about 30 MB, from github.com/cloudflare/cloudflared).'
        }</small></span>
          ${
            net.tunnel.running
              ? `<button class="btn-ghost" id="tunnelStop">Stop</button>`
              : net.cloudflared
                ? `<button class="btn-primary" id="tunnelStart">${icon('globe')}<span>Start</span></button>`
                : `<button class="btn-ghost" id="tunnelInstall">${icon('download')}<span>Install</span></button>`
          }</div>
      </div>`;
    hydrateIcons(el);
    $('#lanToggle', el)?.addEventListener('change', async (e) => {
      try {
        net = await api('/api/network', { method: 'POST', body: { lan: e.target.checked } });
        if (net.lan) toast('Devices on your network can now open your links. Windows may ask to allow Node.js through the firewall.', 'ok', 6000);
      } catch (err) {
        toast(err.message, 'err');
      }
      renderReach();
      renderLinks();
    });
    const busy = (btn, label) => {
      btn.disabled = true;
      btn.innerHTML = `<span class="spinner"></span><span>${label}</span>`;
    };
    $('#tunnelStart', el)?.addEventListener('click', async (e) => {
      busy(e.currentTarget, 'Starting…');
      try {
        net = await api('/api/tunnel/start', { method: 'POST' });
        toast('Your links now work from anywhere', 'ok');
      } catch (err) {
        toast(err.message, 'err');
      }
      renderReach();
      renderLinks();
    });
    $('#tunnelStop', el)?.addEventListener('click', async () => {
      net = await api('/api/tunnel/stop', { method: 'POST' });
      renderReach();
      renderLinks();
    });
    $('#tunnelInstall', el)?.addEventListener('click', async (e) => {
      busy(e.currentTarget, 'Downloading…');
      try {
        net = await api('/api/tunnel/install', { method: 'POST' });
        toast('cloudflared installed', 'ok');
      } catch (err) {
        toast(`Install failed: ${err.message}`, 'err');
      }
      renderReach();
    });
  };
  const renderHere = () => {
    $('#hereNow', el).innerHTML =
      state.people.map((p) => `<li>${avatar(p)}<span class="grow"><b>${esc(p.name)}${p.me ? ' (you)' : ''}</b><small>${p.role === 'viewer' ? 'Viewing' : p.role === 'owner' ? 'Host' : 'Editing'}</small></span></li>`).join('') ||
      '<li class="empty">Just you.</li>';
  };
  renderLinks();
  renderReach();
  renderHere();

  $('#newLink', el).addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      const s = await api(`/api/projects/${P()}/shares`, { method: 'POST', body: { role: fd.get('role'), ai: fd.get('ai') === 'on', expires: fd.get('expires') } });
      shares.push(s);
      renderLinks();
      await navigator.clipboard.writeText(inviteText(s)).catch(() => {});
      toast(`Invite ${s.code} created and copied`, 'ok');
    } catch (err) {
      toast(err.message, 'err');
    }
  });
  $('#linkList', el).addEventListener('click', async (e) => {
    const li = e.target.closest('[data-token]');
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (!li || !act) return;
    const token = li.dataset.token;
    const share = shares.find((s) => s.token === token);
    if (act === 'copy') {
      await navigator.clipboard.writeText(inviteText(share)).catch(() => {});
      toast('Invite copied: link and code', 'ok');
    } else if (act === 'code') {
      await navigator.clipboard.writeText(share.code).catch(() => {});
      toast(`Code ${share.code} copied`, 'ok');
    } else if (act === 'revoke') {
      await api(`/api/projects/${P()}/shares/${enc(token)}`, { method: 'DELETE' });
      shares = shares.filter((s) => s.token !== token);
      renderLinks();
      toast('Invite revoked. Anyone using it was disconnected.', 'ok');
    }
  });
  $('#linkList', el).addEventListener('change', async (e) => {
    const li = e.target.closest('[data-token]');
    const act = e.target.dataset.act;
    if (!li || !act) return;
    const body = act === 'role' ? { role: e.target.value } : { ai: e.target.checked };
    try {
      const s = await api(`/api/projects/${P()}/shares/${enc(li.dataset.token)}`, { method: 'PATCH', body });
      shares = shares.map((x) => (x.token === s.token ? s : x));
      renderLinks();
    } catch (err) {
      toast(err.message, 'err');
    }
  });
}

boot();

/* ───────────────────────── version history ───────────────────────── */

/** Line diff of two whole files: unchanged start and end are skipped, so big files stay fast. */
function fileDiff(a, b, ctx = 3) {
  const A = (a ?? '').split('\n');
  const B = (b ?? '').split('\n');
  let pre = 0;
  while (pre < A.length && pre < B.length && A[pre] === B[pre]) pre++;
  let suf = 0;
  while (suf < A.length - pre && suf < B.length - pre && A[A.length - 1 - suf] === B[B.length - 1 - suf]) suf++;
  if (pre === A.length && pre === B.length) return [];
  const out = [];
  if (pre > ctx) out.push({ t: '⋯', k: 'gap' });
  for (let i = Math.max(0, pre - ctx); i < pre; i++) out.push({ t: A[i], k: 'ctx' });
  out.push(...lineDiff(A.slice(pre, A.length - suf).join('\n'), B.slice(pre, B.length - suf).join('\n'), ctx));
  for (let i = 0; i < Math.min(ctx, suf); i++) out.push({ t: B[B.length - suf + i], k: 'ctx' });
  if (suf > ctx) out.push({ t: '⋯', k: 'gap' });
  return out;
}

const dayLabel = (t) => {
  const d = new Date(t);
  const today = new Date();
  const y = new Date(today);
  y.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === y.toDateString()) return 'Yesterday';
  return d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric' });
};
const timeLabel = (t) => new Date(t).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
const fullTime = (t) => `${dayLabel(t)}, ${timeLabel(t)}`;
const byLabel = (v) => (v.by?.length ? v.by.join(', ') : v.first ? 'Starting point' : 'Saved automatically');

/** Who changed what, and when. Pick a version to see its changes; editors can restore it. */
async function openHistory() {
  if (!state.ws) return;
  let versions = (await api(`/api/projects/${P()}/history`)).versions;
  let sel = versions[0];
  let file = null;
  let mode = 'changes'; // or 'now': this version compared with the current files
  const { el, close } = openModal(`
    <div class="modal-head">${icon('history')}<h2>Version history</h2>
      ${canEdit() ? `<button class="btn-ghost small" id="nameVersion">${icon('star')}<span>Name this moment</span></button>` : ''}
      <button class="icon-btn" data-close>${icon('x')}</button></div>
    <div class="history">
      <nav class="version-list" id="versionList" aria-label="Versions"></nav>
      <section class="version-view" id="versionView"></section>
    </div>`);
  el.classList.add('wide');

  const renderList = () => {
    let day = '';
    $('#versionList', el).innerHTML = versions.length
      ? versions
          .map((v) => {
            const d = dayLabel(v.at);
            const head = d !== day ? `<div class="v-day">${esc((day = d))}</div>` : '';
            const files = v.changed.map((c) => c.path);
            return `${head}<button class="v-item ${v.id === sel?.id ? 'active' : ''}" data-v="${esc(v.id)}">
              <span class="v-time">${timeLabel(v.at)}</span>
              ${v.label ? `<span class="v-label">${esc(v.label)}</span>` : ''}
              <span class="v-by">${esc(byLabel(v))}</span>
              <span class="v-files">${esc(files.slice(0, 3).join(', '))}${files.length > 3 ? ` +${files.length - 3}` : ''}</span>
            </button>`;
          })
          .join('')
      : '<p class="note">No versions yet. They’re saved automatically a minute after people stop typing.</p>';
  };

  const renderView = async () => {
    const view = $('#versionView', el);
    if (!sel) return (view.innerHTML = '');
    const changed = sel.changed.filter((c) => c.kind !== 'removed');
    const removed = sel.changed.filter((c) => c.kind === 'removed');
    const options = mode === 'now' || !changed.length ? [...new Set([...changed.map((c) => c.path), ...state.files.filter((f) => f.kind === 'text').map((f) => f.path)])] : changed.map((c) => c.path);
    if (!file || !options.includes(file)) file = options.includes(state.file) ? state.file : options[0];
    view.innerHTML = `
      <div class="vv-head">
        <div class="grow"><b>${esc(sel.label || fullTime(sel.at))}</b><small>${sel.label ? `${esc(fullTime(sel.at))} · ` : ''}${esc(byLabel(sel))}</small></div>
        ${canEdit() && sel !== versions[0] ? `<button class="btn-ghost small" data-restore-file ${file ? '' : 'disabled'}>Restore this file</button><button class="btn-primary" data-restore-all>Restore this version</button>` : ''}
      </div>
      <div class="vv-bar">
        <div class="seg pills" role="tablist">
          <button class="seg-btn ${mode === 'changes' ? 'active' : ''}" data-mode="changes">What changed</button>
          <button class="seg-btn ${mode === 'now' ? 'active' : ''}" data-mode="now">Compared with now</button>
        </div>
        <select class="input" id="vvFile" aria-label="File">${options.map((p) => `<option ${p === file ? 'selected' : ''}>${esc(p)}</option>`).join('')}</select>
      </div>
      ${removed.length && mode === 'changes' ? `<p class="note">Removed in this version: ${removed.map((c) => esc(c.path)).join(', ')}</p>` : ''}
      <div class="diff vv-diff" id="vvDiff"><div class="ctx"><span class="spinner"></span></div></div>`;
    hydrateIcons(view);
    if (!file) return ($('#vvDiff', view).innerHTML = '<div class="ctx">No text files in this version.</div>');
    const { text, prev } = await api(`/api/projects/${P()}/history/${enc(sel.id)}/file?path=${enc(file)}`);
    const now = state.ws?.text(file)?.toString() ?? null;
    const [from, to] = mode === 'now' ? [text, now] : [prev, text];
    let rows;
    if (mode === 'changes' && sel.first) rows = (text ?? '').split('\n').map((t) => ({ t, k: 'ctx' }));
    else rows = fileDiff(from ?? '', to ?? '');
    const note =
      mode === 'now' && text === null ? 'This file didn’t exist in this version.'
      : mode === 'now' && now === null ? 'This file has since been deleted. Restore it to bring it back.'
      : !rows.length ? (mode === 'now' ? 'This file is the same now as in this version.' : 'No changes to this file.')
      : '';
    $('#vvDiff', view).innerHTML = (note ? `<div class="ctx vv-note">${note}</div>` : '') + rows.map((o) => `<div class="${o.k}">${esc(o.t) || ' '}</div>`).join('');
    if (mode === 'now' && rows.length) $('#vvDiff', view).insertAdjacentHTML('afterbegin', '<div class="vv-legend"><span class="del">In this version</span><span class="add">Now</span></div>');
  };

  el.addEventListener('click', async (e) => {
    const item = e.target.closest('[data-v]');
    if (item) {
      sel = versions.find((v) => v.id === item.dataset.v);
      renderList();
      return renderView();
    }
    const m = e.target.closest('[data-mode]');
    if (m) {
      mode = m.dataset.mode;
      return renderView();
    }
    if (e.target.closest('#nameVersion')) {
      const label = await askText('Name this moment', { placeholder: 'e.g. Sent to supervisor', okLabel: 'Save version' });
      if (!label) return openHistory();
      await api(`/api/projects/${P()}/history`, { method: 'POST', body: { label, name: myIdentity().name } }).catch((err) => toast(err.message, 'err'));
      toast(`Saved “${label}”`, 'ok');
      return openHistory();
    }
    const all = e.target.closest('[data-restore-all]');
    const one = e.target.closest('[data-restore-file]');
    if (!all && !one) return;
    const what = one ? `“${file}”` : 'every file';
    if (!(await confirmBox(one ? 'Restore this file?' : 'Restore this version?', `${one ? 'The file' : 'Every file'} goes back to how it was on ${fullTime(sel.at)}. Today’s state is saved in the history first, so you can undo this.`, 'Restore'))) return openHistory();
    try {
      await api(`/api/projects/${P()}/history/${enc(sel.id)}/restore`, { method: 'POST', body: { path: one ? file : null, name: myIdentity().name } });
      toast(`Restored ${what}`, 'ok');
      if (prefs.autoCompile) scheduleCompile(200);
    } catch (err) {
      toast(err.message, 'err');
    }
    openHistory();
  });
  el.addEventListener('change', (e) => {
    if (e.target.id !== 'vvFile') return;
    file = e.target.value;
    renderView();
  });
  renderList();
  renderView().catch((e) => toast(e.message, 'err'));
  // Keep the list fresh while it's open (new versions appear as people write).
  const timer = setInterval(() => {
    if (!el.isConnected) return clearInterval(timer);
    api(`/api/projects/${P()}/history`)
      .then((r) => {
        if (r.versions[0]?.id === versions[0]?.id) return;
        versions = r.versions;
        renderList();
      })
      .catch(() => {});
  }, 15000);
  return close;
}
