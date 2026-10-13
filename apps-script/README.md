# Apps Script API — the demo-request endpoint

The FoodOS.ai marketing site is static (GitHub Pages), so the one thing it needs
a server for — the **Book a demo** form — is a Google Apps Script web app bound
to the leads Google Sheet. It validates the submission and appends a row. There
is no Cloudflare, no server, no credential anywhere: the script runs as the
person who deployed it and writes to its own Sheet.

Decided by the CTO in "Revision 2" of [`docs/website-architecture.md`](../docs/website-architecture.md).

```
browser  ──fetch POST (text/plain, JSON body)──▶  /exec  ──appendRow──▶  Leads tab
```

| File | What it is |
|---|---|
| `Code.gs` | **The whole API.** Paste this into the Sheet's bound script. |
| `appsscript.json` | The project manifest: V8, IST, web-app access, one OAuth scope. |
| `examples/lead.json` | A sample payload for the verification curl below. |
| `tests/` | Node tests. They never touch Google — see [Tests](#tests). |

---

## Deploy (about 10 minutes, first time)

You need edit access to the leads Sheet. Nothing here costs money and no Google
Cloud project is involved.

1. **Open the bound script.** In the leads Sheet: **Extensions → Apps Script**.
   A project opens, bound to that spreadsheet. (If you reach the editor any
   other way, it is a *standalone* script — it cannot see the Sheet, and the
   endpoint will answer `upstream` on every lead. Start again from the Sheet.)

2. **Paste the code.** Select everything in `Code.gs` in the editor and replace
   it with this repo's [`Code.gs`](./Code.gs). It is deliberately one
   self-contained file, so this is a single copy-paste. Save (⌘S / Ctrl-S).

3. **Paste the manifest (optional but recommended).** Gear icon (Project
   Settings) → tick **Show "appsscript.json" manifest file in editor** → open
   `appsscript.json` in the file list → replace it with
   [this one](./appsscript.json) → save. It pins the V8 runtime, the IST
   timezone and the single narrow OAuth scope. Skipping it works; the defaults
   are just wider than they need to be.

4. **Deploy as a web app.** **Deploy → New deployment** → the gear next to
   "Select type" → **Web app**, then:

   | Field | Value | Why |
   |---|---|---|
   | Description | `foodos leads v1` | Any label. |
   | Execute as | **Me (your@email)** | The script writes to the Sheet with *your* access, so visitors need none. |
   | Who has access | **Anyone** | Must be *Anyone*, not "Anyone with a Google account" — visitors are anonymous. |

   Click **Deploy**, then **Authorize access** and pick your account. Google
   shows "Google hasn't verified this app": that is expected for a private
   script you wrote. **Advanced → Go to FoodOS leads (unsafe) → Allow.**

5. **Copy the Web app URL.** It ends in `/exec`. This is the endpoint.
   (The `/dev` URL also exists; it only works while signed in — never use it.)

6. **Verify** with the two curls [below](#verify-the-deployment), then check the
   `Leads` tab for the row.

7. **Give the URL to the site.** In GitHub: **Settings → Secrets and variables →
   Actions → Variables → New repository variable**, named **`DEMO_REQUEST_URL`**,
   with the `/exec` URL — or `gh variable set DEMO_REQUEST_URL -R
   doylefermi-kv/foodos.ai`. It is a *variable*, not a secret — it is public in
   the JS bundle either way. Re-run the `website` workflow to rebuild with it.

   > The repository variable is `DEMO_REQUEST_URL`; the workflow passes it to
   > the build as `VITE_DEMO_REQUEST_URL`, which is the name the frontend reads
   > (only `VITE_`-prefixed variables reach the bundle). Naming the *repository*
   > variable `VITE_…` would work too but reads as though GitHub knew about
   > Vite. See `.github/workflows/website.yml` and
   > [`docs/runbooks/website-setup.md`](../docs/runbooks/website-setup.md) step 4.

The `Leads` tab does not need to exist beforehand: the first lead creates it,
with the 20 headers in the fixed order and a frozen header row.

### Redeploying after a change to `Code.gs`

Saving the editor does **not** change what `/exec` serves. Each deployment is a
frozen snapshot, so after pasting a new version:

> **Deploy → Manage deployments** → pick the existing deployment → the **pencil
> icon** → **Version: New version** → **Deploy**.

That keeps the same `/exec` URL, so nothing else has to change. Using **New
deployment** instead mints a *different* URL and leaves the old code live on the
old one — which is how you end up debugging a fix that was never deployed.

---

## Verify the deployment

```bash
EXEC_URL='https://script.google.com/macros/s/AKfy…/exec'

# 1. Health check. -L matters: /exec answers with a redirect to
#    googleusercontent.com, and curl does not follow redirects by default.
curl -sL "$EXEC_URL"
# {"ok":true,"service":"foodos-leads"}

# 2. A real lead, exactly as the browser sends it.
curl -sL -H 'Content-Type: text/plain' -d @examples/lead.json "$EXEC_URL"
# {"ok":true,"id":"…uuid…"}   → and a new row in the Leads tab

# 3. Posting it a second time inside ten minutes is a duplicate.
curl -sL -H 'Content-Type: text/plain' -d @examples/lead.json "$EXEC_URL"
# {"ok":false,"error":"rate_limited"}
```

`Content-Type: text/plain` is not a mistake. A JSON content type would make the
browser send a CORS preflight, which an Apps Script web app cannot answer; the
body is JSON regardless and the script parses it itself.

**If the health check returns HTML** rather than JSON, it is a Google sign-in
page: the deployment's access is not *Anyone*. Fix it in **Manage deployments →
pencil → Who has access**.

Execution logs — including the full payload of any lead that failed to save —
are in the editor under **Executions**.

---

## The response mapping (for the frontend)

**An Apps Script web app always answers HTTP 200**, including when it throws.
The status code carries no information: branch on the body.

| Body | Cloudflare equivalent | What the form should do |
|---|---|---|
| `{ "ok": true, "id": "<uuid>" }` | `201 { id }` | Show the success state. `id` is the row's reference. |
| `{ "ok": false, "error": "validation", "fields": { "<field>": "<message>" } }` | `400` | Render each message against its field. The messages are the same copy the client-side validator produces. |
| `{ "ok": false, "error": "bot" }` | `403` | Generic "we couldn't verify that". Never say which field gave it away. |
| `{ "ok": false, "error": "rate_limited" }` | `429` | "Wait a minute and try again." Also what a duplicate submit of the same number inside 10 minutes returns. |
| `{ "ok": false, "error": "upstream" }` | `502` | "Your details did not reach us" — the append failed. The payload *is* in the execution log, so it can be replayed by hand, but do not promise the visitor that. |
| anything else (HTML, empty) | — | Treat as `upstream`. A sign-in page means the deployment access is wrong. |

These shapes are typed in `website/shared/contract.ts` as `DemoRequestOk`,
`DemoRequestFailure` and `DemoResponseBody`.

### The request

The accepted fields, their limits and their enums are exactly
`website/shared/contract.ts`. Two notes specific to this server:

- **`userAgent`** — Apps Script cannot read request headers, so the browser has
  to send its own user agent in the payload for that column to be filled. It is
  optional; absent just leaves the column empty.
- **`turnstileToken`** — accepted and ignored. Turnstile was dropped in
  Revision 2; a cached old bundle still sending one must not be rejected.

### What the server does with a lead

1. **Global cap** — at most 30 accepted leads per minute, counted in
   `CacheService`. Best-effort: the counter is not atomic, and Apps Script sees
   no client IP, so there is nothing finer to key on.
2. **Honeypot** — a non-empty `website` field returns `bot` and writes nothing.
3. **Validation** — the contract's rules, including normalising the phone to
   `+91XXXXXXXXXX`.
4. **Duplicate window** — the same normalised phone inside 10 minutes returns
   `rate_limited`. Only remembered *after* a successful write, so a failed
   append never locks a visitor out of the retry that saves their lead.
5. **Append** — inside a `LockService` script lock, so two simultaneous submits
   cannot resolve to the same row and overwrite each other.

Columns, in the order fixed by the architecture doc:

```
id, receivedAt, name, phone, email, restaurantName, city, outlets,
restaurantType, preferredLanguage, message, utmSource, utmMedium,
utmCampaign, utmTerm, utmContent, referrer, landingPath, userAgent, status
```

`receivedAt` is ISO 8601 in IST (`2026-10-13T15:31:08.266+05:30`), which sorts
correctly as text. `status` starts at `new`, for the sales team to update.

Cells starting `=`, `+`, `-` or `@` are written with a leading apostrophe —
Sheets' own "this is text" marker, which is consumed on write. `appendRow`
parses what it writes exactly as if a person had typed it, so without this a
phone number like `+919876543210` would land as a formula error. **Never
reorder or insert a column** without changing `SHEET_COLUMNS` in both
`Code.gs` and `contract.ts`: existing sheets already carry these headers.

---

## Tests

```bash
cd apps-script && npm test      # no install step: zero dependencies
```

Nothing here talks to Google. `tests/apps-script-env.js` evaluates `Code.gs`
inside a `node:vm` context whose globals are fakes of `SpreadsheetApp`,
`CacheService`, `LockService`, `ContentService` and `Utilities`, then reads the
functions off it. That is also why `Code.gs` declares its top-level values with
`var` and never `const` — only `var` and `function` become properties of the
sandbox's global object, and the tests would not see the rest.

| File | Covers |
|---|---|
| `tests/validation.test.js` | The pure logic: validation, normalisation, the honeypot, row mapping, the IST timestamp. |
| `tests/do-post.test.js` | `doPost`/`doGet` end to end: what is appended, the lock, the throttles, the failure paths, tab creation. |
| `tests/parity.test.ts` | **The drift guard.** Runs `Code.gs` *and* `website/shared/contract.ts` over one set of fixtures and fails if they disagree on anything. |
| `tests/fixtures.js` | The cases both of the above are judged against. |

The parity test is the one that matters most. The browser validates with the
contract and the server validates with this port; if they drift, a visitor is
either told their input is fine and then silently rejected, or blocked in the
form over something the server would have accepted. Neither failure announces
itself in production. **When it fails, the contract is right and `Code.gs` is
wrong** — unless the CTO changed the contract, in which case update the port.

Requires Node 24+ (the tests import a `.ts` module directly and rely on Node's
built-in type stripping) — the same version CI pins for `website/`.

---

## Not done here (CTO decisions)

- Creating or deploying the script, or the Sheet, or the GitHub variable. That
  is step 1–7 above, done by the CTO.
- Any analytics hook, and reCAPTCHA. Both are open decisions in the
  architecture doc.
- Email/Slack notification on a new lead. Apps Script makes this a few lines
  (`MailApp.sendEmail` in the append path), but nobody has asked for it.
