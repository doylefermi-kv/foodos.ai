/**
 * `doPost` and `doGet` end to end, against the faked Apps Script services.
 *
 * Remember while reading: a deployed web app answers HTTP 200 to everything,
 * so the only thing that carries meaning is the body. Every assertion below is
 * on the body the client will branch on.
 */

import test from 'node:test'
import assert from 'node:assert/strict'

import { loadAppsScript } from './apps-script-env.js'
import { MINIMAL_BODY, validBody } from './fixtures.js'

/** The 20 columns, in order, as the header row the sheet is created with. */
const COLUMNS = loadAppsScript().script.SHEET_COLUMNS
const column = (name) => COLUMNS.indexOf(name)

/* -------------------------------------------------------------- */
/* Happy path                                                      */
/* -------------------------------------------------------------- */

test('a good lead is appended and acknowledged with its id', () => {
  const app = loadAppsScript()
  const body = app.post(validBody())

  assert.deepEqual(body, { ok: true, id: app.uuids[0] })

  const rows = app.leadsSheet.dataRows
  assert.equal(rows.length, 1)
  assert.equal(rows[0].length, COLUMNS.length)
  assert.equal(rows[0][column('id')], app.uuids[0])
  assert.equal(rows[0][column('name')], 'Anjali Menon')
  assert.equal(rows[0][column('phone')], "'+919876543210")
  assert.equal(rows[0][column('receivedAt')], '2026-10-13T10:01:08.266+05:30')
  assert.equal(rows[0][column('status')], 'new')
})

test('the response is JSON, which is what ContentService must be told', () => {
  const app = loadAppsScript()
  const output = app.script.doPost({ postData: { contents: JSON.stringify(validBody()) } })
  assert.equal(output.getMimeType(), 'application/json')
})

test('the append is wrapped in the script lock, released afterwards', () => {
  const app = loadAppsScript()
  app.post(validBody())

  assert.deepEqual(app.lock.waits, [15000])
  assert.equal(app.lock.releases, 1)
})

test('a minimal request is accepted and pads the optional columns', () => {
  const app = loadAppsScript()
  assert.equal(app.post(MINIMAL_BODY).ok, true)

  const row = app.leadsSheet.dataRows[0]
  assert.equal(row[column('email')], '')
  assert.equal(row[column('userAgent')], '')
  assert.equal(row[column('city')], 'Chennai')
})

/* -------------------------------------------------------------- */
/* The Leads tab                                                   */
/* -------------------------------------------------------------- */

test('a missing Leads tab is created with a frozen header row', () => {
  const app = loadAppsScript({ sheets: ['Sheet1'] })
  assert.equal(app.post(validBody()).ok, true)

  const sheet = app.leadsSheet
  assert.ok(sheet, 'the Leads tab should have been created')
  assert.deepEqual(sheet.rows[0], [...COLUMNS])
  assert.equal(sheet.frozenRows, 1)
  assert.equal(sheet.dataRows.length, 1)
})

test('an existing Leads tab is appended to, not recreated', () => {
  const app = loadAppsScript()
  app.post(validBody())
  app.post(validBody({ phone: '9811111111' }))

  assert.equal(app.spreadsheet.sheets.length, 1)
  assert.equal(app.leadsSheet.dataRows.length, 2)
})

/* -------------------------------------------------------------- */
/* Rejections                                                      */
/* -------------------------------------------------------------- */

test('a filled honeypot gets a flat bot response and is never written', () => {
  const app = loadAppsScript()
  const body = app.post(validBody({ website: 'http://spam.example' }))

  assert.deepEqual(body, { ok: false, error: 'bot' })
  assert.equal(app.leadsSheet.rows.length, 0, 'nothing may be written, not even headers')
  assert.equal(app.cache.puts.filter((put) => put.key.startsWith('leads:phone:')).length, 0)
})

test('an invalid lead comes back as validation, with the fields named', () => {
  const app = loadAppsScript()
  const body = app.post(validBody({ phone: '12345', consent: false }))

  assert.equal(body.ok, false)
  assert.equal(body.error, 'validation')
  assert.ok(body.fields.phone)
  assert.ok(body.fields.consent)
  assert.equal(app.leadsSheet.rows.length, 0)
})

test('a body that is not a JSON object is a validation error, not a crash', () => {
  for (const contents of ['', '   ', 'not json', '[1,2,3]', '"a string"', 'null']) {
    const app = loadAppsScript()
    const body = app.postRaw({ postData: { contents } })
    assert.deepEqual(
      body,
      { ok: false, error: 'validation', fields: { name: 'Expected a JSON object.' } },
      `for ${JSON.stringify(contents)}`,
    )
  }
})

