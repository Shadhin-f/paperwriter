# PaperWriter

A LaTeX studio with an AI co-author and real-time collaboration. Write in code or on a visual page,
see the PDF live, chat with Claude, ChatGPT, Gemini or a local model to draft and fix your paper,
and share it with others the way you would a Google Doc.

## Run it

```bash
npm install
npm start
```

Then open http://localhost:5178. It also works as a phone-sized layout.

Without any setup it runs single-user, with projects saved as files in `projects/`.
To share projects and edit together, add Supabase keys to a `.env` file (see `.env.example`)
or deploy it. **[DEPLOY.md](DEPLOY.md)** covers GitHub, Vercel and Supabase step by step.

## Sharing & live co-editing

Click **Share** in the top bar:

- **Invite by email** as an *Editor* or *Viewer*. They get an email link straight into the project.
- **General access**: *Restricted*, *Anyone with the link can view*, or *…can edit*. **Copy link** to send it anywhere. **Reset link** turns old links off.
- Everyone in the project sees each other's avatars, live cursors and edits as they type. Edits from several people merge
  automatically (a [Yjs](https://yjs.dev) CRDT synced over Supabase Realtime). Each person's **Undo** only undoes their own changes.
- Viewers can read, compile and chat, but can't change the document.

## Visual editor

Switch the editor header from **Code** to **Visual** to write on a page instead of in LaTeX:

- Type directly into the title, headings, paragraphs, lists and the abstract. Select text for **bold / italic / underline / inline math / citation**.
- Equations render with KaTeX. Click one (or any figure, table or other block) to edit its LaTeX with a live preview.
- Hover a block and drag its **⠿** handle to move it. Use **+** to insert a paragraph, section, list, equation, table or figure.
- Every change is written back into the `.tex` source as a small edit, so undo, autosave, the AI and collaborators all keep working.

## AI providers

Pick one from the model pill at the top of the chat:

| Provider | What you need |
| --- | --- |
| **Claude Code** | The `claude` CLI, logged in (`claude` → sign in). Uses your Claude subscription, no API key needed. |
| **Claude API** | Anthropic API key (Settings, or `ANTHROPIC_API_KEY`) |
| **ChatGPT API** | OpenAI API key (Settings, or `OPENAI_API_KEY`) |
| **Gemini API** | Google AI Studio key (Settings, or `GEMINI_API_KEY`) |
| **Ollama** | Ollama running locally; your pulled models are listed automatically |
| **OpenAI-compatible** | Any `/v1` server: LM Studio, llama.cpp, vLLM, OpenRouter… |
| Gemini CLI / Codex CLI | Shown when `gemini` / `codex` is on PATH (experimental) |

The model list is fetched live from each provider. You can also type any model id.

Keys are kept only on this computer in `.data/settings.json`. They are never sent to the browser.
On a hosted deployment, keys come from Vercel environment variables. Each user can also paste their own key, which stays in their browser.

## How editing works

The AI receives the open file, your selection (if any) and the compile errors. It answers with small *search/replace* edits, which appear as diff cards. With **Auto-apply** on, they're applied right away. Every card has **Revert**, and **Revert all** undoes a whole reply.

## LaTeX engines

Detected automatically, in this order: Tectonic → latexmk → pdflatex / xelatex / lualatex. Without any installed engine, the app offers:

- **Install Tectonic**: a one-click download of a small self-contained engine into `.data/bin`. The first compile downloads packages, which takes a few minutes.
- **Online compiler**: sends your text files to texlive.net. This is opt-in.

## Shortcuts

| Keys | Action |
| --- | --- |
| `Ctrl+S` | Save and compile |
| `Ctrl+Enter` | Compile |
| `Ctrl+K` | Ask the AI about the selection |
| `Ctrl+F` | Find |
| `Ctrl+/` | Toggle comment |
| `Ctrl+wheel` on the PDF | Zoom |

Local projects live in `projects/<name>/`; cloud projects live in Supabase. The ★ file in the Files tab is the one that gets compiled.

## Project layout

| Path | What |
| --- | --- |
| `server.js` | Local Node server (static files, local projects, Tectonic installer) |
| `api/` | Vercel serverless functions (thin wrappers around `lib/handlers.js`) |
| `lib/` | AI providers, compiler, auth, shared request handlers |
| `public/` | The web app (`app.js`, `visual.js` visual editor, `cloud.js` sync engine) |
| `supabase/schema.sql` | Database tables, security rules, storage and realtime permissions |
| `scripts/build.mjs` | Copies browser libraries into `public/vendor` and bundles the collaboration code |
