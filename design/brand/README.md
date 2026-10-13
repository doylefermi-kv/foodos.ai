# FoodOS.ai — brand

The real logo, icon and social card set for FoodOS.ai, replacing the placeholders the
Frontend Engineer generated in `website/public/`. Issue **FOO-5**.

Everything here is hand-authored SVG and HTML. No external fonts, no CDNs, no raster
sources, no online converters — the PNG/ICO files are rendered locally from these sources
by `export.mjs`.

**Open these first**

| Page | What it is |
| --- | --- |
| [`logo-explorations.html`](logo-explorations.html) | The three concepts, on light and dark, at 16–128px, in all three lockups, with the scoring and the decision note |
| [`icons-check.html`](icons-check.html) | The exported PNG/ICO files at 1:1 and magnified, plus the Android safe-zone check |
| [`og-preview-check.html`](og-preview-check.html) | The social card put through the WhatsApp / LinkedIn / X / Slack / iMessage crops |

---

## 1. The mark — "Chit"

The torn KOT ticket, sharpened: four big teeth instead of a fine perforation, two bill lines
instead of three. **This is the paper that currently runs every restaurant in the country —
FoodOS is what replaces it.**

Three concepts were drawn ([`logo-explorations.html`](logo-explorations.html)):

| | Concept | Verdict |
| --- | --- | --- |
| 01 | **Chit** — torn KOT ticket | **Chosen by the CTO, 13 Oct 2026.** |
| 02 | **Thali** — plate / power | What I recommended. The plate/power double read is sharper and it earns the *OS* in the name, but it needs a second drawing to survive 16px. |
| 03 | **Dabba** — tiffin stack | The most specifically Indian, but four elements inside 16 pixels collapse into a hamburger menu icon, and it reads delivery rather than restaurant. |

**On the decision.** The CTO picked 01 over my recommendation. Two parts of the case I made
against it did not survive drawing the final set, and both are worth recording:

- I scored Chit "partly legible at 16px — bill lines merge". That was true of *my exploration
  drawing*, not of the concept. Widening the body from 56 to 64 units and taking the bars from
  11 to 13 deep holds both bars open at 16px with the torn edge still breaking the silhouette.
- The two-source-files problem I raised was a property of Thali, whose spoon bowl genuinely
  fails small. Chit needs no simplified cut, so it ships as one drawing everywhere.

**What stands.** A receipt is the default mark for POS and billing products, and drawing it
better does not make it more distinctive. What offsets it here: the teeth are coarse and
irregular where the category draws fine perforations, and the mark is a filled ink tile rather
than an outline floating on white — at 16px the tile is doing most of the work of being
recognisable.

### Construction

Everything is drawn on a **100 × 100 grid**, and the tile is full-bleed — the artwork *is* the
app icon, with no separate padding step.

```
body     x 18..82, y 14..74          64 units wide, centred
teeth    4, pitch 16, depth 12       torn edge runs y 74..86
lines    13 deep, 10 apart
           long  x 28..72            the order
           short x 28..58            the total
```

The glyph is one path with `fill-rule="evenodd"`, so the two bill lines are knocked out of the
chit rather than drawn over it. That is what lets the mono version work: the lines show
whatever is behind the mark instead of needing a second colour.

Vertical and horizontal centres both land on 50, counting the teeth as part of the silhouette —
so the mark optically centres in a square without a nudge.

### One drawing at every size

There is no simplified small cut. `logo-mark.svg`, `favicon.svg` and `icon-maskable.svg` all
carry the identical chit path; the other two exist only to add behaviour, not to redraw:

| File | What it adds |
| --- | --- |
| `logo-mark.svg` | the drawing itself — the reference copy |
| `favicon.svg` | a `prefers-color-scheme: dark` marigold keyline |
| `icon-maskable.svg` | the inset and scale for Android's safe circle |

The geometry was tuned against the **16px floor** rather than drawn large and hoped for: bars
13 units deep land as just over 2px, and the body is wide enough that the torn edge still
registers. [`icons-check.html`](icons-check.html) shows the true 16px raster, not a downscale
of the 32.

