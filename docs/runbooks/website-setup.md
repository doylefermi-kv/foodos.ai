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

---

## Before you start

You will need:

- A Google account that can create a Google Cloud project (any Workspace or personal account).
- A Cloudflare account, with `foodos.ai` already registered. If the domain is registered
  elsewhere you will need access to change nameservers at that registrar.
- Admin access to the GitHub repo (only for step 9, the optional CI deploy).

Keep a scratch notepad open. You will collect five values along the way:

| # | Value | From step | Where it ends up |
|---|---|---|---|
| 1 | `GOOGLE_SHEET_ID` | 1 | Pages secret |
| 2 | `GOOGLE_SERVICE_ACCOUNT_EMAIL` | 2 | Pages secret |
| 3 | `GOOGLE_PRIVATE_KEY` | 2 | Pages secret |
| 4 | `TURNSTILE_SITE_KEY` (public) | 5 | Pages build variable |
| 5 | `TURNSTILE_SECRET_KEY` | 5 | Pages secret |

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

## Step 4 — Create the Cloudflare Pages project (5 min)

Two ways to do this. **Option A is recommended** — it gives you per-PR preview
deploys for free and means CI never needs a Cloudflare token.

### Option A — connect the Git repo (recommended)

1. Cloudflare dashboard → **Workers & Pages** → **Create** → **Pages** →
   **Connect to Git**. Authorise GitHub and pick the `foodos` repo.
2. Build settings:

   | Setting | Value |
   |---|---|
   | Project name | `foodos-website` |
   | Production branch | `main` |
   | Framework preset | Vite |
   | Build command | `npm run build` |
   | Build output directory | `dist` |
   | **Root directory** | `website` |

   The root directory matters: the site is a subdirectory of the repo, not the root.
3. Do **not** deploy yet — click through to the project, then go to step 5 and add the
   environment variables first. The first build will fail without them, which is
   harmless but confusing.

### Option B — direct upload via CI

Skip this unless you specifically want GitHub Actions to own deploys. Create the
project as **Direct Upload**, name it `foodos-website`, then follow step 9.

---

## Step 5 — Create the Turnstile keys (3 min)

1. Cloudflare dashboard → **Turnstile** → **Add widget**.
   - Widget name: `foodos-website`
   - Hostnames: `foodos.ai`, `www.foodos.ai`, and `foodos-website.pages.dev`
     (the last one is needed for preview deploys to pass verification)
   - Widget mode: **Managed**
2. **Create**. You get two keys:
   - **Site key** (public, starts `0x4AAAA…`) → **value 4**
   - **Secret key** (private) → **value 5**

The site key is compiled into the browser bundle and is public by design. The secret
key is verified server-side only and must stay a secret.

---

## Step 6 — Add environment variables to Pages (5 min)

Pages project → **Settings** → **Environment variables**. There are two sections and
you must fill in **both Production and Preview**, otherwise preview deploys will 502.

### Variables (plaintext — used at build time)

| Name | Production | Preview |
|---|---|---|
| `VITE_TURNSTILE_SITE_KEY` | value 4 | value 4 |
| `NODE_VERSION` | `24` | `24` |

### Secrets (click **Encrypt** — used at runtime by the Function)

| Name | Production | Preview |
|---|---|---|
| `TURNSTILE_SECRET_KEY` | value 5 | value 5 |
| `GOOGLE_SHEET_ID` | value 1 | value 1 |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | value 2 | value 2 |
| `GOOGLE_PRIVATE_KEY` | value 3 | value 3 |
| `LEAD_SINK` | `google-sheet` | `google-sheet` |

> **Encrypt every row in the second table.** Once encrypted, Cloudflare will not show
> you the value again — that is the point. To change one, overwrite it.

> **On `GOOGLE_SHEET_ID` vs `SHEET_ID`:** FOO-2 specified `SHEET_ID`; this runbook and
> the Pages scaffolding use `GOOGLE_SHEET_ID`. The Function currently reads **both**
> (`SHEET_ID` wins if set), so following this runbook as written works. It is still one
> name too many — see "open decisions" at the end. Set only `GOOGLE_SHEET_ID`.

The Function has working defaults for everything else. You only need these if you want
to change its behaviour:

| Name | Default | What it does |
|---|---|---|
| `SHEET_RANGE` | `Leads` | Which tab to append to |
| `RATE_LIMIT_MAX` | `5` | Submissions allowed per IP per window |
| `RATE_LIMIT_WINDOW_SECONDS` | `600` | Length of that window |
| `ALLOWED_ORIGINS` | site origin | Extra CORS origins, comma separated |

> **`GOOGLE_PRIVATE_KEY` is the fiddly one.** Paste it as a single line with literal
> `\n` sequences, exactly as it appeared in the JSON. If you paste real newlines the
> JWT signing fails and you get a 502 with `invalid_grant` in the logs.

**A note on Preview:** using the same sheet for preview and production means test
submissions land in your real leads sheet. That is the right trade for a pre-launch
site — one sheet, nothing to reconcile. If it becomes noisy, create a second sheet and
point Preview's `GOOGLE_SHEET_ID` at it; the `status` column is also there for you to
mark rows as test.

---

## Step 7 — Deploy and verify (5 min)

1. Pages project → **Deployments** → **Create deployment** (or push to `main`).
2. Watch the build log. It should end with `Success: Assets published!` and list an
   uploaded Function for `/api/demo-requests`.
3. Open the `*.pages.dev` URL and work through the checks below.

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

