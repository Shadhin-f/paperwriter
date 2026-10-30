# Deploying PaperWriter (GitHub + Vercel + Supabase)

The hosted version needs three free accounts:

| Service | What it does |
| --- | --- |
| **GitHub** | Holds the code. Vercel redeploys on every push. |
| **Vercel** | Serves the app and runs the small API functions (AI chat, compile, invites). |
| **Supabase** | Handles sign-in by email link, stores projects, file uploads and members, and syncs live co-editing. |

Allow about 15 minutes.

---

## 1. Supabase (database, sign-in, live sync)

1. Create a project at <https://supabase.com/dashboard>. Any region works; pick one close to your users.
2. Open **SQL Editor → New query**, paste the whole of [`supabase/schema.sql`](supabase/schema.sql) and click **Run**.
   This creates the tables, the security rules that decide who can open which project, the `project-files` storage bucket and the realtime permissions. It's safe to run again later.
3. Open **Project Settings → API** (called **API Keys** on newer projects) and note down:
   - **Project URL**: this becomes `SUPABASE_URL`
   - **anon public** or **publishable** key: this becomes `SUPABASE_ANON_KEY`
   - **service_role** or **secret** key: this becomes `SUPABASE_SERVICE_ROLE_KEY`. It's optional, see the note below.
4. Open **Authentication → URL Configuration**:
   - **Site URL**: your Vercel address, e.g. `https://paperwriter.vercel.app`. Fill this in after step 3 of the Vercel section.
   - **Redirect URLs**: add `https://paperwriter.vercel.app/**` and, for local use, `http://localhost:5178/**`.
5. Recommended: **Authentication → Emails → SMTP Settings**. Supabase's built-in email sender is limited to a few emails per hour.
   For real use, plug in any SMTP provider (Resend, Postmark, Gmail SMTP, …) so sign-in links and invites are delivered reliably.

> **About the service-role key:** with it, people you invite who don't have an account yet receive Supabase's
> "You have been invited" email. Without it they get a regular sign-in link, which works just as well.
> The key bypasses all security rules, so only ever put it in server environment variables (Vercel or `.env`), never in code.

### Google sign-in (required)

PaperWriter signs people in with **Continue with Google** only, so logging in never sends an email.
Supabase only emails people when you invite them, and they then open the project and continue with Google.

1. In <https://console.cloud.google.com/apis/credentials>, create a project if asked.
   Fill in the **OAuth consent screen**: app name *PaperWriter*, your email, audience **External**.
   While the app is in *Testing*, add each person's Gmail under **Test users**, or click **Publish app** so anyone can sign in.
2. **Create credentials → OAuth client ID → Web application**:
   - **Authorized JavaScript origins:** your site, e.g. `https://paperwriter-eight.vercel.app` (and `http://localhost:5178` for local use)
   - **Authorized redirect URIs:** `https://YOUR-PROJECT-ID.supabase.co/auth/v1/callback` (Supabase shows this exact URL on its Google provider page)
3. In Supabase → **Authentication → Sign In / Providers → Google**, paste the **Client ID** and **Client secret** and switch it on.

The "Continue with Google" button works as soon as the provider is on, with no redeploy needed.

## 2. GitHub

1. Create an **empty** repository at <https://github.com/new>, with no README, `.gitignore` or license.
2. From the project folder, push the code (replace the URL with yours):

```bash
git remote add origin https://github.com/YOUR-NAME/paperwriter.git
```

```bash
git push -u origin main
```

`.gitignore` keeps your API keys (`.data/`, `.env`), your local papers (`projects/`) and `node_modules/` out of the repository.

## 3. Vercel

1. Go to <https://vercel.com/new>, sign in with GitHub and **Import** the repository.
2. Leave the defaults. `vercel.json` already sets the build command (`npm run build`), the output folder (`public`) and the function time limits.
3. Under **Environment Variables**, add:

   | Name | Value |
   | --- | --- |
   | `SUPABASE_URL` | Project URL from step 1.3 |
   | `SUPABASE_ANON_KEY` | anon / publishable key |
   | `SUPABASE_SERVICE_ROLE_KEY` | *(optional)* service_role / secret key |
   | `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY` | *(optional)* shared AI keys for everyone you invite |
   | `APP_URL` | *(optional)* e.g. `https://paperwriter.vercel.app`, used in invite links |

4. Click **Deploy**. When it finishes, copy the URL into Supabase's **Site URL** and **Redirect URLs** (step 1.4).

Every `git push` to `main` now redeploys automatically.

**Using the CLI instead:** run `vercel login`, `vercel link`, add the variables with `vercel env add NAME production`, then `vercel --prod`.

## 4. Try it

1. Open your Vercel URL and click **Continue with Google**. You're signed in, with a starter paper ready.
2. Click **Share** in the top bar:
   - **Invite by email** as an *Editor* or *Viewer*. They get an email and land straight in the project.
   - **General access → Anyone with the link can edit/view**, then **Copy link**. Anyone who signs in through it joins.
3. Open the project in two browsers. You'll see each other's avatars, live cursors and edits.

---

## What runs where

| Feature | Local (`npm start`) | Hosted (Vercel) |
| --- | --- | --- |
| Claude Code CLI (your subscription) | ✅ | ❌ It lives on your PC |
| Ollama / LM Studio | ✅ | ❌ |
| Claude / ChatGPT / Gemini API keys | ✅ | ✅ Shared env keys, or each user's own key saved in their browser |
| Compiling | Tectonic, TeX Live or MiKTeX (images included) | texlive.net (text files only, so uploaded images aren't sent) |
| Sharing, invites, live co-editing | ✅ when `.env` has the Supabase variables | ✅ |
| Visual editor | ✅ | ✅ |

**Best of both:** put the same Supabase variables in a local `.env` and run `npm start`.
You then edit the shared cloud projects live with your collaborators, while still using Claude Code, Ollama and Tectonic on your own machine.

## Troubleshooting

- **"Email rate limit exceeded"**: Supabase's default email sender is heavily limited. Add custom SMTP (step 1.5).
- **The sign-in link opens localhost, or "redirect not allowed"**: fix Site URL and Redirect URLs (step 1.4).
- **Edits don't appear live for others, but do after a reload**: re-run `schema.sql`. Its realtime policies allow private channels. Also check **Realtime** is enabled for the project.
- **"Database error" when creating a project**: `schema.sql` hasn't been run yet, or failed part-way. Run it again.
