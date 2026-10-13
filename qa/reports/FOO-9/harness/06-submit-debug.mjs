import { browser, newPage, BUILD, VIEWPORTS, settle, setMode, received, reset, noise, hostsOf } from './lib.mjs'

const b = await browser()

/* --- Why did opener.focus() not take? --- */
{
  console.log('## Root-cause probe: is the opener inert while the dialog is open?')
  const page = await newPage(b, { viewport: VIEWPORTS[1440] })
  await page.goto(BUILD)
  await settle(page)
  await page.locator('.nav__cta button').focus()
  await page.keyboard.press('Enter')
  await page.waitForTimeout(400)
  const probe = await page.evaluate(() => {
    const opener = document.querySelector('.nav__cta button')
    const before = document.activeElement?.className
    opener.focus() // exactly what close() does, but while the dialog is still open
    return {
      dialogOpen: document.querySelector('dialog.modal')?.open,
      activeBefore: before,
      activeAfterFocusCall: document.activeElement === opener ? 'OPENER' : document.activeElement?.className || 'BODY',
      openerInert: opener.matches(':where(:not(dialog)) *') && !opener.closest('dialog'),
    }
  })
  console.log(JSON.stringify(probe, null, 1))
  await page.ctx.close()
}

/* --- What actually happens on a clean submit? --- */
{
  console.log('\n## Clean submit against the mock (mode=ok)')
  await setMode('ok')
  await reset()
  const page = await newPage(b, { viewport: VIEWPORTS[1440] })
  await page.goto(BUILD + '#book-a-demo')
  await settle(page)

  await page.fill('input[name=name]', 'Asha Menon')
  await page.fill('input[name=phone]', '9876543210')
  await page.fill('input[name=restaurantName]', 'Spice Route')
  await page.fill('input[name=city]', 'Kochi')
  await page.selectOption('select[name=outlets]', '2-5')
  await page.check('input[name=consent]')

  const endpoint = await page.evaluate(() => {
    // what the bundle was built with
    return [...document.querySelectorAll('script')].map((s) => s.src)
  })
  console.log('scripts:', endpoint)

  await page.click('button[type=submit]')
  await page.waitForTimeout(4000)

  const state = await page.evaluate(() => ({
    hasDone: Boolean(document.querySelector('.done')),
    doneText: document.querySelector('.done')?.textContent?.trim().slice(0, 160),
    failure: document.querySelector('.banner--bad')?.textContent?.trim(),
    warn: document.querySelector('.banner--warn')?.textContent?.trim().slice(0, 60),
    fieldErrors: [...document.querySelectorAll('.field__err')].map((e) => e.textContent.trim()),
    submitText: document.querySelector('button[type=submit]')?.textContent?.trim(),
  }))
  console.log('page state:', JSON.stringify(state, null, 1))
  console.log('requests to non-page hosts:', hostsOf(page.log.requests))
  console.log('failed requests:', JSON.stringify(page.log.failed, null, 1))
  console.log('console:', JSON.stringify(noise(page.log), null, 1))
  const got = await received()
  console.log('mock received count:', got.length)
  if (got.length) {
    const last = got[got.length - 1]
    console.log('content-type:', last.contentType)
    console.log('headers sent:', JSON.stringify(Object.keys(last.headers)))
    console.log('payload:', JSON.stringify(last.parsed, null, 1))
  }
  await page.ctx.close()
}

await b.close()
