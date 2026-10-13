import {
  browser,
  newPage,
  BUILD,
  DESIGN,
  VIEWPORTS,
  settle,
  freezeMotion,
  shot,
  noise,
} from './lib.mjs'

const b = await browser()

/* ---------- 1. Language wheel (AI tab 04) on both sides ---------- */
for (const [side, url, clickSel] of [
  ['build', BUILD, '#tab-b4'],
  ['design', DESIGN, '[aria-controls="b4"], [data-tab="b4"], .aicard:nth-child(4)'],
]) {
  const page = await newPage(b, { viewport: VIEWPORTS[1440] })
  await page.goto(url)
  await settle(page)
  const tab = page.locator(clickSel).first()
  if ((await tab.count()) > 0) {
    await tab.click()
    await page.waitForTimeout(600)
  } else {
    console.log(`${side}: no tab-04 control found for ${clickSel}`)
  }
  await freezeMotion(page)
  await page.waitForTimeout(200)
  const pane = page.locator('#b4')
  await pane.scrollIntoViewIfNeeded().catch(() => {})
  await page.waitForTimeout(200)
  await pane.screenshot({ path: shot(`1440/wheel-${side}.png`) }).catch((e) => console.log(e.message))
  console.log(`${side}: wheel captured`)
  await page.ctx.close()
}

/* ---------- 2. Reduced motion, build only ---------- */
for (const [vp, viewport] of Object.entries(VIEWPORTS)) {
  const page = await newPage(b, { viewport, reducedMotion: 'reduce' })
  await page.goto(BUILD)
  await settle(page)
  await page.locator('#tab-b4').click()
  await page.waitForTimeout(600)
  await page.locator('#b4').scrollIntoViewIfNeeded()
  await page.waitForTimeout(300)
  await page.locator('#b4').screenshot({ path: shot(`${vp}/wheel-reduced-motion.png`) })

  // Is the wheel really static, and are the 3 loop duplicates hidden?
  const info = await page.evaluate(() => {
    const track = document.querySelector('.wheel__track')
    const rows = [...document.querySelectorAll('.wheel__track .wl')]
    const visible = rows.filter((r) => r.offsetParent !== null && r.getBoundingClientRect().height > 0)
    const cs = track ? getComputedStyle(track) : null
    return {
      totalRows: rows.length,
      visibleRows: visible.length,
      animationName: cs?.animationName,
      animationDuration: cs?.animationDuration,
      transform: cs?.transform,
      tickerAnim: getComputedStyle(document.querySelector('.ticker__t')).animationName,
    }
  })
  console.log(`reduced-motion ${vp}:`, JSON.stringify(info))
  await page.ctx.close()
}

/* ---------- 3. Normal motion for comparison ---------- */
{
  const page = await newPage(b, { viewport: VIEWPORTS[1440] })
  await page.goto(BUILD)
  await settle(page)
  await page.locator('#tab-b4').click()
  await page.waitForTimeout(400)
  const info = await page.evaluate(() => {
    const track = document.querySelector('.wheel__track')
    const rows = [...document.querySelectorAll('.wheel__track .wl')]
    return {
      totalRows: rows.length,
      visibleRows: rows.filter((r) => r.getBoundingClientRect().height > 0).length,
      animationName: getComputedStyle(track).animationName,
      animationDuration: getComputedStyle(track).animationDuration,
      tickerAnim: getComputedStyle(document.querySelector('.ticker__t')).animationName,
    }
  })
  console.log('normal-motion 1440:', JSON.stringify(info))
  await page.ctx.close()
}

/* ---------- 4. Anchor offset under the sticky nav ---------- */
{
  const page = await newPage(b, { viewport: VIEWPORTS[1440] })
  await page.goto(BUILD)
  await settle(page)
  const navH = await page.evaluate(
    () => document.querySelector('.nav').getBoundingClientRect().height,
  )
  for (const [label, anchor] of [
    ['Features', '#features'],
    ['AI', '#ai'],
    ["Who it's for", '#who'],
    ['FAQ', '#faq'],
  ]) {
    await page.locator(`.nav__links a[href="${anchor}"]`).click()
    await page.waitForTimeout(900)
    const r = await page.evaluate((a) => {
      const sec = document.querySelector(a)
      const heading = sec.querySelector('h2')
      const nav = document.querySelector('.nav')
      return {
        sectionTop: Math.round(sec.getBoundingClientRect().top),
        headingTop: Math.round(heading.getBoundingClientRect().top),
        navBottom: Math.round(nav.getBoundingClientRect().bottom),
        navPosition: getComputedStyle(nav).position,
      }
    }, anchor)
    const hidden = r.headingTop < r.navBottom
    console.log(
      `anchor ${label.padEnd(14)} sectionTop=${String(r.sectionTop).padStart(4)} headingTop=${String(r.headingTop).padStart(4)} navBottom=${r.navBottom} nav=${r.navPosition} headingUnderNav=${hidden}`,
    )
  }
  console.log('navHeight', navH)
  await page.ctx.close()
}

await b.close()
