import { markdown, parseReply, locate, lineDiff, esc } from './md.js';
import * as pdfjs from '/vendor/pdfjs/build/pdf.min.mjs';
import { VisualEditor } from './visual.js';

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
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
  globe: '<circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>',
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
  // cloud mode
  config: {},
  collab: null, // the cloud.js module
  cloud: null,
  ws: null, // open Workspace
  binding: null,
  role: 'owner',
  projects: [],
  people: [],
};

const userKeys = () => {
  try {
    return JSON.parse(localStorage.getItem('pw.userKeys') || '{}');
  } catch {
    return {};
  }
};

/** Signed-in user's token (cloud mode) and any API keys they saved in this browser. */
function authHeaders() {
  const h = {};
  const t = state.cloud?.token();
  if (t) h.Authorization = `Bearer ${t}`;
  const keys = userKeys();
  if (Object.keys(keys).length) h['x-pw-keys'] = btoa(JSON.stringify(keys));
  return h;
}

const canEdit = () => !state.ws || state.ws.canEdit;

const PROVIDER_ORDER = ['claude-cli', 'anthropic', 'openai', 'gemini', 'ollama', 'compat', 'gemini-cli', 'codex-cli'];
const PREFERRED_MODEL = { 'claude-cli': 'sonnet', anthropic: 'claude-sonnet-5-5', openai: 'gpt-5', gemini: 'gemini-2.5-pro', 'gemini-cli': 'default', 'codex-cli': 'default' };
const P = () => enc(state.project);

/* ───────────────────────── api helpers ───────────────────────── */

