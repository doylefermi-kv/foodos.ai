import { browser, newPage, BUILD, VIEWPORTS, settle, shot, setMode } from './lib.mjs'

const b = await browser()

/* Modal at all three viewports, for the report. */
for (const [vp, viewport] of Object.entries(VIEWPORTS)) {
  const page = await newPage(b, { viewport })
  await page.goto(BUILD + '#book-a-demo')
  await settle(page)
  await page.screenshot({ path: shot(`${vp}/modal.png`) })
  await page.ctx.close()
}

/* Placeholder inventory — what is still visibly chipped on the page. */
{
  const page = await newPage(b, { viewport: VIEWPORTS[1440] })
  await page.goto(BUILD)
  await settle(page)
  const inv = await page.evaluate(() => ({
    chips: [...document.querySelectorAll('.ph')].map((e) => e.textContent.trim()),
    logoPlaceholders: [...document.querySelectorAll('.logo-ph')].map((e) => e.textContent.trim()),
    avatarPlaceholders: [...document.querySelectorAll('.av')].map((e) => e.textContent.trim()),
    quoteNames: [...document.querySelectorAll('.quote figcaption b')].map((e) => e.textContent.trim()),
    favicon: document.querySelector('link[rel=icon]')?.href,
    ogImage: document.querySelector('meta[property="og:image"]')?.content,
  }))
  console.log('PLACEHOLDER INVENTORY')
  console.log(JSON.stringify(inv, null, 1))
  await page.locator('.proof').screenshot({ path: shot('1440/proof-placeholders.png') })
  await page.ctx.close()
}

await b.close()
