# FOO-9 — QA: first full pass on the marketing website

**Verdict: PASS WITH ISSUES.** No Blockers. The sub-path production build — the
thing this pass most needed to de-risk before FOO-6 — is clean: every asset
resolves under `/foodos.ai/`, nothing is referenced from the root, no console
errors, no requests to unexpected hosts, and Lighthouse is 100/100/100/100 on
desktop. The form handles every documented Apps Script response correctly and
the design conformance is close to pixel-exact.

Four Major issues to fix before launch, none of which block further work:
modal focus never returns to the opener, `userAgent` never reaches the Sheet,
the FOO-4 security headers silently stop applying on GitHub Pages, and
unverifiable proof claims are still on the page.

> **Update, 2026-10-13 — the CTO has answered all five open questions.** The
> proof claims (FOO-9-04) are **accepted and ship as-is**; everything else
> stands, and FOO-9-05 widens slightly. The Cloudflare question is answered with
> a follow-up test: **GitHub-Pages-only is viable** — the CSP survives being
> moved into a `<meta>` tag (21/21 checks passed), but clickjacking protection
> cannot be. See **"Questions for the CTO — ANSWERED"** and the **follow-up
> test** section at the end, which supersede the severities in the table below.

---

## What was tested

| | |
|---|---|
| Commit | `49012835350ce43b6763c35c771ac770e1d109e3` ("feat(apps-script): port the demo-request API off Cloudflare (FOO-7)") |
| Working tree | **Dirty** — 24 uncommitted paths (the FOO-2/3/7 frontend work, `design/brand/`, `design/system/`). Everything below is the working tree, not the commit alone. |
| Browser | Google Chrome 155.0.8059.40, driven headless by Playwright 1.64.0 |
| Viewports | 1440×900, 1024×800, 390×844, plus 320/360/512/720 for reflow |
| Build A | `npx vite build --base=/foodos.ai/` + `npx vite preview --base=/foodos.ai/` → `http://localhost:4174/foodos.ai/`, `VITE_DEMO_REQUEST_URL` → local mock |
| Build B | same, `VITE_DEMO_REQUEST_URL` unset → `http://localhost:4175/foodos.ai/` |
| Dev | `npx vite` → `http://localhost:5173/` (and `npm run dev`, see FOO-9-07) |
| Design ref | `design/website/v3-bazaar/index.html` + `design/system/tokens.css`, served at `http://localhost:4180/` |
| Form backend | Local mock only — `qa/reports/FOO-9/mock/apps-script-mock.mjs`. **No Google endpoint was contacted.** |

**Tooling installed outside the repo** (in `/tmp/foodos-qa-foo9`, nothing added
to `website/package.json`): `playwright@1.64.0`, `@axe-core/playwright`,
`lighthouse`. Playwright's own Chromium build was missing, so the tests drive
the **Google Chrome already installed on this machine** via `channel: 'chrome'`.
The harness is copied to `qa/reports/FOO-9/harness/` so any run is reproducible.

**Token check:** `website/src/styles/tokens.css` and `design/system/tokens.css`
agree on every value, including the two AA corrections (`--mint #0D8459`,
`--ink-3 #756D62`). No drift.

---

## Findings

| ID | Sev | Area | Summary | Owner |
|---|---|---|---|---|
| FOO-9-01 | **Major** | A11y / modal | Focus never returns to the opener when the demo modal closes | Frontend |
| FOO-9-02 | **Major** | Data | `userAgent` is never sent, so that Sheet column is permanently empty | Frontend |
| FOO-9-03 | **Major** | Security / deploy | `public/_headers` is Cloudflare-only; on GitHub Pages every FOO-4 security header stops applying, and the file is served publicly | DevOps |
| FOO-9-04 | **Major** | Content | Unverifiable proof stats, testimonials and client logos are still on the page | CTO / Designer |
| FOO-9-05 | Minor | Content / UX | Two error messages tell the visitor to "WhatsApp us"; there is no WhatsApp contact anywhere on the site | Frontend |
| FOO-9-06 | Minor | Links | Seven footer links resolve to `#top`; PRIVACY · TERMS · GST is plain text | Frontend / Designer |
| FOO-9-07 | Minor | Build / DX | `npm run dev` still boots `wrangler pages dev` and loads dead Cloudflare vars | DevOps |
| FOO-9-08 | Minor | Deploy risk | No `404.html`; CI builds with the default base `/` and never sets `VITE_DEMO_REQUEST_URL` | DevOps |
| FOO-9-09 | Cosmetic | A11y | axe `region`: the ticker sits outside any landmark (only violation, all viewports) | Frontend |
| FOO-9-10 | Cosmetic | A11y | Logo link's accessible name is "FoodOS.ai FoodOS.ai home" | Frontend |
| FOO-9-11 | Cosmetic | Visual | Hero POS menu tiles clip long dish names (present in the design file too) | Designer |
| FOO-9-12 | Cosmetic | SEO | `robots.txt` / `sitemap.xml` hardcode `https://foodos.ai/` while the site is on the sub-path | DevOps |

