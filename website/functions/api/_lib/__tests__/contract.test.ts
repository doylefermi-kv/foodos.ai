/**
 * Validation, phone normalisation and the honeypot.
 * Run with: node --test "website/functions/api/_lib/__tests__/*.test.ts"
 */

import test from 'node:test'
import assert from 'node:assert/strict'

import {
  LIMITS,
  isHoneypotTripped,
  normalisePhone,
  parseDemoRequest,
  validateDemoRequest,
} from '../../../../shared/contract.ts'

function validBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    name: 'Anjali Menon',
    phone: '98765 43210',
    email: 'anjali@spicegarden.in',
    restaurantName: 'Spice Garden',
    city: 'Kochi',
    outlets: '2-5',
    restaurantType: 'casual_dining',
    preferredLanguage: 'ml',
    message: 'Looking to switch from our current POS.',
    consent: true,
    attribution: { utmSource: 'google', utmMedium: 'cpc', landingPath: '/' },
    turnstileToken: 'test-token',
    website: '',
    ...overrides,
  }
}

/* -------------------------------------------------------------- */
/* Phone normalisation                                             */
/* -------------------------------------------------------------- */

test('normalisePhone accepts the formats Indian users actually type', () => {
  const expected = '+919876543210'
  for (const input of [
    '9876543210',
    '98765 43210',
    '+919876543210',
    '+91 98765 43210',
    '+91-98765-43210',
    '91 9876543210',
    '09876543210',
    '0091 98765 43210',
    '(987) 654-3210',
  ]) {
    assert.equal(normalisePhone(input), expected, `failed for ${input}`)
  }
})

test('normalisePhone rejects non-mobile and malformed numbers', () => {
  for (const input of [
    '1234567890', // landline-style, does not start 6-9
    '5876543210', // starts with 5
    '987654321', // 9 digits
    '98765432101', // 11 digits
    '+1 415 555 0123', // not India
    'not a phone',
    '',
  ]) {
    assert.equal(normalisePhone(input), null, `should reject ${input}`)
  }
})

test('normalisePhone does not throw on non-string input', () => {
  assert.equal(normalisePhone(undefined as unknown as string), null)
  assert.equal(normalisePhone(12345 as unknown as string), null)
})

/* -------------------------------------------------------------- */
/* Validation                                                      */
/* -------------------------------------------------------------- */

test('a complete, well-formed request validates', () => {
  assert.deepEqual(validateDemoRequest(validBody()), {})
})

test('a minimal request (only required fields) validates', () => {
  const minimal = {
    name: 'Ravi',
    phone: '9876543210',
    restaurantName: 'Dosa Corner',
    city: 'Chennai',
    outlets: '1',
    consent: true,
    attribution: {},
    turnstileToken: 't',
  }
  assert.deepEqual(validateDemoRequest(minimal), {})
})

test('each required field is reported by name when missing', () => {
  const fields = validateDemoRequest({})
  for (const key of [
    'name',
    'phone',
    'restaurantName',
    'city',
    'outlets',
    'consent',
    'turnstileToken',
  ]) {
    assert.ok(fields[key as keyof typeof fields], `expected an error for ${key}`)
  }
})

test('field-length boundaries are inclusive', () => {
  const atMin = validateDemoRequest(validBody({ name: 'Jo', restaurantName: 'Ka' }))
  assert.deepEqual(atMin, {})

  const atMax = validateDemoRequest(
    validBody({
      name: 'a'.repeat(LIMITS.name.max),
      restaurantName: 'b'.repeat(LIMITS.restaurantName.max),
      message: 'c'.repeat(LIMITS.message.max),
    }),
  )
  assert.deepEqual(atMax, {})

  const tooShort = validateDemoRequest(validBody({ name: 'J' }))
  assert.ok(tooShort.name)

  const tooLong = validateDemoRequest(
    validBody({
      name: 'a'.repeat(LIMITS.name.max + 1),
      message: 'c'.repeat(LIMITS.message.max + 1),
    }),
  )
  assert.ok(tooLong.name)
  assert.ok(tooLong.message)
})

