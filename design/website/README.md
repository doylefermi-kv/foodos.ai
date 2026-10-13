# FoodOS.ai marketing website

**Issue:** FOO-1 · **Owner:** Product Designer · **Status:** direction selected, page updated

Three homepage directions were built for comparison. On **13 Oct 2026 the CTO selected
Direction C — “Bazaar”**, and it has since been updated to match the rest of their decisions.
A and B are kept unchanged as a record of the comparison.

Every file is a single self-contained HTML page — no build step, no external fonts, no CDNs.
Open any of them directly in a browser, including offline.

## Files

| Path | What it is |
| --- | --- |
| `design/website/index.html` | **Start here.** Comparison page; C leads, with live previews at 1440 / 1024 / 390 px |
| `design/website/v3-bazaar/index.html` | **← THE SELECTED DESIGN.** Direction C, updated post-decision |
| `design/website/v1-tandoor/index.html` | Direction A — not selected, kept as a record |
| `design/website/v2-slate/index.html` | Direction B — not selected, kept as a record |
| `design/website/README.md` | This file |

Each page carries a thin review banner at the top. That's review chrome, not part of the design —
it comes off before anything ships.

---

## The CTO's decisions, and what I changed

| Decision | What it changed in `v3-bazaar/index.html` |
| --- | --- |
| **Direction C — “Bazaar”** | C is now the working design; A and B are frozen and labelled “not selected”. |
| **AI = smart inventory, menu & pricing insights, WhatsApp ordering, + regional languages** | The AI section went from five proposed capabilities to **four confirmed** ones. Demand forecasting / prep list and “ask your sales” are **gone**. |
| **Regional language support, with a scroll-wheel animation** | New capability 04, “Aapki bhasha mein”, with a **scroll-wheel switcher** cycling nine Indian languages. |
| **Present-tense framing** | All “proposal” chips removed from the AI section. The copy already read present tense. |
| **“Book a demo” as the CTA** | Unchanged — it was already the primary CTA everywhere. |
| **Don't publish the AI data-privacy stance** | That FAQ entry is **removed**, replaced with a language-support question. |
| **No pricing section** | The whole pricing section, its three ₹ tiers, its nav link, its footer link and its CSS are **deleted**. The demo CTA is the only conversion path. |
| **“FoodOS.ai”, real logo approved** | C now has an actual **logo mark**, not just a wordmark, plus a matching favicon. |

### Knock-on edits you might not expect

Cutting demand forecasting meant removing it everywhere it had leaked into the page, not just
from the AI section:

- The **hero subheadline** said “AI that tells you what to prep tomorrow” → now “AI that reorders
  your stock before you run out.”
- The **AI callout on the POS mock** said “Saturday rush expected — +22% covers. Marinate 9 kg
  mutton tonight” → now a stock run-out nudge with a draft vendor order.
- A **testimonial** praised the prep list → now praises the auto-reorder.
- The **ticker** and a **hero tag** said “Hindi & English” → now “9 Indian languages”.

I kept the **“No per-bill cut”** hero tag. It's a commercial-model differentiator against
aggregators and rev-share POS vendors rather than a price, so I read it as outside the “leave out
pricing” instruction — but say the word and it goes.

### The language scroll wheel

Capability 04's demo panel is a vertical scroll wheel: a hard-bordered window, three rows visible,
a marigold selection band on the middle row, and the track stepping one language at a time with a
slight overshoot so it feels like a physical wheel settling.

It covers **Hindi, Tamil, Telugu, Malayalam, Kannada, Marathi, Bengali, Gujarati and English** —
each shown in its own script with the same order-confirmation message translated. The track is 12
rows (9 languages + 3 duplicates) so the loop is seamless: the row under the band at 100% is
identical to the row at 0%, so the restart is invisible.

Pure CSS keyframes, no JS, no webfont — every one of these scripts is covered by the system fonts
already on macOS (Kohinoor / Tamil MN etc.) and Windows (Nirmala UI). Under
`prefers-reduced-motion` the wheel stops animating and renders as a plain static list instead of
freezing on one language.

> ⚠️ **The nine translations are placeholders.** I wrote them, and I can't verify them to the
> standard a public page needs. They're marked with a visible placeholder chip in the panel and
> **must** get native-speaker review before launch. This is the single most important follow-up on
> the page — wrong Tamil on a site aimed at Tamil restaurateurs is worse than English-only.

### The logo

No logo existed, so C's mark was type-only. Now that a real logo is approved, C carries a proper
two-part mark:

- **Icon:** a torn thermal receipt — ink tile, marigold receipt silhouette with a zigzag tear and
  two bill lines. It carries no type, so it survives at favicon size, on a delivery bag, or
  screen-printed on a t-shirt. Drawn as inline SVG; the same art is the page favicon via a data URI.
- **Wordmark:** “FoodOS” in heavy system sans with a boxed marigold “.ai”, keeping C's shop-board
  feel without the icon and the old two-block wordmark fighting each other.

This is **my proposal**, built in SVG/CSS so it's free to iterate. If it's going to a designer or
an agency instead, that needs a brief and a budget — a CTO call, so I haven't started it.

---

## The three directions (for the record)

