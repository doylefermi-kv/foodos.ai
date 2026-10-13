import {
  browser, newPage, BUILD, VIEWPORTS, settle, shot, noise,
  setMode, received, reset,
} from './lib.mjs'

const b = await browser()
const ok = (c) => (c ? 'PASS' : '** FAIL **')
let nonce = 0

async function openForm(page) {
  await page.goto(`${BUILD}?qa=${nonce++}`)
  await settle(page, 250)
  await page.locator('.nav__cta button').click()
  await page.waitForSelector('dialog.modal input[name=name]')
}

async function fillGood(page) {
  await page.fill('input[name=name]', 'Asha Menon')
  await page.fill('input[name=phone]', '9876543210')
  await page.fill('input[name=restaurantName]', 'Spice Route')
  await page.fill('input[name=city]', 'Kochi')
  await page.selectOption('select[name=outlets]', '2-5')
  await page.check('input[name=consent]')
}

async function state(page) {
  return page.evaluate(() => ({
    done: Boolean(document.querySelector('.done')),
    doneRef: document.querySelector('.done__ref')?.textContent?.trim() || null,
    doneText: document.querySelector('.done')?.textContent?.replace(/\s+/g, ' ').trim().slice(0, 180) || null,
    failure: document.querySelector('.banner--bad')?.textContent?.replace(/\s+/g, ' ').trim() || null,
    failureRole: document.querySelector('.banner--bad')?.getAttribute('role') || null,
    errors: Object.fromEntries(
      [...document.querySelectorAll('.field, .consent')].map((f) => {
        const err = f.querySelector('.field__err')
        const input = f.querySelector('input,select,textarea')
        return err && input ? [input.getAttribute('name'), err.textContent.trim()] : null
      }).filter(Boolean),
    ),
    focused: document.activeElement?.getAttribute('name') || document.activeElement?.className,
    submitDisabled: document.querySelector('button[type=submit]')?.disabled,
    submitText: document.querySelector('button[type=submit]')?.textContent?.trim(),
    spinner: Boolean(document.querySelector('.spin')),
  }))
}

/* ============ E. Every documented server response ============ */
console.log('================ E. SERVER RESPONSE MAPPING ================')
const MODES = [
  ['ok', 'success state with a reference', 4000],
  ['ok-no-id', 'success state, no reference line', 4000],
  ['validation', 'inline field errors + focus first', 4000],
  ['bot', 'generic "could not verify"', 4000],
  ['rate_limited', '"wait a minute"', 4000],
  ['upstream', '"did not reach us"', 4000],
  ['unknown', 'generic fallback', 4000],
  ['nonjson', 'HTML sign-in page -> generic', 4000],
  ['hangup', 'socket destroyed -> network message', 6000],
  ['slow', '20s response vs 15s timeout -> timeout message', 20000],
]

for (const [mode, expectation, wait] of MODES) {
  await setMode(mode)
  await reset()
  const page = await newPage(b, { viewport: VIEWPORTS[1440] })
  await openForm(page)
  await fillGood(page)

  const t0 = Date.now()
  await page.click('button[type=submit]')

  // Sending state, caught straight after the click.
  await page.waitForTimeout(120)
  const sending = await state(page)

  await page.waitForTimeout(wait)
  const s = await state(page)
  const elapsed = Date.now() - t0

  console.log(`\n-- mode=${mode}  (expect: ${expectation}) --`)
  console.log(`   while sending: text=${JSON.stringify(sending.submitText)} disabled=${sending.submitDisabled} spinner=${sending.spinner}`)
  console.log(`   done=${s.done} ref=${JSON.stringify(s.doneRef)}`)
  console.log(`   banner(role=${s.failureRole}): ${JSON.stringify(s.failure)}`)
  console.log(`   field errors: ${JSON.stringify(s.errors)}`)
  console.log(`   focus after: ${s.focused}   submit re-enabled: ${s.submitDisabled === false}   elapsed=${Math.round(elapsed / 1000)}s`)
  console.log(`   console noise: ${JSON.stringify(noise(page.log))}`)
  await page.locator('.modal__card').screenshot({ path: shot(`1440/response-${mode}.png`) }).catch(() => {})
  await page.ctx.close()
}

