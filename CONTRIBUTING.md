# Contributing to PaperWriter

Thanks for helping make PaperWriter better. This guide explains how to get set up, how the code is organised,
and what we look for in a pull request. If anything here is unclear, that's a bug too: open an issue.

## Ways to help

- 🐛 **Report a bug.** Use the bug report form in [Issues](https://github.com/Shadhin-f/paperwriter/issues/new/choose). Steps to reproduce, what you expected, and your OS, browser and Node.js version help the most.
- 💡 **Suggest a feature.** Use the feature request form and describe the problem you're trying to solve, not only the solution.
- 🔧 **Fix or build something.** Issues labelled `good first issue` are a good place to start.
- 📝 **Improve the docs.** Clearer setup steps, screenshots and translations are all welcome.
- 🔒 **Security problems** go through [private reporting](SECURITY.md), never a public issue.

## Before you start

- **Small fixes** (typos, obvious bugs, small UI polish): just open a pull request.
- **Anything larger** (a new feature, a new dependency, a change to how sharing, access or storage works):
  open an issue first and describe your plan. It saves you from building something that can't be merged.
- One pull request should do one thing. Two unrelated fixes are two pull requests.

## Development setup

You need [Node.js](https://nodejs.org) 22.9 or newer and git.

```bash
git clone https://github.com/<you>/paperwriter.git
cd paperwriter
npm install
npm run dev          # http://localhost:5178, restarts when server code changes
```

Browser code in `public/` isn't bundled: save and reload the page. Only `src/collab-entry.js` is bundled by esbuild
(`npm run build`, which `npm start` and `npm run dev` run for you).

To test **sharing as a guest** on one computer, start PaperWriter on your network and open it from your network address
in a private window. `localhost` always counts as the host.

```bash
HOST=0.0.0.0 npm run dev          # PowerShell: $env:HOST="0.0.0.0"; npm run dev
```

Then create an invite in **Share** and open it at `http://<your-ip>:5178` in a private window.

## How the code is organised

| Area | Where | Notes |
| --- | --- | --- |
| HTTP routes, access checks | `server.js` | Every route checks access first (`requireOwner`, `requireProject`). |
| Host sign-in, invites, rate limits | `lib/access.js` | **Security-sensitive.** |
| Live co-editing, shared AI chat | `lib/rooms.js`, `public/collab.js` | Yjs documents synced over WebSocket. Viewers' edits are dropped on the server. |
| Version history | `lib/history.js` | Snapshots in each project's hidden `.history/` folder. |
| Compiling | `lib/compile.js`, `lib/texguard.js` | `texguard.js` is **security-sensitive**: it blocks LaTeX from reaching outside the project. |
| AI | `lib/ai.js`, `public/prompt.js`, `public/ai-client.js` | `prompt.js` is shared by server and browser. `ai-client.js` is the collaborator's own AI, which must never send keys to the host. |
| Settings | `lib/settings.js` | Keys are never returned to a browser. |
| Web app | `public/app.js`, `public/visual.js`, `public/styles.css` | Plain JavaScript modules and CSS. Design tokens live at the top of `styles.css`. |

## Guidelines

### Code

- **Match the code around you.** Plain JavaScript (ES modules), no front-end framework, two-space indent, single quotes, semicolons.
- **No new dependencies without discussion.** PaperWriter stays small and easy to self-host. If you need one, explain why in the issue.
- **Comments explain why**, not what. A short note above anything surprising is worth more than a line-by-line narration.
- **Keep it working on Windows, macOS and Linux.** Use `path.join`, avoid shell-only tricks, and remember Windows `.cmd` shims (see `spawnProgram` in `lib/util.js`).
- **UI text** is plain, short and in sentence case. Buttons say what they do ("Create invite", not "Submit"). Errors say what happened and how to fix it.
- **Design:** reuse the tokens in `styles.css` (colours, radius, fonts) instead of new hard-coded values, and check light mode, dark mode and phone width.

### Security-sensitive changes

Changes to `lib/access.js`, `lib/texguard.js`, `lib/settings.js`, the bridge in `server.js` (`/bridge/*`), or anything that decides
who can see or change what, get a closer review. In your pull request:

- say what could go wrong and how your change prevents it;
- keep the rule that **keys never leave the machine they're saved on**: not to browsers, not to logs, not to the host;
- keep **view-only access read-only** on the server, not just in the UI.

### Testing

There's no automated test suite yet (adding one is a very welcome contribution). Until then, test by hand and say what you
checked in the pull request. For most changes that means:

- [ ] `node --check` passes for the files you changed
- [ ] The app starts with `npm start` and shows no errors in the terminal or the browser console
- [ ] Your change works as the **host** and, if it touches sharing, chat or editing, as a **guest** with an edit and a view invite
- [ ] Light and dark mode, and a phone-width window, if you changed the UI

### Commits and pull requests

- Write commit messages in the imperative, with a short first line: `Add expiry to invites`, `Fix PDF click on rotated pages`.
- Explain **why** in the pull request description, and link the issue it closes (`Closes #12`).
- Add screenshots or a short clip for visible changes.
- Update `README.md` when you change setup, configuration or a feature people use.
- Keep pull requests focused and reasonably small. Large changes are easier to review in steps.

## Review and merging

A maintainer reviews every pull request, usually within a week. We may ask for changes; that's normal and not a rejection.
Pull requests are merged once they're reviewed, the checklist is done, and any discussion is resolved.
Inactive pull requests may be closed after a month, and you're welcome to reopen them.

## License

PaperWriter is [MIT-licensed](LICENSE). By submitting a contribution, you agree that it is licensed under the same terms
and that you have the right to submit it.

## Code of conduct

Be kind and assume good intent. Everyone taking part in this project is expected to follow the [code of conduct](CODE_OF_CONDUCT.md).