---

### FOO-9-01 — Major — Focus never returns to the opener when the modal closes

**Steps.** Tab to any "Book a demo" button → Enter → modal opens → close it.
Tested all four openers (nav, hero, closing CTA, footer "Contact") × three close
routes (Esc, the `×` button, backdrop click) = **12/12 fail**, plus the
success-state "Close" button.

**Expected.** Focus returns to the button that opened the modal (WCAG 2.4.3
Focus Order). The code intends exactly this — `demo-modal.tsx` stores
`openerRef` and calls `opener.focus()`.

**Actual.** Focus lands on `<body>`. A keyboard or screen-reader user who opens
the form from the footer is dumped to the top of the document and has to tab
through the entire page again.

**Root cause** (probed directly, `harness/06-submit-debug.mjs`): `close()` calls
`opener.focus()` while the native `<dialog>` is *still open as modal*, so
everything outside it is inert and the call is a no-op — `document.activeElement`
stays on `.modal__card`. React then unmounts the dialog and focus falls to body.
The focus call has to happen after the dialog is closed/unmounted.

```
opener=nav             focus back on opener: ** FAIL **  (now: BODY)
opener=hero            focus back on opener: ** FAIL **  (now: BODY)
opener=cta             focus back on opener: ** FAIL **  (now: BODY)
opener=footer Contact  focus back on opener: ** FAIL **  (now: BODY)
   ...identical for the × button and backdrop click
```

Note the **mobile nav drawer does this correctly** (Esc returns focus to the
burger) — so the two are inconsistent.

Evidence: `harness/05-focus-return.mjs`, `harness/06-submit-debug.mjs`.

---

### FOO-9-02 — Major — `userAgent` is never sent; the Sheet column stays empty

**Steps.** Submit a valid lead and inspect the body the server actually receives.

**Expected.** `apps-script/README.md` is explicit: *"Apps Script cannot read
request headers, so the browser has to send its own user agent in the payload
for that column to be filled."* `Code.gs` reads `body.userAgent` (line 341) and
writes it to the `userAgent` column (lines 392, 424). `contract.ts` defines it.

**Actual.** `toPayload()` in `DemoForm.tsx` omits it. Verified on the wire:

```json
{ "name": "Asha Menon", "phone": "+919876543210", "restaurantName": "Spice Route",
  "city": "Kochi", "outlets": "2-5", "consent": true,
  "attribution": { "utmSource": "test", "utmMedium": "qa", "utmCampaign": "qa1",
                   "landingPath": "/foodos.ai/?utm_source=test&..." },
  "website": "" }
```

No `userAgent` key. One of the twenty lead columns will be blank on every row,
for good — and nothing fails loudly to say so.

(`turnstileToken` is correctly absent, as Revision 2 requires.)

---

### FOO-9-03 — Major — The FOO-4 security headers do not apply on GitHub Pages

**Steps.** Serve the production build from a plain static host and inspect the
response headers; request `/foodos.ai/_headers`.

**Expected.** The CSP, HSTS, `X-Frame-Options`, `Referrer-Policy` and
`Permissions-Policy` set in `website/public/_headers` protect the live site.

**Actual.** `_headers` is a **Cloudflare Pages / Netlify** convention. GitHub
Pages does not read it. The file is simply copied into `dist/` and served as a
public `200` document at `/foodos.ai/_headers`, and **no security header is
applied at all**:

