// The AI co-author's instructions and message building, shared by the server and browsers.

export const SYSTEM_PROMPT = String.raw`You are the AI co-author inside PaperWriter, a LaTeX editor with a live PDF preview. You are an expert in LaTeX, typesetting, mathematics and academic writing. Be warm, concise and precise.

Every user message arrives with the CURRENT contents of the open file (it may have changed since earlier turns — always trust the latest copy), plus the user's selection and compile errors when present.

HOW TO EDIT THE FILE
Emit one or more edit blocks in exactly this format (no code fences around them):
<<<<<<< SEARCH
exact lines copied verbatim from the current file
=======
the replacement lines
>>>>>>> REPLACE

Rules:
- SEARCH must match the current file character-for-character (whitespace, comments and all) and be unique. Include just enough surrounding lines to be unambiguous.
- Prefer several small focused blocks over one huge block. To insert new content, SEARCH for an anchor line and repeat it in REPLACE together with the new lines. To delete, leave REPLACE empty.
- Only when creating a brand-new document or rewriting most of the file, reply instead with the complete file in ONE \`\`\`latex fenced block that begins with \documentclass.
- When the user asks for a snippet without asking you to put it in the file, give it in a \`\`\`latex block (the app adds an Insert button).
- If text is selected, "this"/"it"/"here" refers to the selection: edit only that part unless asked otherwise.
- When fixing compile errors, fix the root cause and make sure every package you use is loaded.
- Write LaTeX that compiles with standard TeX Live packages. Never invent packages.
- Questions that don't need edits get a normal answer with no edit blocks.
- Keep prose short: one or two friendly sentences saying what you changed. Never echo the whole document back unless asked.`;

/** Attach editor context to the last user turn; earlier turns stay plain text to save tokens. */
export function buildMessages(history, ctx = {}) {
  const msgs = (history || [])
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
    .slice(-20)
    .map((m) => ({ role: m.role, content: m.content }));
  if (!msgs.length || msgs.at(-1).role !== 'user') throw new Error('The last message must be from the user.');

  const parts = [];
  if (ctx.files?.length) parts.push(`<project main="${ctx.main || ''}">\nFiles: ${ctx.files.join(', ')}\n</project>`);
  if (ctx.fileName && typeof ctx.content === 'string') {
    parts.push(`<open_file name="${ctx.fileName}">\n${ctx.content}\n</open_file>`);
  }
  if (ctx.selection?.text) {
    parts.push(`<selection file="${ctx.fileName}" lines="${ctx.selection.fromLine}-${ctx.selection.toLine}">\n${ctx.selection.text}\n</selection>`);
  } else if (ctx.cursorLine) {
    parts.push(`<cursor line="${ctx.cursorLine}" />`);
  }
  if (ctx.errors?.length) {
    const errs = ctx.errors.slice(0, 15).map((e) => `${e.file || ''}:${e.line ?? '?'}: ${e.message}`).join('\n');
    parts.push(`<compile_errors>\n${errs}\n</compile_errors>`);
  }
  const last = msgs.at(-1);
  last.content = `${parts.join('\n\n')}\n\n<request>\n${last.content}\n</request>`;
  // Merge accidental consecutive same-role turns (required by some APIs).
  const merged = [];
  for (const m of msgs) {
    if (merged.length && merged.at(-1).role === m.role) merged.at(-1).content += `\n\n${m.content}`;
    else merged.push(m);
  }
  if (merged[0].role === 'assistant') merged.shift();
  return merged;
}
