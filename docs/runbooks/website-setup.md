# Runbook: deploying the FoodOS.ai marketing site

**For:** the CTO · **Owner:** DevOps (FOO-4) · **Last updated:** 2026-10-13
**Architecture:** [`docs/website-architecture.md`](../website-architecture.md)

Everything here is account setup the engineering team deliberately did **not** do:
creating accounts, holding real credentials and deploying are the CTO's calls. The
code is already written and runs locally with no accounts at all.

**Time:** about 30 minutes end to end, plus DNS propagation.
**Cost:** ₹0/month at our scale. See [Appendix A](#appendix-a--cost-at-our-scale).

> **The one rule:** a real credential never goes in the repo, a chat message, or an
> issue comment. Secrets live in exactly two places — Cloudflare Pages encrypted
> environment variables, and GitHub Actions secrets.

**Deploy path:** GitHub Actions only (your call, 2026-10-13). The Cloudflare Pages Git
integration is deliberately **not** connected — running both would build and deploy the
site twice on every push. Everything below assumes Actions owns deploys.

---

## Before you start

You will need:

- A Google account that can create a Google Cloud project (any Workspace or personal account).
- A Cloudflare account, with `foodos.ai` already registered. If the domain is registered
  elsewhere you will need access to change nameservers at that registrar.
- **Admin access to the GitHub repo** — required, not optional: the deploy runs there
  (step 7) and only an admin can add repository secrets.

Keep a scratch notepad open. You will collect five values along the way:

| # | Value | From step | Where it ends up |
|---|---|---|---|
| 1 | `GOOGLE_SHEET_ID` | 1 | Pages secret (step 6) |
| 2 | `GOOGLE_SERVICE_ACCOUNT_EMAIL` | 2 | Pages secret (step 6) |
| 3 | `GOOGLE_PRIVATE_KEY` | 2 | Pages secret (step 6) |
| 4 | `TURNSTILE_SITE_KEY` (public) | 5 | **GitHub** Actions variable (step 7) |
| 5 | `TURNSTILE_SECRET_KEY` | 5 | Pages secret (step 6) |

Value 4 is the odd one out on purpose. It is compiled into the browser bundle at build
time, and the build now happens in GitHub Actions, not on Cloudflare — so it belongs to
the repo, not to the Pages project. The other four are read at runtime by the Function,
which runs on Cloudflare.

Delete the notepad when you are done.

---

## Step 1 — Create the leads Google Sheet (3 min)

1. Go to <https://sheets.new>. Name the file **FoodOS.ai — Demo requests**.
2. Rename the first tab (bottom left) to exactly **`Leads`** — capital L. The Function
   targets this tab by name and the match is case-sensitive, so a tab still called
   `Sheet1`, or called `leads`, will fail with a 502.
3. Paste this as **row 1**. The column order is fixed by the architecture doc — the
   Function appends positionally, so reordering columns silently corrupts every new lead.

```
id	receivedAt	name	phone	email	restaurantName	city	outlets	restaurantType	preferredLanguage	message	utmSource	utmMedium	utmCampaign	utmTerm	utmContent	referrer	landingPath	userAgent	status
```

> Those separators are **tabs**. Copy the line and paste into cell `A1` — Sheets will
> split it across A1:T1 automatically. If it all lands in one cell, use
> *Data → Split text to columns*.

4. Freeze the header: *View → Freeze → 1 row*.
5. Copy the sheet id out of the URL and save it as **value 1**:

```
https://docs.google.com/spreadsheets/d/1AbC...XyZ/edit#gid=0
                                      ^^^^^^^^^^^ this is GOOGLE_SHEET_ID
```

**Verify:** row 1 has 20 populated columns, ending in `status`.

---

## Step 2 — Create the GCP service account (8 min)

The site writes to the sheet as a robot account, not as you. This is what keeps the
credential revocable and scoped to one sheet.

1. Go to <https://console.cloud.google.com/projectcreate>. Create a project named
   **`foodos-website`**. No billing account is needed — the Sheets API is free.
2. Enable the Sheets API: <https://console.cloud.google.com/apis/library/sheets.googleapis.com>
   → make sure `foodos-website` is the selected project → **Enable**.
3. Create the service account:
   *IAM & Admin → Service Accounts → **Create service account***
   - Name: `foodos-website-sheets`
   - Description: `Writes demo requests from the marketing site to the leads sheet`
   - **Skip** the "Grant this service account access to the project" step. It needs no
     project-level IAM role at all; its only permission comes from sharing the sheet
     in step 3. Click **Done**.
4. Copy the generated email — it looks like
   `foodos-website-sheets@foodos-website.iam.gserviceaccount.com`. Save as **value 2**.
5. Create the key: click the service account → **Keys** → *Add key → Create new key* →
   **JSON** → **Create**. A `.json` file downloads.

   > **This file is the credential.** Anyone holding it can write to any sheet shared
   > with that account. Do not put it in the repo, Slack, or an issue comment.

6. Open the JSON in a text editor and find `"private_key"`. Copy **the entire value
   between the quotes**, including the `-----BEGIN PRIVATE KEY-----` and
   `-----END PRIVATE KEY-----` markers and the literal `\n` sequences. It is one long
   line. Save as **value 3**.

   It should look like:
   `-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBg...\n-----END PRIVATE KEY-----\n`

7. Once values 2 and 3 are in your notepad, **delete the downloaded JSON file** and
   empty your trash. Cloudflare is the system of record for this secret; if you lose
   it you can issue a new key in 30 seconds, so there is no reason to keep a copy.

**Verify:** the Service Accounts list shows `foodos-website-sheets` with 1 key.

---

## Step 3 — Share the sheet with the service account (1 min)

1. Open the sheet from step 1 → **Share**.
2. Paste the service-account email (**value 2**).
3. Set the role to **Editor**. Un-tick **Notify people** (it is a robot; the mail bounces).
4. **Share**.

This is the step that is most often missed. Without it the Sheets API returns
`403 PERMISSION_DENIED` and every submission becomes a 502.

**Verify:** the share dialog lists the service-account email as an Editor.

---

## Step 4 — Create the Cloudflare Pages project (2 min)

GitHub Actions builds the site and uploads the finished `dist/` to Cloudflare. So the
Pages project is a **Direct Upload** project: Cloudflare never clones the repo, never
runs a build, and never needs to know where in the repo the site lives.

1. Cloudflare dashboard → **Workers & Pages** → **Create** → **Pages** →
   **Upload assets** (this is the direct-upload path; it is *not* "Connect to Git").
2. Project name: **`foodos-website`** — exactly this. The workflow passes
   `--project-name=foodos-website`, so a different name here means a failed deploy.
3. Cloudflare asks for an initial upload before it will create the project. Drag in any
   throwaway file, or a zip of `website/dist` if you have built locally. It is replaced
   by the first real deploy in step 8 and nothing depends on it.
4. **Do not connect a Git repository** to this project, now or later. The `deploy` job in
   `.github/workflows/website.yml` is the only thing that should ever deploy it.

> **Why not let Cloudflare build it?** Connecting Git would work, but then two systems
> deploy on every push, each with its own build and its own idea of the environment
> variables. One deploy path, one build, one log to read when something breaks.

**Verify:** *Workers & Pages* lists `foodos-website`, and its **Settings → Builds** says
the project has no Git connection.

---

## Step 5 — Create the Turnstile keys (3 min)

1. Cloudflare dashboard → **Turnstile** → **Add widget**.
   - Widget name: `foodos-website`
   - Hostnames: `foodos.ai`, `www.foodos.ai`, and `foodos-website.pages.dev`
     (the last one is needed for preview deploys to pass verification — Turnstile
     treats a listed hostname as covering its subdomains, so the per-branch
     `<branch>.foodos-website.pages.dev` preview URLs are included)
   - Widget mode: **Managed**
2. **Create**. You get two keys:
   - **Site key** (public, starts `0x4AAAA…`) → **value 4**
   - **Secret key** (private) → **value 5**

The site key is compiled into the browser bundle and is public by design. The secret
key is verified server-side only and must stay a secret.

---

## Step 6 — Add the runtime secrets to Pages (5 min)

These four are read by the Function at request time, on Cloudflare. They are the only
things you set on the Pages project.

Pages project → **Settings** → **Variables and Secrets**. Add each row for **both
Production and Preview** — preview deploys that are missing them will 502 — and click
**Encrypt** on every one:

| Name | Production | Preview |
|---|---|---|
| `TURNSTILE_SECRET_KEY` | value 5 | value 5 |
| `GOOGLE_SHEET_ID` | value 1 | value 1 |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | value 2 | value 2 |
| `GOOGLE_PRIVATE_KEY` | value 3 | value 3 |

> **Encrypt every one.** Once encrypted, Cloudflare will not show you the value again —
> that is the point. To change one, overwrite it.

Equivalent from a terminal, if you would rather not paste into a browser (it prompts for
each value and echoes nothing):

```bash
cd website
npx wrangler pages secret put TURNSTILE_SECRET_KEY --project-name foodos-website
npx wrangler pages secret put GOOGLE_SHEET_ID --project-name foodos-website
npx wrangler pages secret put GOOGLE_SERVICE_ACCOUNT_EMAIL --project-name foodos-website
npx wrangler pages secret put GOOGLE_PRIVATE_KEY --project-name foodos-website
# then repeat all four with --environment preview
```

### Three things not to set here

- **`LEAD_SINK`** — owned by `website/wrangler.toml`, which is committed to the repo and
  already sets `google_sheet` for both production and preview. A Pages project that ships
  a wrangler config takes its plaintext variables from that file, so anything you type
  into the dashboard for `LEAD_SINK` is overwritten on the next deploy. Change it in the
  file, not the UI.
- **`VITE_TURNSTILE_SITE_KEY`** — compiled into the bundle at build time, and the build
  now runs in GitHub Actions. It goes in the repo as a variable, not here. Step 7.
- **`NODE_VERSION`** — only used by Cloudflare's own build system, which we no longer
  use. The Node version is pinned in the workflow instead.

> **On `GOOGLE_SHEET_ID` vs `SHEET_ID`:** settled on 2026-10-13 — `GOOGLE_SHEET_ID` is
> the only name, and `SHEET_ID` has been deleted from the Function. A leftover `SHEET_ID`
> is now ignored rather than silently winning.

The Function has working defaults for everything else. You only need these if you want
to change its behaviour (set them in `wrangler.toml`, for the same reason as `LEAD_SINK`):

| Name | Default | What it does |
|---|---|---|
| `SHEET_RANGE` | `Leads` | Which tab to append to |
| `RATE_LIMIT_MAX` | `5` | Submissions allowed per IP per window |
| `RATE_LIMIT_WINDOW_SECONDS` | `600` | Length of that window |
| `ALLOWED_ORIGINS` | site origin | Extra CORS origins, comma separated |

> **`GOOGLE_PRIVATE_KEY` is the fiddly one.** Paste it as a single line with literal
> `\n` sequences, exactly as it appeared in the JSON. If you paste real newlines the
> JWT signing fails and you get a 502 with `invalid_grant` in the logs.

**A note on Preview:** Preview and Production share one sheet (your call, 2026-10-13), so
the table above sets the same `GOOGLE_SHEET_ID` for both. Test submissions will land in
your real leads sheet — the trade is that there is nothing to reconcile later, and the
`status` column is there to mark test rows. If it ever gets noisy, create a second sheet
and overwrite Preview's `GOOGLE_SHEET_ID` with its id; nothing in the code changes.

---

## Step 7 — Add the deploy credentials to GitHub (5 min)

The `deploy` job in `.github/workflows/website.yml` is live, and it fails fast with a
readable error until these three exist. Nothing is deployed before you add them.

1. Create a scoped Cloudflare API token: **My Profile → API Tokens → Create Token →
   Create Custom Token**.
   - Permissions: **Account → Cloudflare Pages → Edit**. Nothing else — this token
     cannot touch DNS, your domain, or any other Cloudflare service.
   - Account resources: **Include → your account only**.
   - TTL: leave open-ended, or set one and diarise the rotation. An expired token shows
     up as a failed deploy, not a broken site.
2. Copy your **Account ID** from the right-hand sidebar of the account home page (or from
   any Workers & Pages URL — it is the long hex string).
3. GitHub repo → **Settings → Secrets and variables → Actions**:

   | Tab | Name | Value |
   |---|---|---|
   | **Secrets** | `CLOUDFLARE_API_TOKEN` | the token from 1 |
   | **Secrets** | `CLOUDFLARE_ACCOUNT_ID` | the account id from 2 |
   | **Variables** | `TURNSTILE_SITE_KEY` | value 4 |

   `TURNSTILE_SITE_KEY` goes in the **Variables** tab, not Secrets. It is public — it
   ships inside the JavaScript bundle — and the workflow reads it as `vars.`, so putting
   it in Secrets leaves it empty and the deploy fails the credentials check.

> **Fork PRs do not deploy.** GitHub does not expose repository secrets to pull requests
> from forks, so the `deploy` job skips them by design. `secret-scan` and `verify` still
> run, so a fork PR is still fully checked — it just gets no preview URL.

**Verify:** the Actions secrets page lists both secrets, and the Variables tab lists
`TURNSTILE_SITE_KEY`.

---

## Step 8 — Deploy and verify (5 min)

1. Push to `main` — or, to deploy without pushing code, GitHub repo → **Actions** →
   **website** → **Run workflow**.
2. The run has three jobs: `secret-scan`, `verify`, then `deploy`. The first two gate the
   third, so nothing reaches Cloudflare unless lint, typecheck, tests and the build pass.
3. The `deploy` job ends with `Success: Assets published!` and lists an uploaded Function
   for `/api/demo-requests`. The deployment URL is printed in the job summary.
4. Open that URL and work through the checks below.

> **The first run may create a GitHub Environment** called `production` (`preview` on
> PRs). That is expected — it gives you a deployment history, and a place to add required
> reviewers later if you ever want a manual gate before the live site changes.

### Verification checklist

- [ ] The homepage renders, styled, with no console errors.
- [ ] **No CSP violations in the browser console.** If you see
      `Refused to execute inline script`, the Vite module-preload polyfill is enabled —
      tell the Frontend Engineer to set `build.modulePreload.polyfill = false`.
      This is the single most likely thing to break on first deploy.
- [ ] The Turnstile widget appears in the demo form and resolves to a tick.
- [ ] Submit a real-looking demo request. You get a success state, not an error.
- [ ] **A new row appears in the `Leads` tab** within a couple of seconds, with the
      columns lined up and `status` = `new`.
- [ ] Submit again immediately — the rate limiter should return `429` after a few tries.
- [ ] Check response headers (DevTools → Network → the document request): you should
      see `strict-transport-security`, `x-frame-options: DENY` and a
      `content-security-policy`.

Also confirm attribution works: visit
`https://<your>.pages.dev/?utm_source=runbook&utm_campaign=test`, submit, and check that
`utmSource` and `utmCampaign` are populated in the sheet row.

### If the deploy job fails

Read the failing step in the GitHub Actions log.

| Symptom | Almost always |
|---|---|
| `Not configured for deploy. Missing: …` | Step 7 is incomplete — the job names exactly which secret or variable is absent |
| `Project not found` from wrangler | The Pages project is not named `foodos-website`, or the API token is scoped to a different account |
| `Authentication error [code: 10000]` | The token lacks **Account → Cloudflare Pages → Edit**, or it has expired |
| The Turnstile widget never renders on the deployed site | `TURNSTILE_SITE_KEY` was added as a *secret* instead of a *variable*, so the build compiled in an empty key |

### If a submission fails

Pages project → **Deployments** → the deployment → **Functions** → **Real-time logs**,
then submit again and read the error.

| Symptom | Almost always |
|---|---|
| `403 PERMISSION_DENIED` from Sheets | Step 3 was skipped — share the sheet with the service account |
| `invalid_grant` / JWT error | `GOOGLE_PRIVATE_KEY` pasted with real newlines instead of `\n` |
| `Unable to parse range: Leads!A:T` | The tab is not named exactly `Leads` (case-sensitive) |
| `403 { error: "bot" }` on every submit | Site key and secret key are from different widgets, or the hostname is not on the widget's list |
| `missing: GOOGLE_SHEET_ID, …` in the logs | The step 6 secrets were added to Production but not Preview, or not saved as encrypted |
| 502 with no Google error | `LEAD_SINK` resolved to `console` — check `wrangler.toml` was deployed with the build |

---

## Step 9 — Custom domain and analytics (5 min + DNS)

### Custom domain

1. Pages project → **Custom domains** → **Set up a custom domain** → `foodos.ai`.
2. If `foodos.ai` is already on Cloudflare DNS, the record is created for you and goes
   active in under a minute.
3. Repeat for `www.foodos.ai`, then add a redirect so there is one canonical host:
   *Rules → Redirect Rules* → if hostname equals `www.foodos.ai`, 301 to
   `https://foodos.ai/${http.request.uri.path}`.
4. Go back to the **Turnstile** widget and confirm both hostnames are listed (step 5).

TLS certificates are issued automatically and take up to 15 minutes.

### Web Analytics

1. Cloudflare dashboard → **Web Analytics** → **Add a site** → `foodos.ai`.
2. Because the site is on Cloudflare, choose **automatic setup** — the beacon is
   injected at the edge and no code change is needed. The CSP already allows
   `static.cloudflareinsights.com`.
3. Confirm the Pages project has Web Analytics enabled under
   *Settings → Web Analytics*.

Cookieless, so no consent banner is required.

**Verify:** `https://foodos.ai` loads over HTTPS, and Web Analytics shows a page view
within a few minutes.

---

## Rollback

### Roll back a bad deploy (under a minute)

Pages project → **Deployments** → find the last known-good deployment →
**⋯ → Rollback to this deployment**. Pages keeps every previous upload, so this is
instant and needs no rebuild, no git revert and no GitHub Actions run. Do this first,
then fix forward in the repo at normal speed.

### Stop all deploys

GitHub repo → **Actions** → **website** → **⋯ → Disable workflow**. The live site is
untouched; only new deploys stop. Re-enable in the same place.

### Roll back the custom domain

Pages project → **Custom domains** → remove `foodos.ai`. The site stays live on
`*.pages.dev`, so you lose the domain, not the site.

### Revoke a leaked credential

| Leaked | Do this | Then |
|---|---|---|
| Google service-account key | GCP → Service Accounts → `foodos-website-sheets` → Keys → delete the key | Create a new key (step 2.5), update `GOOGLE_PRIVATE_KEY` in Pages for both environments, redeploy |
| Turnstile secret key | Turnstile → widget → **Rotate secret key** | Update `TURNSTILE_SECRET_KEY` in Pages, redeploy |
| Cloudflare API token | My Profile → API Tokens → **Roll** or **Delete** | Update the GitHub secret |

Revoking the Google key is safe and reversible: the worst case is that demo requests
return 502 for the few minutes until you paste the new one. Thanks to the 502 path in
the architecture, those leads are still written to the Function logs rather than lost.

### Full teardown

Delete the Pages project, delete the Turnstile widget, delete the GCP project, and
un-share the sheet. The sheet itself — the only thing holding real data — is untouched
by all of the above.

---

## Appendix A — cost at our scale

**Expected: ₹0/month.** Every component sits inside a permanent free tier, not a trial.

| Component | Free tier | Our expected usage | Cost |
|---|---|---|---|
| Cloudflare Pages (static) | Unlimited requests and bandwidth; 500 deployments/month | A marketing site; well under 500 | ₹0 |
| Cloudflare Pages Functions | 100,000 requests/day, 10 ms CPU per invocation | One request per demo submission | ₹0 |
| Cloudflare Turnstile | 1,000,000 verifications/month | One per submission | ₹0 |
| Cloudflare Web Analytics | Unlimited, cookieless | Full site traffic | ₹0 |
| Google Sheets API | Free, no billing account needed | A few writes per day | ₹0 |
| GitHub Actions | 2,000 min/month on private repos; unlimited if public | ~3 min per run | ₹0 |
| **Domain `foodos.ai`** | — | Annual registration | **~₹6,000–8,000/year**, the one real cost |

Because we build in Actions and upload the result, Cloudflare's **build** minutes are
not consumed at all — the only build budget that matters is GitHub's.

### Limits we could actually hit, in rough order of likelihood

1. **GitHub Actions minutes — 2,000/month** while the repo is private. Every push to a
   PR runs `secret-scan` + `verify` + `deploy`, ~3 minutes, so that is roughly 650 runs
   a month. Three engineers pushing hard is the only way to approach it. Making the repo
   public removes the limit entirely. Mitigation already in place: the workflow is
   path-filtered to `website/**`, so commits elsewhere in the repo cost nothing, and
   non-`main` branches cancel their own in-progress runs.
2. **Pages deployments — 500/month on the free plan.** Each PR push produces a preview
   deployment, so this tracks item 1 closely. If it ever bites, restrict the `deploy`
   job to `main` and accept losing preview URLs.
3. **Sheets API write quota — 60 writes/min per user.** Only reachable under a spam
   flood, which is what Turnstile and the rate limiter exist to prevent. The failure
   mode is a 502, and the architecture requires the payload to be logged, so leads are
   recoverable from Function logs.
4. **Sheet size — 10M cells.** At 20 columns that is 500,000 rows. The architecture
   says revisit at ~50,000, which we would reach long before this matters.
5. **Functions CPU — 10 ms per invocation.** RSA-signing a JWT for Google auth is the
   expensive part. If this shows up as CPU-limit errors in the logs, the fix is to
   cache the access token across invocations (it is valid for an hour) rather than
   signing per request. Worth flagging to the Backend Engineer if it appears.

None of these cost money when hit — they fail or throttle rather than bill. There is no
configured spend on this stack, so there is nothing to cap.

---

## Appendix B — what runs where

| Thing | Local dev | Preview | Production |
|---|---|---|---|
| Triggered by | you | a pull request | a push to `main` |
| Built by | you | GitHub Actions | GitHub Actions |
| Lead sink | `ConsoleSink` | Google Sheet | Google Sheet |
| Turnstile keys | Cloudflare dummy test keys | Real | Real |
| Build-time vars come from | `website/.env` | GitHub Actions *variables* | GitHub Actions *variables* |
| Runtime secrets come from | `website/.dev.vars` (gitignored) | Pages encrypted vars | Pages encrypted vars |
| Plaintext runtime vars come from | `.dev.vars`, then `wrangler.toml` `[vars]` | `wrangler.toml` `[env.preview.vars]` | `wrangler.toml` `[env.production.vars]` |
| URL | `localhost:8788` | `<branch>.foodos-website.pages.dev` | `foodos.ai` |

The split is worth internalising, because it is where first deploys usually go wrong:
**anything with `VITE_` in the name is baked into the bundle by GitHub Actions and is
public; everything else is read on Cloudflare, at request time, and is secret.**

A fresh clone needs no accounts and no secrets:

```bash
cd website
cp .dev.vars.example .dev.vars   # dummy Turnstile keys, ConsoleSink
cp .env.example .env
npm ci
npm run dev                      # wrangler pages dev, site + /api together
```

Submitted leads print to the terminal instead of being written anywhere.

---

## Appendix C — decisions

### Settled on 2026-10-13

1. **Deploy path: GitHub Actions only.** The Pages Git integration is not connected and
   should not be. The `deploy` job is live; preview deploys on PRs replace what the Git
   integration would have given us. Steps 4, 7 and 8 above are written to this.
2. **The sheet id is `GOOGLE_SHEET_ID`.** `SHEET_ID` has been removed from the Function,
   its types, the tests and `.dev.vars.example`. One name, everywhere.
3. **Preview shares the production sheet.** Same `GOOGLE_SHEET_ID` in both environments;
   mark test rows with the `status` column.

### Still open — none of these block the deploy

4. **Will the repo be public?** If it is, GitHub Actions minutes become unlimited, which
   removes limit #1 in Appendix A. The repo contains no secrets either way.

5. **Who owns the leads sheet?** It is currently whichever Google account creates it. If
   that is a personal account, the team loses the leads when that person leaves. Worth
   putting it on a Workspace shared drive before the site goes live — moving it later
   means a new `GOOGLE_SHEET_ID` and a redeploy.

6. **Turnstile widget mode.** Set to **Managed**, which can show an interactive
   challenge. **Invisible** converts marginally better but catches less. Managed is the
   right default for a lead form; say if you would rather optimise for conversion.

7. **Where does `website/` live in the monorepo?** You offered to set up the repo
   structure. Recommendation and the migration steps are in the issue thread; the short
   version is **`apps/website/`**, plain directories, and no Nx/Turborepo/workspaces
   until we have a second package that needs them.

   The move touches **12 functional path references**: 8 in
   `.github/workflows/website.yml` (two `paths:` filters, two `working-directory`, two
   `cache-dependency-path`, the artifact `path:`, the wrangler-action
   `workingDirectory`) and 4 in `.gitleaks.toml` (the allowlist entries for
   `.dev.vars.example`, `.env.example`, `.wrangler/` and the test-fixtures directory).
   Nothing in `website/` itself hard-codes its own location, and Cloudflare never sees
   the repo layout at all — we upload a built `dist/`. Confirm the path and it is a
   ten-minute change.