### Direction C — “Bazaar” — **SELECTED**

**Idea:** be unmistakably for Indian restaurants, but earn it through operational detail rather
than ornament. No truck art, no paisley, no “namaste” copy. Instead: a bill mock drawn as an actual
thermal receipt with GSTIN and HSN on it; a ticker of local proof points; Hinglish in the AI demos
and the FAQ (“Internet band ho gaya toh?”); hard colour blocks borrowed from shop signage and
print rather than from Silicon Valley.

| Role | Hex |
| --- | --- |
| Paper | `#FFFCF5` / `#FFF7E6` |
| Ink | `#16130F` |
| Marigold | `#FFB703` |
| Indigo | `#2B2A7A` |
| Pomegranate | `#E02B3C` |
| Mint | `#0E8F62` |
| Sky | `#BFE3F5` |

**Type:** heavy system sans (800–900) with aggressive negative tracking for display; mono for
receipts, tags and labels. Everything sits on 1.5–2px ink rules with offset hard shadows.

**Known trade-offs, now that we're committed:** it's the loudest of the three, and loud ages
fastest — the bold-border / hard-shadow idiom is currently fashionable and will date. It's also the
hardest to carry into a dense product UI; you cannot put 5px offset shadows on forty buttons on a
billing screen. When the POS design system task comes up, expect to **tone C down substantially**
for the app: keep the palette, the receipt motif and the type weights, drop the hard shadows and
2px borders to 1px with subtler elevation.

### Direction A — “Tandoor” — not selected

Food-led and inviting: cream `#FDF7EF`, editorial serif headlines (Iowan/Palatino/Georgia),
saffron `#E07B16` and chilli `#C5351B`, generous spacing, soft shadows. Sells hospitality rather
than software. Not chosen, but **its warmth is the thing C most lacks** — if C starts feeling
shouty once real photography goes in, A is where to borrow from.

### Direction B — “Slate” — not selected

Dark `#08090B`, product-led, AI structurally central: a copilot drawer in the hero acting on live
state, mint `#3DDC97` for primary actions and violet `#8B7CF6` reserved exclusively for AI.
Not chosen for the marketing site, but **its token system is still the most directly reusable for
the product UI** — dark surfaces, hairlines, mono for data, a dedicated AI colour. Worth revisiting
when the POS design system task starts.

> Note: A and B still show five AI capabilities and a three-tier pricing section. That content
> **predates these decisions** and is deliberately left alone — they're a record of the comparison,
> not live designs. Both carry a “NOT SELECTED” banner saying so.

---

## Still open

1. **The nine language translations need native-speaker review.** Blocking for launch. Marked on
   the page.
2. **The final language list** — I picked nine. Confirm which ones v1 actually ships.
3. **The logo** — mine is a proposal. Decide whether it stands or goes to a designer.
4. **Form handling.** Nothing submits, per the issue. Demo requests need a destination (CRM? sheet?
   email?) before the Frontend Engineer picks this up.
5. **Remaining placeholders**, all still chipped on the page: customer logos, the four stats,
   testimonial quotes and names, hardware list, setup time, legal entity name.
6. **Pages beyond the homepage** — features, about, hardware, help centre. The footer links to them.
   Out of scope for FOO-1; worth sequencing if this becomes a full site rather than a landing page.
7. **Pricing**, whenever it's set. The section was deleted cleanly, so re-adding it later is a
   self-contained change.

---

## Technical notes for the Frontend Engineer

- **Build from `v3-bazaar/index.html`.** All CSS is in one `<style>` block in `<head>`; all JS is a
  ~20-line `<script>` before `</body>`.
- **Design tokens are CSS custom properties** on `:root` (`--ink`, `--marigold`, `--bw`,
  `--shadow`, …). They lift straight into `design/system/` when that task starts.
- **Responsive breakpoints:** 1080px (desktop → tablet), 860px (nav collapses to a burger), 680px
  (mobile; the POS mock stacks vertically, grids go single-column). Verified at 1440, 1024 and 390.
- **Touch targets** are ≥44px throughout: nav links, FAQ summaries, AI capability cards, POS buttons.
- **Type scales with `clamp()`**, so there are no orphaned sizes between breakpoints.
- **Grid tracks all use `minmax(0,1fr)`**, not bare `1fr`. This matters: a bare `1fr` track has
  `min-width:auto` and refuses to shrink below its content, which silently forced horizontal
  overflow on mobile until it was fixed. Keep the pattern.
- **JS is progressive.** With JS off, the FAQ still works (native `<details>`), the first AI pane
  shows, and only the mobile nav toggle and AI tab switching are lost.
- `prefers-reduced-motion` is respected: it stops the ticker, the language wheel (which falls back
  to a static list) and all transitions.
- **The POS mock is pure HTML/CSS** (grid + flexbox), not an image — editable and sharp at any zoom.
- **Zero external requests.** The favicon is an inline SVG data URI.

## How to check it

```
open design/website/index.html
```

Use the Desktop 1440 / Tablet 1024 / Mobile 390 buttons on each preview, then open the full page
and resize. The previews are scaled iframes — click through to the full page to interact with the
AI tabs (the language wheel is capability **04**), the FAQ and the POS mock.
