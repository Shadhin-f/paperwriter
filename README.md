# PaperWriter

An open-source LaTeX studio you host yourself: write in code or on a visual page, see the PDF live,
draft and fix your paper with an AI co-author, and invite people to edit with you in real time with a link or a short code.
Run it on your laptop or on a server. No accounts and no third-party cloud: your papers, keys and chats stay with you.

## Quick start

You need [Node.js](https://nodejs.org) 22.9 or newer.

```bash
git clone https://github.com/Shadhin-f/paperwriter.git
cd paperwriter
```

Then double-click **`start.cmd`** (Windows) or run **`./start.sh`** (macOS, Linux). The first run installs everything and opens
your browser at **http://localhost:5178**, where a short setup guide walks you through:

1. **Workspace**: a name collaborators see when they join.
2. **Sharing**: just you, your network, anyone over the internet (a free Cloudflare link), or your own server and domain.
   Set a host password to sign in from any device.
3. **AI**: PaperWriter finds Claude Code, Ollama and others on its own; paste an API key if you like. Choose whether
   collaborators may use their own keys, and whether new invites may use yours.
4. **LaTeX**: installs [Tectonic](https://tectonic-typesetting.github.io), a small self-contained engine, automatically. TeX Live and MiKTeX work too.

Prefer the terminal? `npm install && npm start` does the same. Reopen the guide any time from your avatar menu.

## Host it on a server

Run PaperWriter on any small VPS so collaborators can join from anywhere, with HTTPS handled for you:

```bash
git clone https://github.com/Shadhin-f/paperwriter.git && cd paperwriter
echo "DOMAIN=papers.example.org" > .env      # a domain whose A record points at this server
docker compose up -d
docker compose logs paperwriter              # open the "Finish setup" link it prints
```

[Caddy](https://caddyserver.com) fetches a certificate for `DOMAIN`. The setup link signs you in as the host; choose a host password in the
guide so you can sign in later from any browser. Papers live in `./projects` and settings in `./data`, so updating is just
`git pull && docker compose up -d --build`.

No domain? Add `PW_BIND=0.0.0.0` to `.env` and run `docker compose up -d paperwriter`, then open `http://<server-ip>:5178`
(plain http: use it only on networks you trust).

## Features

- **Code + live PDF.** A LaTeX editor with syntax highlighting, error markers that jump to the line, and a crisp PDF preview.
  Click any text in the PDF to jump to that word in the source.
- **Visual editor.** Switch to **Visual** to type directly on the page. Equations render as you'd see them,
  and you drag blocks by their **⠿** handle to reorder. Every change is written back to the `.tex` source.
- **AI co-author.** Chat with Claude, ChatGPT, Gemini or a local model. It edits your paper with reviewable diffs
  you can apply or revert, and fixes compile errors on request.
- **Live co-editing.** Invite people with a link or a short code like `K7QF-3MXA`, and edit together with everyone's cursors and avatars visible.
  Undo only undoes your own changes.
- **Shared AI chat.** Everyone in a project sees everyone's AI conversations as they happen, with who asked. Each person's AI only
  uses their own messages as context, and **+** starts a fresh conversation without hiding anyone's history.
- **Version history.** The history button above the editor lists versions saved automatically as people write (a minute after
  they pause), with who changed which files. See what changed, compare any version with now, name important moments,
  and restore a whole version or a single file. Restoring saves the current state first, so it can be undone.
- **Bring your own AI.** Collaborators can chat with the host's AI, or with their own: an API key, or Claude Code, Ollama and
  their saved keys from their own computer. Their keys never reach the host.
- **Files stay files.** Projects are plain folders in `projects/`, so you can use git, Dropbox or any other editor alongside PaperWriter.
- **Folder tree.** Collapsible folders, a filter box, drag-and-drop to move files and folders, and rename, delete or upload on any folder.
  Moving a file doesn't rewrite `\input` or `\includegraphics` paths, so PaperWriter warns you when one still points at the old place.
- **Export.** *Project menu → Export project as .zip* (or the download button in the Files tab) gives you the source files, ready to
  back up, open on another platform, or import again. Share links and build output are left out.
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
| **OpenRouter** | One key for hundreds of models (Settings or `OPENROUTER_API_KEY`) |
| **Ollama** | [Ollama](https://ollama.com) running locally. Your pulled models appear automatically. |
| **OpenAI-compatible** | Any `/v1` server: LM Studio, llama.cpp, vLLM, OpenRouter… |
| Gemini CLI / Codex CLI | Shown when `gemini` / `codex` is installed (experimental) |

Keys you enter in Settings are saved in `.data/settings.json` on your computer and are never sent to a browser.

**Collaborators' AI.** Each invite can let its holder use *your* models (off by default; you pay for their chats). Separately,
anyone you invite can use their **own** AI from the model menu, and none of it passes through your server:

- **Their keys** (Claude, ChatGPT, Gemini, OpenRouter): kept in their browser and sent from it straight to the provider.
- **Their computer** (Claude Code, Ollama, LM Studio, or keys saved there): they run PaperWriter on their own computer, turn on
  *Settings → Use my AI in workspaces I join*, and paste the link key it shows into *Use AI from your computer* in your workspace.
  Their browser then talks to their own PaperWriter at `http://localhost`, which only answers that browser, on that computer,
  with that key. Chrome and Edge ask once to allow access to the local network; Safari doesn't allow it.

Their chats still appear in the shared chat for everyone. Turn own AI off in the setup guide if you'd rather not offer it.
As with any web app, the page itself comes from the host, so only add keys in workspaces you trust; the link key can be replaced
at any time from Settings and never reveals the keys behind it.

## Sharing a project

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

## Privacy & security

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
| `DOMAIN` | — | Your domain when hosting with docker compose. Caddy serves it over HTTPS, and invites use `https://DOMAIN`. |
| `PUBLIC_URL` | — | The address collaborators use, if it isn't `https://DOMAIN` (e.g. behind your own proxy). Can also be set in the setup guide. |
| `TRUST_PROXY` | — | Set to `1` behind a reverse proxy, so rate limits use the visitor's address |
| `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`, `OPENROUTER_API_KEY` | — | AI keys (instead of entering them in Settings) |
| `NO_OPEN` | — | Don't open the browser on first start |

## How it works

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

Development: `npm run dev` restarts the server when you change server code.

## License

[MIT](LICENSE)