async function api(path, { method = 'GET', body, headers = {} } = {}) {
  const isRaw = typeof body === 'string' || body instanceof Blob || body instanceof ArrayBuffer;
  const res = await fetch(path, {
    method,
    headers: { ...authHeaders(), ...(body && !isRaw ? { 'content-type': 'application/json' } : {}), ...headers },
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

function askText(title, { value = '', placeholder = '', okLabel = 'OK', extra = '' } = {}) {
  return new Promise((resolve) => {
    let done = false;
    const { el, close } = openModal(
      `<div class="modal-head"><h2>${esc(title)}</h2><button class="icon-btn" data-close>${icon('x')}</button></div>
       <form class="modal-body"><input class="input" name="v" value="${esc(value)}" placeholder="${esc(placeholder)}" autocomplete="off" />${extra}</form>
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

let saveTimer = 0;
let compileTimer = 0;
let statsTimer = 0;

cm.on('changes', (_cm, changes) => {
  visual?.onDocChange();
  clearTimeout(statsTimer);
  statsTimer = setTimeout(updateStats, 300);
  if (changes.every((c) => c.origin === 'setValue')) return;
  if (state.ws) {
    // Cloud: Yjs syncs and saves; we only recompile.
    if (prefs.autoCompile) scheduleCompile(1500);
    return;
  }
  updateDirty();
  clearTimeout(saveTimer);
  const doc = cm.getDoc();
  saveTimer = setTimeout(async () => {
    try {
      await saveDoc(doc);
      if (prefs.autoCompile) scheduleCompile();
    } catch {}
  }, 900);
  clearTimeout(statsTimer);
  statsTimer = setTimeout(updateStats, 300);
});
cm.on('cursorActivity', () => {
  const c = cm.getCursor();
  $('#cursorPos').textContent = `Ln ${c.line + 1}, Col ${c.ch + 1}`;
  renderCtxChips();
});

function modeFor(path) {
  return /\.(tex|sty|cls|bib|ltx|dtx|bbx|cbx|def|tikz)$/i.test(path) ? 'stex' : 'text/plain';
}

function updateDirty() {
  if (state.ws) return;
  const doc = cm.getDoc();
  const dirty = doc.pwFile && !doc.isClean(doc.pwGen);
  $('#dirtyDot').classList.toggle('on', !!dirty);
  const anyDirty = [...state.docs.values()].some((d) => !d.isClean(d.pwGen));
  if (anyDirty) setSaveStatus('dirty');
}

function setSaveStatus(s) {
  const el = $('#saveStatus');
  el.dataset.state = s;
  const map = {
    saved: ['check', 'Saved'],
    dirty: ['pencil', 'Editing…'],
    saving: ['refresh', 'Saving…'],
    error: ['alert', 'Save failed'],
    offline: ['alert', 'Offline · saving locally'],
    connecting: ['refresh', 'Connecting…'],
    viewonly: ['eye', 'View only'],
  };
  const [ic, label] = map[s];
  el.innerHTML = `${icon(ic)}<span>${label}</span>`;
}

async function saveDoc(doc) {
  if (!doc?.pwFile || doc.isClean(doc.pwGen)) return;
  const gen = doc.changeGeneration();
  setSaveStatus('saving');
  try {
    await api(`/api/projects/${P()}/file?path=${enc(doc.pwFile)}`, {
      method: 'PUT',
      body: doc.getValue(),
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    });
    doc.pwGen = gen;
    const anyDirty = [...state.docs.values()].some((d) => !d.isClean(d.pwGen));
    setSaveStatus(anyDirty ? 'dirty' : 'saved');
    updateDirty();
  } catch (e) {
    setSaveStatus('error');
    toast(`Couldn't save ${doc.pwFile}: ${e.message}`, 'err');
    throw e;
  }
}

async function saveAll() {
  if (state.ws) return state.ws.flush();
  clearTimeout(saveTimer);
  for (const d of state.docs.values()) await saveDoc(d);
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
  if (!f) return;
  if (f.kind !== 'text') return previewAsset(f);
  if (state.ws) {
    // Cloud: bind the editor to this file's shared Y.Text (with live cursors and per-user undo).
    state.binding?.destroy();
    const doc = CodeMirror.Doc('', modeFor(path));
    doc.pwFile = path;
    cm.swapDoc(doc);
    state.file = path;
    state.binding = new state.collab.CodemirrorBinding(state.ws.text(path), cm, state.ws.awareness, { yUndoManager: state.ws.undoManager(path) });
    cm.setOption('readOnly', state.ws.canEdit ? false : true);
  } else {
    let doc = state.docs.get(path);
    if (!doc) {
      const { content } = await api(`/api/projects/${P()}/file?path=${enc(path)}`);
      doc = CodeMirror.Doc(content, modeFor(path));
      doc.pwFile = path;
      doc.pwGen = doc.changeGeneration();
      state.docs.set(path, doc);
    }
    state.file = path;
    cm.swapDoc(doc);
    cm.setOption('readOnly', false);
  }
  prefs.lastFiles[state.project] = path;
  savePrefs();
  $('#currentFileName').textContent = path;
  renderFiles();
  markErrors();
  updateDirty();
  updateStats();
  renderCtxChips();
  applyEditorMode();
}

async function previewAsset(f) {
  const url = state.ws ? await state.ws.fileUrl(f.path) : `/api/projects/${P()}/file?path=${enc(f.path)}&raw=1`;
  if (f.kind === 'image' && !/\.(pdf|eps)$/i.test(f.path)) {
    openModal(
      `<div class="modal-head">${icon('image')}<h2>${esc(f.path)}</h2><button class="icon-btn" data-close>${icon('x')}</button></div>
       <div class="modal-body" style="text-align:center"><img src="${url}" alt="" style="max-width:100%;border-radius:12px" />
       <p class="note">Use it with <code>\\includegraphics[width=\\linewidth]{${esc(f.path)}}</code></p></div>`,
    );
  } else window.open(url, '_blank');
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
  if (state.cloud) return loadCloudProject(name);
  if (state.project) await saveAll().catch(() => {});
  state.project = name;
  state.docs.clear();
  state.file = null;
  state.errors = [];
  state.warnings = [];
  state.lastResult = null;
  state.log = '';
  prefs.lastProject = name;
  savePrefs();
  $('#projectName').textContent = name;
  document.title = `${name} · PaperWriter`;
  loadChat();
  renderLog();
  await refreshFiles();
  const last = prefs.lastFiles[name];
  const target = state.files.some((f) => f.path === last) ? last : state.meta.main;
  if (state.files.some((f) => f.path === target)) await openFile(target);
  else {
    cm.swapDoc(CodeMirror.Doc('', 'stex'));
    cm.setOption('readOnly', 'nocursor');
  }
  clearPdf();
  const existing = loadPdf(`/api/projects/${P()}/pdf?t=${Date.now()}`, true);
  if (state.status && hasAnyEngine()) compile();
  else if (!(await existing)) showNoEngine();
}

async function refreshFiles() {
  if (state.ws) {
    state.files = state.ws.fileList();
    state.meta = { main: state.ws.main() };
    renderFiles();
    return;
  }
  const { files, meta } = await api(`/api/projects/${P()}/files`);
  state.files = files;
  state.meta = meta;
  renderFiles();
}

function fileIcon(f) {
  return f.kind === 'image' ? 'image' : /\.(tex|sty|cls)$/.test(f.path) ? 'file' : f.kind === 'text' ? 'code' : 'files';
}

function fmtSize(n) {
  return n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(1)} MB`;
}

function renderFiles() {
  const ul = $('#fileList');
  ul.innerHTML = state.files
    .map((f) => {
      const isMain = f.path === state.meta.main;
      return `<li class="file-item ${f.path === state.file ? 'active' : ''}" data-path="${esc(f.path)}">
        ${icon(fileIcon(f))}<span class="name">${esc(f.path)}</span>
        ${isMain ? `<span class="main-star" title="Main file (compiled)">${icon('star')}</span>` : ''}
        <span class="acts" ${canEdit() ? '' : 'hidden'}>
          ${!isMain && f.path.endsWith('.tex') ? `<button data-fact="main" title="Set as main file">${icon('starOutline')}</button>` : ''}
          <button data-fact="rename" title="Rename">${icon('pencil')}</button>
          <button data-fact="delete" title="Delete">${icon('trash')}</button>
        </span>
        <span class="size">${fmtSize(f.size)}</span>
      </li>`;
    })
    .join('');
}

$('#fileList').addEventListener('click', async (e) => {
  const li = e.target.closest('.file-item');
  if (!li) return;
  const path = li.dataset.path;
  const act = e.target.closest('[data-fact]')?.dataset.fact;
  try {
    if (act === 'main') {
      if (state.ws) state.ws.setMain(path);
      else await api(`/api/projects/${P()}/meta`, { method: 'POST', body: { main: path } });
      await refreshFiles();
      toast(`${path} is now the main file`, 'ok');
      compile();
    } else if (act === 'rename') {
      const to = await askText('Rename file', { value: path, okLabel: 'Rename' });
      if (!to || to === path) return;
      await saveAll();
      if (state.ws) {
        await state.ws.rename(path, to);
        await refreshFiles();
        if (state.file === path) await openFile(to);
        return;
      }
      await api(`/api/projects/${P()}/rename`, { method: 'POST', body: { from: path, to } });
      const doc = state.docs.get(path);
      if (doc) {
        state.docs.delete(path);
        doc.pwFile = to;
        state.docs.set(to, doc);
      }
      if (state.file === path) {
        state.file = to;
        $('#currentFileName').textContent = to;
      }
      await refreshFiles();
    } else if (act === 'delete') {
      if (!(await confirmBox('Delete file?', `"${path}" will be removed from this project.`))) return;
      if (state.ws) await state.ws.remove(path);
      else await api(`/api/projects/${P()}/file?path=${enc(path)}`, { method: 'DELETE' });
      state.docs.delete(path);
      await refreshFiles();
      if (state.file === path) {
        const next = state.files.find((f) => f.path === state.meta.main) || state.files.find((f) => f.kind === 'text');
        if (next) await openFile(next.path);
      }
    } else {
      await openFile(path);
      if (isMobile() && state.files.find((f) => f.path === path)?.kind === 'text') setView('editor');
    }
  } catch (err) {
    toast(err.message, 'err');
  }
});

async function newFile() {
  const name = await askText('New file', { placeholder: 'e.g. sections/intro.tex or refs.bib', okLabel: 'Create' });
  if (!name) return;
  try {
    const starter = name.endsWith('.tex') ? `% ${name}\n` : '';
    if (state.ws) state.ws.createText(name, starter);
    else await api(`/api/projects/${P()}/file?path=${enc(name)}`, { method: 'PUT', body: starter, headers: { 'content-type': 'text/plain' } });
    await refreshFiles();
    await openFile(name);
    if (isMobile()) setView('editor');
  } catch (e) {
    toast(e.message, 'err');
  }
}

async function uploadFiles(list) {
  for (const f of list) {
    try {
      if (state.ws) await state.ws.upload(f.name, f);
      else await api(`/api/projects/${P()}/file?path=${enc(f.name)}`, { method: 'PUT', body: await f.arrayBuffer(), headers: { 'content-type': 'application/octet-stream' } });
      toast(`Uploaded ${f.name}`, 'ok');
    } catch (e) {
      toast(`${f.name}: ${e.message}`, 'err');
    }
  }
  await refreshFiles();
}

async function openProjectMenu() {
  if (state.cloud) return openCloudProjectMenu();
  const { projects } = await api('/api/projects');
  const pop = openPopover(
    $('#projectBtn'),
    `<div class="pop-title">Projects</div>
     ${projects
       .map(
         (p) => `<button class="pop-item ${p.name === state.project ? 'active' : ''}" data-proj="${esc(p.name)}">
           ${icon('folder')}<span class="grow"><span>${esc(p.name)}</span><span class="sub">${new Date(p.modified).toLocaleDateString()}</span></span>
           ${p.name === state.project ? `<span class="check">${icon('check')}</span>` : ''}</button>`,
       )
       .join('')}
     <div class="pop-sep"></div>
     <button class="pop-item" data-pact="new">${icon('plus')}<span class="grow">New project…</span></button>
     <button class="pop-item btn-danger" data-pact="delete">${icon('trash')}<span class="grow">Delete “${esc(state.project)}”…</span></button>`,
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
        toast('Project created ✨', 'ok');
      } else if (item.dataset.pact === 'delete') {
        if (!(await confirmBox('Delete project?', `"${state.project}" and all its files will be permanently deleted.`))) return;
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

/* ───────────────────────── compile ───────────────────────── */

function hasAnyEngine() {
  if (state.config.hosted) return true;
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
    const r = state.ws ? await compileCloud() : await api(`/api/projects/${P()}/compile`, { method: 'POST', body: {} });
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
  const mine = userKeys();
  for (const id of ['anthropic', 'openai', 'gemini']) {
    const p = state.status.providers[id];
    if (p && mine[id]) Object.assign(p, { available: true, detail: 'Using your key (saved in this browser)' });
  }
  renderModelPill();
  renderLog();
}

function providerInfo(id) {
  return state.status?.providers?.[id];
}

async function ensureModelChoice() {
  const provs = state.status?.providers || {};
  if (prefs.provider && provs[prefs.provider] && prefs.model) return;
  const pick = PROVIDER_ORDER.find((p) => provs[p]?.available) || 'claude-cli';
  prefs.provider = pick;
  prefs.model = PREFERRED_MODEL[pick] || null;
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
  const { models } = await api(`/api/models?provider=${enc(provider)}`);
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
  const groups = [
    ['Logged-in CLI', ['claude-cli', 'gemini-cli', 'codex-cli']],
    ['Cloud API', ['anthropic', 'openai', 'gemini']],
    ['Local machine', ['ollama', 'compat']],
  ];
  const info = provs[selected];
  const html = `
    ${groups
      .map(
        ([title, ids]) => `<div class="pop-title">${title}</div><div class="provider-grid">
        ${ids
          .filter((id) => provs[id] && (provs[id].available || !id.endsWith('-cli') || id === 'claude-cli'))
          .map((id) => `<button class="prov ${id === selected ? 'active' : ''}" data-prov="${id}" title="${esc(provs[id].detail)}"><span class="dot ${provs[id].available ? 'on' : 'off'}"></span><span>${esc(provs[id].label)}</span></button>`)
          .join('')}</div>`,
      )
      .join('')}
    <div class="pop-sep"></div>
    <div class="prov-detail">${esc(info?.detail || '')}${info && !info.available ? ` · <a data-open-settings>Set up</a>` : ''}</div>
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
  const hosted = !!state.config.hosted;
  const mask = (k) => (k.length > 10 ? `${k.slice(0, 4)}…${k.slice(-4)}` : '••••');
  const keyCard = (id, title, link, placeholder) => {
    const k = s.keyStatus[id];
    const mine = userKeys()[id];
    const set = k.set || !!mine;
    const where = mine
      ? `Using your key ${esc(mask(mine))}, saved in this browser only`
      : k.set
        ? k.source === 'env'
          ? hosted ? 'Using the shared server key' : `Using env var ${esc(k.hint)}`
          : `Using saved key ${esc(k.hint)}`
        : `Get a key at <a href="${link}" target="_blank" rel="noopener">${link.replace(/^https:\/\//, '')}</a>`;
    const remove = mine ? `<button class="btn-ghost" data-clear-mine="${id}">Remove</button>` : !hosted && k.set && k.source === 'saved' ? `<button class="btn-ghost" data-clear="${id}">Remove</button>` : '';
    return `<div class="setting-card">
      <div class="setting-row"><span class="label"><b>${title}</b><small>${where}</small></span>${badge(set, 'Key set')}</div>
      <div class="key-row"><input class="input" type="password" data-key="${id}" placeholder="${set ? 'Paste a new key to replace' : placeholder}" autocomplete="off" />${remove}</div></div>`;
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
        ${hosted ? '<p class="note">Claude Code, Ollama and other local models work when you run PaperWriter on your own computer with <code>npm start</code>. On this hosted site, use an API key. Keys you paste here stay in this browser and are sent only with your own requests.</p>' : ''}
        ${hosted ? '' : cliCard('claude-cli', 'Install Claude Code with <code>npm i -g @anthropic-ai/claude-code</code>, then run <code>claude</code> in a terminal once and sign in. No API key needed — it uses your Claude subscription.')}
        ${keyCard('anthropic', 'Claude API (Anthropic)', 'https://console.anthropic.com/settings/keys', 'sk-ant-…')}
        ${keyCard('openai', 'ChatGPT API (OpenAI)', 'https://platform.openai.com/api-keys', 'sk-…')}
        ${keyCard('gemini', 'Gemini API (Google)', 'https://aistudio.google.com/apikey', 'AIza…')}
        <div class="setting-card" ${hosted ? 'hidden' : ''}>
          <div class="setting-row"><span class="label"><b>Ollama (local)</b><small>${esc(prov.ollama.detail)}</small></span>${badge(prov.ollama.available, 'Running', 'Offline')}</div>
          <div class="key-row"><input class="input" data-field="ollamaUrl" value="${esc(s.ollamaUrl)}" placeholder="http://127.0.0.1:11434" /></div>
        </div>
        <div class="setting-card" ${hosted ? 'hidden' : ''}>
          <div class="setting-row"><span class="label"><b>OpenAI-compatible server</b><small>LM Studio, llama.cpp, vLLM, OpenRouter… · ${esc(prov.compat.detail)}</small></span>${badge(prov.compat.available, 'Reachable', 'Offline')}</div>
          <div class="key-row"><input class="input" data-field="compatUrl" value="${esc(s.compatUrl)}" placeholder="http://127.0.0.1:1234/v1" /></div>
          <div class="key-row"><input class="input" type="password" data-key="compat" placeholder="${s.keyStatus.compat.set ? 'Key set — paste to replace' : 'API key (optional)'}" autocomplete="off" /></div>
        </div>
        ${prov['gemini-cli'].available ? cliCard('gemini-cli', '') : ''}
        ${prov['codex-cli'].available ? cliCard('codex-cli', '') : ''}
        <p class="note" ${hosted ? 'hidden' : ''}>Keys are stored only on this computer in <code>.data/settings.json</code> and never sent to the browser. Environment variables (<code>ANTHROPIC_API_KEY</code>, <code>OPENAI_API_KEY</code>, <code>GEMINI_API_KEY</code>) also work.</p>
      </div>

      <div class="modal-section" id="sec-compiler" ${hosted ? 'hidden' : ''}>
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
  el.addEventListener('click', async (e) => {
    const mineBtn = e.target.closest('[data-clear-mine]');
    if (mineBtn) {
      const k = userKeys();
      delete k[mineBtn.dataset.clearMine];
      localStorage.setItem('pw.userKeys', JSON.stringify(k));
      state.modelCache = {};
      await refreshStatus();
      close();
      return openSettings('ai');
    }
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
      if (hosted) {
        localStorage.setItem('pw.userKeys', JSON.stringify({ ...userKeys(), ...body.keys }));
      } else await api('/api/settings', { method: 'POST', body });
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

function renderChat() {
  const box = $('#messages');
  if (!state.chat.length) {
    box.innerHTML = `<div class="chat-empty">
      <img src="/logo.svg" alt="" class="bob" />
      <h3>Hi! I'm your LaTeX buddy</h3>
      <p>Ask me to write, restructure or fix anything in your paper.</p>
      <div class="suggestions">${SUGGESTIONS.map(([e, t]) => `<button class="suggestion" data-suggest="${esc(t)}"><span class="emo">${e}</span>${esc(t)}</button>`).join('')}</div>
    </div>`;
    return;
  }
  box.innerHTML = '';
  for (const m of state.chat) box.append(messageEl(m));
  hydrateIcons(box);
  box.scrollTop = box.scrollHeight;
}

function messageEl(m) {
  const el = document.createElement('div');
  el.className = `msg ${m.role}`;
  el.dataset.id = m.id;
  fillMessage(el, m);
  return el;
}

function fillMessage(el, m) {
  if (m.role === 'user') {
    el.innerHTML = `<div class="bubble">${esc(m.content)}</div>${m.sel || m.file ? `<div class="msg-meta">${m.file ? `<span>${esc(m.file)}</span>` : ''}${m.sel ? `<span class="ctx">${esc(m.sel)}</span>` : ''}</div>` : ''}`;
    return;
  }
  const info = providerInfo(m.provider);
  el.innerHTML = `
    <div class="msg-meta"><img src="/logo.svg" alt="" />${esc(info?.label || m.provider || '')} · ${esc(m.model || '')}</div>
    <div class="bubble">${assistantBody(m)}</div>
    ${m.streaming ? '' : `<div class="msg-actions">
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
  const st = !s.complete ? 'writing' : m.edits?.[i] || 'ready';
  const label = { applied: 'Applied', failed: 'Not found', reverted: 'Reverted', writing: 'writing…' }[st] || '';
  const btn =
    st === 'applied' ? `<button data-act="revert" data-msg="${m.id}" data-i="${i}">Revert</button>`
    : st === 'failed' ? `<button data-act="apply" data-msg="${m.id}" data-i="${i}">Retry</button>`
    : st === 'writing' ? ''
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
  if (tex && s.complete) {
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
  const sel = state.useSelection ? selectionInfo() : null;
  const userMsg = { id: uid(), role: 'user', content: text, file: state.file, sel: sel ? `L${sel.fromLine}${sel.toLine !== sel.fromLine ? `–${sel.toLine}` : ''}` : null };
  const msg = { id: uid(), role: 'assistant', content: '', provider: prefs.provider, model: prefs.model, file: state.file, edits: [], code: [], streaming: true };
  const history = [...state.chat, userMsg].map((m) => ({ role: m.role, content: m.content }));
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
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { ...authHeaders(), 'content-type': 'application/json' },
      body: JSON.stringify({ provider: msg.provider, model: msg.model, messages: history, context }),
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || res.statusText);
    for await (const ev of sseEvents(res.body)) {
      if (ev.type === 'text') {
        msg.content += ev.text;
        queueRender(msg);
      } else if (ev.type === 'error') msg.error = ev.error;
    }
  } catch (e) {
    if (e.name === 'AbortError') msg.stopped = true;
    else msg.error = e.message;
  } finally {
    msg.streaming = false;
    state.streaming = null;
    setSendMode(false);
  }
  if (!msg.error && !msg.stopped && prefs.autoApply) await autoApply(msg);
  queueRender(msg);
  saveChat();
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
  const msg = state.chat.find((m) => m.id === b.dataset.msg);
  if (!msg) return;
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
    state.chat = [];
    saveChat();
    renderChat();
  };
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
  $('#newFileBtn').onclick = newFile;
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
  });
  fv.addEventListener('dragleave', () => $('#filesView').classList.remove('drop'));
  fv.addEventListener('drop', (e) => {
    e.preventDefault();
    $('#filesView').classList.remove('drop');
    if (e.dataTransfer.files.length) uploadFiles([...e.dataTransfer.files]);
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
  window.addEventListener('beforeunload', (e) => {
    if (state.ws?.pending.length) {
      state.ws.flushOnUnload();
      return;
    }
    if ([...state.docs.values()].some((d) => !d.isClean(d.pwGen))) {
      saveAll();
      e.preventDefault();
    }
  });
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
  try {
    state.config = await api('/api/config');
  } catch (e) {
    $('#authScreen').hidden = true;
    return toast(`Couldn't reach the PaperWriter server: ${e.message}`, 'err', 8000);
  }
  if (state.config.hosted && !state.config.cloud) return showNeedsSupabase();
  if (state.config.cloud) {
    try {
      state.collab = await import('./cloud.js');
      state.cloud = new state.collab.Cloud(state.config.supabaseUrl, state.config.supabaseAnonKey);
      if (!(await state.cloud.init())) return showSignIn();
    } catch (e) {
      $('#authScreen').hidden = true;
      return toast(`Couldn't connect to Supabase: ${e.message}`, 'err', 10000);
    }
    document.body.classList.add('cloud');
    renderAccount();
  }
  $('#authScreen').hidden = true;
  try {
    await refreshStatus();
    await ensureModelChoice();
    if (state.cloud) await openInitialCloudProject();
    else {
      const { projects } = await api('/api/projects');
      const name = projects.some((p) => p.name === prefs.lastProject) ? prefs.lastProject : projects[0]?.name;
      if (name) await loadProject(name);
    }
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
      if (f && !/\.(pdf|eps)$/i.test(f.path)) return state.ws ? state.ws.fileUrl(f.path) : `/api/projects/${P()}/file?path=${enc(f.path)}&raw=1`;
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

/* ───────────────────────── cloud: sign-in & account ───────────────────────── */

const GOOGLE_ICON =
  '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.3-2.1 3.5-5.2 3.5-8.8z"/><path fill="#34A853" d="M12 24c3.2 0 6-1.1 7.9-2.9l-3.9-3c-1.1.7-2.4 1.2-4 1.2-3.1 0-5.7-2.1-6.6-4.9H1.4v3.1A12 12 0 0 0 12 24z"/><path fill="#FBBC05" d="M5.4 14.4a7.2 7.2 0 0 1 0-4.6V6.7h-4a12 12 0 0 0 0 10.8l4-3.1z"/><path fill="#EA4335" d="M12 4.8c1.7 0 3.3.6 4.5 1.8l3.4-3.4A12 12 0 0 0 1.4 6.7l4 3.1C6.3 6.9 8.9 4.8 12 4.8z"/></svg>';

async function showSignIn() {
  const params = new URLSearchParams(location.search);
  const invited = params.has('join') || params.has('project');
  const { google } = await state.cloud.providers();
  const el = $('#authScreen');
  el.hidden = false;
  el.innerHTML = `
    <div class="auth-card">
      <img src="/logo.svg" alt="" width="52" height="52" />
      <h1>${invited ? 'You’re invited to a paper' : 'Welcome to PaperWriter'}</h1>
      <p>${invited ? 'Sign in with Google to open the shared project.' : 'Write LaTeX together, with an AI co-author.'}</p>
      <button class="btn-oauth" id="googleBtn" ${google ? '' : 'disabled'}>${GOOGLE_ICON}<span>Continue with Google</span></button>
      <p class="note" id="authMsg"></p>
    </div>`;
  const msg = $('#authMsg', el);
  if (state.cloud.urlError) {
    msg.textContent = state.cloud.urlError;
    history.replaceState(null, '', `${location.pathname}${location.search}`);
  } else if (!google) {
    msg.innerHTML = 'Google sign-in isn’t switched on yet. Enable it in Supabase → Authentication → Sign In / Providers → <b>Google</b>.';
  }
  $('#googleBtn', el).onclick = async (e) => {
    e.currentTarget.disabled = true;
    try {
      // Comes back to this same address, so ?join= and ?project= links still work after signing in.
      await state.cloud.signInWithGoogle(`${location.origin}${location.pathname}${location.search}`);
    } catch (err) {
      msg.textContent = err.message;
      e.currentTarget.disabled = false;
    }
  };
}

/** A hosted deployment has no disk, so it can't run without a database. */
function showNeedsSupabase() {
  const el = $('#authScreen');
  el.hidden = false;
  el.innerHTML = `
    <div class="auth-card">
      <img src="/logo.svg" alt="" width="52" height="52" />
      <h1>Almost there</h1>
      <p>This deployment needs a Supabase project to store papers and sign people in.</p>
      <ol class="steps" style="text-align:left;margin:0">
        <li>Run <code>supabase/schema.sql</code> in your Supabase SQL Editor.</li>
        <li>In Vercel → Settings → Environment Variables, add <code>SUPABASE_URL</code> and <code>SUPABASE_ANON_KEY</code>.</li>
        <li>Redeploy.</li>
      </ol>
      <p class="note">Step-by-step guide: DEPLOY.md in the repository.</p>
    </div>`;
}

const initials = (name) =>
  String(name || '?')
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');

function avatar(person, cls = '') {
  return `<span class="avatar ${cls}" style="--c:${person.color}" title="${esc(person.name)}${person.email ? ` · ${esc(person.email)}` : ''}">${esc(initials(person.name || person.email))}</span>`;
}

function renderAccount() {
  const u = state.cloud.user;
  const me = { name: state.collab.displayName(u.email), email: u.email, color: state.collab.colorFor(u.id) };
  const btn = $('#accountBtn');
  btn.hidden = false;
  btn.innerHTML = avatar(me);
}

function openAccountMenu() {
  if (!state.cloud) return;
  const u = state.cloud.user;
  const pop = openPopover(
    $('#accountBtn'),
    `<div class="pop-title">Signed in as</div>
     <div class="pop-item"><span class="grow"><span>${esc(state.collab.displayName(u.email))}</span><span class="sub">${esc(u.email)}</span></span></div>
     <div class="pop-sep"></div>
     <button class="pop-item" data-signout>${icon('logout')}<span class="grow">Sign out</span></button>`,
  );
  const r = $('#accountBtn').getBoundingClientRect();
  pop.style.left = `${Math.max(10, r.right - pop.offsetWidth)}px`;
  pop.onclick = async (e) => {
    if (!e.target.closest('[data-signout]')) return;
    closePopover();
    await state.ws?.flush().catch(() => {});
    await state.cloud.signOut();
    location.href = location.pathname;
  };
}

function renderPresence() {
  const others = state.people.filter((p) => !p.me);
  const shown = others.slice(0, 4);
  $('#presence').innerHTML = shown.map((p) => avatar(p, 'small')).join('') + (others.length > 4 ? `<span class="avatar small more">+${others.length - 4}</span>` : '');
}

function renderCloudStatus() {
  const ws = state.ws;
  if (!ws) return;
  if (!ws.canEdit) setSaveStatus('viewonly');
  else if (ws.saveState === 'error') setSaveStatus('error');
  else if (ws.saveState === 'saving') setSaveStatus('saving');
  else if (!ws.connected) setSaveStatus('offline');
  else setSaveStatus('saved');
}

/* ───────────────────────── cloud: projects ───────────────────────── */

async function openInitialCloudProject() {
  const params = new URLSearchParams(location.search);
  let target = params.get('project');
  const join = params.get('join');
  if (join) {
    try {
      target = await state.cloud.joinByToken(join);
      toast('You joined the project', 'ok');
    } catch (e) {
      toast(e.message, 'err', 6000);
    }
  }
  if (params.has('join') || params.has('project')) history.replaceState(null, '', location.pathname);
  state.projects = await state.cloud.listProjects();
  if (!state.projects.length) {
    const p = await state.cloud.createProject('My first paper', 'welcome');
    state.projects = await state.cloud.listProjects();
    target = p.id;
  }
  if (target && !state.projects.some((p) => p.id === target)) toast('You don’t have access to that project. Ask the owner to invite you.', 'err', 6000);
  const id = state.projects.some((p) => p.id === target) ? target : state.projects.some((p) => p.id === prefs.lastProject) ? prefs.lastProject : state.projects[0].id;
  await loadProject(id);
}

async function loadCloudProject(id) {
  let meta = state.projects.find((p) => p.id === id);
  if (!meta) {
    state.projects = await state.cloud.listProjects();
    meta = state.projects.find((p) => p.id === id);
    if (!meta) throw new Error('Project not found, or you no longer have access.');
  }
  if (state.ws) {
    state.binding?.destroy();
    state.binding = null;
    state.ws.destroy();
  }
  Object.assign(state, { project: id, role: meta.role, ws: null, file: null, files: [], errors: [], warnings: [], lastResult: null, log: '', people: [] });
  state.docs.clear();
  prefs.lastProject = id;
  savePrefs();
  $('#projectName').textContent = meta.name;
  document.title = `${meta.name} · PaperWriter`;
  $('#roleChip').hidden = meta.role !== 'viewer';
  renderPresence();
  loadChat();
  renderLog();
  clearPdf();
  renderFiles();
  cm.swapDoc(CodeMirror.Doc('', 'stex'));
  cm.setOption('readOnly', 'nocursor');
  setSaveStatus('connecting');

  const ws = state.cloud.open(meta, meta.role);
  state.ws = ws;
  ws.on('status', renderCloudStatus);
  ws.on('presence', (people) => {
    state.people = people;
    renderPresence();
  });
  ws.files.observe(() => {
    if (state.ws !== ws) return;
    refreshFiles();
    if (state.file && !ws.files.has(state.file)) {
      const next = ws.main();
      if (ws.files.has(next)) openFile(next);
    }
  });
  ws.meta.observe(() => state.ws === ws && refreshFiles());
  await ws.connect();
  if (state.ws !== ws) return;
  renderCloudStatus();
  await refreshFiles();
  const last = prefs.lastFiles[id];
  const target = state.files.some((f) => f.path === last && f.kind === 'text') ? last : state.meta.main;
  if (state.files.some((f) => f.path === target)) await openFile(target);
  compile();
}

async function compileCloud() {
  const files = await state.ws.collect({ includeBinary: !state.config.hosted });
  const r = await api('/api/compile', { method: 'POST', body: { files, main: state.ws.main() } });
  if (r.pdfBase64) {
    const bytes = Uint8Array.from(atob(r.pdfBase64), (c) => c.charCodeAt(0));
    const old = state.pdfBlobUrl;
    state.pdfBlobUrl = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
    r.pdf = state.pdfBlobUrl;
    if (old) setTimeout(() => URL.revokeObjectURL(old), 5000);
  }
  return r;
}

async function openCloudProjectMenu() {
  state.projects = await state.cloud.listProjects();
  const cur = state.projects.find((p) => p.id === state.project);
  const roleLabel = { owner: 'Owner', editor: 'Can edit', viewer: 'Can view' };
  const pop = openPopover(
    $('#projectBtn'),
    `<div class="pop-title">Your projects</div>
     ${state.projects
       .map(
         (p) => `<button class="pop-item ${p.id === state.project ? 'active' : ''}" data-proj="${p.id}">
           ${icon(p.role === 'owner' ? 'folder' : 'users')}<span class="grow"><span>${esc(p.name)}</span><span class="sub">${roleLabel[p.role] || p.role} · ${new Date(p.updated_at).toLocaleDateString()}</span></span>
           ${p.id === state.project ? `<span class="check">${icon('check')}</span>` : ''}</button>`,
       )
       .join('')}
     <div class="pop-sep"></div>
     <button class="pop-item" data-pact="new">${icon('plus')}<span class="grow">New project…</span></button>
     ${cur && cur.role !== 'viewer' ? `<button class="pop-item" data-pact="rename">${icon('pencil')}<span class="grow">Rename “${esc(cur.name)}”…</span></button>` : ''}
     ${cur?.role === 'owner' ? `<button class="pop-item btn-danger" data-pact="delete">${icon('trash')}<span class="grow">Delete “${esc(cur.name)}”…</span></button>` : cur ? `<button class="pop-item btn-danger" data-pact="leave">${icon('logout')}<span class="grow">Leave “${esc(cur.name)}”</span></button>` : ''}`,
  );
  pop.onclick = async (e) => {
    const item = e.target.closest('[data-proj],[data-pact]');
    if (!item) return;
    closePopover();
    try {
      const act = item.dataset.pact;
      if (item.dataset.proj && item.dataset.proj !== state.project) await loadProject(item.dataset.proj);
      else if (act === 'new') {
        const r = await askText('New project', {
          placeholder: 'My amazing paper',
          okLabel: 'Create',
          extra: `<p class="note">Start from</p><select class="input" name="template"><option value="article">Article</option><option value="blank">Blank</option><option value="welcome">Welcome tour</option></select>`,
        });
        if (!r?.value) return;
        const p = await state.cloud.createProject(r.value, r.template);
        state.projects = await state.cloud.listProjects();
        await loadProject(p.id);
        toast('Project created', 'ok');
      } else if (act === 'rename') {
        const name = await askText('Rename project', { value: cur.name, okLabel: 'Rename' });
        if (!name || name === cur.name) return;
        await state.cloud.renameProject(cur.id, name);
        cur.name = name;
        $('#projectName').textContent = name;
      } else if (act === 'delete' || act === 'leave') {
        const del = act === 'delete';
        if (!(await confirmBox(del ? 'Delete project?' : 'Leave project?', del ? `"${cur.name}" and all its files will be permanently deleted for everyone.` : `You'll lose access to "${cur.name}" until someone invites you again.`, del ? 'Delete' : 'Leave'))) return;
        state.binding?.destroy();
        state.ws?.destroy();
        state.ws = null;
        if (del) await state.cloud.deleteProject(cur.id);
        else await state.cloud.removeMember(cur.id, state.cloud.user.email.toLowerCase());
        localStorage.removeItem(`pw.chat.${cur.id}`);
        state.project = null;
        await openInitialCloudProject();
      }
    } catch (err) {
      toast(err.message, 'err');
    }
  };
}

/* ───────────────────────── sharing ───────────────────────── */

function openShareSetupHelp() {
  openModal(`
    <div class="modal-head">${icon('users')}<h2>Share this project</h2><button class="icon-btn" data-close>${icon('x')}</button></div>
    <div class="modal-body">
      <p>Sharing, email invites and live co-editing need <b>cloud mode</b>, which stores projects in your own free Supabase project.</p>
      <ol class="steps">
        <li>Create a project at <a href="https://supabase.com/dashboard" target="_blank" rel="noopener">supabase.com</a>.</li>
        <li>Open <b>SQL Editor</b>, paste <code>supabase/schema.sql</code> and run it.</li>
        <li>Copy <code>.env.example</code> to <code>.env</code> and fill in your Supabase URL and keys.</li>
        <li>Restart PaperWriter (<code>npm start</code>), or deploy it to Vercel with the same variables.</li>
      </ol>
      <p class="note">The full walkthrough is in <code>DEPLOY.md</code>.</p>
    </div>`);
}

async function openShare() {
  if (!state.cloud || !state.ws) return openShareSetupHelp();
  const pid = state.project;
  const isOwner = state.role === 'owner';
  const canManage = isOwner || state.role === 'editor';
  const roleText = { owner: 'Owner', editor: 'Editor', viewer: 'Viewer' };
  let project = await state.cloud.getProject(pid);
  let members = await state.cloud.members(pid);

  const { el, close } = openModal(`
    <div class="modal-head">${icon('users')}<h2>Share “${esc(project.name)}”</h2><button class="icon-btn" data-close>${icon('x')}</button></div>
    <div class="modal-body share">
      ${
        canManage
          ? `<form class="invite-row" id="inviteForm">
              <input class="input" type="email" name="email" required placeholder="Add people by email" autocomplete="off" />
              <select class="input" name="role"><option value="editor">Editor</option><option value="viewer">Viewer</option></select>
              <button class="btn-primary" type="submit">${icon('mail')}<span>Invite</span></button>
            </form>`
          : `<p class="note">You can view who has access. Ask an editor or the owner to invite others.</p>`
      }
      <h3 class="share-h">People with access</h3>
      <ul class="member-list" id="memberList"></ul>
      <h3 class="share-h">General access</h3>
      <div class="access-row">
        <span class="access-icon" id="accessIcon"></span>
        <div class="grow">
          <select class="input access-select" id="linkRole" ${canManage ? '' : 'disabled'}>
            <option value="none">Restricted: only people added above</option>
            <option value="viewer">Anyone with the link can view</option>
            <option value="editor">Anyone with the link can edit</option>
          </select>
          <small id="accessHint"></small>
        </div>
      </div>
    </div>
    <div class="modal-foot">
      ${canManage ? `<button class="btn-ghost" id="resetLink" title="Old links stop working">Reset link</button>` : ''}
      <span class="spacer"></span>
      <button class="btn-ghost" id="copyLink">${icon('link')}<span>Copy link</span></button>
      <button class="btn-primary" data-close>Done</button>
    </div>`);

  const linkFor = () => (project.link_role === 'none' ? `${location.origin}/?project=${pid}` : `${location.origin}/?join=${project.share_token}`);
  const renderAccess = () => {
    $('#linkRole', el).value = project.link_role;
    $('#accessIcon', el).innerHTML = icon(project.link_role === 'none' ? 'lock' : 'globe');
    $('#accessHint', el).textContent =
      project.link_role === 'none' ? 'The link only opens for people you’ve added.' : `Anyone who signs in with the link becomes a${project.link_role === 'editor' ? 'n editor' : ' viewer'}.`;
  };
  const renderMembers = () => {
    const me = state.cloud.user.email.toLowerCase();
    $('#memberList', el).innerHTML = members
      .map((m) => {
        const person = { name: state.collab.displayName(m.email), email: m.email, color: state.collab.colorFor(m.user_id || m.email) };
        const roleCtl =
          m.role === 'owner' || !isOwner
            ? `<span class="role-label">${roleText[m.role]}</span>`
            : `<select class="input role-select" data-member="${esc(m.email)}">
                 <option value="editor" ${m.role === 'editor' ? 'selected' : ''}>Editor</option>
                 <option value="viewer" ${m.role === 'viewer' ? 'selected' : ''}>Viewer</option>
                 <option value="remove">Remove access</option>
               </select>`;
        return `<li>${avatar(person)}<span class="grow"><b>${esc(person.name)}${m.email === me ? ' (you)' : ''}</b><small>${esc(m.email)}${m.user_id ? '' : ' · invited'}</small></span>${roleCtl}</li>`;
      })
      .join('');
    hydrateIcons(el);
  };
  renderAccess();
  renderMembers();

  $('#inviteForm', el)?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const email = String(fd.get('email')).trim().toLowerCase();
    const role = fd.get('role');
    const btn = $('button[type="submit"]', e.target);
    btn.disabled = true;
    try {
      await state.cloud.addMember(pid, email, role);
      members = await state.cloud.members(pid);
      renderMembers();
      e.target.reset();
      try {
        await api('/api/invite', { method: 'POST', body: { projectId: pid, email } });
        toast(`Invitation emailed to ${email}`, 'ok');
      } catch (err) {
        await navigator.clipboard.writeText(`${location.origin}/?project=${pid}`).catch(() => {});
        toast(`${email} was added, but the email failed (${err.message}). Link copied, so send it to them yourself.`, 'err', 8000);
      }
    } catch (err) {
      toast(err.message, 'err');
    } finally {
      btn.disabled = false;
    }
  });
  $('#memberList', el).addEventListener('change', async (e) => {
    const sel = e.target.closest('[data-member]');
    if (!sel) return;
    try {
      if (sel.value === 'remove') await state.cloud.removeMember(pid, sel.dataset.member);
      else await state.cloud.updateMember(pid, sel.dataset.member, sel.value);
      members = await state.cloud.members(pid);
      renderMembers();
    } catch (err) {
      toast(err.message, 'err');
    }
  });
  $('#linkRole', el).addEventListener('change', async (e) => {
    try {
      await state.cloud.setLinkRole(pid, e.target.value);
      project.link_role = e.target.value;
      renderAccess();
    } catch (err) {
      toast(err.message, 'err');
      renderAccess();
    }
  });
  $('#copyLink', el).onclick = async () => {
    await navigator.clipboard.writeText(linkFor());
    toast(project.link_role === 'none' ? 'Link copied. Only people with access can open it.' : 'Link copied', 'ok');
  };
  $('#resetLink', el)?.addEventListener('click', async () => {
    if (!(await confirmBox('Reset the share link?', 'Anyone using the old link will no longer be able to join.', 'Reset'))) return openShare();
    project.share_token = await state.cloud.resetShareToken(pid);
    toast('New link created', 'ok');
    openShare();
  });
  void close;
}

boot();
