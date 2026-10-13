# Runbook: deploying the FoodOS.ai marketing site

**For:** the CTO · **Owner:** DevOps (FOO-6) · **Last updated:** 2026-10-13
**Architecture:** [`docs/website-architecture.md`](../website-architecture.md), "Revision 2"

This replaces the Cloudflare runbook (FOO-4) in full. There is no Cloudflare, no
Turnstile, no Google Cloud project and no service account anywhere in this setup.

**Time:** about 15 minutes. **Cost:** ₹0/month, except the domain if you want one.

```
  push to main
       │
       ▼
  GitHub Actions ──build──▶ GitHub Pages ──serves──▶ doylefermi-kv.github.io/foodos.ai/
                                                              │
                                                     Book a demo form
                                                              │ fetch POST
                                                              ▼
                                               Apps Script /exec ──appendRow──▶ Leads tab
```

**The one rule:** a real credential never goes in the repo, a chat message or an
issue comment. This setup is designed so there is no credential to handle at
all — the Apps Script runs as you and writes to its own Sheet. The only value
you will copy around is the `/exec` URL, which is public by design.

---

## Before you start

- **Admin on `doylefermi-kv/foodos.ai`** — needed for steps 1 and 4.
- **A Google account** that can create a Sheet. Any personal or Workspace account.
- `gh` CLI logged in, if you want to use the command-line version of each step.

The repo is **public**, so GitHub Pages works on the Free plan and Actions
minutes are unmetered. Making it private would break both.

You will collect exactly one value along the way:

| # | Value | From step | Where it ends up |
|---|---|---|---|
| 1 | Apps Script `/exec` URL | Step 3 | The `DEMO_REQUEST_URL` repository variable (step 4) |

---

## Step 1 — Turn on GitHub Pages (1 min)

**Settings → Pages → Build and deployment → Source: `GitHub Actions`.**

Do not pick "Deploy from a branch" — the workflow uploads an artifact, it does
not commit to `gh-pages`.

Command-line equivalent:

```bash
gh api -X POST repos/doylefermi-kv/foodos.ai/pages -f build_type=workflow
```

While you are on that page, tick **Enforce HTTPS** if it is not already on and
not greyed out. On `*.github.io` it is normally enforced and the box is fixed on.

**Verify:** the Pages settings page says *"Your site is live at
https://doylefermi-kv.github.io/foodos.ai/"* after the first deploy finishes.
Until then it says the source is GitHub Actions, which is all step 1 needs.

> **If the `deploy` job fails with "Pages is not enabled for this repository"**,
> this step has not been done. Do it, then re-run the workflow.

---

## Step 2 — Create the leads Google Sheet (3 min)

1. Go to <https://sheets.new>. Name the file **FoodOS.ai — Demo requests**.
2. Rename the first tab (bottom left) to exactly **`Leads`** — capital L. The
   script matches the tab by name, case-sensitively.
3. Paste this as **row 1**. The column order is fixed by the architecture doc —
   the script appends *positionally*, so reordering columns silently corrupts
   every new lead.

```
id	receivedAt	name	phone	email	restaurantName	city	outlets	restaurantType	preferredLanguage	message	utmSource	utmMedium	utmCampaign	utmTerm	utmContent	referrer	landingPath	userAgent	status
```

> Those separators are **tabs**. Copy the line and paste into cell `A1` — Sheets
> splits it across A1:T1 automatically. If it all lands in one cell, use
> *Data → Split text to columns*.

4. Freeze the header: *View → Freeze → 1 row*.

**Verify:** row 1 has 20 populated columns, ending in `status`.

> You can skip steps 2–4 entirely if you prefer: the script **creates the `Leads`
> tab with the correct frozen header row** the first time a lead arrives. Doing
> it by hand just means you see the shape before the first lead rather than after.
>
> You do **not** need the sheet id. The script is *bound* to this spreadsheet and
> finds it by itself.

---

## Step 3 — Deploy the Apps Script web app (6 min)

Full detail, including the response contract and troubleshooting, is in
[`apps-script/README.md`](../../apps-script/README.md). The short version:

1. **From the Sheet** (this matters): **Extensions → Apps Script**. A project
   opens *bound* to that spreadsheet. Reaching the editor any other way creates a
   *standalone* script, which cannot see the Sheet and answers `upstream` on
   every lead.
