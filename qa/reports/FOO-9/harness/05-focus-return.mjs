import { browser, newPage, BUILD, VIEWPORTS, settle } from './lib.mjs'

const b = await browser()
const ok = (c) => (c ? 'PASS' : '** FAIL **')

/** Is focus ever on something behind the modal while it is open? */
{
  console.log('## Focus trap — can focus reach page content behind the dialog?')
  const page = await newPage(b, { viewport: VIEWPORTS[1440] })
  await page.goto(BUILD + '#book-a-demo')
  await settle(page)
  let leaked = []
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press('Tab')
    const r = await page.evaluate(() => {
      const a = document.activeElement
      if (!a || a === document.body || a === document.documentElement) return null
      if (a.closest('dialog.modal')) return null
      return a.tagName + '.' + a.className + ':' + (a.textContent || '').trim().slice(0, 20)
    })
    if (r) leaked.push(r)
  }
  console.log('elements behind the modal that took focus:', leaked.length ? leaked : 'none')
  console.log('trap holds:', ok(leaked.length === 0))

  // Same, backwards.
  leaked = []
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press('Shift+Tab')
    const r = await page.evaluate(() => {
      const a = document.activeElement
      if (!a || a === document.body || a === document.documentElement) return null
      if (a.closest('dialog.modal')) return null
      return a.tagName + '.' + a.className
    })
    if (r) leaked.push(r)
  }
  console.log('shift-tab leaks:', leaked.length ? leaked : 'none')
  await page.ctx.close()
}

/** Focus return, per close route and per opener. */
const ROUTES = [
  ['Escape key', async (p) => p.keyboard.press('Escape')],
  ['× close button', async (p) => p.locator('.modal__close').click()],
  ['backdrop click', async (p) => p.mouse.click(5, 5)],
]

const OPENERS = [
  ['nav', '.nav__cta button'],
  ['hero', '.hero__actions button'],
  ['cta', '.cta__row button'],
  ['footer Contact', '.foot__link'],
]

for (const [routeName, closeIt] of ROUTES) {
  console.log(`\n## Focus return after: ${routeName}`)
  for (const [openerName, sel] of OPENERS) {
    const page = await newPage(b, { viewport: VIEWPORTS[1440] })
    await page.goto(BUILD)
    await settle(page)
    const opener = page.locator(sel).first()
    await opener.scrollIntoViewIfNeeded()
    await opener.focus()
    await page.keyboard.press('Enter')
    await page.waitForTimeout(500)
    await closeIt(page)
    await page.waitForTimeout(600)
    const r = await page.evaluate((s) => {
      const a = document.activeElement
      const want = document.querySelector(s)
      return {
        isOpener: a === want,
        active: a === document.body ? 'BODY' : a.tagName + '.' + a.className,
      }
    }, sel)
    console.log(`  opener=${openerName.padEnd(15)} focus back on opener: ${ok(r.isOpener)}  (now: ${r.active})`)
    await page.ctx.close()
  }
}

/** And after a successful submit, closing via the success-state Close button. */
console.log('\n## Focus return after success-state Close')
{
  await fetch('http://127.0.0.1:8799/__mode?set=ok')
  const page = await newPage(b, { viewport: VIEWPORTS[1440] })
  await page.goto(BUILD)
  await settle(page)
  await page.locator('.nav__cta button').focus()
  await page.keyboard.press('Enter')
  await page.waitForTimeout(400)
  await page.fill('input[name=name]', 'Asha Menon')
  await page.fill('input[name=phone]', '9876543210')
  await page.fill('input[name=restaurantName]', 'Spice Route')
  await page.fill('input[name=city]', 'Kochi')
  await page.selectOption('select[name=outlets]', '2-5')
  await page.check('input[name=consent]')
  await page.click('button[type=submit]')
  await page.waitForSelector('.done', { timeout: 10000 })
  const focusOnDone = await page.evaluate(() => document.activeElement?.className)
  console.log('  focus moved to success panel:', ok(focusOnDone === 'done'), focusOnDone)
  await page.locator('.done__actions button').click()
  await page.waitForTimeout(600)
  const r = await page.evaluate(() => {
    const a = document.activeElement
    return {
      isOpener: a === document.querySelector('.nav__cta button'),
      active: a === document.body ? 'BODY' : a.tagName + '.' + a.className,
    }
  })
  console.log('  focus back on opener:', ok(r.isOpener), r.active)
  await page.ctx.close()
}

await b.close()