```
/foodos.ai/_headers -> 200
$ curl -sI http://localhost:4174/foodos.ai/ | grep -iE 'content-security|strict-transport|x-frame|...'
(nothing)
```

Two knock-on effects worth the same ticket:

- CI's **"Check build output"** step *fails the build* if `dist/_headers` is
  missing (`website.yml:116`) — a hard gate pinning a now-dead Cloudflare
  artifact.
- GitHub Pages cannot set response headers at all, so the CSP has to move into a
  `<meta http-equiv="Content-Security-Policy">` or be accepted as lost. That is
  a decision, not a patch — flagged to the CTO below.

---

### FOO-9-04 — Major — Unverifiable claims are on the page

The Proof section ships `1,200+ Outlets live`, `₹480 Cr Billed a year`,
`18 sec Avg. bill time`, `12% Less wastage`, six `LOGO 0n` client placeholders,
and three invented owner testimonials attributed to "Owner name".

They *are* chipped — the section carries a `PLACEHOLDER — PRE-LAUNCH` label and
each stat a small `PH` chip, which is the Designer's stated convention and good
practice. But the numbers are set in 48px type and the chips are 10px; at a
glance the page asserts 1,200 live outlets for a company that has not launched.

Full inventory of what is still marked placeholder (12 chips, 6 logo slots,
3 avatars) is in `screens/1440/proof-placeholders.png`. This is a CTO call on
what goes live, not a code defect — raised here because this is the pre-launch
pass.

---

### FOO-9-05 — Minor — "WhatsApp us" leads nowhere

Two of the six failure messages in `src/lib/api.ts` end with an instruction the
site cannot satisfy:

- `upstream`: *"…please try again, or **WhatsApp us** and we'll take it down manually."*
- `timeout`: *"…if it keeps happening, **WhatsApp us**."*

There is **no WhatsApp link, `tel:`, or `mailto:` anywhere on the page** — I
enumerated every `<a href>` and found zero. The footer's "WhatsApp us" link
points at `#top`. These two messages fire on exactly the paths where the lead
was lost, so it is the one moment the fallback matters.

---

### FOO-9-06 — Minor — Dead footer navigation

Seven footer links resolve to `#top` (jump to the top of the same page):
**About, Careers, Blog, Hardware, Status, WhatsApp us**, and the footer logo.
`PRIVACY · TERMS · GST` is rendered as plain text, not links at all.

This matches the design file exactly, so it is inherited rather than a build
defect — but it ships as navigation that does nothing. `sitemap.xml` already
notes those pages are unsequenced (README open question 12).

---

### FOO-9-07 — Minor — `npm run dev` still runs Cloudflare

`npm run dev` is still `npm run build && wrangler pages dev ./dist`. It **does**
run — it builds, starts workerd on `:8788`, prints `No Functions. Shimming...`
and loads `website/.dev.vars`, surfacing five dead variables (`TURNSTILE_SECRET_KEY`,
`GOOGLE_PRIVATE_KEY`, `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_SHEET_ID`,
`LEAD_SINK`). It also serves from `/`, not the sub-path, so it is the one local
mode that does *not* reflect production.

`website/README.md:25` already flags this for FOO-6, but says the scripts *"no
longer work"* — they do work, which is more confusing than failing would be.

**Not a leak:** `.dev.vars` is correctly gitignored and untracked; only
`.dev.vars.example` is in git. Verified.

---

### FOO-9-08 — Minor — Sub-path and endpoint are not yet wired in CI

Forward-looking, for FOO-6 — the Pages deploy job does not exist yet (the
Cloudflare `deploy` job is `if: false` and documented as superseded), so nothing
is broken *today*:

- `verify` runs bare `npm run build`, i.e. **base `/`**. If FOO-6's deploy job
  does the same, every asset URL will be `/assets/...` and the site at
  `/foodos.ai/` will be a blank page. The sub-path build must pass
  `--base=/foodos.ai/`.
- Neither build step sets `VITE_DEMO_REQUEST_URL`, so a deploy today would ship
  the "not configured" form even after the CTO adds the repo variable.
