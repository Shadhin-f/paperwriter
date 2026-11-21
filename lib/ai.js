import fsp from 'node:fs/promises';
import path from 'node:path';
import { DATA, which, run, spawnProgram } from './util.js';
import { getSettings, apiKey } from './settings.js';

export const PROVIDERS = {
  'claude-cli': { label: 'Claude Code', sub: 'Your logged-in terminal account', kind: 'cli' },
  anthropic: { label: 'Claude API', sub: 'Anthropic API key', kind: 'api' },
  openai: { label: 'ChatGPT API', sub: 'OpenAI API key', kind: 'api' },
  gemini: { label: 'Gemini API', sub: 'Google AI Studio key', kind: 'api' },
  openrouter: { label: 'OpenRouter', sub: 'One key, hundreds of models', kind: 'api' },
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
  openrouter: [{ id: 'openrouter/auto', label: 'Auto (picks a model for each request)' }],
  'gemini-cli': [{ id: 'default', label: 'CLI default' }, { id: 'gemini-2.5-pro', label: 'gemini-2.5-pro' }, { id: 'gemini-2.5-flash', label: 'gemini-2.5-flash' }],
  'codex-cli': [{ id: 'default', label: 'CLI default' }],
  ollama: [],
  compat: [],
};

/** Providers a collaborator can use with their own key. Each talks to a fixed, public address. */
export const BYOK_PROVIDERS = ['anthropic', 'openai', 'gemini', 'openrouter'];
const OPENROUTER = 'https://openrouter.ai/api/v1';

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
  for (const id of ['anthropic', 'openai', 'gemini', 'openrouter']) {
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

/** `key` is a collaborator's own key; without it, the host's saved key is used. */
export async function listModels(provider, key = '') {
  const s = getSettings();
  const fallback = DEFAULT_MODELS[provider] || [];
  const k = key || apiKey(provider);
  try {
    if (provider === 'openrouter') {
      const r = await quickFetch(`${OPENROUTER}/models`, { headers: k ? { Authorization: `Bearer ${k}` } : {} }, 8000);
      if (!r.ok) throw await errorFrom(r, provider);
      const j = await r.json();
      return [...fallback, ...(j.data || []).map((m) => ({ id: m.id, label: m.name || m.id })).sort((a, b) => a.label.localeCompare(b.label))];
    }
    if (provider === 'anthropic' && k) {
      const r = await quickFetch('https://api.anthropic.com/v1/models?limit=100', {
        headers: { 'x-api-key': k, 'anthropic-version': '2023-06-01' },
      }, 8000);
      if (!r.ok) throw await errorFrom(r, provider);
      const j = await r.json();
      return j.data.map((m) => ({ id: m.id, label: m.display_name || m.id }));
    }
    if (provider === 'openai' && k) {
      const r = await quickFetch('https://api.openai.com/v1/models', { headers: { Authorization: `Bearer ${k}` } }, 8000);
      if (!r.ok) throw await errorFrom(r, provider);
      const j = await r.json();
      return j.data
        .map((m) => m.id)
        .filter((id) => /^(gpt|o\d|chatgpt)/.test(id) && !/(audio|realtime|tts|transcribe|image|search|embedding|instruct)/.test(id))
        .sort((a, b) => b.localeCompare(a))
        .map((id) => ({ id, label: id }));
    }
    if (provider === 'gemini' && k) {
      const r = await quickFetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=200', {
        headers: { 'x-goog-api-key': k },
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

/**
 * Checks an API key against its provider (no fallbacks: a wrong key fails) and suggests a model to start with.
 * Used by the setup guide's "Test and save".
 */
export async function verifyKey(provider, key) {
  const get = async (url, headers) => {
    let r;
    try {
      r = await quickFetch(url, { headers }, 10000);
    } catch {
      throw new Error(`Couldn’t reach ${PROVIDERS[provider].label}. Check your internet connection.`);
    }
    if (r.status === 400 || r.status === 401 || r.status === 403) throw new Error('That key wasn’t accepted. Copy it again, without spaces.');
    if (!r.ok) throw await errorFrom(r, provider);
    return r.json();
  };
  const pick = (ids, prefs) => prefs.map((re) => ids.find((id) => re.test(id))).find(Boolean) || ids[0] || null;
  if (provider === 'anthropic') {
    const j = await get('https://api.anthropic.com/v1/models?limit=100', { 'x-api-key': key, 'anthropic-version': '2023-06-01' });
    const ids = j.data.map((m) => m.id);
    return { count: ids.length, model: pick(ids, [/sonnet/, /opus/, /haiku/]) };
  }
  if (provider === 'openai') {
    const j = await get('https://api.openai.com/v1/models', { Authorization: `Bearer ${key}` });
    const ids = j.data.map((m) => m.id).filter((id) => /^(gpt|o\d)/.test(id));
    return { count: ids.length, model: pick(ids, [/^gpt-5$/, /^gpt-5/, /^gpt-4\.1$/]) };
  }
  if (provider === 'gemini') {
    const j = await get('https://generativelanguage.googleapis.com/v1beta/models?pageSize=200', { 'x-goog-api-key': key });
    const ids = j.models.filter((m) => m.supportedGenerationMethods?.includes('generateContent')).map((m) => m.name.replace(/^models\//, ''));
    // Flash models are in Google's free tier.
    return { count: ids.length, model: pick(ids, [/^gemini-2\.5-flash$/, /^gemini-[\d.]+-flash$/, /flash/]) };
  }
  if (provider === 'openrouter') {
    await get(`${OPENROUTER}/auth/key`, { Authorization: `Bearer ${key}` });
    const j = await get(`${OPENROUTER}/models`, {});
    const free = j.data.map((m) => m.id).filter((id) => id.endsWith(':free'));
    // Free models change often; prefer well-known general-purpose families.
    return { count: free.length, model: pick(free, [/gemma.*(27|31)b/, /deepseek/, /qwen/, /llama/, /gemma/, /nemotron.*super/]) || 'openrouter/auto' };
  }
  throw new Error('Unknown provider');
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

async function* anthropicChat({ key, model, system, messages, signal }) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    signal,
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
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

async function* geminiChat({ key, model, system, messages, signal }) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`;
  const res = await fetch(url, {
    method: 'POST',
    signal,
    headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
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

/**
 * Streams a reply. `key` is a collaborator's own API key (used for this request only, never stored);
 * without it, the host's saved key is used.
 */
export async function* streamChat({ provider, model, system, messages, signal, key = '' }) {
  const s = getSettings();
  const k = key || apiKey(provider);
  const need = (name) => {
    if (!k) throw new Error(`Add your ${name} API key in Settings first.`);
  };
  switch (provider) {
    case 'anthropic':
      need('Anthropic');
      yield* anthropicChat({ key: k, model, system, messages, signal });
      break;
    case 'openai':
      need('OpenAI');
      yield* openaiStyleChat({ url: 'https://api.openai.com/v1/chat/completions', key: k, model, system, messages, signal, provider });
      break;
    case 'gemini':
      need('Gemini');
      yield* geminiChat({ key: k, model, system, messages, signal });
      break;
    case 'openrouter':
      need('OpenRouter');
      yield* openaiStyleChat({ url: `${OPENROUTER}/chat/completions`, key: k, model, system, messages, signal, provider });
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

/* Prompt building lives in public/prompt.js, so browsers calling a provider directly use the same prompt. */
export { SYSTEM_PROMPT, buildMessages } from '../public/prompt.js';
