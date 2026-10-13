/**
 * The pure logic in `Code.gs`: validation, normalisation and row mapping.
 *
 * Nothing here touches the fake Sheet — these are the functions that would be
 * identical if the web app ran anywhere else. The Sheet, cache and lock are
 * exercised in `do-post.test.js`.
 */

import test from 'node:test'
import assert from 'node:assert/strict'

import { loadAppsScript, plain } from './apps-script-env.js'
import {
  HONEYPOT_CASES,
  MINIMAL_BODY,
  PHONE_CASES,
  VALIDATION_CASES,
  validBody,
} from './fixtures.js'

const { script } = loadAppsScript()

/* -------------------------------------------------------------- */
/* Phone normalisation                                             */
/* -------------------------------------------------------------- */

test('normalisePhone handles every format from the fixtures', () => {
  for (const { input, expected } of PHONE_CASES) {
    assert.equal(script.normalisePhone(input), expected, `failed for ${String(input)}`)
  }
})

/* -------------------------------------------------------------- */
/* Validation                                                      */
/* -------------------------------------------------------------- */

test('every fixture case validates the way the fixture says it does', () => {
  for (const testCase of VALIDATION_CASES) {
    const fields = plain(script.validateDemoRequest(testCase.body))
    const keys = Object.keys(fields)

    if (testCase.valid) {
      assert.deepEqual(keys, [], `${testCase.label} should be valid, got ${keys.join(', ')}`)
      continue
    }

    assert.ok(keys.length > 0, `${testCase.label} should be invalid`)
    for (const field of testCase.fields ?? []) {
      assert.ok(fields[field], `${testCase.label}: expected an error on ${field}`)
    }
  }
})

test('messages are the exact copy the form already shows', () => {
  const fields = plain(script.validateDemoRequest({}))
  assert.equal(fields.name, 'Please enter your name (2–80 characters).')
  assert.equal(fields.phone, 'Enter a 10-digit Indian mobile number, e.g. 98765 43210.')
  assert.equal(fields.restaurantName, "Please enter your restaurant's name (2–120 characters).")
  assert.equal(fields.city, 'Please enter your city.')
  assert.equal(fields.outlets, 'Please choose how many outlets you run.')
  assert.equal(fields.consent, 'Please agree to be contacted so we can call you back.')
})

test('hostile input fails validation instead of throwing', () => {
  for (const body of [null, undefined, 'a string', [], 42, { name: 42, phone: { a: 1 } }]) {
    assert.doesNotThrow(() => script.validateDemoRequest(body), `threw on ${String(body)}`)
  }
})

/* -------------------------------------------------------------- */
/* parseDemoRequest — validation plus normalisation                */
/* -------------------------------------------------------------- */

test('parseDemoRequest normalises the phone to +91 form', () => {
  const result = script.parseDemoRequest(validBody({ phone: '  098765 43210 ' }))
  assert.equal(result.ok, true)
  assert.equal(result.value.phone, '+919876543210')
})

test('parseDemoRequest trims text and drops blank optionals', () => {
  const result = script.parseDemoRequest(
    validBody({ name: '  Anjali Menon  ', email: '   ', message: '', restaurantType: '' }),
  )
  assert.equal(result.ok, true)
  assert.equal(result.value.name, 'Anjali Menon')
  assert.equal(result.value.email, undefined)
  assert.equal(result.value.message, undefined)
  assert.equal(result.value.restaurantType, undefined)
})

test('parseDemoRequest keeps only known attribution keys and truncates long ones', () => {
  const result = script.parseDemoRequest(
    validBody({
      attribution: { utmSource: 'google', utmCampaign: 'x'.repeat(600), evil: 'dropped' },
    }),
  )
  assert.equal(result.ok, true)
  assert.equal(result.value.attribution.utmSource, 'google')
  assert.equal(result.value.attribution.utmCampaign.length, 500)
  assert.ok(!('evil' in result.value.attribution))
})

test('attribution being absent or junk never fails a lead', () => {
  for (const attribution of [undefined, null, 'nope', 42]) {
    const result = script.parseDemoRequest(validBody({ attribution }))
    assert.equal(result.ok, true, `attribution=${String(attribution)} should still parse`)
    assert.deepEqual(plain(result.value.attribution), {})
  }
})

test('the browser-supplied user agent is kept but capped', () => {
  const result = script.parseDemoRequest(validBody({ userAgent: 'u'.repeat(600) }))
  assert.equal(result.ok, true)
  assert.equal(result.value.userAgent.length, 500)
  assert.equal(script.parseDemoRequest(MINIMAL_BODY).value.userAgent, undefined)
})

