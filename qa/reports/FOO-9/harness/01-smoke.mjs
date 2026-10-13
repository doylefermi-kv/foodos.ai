import { browser, newPage, BUILD, DESIGN, settle, noise, hostsOf } from './lib.mjs'

const b = await browser()
for (const [label, url] of [
  ['build', BUILD],
  ['design', DESIGN],
]) {
  const page = await newPage(b)
  const resp = await page.goto(url, { waitUntil: 'load' })
  await settle(page)
  const title = await page.title()
  const h1 = await page.locator('h1').first().textContent().catch(() => null)
  const sections = await page.evaluate(() =>
    [...document.querySelectorAll('section[id], section')].map(
      (s) => s.id || s.className,
    ),
  )
  console.log(`\n===== ${label} (${url}) =====`)
  console.log('status  ', resp?.status())
  console.log('title   ', title)
  console.log('h1      ', JSON.stringify(h1))
  console.log('sections', sections.join(' | '))
  console.log('hosts   ', hostsOf(page.log.requests).join(', '))
  console.log('failed  ', JSON.stringify(page.log.failed))
  console.log('pageErr ', JSON.stringify(page.log.pageErrors))
  console.log('console ', JSON.stringify(noise(page.log), null, 1))
  await page.ctx.close()
}
await b.close()