- `verify` still injects `VITE_TURNSTILE_SITE_KEY` (`website.yml:108`), dead since Revision 2.
- There is **no `404.html`** in `dist/`. GitHub Pages will serve its own generic
  404 for any bad path under `/foodos.ai/`. The site is single-page with hash
  navigation only, so nothing functional breaks — it is a branding gap.

---

### FOO-9-09 / -10 / -11 / -12 — Cosmetic

- **-09** The only axe violation on the whole site, at all three viewports:
  `region` (moderate) — `.ticker__t > span` is outside any landmark. One fix.
- **-10** The logo link's accessible name is `"FoodOS.ai FoodOS.ai home"` — the
  visible wordmark and the `.visually-hidden` span both contribute. Screen
  readers announce the brand twice.
- **-11** Hero POS menu tiles clip long dish names — "Gobi Manchuria)" and
  "Dum Biryani (Mutton)" overflow their borders at 1440 and 1024. **Present
  identically in the design file**, so the build reproduced it faithfully; it is
  a design fix, not a regression. See the hero pair below.
- **-12** `robots.txt` and `sitemap.xml` hardcode `https://foodos.ai/`, which is
  wrong while the site lives at the Pages sub-path. `src/lib/meta.ts` correctly
  rewrites `canonical`/`og:url`/`og:image` at runtime, so only the two static
  files are stale. Harmless pre-launch; correct for the final domain.

---

## Design deviations

Every deviation found is **the build being deliberately ahead of the design
file**. The design reference has not been re-synced since the CTO's FOO-1
changes, so the pairs below differ in the build's favour.

| Viewport | Section | Design file | Build | Pair |
|---|---|---|---|---|
| 390 | Closing CTA | Still has a **"Join the waitlist"** button (`v3-bazaar/index.html:882`) | Demo-only CTA, per FOO-1 | `screens/390/cta-design.png` · `screens/390/cta-build.png` |
| 1440 | Nav | Still has a **"Sign in"** button (`v3-bazaar/index.html:531`) | Removed; `Nav.tsx` documents the CTO's call | `screens/1440/ai-design.png` · `screens/1440/ai-build.png` |
| all | Footer | "Contact" is a link | A `<button>` styled identically, so it can open the modal | `screens/1440/footer-design.png` · `screens/1440/footer-build.png` — pixel-identical |

**The build contains no waitlist, pricing or Sign-in remnants.** I grepped the
shipped bundle: the only "pricing" hit is the AI capability titled *"Menu &
pricing insights"*, which is correct copy, not a pricing page.

**Everything else matches to within 1px.** Section heights, design vs build:

| Section | 1440 | 1024 | 390 |
|---|---|---|---|
| hero | 812 / 812 | 1203 / 1203 | 1891 / 1891 |
| ai | 1021 / 1022 | 1274 / 1274 | 1476 / 1476 |
| features | 1365 / 1364 | 1494 / 1493 | 2551 / 2551 |
| who | 607 / 606 | 757 / 758 | 1055 / 1055 |
| faq | 855 / 854 | 788 / 789 | 803 / 803 |
| cta | 556 / 556 | 528 / 527 | **534 / 608** (waitlist button) |
| footer | 366 / 366 | 557 / 557 | 906 / 906 |

**The demo modal has no design reference.** `design/website/v3-bazaar/index.html`
contains no `<dialog>`, no `<form>` and no `#book-a-demo` — zero matches. The
modal is Frontend's own work, so no side-by-side pair is possible; I assessed it
against the design-system tokens instead, and it uses them correctly.
Screenshots: `screens/{1440,1024,390}/modal.png`, `screens/320/modal.png`.

---

## What passed

**Sub-path production build (the FOO-6 risk).** Every asset — JS, CSS, favicon,
`favicon.ico`, apple-touch-icon, webmanifest — returns 200 under `/foodos.ai/`.
**Zero references outside `/foodos.ai/`.** `meta.ts` correctly rewrites
canonical, `og:url`, `og:image` and `twitter:image` to the serving origin at
runtime. No console errors, no page errors, no failed requests.

**Every CTA.** All four "Book a demo" entry points (nav, hero, closing CTA,
footer "Contact") open the modal. The hero's secondary "See everything it does"
correctly scrolls instead. `#book-a-demo` deep-links open the form on load, the
hash is cleared on close, and it re-opens on a later `hashchange`.