test('consent must be literally true', () => {
  for (const consent of [false, 'true', 1, undefined, null]) {
    assert.ok(validateDemoRequest(validBody({ consent })).consent, `consent=${String(consent)}`)
  }
})

test('email is optional but must be valid when present', () => {
  assert.deepEqual(validateDemoRequest(validBody({ email: undefined })), {})
  assert.deepEqual(validateDemoRequest(validBody({ email: '  ' })), {})
  for (const email of ['nope', 'a@b', 'a @b.in', '@spicegarden.in']) {
    assert.ok(validateDemoRequest(validBody({ email })).email, `should reject ${email}`)
  }
})

test('enum fields reject values outside the contract', () => {
  assert.ok(validateDemoRequest(validBody({ outlets: '3' })).outlets)
  assert.ok(validateDemoRequest(validBody({ restaurantType: 'food_truck' })).restaurantType)
})

test('hostile input types fail validation instead of throwing', () => {
  assert.doesNotThrow(() => validateDemoRequest({ name: 42, phone: { a: 1 }, city: [] }))
  assert.ok(validateDemoRequest({ name: 42 }).name)
  assert.ok(validateDemoRequest(null).name)
  assert.ok(validateDemoRequest('a string').name)
  assert.ok(validateDemoRequest([]).name)
})

/* -------------------------------------------------------------- */
/* parseDemoRequest — validation plus normalisation                */
/* -------------------------------------------------------------- */

test('parseDemoRequest normalises the phone to +91 form', () => {
  const result = parseDemoRequest(validBody({ phone: '  098765 43210 ' }))
  assert.ok(result.ok)
  assert.equal(result.value.phone, '+919876543210')
})

test('parseDemoRequest trims text and drops blank optionals', () => {
  const result = parseDemoRequest(
    validBody({ name: '  Anjali Menon  ', email: '   ', message: '', restaurantType: '' }),
  )
  assert.ok(result.ok)
  assert.equal(result.value.name, 'Anjali Menon')
  assert.equal(result.value.email, undefined)
  assert.equal(result.value.message, undefined)
  assert.equal(result.value.restaurantType, undefined)
})

test('parseDemoRequest keeps only known attribution keys and truncates long ones', () => {
  const result = parseDemoRequest(
    validBody({
      attribution: {
        utmSource: 'google',
        utmCampaign: 'x'.repeat(LIMITS.attributionValue.max + 50),
        evil: 'dropped',
      },
    }),
  )
  assert.ok(result.ok)
  assert.equal(result.value.attribution.utmSource, 'google')
  assert.equal(result.value.attribution.utmCampaign?.length, LIMITS.attributionValue.max)
  assert.ok(!('evil' in result.value.attribution))
})

test('attribution being absent or junk never fails a lead', () => {
  for (const attribution of [undefined, null, 'nope', 42]) {
    const result = parseDemoRequest(validBody({ attribution }))
    assert.ok(result.ok, `attribution=${String(attribution)} should still parse`)
    assert.deepEqual(result.value.attribution, {})
  }
})

test('parseDemoRequest returns the field map on failure', () => {
  const result = parseDemoRequest(validBody({ phone: '12345' }))
  assert.ok(!result.ok)
  assert.ok(result.fields.phone)
})

/* -------------------------------------------------------------- */
/* Honeypot                                                        */
/* -------------------------------------------------------------- */

test('honeypot trips only when the hidden field has content', () => {
  assert.equal(isHoneypotTripped(validBody({ website: 'http://spam.example' })), true)
  assert.equal(isHoneypotTripped(validBody({ website: 'x' })), true)

  assert.equal(isHoneypotTripped(validBody({ website: '' })), false)
  assert.equal(isHoneypotTripped(validBody({ website: '   ' })), false)
  assert.equal(isHoneypotTripped(validBody({ website: undefined })), false)
  assert.equal(isHoneypotTripped({}), false)
  assert.equal(isHoneypotTripped(null), false)
})

test('a filled honeypot is not reported as a validation error', () => {
  // The bot must get a flat 403, never a hint about which field gave it away.
  const fields = validateDemoRequest(validBody({ website: 'http://spam.example' }))
  assert.deepEqual(fields, {})
})
