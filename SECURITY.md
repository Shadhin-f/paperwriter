# Security policy

PaperWriter runs on your own computer, and can let other people edit with you through share links.
Security reports are very welcome.

## Reporting a vulnerability

Please **don't open a public issue** for security problems. Instead, use GitHub's
[private vulnerability reporting](https://github.com/Shadhin-f/paperwriter/security/advisories/new) for this repository.
Include steps to reproduce and the impact you see. You'll get a reply as soon as possible, and credit in the fix if you'd like it.

## What PaperWriter protects

- **Only the host gets full access.** The host is someone browsing at `localhost` on the computer running PaperWriter, not through a proxy,
  someone who signed in with the host password, or someone holding the host link printed at startup. Password sign-in is rate-limited.
- **Guests see only what their invite allows.** An invite (link or code) gives access to exactly one project, with either edit or view rights,
  until it is revoked or expires. Invite codes are rate-limited against guessing.
- **Collaborators' own AI keys are never stored.** They stay in the collaborator's browser and are sent only with that person's chats,
  to a fixed provider address (Anthropic, OpenAI, Google or OpenRouter).
  View-only links can never change the document; the server rejects their edits.
- **No cross-site access.** Requests from other websites, including DNS-rebinding tricks, are refused.
- **Compiling shared projects is filtered.** Projects with an edit link are checked before every compile, so collaborators can't
  make LaTeX read or write files outside the project folder.

## Known limits

- The LaTeX filter is a **filter, not a sandbox**: it blocks every known way to reach outside the project, but TeX is a full
  programming language. Give **edit** links only to people you trust. View links are safe.
- When "Can use my AI" is on for a link, that person's chats use your AI subscription or API keys (and their cost).
- Anyone with an invite link or code can use it until you revoke it or it expires. Treat invites like passwords.
- On a server, the first visitor doesn't become the host: you sign in with the setup link from the server logs. Keep that link private.
- Over plain `http://` on a local network, traffic between devices isn't encrypted. Use the Cloudflare tunnel (https) or
  Tailscale (encrypted) on networks you don't trust.
