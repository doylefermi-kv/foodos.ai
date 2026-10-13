# FoodOS.ai marketing site — frontend

React + TypeScript + Vite static build of **Direction C — "Bazaar"**
(`design/website/v3-bazaar/index.html`). Stack decisions and the API contract
live in [`docs/website-architecture.md`](../docs/website-architecture.md).

## Running it

```bash
npm ci

npm run dev         # Vite dev server with HMR on :5173
npm run build       # tsc -b && vite build -> dist/
npm run check:dist  # gate dist/ the way CI does (run it after build)
npm run preview     # serve dist/ — at the real sub-path, like production
npm run typecheck
npm run lint
npm test
```

The site is static — there is no local API to run alongside it. The form posts
straight to the Apps Script web app named by `VITE_DEMO_REQUEST_URL`; with no
`.env` it shows its "not configured yet" state, which is a fine way to work on
everything else.

### The sub-path

Production is a GitHub Pages **project** site, so it is served from
`https://doylefermi-kv.github.io/foodos.ai/`, not from a domain root. Vite's
`base` comes from `BASE_PATH` (default `/foodos.ai/`, see `vite.config.ts`), and
`npm run check:dist` fails the build if any asset URL disagrees with it — the
failure mode otherwise is a silently blank page in production.

`npm run dev` serves from `/` because Vite's dev server does; `npm run preview`
serves the real sub-path. **Preview, not dev, is what production looks like.**

To build as it would be served from a custom domain:

```bash
BASE_PATH=/ SITE_ORIGIN=https://foodos.ai npm run build
```

The deploy pipeline and both of those variables are documented in
[`docs/runbooks/website-setup.md`](../docs/runbooks/website-setup.md).

## Layout

```
src/
  main.tsx              entry; imports the four stylesheets, primes attribution
  App.tsx               section order, wrapped in <DemoModalProvider>
  components/           one component per section of the design, same order
    DemoModal.tsx       native <dialog> + showModal()
    DemoForm.tsx        the whole Book-a-demo form
  lib/
    api.ts              POST to the Apps Script /exec URL; maps its JSON body
    analytics.ts        no-op track(event, props) — the seam for a future tool
    attribution.ts      utm_* / referrer / landingPath, first visit wins
    demo-modal.tsx      open/close context + the #book-a-demo deep link
    meta.ts             canonical/OG URLs made absolute under a sub-path
  styles/
    tokens.css          the design's :root, lifted verbatim (see below)
    base.css            reset, type scale, buttons, .sticker, .ph
    sections.css        every section, plus the responsive block
    form.css            modal + form (not in the design; built from the tokens)
shared/contract.ts      owned by Backend; the form imports its types + validators
public/                 favicons, og-image, robots.txt, sitemap.xml
scripts/check-dist.mjs  the build-output gate CI runs (DevOps)
```

Class names match the design file one-for-one, so `sections.css` can be diffed
against the `<style>` block in `v3-bazaar/index.html` when the design changes.

## Keeping in sync with the design

`src/styles/tokens.css` is a verbatim copy of the design's `:root`, with two
documented exceptions — `--mint` and `--ink-3` are a shade darker because the
original values fail WCAG AA for the text that sits on them. Both are commented
in place. Everything else should be re-synced by diffing, not rewritten.

## Deliberate departures from the design file

Each of these is a correctness or accessibility fix, not a redesign:

- The red `.review-note` review banner is gone (it is review chrome).
- AI capability cards are a proper ARIA tablist: arrow keys, Home/End, roving
  tabindex. The design toggles classes with no keyboard support.
- The mock receipt's KOT / Print / Settle controls render as `<span>`, not
  `<button>` — they do nothing, and focusable no-ops are worse than none.
- Menu item tiles are `<button aria-pressed>` so the selection state the design
  shows is reachable from the keyboard.
- Footer column headings are `<h3>`, not `<h4>`: h2 → h4 breaks the outline.
- Tag/stat/logo strips are lists; the ticker's duplicate copy is `aria-hidden`.
- A skip link, and a visible focus ring (`--focus`), which the design lacks.

Two CTO decisions also depart from the design file, by instruction rather than
as fixes — re-syncing must not bring them back:

- The closing section's **"Join the waitlist"** button is removed. Book a demo
  is the single conversion on the page, and the API contract has no field that
  would tell a waitlist signup apart from a demo request.
- The nav's **"Sign in"** link is removed. It had nowhere to go pre-launch; it
  comes back when there is an app behind it.

## Book a demo