`export.mjs` compares the path data in all three files and **aborts the export if they have
drifted apart**, so "one drawing" is enforced rather than merely intended. If you redraw the
symbol, change all three and let the check confirm it.

### The wordmark

Drawn as outlines — every glyph is a path, so there is no font dependency and nothing to
license. A black-weight grotesque on a **100-unit cap height with a 24-unit stem**, x-height
74. The round letters are flat-sided squircles rather than true circles, which is how
hand-painted shop boards resolve a curve.

`.ai` keeps the marigold sticker treatment from the approved site header. It is the one piece
of the identity that states what the product is, so it gets a box around it.

---

## 2. Clear space and minimum sizes

**Clear space** on all four sides is **one quarter of the symbol tile's height** — 54 units at
the lockup's native 216px tile. Nothing sets inside it: no type, no rules, no photo edge, no
other logo. For the wordmark used on its own, clear space is half the cap height.

**Minimum sizes**

| | Minimum | At that size |
| --- | --- | --- |
| Horizontal lockup | **140px wide** | cap height 16px, `.ai` glyphs ~10px |
| Stacked lockup | **100px wide** | cap height 17px |
| Symbol alone | **16px** | the same drawing as every other size |

Below 140px wide, drop the wordmark and use the symbol alone rather than shrinking the
lockup further.

---

## 3. Colour

The logo is **ink + marigold only**. Indigo, pomegranate, mint and sky are UI colours; they
never appear in the mark.

| Token | Hex | Role in the mark |
| --- | --- | --- |
| `--ink` | `#16130F` | tile, the knocked-out bill lines, wordmark, `.ai` type |
| `--marigold` | `#FFB703` | the chit, `.ai` chip, the keyline on dark |
| `--paper` | `#FFFCF5` | wordmark on ink; `.ai` chip on marigold |

| Background | Use | What changes |
| --- | --- | --- |
| Paper `#FFFCF5` / `#FFF7E6` | `logo.svg` | — |
| Ink `#16130F` | `logo-inverse.svg` | tile takes a marigold keyline, wordmark goes paper |
| Marigold `#FFB703` | `logo.svg` + paper `.ai` chip | the chip flips to paper so it does not vanish |
| Photography, one-colour print | `logo-mono.svg` | tile becomes a keyline; set `color` to recolour |

The mono files inherit `currentColor` throughout, so `color: #FFFCF5` on the parent gives the
white-out version — there is no separate mono-inverse file to keep in sync.

[`design/system/tokens.css`](../system/tokens.css) is the source of truth for the palette and
carries the accessibility corrections the Frontend Engineer made (`--mint` `#0E8F62` →
`#0D8459`, `--ink-3` `#7D756A` → `#756D62`). Neither colour is used in the logo. The `:root`
block in `design/website/v3-bazaar/index.html` has been re-synced to match, on the CTO's call —
it is a copy, and the header comment there now says so.

---

## 4. Do / don't

**Do**

- Use the horizontal lockup by default; the stacked lockup for square and near-square slots.
- Keep the tile square and full-bleed. It is a tile, not a glyph floating on a background.
- Give it the marigold keyline on any ink field, including the site footer.
- Use the symbol alone below 140px.
- Keep the torn edge intact — it is the bottom 12 units of the glyph and the first thing a
  careless crop eats.

**Don't**

- Don't recolour the glyph into indigo, pomegranate or mint.
- Don't round the tile's corners. iOS and Android apply their own masks; everywhere else the
  hard 90° corner is the point.
- Don't add a drop shadow, gradient, bevel or outline-stroke to the glyph.
- Don't redraw the chit with a fine perforation. The coarse teeth are what separate it from
  every other receipt mark in the category, and they are what survives 16px.
- Don't add a third bill line to the mark. Three lines is the *illustration* motif on the
  social card; two is the logo, and the difference is deliberate.
- Don't rebuild the wordmark in a live font. It is outlines because the system stack renders
  differently on every machine.
- Don't stretch, skew or rotate the lockup, or re-space the symbol and wordmark.
- Don't place the lockup on marigold without flipping the `.ai` chip to paper.

---

## 5. Files

### Vector

