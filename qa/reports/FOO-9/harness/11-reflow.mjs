import { browser, newPage, BUILD, settle, shot } from './lib.mjs'

const b = await browser()
const ok = (c) => (c ? 'PASS' : '** FAIL **')

/**
 * Browser zoom reflows by shrinking the layout viewport, so N% zoom at width W
 * lays out like a viewport of W/N. WCAG 1.4.10 Reflow is 1280px @ 400% = 320px.
 */
const CASES = [
  ['320px (WCAG 1.4.10 reflow: 1280 @ 400%)', 320],
  ['360px (small Android)', 360],
  ['390px', 390],
  ['720px (1440 @ 200%)', 720],
  ['512px (1024 @ 200%)', 512],
  ['195px (390 @ 200%, below any spec baseline)', 195],
]

for (const [label, width] of CASES) {
  const page = await newPage(b, { viewport: { width, height: 800 } })
  await page.goto(BUILD)
  await settle(page)
  const r = await page.evaluate(() => {
    const vw = document.documentElement.clientWidth
    const scrollW = document.documentElement.scrollWidth
    // Only elements that can actually push the document wide: an ancestor
    // chain with no overflow clipping.
    const culprits = []
    for (const el of document.querySelectorAll('body *')) {
      const rect = el.getBoundingClientRect()
      if (rect.width === 0 || rect.right <= vw + 1) continue
      let clipped = false
      for (let p = el.parentElement; p; p = p.parentElement) {
        const o = getComputedStyle(p).overflowX
        if (o === 'hidden' || o === 'clip' || o === 'auto' || o === 'scroll') { clipped = true; break }
      }
      if (clipped) continue
      culprits.push({
        sel: el.tagName.toLowerCase() + (typeof el.className === 'string' && el.className ? '.' + el.className.split(/\s+/).filter(Boolean).join('.') : ''),
        right: Math.round(rect.right),
        width: Math.round(rect.width),
        text: (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 36),
      })
    }
    return { vw, scrollW, overflows: scrollW > vw + 1, culprits: culprits.slice(0, 6) }
  })
  console.log(`\n${label}`)
  console.log(`  clientW=${r.vw} scrollW=${r.scrollW}  horizontal scroll: ${r.overflows ? '** YES **' : 'no'} ${ok(!r.overflows)}`)
  if (r.culprits.length) console.log('  unclipped overflow:', JSON.stringify(r.culprits, null, 1))
  await page.screenshot({ path: shot(`reflow/${width}.png`), fullPage: false })
  await page.ctx.close()
}

await b.close()
