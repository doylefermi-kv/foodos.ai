import {
  browser,
  newPage,
  BUILD,
  DESIGN,
  VIEWPORTS,
  settle,
  freezeMotion,
  shot,
} from './lib.mjs'

/** The sections the issue names, by the selector each side actually uses. */
const SECTIONS = [
  ['hero', '.hero'],
  ['ai', '#ai'],
  ['features', '#features'],
  ['who', '#who'],
  ['faq', '#faq'],
  ['cta', '#cta'],
  ['footer', '.foot'],
]

const b = await browser()

for (const [vpName, viewport] of Object.entries(VIEWPORTS)) {
  for (const [side, url] of [
    ['build', BUILD],
    ['design', DESIGN],
  ]) {
    const page = await newPage(b, { viewport })
    await page.goto(url, { waitUntil: 'load' })
    await settle(page)
    await freezeMotion(page)
    await page.evaluate(() => window.scrollTo(0, 0))
    await page.waitForTimeout(300)

    await page.screenshot({
      path: shot(`${vpName}/full-${side}.png`),
      fullPage: true,
    })

    for (const [name, selector] of SECTIONS) {
      const el = page.locator(selector).first()
      if ((await el.count()) === 0) {
        console.log(`  MISSING ${side} ${vpName} ${name} (${selector})`)
        continue
      }
      await el.scrollIntoViewIfNeeded().catch(() => {})
      await page.waitForTimeout(150)
      await el
        .screenshot({ path: shot(`${vpName}/${name}-${side}.png`) })
        .catch((e) => console.log(`  ERR ${side} ${name}: ${e.message}`))
    }
    console.log(`${vpName} ${side}: done`)
    await page.ctx.close()
  }
}

await b.close()