**Every documented Apps Script response** maps correctly (`screens/1440/response-*.png`):

| Mode | Result |
|---|---|
| `{ok:true,id}` | Success state, reference shown, focus moved to the panel |
| `{ok:true}` (no id) | Success state, reference line correctly omitted |
| `validation` + `fields` | Inline errors on phone and city, focus to the first bad field |
| `bot` | Generic "couldn't verify that you're human" — never names the honeypot |
| `rate_limited` | "wait a minute and try again" |
| `upstream` | "your details did not reach us" |
| unrecognised code | Generic fallback |
| HTML sign-in page | Generic fallback, no crash |
| socket hangup | "We couldn't reach the server" |
| 20s response | Timed out at 15s with the timeout message, button re-enabled |

Failure banners carry `role="alert"`; the not-configured banner `role="status"`.
The submit button shows `Sending…`, a spinner and `disabled` for the whole
in-flight window.

**Not-configured state** (`VITE_DEMO_REQUEST_URL` unset): warning banner shown,
submit button disabled, nothing sent. `screens/1440/form-not-configured.png`.

**Form validation.** Empty submit flags all five required fields with no network
call and moves focus to `name`. `aria-invalid` and `aria-describedby` are set and
resolve to the message; every field has an associated `<label>`; errors clear as
you type.

**Phone formats — 18/18 correct.** Accepted and normalised to `+919876543210`:
`9876543210`, `+91 98765 43210`, `09876543210`, `+919876543210`, `91 9876543210`,
`0091 9876543210`, `98765-43210`, `(98765) 43210`, and with surrounding
whitespace. Correctly rejected: Kochi and Mumbai landlines, 9 digits, 11 digits,
leading 5, letters, a letter `O` for zero, a US number, empty.

**Indic scripts and edge content — 15/15 correct.** Malayalam, Tamil, Telugu and
Hindi names/restaurants/cities all submit cleanly and arrive intact; emoji names
accepted; 1-char and whitespace-only names rejected; 80-char accepted; 81-char
and 1200-char message clamped by `maxLength` to 80/1000 rather than erroring;
bad emails and emails with spaces rejected.

**Honeypot.** Off-screen at `x=-9587` (not `display:none`), `tabIndex=-1`,
wrapper `aria-hidden="true"`, `autocomplete="off"`, unreachable by Tab. A filled
`website` field returns `bot` and the visitor sees only the generic message —
**no human-visible field error, and the message never names the field.**

**Double submit.** Three rapid clicks → **exactly 1** POST. Three rapid Enter
presses → **exactly 1** POST.

**Attribution.** Loaded with `?utm_source=test&utm_medium=qa&utm_campaign=qa1`,
navigated through four anchors, then stripped the query string via
`history.replaceState` before submitting. All three UTMs and the original
`landingPath` (query intact) arrived in the payload.

**Accessibility.** Lighthouse accessibility **100** on desktop and mobile. axe
(`wcag2a/2aa/21a/21aa/best-practice`): **1 moderate violation** site-wide
(FOO-9-09); **0 violations in the modal**, empty or with errors showing. One
`<h1>`, correct heading outline with no skipped levels, `lang="en"`, landmarks
`header / nav(Main) / main / footer`. Skip link is the first Tab stop and
genuinely skips the nav. **All 41 interactive elements have a visible focus
indicator.** Focus is correctly trapped in the dialog — 40 forward tabs and 40
Shift-Tabs never reached content behind it.

**Contrast.** 24 text/background pairs computed by hand: **zero failures**,
including the two AA-corrected tokens (`tag--ok` white-on-mint 4.71:1, form hint
`--ink-3` 4.97:1). The one flag my first pass raised — the `PH` chip at 1.00:1 —
was a false positive from my background walker ignoring `background-image`; the
chip is ink on a `#FFE9A8` striped gradient, ~15:1.

**Reduced motion.** `prefers-reduced-motion: reduce` turns the language wheel
into a **static list of all nine languages** (12 rows → 9 visible, the three loop
duplicates hidden), `animation-name: none` on both the wheel and the ticker.
Verified at all three viewports. `screens/{1440,1024,390}/wheel-reduced-motion.png`.