test('parseDemoRequest returns the field map on failure', () => {
  const result = script.parseDemoRequest(validBody({ phone: '12345' }))
  assert.equal(result.ok, false)
  assert.ok(result.fields.phone)
  assert.equal(result.value, undefined)
})

/* -------------------------------------------------------------- */
/* Honeypot                                                        */
/* -------------------------------------------------------------- */

test('honeypot trips only when the hidden field has content', () => {
  for (const { body, tripped } of HONEYPOT_CASES) {
    assert.equal(script.isHoneypotTripped(body), tripped, `honeypot: ${JSON.stringify(body)}`)
  }
})

test('a filled honeypot is not reported as a validation error', () => {
  // The bot gets a flat `bot`, never a hint about which field gave it away.
  assert.deepEqual(plain(script.validateDemoRequest(validBody({ website: 'http://spam' }))), {})
})

/* -------------------------------------------------------------- */
/* Timestamp                                                       */
/* -------------------------------------------------------------- */

test('receivedAt is ISO 8601 in IST', () => {
  assert.equal(
    script.toIstIsoString(new Date('2026-10-13T04:31:08.266Z')),
    '2026-10-13T10:01:08.266+05:30',
  )
  // Crossing midnight UTC must roll the IST date forward.
  assert.equal(
    script.toIstIsoString(new Date('2026-10-12T20:00:00.000Z')),
    '2026-10-13T01:30:00.000+05:30',
  )
})

/* -------------------------------------------------------------- */
/* Row mapping                                                     */
/* -------------------------------------------------------------- */

function leadFrom(body) {
  const parsed = script.parseDemoRequest(body)
  assert.equal(parsed.ok, true, 'fixture should be valid')
  return script.createLead(parsed.value, {
    id: 'lead-1',
    receivedAt: new Date('2026-10-13T04:31:08.266Z'),
  })
}

test('the column list still matches the one the architecture doc fixed', () => {
  assert.deepEqual(plain(script.SHEET_COLUMNS), [
    'id',
    'receivedAt',
    'name',
    'phone',
    'email',
    'restaurantName',
    'city',
    'outlets',
    'restaurantType',
    'preferredLanguage',
    'message',
    'utmSource',
    'utmMedium',
    'utmCampaign',
    'utmTerm',
    'utmContent',
    'referrer',
    'landingPath',
    'userAgent',
    'status',
  ])
})

test('toSheetRow emits values in SHEET_COLUMNS order', () => {
  assert.deepEqual(plain(script.toSheetRow(leadFrom(validBody()))), [
    'lead-1',
    '2026-10-13T10:01:08.266+05:30',
    'Anjali Menon',
    "'+919876543210",
    'anjali@spicegarden.in',
    'Spice Garden',
    'Kochi',
    '2-5',
    'casual_dining',
    'ml',
    'Looking to switch from our current POS.',
    'google',
    'cpc',
    'kerala-launch',
    'restaurant pos',
    'ad-a',
    'https://www.google.com/',
    '/?utm_source=google',
    'Mozilla/5.0 (test)',
    'new',
  ])
})

test('absent optional fields become empty cells, keeping every row the same width', () => {
  const columns = plain(script.SHEET_COLUMNS)
  const row = plain(script.toSheetRow(leadFrom(MINIMAL_BODY)))

  assert.equal(row.length, columns.length)
  for (const column of ['email', 'restaurantType', 'message', 'utmSource', 'userAgent']) {
    assert.equal(row[columns.indexOf(column)], '', `${column} should be an empty cell`)
  }
  assert.equal(row[columns.indexOf('name')], 'Ravi')
  assert.equal(row[columns.indexOf('status')], 'new')
})

test('cells that Sheets would read as a formula are escaped', () => {
  const columns = plain(script.SHEET_COLUMNS)
  const row = plain(script.toSheetRow(leadFrom(validBody({ name: '=HYPERLINK("http://evil")' }))))

  assert.equal(row[columns.indexOf('name')], '\'=HYPERLINK("http://evil")')
  // appendRow parses like a user typing, so the +91 phone needs it too.
  assert.equal(row[columns.indexOf('phone')], "'+919876543210")

  for (const name of ['-1+1', '@import', '+rate']) {
    const escaped = plain(script.toSheetRow(leadFrom(validBody({ name }))))[columns.indexOf('name')]
    assert.equal(escaped, `'${name}`)
  }
})

test('status defaults to new, for the sales team to update', () => {
  assert.equal(leadFrom(MINIMAL_BODY).status, 'new')
})
