/**
 * Drift guard: `apps-script/Code.gs` vs `website/shared/contract.ts`.
 *
 * The browser validates with the contract (inline field errors) and the server
 * validates with the port (the decision that matters). If they disagree, a
 * visitor is either told their input is fine and then silently rejected, or
 * blocked in the form over something the server would have accepted. Neither
 * failure announces itself in production, so it is caught here instead: both
 * implementations are run over the same fixtures and must answer identically.
 *
 * When this test fails, the contract is right and the port is wrong — unless
 * the CTO has changed the contract, in which case fix the port to match.
 */

import test from 'node:test'
import assert from 'node:assert/strict'

import {
  EMAIL_RE,
  INDIAN_MOBILE_RE,
  LIMITS,
  OUTLETS,
  RESTAURANT_TYPES,
  SHEET_COLUMNS,
  isHoneypotTripped,
  normalisePhone,
  parseDemoRequest,
  validateDemoRequest,
} from '../../website/shared/contract.ts'

import { loadAppsScript, plain } from './apps-script-env.js'
import { HONEYPOT_CASES, PHONE_CASES, VALIDATION_CASES } from './fixtures.js'

const { script } = loadAppsScript()

/* -------------------------------------------------------------- */
/* Constants                                                       */
/* -------------------------------------------------------------- */

test('the column order is identical', () => {
  assert.deepEqual(plain(script.SHEET_COLUMNS), [...SHEET_COLUMNS])
})

test('the enums are identical', () => {
  assert.deepEqual(plain(script.OUTLETS), [...OUTLETS])
  assert.deepEqual(plain(script.RESTAURANT_TYPES), [...RESTAURANT_TYPES])
})

test('the limits are identical', () => {
  assert.deepEqual(plain(script.LIMITS), JSON.parse(JSON.stringify(LIMITS)))
})

test('the patterns are identical', () => {
  assert.equal(script.INDIAN_MOBILE_RE.source, INDIAN_MOBILE_RE.source)
  assert.equal(script.EMAIL_RE.source, EMAIL_RE.source)
})

/* -------------------------------------------------------------- */
/* Behaviour                                                       */
/* -------------------------------------------------------------- */

test('normalisePhone agrees on every phone fixture', () => {
  for (const { input } of PHONE_CASES) {
    assert.equal(
      script.normalisePhone(input),
      normalisePhone(input as string),
      `disagreed on ${String(input)}`,
    )
  }
})

test('validateDemoRequest returns the same field map, message for message', () => {
  for (const { label, body } of VALIDATION_CASES) {
    assert.deepEqual(
      plain(script.validateDemoRequest(body)),
      plain(validateDemoRequest(body)),
      `disagreed on: ${label}`,
    )
  }
})

test('parseDemoRequest produces the same normalised lead', () => {
  for (const { label, body } of VALIDATION_CASES) {
    assert.deepEqual(
      plain(script.parseDemoRequest(body)),
      plain(parseDemoRequest(body)),
      `disagreed on: ${label}`,
    )
  }
})

test('the honeypot verdict is the same', () => {
  for (const { body } of HONEYPOT_CASES) {
    assert.equal(
      script.isHoneypotTripped(body),
      isHoneypotTripped(body),
      `disagreed on ${JSON.stringify(body)}`,
    )
  }
})

/* -------------------------------------------------------------- */
/* …and the same through doPost, which is what actually answers    */
/* -------------------------------------------------------------- */

test('doPost reports exactly the fields the contract would have reported', () => {
  for (const { label, body, valid } of VALIDATION_CASES) {
    if (valid) continue

    const app = loadAppsScript()
    const response = app.post(body)

    assert.equal(response.error, 'validation', `${label} should be a validation failure`)
    assert.deepEqual(response.fields, plain(validateDemoRequest(body)), `disagreed on: ${label}`)
  }
})
