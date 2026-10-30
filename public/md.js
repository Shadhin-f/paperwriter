// Small, safe markdown renderer + parser for the AI's edit blocks.

export const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function inline(s) {
  let out = esc(s);
  const codes = [];
  out = out.replace(/`([^`]+)`/g, (_, c) => `\u0000${codes.push(c) - 1}\u0000`);
  out = out
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
    .replace(/(^|[^*\w])\*([^*\n]+)\*(?!\w)/g, '$1<i>$2</i>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  return out.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${codes[i]}</code>`);
}

export function markdown(text) {
  const lines = String(text).replace(/\r/g, '').split('\n');
  const html = [];
  let para = [];
  let list = null;
  const flushPara = () => {
    if (para.length) html.push(`<p>${para.map(inline).join('<br>')}</p>`);
    para = [];
  };
  const flushList = () => {
    if (list) html.push(`<${list.type}>${list.items.map((i) => `<li>${inline(i)}</li>`).join('')}</${list.type}>`);
    list = null;
  };
  for (const line of lines) {
    let m;
    if (!line.trim()) {
      flushPara();
      flushList();
    } else if ((m = line.match(/^\s*#{1,6}\s+(.*)$/))) {
      flushPara();
      flushList();
      html.push(`<h4>${inline(m[1])}</h4>`);
    } else if ((m = line.match(/^\s*([-*•]|\d+[.)])\s+(.*)$/))) {
      flushPara();
      const type = /\d/.test(m[1]) ? 'ol' : 'ul';
      if (!list || list.type !== type) {
        flushList();
        list = { type, items: [] };
      }
      list.items.push(m[2]);
    } else if (list && /^\s{2,}\S/.test(line)) {
      list.items[list.items.length - 1] += ' ' + line.trim();
    } else {
      flushList();
      para.push(line);
    }
  }
  flushPara();
  flushList();
  return html.join('');
}

const RE_SEARCH = /^\s*<{5,9}\s*SEARCH\s*$/;
const RE_DIVIDER = /^\s*={5,9}\s*$/;
const RE_REPLACE = /^\s*>{5,9}\s*REPLACE\s*$/;
const RE_FENCE_OPEN = /^\s*```\s*([\w+-]*)\s*$/;
const RE_FENCE_CLOSE = /^\s*```\s*$/;

/**
 * Split an assistant reply into prose, edit blocks and code blocks.
 * Works on partial (streaming) text: unfinished blocks come back with complete=false.
 */
export function parseReply(text) {
  const lines = String(text).replace(/\r/g, '').split('\n');
  const segs = [];
  let md = [];
  let cur = null;
  let mode = 'md';
  let fenceWrapsEdits = false;
  const flushMd = () => {
    if (md.join('').trim()) segs.push({ type: 'md', text: md.join('\n') });
    md = [];
  };
  for (const line of lines) {
    if (mode === 'md') {
      if (RE_SEARCH.test(line)) {
        flushMd();
        cur = { type: 'edit', search: [], replace: [] };
        mode = 'search';
      } else if (fenceWrapsEdits && RE_FENCE_CLOSE.test(line)) {
        fenceWrapsEdits = false;
      } else if (RE_FENCE_OPEN.test(line)) {
        flushMd();
        cur = { type: 'code', lang: line.match(RE_FENCE_OPEN)[1] || '', lines: [] };
        mode = 'code';
      } else md.push(line);
    } else if (mode === 'search') {
      if (RE_DIVIDER.test(line)) mode = 'replace';
      else cur.search.push(line);
    } else if (mode === 'replace') {
      if (RE_REPLACE.test(line)) {
        segs.push(finishEdit(cur, true));
        cur = null;
        mode = 'md';
      } else cur.replace.push(line);
    } else if (mode === 'code') {
      if (RE_SEARCH.test(line) && !cur.lines.join('').trim()) {
        // Model wrapped its edit blocks in a code fence — unwrap it.
        fenceWrapsEdits = true;
        cur = { type: 'edit', search: [], replace: [] };
        mode = 'search';
      } else if (RE_FENCE_CLOSE.test(line)) {
        segs.push({ type: 'code', lang: cur.lang, code: cur.lines.join('\n'), complete: true });
        cur = null;
        mode = 'md';
      } else cur.lines.push(line);
    }
  }
  if (mode === 'md') flushMd();
  else if (mode === 'code') segs.push({ type: 'code', lang: cur.lang, code: cur.lines.join('\n'), complete: false });
  else segs.push(finishEdit(cur, false));
  return segs;
}

function finishEdit(cur, complete) {
  return { type: 'edit', search: cur.search.join('\n'), replace: cur.replace.join('\n'), complete };
}

/** Find `search` in `doc`: exact first, then ignoring per-line indentation/trailing whitespace. */
export function locate(doc, search) {
  if (!search.trim()) return null;
  const exact = doc.indexOf(search);
  if (exact >= 0) return [exact, exact + search.length];
  const docLines = doc.split('\n');
  const want = search.split('\n').map((l) => l.trim());
  while (want.length && !want[0]) want.shift();
  while (want.length && !want.at(-1)) want.pop();
  if (!want.length) return null;
  const offsets = [];
  let acc = 0;
  for (const l of docLines) {
    offsets.push(acc);
    acc += l.length + 1;
  }
  outer: for (let i = 0; i + want.length <= docLines.length; i++) {
    for (let j = 0; j < want.length; j++) if (docLines[i + j].trim() !== want[j]) continue outer;
    const end = i + want.length - 1;
    return [offsets[i], offsets[end] + docLines[end].length];
  }
  return null;
}

/** Line diff (LCS) with collapsed context, for the edit cards. */
export function lineDiff(a, b, context = 2) {
  const A = a ? a.split('\n') : [];
  const B = b ? b.split('\n') : [];
  if (A.length * B.length > 250000) return [...A.map((t) => ({ t, k: 'del' })), ...B.map((t) => ({ t, k: 'add' }))];
  const n = A.length;
  const m = B.length;
  const dp = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const ops = [];
  let i = 0;
  let j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && A[i] === B[j]) {
      ops.push({ t: A[i], k: 'ctx' });
      i++;
      j++;
    } else if (i < n && (j === m || dp[i + 1][j] >= dp[i][j + 1])) ops.push({ t: A[i++], k: 'del' });
    else ops.push({ t: B[j++], k: 'add' });
  }
  const clean = ops;
  // Collapse long unchanged stretches.
  const keep = clean.map((o, idx) => o.k !== 'ctx' || clean.slice(Math.max(0, idx - context), idx + context + 1).some((x) => x.k !== 'ctx'));
  const out = [];
  let gap = false;
  clean.forEach((o, idx) => {
    if (keep[idx]) {
      out.push(o);
      gap = false;
    } else if (!gap) {
      out.push({ t: '⋯', k: 'gap' });
      gap = true;
    }
  });
  return out;
}
