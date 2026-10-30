# PaperWriter

An open-source LaTeX studio that runs on your own computer: write in code or on a visual page, see the PDF live,
draft and fix your paper with an AI co-author, and invite others to edit with you in real time.
No accounts and no cloud. Your papers, keys and chats never leave your machine.

## Quick start

You need [Node.js](https://nodejs.org) 22.9 or newer.

```bash
git clone https://github.com/Shadhin-f/paperwriter.git
cd paperwriter
npm install
npm start
```

Open **http://localhost:5178**. The first time, PaperWriter offers to install [Tectonic](https://tectonic-typesetting.github.io), a small self-contained LaTeX engine, with one click.
It also uses TeX Live or MiKTeX if you already have them.

## Features

- **Code + live PDF.** A LaTeX editor with syntax highlighting, error markers that jump to the line, and a crisp PDF preview.
- **Visual editor.** Switch to **Visual** to type directly on the page. Equations render as you'd see them,
  and you drag blocks by their **⠿** handle to reorder. Every change is written back to the `.tex` source.
- **AI co-author.** Chat with Claude, ChatGPT, Gemini or a local model. It edits your paper with reviewable diffs
  you can apply or revert, and fixes compile errors on request.
- **Live co-editing.** Share a link and edit together, with everyone's cursors and avatars visible. Undo only undoes your own changes.
- **Files stay files.** Projects are plain folders in `projects/`, so you can use git, Dropbox or any other editor alongside PaperWriter.
- **Import from anywhere.** *Project menu → Import project…* (or drag the file onto the side panel) brings in an export from
  Overleaf, Prism, Authorea, arXiv and similar platforms: `.zip`, `.tar.gz`/`.tgz`/`.tar`, a gzipped `.tex`, or a single `.tex`.
  The main file is detected automatically, wrapper folders and build files (`.aux`, `.log`, …) are dropped, and nothing outside the new project folder is ever written.
- Works on phones and tablets, with light and dark themes.

## AI models

Pick a model from the pill at the top of the chat. Use whichever you have:

| Provider | What you need |
| --- | --- |
| **Claude Code** | The [`claude` CLI](https://docs.claude.com/en/docs/claude-code), logged in. Uses your Claude subscription; no API key needed. |
| **Claude / ChatGPT / Gemini API** | An API key (Settings), or `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` / `GEMINI_API_KEY` |
| **Ollama** | [Ollama](https://ollama.com) running locally. Your pulled models appear automatically. |
| **OpenAI-compatible** | Any `/v1` server: LM Studio, llama.cpp, vLLM, OpenRouter… |
| Gemini CLI / Codex CLI | Shown when `gemini` / `codex` is installed (experimental) |

Keys you enter in Settings are saved in `.data/settings.json` on your computer and are never sent to a browser.

## Sharing a project

Click **Share** in the top bar.

1. **Create a link.** Choose **Can view** or **Can edit**, and decide whether that person **Can use my AI**. AI is off by default; with it on, their chats use *your* models and keys.
2. **Make your computer reachable.** By default only you can open PaperWriter. Pick one:
   - **Devices on my Wi-Fi / network**: one switch. Colleagues on the same network open your link.
     Windows may ask you to allow Node.js through the firewall.
   - **Anywhere on the internet**: starts a free, encrypted [Cloudflare quick tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/do-more-with-tunnels/trycloudflare/)
     (no account needed; PaperWriter can download `cloudflared` for you). The address changes every time you start it.
     Prefer [Tailscale](https://tailscale.com) if you want a private network between your own devices.
3. **Send the link.** Guests choose a display name and see only that one project. They can't see your other projects, settings, keys or files.

**Revoke** a link at any time: anyone using it is disconnected immediately. Changing a link from edit to view takes effect at once too.
PaperWriter has to be running for guests to reach your project.

## Privacy & security

- **Your data stays local.** Projects, the live document, AI keys and chat history are kept on your computer and in your own browser.
  The only things that leave your machine are the AI requests you choose to make (to the provider you picked), the
  optional Cloudflare tunnel, and the optional online compiler (texlive.net, off by default).
- **You are recognised as the owner by being on this computer.** Requests from `localhost` that don't come through a proxy or tunnel get full access.
  The check also stops other websites from using your browser against PaperWriter (DNS rebinding, cross-site requests).
  To act as the owner from another device, use the private link printed in the terminal when PaperWriter starts.
  Delete `.data/owner-secret` to replace it.
- **Share links** are long random tokens, stored only in the project's `.paperwriter.json`. Opening one saves it in an HttpOnly cookie,
  and the token is removed from the address bar. Every request and live connection is checked against the link's permissions, and
  **view-only links can't change the document**: the server discards their edits.
- **LaTeX is code.** A document can ask the compiler to read any file it can reach. For projects with an **edit** link,
  PaperWriter checks the sources before every compile. It refuses anything that reads or writes outside the project folder
  (absolute or `..` paths, `\openin`, `\openout`, `\catcode`, `\scantokens`, Lua, shell escape, file names built from macros…),
  and runs TeX Live/MiKTeX in "paranoid" file mode. This is a strong filter, not a sandbox, so **only give edit links to people you trust**.
  View links are always safe in this respect.

Found a security problem? Please see [SECURITY.md](SECURITY.md).

## Shortcuts

| Keys | Action |
| --- | --- |
| `Ctrl+S` | Compile |
| `Ctrl+K` | Ask the AI about the selection |
| `Ctrl+Z` / `Ctrl+Y` | Undo / redo (your own edits) |
| `Ctrl+F` | Find |
| `Ctrl+/` | Toggle comment |
| `Ctrl+B` / `Ctrl+I` / `Ctrl+U` | Bold / italic / underline in the visual editor |
| `Ctrl+wheel` on the PDF | Zoom |

## Configuration

Optional environment variables (see [`.env.example`](.env.example); a `.env` file is loaded automatically):

| Variable | Default | Meaning |
| --- | --- | --- |
| `PORT` | `5178` | Port to listen on |
| `HOST` | `127.0.0.1` | Interface to bind. Setting it overrides the "Devices on my network" switch. |
| `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY` | — | AI keys (instead of entering them in Settings) |

## How it works

| Path | What |
| --- | --- |
| `server.js` | HTTP + WebSocket server, routes and access checks |
| `lib/rooms.js` | Live co-editing: one [Yjs](https://yjs.dev) document per open project, synced over WebSocket and saved to disk |
| `lib/access.js` | Owner detection, share links, cookies |
| `lib/texguard.js` | Safety check run before compiling projects that have edit links |
| `lib/compile.js` | Tectonic / latexmk / pdfLaTeX / XeLaTeX / LuaLaTeX, log parsing |
| `lib/ai.js` | AI providers and streaming |
| `lib/network.js` | Network addresses and the Cloudflare tunnel |
| `lib/importer.js` | Importing exports from other LaTeX platforms (zip / tar.gz / tex) |
| `public/` | The web app (`app.js`, `visual.js` visual editor, `collab.js` sync client) |
| `scripts/build.mjs` | Copies browser libraries into `public/vendor` and bundles the sync client (runs automatically on `npm start`) |

Development: `npm run dev` restarts the server when you change server code.

## License

[MIT](LICENSE)