/* ============ F. Double submit ============ */
console.log('\n================ F. RAPID DOUBLE-CLICK ================')
{
  await setMode('ok')
  await reset()
  const page = await newPage(b, { viewport: VIEWPORTS[1440] })
  await openForm(page)
  await fillGood(page)
  const btn = page.locator('button[type=submit]')
  // Three clicks as fast as the driver allows.
  await btn.click({ delay: 0 })
  await btn.click({ delay: 0, force: true }).catch(() => {})
  await btn.click({ delay: 0, force: true }).catch(() => {})
  await page.waitForTimeout(3000)
  const got = (await received()).filter((r) => !r.preflight)
  console.log('POSTs the server saw:', got.length, ok(got.length === 1), '(expected exactly 1)')
  console.log('ended in success state:', ok((await state(page)).done))
  await page.ctx.close()
}

/* ============ F2. Double submit via keyboard (Enter held) ============ */
{
  await setMode('ok')
  await reset()
  const page = await newPage(b, { viewport: VIEWPORTS[1440] })
  await openForm(page)
  await fillGood(page)
  await page.locator('button[type=submit]').focus()
  await page.keyboard.press('Enter')
  await page.keyboard.press('Enter')
  await page.keyboard.press('Enter')
  await page.waitForTimeout(3000)
  const got = (await received()).filter((r) => !r.preflight)
  console.log('keyboard triple-Enter POSTs:', got.length, ok(got.length === 1))
  await page.ctx.close()
}

/* ============ G. Attribution ============ */
console.log('\n================ G. ATTRIBUTION ================')
{
  await setMode('ok')
  await reset()
  const page = await newPage(b, { viewport: VIEWPORTS[1440] })
  await page.goto(BUILD + '?utm_source=test&utm_medium=qa&utm_campaign=qa1')
  await settle(page)

  // Navigate around first — the stored value must survive.
  await page.locator('.nav__links a[href="#features"]').click()
  await page.waitForTimeout(500)
  await page.locator('.nav__links a[href="#faq"]').click()
  await page.waitForTimeout(500)
  // and a history change that drops the query string
  await page.evaluate(() => history.replaceState(null, '', location.pathname))
  await page.waitForTimeout(200)

  await page.locator('.cta__row button').scrollIntoViewIfNeeded()
  await page.locator('.cta__row button').click()
  await page.waitForSelector('dialog.modal input[name=name]')
  await fillGood(page)
  await page.click('button[type=submit]')
  await page.waitForTimeout(3000)

  const last = (await received()).filter((r) => !r.preflight).slice(-1)[0]
  console.log('payload received by the mock:')
  console.log(JSON.stringify(last?.parsed, null, 1))
  const a = last?.parsed?.attribution || {}
  console.log('utmSource:', ok(a.utmSource === 'test'), a.utmSource)
  console.log('utmMedium:', ok(a.utmMedium === 'qa'), a.utmMedium)
  console.log('utmCampaign:', ok(a.utmCampaign === 'qa1'), a.utmCampaign)
  console.log('landingPath keeps the query:', ok(/utm_source=test/.test(a.landingPath || '')), a.landingPath)
  console.log('userAgent present (contract field):', ok('userAgent' in (last?.parsed || {})), last?.parsed?.userAgent)
  console.log('turnstileToken absent:', ok(!('turnstileToken' in (last?.parsed || {}))))

  // Success-state copy
  const s = await state(page)
  console.log('success text:', s.doneText)
  await page.locator('.modal__card').screenshot({ path: shot('1440/form-success.png') })
  await page.ctx.close()
}

await b.close()
