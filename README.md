<div align="center">

<img src="public/logo.svg" alt="PaperWriter logo" width="96" height="96" />

# PaperWriter

**Write papers together.** An open-source LaTeX studio you host yourself, with a live PDF,<br />
a visual editor, an AI co-author and real-time co-editing over a link or a short code.

[![License: MIT](https://img.shields.io/badge/license-MIT-0071e3)](LICENSE)
[![Node.js 22.9+](https://img.shields.io/badge/node-%E2%89%A522.9-5FA04E?logo=nodedotjs&logoColor=white)](https://nodejs.org)
[![Docker](https://img.shields.io/badge/docker-ready-2496ED?logo=docker&logoColor=white)](#-host-it-on-a-server)
[![PRs welcome](https://img.shields.io/badge/PRs-welcome-34c759)](CONTRIBUTING.md)

[Setup](#-setup-guide) · [Features](#-features) · [Tech stack](#-tech-stack) · [Sharing](#-sharing-a-project) · [Contributing](#-contributing)

</div>

---

No accounts and no third-party cloud. Run it on your laptop for yourself, on your network for your lab, or on a server for
collaborators anywhere. Your papers, keys and chats stay with you.

## 🚀 Setup guide

Pick the path that fits you. Each takes a few minutes.

| | Path | Best for |
| :-: | --- | --- |
| 💻 | [On your computer](#-on-your-computer) | Writing alone, or sharing with your lab or the world from your own machine |
| 🌐 | [On a server](#-host-it-on-a-server) | A workspace that's always online, at your own domain with HTTPS |
| 🙋 | [Join someone's workspace](#-join-someones-workspace) | You were sent an invite link or code |

### 💻 On your computer

**1. Install Node.js 22.9 or newer.** Download it from [nodejs.org](https://nodejs.org) (the LTS version), or use a package manager:

```bash
winget install OpenJS.NodeJS.LTS     # Windows
brew install node                    # macOS
```

**2. Get PaperWriter.** Clone it, or [download the ZIP](https://github.com/Shadhin-f/paperwriter/archive/refs/heads/main.zip) and unzip it.

```bash
git clone https://github.com/Shadhin-f/paperwriter.git
```

**3. Start it.**

- **Windows:** double-click `start.cmd` in the `paperwriter` folder.
- **macOS / Linux:** run `./start.sh` in the `paperwriter` folder.

The first run installs everything it needs and opens **http://localhost:5178** in your browser.

**4. Follow the setup guide in your browser.** Four short steps, each with sensible defaults you can skip:

| | Step | What you choose |
| :-: | --- | --- |
| 🏷️ | **Workspace** | A name collaborators see when they join, and your display name |
| 🔗 | **Sharing** | Just you, your Wi-Fi, anyone over the internet (a free Cloudflare link), or your own server. Set a host password to sign in from other devices. |
| ✨ | **AI** | PaperWriter finds Claude Code, Ollama and others by itself; paste an API key if you like. Decide whether collaborators may bring their own AI, and whether new invites may use yours. |
| 📄 | **LaTeX** | Installs [Tectonic](https://tectonic-typesetting.github.io), a small self-contained engine, automatically. TeX Live and MiKTeX work too. |

That's it. Open a paper and press **Share** to invite people. Reopen the guide any time from your avatar menu (top right).

> [!TIP]
> Prefer the terminal? `npm install && npm start` does the same as the start scripts. `npm run dev` restarts the server when you change server code.

### 🌐 Host it on a server

Any small VPS works (1 vCPU and 1 GB of RAM is plenty for a small group). You need [Docker](https://docs.docker.com/engine/install/)
and a domain whose A record points at the server.

```bash
git clone https://github.com/Shadhin-f/paperwriter.git && cd paperwriter
echo "DOMAIN=papers.example.org" > .env
docker compose up -d
docker compose logs paperwriter        # open the "Finish setup" link it prints
```

[Caddy](https://caddyserver.com) gets an HTTPS certificate for your domain automatically. The setup link signs you in as the host;
set a host password in the guide so you can sign in from any browser later. Papers live in `./projects` and settings in `./data`.

**Update** to the latest version with `git pull && docker compose up -d --build`. Your papers and settings are kept.

> [!NOTE]
> No domain? Add `PW_BIND=0.0.0.0` to `.env`, run `docker compose up -d paperwriter` and open `http://<server-ip>:5178`.
> That's plain http, so use it only on networks you trust.

### 🙋 Join someone's workspace

Open the invite link you were sent, or go to the workspace's address and type the **invite code** (it looks like `K7QF-3MXA`).
Choose a display name and you're in. No account, no install.

To chat with **your own AI** there, open the model menu at the top of the chat and either add your API key (it stays in your
browser) or connect PaperWriter running on your own computer. See [Collaborators' AI](#collaborators-ai).

### 🛠️ Troubleshooting

| Problem | Fix |
| --- | --- |
| `node` isn't recognised, or a syntax error on start | Install Node.js 22.9 or newer (step 1), then open a new terminal. Check with `node -v`. |
| Port 5178 is already in use | Another copy is running. Close it, or use another port: `PORT=5179 npm start` (PowerShell: `$env:PORT=5179; npm start`). |
| Colleagues on Wi-Fi can't open the link | Allow Node.js through the firewall when Windows or macOS asks, and make sure **Devices on my network** is on in Share. |
| "No LaTeX engine found" | Open **Settings → Compiler** and press **Install** next to Tectonic, or turn on the online compiler. |
| Tectonic install fails behind a proxy | Install TeX Live or MiKTeX instead; PaperWriter uses them automatically. |
| The page looks broken after updating | Reload with `Ctrl+Shift+R` to clear the cached app. |

## ✨ Features

### Writing

| | |
| :-: | --- |
| 📝 | **Code + live PDF.** A LaTeX editor with syntax highlighting, error markers that jump to the line, and a crisp PDF preview. Click any text in the PDF to jump to that word in the source. |
| 👁️ | **Visual editor.** Switch to **Visual** to type directly on the page. Equations render as you'd see them, and you drag blocks by their **⠿** handle to reorder. Every change is written back to the `.tex` source. |
| 🗂️ | **Folder tree.** Collapsible folders, a filter box, drag-and-drop to move files, and rename, delete or upload on any folder. PaperWriter warns you when an `\input` or `\includegraphics` still points at a moved file. |
| 🕰️ | **Version history.** Versions are saved automatically as people write, with who changed which files. See what changed, compare any version with now, name important moments, and restore a whole version or one file. Restoring is undoable. |

### Collaboration

| | |
| :-: | --- |
| 👥 | **Live co-editing.** Everyone's cursors and avatars, in real time. Undo only undoes your own changes. |
| 🎟️ | **Invites by link or code.** Each invite has a link and a short code like `K7QF-3MXA`, edit or view access, an optional expiry, and can be revoked at once. |
| 💬 | **Shared AI chat.** Everyone in a project sees everyone's AI conversations as they happen, with who asked. Each person's AI keeps only their own messages as context. |
| 🌍 | **Reachable anywhere.** Your Wi-Fi with one switch, the internet through a free encrypted Cloudflare link, or your own server with automatic HTTPS. |

### AI co-author

| | |
| :-: | --- |
| 🤖 | **Edits you can review.** Chat with Claude, ChatGPT, Gemini or a local model. It edits your paper with diffs you can apply or revert, and fixes compile errors on request. |
| 🔌 | **Use the AI you already have.** Claude Code with your subscription, API keys, OpenRouter, Ollama, LM Studio and other OpenAI-compatible servers. |
| 🔑 | **Bring your own AI.** Collaborators can use the host's AI, their own API key (sent straight from their browser to the provider), or the AI on their own computer. Their keys never reach the host. |

### Your data

| | |
| :-: | --- |
| 📁 | **Files stay files.** Projects are plain folders in `projects/`, so git, Dropbox or any other editor work alongside PaperWriter. |
| 📦 | **Import and export.** Bring in exports from Overleaf, Prism, Authorea, arXiv and others (`.zip`, `.tar.gz`, `.tex`). Export any project as a `.zip` of its sources. |
| 🔒 | **Private by default.** Only you can open PaperWriter until you choose to share. Guests see only the project they were invited to. |
| 📱 | **Everywhere.** Works on phones and tablets, in light and dark mode. |

## 🧱 Tech stack

<p>
  <img src="https://img.shields.io/badge/Node.js-5FA04E?logo=nodedotjs&logoColor=white" alt="Node.js" />
  <img src="https://img.shields.io/badge/JavaScript-F7DF1E?logo=javascript&logoColor=black" alt="JavaScript" />
  <img src="https://img.shields.io/badge/Yjs-30BCED" alt="Yjs" />
  <img src="https://img.shields.io/badge/WebSocket-010101?logo=socketdotio&logoColor=white" alt="WebSocket" />
  <img src="https://img.shields.io/badge/CodeMirror-D30707?logo=codemirror&logoColor=white" alt="CodeMirror" />
  <img src="https://img.shields.io/badge/PDF.js-E66000?logo=mozilla&logoColor=white" alt="PDF.js" />
  <img src="https://img.shields.io/badge/KaTeX-329894?logo=katex&logoColor=white" alt="KaTeX" />
  <img src="https://img.shields.io/badge/LaTeX-008080?logo=latex&logoColor=white" alt="LaTeX" />
  <img src="https://img.shields.io/badge/esbuild-FFCF00?logo=esbuild&logoColor=black" alt="esbuild" />
  <img src="https://img.shields.io/badge/Docker-2496ED?logo=docker&logoColor=white" alt="Docker" />
  <img src="https://img.shields.io/badge/Caddy-1F88C0?logo=caddy&logoColor=white" alt="Caddy" />
  <img src="https://img.shields.io/badge/Cloudflare_Tunnel-F38020?logo=cloudflare&logoColor=white" alt="Cloudflare Tunnel" />
</p>

| Layer | Technology | Why |
| --- | --- | --- |
| Server | [Node.js](https://nodejs.org) 22, built-in `http`, [ws](https://github.com/websockets/ws) | One small process with no web framework. Easy to read, easy to run anywhere. |
| Live editing | [Yjs](https://yjs.dev), [y-websocket](https://github.com/yjs/y-websocket) protocol | Conflict-free merging, so everyone can type at once and reconnect without losing edits. |
| Editor | [CodeMirror 5](https://codemirror.net/5/) with [y-codemirror](https://github.com/yjs/y-codemirror) | Fast LaTeX editing with shared cursors and per-person undo. |
| PDF & math | [PDF.js](https://mozilla.github.io/pdf.js/), [KaTeX](https://katex.org), SyncTeX | Crisp preview, click-to-source, and equations in the visual editor. |
| Typesetting | [Tectonic](https://tectonic-typesetting.github.io), or TeX Live / MiKTeX (latexmk, pdfLaTeX, XeLaTeX, LuaLaTeX) | A self-contained engine that installs itself, with full TeX distributions supported. |
| AI | Anthropic, OpenAI, Google Gemini, OpenRouter, Ollama, OpenAI-compatible servers, Claude Code CLI | Streaming chat with the provider each person chooses. |
| Front end | Plain JavaScript modules and CSS, no framework | Nothing to compile for the UI. [esbuild](https://esbuild.github.io) only bundles the sync client. |
| Hosting | [Docker](https://www.docker.com), [Caddy](https://caddyserver.com), [Cloudflare quick tunnels](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/do-more-with-tunnels/trycloudflare/) | Automatic HTTPS on a server, or a public link from a laptop with no setup. |
| Storage | Plain files on disk | Projects are normal folders. No database to run or back up. |

## 🤖 AI models

Pick a model from the pill at the top of the chat. Use whichever you have:

| Provider | What you need |
| --- | --- |
| **Claude Code** | The [`claude` CLI](https://docs.claude.com/en/docs/claude-code), logged in. Uses your Claude subscription; no API key needed. |
| **Claude / ChatGPT / Gemini API** | An API key (Settings), or `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` / `GEMINI_API_KEY` |
| **OpenRouter** | One key for hundreds of models (Settings or `OPENROUTER_API_KEY`) |
| **Ollama** | [Ollama](https://ollama.com) running locally. Your pulled models appear automatically. |
| **OpenAI-compatible** | Any `/v1` server: LM Studio, llama.cpp, vLLM, OpenRouter… |
| Gemini CLI / Codex CLI | Shown when `gemini` / `codex` is installed (experimental) |

Keys you enter in Settings are saved in `.data/settings.json` on your computer and are never sent to a browser.

### Collaborators' AI

Each invite can let its holder use *your* models (off by default; you pay for their chats). Separately,
anyone you invite can use their **own** AI from the model menu, and none of it passes through your server:

- **Their keys** (Claude, ChatGPT, Gemini, OpenRouter): kept in their browser and sent from it straight to the provider.
- **Their computer** (Claude Code, Ollama, LM Studio, or keys saved there): they run PaperWriter on their own computer, turn on
  *Settings → Use my AI in workspaces I join*, and paste the link key it shows into *Use AI from your computer* in your workspace.
  Their browser then talks to their own PaperWriter at `http://localhost`, which only answers that browser, on that computer,
  with that key. Chrome and Edge ask once to allow access to the local network; Safari doesn't allow it.

Their chats still appear in the shared chat for everyone. Turn own AI off in the setup guide if you'd rather not offer it.
As with any web app, the page itself comes from the host, so only add keys in workspaces you trust; the link key can be replaced
at any time from Settings and never reveals the keys behind it.

## 🔗 Sharing a project

Click **Share** in the top bar.

1. **Create an invite.** Choose **Can edit** or **Can view**, when it expires (never, 1, 7 or 30 days), and whether that person **Can use my AI**.
   Every invite has a link (`…/j/K7QF-3MXA`) and the code itself, which people can type on the PaperWriter home page. **Copy invite** copies both.
2. **Make PaperWriter reachable.** On a server with `DOMAIN` or `PUBLIC_URL` set, it already is. On your own computer, only you can open it by default. Pick one:
   - **Devices on my Wi-Fi / network**: one switch. Colleagues on the same network open your link.
     Windows may ask you to allow Node.js through the firewall.
   - **Anywhere on the internet**: starts a free, encrypted [Cloudflare quick tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/do-more-with-tunnels/trycloudflare/)
     (no account needed; PaperWriter can download `cloudflared` for you). The address changes every time you start it.
     Prefer [Tailscale](https://tailscale.com) if you want a private network between your own devices.
3. **Send the invite.** Guests choose a display name and see only that one project. They can't see your other projects, settings, keys or files.

**Revoke** an invite at any time: anyone using it is disconnected immediately. Changing it from edit to view takes effect at once too.
PaperWriter has to be running for guests to reach your project.

## 🔒 Privacy & security

- **Your data stays local.** Projects, the live document, AI keys and chat history are kept on your computer and in your own browser.
  The only things that leave your machine are the AI requests you choose to make (to the provider you picked), the
  optional Cloudflare tunnel, and the optional online compiler (texlive.net, off by default).
- **You are recognised as the host by being on this computer.** Requests from `localhost` that don't come through a proxy or tunnel get full access.
  The check also stops other websites from using your browser against PaperWriter (DNS rebinding, cross-site requests).
  From another device, sign in with your **host password** (set in the setup guide, stored as a salted scrypt hash), or use the private
  link printed in the terminal when PaperWriter starts. Delete `.data/owner-secret` to replace that link and sign every device out.
- **Sign-in and invite codes are rate-limited** per visitor. Behind a reverse proxy, set `TRUST_PROXY=1` (the docker-compose file does) so limits apply per real visitor.
- **Invites** are long random tokens plus 8-character codes (about 850 billion combinations), stored only in the project's `.paperwriter.json`. Opening one saves it in an HttpOnly cookie,
  and the token is removed from the address bar. Every request and live connection is checked against the link's permissions, and
  **view-only links can't change the document**: the server discards their edits.
- **LaTeX is code.** A document can ask the compiler to read any file it can reach. For projects with an **edit** link,
  PaperWriter checks the sources before every compile. It refuses anything that reads or writes outside the project folder
  (absolute or `..` paths, `\openin`, `\openout`, `\catcode`, `\scantokens`, Lua, shell escape, file names built from macros…),
  and runs TeX Live/MiKTeX in "paranoid" file mode. This is a strong filter, not a sandbox, so **only give edit links to people you trust**.
  View links are always safe in this respect.

Found a security problem? Please see [SECURITY.md](SECURITY.md).

## ⌨️ Shortcuts

| Keys | Action |
| --- | --- |
| `Ctrl+S` | Compile |
| `Ctrl+K` | Ask the AI about the selection |
| `Ctrl+Z` / `Ctrl+Y` | Undo / redo (your own edits) |
| `Ctrl+F` | Find |
| `Ctrl+/` | Toggle comment |
| `Ctrl+B` / `Ctrl+I` / `Ctrl+U` | Bold / italic / underline in the visual editor |
| `Ctrl+wheel` on the PDF | Zoom |

## ⚙️ Configuration

Optional environment variables (see [`.env.example`](.env.example); a `.env` file is loaded automatically):

| Variable | Default | Meaning |
| --- | --- | --- |
| `PORT` | `5178` | Port to listen on |
| `HOST` | `127.0.0.1` | Interface to bind. Setting it overrides the "Devices on my network" switch. |
| `DOMAIN` | — | Your domain when hosting with docker compose. Caddy serves it over HTTPS, and invites use `https://DOMAIN`. |
| `PUBLIC_URL` | — | The address collaborators use, if it isn't `https://DOMAIN` (e.g. behind your own proxy). Can also be set in the setup guide. |
| `TRUST_PROXY` | — | Set to `1` behind a reverse proxy, so rate limits use the visitor's address |
| `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`, `OPENROUTER_API_KEY` | — | AI keys (instead of entering them in Settings) |
| `NO_OPEN` | — | Don't open the browser on first start |

## 🧭 How it works

| Path | What |
| --- | --- |
| `server.js` | HTTP + WebSocket server, routes and access checks |
| `lib/rooms.js` | Live co-editing: one [Yjs](https://yjs.dev) document per open project, synced over WebSocket and saved to disk, plus the shared AI chat |
| `lib/history.js` | Version history, stored in each project's hidden `.history/` folder (left out of exports) |
| `public/ai-client.js`, `public/prompt.js` | Collaborators' own AI: direct provider calls from the browser, and the link to their own PaperWriter |
| `lib/access.js` | Host detection and sign-in, invites (links and codes), cookies, rate limits |
| `lib/texguard.js` | Safety check run before compiling projects that have edit links |
| `lib/compile.js` | Tectonic / latexmk / pdfLaTeX / XeLaTeX / LuaLaTeX, log parsing |
| `lib/ai.js` | AI providers and streaming |
| `lib/network.js` | Network addresses and the Cloudflare tunnel |
| `lib/importer.js`, `lib/exporter.js` | Importing exports from other LaTeX platforms (zip / tar.gz / tex), and exporting a project as .zip |
| `lib/synctex.js` | Finding the source line behind a click in the PDF |
| `public/` | The web app (`app.js`, `visual.js` visual editor, `collab.js` sync client) |
| `Dockerfile`, `docker-compose.yml` | Server hosting with automatic HTTPS (Caddy) |
| `start.cmd`, `start.sh` | One-click start: installs on first run and opens the browser |
| `scripts/build.mjs` | Copies browser libraries into `public/vendor` and bundles the sync client (runs automatically on `npm start`) |

New here? [CONTRIBUTING.md](CONTRIBUTING.md) walks through the code in more detail.

## 🤝 Contributing

Contributions are welcome: bug reports, fixes, features, docs and translations.

1. Read the [contribution guide](CONTRIBUTING.md). It covers setup, how the code is laid out, and what makes a pull request easy to merge.
2. For anything bigger than a small fix, [open an issue](https://github.com/Shadhin-f/paperwriter/issues) first so we can agree on the approach.
3. Fork, branch, make your change, and open a pull request. The template lists what to check.

Everyone taking part is expected to follow the [code of conduct](CODE_OF_CONDUCT.md).
Found a security problem? Please report it privately as described in [SECURITY.md](SECURITY.md), not in a public issue.

## 📄 License

[MIT](LICENSE). By contributing, you agree that your contributions are licensed under the same terms.
