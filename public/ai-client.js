// AI that belongs to the person using this browser, not to the host of the workspace:
//  • "Your keys": the browser calls the provider directly, so the key never reaches the host's server.
//  • "Your computer": the browser talks to the person's own PaperWriter on http://localhost, which
//    runs Claude Code, Ollama or their saved keys. Nothing about it passes through the host.
import { SYSTEM_PROMPT, buildMessages } from './prompt.js';

export const DIRECT = {
  anthropic: { label: 'Claude API', keyUrl: 'https://console.anthropic.com/settings/keys', placeholder: 'sk-ant-…' },
  openai: { label: 'ChatGPT API', keyUrl: 'https://platform.openai.com/api-keys', placeholder: 'sk-…' },
  gemini: { label: 'Gemini API', keyUrl: 'https://aistudio.google.com/apikey', placeholder: 'AIza…' },
  openrouter: { label: 'OpenRouter', keyUrl: 'https://openrouter.ai/keys', placeholder: 'sk-or-…' },
};

const FALLBACK_MODELS = {
  anthropic: [
    { id: 'claude-opus-5-5', label: 'Claude Opus 5.5' },
    { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5' },
    { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5' },
  ],
  openai: [
    { id: 'gpt-5', label: 'GPT-5' },
    { id: 'gpt-5-mini', label: 'GPT-5 mini' },
  ],
  gemini: [
    { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
    { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
  ],
  openrouter: [{ id: 'openrouter/auto', label: 'Auto (picks a model for each request)' }],
};

const ANTHROPIC_HEADERS = (key) => ({
  'x-api-key': key,
  'anthropic-version': '2023-06-01',
  // Anthropic only answers browsers that say they hold their own key.
  'anthropic-dangerous-direct-browser-access': 'true',
});

async function failure(res, label) {
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
  return new Error(`${label} error ${res.status}: ${String(msg).slice(0, 300)}`);
}

async function* lines(body) {
  const reader = body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      yield buf.slice(0, i).replace(/\r$/, '');
      buf = buf.slice(i + 1);
    }
  }
  if (buf) yield buf;
}

/** Server-sent events: yields each event's data. */
export async function* sse(body) {
  let data = [];
  for await (const line of lines(body)) {
    if (line === '') {
      if (data.length) yield data.join('\n');
      data = [];
    } else if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /, ''));
  }
  if (data.length) yield data.join('\n');
}

/* ───────── your keys, straight from this browser ───────── */

