// Safety check for projects that people with an edit link can change.
// LaTeX can read (and write) any file the compiler can reach, so a collaborator could otherwise
// pull files from the owner's computer into the PDF. Before compiling such a project, every text
// file is scanned and anything that could reach outside the project folder is refused.
// This is a strict filter, not a sandbox: only give edit links to people you trust.
import fsp from 'node:fs/promises';
import path from 'node:path';
import { listFiles, projectDir } from './projects.js';

// Commands whose argument is a file path.
const FILE_CMDS =
  'input|include|InputIfFileExists|IfFileExists|includegraphics|includepdf|includesvg|lstinputlisting|verbatiminput|VerbatimInput|inputminted|import|subimport|includefrom|subincludefrom|inputfrom|subinputfrom|bibliography|addbibresource|bibliographystyle|documentclass|usepackage|RequirePackage|LoadClass|includeonly|externaldocument|graphicspath|pgfplotstableread|DTLloaddb|csvreader|csvautotabular|csvautobooktabular|addplot\\s*(?:\\+)?\\s*table|includestandalone';

// Primitives and tricks that read/write arbitrary files or build commands from strings.
const FORBIDDEN = [
  [/\\(?:immediate\s*)?\\?openout\b/, 'writing files (\\openout)'],
  [/\\openin\b/, 'reading files (\\openin)'],
  [/\\read\s*\d/, 'reading files (\\read)'],
  [/\\(?:directlua|luaexec|luadirect|latelua|luacode)\b/, 'running Lua code'],
  [/\\begin\s*\{\s*luacode\*?\s*\}/, 'running Lua code'],
  [/\\(?:write18|ShellEscape|immediate\s*\\write18)\b/, 'running shell commands'],
  [/\\catcode\b/, 'changing character codes (\\catcode)'],
  [/\\scantokens\b/, 're-reading text as code (\\scantokens)'],
  [/\\(?:pdffiledump|pdfmdfivesum|filedump|mdfivesum|pdffilesize|filesize|pdffilemoddate|filemoddate)\b/, 'inspecting files'],
  [/\\csname\s*(?:@*input|include|openin|read|import|directlua|includegraphics|lstinputlisting)/, 'building file commands by name'],
  [/\\(?:@*input|include)\s+[^{\s\\]/, 'reading a file without braces'],
  [/\\(?:@@input|@iinput|input@path)\b/, 'low-level file input'],
  [/\\begin\s*\{\s*filecontents\*?\s*\}\s*(?:\[[^\]]*\])?\s*\{\s*[^}]*(?:\.\.|^[/\\~]|[A-Za-z]:)/, 'writing files outside the project'],
];

const ESCAPES_PROJECT = (p) => /(^|[\\/])\.\.([\\/]|$)/.test(p) || /^\s*([/\\~]|[A-Za-z]:)/.test(p) || /^\s*file:/i.test(p);

function lineOf(src, index) {
  return src.slice(0, index).split('\n').length;
}

/** @returns {Array<{file: string, line: number, message: string}>} problems found (empty = safe to compile) */
export async function scanProject(project) {
  const dir = projectDir(project);
  const problems = [];
  const fileArg = new RegExp(`\\\\(?:${FILE_CMDS})\\*?\\s*(?:\\[[^\\]]*\\]\\s*)*\\{([^}]*)\\}`, 'g');
  for (const f of await listFiles(project)) {
    if (f.kind !== 'text') continue;
    const raw = await fsp.readFile(path.join(dir, f.path), 'utf8');
    // Ignore comments (but not escaped \%).
    const src = raw.replace(/(^|[^\\])%.*$/gm, (m, pre) => pre + ' '.repeat(m.length - pre.length));
    for (const [re, what] of FORBIDDEN) {
      const m = re.exec(src);
      if (m) problems.push({ file: f.path, line: lineOf(src, m.index), message: `Blocked for safety: ${what} isn't allowed in projects shared with edit access.` });
    }
    for (const m of src.matchAll(fileArg)) {
      for (const p of m[1].split(',')) {
        if (ESCAPES_PROJECT(p)) problems.push({ file: f.path, line: lineOf(src, m.index), message: `Blocked for safety: "${p.trim()}" points outside the project folder.` });
        else if (p.includes('\\')) problems.push({ file: f.path, line: lineOf(src, m.index), message: `Blocked for safety: file names built from macros ("${p.trim()}") aren't allowed in shared projects.` });
      }
    }
  }
  return problems;
}

/** kpathsea settings that make TeX Live/MiKTeX refuse absolute and parent paths ("paranoid" mode). */
export const PARANOID_ENV = { openin_any: 'p', openout_any: 'p', shell_escape: 'f' };
