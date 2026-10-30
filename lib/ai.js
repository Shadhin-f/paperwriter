import fsp from 'node:fs/promises';
import path from 'node:path';
import { DATA, which, run, spawnProgram } from './util.js';
import { getSettings, apiKey } from './settings.js';

export const PROVIDERS = {
  'claude-cli': { label: 'Claude Code', sub: 'Your logged-in terminal account', kind: 'cli' },
  anthropic: { label: 'Claude API', sub: 'Anthropic API key', kind: 'api' },
  openai: { label: 'ChatGPT API', sub: 'OpenAI API key', kind: 'api' },
  gemini: { label: 'Gemini API', sub: 'Google AI Studio key', kind: 'api' },
  ollama: { label: 'Ollama', sub: 'Local models on this machine', kind: 'local' },
  compat: { label: 'OpenAI-compatible', sub: 'LM Studio, llama.cpp, vLLM…', kind: 'local' },
  'gemini-cli': { label: 'Gemini CLI', sub: 'Your logged-in gemini CLI', kind: 'cli' },
  'codex-cli': { label: 'Codex CLI', sub: 'Your logged-in ChatGPT/codex CLI', kind: 'cli' },
};

const DEFAULT_MODELS = {
  'claude-cli': [
    { id: 'default', label: 'Account default' },
    { id: 'opus', label: 'Opus (latest)' },
    { id: 'sonnet', label: 'Sonnet (latest)' },
    { id: 'haiku', label: 'Haiku (latest)' },
  ],
  anthropic: [
    { id: 'claude-opus-5-5', label: 'Claude Opus 5.5' },
    { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5' },
    { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5' },
    { id: 'claude-fable-5-1', label: 'Claude Fable 5.1' },
  ],
  openai: [
    { id: 'gpt-5', label: 'GPT-5' },
    { id: 'gpt-5-mini', label: 'GPT-5 mini' },
    { id: 'gpt-4.1', label: 'GPT-4.1' },
  ],
  gemini: [
    { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
    { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
  ],
  'gemini-cli': [{ id: 'default', label: 'CLI default' }, { id: 'gemini-2.5-pro', label: 'gemini-2.5-pro' }, { id: 'gemini-2.5-flash', label: 'gemini-2.5-flash' }],
  'codex-cli': [{ id: 'default', label: 'CLI default' }],
  ollama: [],
  compat: [],
};

const CLI_BIN = { 'claude-cli': 'claude', 'gemini-cli': 'gemini', 'codex-cli': 'codex' };
const trimSlash = (u) => String(u || '').replace(/\/+$/, '');

async function quickFetch(url, opts = {}, ms = 1500) {
  return fetch(url, { ...opts, signal: AbortSignal.timeout(ms) });
}

let statusCache = null;
let statusAt = 0;

export async function providerStatus(force = false) {
  if (!force && statusCache && Date.now() - statusAt < 15000) return statusCache;
  const s = getSettings();
  const out = {};
  const [claude, gemini, codex] = await Promise.all(['claude', 'gemini', 'codex'].map(which));
  const cliPaths = { 'claude-cli': claude, 'gemini-cli': gemini, 'codex-cli': codex };

  for (const id of Object.keys(PROVIDERS)) out[id] = { ...PROVIDERS[id], id, available: false, detail: '' };

  for (const id of ['claude-cli', 'gemini-cli', 'codex-cli']) {
    out[id].available = !!cliPaths[id];
    out[id].detail = cliPaths[id] ? `Found at ${cliPaths[id]}` : `"${CLI_BIN[id]}" not found on PATH`;
  }
  if (claude) {
    const r = await run(claude, ['auth', 'status', '--json'], { timeout: 15000 });
    try {
      const st = JSON.parse(r.stdout);
      out['claude-cli'].available = !!st.loggedIn;
      out['claude-cli'].detail = st.loggedIn
        ? `Logged in${st.subscriptionType ? ` · ${st.subscriptionType} plan` : ''}${st.authMethod ? ` via ${st.authMethod}` : ''}`
        : 'Installed but not logged in — run "claude" in a terminal and sign in.';
    } catch {}
  }
  for (const id of ['anthropic', 'openai', 'gemini']) {
    out[id].available = !!apiKey(id);
    out[id].detail = out[id].available ? 'API key set' : 'Add an API key in Settings';
  }
  try {
    const r = await quickFetch(`${trimSlash(s.ollamaUrl)}/api/tags`);
    const j = await r.json();
    out.ollama.available = r.ok;
    out.ollama.detail = `${j.models?.length || 0} model(s) at ${s.ollamaUrl}`;
  } catch {
    out.ollama.detail = `Not reachable at ${s.ollamaUrl}`;
  }
  if (s.compatUrl) {
    try {
      const key = apiKey('compat');
      const r = await quickFetch(`${trimSlash(s.compatUrl)}/models`, { headers: key ? { Authorization: `Bearer ${key}` } : {} });
      out.compat.available = r.ok;
      out.compat.detail = r.ok ? `Server at ${s.compatUrl}` : `HTTP ${r.status} from ${s.compatUrl}`;
    } catch {
      out.compat.detail = `Not reachable at ${s.compatUrl}`;
    }
  }
  statusCache = out;
  statusAt = Date.now();
  return out;
}

async function errorFrom(res, provider) {
  let msg = '';
  try {
    const t = await res.text();
    try {
      const j = JSON.parse(t);
      msg = j.error?.message || j.error || j.message || t;
    } catch {
      msg = t;
    }
  } catch {}
  return new Error(`${PROVIDERS[provider]?.label || provider} error ${res.status}: ${String(msg).slice(0, 500)}`);
}

export async function listModels(provider) {
  const s = getSettings();
  const fallback = DEFAULT_MODELS[provider] || [];
  try {
    if (provider === 'anthropic' && apiKey('anthropic')) {
      const r = await quickFetch('https://api.anthropic.com/v1/models?limit=100', {
        headers: { 'x-api-key': apiKey('anthropic'), 'anthropic-version': '2023-06-01' },
      }, 8000);
      if (!r.ok) throw await errorFrom(r, provider);
      const j = await r.json();
      return j.data.map((m) => ({ id: m.id, label: m.display_name || m.id }));
    }
    if (provider === 'openai' && apiKey('openai')) {
      const r = await quickFetch('https://api.openai.com/v1/models', { headers: { Authorization: `Bearer ${apiKey('openai')}` } }, 8000);
      if (!r.ok) throw await errorFrom(r, provider);
      const j = await r.json();
      return j.data
        .map((m) => m.id)
        .filter((id) => /^(gpt|o\d|chatgpt)/.test(id) && !/(audio|realtime|tts|transcribe|image|search|embedding|instruct)/.test(id))
        .sort((a, b) => b.localeCompare(a))
        .map((id) => ({ id, label: id }));
    }
    if (provider === 'gemini' && apiKey('gemini')) {
      const r = await quickFetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=200', {
        headers: { 'x-goog-api-key': apiKey('gemini') },
      }, 8000);
      if (!r.ok) throw await errorFrom(r, provider);
      const j = await r.json();
      return j.models
        .filter((m) => m.supportedGenerationMethods?.includes('generateContent') && /gemini/.test(m.name) && !/(embedding|image|tts|audio)/.test(m.name))
        .map((m) => ({ id: m.name.replace(/^models\//, ''), label: m.displayName || m.name }));
    }
    if (provider === 'ollama') {
      const r = await quickFetch(`${trimSlash(s.ollamaUrl)}/api/tags`, {}, 4000);
      const j = await r.json();
      return (j.models || []).map((m) => ({ id: m.name, label: m.name }));
    }
    if (provider === 'compat') {
      const key = apiKey('compat');
      const r = await quickFetch(`${trimSlash(s.compatUrl)}/models`, { headers: key ? { Authorization: `Bearer ${key}` } : {} }, 4000);
      const j = await r.json();
      return (j.data || []).map((m) => ({ id: m.id, label: m.id }));
    }
  } catch (e) {
    if (!fallback.length) throw e;
  }
  return fallback;
}

/* ───────────────────────── streaming helpers ───────────────────────── */

async function* readLines(stream) {
  const dec = new TextDecoder();
  let buf = '';
  for await (const chunk of stream) {
    buf += typeof chunk === 'string' ? chunk : dec.decode(chunk, { stream: true });
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      yield buf.slice(0, i).replace(/\r$/, '');
      buf = buf.slice(i + 1);
    }
  }
  if (buf) yield buf;
}

async function* readSse(stream) {
  let data = [];
  for await (const line of readLines(stream)) {
    if (line === '') {
      if (data.length) yield data.join('\n');
      data = [];
    } else if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /, ''));
  }
  if (data.length) yield data.join('\n');
}

/* ───────────────────────── providers ───────────────────────── */

async function* anthropicChat({ model, system, messages, signal }) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    signal,
    headers: { 'x-api-key': apiKey('anthropic'), 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model, max_tokens: 16000, system, messages, stream: true }),
  });
  if (!res.ok) throw await errorFrom(res, 'anthropic');
  for await (const data of readSse(res.body)) {
    let ev;
    try {
      ev = JSON.parse(data);
    } catch {
      continue;
    }
    if (ev.type === 'content_block_delta' && ev.delta?.type === 'text_delta') yield ev.delta.text;
    else if (ev.type === 'error') throw new Error(`Claude API: ${ev.error?.message || 'stream error'}`);
  }
}

