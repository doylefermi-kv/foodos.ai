import {
  browser,
  newPage,
  BUILD,
  BUILD_UNSET,
  VIEWPORTS,
  settle,
  shot,
  noise,
} from './lib.mjs'

const b = await browser()
const ok = (c) => (c ? 'PASS' : '** FAIL **')

async function modalOpen(page) {
  return page.evaluate(() => {
    const d = document.querySelector('dialog.modal')
    return Boolean(d && d.open)
  })
}

/* ---------- 1. Every CTA opens the modal ---------- */
{
  console.log('\n## 1. CTA inventory + does each open the modal')
  const page = await newPage(b, { viewport: VIEWPORTS[1440] })
  await page.goto(BUILD)
  await settle(page)

  const ctas = await page.evaluate(() =>
    [...document.querySelectorAll('button, a')]
      .filter((el) => /book a demo|book my demo|contact|waitlist|sign in|pricing/i.test(el.textContent || ''))
      .map((el) => ({
        tag: el.tagName,
        text: el.textContent.trim().slice(0, 40),
        cls: el.className,
        href: el.getAttribute('href'),
      })),
  )
  console.log('CTA-ish controls found:', JSON.stringify(ctas, null, 1))

  const triggers = [
    ['nav', '.nav__cta button'],
    ['hero', '.hero__actions button'],
    ['cta section', '.cta__row button'],
    ['footer Contact', '.foot__link'],
  ]
  for (const [label, sel] of triggers) {
    const el = page.locator(sel).first()
    const n = await el.count()
    if (!n) {
      console.log(`${label.padEnd(16)} -> ** NOT FOUND ** (${sel})`)
      continue
    }
    await el.scrollIntoViewIfNeeded()
    await el.click()
    await page.waitForTimeout(400)
    const opened = await modalOpen(page)
    console.log(`${label.padEnd(16)} -> modal open: ${ok(opened)}`)
    if (opened) {
      await page.keyboard.press('Escape')
      await page.waitForTimeout(400)
    }
  }

  // "See everything it does" should scroll, not open.
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.locator('.hero__actions a').click()
  await page.waitForTimeout(700)
  console.log('secondary hero link opens modal (should be false):', await modalOpen(page))
  console.log('console noise:', JSON.stringify(noise(page.log)))
  await page.ctx.close()
}

/* ---------- 2. Hash deep link ---------- */
{
  console.log('\n## 2. #book-a-demo deep link')
  const page = await newPage(b, { viewport: VIEWPORTS[1440] })
  await page.goto(BUILD + '#book-a-demo')
  await settle(page)
  console.log('opens on load:', ok(await modalOpen(page)))
  await page.keyboard.press('Escape')
  await page.waitForTimeout(400)
  const url = page.url()
  console.log('hash cleared after close:', ok(!url.includes('book-a-demo')), url)
  // and re-openable via hash afterwards
  await page.evaluate(() => (window.location.hash = '#book-a-demo'))
  await page.waitForTimeout(500)
  console.log('re-opens via hash:', ok(await modalOpen(page)))
  await page.ctx.close()
}

/* ---------- 3. Keyboard: focus trap, Esc, focus return ---------- */
{
  console.log('\n## 3. Modal keyboard behaviour')
  const page = await newPage(b, { viewport: VIEWPORTS[1440] })
  await page.goto(BUILD)
  await settle(page)

  const navBtn = page.locator('.nav__cta button')
  await navBtn.focus()
  await page.keyboard.press('Enter')
  await page.waitForTimeout(500)

  const afterOpen = await page.evaluate(() => ({
    active: document.activeElement?.className || document.activeElement?.tagName,
    inModal: Boolean(document.activeElement?.closest('dialog.modal')),
    bodyOverflow: document.body.style.overflow,
  }))
  console.log('focus moved into modal:', ok(afterOpen.inModal), JSON.stringify(afterOpen))

  // Tab all the way round and check focus never escapes the dialog.
  const visited = []
  let escaped = false
  for (let i = 0; i < 30; i++) {
    await page.keyboard.press('Tab')
    const info = await page.evaluate(() => {
      const a = document.activeElement
      return {
        id: a?.id || '',
        tag: a?.tagName,
        name: a?.getAttribute('name') || a?.getAttribute('aria-label') || a?.textContent?.trim().slice(0, 20),
        inModal: Boolean(a?.closest('dialog.modal')),
      }
    })
    visited.push(`${info.tag}:${info.name}`)
    if (!info.inModal) escaped = true
  }
  console.log('focus trapped in dialog over 30 tabs:', ok(!escaped))
  console.log('tab order:', visited.slice(0, 16).join(' > '))
  // the honeypot must never be reachable
  console.log('honeypot reachable by Tab:', ok(!visited.some((v) => /website/i.test(v))))

  await page.keyboard.press('Escape')
  await page.waitForTimeout(500)
  const afterClose = await page.evaluate(() => ({
    open: Boolean(document.querySelector('dialog.modal')?.open),
    active: document.activeElement?.textContent?.trim().slice(0, 20),
    inNav: Boolean(document.activeElement?.closest('.nav')),
    bodyOverflow: document.body.style.overflow,
  }))
  console.log('Esc closes:', ok(!afterClose.open))
  console.log('focus returned to opener:', ok(afterClose.inNav), JSON.stringify(afterClose))
  console.log('body scroll restored:', ok(afterClose.bodyOverflow === ''))
  await page.ctx.close()
}

/* ---------- 4. Not-configured state ---------- */
{
  console.log('\n## 4. VITE_DEMO_REQUEST_URL unset')
  const page = await newPage(b, { viewport: VIEWPORTS[1440] })
  await page.goto(BUILD_UNSET + '#book-a-demo')
  await settle(page)
  const state = await page.evaluate(() => {
    const banner = document.querySelector('.banner--warn')
    const submit = document.querySelector('.form__actions button[type=submit]')
    return {
      bannerText: banner?.textContent?.trim() || null,
      bannerRole: banner?.getAttribute('role'),
      submitDisabled: submit?.disabled,
      submitText: submit?.textContent?.trim(),
    }
  })
  console.log(JSON.stringify(state, null, 1))
  console.log('warn banner shown:', ok(Boolean(state.bannerText)))
  console.log('submit disabled:', ok(state.submitDisabled === true))
  await page.locator('.modal__card').screenshot({ path: shot('1440/form-not-configured.png') })
  await page.ctx.close()
}

await b.close()