export async function directModels(provider, key) {
  const fallback = FALLBACK_MODELS[provider] || [];
  try {
    if (provider === 'anthropic') {
      const r = await fetch('https://api.anthropic.com/v1/models?limit=100', { headers: ANTHROPIC_HEADERS(key) });
      if (!r.ok) throw await failure(r, 'Claude API');
      return (await r.json()).data.map((m) => ({ id: m.id, label: m.display_name || m.id }));
    }
    if (provider === 'openai') {
      const r = await fetch('https://api.openai.com/v1/models', { headers: { Authorization: `Bearer ${key}` } });
      if (!r.ok) throw await failure(r, 'OpenAI');
      return (await r.json()).data
        .map((m) => m.id)
        .filter((id) => /^(gpt|o\d|chatgpt)/.test(id) && !/(audio|realtime|tts|transcribe|image|search|embedding|instruct)/.test(id))
        .sort((a, b) => b.localeCompare(a))
        .map((id) => ({ id, label: id }));
    }
    if (provider === 'gemini') {
      const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=200', { headers: { 'x-goog-api-key': key } });
      if (!r.ok) throw await failure(r, 'Gemini');
      return (await r.json()).models
        .filter((m) => m.supportedGenerationMethods?.includes('generateContent') && /gemini/.test(m.name) && !/(embedding|image|tts|audio)/.test(m.name))
        .map((m) => ({ id: m.name.replace(/^models\//, ''), label: m.displayName || m.name }));
    }
    if (provider === 'openrouter') {
      const r = await fetch('https://openrouter.ai/api/v1/models', { headers: { Authorization: `Bearer ${key}` } });
      if (!r.ok) throw await failure(r, 'OpenRouter');
      const all = (await r.json()).data.map((m) => ({ id: m.id, label: m.name || m.id })).sort((a, b) => a.label.localeCompare(b.label));
      return [...fallback, ...all];
    }
  } catch (e) {
    if (!fallback.length) throw e;
    if (/ 40[13]:/.test(e.message)) throw e; // a wrong key should say so, not show a stale list
  }
  return fallback;
}

/** Streams a reply using the person's own key. The host's server is never involved. */
export async function* directChat({ provider, key, model, history, context, signal }) {
  const messages = buildMessages(history, context);
  const system = SYSTEM_PROMPT;
  const label = DIRECT[provider]?.label || provider;
  if (provider === 'anthropic') {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal,
      headers: { ...ANTHROPIC_HEADERS(key), 'content-type': 'application/json' },
      body: JSON.stringify({ model, max_tokens: 16000, system, messages, stream: true }),
    });
    if (!res.ok) throw await failure(res, label);
    for await (const data of sse(res.body)) {
      let ev;
      try {
        ev = JSON.parse(data);
      } catch {
        continue;
      }
      if (ev.type === 'content_block_delta' && ev.delta?.type === 'text_delta') yield ev.delta.text;
      else if (ev.type === 'error') throw new Error(`${label}: ${ev.error?.message || 'stream error'}`);
    }
    return;
  }
  if (provider === 'gemini') {
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
    if (!res.ok) throw await failure(res, label);
    for await (const data of sse(res.body)) {
      let ev;
      try {
        ev = JSON.parse(data);
      } catch {
        continue;
      }
      if (ev.error) throw new Error(`${label}: ${ev.error.message}`);
      for (const p of ev.candidates?.[0]?.content?.parts || []) if (p.text && !p.thought) yield p.text;
    }
    return;
  }
  const url = provider === 'openai' ? 'https://api.openai.com/v1/chat/completions' : 'https://openrouter.ai/api/v1/chat/completions';
  const res = await fetch(url, {
    method: 'POST',
    signal,
    headers: { 'content-type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model, stream: true, messages: [{ role: 'system', content: system }, ...messages] }),
  });
  if (!res.ok) throw await failure(res, label);
  for await (const data of sse(res.body)) {
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

/* ───────── your computer: your own PaperWriter on localhost ───────── */

export class Bridge {
  /** @param {{ url: string, key: string }} conf */
  constructor(conf) {
    this.url = String(conf.url || 'http://localhost:5178').replace(/\/+$/, '');
    this.key = conf.key || '';
  }

  async call(path, opts = {}) {
    let res;
    try {
      res = await fetch(`${this.url}/bridge/${path}`, { ...opts, headers: { 'x-pw-bridge': this.key, ...(opts.body ? { 'content-type': 'application/json' } : {}) } });
    } catch {
      throw new Error(`Couldn’t reach PaperWriter at ${this.url}. Start it on your computer, and allow access if your browser asks.`);
    }
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `PaperWriter on your computer answered ${res.status}`);
    return res;
  }

  /** { name, providers: { id: { label, detail } } } */
  async status() {
    return (await this.call('status')).json();
  }

  async models(provider) {
    return (await (await this.call(`models?provider=${encodeURIComponent(provider)}`)).json()).models;
  }

  async *chat({ provider, model, history, context, signal }) {
    const res = await this.call('chat', { method: 'POST', signal, body: JSON.stringify({ provider, model, messages: history, context }) });
    for await (const data of sse(res.body)) {
      let ev;
      try {
        ev = JSON.parse(data);
      } catch {
        continue;
      }
      if (ev.type === 'text') yield ev.text;
      else if (ev.type === 'error') throw new Error(ev.error);
    }
  }
}