### If a submission fails

Pages project → **Deployments** → the deployment → **Functions** → **Real-time logs**,
then submit again and read the error.

| Symptom | Almost always |
|---|---|
| `403 PERMISSION_DENIED` from Sheets | Step 3 was skipped — share the sheet with the service account |
| `invalid_grant` / JWT error | `GOOGLE_PRIVATE_KEY` pasted with real newlines instead of `\n` |
| `Unable to parse range: Leads!A:T` | The tab is not named exactly `Leads` (case-sensitive) |
| `403 { error: "bot" }` on every submit | Site key and secret key are from different widgets, or the hostname is not on the widget's list |
| 502 with no Google error | `LEAD_SINK` is still `console` |

---

## Step 8 — Custom domain and analytics (5 min + DNS)

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

## Step 9 — Enable the CI deploy job (optional, 3 min)

**Skip this entirely if you used Option A in step 4.** The Pages Git integration
already deploys on every push and gives you preview URLs per PR; enabling both would
deploy the site twice per push.

Only for Option B (direct upload):

1. Create a scoped API token: Cloudflare → **My Profile → API Tokens → Create Token →
   Custom token**.
   - Permissions: **Account → Cloudflare Pages → Edit**. Nothing else.
   - Account resources: your account only.
   - Set a TTL if you want one; you will need to rotate it when it expires.
2. Copy your **Account ID** from the right sidebar of the account home page.
3. GitHub repo → **Settings → Secrets and variables → Actions**:
   - Secret `CLOUDFLARE_API_TOKEN` = the token
   - Secret `CLOUDFLARE_ACCOUNT_ID` = the account id
   - Variable (not secret) `TURNSTILE_SITE_KEY` = value 4
4. Edit `.github/workflows/website.yml`, find the `deploy` job, and change:

   ```yaml
   if: false # <-- CTO: see the comment above before changing this.
   ```

   to:

   ```yaml
   if: github.ref == 'refs/heads/main' && github.event_name == 'push'
   ```

5. Open it as a PR so CI verifies the workflow parses before it can ever run.

---

## Rollback

### Roll back a bad deploy (under a minute)

Pages project → **Deployments** → find the last known-good deployment →
**⋯ → Rollback to this deployment**. Pages keeps every previous build, so this is
instant and needs no rebuild or git revert.

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
| Cloudflare Pages (static) | Unlimited requests and bandwidth; 500 builds/month | A marketing site; well under 500 builds | ₹0 |
| Cloudflare Pages Functions | 100,000 requests/day, 10 ms CPU per invocation | One request per demo submission | ₹0 |
| Cloudflare Turnstile | 1,000,000 verifications/month | One per submission | ₹0 |
| Cloudflare Web Analytics | Unlimited, cookieless | Full site traffic | ₹0 |
| Google Sheets API | Free, no billing account needed | A few writes per day | ₹0 |
| GitHub Actions | 2,000 min/month on private repos; unlimited if public | ~3 min per run | ₹0 |
| **Domain `foodos.ai`** | — | Annual registration | **~₹6,000–8,000/year**, the one real cost |

### Limits we could actually hit, in rough order of likelihood

1. **Pages build minutes — 500 builds/month.** Every PR commit triggers a preview
   build. Three engineers pushing hard could reach this. Mitigation: the Git
   integration lets you restrict preview deploys to specific branches.
2. **GitHub Actions minutes — 2,000/month** while the repo is private. At ~3 minutes a
   run that is ~650 runs, so this only bites alongside item 1. Making the repo public
   removes the limit entirely.
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
| Lead sink | `ConsoleSink` | Google Sheet | Google Sheet |
| Turnstile keys | Cloudflare dummy test keys | Real | Real |
| Secrets come from | `website/.dev.vars` (gitignored) | Pages encrypted vars | Pages encrypted vars |
| URL | `localhost:8788` | `<hash>.foodos-website.pages.dev` | `foodos.ai` |

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

## Appendix C — open decisions for the CTO

None of these block the deploy. Each is a judgement call that was not ours to make, so
the code takes the safe option and waits.

1. **Which deploy path?** Pages Git integration (step 4, Option A) or GitHub Actions
   (step 9, Option B). Option A is recommended and needs no Cloudflare token in GitHub.
   Whichever you pick, do **not** run both. If you pick A, delete the `deploy` job from
   `.github/workflows/website.yml` rather than leaving it disabled.

2. **`SHEET_ID` or `GOOGLE_SHEET_ID`?** FOO-2 specified the first, this runbook and the
   Pages scaffolding use the second, and the Function currently reads both to unblock
   parallel work. Pick one and we will delete the other, so there is a single name to
   get right when you are pasting secrets at 11pm.

3. **Does Preview share the production sheet?** Currently yes — one sheet, nothing to
   reconcile, but test submissions land among real leads. Alternative is a second sheet
   and a different `GOOGLE_SHEET_ID` for Preview.

4. **Will the repo be public?** If it is, GitHub Actions minutes become unlimited, which
   removes limit #2 in Appendix A. The repo contains no secrets either way.

5. **Who owns the leads sheet?** It is currently whichever Google account creates it. If
   that is a personal account, the team loses the leads when that person leaves. Worth
   putting it on a Workspace shared drive before the site goes live.

6. **Turnstile widget mode.** Set to **Managed**, which can show an interactive
   challenge. **Invisible** converts marginally better but catches less. Managed is the
   right default for a lead form; say if you would rather optimise for conversion.