2. **Paste the code.** Replace everything in the editor's `Code.gs` with this
   repo's [`apps-script/Code.gs`](../../apps-script/Code.gs). One self-contained
   file, so it is a single copy-paste. Save.
3. **Deploy → New deployment** → gear next to "Select type" → **Web app**:

   | Field | Value | Why |
   |---|---|---|
   | Description | `foodos leads v1` | Any label. |
   | Execute as | **Me (your@email)** | The script writes to the Sheet as you, so visitors need no access. |
   | Who has access | **Anyone** | Must be *Anyone*, **not** "Anyone with a Google account" — visitors are anonymous. |

   **Deploy** → **Authorize access** → pick your account. Google warns "Google
   hasn't verified this app"; that is expected for your own script.
   **Advanced → Go to … (unsafe) → Allow.**
4. **Copy the Web app URL.** It ends in `/exec`. That is value 1.
   (A `/dev` URL also exists. It only works while you are signed in — never use it.)

**Verify** before moving on:

```bash
EXEC_URL='https://script.google.com/macros/s/AKfy…/exec'
curl -sL "$EXEC_URL"
# {"ok":true,"service":"foodos-leads"}
```

`-L` matters: `/exec` answers with a redirect to `googleusercontent.com`.
**If this returns HTML**, it is a Google sign-in page — "Who has access" is not
*Anyone*. Fix it in *Manage deployments → pencil → Who has access*.

### ⚠️ Redeploying after any change to `Code.gs`

Saving the editor does **not** change what `/exec` serves — each deployment is a
frozen snapshot. To ship a change:

> **Deploy → Manage deployments** → select the existing deployment → the
> **pencil icon** → **Version: New version** → **Deploy**.

**Never use *New deployment* for an update.** It mints a *different* `/exec` URL
and leaves the old code serving on the old one — which is how you end up
debugging a fix that was never deployed, or silently sending leads to a stale
script. *New deployment* is for the very first deploy only.

---

## Step 4 — Give the site the endpoint (1 min)

```bash
gh variable set DEMO_REQUEST_URL -R doylefermi-kv/foodos.ai
# paste the /exec URL when prompted, then Ctrl-D
```

Or: **Settings → Secrets and variables → Actions → Variables → New repository
variable**, name `DEMO_REQUEST_URL`, value the `/exec` URL.

It is a **variable, not a secret**, on purpose: the build compiles it into the
JavaScript bundle, where anyone can read it. Storing it as a secret would hide it
from you and from nobody else. Nothing about this endpoint is confidential — it
accepts anonymous POSTs by design, and its protection is the validation,
honeypot and rate limiting inside `Code.gs`.

**Verify:** `gh variable list -R doylefermi-kv/foodos.ai` shows `DEMO_REQUEST_URL`.

---

## Step 5 — Deploy and verify end to end (4 min)

The variable is read at **build** time, so the site must be rebuilt after step 4:

```bash
gh workflow run website.yml -R doylefermi-kv/foodos.ai
gh run watch -R doylefermi-kv/foodos.ai
```

Or **Actions → website → Run workflow**.

**Verify, in order — each line tells you which step broke:**

1. The run is green, all three jobs (`Secret scan`, `Lint, typecheck, test,
   build`, `Deploy to GitHub Pages`). The run summary prints the live URL and
   whether the demo form is configured.
2. <https://doylefermi-kv.github.io/foodos.ai/> loads, styled, with the hero
   visible. **A blank page here means a base-path problem** — see Troubleshooting.
3. The browser console is empty. No 404s in the Network tab.
4. Click **Book a demo**. The form opens with **no** "Demo booking isn't
   configured yet" banner. If the banner is there, `DEMO_REQUEST_URL` was not
   set, or the site was not rebuilt after setting it.
5. Submit a real test lead — your own name and phone number.
6. The form shows the success state with a reference id, **and a new row appears
   in the `Leads` tab** within a second or two. Mark its `status` column as
   `test` so sales ignore it.

If step 6 fails but step 5 succeeded, the Apps Script side is at fault: open the
script editor → **Executions** for the error and the full payload.

---

## Rollback

The site is a static artifact per workflow run, so rolling back is re-running an
old run — there is nothing to undo:

**Actions → website → pick the last known-good run → "Re-run all jobs".**

That rebuilds that commit and republishes it. It takes about two minutes and it
is the fastest path back; reverting the commit is the right follow-up, not the
emergency action.

