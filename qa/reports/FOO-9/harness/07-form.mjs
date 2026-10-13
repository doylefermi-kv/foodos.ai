import {
  browser, newPage, BUILD, VIEWPORTS, settle, shot, noise, hostsOf,
  setMode, received, reset,
} from './lib.mjs'

const b = await browser()
const ok = (c) => (c ? 'PASS' : '** FAIL **')

const GOOD = {
  name: 'Asha Menon',
  phone: '9876543210',
  restaurantName: 'Spice Route',
  city: 'Kochi',
  outlets: '2-5',
}

/** Always a fresh page: after a success the form is replaced by `.done`, so
 *  reusing it silently tests nothing. The cache-buster forces a real load. */
let nonce = 0
async function openForm(page, url = BUILD) {
  await page.goto(`${url}?qa=${nonce++}`)
  await settle(page, 250)
  await page.locator('.nav__cta button').click()
  await page.waitForSelector('dialog.modal input[name=name]')
}

async function fill(page, data = {}) {
  const d = { ...GOOD, ...data }
  for (const k of ['name', 'phone', 'restaurantName', 'city']) {
    if (d[k] !== undefined) await page.fill(`input[name=${k}]`, d[k])
  }
  if (d.email !== undefined) await page.fill('input[name=email]', d.email)
  if (d.message !== undefined) await page.fill('textarea[name=message]', d.message)
  if (d.outlets !== undefined && d.outlets !== '') await page.selectOption('select[name=outlets]', d.outlets)
  if (d.restaurantType) await page.selectOption('select[name=restaurantType]', d.restaurantType)
  if (d.preferredLanguage) await page.selectOption('select[name=preferredLanguage]', d.preferredLanguage)
  if (d.consent !== false) await page.check('input[name=consent]')
}

async function state(page) {
  return page.evaluate(() => ({
    done: Boolean(document.querySelector('.done')),
    doneRef: document.querySelector('.done__ref')?.textContent?.trim() || null,
    doneText: document.querySelector('.done')?.textContent?.replace(/\s+/g, ' ').trim().slice(0, 200) || null,
    failure: document.querySelector('.banner--bad')?.textContent?.replace(/\s+/g, ' ').trim() || null,
    errors: Object.fromEntries(
      [...document.querySelectorAll('.field, .consent')]
        .map((f) => {
          const err = f.querySelector('.field__err')
          const input = f.querySelector('input,select,textarea')
          return err && input ? [input.getAttribute('name'), err.textContent.trim()] : null
        })
        .filter(Boolean),
    ),
    focused: document.activeElement?.getAttribute('name') || document.activeElement?.tagName,
    submitDisabled: document.querySelector('button[type=submit]')?.disabled,
    submitText: document.querySelector('button[type=submit]')?.textContent?.trim(),
  }))
}

/* ================= A. Client-side validation ================= */
console.log('\n================ A. CLIENT-SIDE VALIDATION ================')
{
  const page = await newPage(b, { viewport: VIEWPORTS[1440] })
  await openForm(page)

  console.log('\n-- A1. Empty submit --')
  await page.click('button[type=submit]')
  await page.waitForTimeout(400)
  let s = await state(page)
  console.log('errors:', JSON.stringify(s.errors, null, 1))
  console.log('focus moved to first bad field (name):', ok(s.focused === 'name'), `(got ${s.focused})`)
  console.log('no network call made:', ok((await received()).length === 0))
  await page.locator('.modal__card').screenshot({ path: shot('1440/form-empty-errors.png') })

  console.log('\n-- A2. aria wiring on an errored field --')
  const aria = await page.evaluate(() => {
    const i = document.querySelector('input[name=name]')
    const describedBy = i.getAttribute('aria-describedby')
    return {
      ariaInvalid: i.getAttribute('aria-invalid'),
      describedBy,
      errorTextResolves: Boolean(describedBy && document.getElementById(describedBy)),
      errorText: describedBy ? document.getElementById(describedBy)?.textContent.trim() : null,
      labelFor: document.querySelector(`label[for="${i.id}"]`)?.textContent.trim(),
    }
  })
  console.log(JSON.stringify(aria, null, 1))
  console.log('aria-invalid set:', ok(aria.ariaInvalid === 'true'))
  console.log('aria-describedby resolves:', ok(aria.errorTextResolves))
  console.log('label associated:', ok(Boolean(aria.labelFor)))

  console.log('\n-- A3. Error clears as you type --')
  await page.fill('input[name=name]', 'A')
  await page.waitForTimeout(200)
  s = await state(page)
  console.log('name error cleared on input:', ok(!('name' in s.errors)))

  await page.ctx.close()
}

