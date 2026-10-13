import { browser, newPage, BUILD, DEV, VIEWPORTS, settle, shot, noise, hostsOf } from './lib.mjs'

const b = await browser()
const ok = (c) => (c ? 'PASS' : '** FAIL **')

/** Anything wider than the viewport = a horizontal scrollbar on a phone. */
async function overflow(page) {
  return page.evaluate(() => {
    const vw = document.documentElement.clientWidth
    const offenders = []
    for (const el of document.querySelectorAll('body *')) {
      const r = el.getBoundingClientRect()
      if (r.width === 0) continue
      if (r.right > vw + 1 || r.left < -1) {
        offenders.push({
          sel: el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.split(' ').filter(Boolean).slice(0, 2).join('.') : ''),
          left: Math.round(r.left), right: Math.round(r.right), w: Math.round(r.width),
          text: (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 30),
        })
      }
    }
    // Only report the outermost offenders, not every descendant.
    return {
      docScrollW: document.documentElement.scrollWidth,
      clientW: vw,
      hasHScroll: document.documentElement.scrollWidth > vw + 1,
      offenders: offenders.slice(0, 8),
    }
  })
}

/* ---- 1. 320px narrow ---- */
console.log('================ 320px NARROW ================')
{
  const page = await newPage(b, { viewport: { width: 320, height: 780 } })
  await page.goto(BUILD)
  await settle(page)
  const o = await overflow(page)
  console.log('scrollWidth', o.docScrollW, 'clientWidth', o.clientW)
  console.log('horizontal scrollbar:', o.hasHScroll ? '** YES **' : 'no', ok(!o.hasHScroll))
  if (o.offenders.length) console.log('overflowing elements:', JSON.stringify(o.offenders, null, 1))
  await page.screenshot({ path: shot('320/full-build.png'), fullPage: true })

  // and the modal at 320
  await page.locator('.nav__burger').click()
  await page.waitForTimeout(300)
  await page.locator('.nav__cta button').click()
  await page.waitForSelector('dialog.modal input[name=name]')
  await page.waitForTimeout(300)
  const om = await overflow(page)
  console.log('modal @320 horizontal scrollbar:', om.hasHScroll ? '** YES **' : 'no', ok(!om.hasHScroll))
  await page.screenshot({ path: shot('320/modal.png') })
  await page.ctx.close()
}

/* ---- 2. 200% zoom (1440 logical -> 720 CSS px of content) ---- */
console.log('\n================ 200% ZOOM ================')
for (const base of [1440, 390]) {
  const page = await newPage(b, {
    viewport: { width: base, height: 900 },
    deviceScaleFactor: 1,
  })
  await page.goto(BUILD)
  await settle(page)
  await page.evaluate(() => { document.body.style.zoom = '2' })
  await page.waitForTimeout(600)
  const o = await overflow(page)
  console.log(`@${base} zoom 200%: hScroll=${o.hasHScroll ? '** YES **' : 'no'} scrollW=${o.docScrollW} clientW=${o.clientW}`)
  if (o.offenders.length) console.log('  offenders:', JSON.stringify(o.offenders.slice(0, 4)))
  await page.screenshot({ path: shot(`${base}/zoom-200.png`), fullPage: false })
  await page.ctx.close()
}

/* ---- 3. Mobile nav drawer ---- */
console.log('\n================ MOBILE NAV DRAWER @390 ================')
{
  const page = await newPage(b, { viewport: VIEWPORTS[390] })
  await page.goto(BUILD)
  await settle(page)
  const burger = page.locator('.nav__burger')
  console.log('burger visible:', ok(await burger.isVisible()))
  console.log('aria-expanded before:', await burger.getAttribute('aria-expanded'))
  console.log('aria-controls:', await burger.getAttribute('aria-controls'), 'target exists:', ok(await page.locator('#nav-menu').count() > 0))
  await burger.click()
  await page.waitForTimeout(400)
  console.log('aria-expanded after:', await burger.getAttribute('aria-expanded'))
  console.log('menu visible:', ok(await page.locator('.nav__menu').isVisible()))
  await page.screenshot({ path: shot('390/nav-drawer-open.png') })
  // Esc closes and returns focus to the burger
  await page.keyboard.press('Escape')
  await page.waitForTimeout(400)
  const r = await page.evaluate(() => ({
    expanded: document.querySelector('.nav__burger').getAttribute('aria-expanded'),
    focusOnBurger: document.activeElement === document.querySelector('.nav__burger'),
  }))
  console.log('Esc closes drawer:', ok(r.expanded === 'false'))
  console.log('focus back on burger:', ok(r.focusOnBurger))
  // a nav link closes it
  await burger.click()
  await page.waitForTimeout(300)
  await page.locator('.nav__links a[href="#faq"]').click()
  await page.waitForTimeout(600)
  console.log('nav link closes drawer:', ok((await burger.getAttribute('aria-expanded')) === 'false'))
  await page.ctx.close()
}

