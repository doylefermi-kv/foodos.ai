# FoodOS.ai marketing site — frontend

React + TypeScript + Vite static build of **Direction C — "Bazaar"**
(`design/website/v3-bazaar/index.html`). Stack decisions and the API contract
live in [`docs/website-architecture.md`](../docs/website-architecture.md).

## Running it

```bash
npm install

npm run dev       # build + `wrangler pages dev ./dist` — site AND /api together
npm run dev:ui    # Vite dev server with HMR on :5173, /api proxied to :8788
npm run build     # tsc -b && vite build -> dist/
npm run preview   # serve dist/ with Vite (no Functions)
npm run typecheck
npm run lint
npm test
```

`npm run dev:ui` only reaches the demo endpoint if a `wrangler pages dev` is
already running on 8788 — the Vite proxy forwards `/api` there. Use plain
`npm run dev` if you want one command.

First run needs `cp .dev.vars.example .dev.vars` (safe defaults: ConsoleSink,
Turnstile test keys, no Google credentials).

## Layout

```
src/
  main.tsx              entry; imports the four stylesheets, primes attribution
  App.tsx               section order, wrapped in <DemoModalProvider>
  components/           one component per section of the design, same order
    DemoModal.tsx       native <dialog> + showModal()
    DemoForm.tsx        the whole Book-a-demo form
    Turnstile.tsx       explicit-render wrapper around the CF widget
  lib/
    api.ts              POST /api/demo-requests, maps 400/403/429/502 to copy
    attribution.ts      utm_* / referrer / landingPath, first visit wins
    demo-modal.tsx      open/close context + the #book-a-demo deep link
    turnstile.ts        lazy script loader
  styles/
    tokens.css          the design's :root, lifted verbatim (see below)
    base.css            reset, type scale, buttons, .sticker, .ph
    sections.css        every section, plus the responsive block
    form.css            modal + form (not in the design; built from the tokens)
shared/contract.ts      owned by Backend; the form imports its types + validators
public/                 favicons, og-image, robots.txt, sitemap.xml, _headers
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

Validation is `validateDemoRequest` from `shared/contract.ts` — the same
function the Pages Function runs, so the client and the server cannot drift.
The phone is normalised to `+91XXXXXXXXXX` before it is sent.

Spam handling: Turnstile (lazily loaded when the modal first opens, so it never
touches the landing page's critical path) plus a `website` honeypot that is
positioned off-screen rather than `display: none`, and is `aria-hidden` and out
of the tab order.

States covered: inline field errors with focus moved to the first bad field,
sending (button disabled and guarded by a ref, so repeated clicks send once),
success with the reference id, and distinct copy for 400 / 403 / 429 / 502 and
for a dead network.

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
| `VITE_TURNSTILE_SITE_KEY` | Cloudflare's test key `1x00000000000000000000AA` | Turnstile site key (public; the secret lives in the Function) |

In a **dev** build only, if the Turnstile script cannot load at all the widget
falls back to a visibly fake token so the rest of the flow stays testable. The
Function rejects it with 403, which is correct. Production never does this — it
shows an error instead.

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