/* ================= B. Phone formats ================= */
console.log('\n================ B. PHONE FORMATS ================')
{
  const CASES = [
    ['9876543210', true, '+919876543210'],
    ['+91 98765 43210', true, '+919876543210'],
    ['09876543210', true, '+919876543210'],
    ['+919876543210', true, '+919876543210'],
    ['91 9876543210', true, '+919876543210'],
    ['0091 9876543210', true, '+919876543210'],
    ['98765-43210', true, '+919876543210'],
    ['(98765) 43210', true, '+919876543210'],
    ['  9876543210  ', true, '+919876543210'],
    ['0484 2345678', false, 'landline (Kochi STD)'],
    ['022-26543210', false, 'landline (Mumbai STD)'],
    ['987654321', false, '9 digits'],
    ['98765432101', false, '11 digits'],
    ['5876543210', false, 'starts with 5'],
    ['abcdefghij', false, 'letters'],
    ['98765 4321O', false, 'letter O for zero'],
    ['+1 415 555 2671', false, 'US number'],
    ['', false, 'empty'],
  ]
  const page = await newPage(b, { viewport: VIEWPORTS[1440] })
  await openForm(page)
  for (const [input, shouldPass, note] of CASES) {
    await openForm(page)
    await fill(page, { phone: input })
    await page.click('button[type=submit]')
    await page.waitForTimeout(400)
    const s = await state(page)
    const accepted = !('phone' in s.errors)
    const mark = accepted === shouldPass ? 'ok  ' : '** MISMATCH **'
    const sent = accepted ? (await received()).slice(-1)[0]?.parsed?.phone : '—'
    console.log(`${mark} ${JSON.stringify(input).padEnd(20)} accepted=${String(accepted).padEnd(5)} expected=${String(shouldPass).padEnd(5)} sentAs=${String(sent).padEnd(14)} ${note}`)
  }
  await page.ctx.close()
}

/* ================= C. Indic scripts, emoji, long content ================= */
console.log('\n================ C. SCRIPTS / LENGTH / WHITESPACE ================')
{
  await setMode('ok')
  const CASES = [
    ['Malayalam', { name: 'ആഷ മേനോൻ', restaurantName: 'സ്പൈസ് റൂട്ട്', city: 'കൊച്ചി' }, true],
    ['Tamil', { name: 'அசோக் குமார்', restaurantName: 'சரவணா பவன்', city: 'சென்னை' }, true],
    ['Telugu', { name: 'రాము గారు', restaurantName: 'ఆంధ్ర భోజనం', city: 'హైదరాబాద్' }, true],
    ['Hindi', { name: 'राजेश कुमार', restaurantName: 'शर्मा भोजनालय', city: 'दिल्ली' }, true],
    ['Emoji name', { name: '🍛🍛' }, true],
    ['1-char name', { name: 'A' }, false],
    ['80-char name', { name: 'A'.repeat(80) }, true],
    ['81-char name (maxLength should clamp)', { name: 'A'.repeat(81) }, true],
    ['whitespace-only name', { name: '     ' }, false],
    ['whitespace-only city', { city: '   ' }, false],
    ['1000-char message', { message: 'ഒ'.repeat(1000) }, true],
    ['1200-char message (maxLength clamps)', { message: 'x'.repeat(1200) }, true],
    ['bad email', { email: 'not-an-email' }, false],
    ['email with spaces', { email: 'a b@c.com' }, false],
    ['valid email', { email: 'asha@spiceroute.co.in' }, true],
  ]
  const page = await newPage(b, { viewport: VIEWPORTS[1440] })
  for (const [label, data, shouldPass] of CASES) {
    await openForm(page)
    await fill(page, data)
    const typed = await page.evaluate(() => ({
      name: document.querySelector('input[name=name]').value.length,
      message: document.querySelector('textarea[name=message]').value.length,
    }))
    await page.click('button[type=submit]')
    await page.waitForTimeout(500)
    const s = await state(page)
    const passed = s.done
    const mark = passed === shouldPass ? 'ok  ' : '** MISMATCH **'
    console.log(`${mark} ${label.padEnd(38)} submitted=${String(passed).padEnd(5)} expected=${shouldPass}  typedLen(name=${typed.name},msg=${typed.message}) errors=${JSON.stringify(s.errors)}`)
  }
  await page.ctx.close()
}

/* ================= D. Honeypot ================= */
console.log('\n================ D. HONEYPOT ================')
{
  await setMode('bot')
  const page = await newPage(b, { viewport: VIEWPORTS[1440] })
  await openForm(page)
  const hp = await page.evaluate(() => {
    const i = document.querySelector('input[name=website]')
    const wrap = i.closest('.hp')
    const r = i.getBoundingClientRect()
    const cs = getComputedStyle(wrap)
    return {
      exists: Boolean(i),
      tabIndex: i.tabIndex,
      ariaHiddenWrap: wrap.getAttribute('aria-hidden'),
      offscreen: r.left < -100 || r.top < -100 || r.right < 0 || r.bottom < 0,
      rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
      position: cs.position,
      autocomplete: i.getAttribute('autocomplete'),
    }
  })
  console.log('honeypot field:', JSON.stringify(hp, null, 1))
  console.log('hidden from AT (aria-hidden):', ok(hp.ariaHiddenWrap === 'true'))
  console.log('out of tab order:', ok(hp.tabIndex === -1))
  console.log('off-screen not display:none:', ok(hp.offscreen))

  await fill(page)
  await page.evaluate(() => {
    const i = document.querySelector('input[name=website]')
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
    setter.call(i, 'http://spam.example')
    i.dispatchEvent(new Event('input', { bubbles: true }))
  })
  await page.waitForTimeout(200)
  await page.click('button[type=submit]')
  await page.waitForTimeout(1200)
  const s = await state(page)
  console.log('sent value reached server:', JSON.stringify((await received()).slice(-1)[0]?.parsed?.website))
  console.log('visitor sees generic message, not a field error:', ok(Object.keys(s.errors).length === 0))
  console.log('banner:', s.failure)
  console.log('message does not name the honeypot:', ok(!/website/i.test(s.failure || '')))
  await page.locator('.modal__card').screenshot({ path: shot('1440/form-bot.png') })
  await page.ctx.close()
}

await b.close()
