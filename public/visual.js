// Visual editor: renders the open .tex file as editable blocks on a page.
// Every edit is written back into the LaTeX source as a minimal replaceRange on CodeMirror,
// so undo, autosave, the AI and live collaboration all keep working unchanged.
import { esc } from './md.js';

let katexMod = null;
const loadKatex = async () => (katexMod ??= (await import('/vendor/katex/katex.mjs')).default);

const HEADING_LEVEL = { part: 1, chapter: 1, section: 2, subsection: 3, subsubsection: 4, paragraph: 5 };
const HEADING_RE = /^\\(part|chapter|section|subsection|subsubsection|paragraph)(\*?)\s*(\[[^\]]*\])?\s*\{/;
const COMMAND_RE = /^\\(maketitle|tableofcontents|listoffigures|listoftables|newpage|clearpage|cleardoublepage|appendix|bibliographystyle|bibliography|printbibliography|input|include|vspace|vfill|noindent|pagebreak|addbibresource|newcommand|renewcommand|setlength|label|centering|bigskip|medskip|smallskip)\b/;
const MATH_ENV = /^(equation|align|gather|multline|eqnarray|displaymath|flalign|alignat)\*?$/;
const LIST_ENV = /^(itemize|enumerate)$/;
const TEXT_ENV = /^(abstract|quote|quotation|center|flushleft|flushright)$/;
const BLOCK_START = /^[ \t]*(\\begin\{|\\(part|chapter|section|subsection|subsubsection|paragraph)\*?\s*[[{]|\\\[|\$\$|%|\\(maketitle|tableofcontents|newpage|clearpage|bibliography|printbibliography|appendix)\b)/;
const FORMAT_TAG = { textbf: 'b', textit: 'i', emph: 'i', underline: 'u', texttt: 'code' };
// Commands whose last argument is ordinary text: number of leading arguments to keep as-is.
const WRAP_CMD = { textcolor: 1, href: 1, textsc: 0, textsf: 0, textrm: 0, textsl: 0, textup: 0, textmd: 0, mbox: 0, text: 0, textnormal: 0 };

const escAttr = (s) => esc(s).replace(/\n/g, '&#10;');

/** Index of the brace closing the one at `open`, or -1. */
function matchBrace(s, open) {
  let depth = 0;
  for (let i = open; i < s.length; i++) {
    const c = s[i];
    if (c === '\\') {
      i++;
      continue;
    }
    if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return i;
  }
  return -1;
}

function envEnd(src, start, name, limit) {
  const re = new RegExp(`\\\\(begin|end)\\{${name.replace(/[*]/g, '\\*')}\\}`, 'g');
  re.lastIndex = start;
  let depth = 0;
  let m;
  while ((m = re.exec(src)) && m.index < limit) {
    depth += m[1] === 'begin' ? 1 : -1;
    if (depth === 0) return m.index + m[0].length;
  }
  return limit;
}

/** End of a command line, allowing its braces to span lines. */
function commandEnd(src, start, limit) {
  let depth = 0;
  for (let i = start; i < limit; i++) {
    const c = src[i];
    if (c === '\\') i++;
    else if (c === '{') depth++;
    else if (c === '}') depth--;
    else if (c === '\n' && depth <= 0) return i;
  }
  return limit;
}

/** Split a LaTeX file into top-level blocks with exact source offsets. */
export function parseDoc(src) {
  const docBegin = src.search(/\\begin\{document\}/);
  let bodyStart = 0;
  let bodyEnd = src.length;
  if (docBegin >= 0) {
    bodyStart = docBegin + '\\begin{document}'.length;
    const e = src.lastIndexOf('\\end{document}');
    if (e > bodyStart) bodyEnd = e;
  }
  const blocks = [];
  let i = bodyStart;
  while (i < bodyEnd) {
    while (i < bodyEnd && /\s/.test(src[i])) i++;
    if (i >= bodyEnd) break;
    const head = src.slice(i, Math.min(bodyEnd, i + 300));
    let m;
    let end;
    let block;
    if (head[0] === '%') {
      end = i;
      while (end < bodyEnd && src[end] === '%') {
        const nl = src.indexOf('\n', end);
        end = nl < 0 || nl > bodyEnd ? bodyEnd : nl;
        let next = end + 1;
        while (next < bodyEnd && (src[next] === ' ' || src[next] === '\t')) next++;
        if (src[next] === '%') end = next;
      }
      block = { type: 'comment' };
    } else if ((m = head.match(/^\\begin\{([^}]+)\}/))) {
      end = envEnd(src, i, m[1], bodyEnd);
      const env = m[1];
      block = {
        type: MATH_ENV.test(env) ? 'math' : LIST_ENV.test(env) ? 'list' : TEXT_ENV.test(env) ? 'textenv' : /^(figure|figure\*|wrapfigure)$/.test(env) ? 'figure' : /^(table|table\*|tabular)$/.test(env) ? 'table' : 'env',
        env,
      };
    } else if ((m = head.match(HEADING_RE))) {
      const close = matchBrace(src, i + m[0].length - 1);
      end = close < 0 ? commandEnd(src, i, bodyEnd) : close + 1;
      const label = src.slice(end, end + 200).match(/^[ \t]*\\label\{[^}]*\}/);
      if (label) end += label[0].length;
      block = { type: 'heading', cmd: m[1], level: HEADING_LEVEL[m[1]] };
    } else if (head.startsWith('\\[')) {
      const close = src.indexOf('\\]', i + 2);
      end = close < 0 || close > bodyEnd ? bodyEnd : close + 2;
      block = { type: 'math', env: 'display' };
    } else if (head.startsWith('$$')) {
      const close = src.indexOf('$$', i + 2);
      end = close < 0 || close > bodyEnd ? bodyEnd : close + 2;
      block = { type: 'math', env: 'display' };
    } else if (COMMAND_RE.test(head)) {
      end = commandEnd(src, i, bodyEnd);
      block = { type: head.startsWith('\\maketitle') ? 'title' : 'command' };
    } else {
      end = i;
      for (;;) {
        const nl = src.indexOf('\n', end);
        if (nl < 0 || nl >= bodyEnd) {
          end = bodyEnd;
          break;
        }
        const next = src.slice(nl + 1, Math.min(bodyEnd, nl + 200));
        if (/^[ \t]*(\n|$)/.test(next) || BLOCK_START.test(next)) {
          end = nl;
          break;
        }
        end = nl + 1;
      }
      block = { type: 'para' };
    }
    end = Math.max(end, i + 1);
    let trimmed = end;
    while (trimmed > i && /\s/.test(src[trimmed - 1])) trimmed--;
    blocks.push({ ...block, start: i, end: trimmed, src: src.slice(i, trimmed) });
    i = end;
  }
  return { bodyStart, bodyEnd, blocks, hasDocument: docBegin >= 0 };
}

/* ───────── inline LaTeX ⇄ HTML ───────── */

function chip(raw, label, cls = 'vc') {
  return `<span class="${cls}" contenteditable="false" data-src="${escAttr(raw)}" title="${escAttr(raw)}">${esc(label)}</span>`;
}

function mathChip(raw, inner) {
  let html;
  try {
    html = katexMod.renderToString(inner, { throwOnError: false, displayMode: false });
  } catch {
    html = esc(inner);
  }
  return `<span class="vm" contenteditable="false" data-src="${escAttr(raw)}" title="Click to edit">${html}</span>`;
}

function chipLabel(name, raw) {
  const arg = raw.match(/\{([^}]*)\}/)?.[1] ?? '';
  if (/^(cite|citep|citet|parencite|textcite|autocite)$/.test(name)) return `[${arg}]`;
  if (/^(ref|eqref|autoref|cref|Cref|pageref)$/.test(name)) return name === 'eqref' ? `(${arg})` : `→${arg}`;
  if (name === 'label') return `#${arg}`;
  if (name === 'url' || name === 'href') return arg;
  if (name === 'footnote') return '¹';
  if (name === 'LaTeX') return 'LaTeX';
  if (name === 'TeX') return 'TeX';
  if (name === 'today') return 'today';
  if (/^(ldots|dots)$/.test(name)) return '…';
  return raw;
}

function findInlineMathEnd(s, from, close) {
  for (let i = from; i < s.length; i++) {
    if (s[i] === '\\') {
      if (close === '\\)' && s.startsWith('\\)', i)) return i;
      i++;
      continue;
    }
    if (close === '$' && s[i] === '$') return i;
  }
  return -1;
}

export function inlineToHtml(s) {
  let out = '';
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (s.startsWith('\\(', i)) {
      const close = findInlineMathEnd(s, i + 2, '\\)');
      if (close > 0) {
        out += mathChip(s.slice(i, close + 2), s.slice(i + 2, close));
        i = close + 2;
        continue;
      }
    }
    if (c === '\\') {
      const n = s[i + 1];
      if (n && '%&#_${}'.includes(n)) {
        out += esc(n);
        i += 2;
        continue;
      }
      const m = s.slice(i).match(/^\\([a-zA-Z@]+)(\*?)/);
      if (m) {
        const name = m[1];
        const after = i + m[0].length;
        if (FORMAT_TAG[name] && s[after] === '{') {
          const close = matchBrace(s, after);
          if (close > 0) {
            const tag = FORMAT_TAG[name];
            out += `<${tag}${name === 'emph' ? ' data-emph="1"' : ''}>${inlineToHtml(s.slice(after + 1, close))}</${tag}>`;
            i = close + 1;
            continue;
          }
        }
        if (name in WRAP_CMD) {
          let j = after;
          for (let k = 0; k < WRAP_CMD[name] && j >= 0; k++) j = s[j] === '{' ? matchBrace(s, j) + 1 : -1;
          if (j > 0 && s[j] === '{') {
            const close = matchBrace(s, j);
            if (close > 0) {
              const prefix = s.slice(i, j);
              const color = name === 'textcolor' ? (prefix.match(/{([a-zA-Z]+)}$/)?.[1] ?? '') : '';
              out += `<span class="vw" data-wrap="${escAttr(prefix)}"${color ? ` style="color:${color}"` : ''}>${inlineToHtml(s.slice(j + 1, close))}</span>`;
              i = close + 1;
              continue;
            }
          }
        }
        let j = after;
        for (let args = 0; args < 3; ) {
          if (s[j] === '[') {
            const cl = s.indexOf(']', j);
            if (cl < 0) break;
            j = cl + 1;
          } else if (s[j] === '{') {
            const cl = matchBrace(s, j);
            if (cl < 0) break;
            j = cl + 1;
            args++;
          } else break;
        }
        const raw = s.slice(i, j);
        out += chip(raw, chipLabel(name, raw));
        i = j;
        continue;
      }
      const raw = s.slice(i, i + 2);
      out += chip(raw, raw === '\\\\' ? '↵' : raw.slice(1) || '\\');
      i += 2;
      continue;
    }
    if (c === '$' && s[i + 1] !== '$') {
      const close = findInlineMathEnd(s, i + 1, '$');
      if (close > 0) {
        out += mathChip(s.slice(i, close + 1), s.slice(i + 1, close));
        i = close + 1;
        continue;
      }
    }
    if (c === '%') {
      const nl = s.indexOf('\n', i);
      const e = nl < 0 ? s.length : nl;
      out += chip(s.slice(i, e), '%', 'vc vc-comment');
      i = e;
      continue;
    }
    if (c === '{' || c === '}') {
      out += chip(c, c, 'vc vc-brace');
      i++;
      continue;
    }
    if (c === '~') out += '&nbsp;';
    else if (c === '\n') out += ' ';
    else out += esc(c);
    i++;
  }
  return out;
}

function escapeText(t) {
  return t
    .replace(/\\/g, '\u0000')
    .replace(/~/g, '\\textasciitilde{}')
    .replace(/\^/g, '\\textasciicircum{}')
    .replace(/([%&#_$])/g, '\\$1')
    .replace(/([{}])/g, '\\$1')
    .replace(/\u0000/g, '\\textbackslash{}')
    .replace(/\u00a0/g, '~');
}

export function htmlToLatex(node) {
  let out = '';
  for (const n of node.childNodes) {
    if (n.nodeType === 3) out += escapeText(n.nodeValue);
    else if (n.nodeType === 1) {
      if (n.dataset?.src != null) {
        out += n.dataset.src;
        continue;
      }
      const tag = n.tagName.toLowerCase();
      const inner = htmlToLatex(n);
      if (n.dataset?.wrap != null) {
        out += `${n.dataset.wrap}{${inner}}`;
        continue;
      }
      if (!inner && tag !== 'br') continue;
      if (tag === 'b' || tag === 'strong') out += `\\textbf{${inner}}`;
      else if (tag === 'i' || tag === 'em') out += n.dataset?.emph === '1' || tag === 'em' ? `\\emph{${inner}}` : `\\textit{${inner}}`;
      else if (tag === 'u') out += `\\underline{${inner}}`;
      else if (tag === 'code') out += `\\texttt{${inner}}`;
      else if (tag === 'br') out += '\n';
      else if (tag === 'div' || tag === 'p') out += `\n\n${inner}`;
      else out += inner;
    }
  }
  return out;
}

const tidy = (s) => s.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();

/* ───────── block templates ───────── */

const TEMPLATES = {
  para: ['Paragraph', 'New paragraph.'],
  section: ['Section', '\\section{New section}'],
  subsection: ['Subsection', '\\subsection{New subsection}'],
  itemize: ['Bulleted list', '\\begin{itemize}\n  \\item First point\n\\end{itemize}'],
  enumerate: ['Numbered list', '\\begin{enumerate}\n  \\item First step\n\\end{enumerate}'],
  equation: ['Equation', '\\begin{equation}\n  E = mc^2\n\\end{equation}'],
  table: ['Table', '\\begin{table}[h]\n  \\centering\n  \\begin{tabular}{lcc}\n    \\hline\n    Name & A & B \\\\\n    \\hline\n    Row & 1 & 2 \\\\\n    \\hline\n  \\end{tabular}\n  \\caption{Caption}\n\\end{table}'],
  figure: ['Figure', '\\begin{figure}[h]\n  \\centering\n  \\includegraphics[width=0.8\\linewidth]{example-image}\n  \\caption{Caption}\n\\end{figure}'],
};

/* ───────── the editor ───────── */

export class VisualEditor {
  /**
   * @param {object} o
   * @param {HTMLElement} o.host
   * @param {CodeMirror.Editor} o.cm
   * @param {(path: string) => Promise<string|null>} o.resolveImage
   * @param {() => boolean} o.readOnly
   */
  constructor({ host, cm, resolveImage, readOnly, onFocusBlock }) {
    this.host = host;
    this.cm = cm;
    this.resolveImage = resolveImage;
    this.readOnly = readOnly;
    this.onFocusBlock = onFocusBlock;
    this.blocks = [];
    this.visible = false;
    this.commitTimers = new Map();
    this.page = document.createElement('div');
    this.page.className = 'v-page';
    host.append(this.page);
    this.toolbar = this.buildToolbar();
    this.bindEvents();
  }

  async show() {
    this.visible = true;
    this.host.hidden = false;
    await loadKatex();
    this.renderAll();
  }

  hide() {
    this.visible = false;
    this.host.hidden = true;
    this.toolbar.hidden = true;
  }

  /** Called on every CodeMirror change. */
  onDocChange() {
    if (!this.visible) return;
    clearTimeout(this.syncTimer);
    this.syncTimer = setTimeout(() => this.sync(), 60);
  }

  /** Called when the editor switches to another file. */
  reset() {
    if (this.visible) this.renderAll();
  }

  activeIndex() {
    const el = document.activeElement?.closest?.('.vb');
    return el && this.page.contains(el) ? Number(el.dataset.i) : -1;
  }

  sync() {
    const parsed = parseDoc(this.cm.getValue());
    const active = this.activeIndex();
    if (parsed.blocks.length !== this.blocks.length) {
      this.parsed = parsed;
      this.renderAll(active >= 0 ? (this.pendingFocus ?? active) : this.pendingFocus);
      return;
    }
    this.parsed = parsed;
    parsed.blocks.forEach((b, i) => {
      const old = this.blocks[i];
      this.blocks[i] = b;
      const el = this.page.querySelector(`.vb[data-i="${i}"]`);
      if (!el) return;
      if (old.src !== b.src || old.type !== b.type) {
        // Never yank the block someone is typing in; it re-renders once they leave it.
        if (i === active) return;
        el.replaceWith(this.renderBlock(b, i));
      }
    });
    if (this.pendingFocus != null) this.focusBlock(this.pendingFocus, this.pendingFocusAtStart);
  }

  renderAll(focusIndex) {
    const src = this.cm.getValue();
    this.parsed = parseDoc(src);
    this.blocks = this.parsed.blocks;
    this.page.innerHTML = '';
    this.page.classList.toggle('readonly', this.readOnly());
    if (!this.blocks.length) {
      const empty = document.createElement('div');
      empty.className = 'v-empty';
      empty.innerHTML = `<p>This document is empty.</p><button class="chip-btn" data-add="-1">+ Add a block</button>`;
      this.page.append(empty);
    }
    this.blocks.forEach((b, i) => this.page.append(this.renderBlock(b, i)));
    if (focusIndex != null) this.focusBlock(focusIndex, this.pendingFocusAtStart);
  }

  focusBlock(i, atStart = false) {
    this.pendingFocus = null;
    this.pendingFocusAtStart = false;
    const el = this.page.querySelector(`.vb[data-i="${i}"] [contenteditable="true"]`);
    if (!el) return;
    el.focus();
    const sel = getSelection();
    const r = document.createRange();
    r.selectNodeContents(el);
    r.collapse(atStart);
    sel.removeAllRanges();
    sel.addRange(r);
  }

  wrap(b, i, inner, { editable = true } = {}) {
    const el = document.createElement('div');
    el.className = `vb vb-${b.type}`;
    el.dataset.i = i;
    const ro = this.readOnly();
    el.innerHTML = `
      ${ro ? '' : `<div class="vb-gutter"><button class="vb-btn" data-add="${i}" title="Add a block below">+</button><span class="vb-btn vb-handle" draggable="true" title="Drag to move">⠿</span></div>`}
      <div class="vb-body">${inner}</div>
      ${ro ? '' : `<button class="vb-src" data-src-edit="${i}" title="Edit LaTeX">{ }</button>`}`;
    if (ro || !editable) for (const e of el.querySelectorAll('[contenteditable="true"]')) e.setAttribute('contenteditable', 'false');
    return el;
  }

  renderBlock(b, i) {
    const ce = this.readOnly() ? 'false' : 'true';
    switch (b.type) {
      case 'heading': {
        const m = b.src.match(HEADING_RE);
        const open = m[0].length - 1;
        const close = matchBrace(b.src, open);
        const title = b.src.slice(open + 1, close < 0 ? b.src.length : close);
        const tag = `h${Math.min(6, b.level + 1)}`;
        return this.wrap(b, i, `<${tag} class="v-h v-l${b.level} ${m[2] ? 'nonum' : ''}" contenteditable="${ce}" data-role="heading" spellcheck="true">${inlineToHtml(title)}</${tag}>`);
      }
      case 'para':
        return this.wrap(b, i, `<p class="v-para" contenteditable="${ce}" data-role="para" spellcheck="true">${inlineToHtml(b.src)}</p>`);
      case 'list': {
        const parts = this.listParts(b);
        if (!parts) return this.wrap(b, i, this.rawHtml(b), { editable: false });
        const tag = b.env === 'enumerate' ? 'ol' : 'ul';
        return this.wrap(b, i, `<${tag} class="v-list" contenteditable="${ce}" data-role="list" spellcheck="true">${parts.items.map((it) => `<li>${inlineToHtml(it)}</li>`).join('')}</${tag}>`);
      }
      case 'textenv': {
        const parts = this.envParts(b);
        if (!parts || /\\begin\{/.test(parts.inner)) return this.wrap(b, i, this.rawHtml(b), { editable: false });
        const label = b.env === 'abstract' ? '<div class="v-env-label">Abstract</div>' : '';
        return this.wrap(b, i, `<div class="v-env v-${b.env}">${label}<div class="v-para" contenteditable="${ce}" data-role="envtext" spellcheck="true">${inlineToHtml(parts.inner.trim())}</div></div>`);
      }
      case 'math':
        return this.wrap(b, i, `<div class="v-math ${/\*$/.test(b.env) || b.env === 'display' ? 'nonum' : ''}" data-role="math" title="Click to edit">${this.renderMath(b)}</div>`, { editable: false });
      case 'title':
        return this.wrap(b, i, this.renderTitle(), { editable: true });
      case 'figure':
        return this.wrap(b, i, this.renderFigure(b), { editable: false });
      case 'table':
        return this.wrap(b, i, this.renderTable(b), { editable: false });
      default:
        return this.wrap(b, i, this.rawHtml(b), { editable: false });
    }
  }

  rawHtml(b) {
    const cls = b.type === 'comment' ? 'v-raw v-comment' : 'v-raw';
    return `<pre class="${cls}" data-role="raw" title="Click to edit">${esc(b.src)}</pre>`;
  }

  envParts(b) {
    const m = b.src.match(/^\\begin\{[^}]+\}(\[[^\]]*\])?/);
    const endTag = `\\end{${b.env}}`;
    if (!m || !b.src.endsWith(endTag)) return null;
    return { head: m[0], inner: b.src.slice(m[0].length, b.src.length - endTag.length), tail: endTag };
  }

  listParts(b) {
    const p = this.envParts(b);
    if (!p || /\\begin\{/.test(p.inner)) return null;
    const items = p.inner.split(/\\item\b\s*/).slice(1).map((s) => s.trim());
    return { ...p, items };
  }

  renderMath(b) {
    let inner = b.src;
    if (b.env === 'display') inner = inner.replace(/^\\\[|\\\]$/g, '').replace(/^\$\$|\$\$$/g, '');
    else {
      const p = this.envParts(b);
      inner = p ? p.inner : inner;
      const base = b.env.replace(/\*$/, '');
      if (/^(align|flalign|alignat|eqnarray)$/.test(base)) inner = `\\begin{aligned}${inner}\\end{aligned}`;
      else if (base === 'gather') inner = `\\begin{gathered}${inner}\\end{gathered}`;
      else if (base === 'multline') inner = `\\begin{gathered}${inner}\\end{gathered}`;
    }
    inner = inner.replace(/\\label\{[^}]*\}/g, '').replace(/\\nonumber|\\notag/g, '');
    try {
      return katexMod.renderToString(inner.trim(), { displayMode: true, throwOnError: false });
    } catch {
      return `<pre class="v-raw">${esc(b.src)}</pre>`;
    }
  }

  preambleArg(cmd) {
    const src = this.cm.getValue();
    const head = src.slice(0, this.parsed?.bodyStart ?? src.length);
    const m = head.match(new RegExp(`\\\\${cmd}\\s*\\{`));
    if (!m) return null;
    const open = m.index + m[0].length - 1;
    const close = matchBrace(head, open);
    return close < 0 ? null : { start: open + 1, end: close, value: head.slice(open + 1, close) };
  }

  renderTitle() {
    const ce = this.readOnly() ? 'false' : 'true';
    const field = (cmd, cls) => {
      const a = this.preambleArg(cmd);
      if (!a) return '';
      return `<div class="${cls}" contenteditable="${ce}" data-role="preamble" data-cmd="${cmd}" spellcheck="true">${inlineToHtml(a.value === '\\today' ? '\\today' : a.value)}</div>`;
    };
    const inner = `${field('title', 'v-title')}${field('author', 'v-author')}${field('date', 'v-date')}`;
    return `<div class="v-titleblock">${inner || '<div class="v-raw">\\maketitle (add \\title{…} to the preamble)</div>'}</div>`;
  }

  renderFigure(b) {
    const img = b.src.match(/\\includegraphics\s*(\[[^\]]*\])?\s*\{([^}]+)\}/);
    const cap = b.src.match(/\\caption\s*\{/);
    let caption = '';
    if (cap) {
      const open = cap.index + cap[0].length - 1;
      const close = matchBrace(b.src, open);
      caption = b.src.slice(open + 1, close < 0 ? undefined : close);
    }
    const id = `vimg-${Math.random().toString(36).slice(2)}`;
    if (img) {
      this.resolveImage(img[2].trim()).then((url) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.innerHTML = url ? `<img src="${esc(url)}" alt="" />` : `<div class="v-imgph">🖼 ${esc(img[2])}</div>`;
      });
    }
    return `<figure class="v-figure" data-role="raw" title="Click to edit">
      <div class="v-imgwrap" id="${id}"><div class="v-imgph">${img ? `🖼 ${esc(img[2])}` : 'Figure'}</div></div>
      ${caption ? `<figcaption><b>Figure.</b> ${inlineToHtml(caption)}</figcaption>` : ''}</figure>`;
  }

  renderTable(b) {
    const tab = b.src.match(/\\begin\{tabular\}\s*(\{(?:[^{}]|\{[^{}]*\})*\})([\s\S]*?)\\end\{tabular\}/);
    const cap = b.src.match(/\\caption\s*\{/);
    let caption = '';
    if (cap) {
      const open = cap.index + cap[0].length - 1;
      const close = matchBrace(b.src, open);
      caption = b.src.slice(open + 1, close < 0 ? undefined : close);
    }
    if (!tab) return this.rawHtml(b);
    const rows = tab[2]
      .replace(/\\(toprule|midrule|bottomrule|hline)\b/g, '')
      .replace(/\\cline\{[^}]*\}/g, '')
      .split(/\\\\(?:\[[^\]]*\])?/)
      .map((r) => r.trim())
      .filter(Boolean);
    const cells = (r) => r.split(/(?<!\\)&/).map((c) => `<td>${inlineToHtml(c.trim())}</td>`).join('');
    return `<div class="v-tablewrap" data-role="raw" title="Click to edit">
      ${caption ? `<div class="v-tablecap"><b>Table.</b> ${inlineToHtml(caption)}</div>` : ''}
      <table class="v-table">${rows.map((r, k) => `<tr class="${k === 0 ? 'head' : ''}">${cells(r)}</tr>`).join('')}</table></div>`;
  }

  /* ───────── writing back ───────── */

  replace(start, end, text) {
    const cm = this.cm;
    if (cm.getRange(cm.posFromIndex(start), cm.posFromIndex(end)) === text) return;
    cm.replaceRange(text, cm.posFromIndex(start), cm.posFromIndex(end), '+visual');
  }

  latexFor(el, b) {
    const role = el.dataset.role;
    if (role === 'para') return tidy(htmlToLatex(el));
    if (role === 'heading') {
      const m = b.src.match(HEADING_RE);
      const close = matchBrace(b.src, m[0].length - 1);
      return `${b.src.slice(0, m[0].length)}${tidy(htmlToLatex(el)).replace(/\n+/g, ' ')}${b.src.slice(close < 0 ? b.src.length : close)}`;
    }
    if (role === 'list') {
      const p = this.listParts(b);
      const items = [...el.querySelectorAll('li')].map((li) => tidy(htmlToLatex(li)).replace(/\n\n+/g, '\n')).filter((s, k, all) => s || all.length === 1);
      return `${p.head}\n${items.map((s) => `  \\item ${s}`).join('\n')}\n${p.tail}`;
    }
    if (role === 'envtext') {
      const p = this.envParts(b);
      return `${p.head}\n${tidy(htmlToLatex(el))}\n${p.tail}`;
    }
    return null;
  }

  commit(el) {
    const blockEl = el.closest('.vb');
    if (!blockEl) return;
    const i = Number(blockEl.dataset.i);
    const b = this.blocks[i];
    if (!b) return;
    blockEl.dataset.dirty = '';
    if (el.dataset.role === 'preamble') {
      const a = this.preambleArg(el.dataset.cmd);
      if (a) this.replace(a.start, a.end, tidy(htmlToLatex(el)).replace(/\n+/g, ' '));
      return;
    }
    const text = this.latexFor(el, b);
    if (text == null) return;
    if (!text.trim() && el.dataset.role === 'para') return this.deleteBlock(i);
    this.replace(b.start, b.end, text);
  }

  scheduleCommit(el) {
    el.closest('.vb').dataset.dirty = '1';
    clearTimeout(this.commitTimers.get(el));
    this.commitTimers.set(
      el,
      setTimeout(() => this.commit(el), 350),
    );
  }

  insertAfter(i, key) {
    const tpl = TEMPLATES[key][1];
    const src = this.cm.getValue();
    const at = i >= 0 ? this.blocks[i].end : this.blocks[0]?.start ?? this.parsed.bodyStart;
    const text = i >= 0 ? `\n\n${tpl}` : `\n${tpl}\n${this.blocks.length ? '\n' : ''}`;
    if (at > src.length) return;
    this.pendingFocus = i + 1;
    this.cm.replaceRange(text, this.cm.posFromIndex(at), this.cm.posFromIndex(at), '+visual');
  }

  deleteBlock(i) {
    const b = this.blocks[i];
    const next = this.blocks[i + 1];
    const prev = this.blocks[i - 1];
    if (next) this.replace(b.start, next.start, '');
    else if (prev) this.replace(prev.end, b.end, '');
    else this.replace(b.start, b.end, '');
    this.pendingFocus = Math.max(0, i - 1);
  }

  /** Move block `from` before/after block `to` with two small edits (keeps collaborators' cursors stable). */
  move(from, to, after) {
    if (from === to) return;
    const a = this.blocks[from];
    const t = this.blocks[to];
    if (!a || !t) return;
    const next = this.blocks[from + 1];
    const prev = this.blocks[from - 1];
    const cut = next ? [a.start, next.start] : prev ? [prev.end, a.end] : [a.start, a.end];
    const insertAt = after ? t.end : t.start;
    const text = after ? `\n\n${a.src}` : `${a.src}\n\n`;
    const cm = this.cm;
    cm.operation(() => {
      // Apply the later edit first so the earlier offsets stay valid.
      if (insertAt >= cut[1]) {
        cm.replaceRange(text, cm.posFromIndex(insertAt), cm.posFromIndex(insertAt), '+visual');
        cm.replaceRange('', cm.posFromIndex(cut[0]), cm.posFromIndex(cut[1]), '+visual');
      } else {
        cm.replaceRange('', cm.posFromIndex(cut[0]), cm.posFromIndex(cut[1]), '+visual');
        cm.replaceRange(text, cm.posFromIndex(insertAt), cm.posFromIndex(insertAt), '+visual');
      }
    });
  }

  /** Enter in a paragraph splits it into two paragraphs. */
  splitParagraph(el) {
    const sel = getSelection();
    if (!sel.rangeCount) return;
    const caret = sel.getRangeAt(0);
    const before = document.createRange();
    before.setStart(el, 0);
    before.setEnd(caret.startContainer, caret.startOffset);
    const after = document.createRange();
    after.setStart(caret.endContainer, caret.endOffset);
    after.setEnd(el, el.childNodes.length);
    const holder = (r) => {
      const d = document.createElement('div');
      d.append(r.cloneContents());
      return tidy(htmlToLatex(d));
    };
    const i = Number(el.closest('.vb').dataset.i);
    const b = this.blocks[i];
    const first = holder(before);
    const second = holder(after) || 'New paragraph.';
    this.pendingFocus = i + 1;
    this.pendingFocusAtStart = true;
    this.replace(b.start, b.end, `${first || 'New paragraph.'}\n\n${second}`);
  }

  openSourceEditor(i) {
    const b = this.blocks[i];
    const blockEl = this.page.querySelector(`.vb[data-i="${i}"]`);
    if (!b || !blockEl || this.readOnly()) return;
    const body = blockEl.querySelector('.vb-body');
    body.innerHTML = `<div class="v-srcedit"><textarea spellcheck="false"></textarea>
      <div class="v-srcedit-foot"><span class="v-preview"></span><span class="spacer"></span><button class="chip-btn" data-src-cancel>Cancel</button><button class="chip-btn accent" data-src-save>Apply</button></div></div>`;
    const ta = body.querySelector('textarea');
    ta.value = b.src;
    const fit = () => {
      ta.style.height = 'auto';
      ta.style.height = `${ta.scrollHeight + 2}px`;
    };
    const preview = () => {
      if (b.type !== 'math') return;
      body.querySelector('.v-preview').innerHTML = this.renderMath({ ...b, src: ta.value });
    };
    ta.addEventListener('input', () => {
      fit();
      preview();
    });
    ta.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') blockEl.replaceWith(this.renderBlock(b, i));
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) save();
    });
    const save = () => {
      const val = ta.value.trim();
      if (val === b.src) blockEl.replaceWith(this.renderBlock(b, i));
      else if (!val) this.deleteBlock(i);
      else this.replace(b.start, b.end, val);
    };
    body.querySelector('[data-src-save]').onclick = save;
    body.querySelector('[data-src-cancel]').onclick = () => blockEl.replaceWith(this.renderBlock(b, i));
    fit();
    preview();
    ta.focus();
  }

  editChip(chipEl) {
    if (this.readOnly()) return;
    const raw = chipEl.dataset.src;
    const value = prompt(chipEl.classList.contains('vm') ? 'Edit math (LaTeX)' : 'Edit LaTeX', raw);
    if (value == null || value === raw) return;
    const editable = chipEl.closest('[contenteditable="true"]');
    if (!value) chipEl.remove();
    else {
      const tmp = document.createElement('span');
      tmp.innerHTML = inlineToHtml(value);
      chipEl.replaceWith(...tmp.childNodes);
    }
    if (editable) this.commit(editable);
  }

  addMenu(anchor, i) {
    document.querySelector('.v-addmenu')?.remove();
    const menu = document.createElement('div');
    menu.className = 'v-addmenu';
    menu.innerHTML = Object.entries(TEMPLATES)
      .map(([k, [label]]) => `<button data-tpl="${k}">${label}</button>`)
      .join('');
    document.body.append(menu);
    const r = anchor.getBoundingClientRect();
    menu.style.left = `${Math.min(r.left, innerWidth - menu.offsetWidth - 10)}px`;
    menu.style.top = `${Math.min(r.bottom + 6, innerHeight - menu.offsetHeight - 10)}px`;
    const close = (e) => {
      if (e && menu.contains(e.target)) return;
      menu.remove();
      document.removeEventListener('pointerdown', close, true);
    };
    document.addEventListener('pointerdown', close, true);
    menu.onclick = (e) => {
      const k = e.target.closest('[data-tpl]')?.dataset.tpl;
      if (!k) return;
      close();
      this.insertAfter(i, k);
    };
  }

  /* ───────── formatting toolbar ───────── */

  buildToolbar() {
    const tb = document.createElement('div');
    tb.className = 'v-toolbar';
    tb.hidden = true;
    tb.innerHTML = `<button data-fmt="bold" title="Bold (Ctrl+B)"><b>B</b></button><button data-fmt="italic" title="Italic (Ctrl+I)"><i>I</i></button><button data-fmt="underline" title="Underline (Ctrl+U)"><u>U</u></button><span class="sep"></span><button data-fmt="math" title="Make inline math">∑</button><button data-fmt="cite" title="Insert citation">[1]</button>`;
    document.body.append(tb);
    tb.addEventListener('mousedown', (e) => e.preventDefault());
    tb.addEventListener('click', (e) => {
      const f = e.target.closest('[data-fmt]')?.dataset.fmt;
      const editable = getSelection().anchorNode?.parentElement?.closest('[contenteditable="true"]');
      if (!f || !editable) return;
      if (f === 'math' || f === 'cite') {
        const sel = getSelection();
        const r = sel.getRangeAt(0);
        const text = r.toString();
        const raw = f === 'math' ? `$${text || 'x'}$` : `\\cite{${text || 'key'}}`;
        const tmp = document.createElement('span');
        tmp.innerHTML = inlineToHtml(raw);
        r.deleteContents();
        r.insertNode(tmp.firstChild);
      } else document.execCommand(f);
      this.scheduleCommit(editable);
    });
    return tb;
  }

  positionToolbar() {
    const sel = getSelection();
    const editable = sel.anchorNode?.parentElement?.closest?.('[contenteditable="true"]');
    if (!this.visible || !editable || !this.page.contains(editable) || sel.isCollapsed) {
      this.toolbar.hidden = true;
      return;
    }
    const r = sel.getRangeAt(0).getBoundingClientRect();
    this.toolbar.hidden = false;
    this.toolbar.style.left = `${Math.max(8, Math.min(r.left + r.width / 2 - this.toolbar.offsetWidth / 2, innerWidth - this.toolbar.offsetWidth - 8))}px`;
    this.toolbar.style.top = `${Math.max(8, r.top - this.toolbar.offsetHeight - 8)}px`;
  }

  bindEvents() {
    const page = this.page;
    page.addEventListener('input', (e) => {
      const el = e.target.closest('[contenteditable="true"]');
      if (el) this.scheduleCommit(el);
    });
    page.addEventListener('focusout', (e) => {
      const el = e.target.closest?.('[contenteditable="true"]');
      if (!el) return;
      clearTimeout(this.commitTimers.get(el));
      if (el.closest('.vb')?.dataset.dirty === '1') this.commit(el);
      setTimeout(() => this.sync(), 0);
    });
    page.addEventListener('focusin', (e) => {
      const i = Number(e.target.closest?.('.vb')?.dataset.i);
      const b = this.blocks[i];
      if (b && this.onFocusBlock) this.onFocusBlock(b);
    });
    page.addEventListener('keydown', (e) => {
      const el = e.target.closest?.('[contenteditable="true"]');
      if (!el) return;
      const role = el.dataset.role;
      if (e.key === 'Enter' && !e.shiftKey) {
        if (role === 'heading' || role === 'preamble') {
          e.preventDefault();
          el.blur();
        } else if (role === 'para') {
          e.preventDefault();
          clearTimeout(this.commitTimers.get(el));
          this.splitParagraph(el);
        }
      }
      if ((e.ctrlKey || e.metaKey) && ['b', 'i', 'u'].includes(e.key.toLowerCase())) setTimeout(() => this.scheduleCommit(el), 0);
    });
    page.addEventListener('paste', (e) => {
      const el = e.target.closest?.('[contenteditable="true"]');
      if (!el) return;
      e.preventDefault();
      document.execCommand('insertText', false, e.clipboardData.getData('text/plain'));
    });
    page.addEventListener('click', (e) => {
      const add = e.target.closest('[data-add]');
      if (add) return this.addMenu(add, Number(add.dataset.add));
      const srcBtn = e.target.closest('[data-src-edit]');
      if (srcBtn) return this.openSourceEditor(Number(srcBtn.dataset.srcEdit));
      const chipEl = e.target.closest('.vm, .vc');
      if (chipEl && chipEl.closest('[contenteditable="true"]')) return this.editChip(chipEl);
      const rawEl = e.target.closest('[data-role="raw"], [data-role="math"]');
      if (rawEl && !e.target.closest('.v-srcedit')) this.openSourceEditor(Number(rawEl.closest('.vb').dataset.i));
    });
    document.addEventListener('selectionchange', () => this.positionToolbar());
    this.host.addEventListener('scroll', () => this.positionToolbar(), { passive: true });

    // Drag a block by its handle to move it.
    let dragFrom = -1;
    page.addEventListener('dragstart', (e) => {
      const h = e.target.closest?.('.vb-handle');
      if (!h) return;
      const blockEl = h.closest('.vb');
      dragFrom = Number(blockEl.dataset.i);
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', String(dragFrom));
      e.dataTransfer.setDragImage(blockEl, 20, 20);
      blockEl.classList.add('dragging');
    });
    const clearMarks = () => page.querySelectorAll('.drop-before, .drop-after, .dragging').forEach((x) => x.classList.remove('drop-before', 'drop-after', 'dragging'));
    page.addEventListener('dragover', (e) => {
      if (dragFrom < 0) return;
      const over = e.target.closest?.('.vb');
      if (!over) return;
      e.preventDefault();
      const r = over.getBoundingClientRect();
      const after = e.clientY > r.top + r.height / 2;
      page.querySelectorAll('.drop-before, .drop-after').forEach((x) => x !== over && x.classList.remove('drop-before', 'drop-after'));
      over.classList.toggle('drop-after', after);
      over.classList.toggle('drop-before', !after);
    });
    page.addEventListener('drop', (e) => {
      if (dragFrom < 0) return;
      e.preventDefault();
      const over = e.target.closest?.('.vb');
      if (over) {
        const to = Number(over.dataset.i);
        const after = over.classList.contains('drop-after');
        this.move(dragFrom, to, after);
      }
      dragFrom = -1;
      clearMarks();
    });
    page.addEventListener('dragend', () => {
      dragFrom = -1;
      clearMarks();
    });
  }
}