To take the site down entirely: **Settings → Pages → Unpublish site**.

---

## Step 6 (optional) — the custom domain `foodos.ai`

Only worth doing once the content is launch-ready. Everything above keeps working
on the `github.io` URL in the meantime.

**1. DNS**, at whichever registrar holds `foodos.ai`:

| Type | Name | Value |
|---|---|---|
| A | `@` | `185.199.108.153` |
| A | `@` | `185.199.109.153` |
| A | `@` | `185.199.110.153` |
| A | `@` | `185.199.111.153` |
| AAAA | `@` | `2606:50c0:8000::153` |
| AAAA | `@` | `2606:50c0:8001::153` |
| AAAA | `@` | `2606:50c0:8002::153` |
| AAAA | `@` | `2606:50c0:8003::153` |
| CNAME | `www` | `doylefermi-kv.github.io.` |

Check GitHub's current list before relying on these:
<https://docs.github.com/pages/configuring-a-custom-domain-for-your-github-pages-site>

**2. Tell Pages:** Settings → Pages → Custom domain → `foodos.ai` → Save. GitHub
commits a `CNAME` file to the repo root for you. Do not also add one by hand —
one source of truth.

**3. Wait for the certificate**, then tick **Enforce HTTPS**. The box stays
greyed out until the cert is issued (usually minutes, up to 24h).

**4. Move the site off the sub-path.** This is a code change, in
`.github/workflows/website.yml`:

```yaml
env:
  BASE_PATH: '/'
  SITE_ORIGIN: 'https://foodos.ai'
```

Commit that and the next deploy serves from the root with correct asset URLs,
`robots.txt` and `sitemap.xml`. Nothing else needs touching — the canonical and
Open Graph URLs correct themselves to the serving origin at runtime
(`website/src/lib/meta.ts`), and `npm run check:dist` fails the build if any
asset URL disagrees with `BASE_PATH`.

**Do these in order.** Switching `BASE_PATH` to `/` before DNS resolves leaves
the `github.io` URL serving a blank page.

---

## What this host cannot give us

**A recorded decision, not an oversight** — the CTO accepted GitHub-Pages-only on
2026-10-13 after QA measured each line below (`qa/reports/FOO-9`, follow-up test).

GitHub Pages cannot set HTTP response headers at all. The FOO-4 security headers
lived in `website/public/_headers`, a Cloudflare/Netlify convention that Pages
ignores — and would have served as a public file while applying none of it. That
file is deleted.

| Header | On GitHub Pages |
|---|---|
| `Content-Security-Policy` | **Kept** — moved into `<meta http-equiv>` in `index.html`. Verified genuinely enforced, including blocking a disallowed cross-origin POST. |
| `Referrer-Policy` | **Kept** — `<meta name="referrer">`. |
| `X-Frame-Options` / `frame-ancestors` | **Lost.** Neither can be delivered from HTML. **The site is frameable** — measured, not assumed. |
| `Permissions-Policy` | **Lost.** No meta equivalent. |
| COOP / CORP | **Lost.** No meta equivalent. |
| `X-Content-Type-Options` | **Lost.** Pages does not send it. |
| `Strict-Transport-Security` | **Not sent by Pages.** On `*.github.io` HTTPS is enforced because the domain is HSTS-preloaded. On `foodos.ai` later, HSTS needs whatever fronts the domain. |

The residual risk is **clickjacking**. On a page whose only action is "open a
form and ask for a demo", with no login, no session and no user data in the
browser, that is low. It becomes worth revisiting the moment there is a real
login or a dashboard on this domain — at which point the answer is a host that
can set headers.

Also lost, and purely a performance note: Pages serves everything with
`max-age=600`, so content-hashed assets are revalidated every 10 minutes instead
of cached for a year.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `deploy` fails: "Pages is not enabled" | Step 1 not done | Do step 1, re-run the workflow. |
| Site loads **blank**, console shows 404s for `/assets/…` | `BASE_PATH` does not match where Pages serves the site | `BASE_PATH` must be `/foodos.ai/` for the project URL, `/` for a custom domain. `npm run check:dist` catches this before deploy. |
| Form shows "Demo booking isn't configured yet" | `DEMO_REQUEST_URL` unset, or the site was not rebuilt after setting it | Step 4, then step 5. The value is baked in at build time. |
| Form says "we couldn't reach the server" | The `/exec` URL is wrong, or the deployment's access is not *Anyone* | Re-run the step 3 health check. |
| A fix to `Code.gs` has no effect | Saved the editor but did not redeploy, or used *New deployment* | *Manage deployments → pencil → New version*. See step 3. |
| Leads stop arriving, form still succeeds | The `Leads` tab was renamed, or columns reordered | Tab must be `Leads`; column order is fixed (step 2). |
| Push to `main` deploys nothing | The push touched no path under `website/` | Intended — the workflow is path-filtered. Use **Run workflow** to force a deploy. |