Every "Book a demo" CTA (nav, hero, closing section) and the footer "Contact"
link open one modal. `https://foodos.ai/#book-a-demo` opens it on load, so ads
and WhatsApp messages can deep-link straight to the form.

Validation is `validateDemoRequest` from `shared/contract.ts` — the same rules
the Apps Script runs, so the client and the server cannot drift. The phone is
normalised to `+91XXXXXXXXXX` before it is sent.

Spam handling: the `website` honeypot, positioned off-screen rather than
`display: none`, `aria-hidden` and out of the tab order. Turnstile was dropped
in Revision 2; the rest of the spam handling is server-side, in the Apps Script.

### Talking to the Apps Script endpoint

`lib/api.ts` POSTs to `import.meta.env.VITE_DEMO_REQUEST_URL`. Three rules that
are easy to break and hard to notice:

1. **No custom headers.** Exactly `Content-Type: text/plain;charset=utf-8`, so
   the request stays a CORS *simple request*. Adding any other header makes the
   browser send a preflight, and Apps Script cannot answer `OPTIONS`.
2. **`redirect: 'follow'`** — `/exec` answers with a redirect to
   googleusercontent.com.
3. **Branch on the body, never the status.** Apps Script always returns HTTP
   200. `mapResponseBody` turns the body into what the form renders:

   | Body | What the visitor sees |
   |---|---|
   | `{ ok: true, id }` | success panel with the reference |
   | `{ ok: false, error: "validation", fields }` | inline errors on those fields |
   | `{ ok: false, error: "bot" }` | "couldn't verify you're human" |
   | `{ ok: false, error: "rate_limited" }` | "wait a minute and try again" |
   | `{ ok: false, error: "upstream" }` | "did not reach us", retryable |
   | non-JSON, or an unknown code | generic failure, not retryable |
   | network failure | "couldn't reach the server" |
   | no reply in 15s (`AbortController`) | "that took too long" |

   Errors for fields the form does not render are dropped rather than shown.

States covered: inline field errors with focus moved to the first bad field,
sending (button disabled and guarded by a ref, so repeated clicks send once),
success with the reference id, each failure above, and — when the build has no
endpoint — an inline "Demo booking isn't configured yet" banner with the submit
button disabled, so nobody fills in a form that cannot be sent.

### Analytics

`lib/analytics.ts` exports a no-op `track(event, props)`, called on
`demo_open` and `demo_submit`. Which tool to wire up is an open CTO decision;
until it is made this logs in dev and does nothing in production.

## Attribution

`lib/attribution.ts` captures `utm_source|medium|campaign|term|content`, the
external referrer and the landing path on the first page view of the session
and keeps them in `sessionStorage` under `foodos.attribution.v1`. First visit
wins, so a later share link cannot overwrite how the visitor actually arrived.
Values are capped at 256 chars and every storage call is guarded — private mode
must not break the form.

## Environment variables

| Variable | Default | What it does |
|---|---|---|
| `VITE_DEMO_REQUEST_URL` | empty | The Apps Script web-app `/exec` URL the form POSTs to. Public by design — it ends up in the bundle. |

Unset is a supported state, not a bug: a fresh clone runs with no setup, the
form shows its "not configured yet" banner, and a dev build logs one console
warning. `cp .env.example .env` and paste the `/exec` URL to exercise it.

## Hosting under a sub-path

GitHub Pages serves the site from `/foodos.ai/`, so nothing may hard-code a
leading `/`. Assets, the favicon, the manifest and the canonical/OG URLs are
all written against `%BASE_URL%` in `index.html` (Vite substitutes it at build
time); `site.webmanifest` uses `./`-relative URLs, which resolve against its own
location; `lib/meta.ts` turns the canonical and OG URLs absolute on boot, from
whatever origin actually served the page. Every in-page link is a `#hash`.

Check it after any change to `index.html` or `public/`:

```bash
npx vite build --base=/foodos.ai/ && npx vite preview --base=/foodos.ai/
```

Nothing in the page should request a URL outside `/foodos.ai/`.

## Known placeholders

Everything the company cannot yet stand behind is chipped on the page with the
`<Ph>` component (`.ph`): the logo strip, all four stats, every testimonial,
the entity name, the AI translations, and four FAQ answers. Deleting the `<Ph>`
usages is the whole removal job.

`public/og-image.png` (1200×630), `public/favicon.ico` and
`public/apple-touch-icon.png` are real, correctly-sized files built from the
Bazaar receipt mark so links never preview broken — but they are placeholders.
The CTO has asked for designed replacements; swapping the files is the whole
job, no markup changes (`index.html` already points at all three).
