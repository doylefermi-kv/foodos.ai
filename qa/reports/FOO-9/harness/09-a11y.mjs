import AxeBuilder from '@axe-core/playwright'
import { browser, newPage, BUILD, BUILD_UNSET, VIEWPORTS, settle, shot } from './lib.mjs'

const b = await browser()
const ok = (c) => (c ? 'PASS' : '** FAIL **')

function report(label, results) {
  console.log(`\n--- axe: ${label} ---`)
  console.log(`violations: ${results.violations.length}  passes: ${results.passes.length}  incomplete: ${results.incomplete.length}`)
  for (const v of results.violations) {
    console.log(`\n  [${v.impact}] ${v.id} — ${v.help}`)
    console.log(`    ${v.helpUrl}`)
    for (const n of v.nodes.slice(0, 4)) {
      console.log(`    target: ${JSON.stringify(n.target)}`)
      console.log(`    ${n.failureSummary?.replace(/\n/g, '\n      ')}`)
    }
    if (v.nodes.length > 4) console.log(`    ...and ${v.nodes.length - 4} more nodes`)
  }
  for (const v of results.incomplete) {
    console.log(`  (incomplete) ${v.id}: ${v.nodes.length} node(s) — ${v.help}`)
  }
}

/* ---- page, all three viewports ---- */
for (const [vp, viewport] of Object.entries(VIEWPORTS)) {
  const page = await newPage(b, { viewport })
  await page.goto(BUILD)
  await settle(page)
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'])
    .analyze()
  report(`page @${vp}`, results)
  await page.ctx.close()
}

/* ---- modal ---- */
{
  const page = await newPage(b, { viewport: VIEWPORTS[1440] })
  await page.goto(BUILD + '#book-a-demo')
  await settle(page)
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'])
    .analyze()
  report('demo modal (empty)', results)

  // and with errors showing
  await page.click('button[type=submit]')
  await page.waitForTimeout(400)
  const r2 = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze()
  report('demo modal (validation errors shown)', r2)
  await page.ctx.close()
}

/* ---- landmarks, headings, labels ---- */
{
  console.log('\n--- landmarks & document structure ---')
  const page = await newPage(b, { viewport: VIEWPORTS[1440] })
  await page.goto(BUILD)
  await settle(page)
  const struct = await page.evaluate(() => ({
    lang: document.documentElement.lang,
    title: document.title,
    landmarks: [...document.querySelectorAll('header,nav,main,footer,aside,[role]')]
      .filter((e) => ['HEADER', 'NAV', 'MAIN', 'FOOTER', 'ASIDE'].includes(e.tagName) || ['banner','navigation','main','contentinfo','complementary','region'].includes(e.getAttribute('role')))
      .map((e) => `${e.tagName.toLowerCase()}${e.getAttribute('role') ? `[role=${e.getAttribute('role')}]` : ''}${e.getAttribute('aria-label') ? `(${e.getAttribute('aria-label')})` : ''}`),
    h1Count: document.querySelectorAll('h1').length,
    headingOutline: [...document.querySelectorAll('h1,h2,h3')].map((h) => `${h.tagName} ${h.textContent.trim().replace(/\s+/g,' ').slice(0, 44)}`),
    skipLink: document.querySelector('.skip-link')?.getAttribute('href'),
    skipTargetExists: Boolean(document.querySelector(document.querySelector('.skip-link')?.getAttribute('href') || '#nope')),
    skipTargetFocusable: document.querySelector('#top')?.tabIndex,
  }))
  console.log('lang:', struct.lang, ok(Boolean(struct.lang)))
  console.log('h1 count:', struct.h1Count, ok(struct.h1Count === 1))
  console.log('landmarks:', struct.landmarks.join(' | '))
  console.log('skip link ->', struct.skipLink, 'target exists:', ok(struct.skipTargetExists), 'target tabIndex:', struct.skipTargetFocusable)
  console.log('heading outline:')
  for (const h of struct.headingOutline) console.log('   ', h)
  await page.ctx.close()
}

/* ---- visible focus on every interactive element ---- */
{
  console.log('\n--- visible focus indicator ---')
  const page = await newPage(b, { viewport: VIEWPORTS[1440] })
  await page.goto(BUILD)
  await settle(page)
  const bad = []
  const n = await page.evaluate(() => document.querySelectorAll('a[href], button, input, select, textarea, details summary').length)
  for (let i = 0; i < Math.min(n, 60); i++) {
    const r = await page.evaluate((idx) => {
      const els = [...document.querySelectorAll('a[href], button, input, select, textarea, details summary')]
      const el = els[idx]
      if (!el || el.tabIndex < 0) return null
      el.focus()
      const cs = getComputedStyle(el)
      const outline = cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0
      const ring = cs.boxShadow !== 'none'
      const label = (el.getAttribute('aria-label') || el.textContent || el.name || el.tagName).trim().replace(/\s+/g, ' ').slice(0, 30)
      return { label, tag: el.tagName, outline, ring, outlineColor: cs.outlineColor, outlineWidth: cs.outlineWidth, visible: outline || ring }
    }, i)
    if (r && !r.visible) bad.push(`${r.tag}:${r.label}`)
  }
  console.log('interactive elements checked:', Math.min(n, 60))
  console.log('without a visible focus indicator:', bad.length ? bad : 'none', ok(bad.length === 0))
  await page.ctx.close()
}

/* ---- skip link actually works ---- */
{
  console.log('\n--- skip link behaviour ---')
  const page = await newPage(b, { viewport: VIEWPORTS[1440] })
  await page.goto(BUILD)
  await settle(page)
  await page.keyboard.press('Tab')
  const first = await page.evaluate(() => ({
    cls: document.activeElement?.className,
    text: document.activeElement?.textContent?.trim(),
    visible: document.activeElement?.getBoundingClientRect().top,
  }))
  console.log('first Tab lands on:', JSON.stringify(first))
  await page.keyboard.press('Enter')
  await page.waitForTimeout(500)
  const after = await page.evaluate(() => ({
    active: document.activeElement?.tagName + '.' + (document.activeElement?.className || ''),
    scrollY: Math.round(window.scrollY),
  }))
  console.log('after activating skip link:', JSON.stringify(after))
  await page.keyboard.press('Tab')
  const next = await page.evaluate(() => {
    const a = document.activeElement
    return { tag: a?.tagName, text: a?.textContent?.trim().slice(0, 30), inMain: Boolean(a?.closest('main')), inNav: Boolean(a?.closest('.nav')) }
  })
  console.log('next Tab after skip:', JSON.stringify(next))
  console.log('skip link actually skips the nav:', ok(next.inMain === true))
  await page.ctx.close()
}

await b.close()