---

## Appendix A — cost

**₹0/month.** Every component is in a permanent free tier, not a trial.

| Component | Free tier | Our usage | Cost |
|---|---|---|---|
| GitHub Pages | 1 GB site, 100 GB/month bandwidth, 10 builds/hour (soft) | A ~300 KB marketing site | ₹0 |
| GitHub Actions | Unlimited minutes on **public** repos | ~3 min per run | ₹0 |
| Google Apps Script | 20,000 URL-fetch calls/day; web apps free | One execution per lead | ₹0 |
| Google Sheets | 10M cells | 20 columns → 500,000 rows | ₹0 |
| **Domain `foodos.ai`** | — | Annual registration | **~₹6,000–8,000/year**, the only real cost |

Nothing here bills on overage — these throttle or fail rather than charge. There
is no payment method attached to any of it.

**Limits we could plausibly hit**, in order of likelihood:

1. **Pages soft limit of 10 builds/hour.** Only reachable by pushing to `main`
   repeatedly. Deploys are `main`-only, so ordinary PR traffic cannot trip it.
2. **Sheet size, 10M cells.** 500,000 leads. The architecture says revisit the
   store at ~50,000.
3. **Apps Script quotas.** A spam flood is the only route; `Code.gs` has a
   per-minute cap and a per-phone duplicate window specifically for that.

---

## Appendix B — what runs where

| | Local dev | Pull request | Production |
|---|---|---|---|
| Triggered by | you | a PR touching `website/**` | a push to `main` touching `website/**`, or Run workflow |
| Runs | `npm run dev` | lint, typecheck, test, build, gitleaks | the same, then build + deploy |
| `VITE_DEMO_REQUEST_URL` | `website/.env`, usually empty | deliberately **unset** | the `DEMO_REQUEST_URL` repo variable |
| Deploys? | no | **no** — there are no preview deploys | yes, to GitHub Pages |
| URL | `localhost:5173` | — | `doylefermi-kv.github.io/foodos.ai/` |

PRs do not deploy anywhere. GitHub Pages has one site per repo, so a preview
deploy would overwrite production — reviewing means running the branch locally.

**The thing to internalise:** anything named `VITE_*` is compiled into the bundle
and is **public**. There is nothing in this stack that is secret, which is the
main reason it was chosen.

A fresh clone needs no accounts and no setup:

```bash
cd website
npm ci
npm run dev              # http://localhost:5173
```

The form shows its "not configured" state, which is correct — there is no
endpoint. To exercise it end to end locally, put an `/exec` URL in
`website/.env` as `VITE_DEMO_REQUEST_URL`.

```bash
npm run build && npm run check:dist   # exactly what CI gates on
npm run preview                       # serves the real sub-path build
```

---

## Appendix C — decisions

Settled by the CTO on 2026-10-13 (Revision 2 of the architecture doc, plus the
FOO-9 QA follow-up):

1. **No Cloudflare.** Hosting is GitHub Pages; the lead API is a bound Apps
   Script web app. Turnstile and Cloudflare Web Analytics are both dropped.
2. **Deploy path: GitHub Actions only**, `main` only, path-filtered to
   `website/**`.
3. **The repo stays public.** Pages on the Free plan and unmetered Actions
   minutes both depend on it.
4. **The endpoint is a variable, not a secret** — it is public in the bundle.
5. **The security headers Pages cannot send are accepted as lost**, with
   clickjacking as the named residual risk. See "What this host cannot give us".
6. **Spam protection is server-side only**: honeypot, validation, a per-minute
   cap and a per-phone duplicate window in `Code.gs`.

Still open, for the CTO:

- **Analytics.** None is wired up. `website/src/lib/analytics.ts` is an
  env-gated hook waiting for a decision (GA4, Plausible, or nothing).
- **The custom domain.** Step 6 is written and untested — nobody has pointed
  `foodos.ai` anywhere yet.