async function* openaiStyleChat({ url, key, model, system, messages, signal, provider }) {
  const res = await fetch(url, {
    method: 'POST',
    signal,
    headers: { 'content-type': 'application/json', ...(key ? { Authorization: `Bearer ${key}` } : {}) },
    body: JSON.stringify({ model, stream: true, messages: [{ role: 'system', content: system }, ...messages] }),
  });
  if (!res.ok) throw await errorFrom(res, provider);
  for await (const data of readSse(res.body)) {
    if (data === '[DONE]') break;
    let ev;
    try {
      ev = JSON.parse(data);
    } catch {
      continue;
    }
    if (ev.error) throw new Error(ev.error.message || 'stream error');
    const t = ev.choices?.[0]?.delta?.content;
    if (t) yield t;
  }
}

async function* geminiChat({ model, system, messages, signal }) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`;
  const res = await fetch(url, {
    method: 'POST',
    signal,
    headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey('gemini') },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: messages.map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
    }),
  });
  if (!res.ok) throw await errorFrom(res, 'gemini');
  for await (const data of readSse(res.body)) {
    let ev;
    try {
      ev = JSON.parse(data);
    } catch {
      continue;
    }
    if (ev.error) throw new Error(`Gemini: ${ev.error.message}`);
    for (const p of ev.candidates?.[0]?.content?.parts || []) if (p.text && !p.thought) yield p.text;
  }
}

async function* ollamaChat({ model, system, messages, signal }) {
  const res = await fetch(`${trimSlash(getSettings().ollamaUrl)}/api/chat`, {
    method: 'POST',
    signal,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model, stream: true, messages: [{ role: 'system', content: system }, ...messages], options: { num_ctx: 32768 } }),
  });
  if (!res.ok) throw await errorFrom(res, 'ollama');
  for await (const line of readLines(res.body)) {
    if (!line.trim()) continue;
    let ev;
    try {
      ev = JSON.parse(line);
    } catch {
      continue;
    }
    if (ev.error) throw new Error(`Ollama: ${ev.error}`);
    if (ev.message?.content) yield ev.message.content;
  }
}

/** Flatten a multi-turn chat into one prompt for CLIs that take a single message. */
function transcript(messages) {
  if (messages.length === 1) return messages[0].content;
  const past = messages
    .slice(0, -1)
    .map((m) => `<${m.role}>\n${m.content}\n</${m.role}>`)
    .join('\n\n');
  return `<conversation_so_far>\n${past}\n</conversation_so_far>\n\n${messages.at(-1).content}`;
}

/** Spawn a CLI and yield stdout lines as they arrive. */
async function* cliLines(file, args, { input, signal, cwd }) {
  const child = spawnProgram(file, args, { cwd, env: process.env });
  const onAbort = () => child.kill();
  signal?.addEventListener('abort', onAbort);
  let stderr = '';
  let spawnError = null;
  child.stderr.on('data', (d) => (stderr += d));
  child.on('error', (e) => (spawnError = e));
  const exited = new Promise((r) => child.on('close', r));
  child.stdin.on('error', () => {});
  child.stdin.end(input);
  try {
    for await (const line of readLines(child.stdout)) yield line;
    const code = await exited;
    if (spawnError) throw spawnError;
    if (code !== 0 && !signal?.aborted) {
      throw Object.assign(new Error(stderr.trim().slice(-800) || `CLI exited with code ${code}`), { cliExit: code });
    }
  } finally {
    signal?.removeEventListener('abort', onAbort);
    if (child.exitCode == null) child.kill();
  }
}

async function cliWorkdir() {
  // An empty folder keeps the CLI from picking up this repo's CLAUDE.md / config.
  const dir = path.join(DATA, 'cli-sandbox');
  await fsp.mkdir(dir, { recursive: true });
  return dir;
}

async function* claudeCliChat({ model, system, messages, signal }) {
  const bin = await which('claude');
  if (!bin) throw new Error('Claude Code CLI not found. Install it and run "claude" once to log in.');
  const cwd = await cliWorkdir();
  const sysFile = path.join(cwd, 'system-prompt.txt');
  await fsp.writeFile(sysFile, system);
  const args = [
    '-p', '--output-format', 'stream-json', '--verbose', '--include-partial-messages',
    '--tools', '', '--no-session-persistence', '--strict-mcp-config',
    '--system-prompt-file', sysFile,
  ];
  if (model && model !== 'default') args.push('--model', model);
  let streamed = false;
  for await (const line of cliLines(bin, args, { input: transcript(messages), signal, cwd })) {
    let ev;
    try {
      ev = JSON.parse(line);
    } catch {
      continue;
    }
    if (ev.type === 'stream_event' && ev.event?.type === 'content_block_delta' && ev.event.delta?.type === 'text_delta') {
      streamed = true;
      yield ev.event.delta.text;
    } else if (ev.type === 'assistant' && !streamed) {
      const text = (ev.message?.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('');
      if (text) yield text;
    } else if (ev.type === 'result' && ev.is_error) {
      throw new Error(`Claude Code: ${ev.result || ev.subtype || 'error'}`);
    }
  }
}

async function* plainCliChat(provider, { model, system, messages, signal }) {
  const bin = await which(CLI_BIN[provider]);
  if (!bin) throw new Error(`${PROVIDERS[provider].label} not found on PATH.`);
  const cwd = await cliWorkdir();
  const prompt = `${system}\n\n${transcript(messages)}`;
  const args =
    provider === 'gemini-cli'
      ? [...(model && model !== 'default' ? ['-m', model] : []), '-p', 'Follow the instructions given on stdin.']
      : ['exec', '--skip-git-repo-check', ...(model && model !== 'default' ? ['-m', model] : []), '-'];
  for await (const line of cliLines(bin, args, { input: prompt, signal, cwd })) yield line + '\n';
}

export async function* streamChat({ provider, model, system, messages, signal }) {
  const s = getSettings();
  switch (provider) {
    case 'anthropic':
      if (!apiKey('anthropic')) throw new Error('Add your Anthropic API key in Settings first.');
      yield* anthropicChat({ model, system, messages, signal });
      break;
    case 'openai':
      if (!apiKey('openai')) throw new Error('Add your OpenAI API key in Settings first.');
      yield* openaiStyleChat({ url: 'https://api.openai.com/v1/chat/completions', key: apiKey('openai'), model, system, messages, signal, provider });
      break;
    case 'gemini':
      if (!apiKey('gemini')) throw new Error('Add your Gemini API key in Settings first.');
      yield* geminiChat({ model, system, messages, signal });
      break;
    case 'ollama':
      yield* ollamaChat({ model, system, messages, signal });
      break;
    case 'compat':
      yield* openaiStyleChat({ url: `${trimSlash(s.compatUrl)}/chat/completions`, key: apiKey('compat'), model, system, messages, signal, provider });
      break;
    case 'claude-cli':
      yield* claudeCliChat({ model, system, messages, signal });
      break;
    case 'gemini-cli':
    case 'codex-cli':
      yield* plainCliChat(provider, { model, system, messages, signal });
      break;
    default:
      throw new Error(`Unknown provider "${provider}"`);
  }
}

/* ───────────────────────── prompt building ───────────────────────── */

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