/* ---- 4. Unexpected hosts / console over a full walk ---- */
console.log('\n================ NETWORK + CONSOLE, FULL WALK ================')
{
  const page = await newPage(b, { viewport: VIEWPORTS[1440] })
  await page.goto(BUILD)
  await settle(page)
  for (const a of ['#features', '#ai', '#who', '#faq']) {
    await page.locator(`.nav__links a[href="${a}"]`).click()
    await page.waitForTimeout(400)
  }
  for (const id of ['b1', 'b2', 'b3', 'b4']) {
    await page.locator(`#tab-${id}`).click()
    await page.waitForTimeout(300)
  }
  for (let i = 0; i < 6; i++) {
    await page.locator('.faq details summary').nth(i).click()
    await page.waitForTimeout(150)
  }
  await page.locator('.nav__cta button').click()
  await page.waitForTimeout(500)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)

  console.log('hosts contacted:', hostsOf(page.log.requests).join(', '))
  console.log('only the page origin:', ok(hostsOf(page.log.requests).every((h) => h === 'localhost:4174')))
  console.log('failed requests:', page.log.failed.length ? JSON.stringify(page.log.failed) : 'none', ok(page.log.failed.length === 0))
  console.log('page errors:', page.log.pageErrors.length ? JSON.stringify(page.log.pageErrors) : 'none', ok(page.log.pageErrors.length === 0))
  console.log('console errors/warnings:', JSON.stringify(noise(page.log)), ok(noise(page.log).length === 0))
  await page.ctx.close()
}

/* ---- 5. Sub-path integrity: every asset 200, nothing at the root ---- */
console.log('\n================ SUB-PATH ASSET INTEGRITY ================')
{
  const page = await newPage(b, { viewport: VIEWPORTS[1440] })
  const statuses = []
  page.on('response', (r) => statuses.push({ url: r.url(), status: r.status() }))
  await page.goto(BUILD)
  await settle(page)
  // force the icons/manifest to be fetched
  const extra = await page.evaluate(async () => {
    const urls = [...document.querySelectorAll('link[rel]')].map((l) => l.href).filter(Boolean)
    const out = []
    for (const u of urls) {
      try { const r = await fetch(u); out.push([u, r.status]) } catch (e) { out.push([u, 'ERR ' + e.message]) }
    }
    return out
  })
  console.log('document/asset responses:')
  for (const s of statuses) console.log(`   ${String(s.status).padEnd(4)} ${s.url}`)
  console.log('head-link fetches:')
  for (const [u, s] of extra) console.log(`   ${String(s).padEnd(4)} ${u}`)
  const bad = [...statuses.map(s => [s.url, s.status]), ...extra].filter(([, s]) => s !== 200)
  console.log('non-200 responses:', bad.length ? JSON.stringify(bad) : 'none', ok(bad.length === 0))
  const rootRefs = [...statuses, ...extra.map(([url, status]) => ({ url, status }))]
    .filter((s) => { try { const p = new URL(s.url).pathname; return !p.startsWith('/foodos.ai/') } catch { return false } })
  console.log('references outside /foodos.ai/:', rootRefs.length ? JSON.stringify(rootRefs) : 'none', ok(rootRefs.length === 0))

  // canonical / og corrected at runtime?
  const meta = await page.evaluate(() => ({
    canonical: document.querySelector('link[rel=canonical]')?.href,
    ogUrl: document.querySelector('meta[property="og:url"]')?.content,
    ogImage: document.querySelector('meta[property="og:image"]')?.content,
    twImage: document.querySelector('meta[name="twitter:image"]')?.content,
  }))
  console.log('runtime meta:', JSON.stringify(meta, null, 1))
  await page.ctx.close()
}

/* ---- 6. Dev server parity ---- */
console.log('\n================ DEV SERVER (vite, :5173) ================')
{
  const page = await newPage(b, { viewport: VIEWPORTS[1440] })
  await page.goto(DEV)
  await settle(page)
  const r = await page.evaluate(() => ({
    h1: document.querySelector('h1')?.textContent,
    sections: [...document.querySelectorAll('section')].length,
    warnBanner: Boolean(document.querySelector('.banner--warn')),
  }))
  console.log('h1:', JSON.stringify(r.h1), 'sections:', r.sections)
  console.log('hosts:', hostsOf(page.log.requests).join(', '))
  console.log('page errors:', page.log.pageErrors.length ? JSON.stringify(page.log.pageErrors) : 'none')
  console.log('console (incl. dev warnings):', JSON.stringify(page.log.console.filter(c => c.type === 'error' || c.type === 'warning')))
  await page.goto(DEV + '#book-a-demo')
  await settle(page)
  const warn = await page.evaluate(() => document.querySelector('.banner--warn')?.textContent?.slice(0, 60))
  console.log('dev form not-configured banner (no .env):', JSON.stringify(warn))
  await page.screenshot({ path: shot('1440/dev-server.png'), fullPage: false })
  await page.ctx.close()
}

await b.close()