| File | Use |
| --- | --- |
| `logo.svg` | Horizontal lockup, positive — **primary** |
| `logo-inverse.svg` | Horizontal lockup on ink / dark |
| `logo-mono.svg` | Horizontal lockup, one colour (`currentColor`) |
| `logo-stacked.svg` | Stacked lockup, positive |
| `logo-stacked-inverse.svg` | Stacked lockup on ink / dark |
| `logo-stacked-mono.svg` | Stacked lockup, one colour |
| `logo-mark.svg` | Symbol only — the reference copy of the drawing |
| `logo-mark-inverse.svg` | Symbol only, on ink / dark |
| `logo-mark-mono.svg` | Symbol only, one colour |
| `favicon.svg` | Same drawing, plus a `prefers-color-scheme: dark` keyline |
| `icon-maskable.svg` | Same drawing, inset to Android's 80% safe circle |

### Raster — generated, do not hand-edit

| File | Size | Rendered from |
| --- | --- | --- |
| `favicon.ico` | 16 / 32 / 48 | `favicon.svg` |
| `favicon-32.png` | 32 | `favicon.svg` |
| `apple-touch-icon.png` | 180 | `logo-mark.svg` |
| `icon-192.png` | 192 | `logo-mark.svg` |
| `icon-512.png` | 512 | `logo-mark.svg` |
| `icon-maskable-512.png` | 512 | `icon-maskable.svg` |
| `og-image.png` | 1200 × 630 | `og-image.html` |
| `favicon-16.png` | 16 | `favicon.svg` — **check page only, not shipped** |
| `favicon-48.png` | 48 | `favicon.svg` — **check page only, not shipped** |

These two are the other entries inside `favicon.ico`, written out so `icons-check.html` can
show each size at its true pixel size. Displaying `favicon-32.png` at 16 CSS px shows the
browser's smooth downscale, which is kinder than what actually lands in the tab.

### Sources and checks

| File | |
| --- | --- |
| `export.mjs` | Regenerates every raster. `node design/brand/export.mjs` |
| `og-image.html` | The social card source |
| `logo-explorations.html` | The three concepts, the scoring, and the decision note |
| `icons-check.html` | Exported icons at 1:1 and magnified |
| `og-preview-check.html` | Social card under the real link-preview crops |

---

## 6. How the rasters are made

```
node design/brand/export.mjs            # needs Google Chrome; CHROME=... to override
```

Headless Chrome rasterises; the ICO container is assembled byte-by-byte in the script
(PNG-compressed entries, read by every browser we support and by Windows Vista onward).
No network, no npm dependencies, no online tools. The run starts with the one-drawing check
described in §1 and stops there if it fails.

One trap worth knowing about: **headless Chrome reports `prefers-color-scheme: dark` by
default**, which silently baked `favicon.svg`'s dark-mode keyline into the first run of every
raster. `export.mjs` pins `--blink-settings=preferredColorScheme=1` so the exports are the
light version. If you add a media query to any source here, re-check the output.

---

## 7. The social card

`og-image.png`, 1200 × 630, rendered from `og-image.html`.

Link previews do not all show 1.91:1, so the card is built around the crops rather than the
canvas:

| Crop | Clients | Result |
| --- | --- | --- |
| 1200 × 630 | WhatsApp large, LinkedIn, Slack, Facebook, iMessage | Full card |
| 2 : 1 centre | X / `summary_large_image` | Loses 15px top and bottom |
| 1 : 1 centre | WhatsApp and iMessage thumbnails | Loses 285px each side |

So **every piece of content — logo, headline, sub, chips — sits inside the centred 630-wide
column** (x 285..915). The outer columns carry only the torn-chit motif, which is the one
thing that can be cropped away without losing the message. The two ink bands are 52px and
50px rather than 46px and 44px, so their type clears X's 2:1 cut.

**The motif, now that the chit is the logo.** The margin chits are drawn as tinted outlines —
no solid ink field, no marigold fill, and three bill lines against the mark's two. The logo
tile is the only filled chit on the card, so the motif reads as background texture rather than
as four rivals to the mark.

`og-image.html` has a `.guides` rule — flip it to `display: block` to draw the safe column
and check nothing has strayed outside it.