**Language wheel.** Matches the design exactly, and all nine Indic scripts render
correctly with per-row `lang` tags. `screens/1440/wheel-build.png`.

**Reflow / zoom.** No horizontal scrollbar at 320px (WCAG 1.4.10: 1280 @ 400%),
360, 390, 512 (1024 @ 200%) or 720 (1440 @ 200%). The only overflow is at 195px
— 390 zoomed 200%, far below any spec baseline — so 200% zoom passes on both
desktop and mobile.

**Mobile nav drawer @390.** Burger has correct `aria-expanded` / `aria-controls`;
Esc closes it **and returns focus to the burger**; an outside click and a nav
link both close it.

**Network hygiene.** Across a full walk — four anchors, all four AI tabs, all six
FAQ accordions, open and close the modal — **the only host contacted is the page
origin.** No CDN, no font host, no analytics, no Turnstile. Zero failed requests,
zero page errors, zero console errors or warnings. Same on the dev server.

**Anchors.** All 20 `<a href>` targets resolve; no broken anchors. Section
headings land clear of the sticky nav on every jump (heading top ~161px vs nav
bottom 78px).

**Lighthouse** (sub-path production build):

| | Perf | A11y | Best practices | SEO |
|---|---|---|---|---|
| Desktop | **100** | **100** | **100** | **100** |
| Mobile | **99** | **100** | **100** | **100** |

Desktop FCP 0.3s / LCP 0.4s / TBT 0ms / **CLS 0**. Mobile FCP 1.4s / LCP 1.6s /
TBT 0ms / **CLS 0**. The only recurring audit note is ~43 KiB of unused JS
(React in a 263 KB bundle) — not worth acting on at this score. Full reports in
`lighthouse/`.

**Dev server** (`npx vite`, `:5173`) renders identically, no console output, and
correctly shows the not-configured banner with no `.env`.

---

## Placeholder assets seen (not retested per the issue — FOO-5)