test('a POST with no body at all is handled', () => {
  const app = loadAppsScript()
  assert.equal(app.postRaw({}).error, 'validation')
  assert.equal(app.postRaw(undefined).error, 'validation')
})

/* -------------------------------------------------------------- */
/* Throttling                                                      */
/* -------------------------------------------------------------- */

test('the same number inside the window is a duplicate, in any format', () => {
  const app = loadAppsScript()
  assert.equal(app.post(validBody()).ok, true)

  // Same human, different spelling of the number.
  assert.deepEqual(app.post(validBody({ phone: '+91 98765 43210' })), {
    ok: false,
    error: 'rate_limited',
  })
  assert.equal(app.leadsSheet.dataRows.length, 1)
})

test('the duplicate window expires after ten minutes', () => {
  const app = loadAppsScript()
  assert.equal(app.post(validBody()).ok, true)

  app.clock.advance(10 * 60 * 1000 - 1000)
  assert.equal(app.post(validBody()).error, 'rate_limited')

  app.clock.advance(2000)
  assert.equal(app.post(validBody()).ok, true, 'a genuine second enquiry must get through')
  assert.equal(app.leadsSheet.dataRows.length, 2)
})

test('a different number is not caught by the duplicate window', () => {
  const app = loadAppsScript()
  assert.equal(app.post(validBody()).ok, true)
  assert.equal(app.post(validBody({ phone: '9811111111' })).ok, true)
  assert.equal(app.leadsSheet.dataRows.length, 2)
})

test('the global per-minute cap holds, and lifts on the next minute', () => {
  const app = loadAppsScript()
  const phoneFor = (index) => String(9876500000 + index)

  for (let i = 0; i < 30; i++) {
    assert.equal(app.post(validBody({ phone: phoneFor(i) })).ok, true, `lead ${i} should pass`)
  }

  assert.deepEqual(app.post(validBody({ phone: phoneFor(99) })), {
    ok: false,
    error: 'rate_limited',
  })
  assert.equal(app.leadsSheet.dataRows.length, 30)

  app.clock.advance(60 * 1000)
  assert.equal(app.post(validBody({ phone: phoneFor(99) })).ok, true)
})

test('the cap is counted before anything is parsed, so junk is cheap', () => {
  const app = loadAppsScript()
  const minute = Math.floor(app.clock.now() / 60000)
  app.cache.put(`leads:minute:${minute}`, '30', 120)

  assert.equal(app.postRaw({ postData: { contents: 'not json' } }).error, 'rate_limited')
})

/* -------------------------------------------------------------- */
/* Failure                                                         */
/* -------------------------------------------------------------- */

test('an append failure returns upstream and logs the whole lead', () => {
  const app = loadAppsScript({
    onAppend: () => {
      throw new Error('Service Spreadsheets failed while accessing document')
    },
  })

  assert.deepEqual(app.post(validBody()), { ok: false, error: 'upstream' })

  const logged = app.logs.error.join('\n')
  assert.match(logged, /Service Spreadsheets failed/)
  assert.match(logged, /UNSAVED LEAD/)
  // The payload has to be replayable by hand from the execution log.
  assert.match(logged, /Anjali Menon/)
  assert.match(logged, /\+919876543210/)
  assert.match(logged, /anjali@spicegarden\.in/)
})

test('a failed append releases the lock and leaves the number retryable', () => {
  const app = loadAppsScript({
    onAppend: () => {
      throw new Error('append exploded')
    },
  })

  assert.equal(app.post(validBody()).error, 'upstream')
  assert.equal(app.lock.releases, 1)
  assert.equal(
    app.cache.get('leads:phone:+919876543210'),
    null,
    'a lost lead must not block the retry that saves it',
  )
})

test('a script that is not bound to a Sheet fails loudly as upstream', () => {
  const app = loadAppsScript({ bound: false })

  assert.deepEqual(app.post(validBody()), { ok: false, error: 'upstream' })
  assert.match(app.logs.error.join('\n'), /No bound spreadsheet/)
})

/* -------------------------------------------------------------- */
/* Health                                                          */
/* -------------------------------------------------------------- */

test('doGet answers the health check the runbook uses', () => {
  const app = loadAppsScript()
  assert.deepEqual(app.get(), { ok: true, service: 'foodos-leads' })
  // And says nothing about the sheet: this URL is public.
  assert.equal(app.leadsSheet.rows.length, 0)
})