---

## 8. Handoff — what goes into `website/public/`

**I have not edited `website/`.** These are the files to copy and the `<head>` / manifest
changes that go with them; see the issue comment for the full list.

| Copy from `design/brand/` | To | Replaces |
| --- | --- | --- |
| `favicon.svg` | `website/public/favicon.svg` | placeholder |
| `favicon.ico` | `website/public/favicon.ico` | placeholder |
| `apple-touch-icon.png` | `website/public/apple-touch-icon.png` | placeholder |
| `og-image.png` | `website/public/og-image.png` | placeholder |
| `favicon-32.png` | `website/public/favicon-32.png` | new |
| `icon-192.png` | `website/public/icon-192.png` | new |
| `icon-512.png` | `website/public/icon-512.png` | new |
| `icon-maskable-512.png` | `website/public/icon-maskable-512.png` | new |

Don't copy `favicon-16.png` or `favicon-48.png` — both are for the check page only; those
sizes already live inside `favicon.ico`.

`website/public/og-image.svg` can be deleted — it was the placeholder's source, and
`og-image.html` here replaces it.

### `website/index.html`

Asset URLs there are written against `%BASE_URL%` for the GitHub Pages sub-path, so the new
links follow the same form. One existing line changes and one is added:

```html
<!-- the .ico now carries three sizes, not one -->
<link rel="alternate icon" href="%BASE_URL%favicon.ico" sizes="16x16 32x32 48x48" />

<!-- new -->
<link rel="icon" type="image/png" sizes="32x32" href="%BASE_URL%favicon-32.png" />
```

The `og:image` / `twitter:image` tags already point at `%BASE_URL%og-image.png` and need no
change — but the comment above them still says the card is a placeholder, and that line should
go.

### `website/public/site.webmanifest`

Add the PWA icons alongside what is already there, keeping the relative `./` form:

```json
"icons": [
  { "src": "./favicon.svg",           "sizes": "any",     "type": "image/svg+xml" },
  { "src": "./apple-touch-icon.png",  "sizes": "180x180", "type": "image/png" },
  { "src": "./icon-192.png",          "sizes": "192x192", "type": "image/png" },
  { "src": "./icon-512.png",          "sizes": "512x512", "type": "image/png" },
  { "src": "./icon-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
]
```

`theme_color` stays `#FFB703` and `background_color` stays `#FFFCF5` — both are correct for
this mark.

### Not in scope here

The site draws its mark inline in **`website/src/components/Logo.tsx`** — one component, used
by both the header and the footer, so it is a single edit rather than two. Swapping it is a
separate change from the `public/` file copy above.

The placeholder there is *also* a torn receipt with two bill lines, which makes this easy to
get wrong in both directions: it looks close enough to assume the site is already updated, and
close enough that a half-done swap is invisible in review. The differences that matter:

| | Placeholder (`Logo.tsx`) | Real mark |
| --- | --- | --- |
| Teeth | 5, shallow | 4, coarse, 12 units deep |
| Body | runs to the tile edge | inset, 64 of 100 units |
| Grid | `viewBox="0 0 32 32"` | `viewBox="0 0 100 100"` |
| Tile | drawn by CSS | part of the artwork |

To swap, replace the `<svg>` body in `Logo.tsx` with the path from `logo-mark.svg`, changing
the `viewBox` to `0 0 100 100`. The path is written for a 100-unit grid and should not be
rescaled by hand — that is how the bars drift off the pixel grid at 16px. `.mark__ico` and
`.mark__wd` can stay as they are, since the tile is still a 1:1 ink square.

Two things to carry across while you are in there:

- The doc comment at the top of `Logo.tsx` claims the icon "is the same path as the favicon in
  `public/favicon.svg`". Keep that true after the swap, or drop the sentence.
- The wordmark in `Logo.tsx` is live text (`FoodOS<i>.ai</i>`), not the outlined wordmark from
  `logo.svg`. That is a reasonable choice for an HTML header and I am not asking anyone to
  change it — but it means the site's wordmark renders in whatever the system stack resolves
  to, and will not match the lockup SVGs exactly. Worth a look side by side before deciding.