Favicon `favicon.svg` / `favicon.ico` / `apple-touch-icon.png`, and
`og-image.png` (1200×630, described in `index.html` as *"a PLACEHOLDER built
from the wordmark"*). The inline `Logo.tsx` SVG — torn-receipt mark plus
"FoodOS.ai" wordmark — renders correctly at all sizes including 16px in the nav.
On-page placeholders: 12 `PH` chips, 6 `LOGO 0n` slots, 3 `PH` avatars, 3 "Owner
name" captions.

---

## Questions for the CTO — ANSWERED 2026-10-13

1. **The security headers (FOO-9-03) need a decision, not just a fix.** GitHub
   Pages cannot set response headers at all. Options: move the CSP into a
   `<meta http-equiv>` (works for CSP, impossible for HSTS and
   `X-Frame-Options`), accept the loss until a real host, or put Cloudflare in
   front of Pages as a proxy. Which?
   → **"There is no cloudflare right? Can we go ahead without cloudflare and
   use only Github pages"** — answered below, with a follow-up test.
2. **The proof numbers (FOO-9-04)** — do `1,200+ outlets`, `₹480 Cr`, the six
   client logos and the three testimonials go live as-is behind their `PH`
   chips, get replaced, or come off the page for launch?
   → **Ship as-is behind the PH chips.** FOO-9-04 is **accepted, not a defect**.
3. **"WhatsApp us" (FOO-9-05)** — is there a real WhatsApp business number to
   link? If not, should that copy change?
   → **"No Whatsapp related stuff. We can remove that."** FOO-9-05 **stands**,
   and widens: remove the WhatsApp wording from both error messages *and* the
   footer link.
4. **The design file is stale** — `v3-bazaar/index.html` still has "Sign in" and
   "Join the waitlist". Should the Designer re-sync it to the FOO-1 decisions so
   it stays usable as a reference, or is `website/` now the source of truth?
   → **Designer re-syncs the design file to the FOO-1 decisions.** The three
   design deviations are therefore **design-file bugs, not build bugs**.
5. **Is the footer's dead navigation (FOO-9-06) acceptable for launch**, or
   should those six links be removed until the pages exist?
   → **Remove the six dead links until the pages exist.** FOO-9-06 **stands.**

### Resulting state of each finding

| ID | Sev | Decision | Owner of the fix |
|---|---|---|---|
| FOO-9-01 | Major | stands | Frontend |
| FOO-9-02 | Major | stands | Frontend |
| FOO-9-03 | Major | stands — GitHub Pages only, no Cloudflare; see the follow-up test below | DevOps |
| FOO-9-04 | Major | **accepted — ships as-is behind the PH chips** | — (closed) |
| FOO-9-05 | Minor | stands, widened to the footer link too | Frontend |
| FOO-9-06 | Minor | stands — remove the six links | Frontend |
| FOO-9-07 … -12 | Minor / Cosmetic | stand as filed | as filed |
| Design deviations | — | design file re-syncs to the build | Designer |

---

## Follow-up test: can we go GitHub-Pages-only, with no Cloudflare? — YES

**Answering the question directly: there is no Cloudflare account, and there
never was one.** That is not my inference — it is already written down in two
places, and nothing in the repo contradicts it:

- `docs/website-architecture.md` Revision 2 (CTO, 2026-10-13): hosting is
  **GitHub Pages**, and line 17 already instructs us to *"delete `wrangler.toml`,
  `functions/`, `_headers` (GitHub Pages ignores it)"*.
- `.github/workflows/website.yml`, above the disabled deploy job: *"There is no
  Cloudflare account and there never was one, so this job can only fail."*

So dropping Cloudflare costs nothing that we currently have. The only real
question is what happens to the FOO-4 security headers — and that part is
testable rather than a matter of opinion, so I tested it instead of guessing.

**Re-tested at commit `25fbf21` ("design(brand): rebuild the brand set…"),
working tree dirty (21 paths).** Note this is a *newer* commit than the main
pass above (`4901283`) — the brand work has since been committed.
Harness: `harness/14-meta-csp.mjs`. **21/21 checks passed.**

### First, measured: GitHub Pages really does send nothing

Live `200` responses from GitHub Pages, both on a `github.io` host and on a
Pages custom domain:

```
$ curl -sI https://octocat.github.io/     -> HTTP/2 200, cache-control: max-age=600
$ curl -sI https://pages.github.com/      -> HTTP/2 200, cache-control: max-age=600
```

That is the complete list. **No HSTS, no `X-Frame-Options`, no `nosniff`, no
CSP, no `Referrer-Policy`, no `Permissions-Policy`** — on a custom domain
either, so this does not improve when `foodos.ai` is attached. (Read-only
`HEAD` requests to public GitHub pages; no test data sent anywhere.)

### Then, tested: the CSP survives being moved into the HTML

The one delivery mechanism Pages leaves us is
`<meta http-equiv="Content-Security-Policy">`. `public/_headers` carries an
explicit warning that this policy has no `'unsafe-inline'` on `script-src` and
that an inline script would therefore kill the page — **that warning had never
been exercised.** If it fired, FOO-6 would ship a blank site.

It does not fire. I rebuilt the sub-path bundle, injected the production policy
as the first child of `<head>` (copy in `/tmp`; `website/` untouched) and served
it from a deliberately header-free static server:

| Check | Result |
|---|---|
| Page renders at 1440 / 1024 / 390 | **pass** — `h1`, 8 sections, 3 demo CTAs, CSS applied |
| CSP violations (`securitypolicyviolation` + console) | **0** at all three viewports |
| Console errors / failed requests | **0 / 0** |
| Demo modal opens and renders | **pass** — 11 fields, 0 violations |
| Form POSTs end to end through the policy | **pass** — 1 payload received, success state renders |

`vite.config.ts` already sets `modulePreload: { polyfill: false }` for exactly
this reason, and the build emits no inline script. The warning in `_headers` was
heeded; this confirms it.

### And the part that genuinely cannot be saved

Two negative controls, so the report states measured behaviour rather than
quoting the spec:

- **`connect-src` IS enforced from a meta tag.** With the production policy (no
  mock origin allowed), the form POST was **blocked** — 0 payloads received,
  violation recorded: `connect-src → http://127.0.0.1:8799/exec`. The visitor
  still sees a proper error, not a silent failure:
  *"Couldn't send — We couldn't reach the server…"*
  (`screens/1440/meta-csp-blocked-submit.png`)
- **`frame-ancestors 'none'` is NOT enforced from a meta tag.** I served the
  site on `127.0.0.1:4190` and framed it from a page on `localhost:4192` — a
  different origin to the browser. **The frame loaded the full site** (`h1` and
  all 8 sections readable from the parent), with no refusal in the console.
  `screens/1440/meta-csp-clickjack.png` shows the site rendering inside the
  attacker page. The site is frameable, and on Pages there is no way to stop it.

**What a Pages-only deploy keeps and loses:**

| Header | On GitHub Pages |
|---|---|
| `Content-Security-Policy` | **Kept** via `<meta http-equiv>` — verified working, minus `frame-ancestors` |
| `Referrer-Policy` | **Kept** via `<meta name="referrer" content="strict-origin-when-cross-origin">` |
| `X-Frame-Options` / `frame-ancestors` | **Lost.** Neither can be delivered from HTML. The site is frameable. |
| `Permissions-Policy` | **Lost.** No meta equivalent. |
| `Cross-Origin-Opener-Policy` / `-Resource-Policy` | **Lost.** No meta equivalent. |
| `X-Content-Type-Options: nosniff` | **Lost.** Not sent by Pages (measured above). |
| `Strict-Transport-Security` | **Not sent by Pages** (measured). On a `github.io` host, HTTPS is instead enforced browser-side because `github.io` is on the HSTS preload list — **I could not verify that from here** (`hstspreload.org` refuses to report on a public suffix), so DevOps should confirm it before relying on it. On `foodos.ai` later, HSTS will need whatever fronts the domain. |
| `/assets/* immutable` caching | **Lost.** Pages serves `max-age=600` for everything (measured), so hashed assets are re-validated every 10 minutes instead of cached for a year. Perf, not security. |

**My read, for the CTO:** going Pages-only is fine for a pre-launch static
marketing site with one form and no login, no session and no user data at rest
in the browser. The meaningful residual risk is clickjacking, and on a page
whose only action is "open a form and ask for a demo" that is low. It becomes
worth revisiting when there is a real login or a dashboard on the same domain.

**What FOO-6 should carry, as a consequence — all verified above:**

1. Add the `<meta http-equiv="Content-Security-Policy">` (policy minus
   `frame-ancestors`) and the `<meta name="referrer">` to `index.html`.
2. **Remove the `test -f dist/_headers` gate in `website.yml:116` in the same
   change that deletes `_headers`** — not after. Revision 2 tells us to delete
   `_headers`, and that gate fails the build the moment anyone does. Deleting
   the file on its own turns a green pipeline red.
3. Delete `wrangler.toml`, the `wrangler` + `@cloudflare/workers-types`
   devDependencies, and the `predev` / `dev` scripts (this also closes
   FOO-9-07).
4. Accept, in writing, the loss of `X-Frame-Options`, `Permissions-Policy`,
   COOP/CORP and `nosniff`, so it is a recorded decision rather than a silent
   regression against FOO-4.

---

## Reproducing

```bash
# 1. mock Apps Script endpoint (never touches Google)
node qa/reports/FOO-9/mock/apps-script-mock.mjs          # :8799
curl "http://127.0.0.1:8799/__mode?set=validation"       # switch response mode

# 2. sub-path production build
cd website
VITE_DEMO_REQUEST_URL="http://127.0.0.1:8799/exec" npx vite build --base=/foodos.ai/
npx vite preview --base=/foodos.ai/                      # :4173/foodos.ai/

# 3. the checks (needs playwright + @axe-core/playwright + lighthouse
#    installed outside the repo; drives the system Google Chrome)
node qa/reports/FOO-9/harness/07-form.mjs

# 4. the GitHub-Pages-only / meta-CSP follow-up. Builds and serves itself —
#    only the mock above needs to be running. Nothing in website/ is modified.
node qa/reports/FOO-9/harness/14-meta-csp.mjs
```

Modes the mock serves: `ok`, `ok-no-id`, `validation`, `bot`, `rate_limited`,
`upstream`, `unknown`, `nonjson`, `slow`, `hangup`. `GET /__received` returns
every payload it has been sent.
