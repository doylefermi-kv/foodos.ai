/**
 * The payloads both validators are judged against.
 *
 * One list, used by `validation.test.js` (the Apps Script port on its own) and
 * by `parity.test.ts` (the port against `website/shared/contract.ts`). Adding a
 * case here tightens both at once — which is the point: the two
 * implementations can only drift if someone edits this file to let them.
 */

export function validBody(overrides = {}) {
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
    attribution: {
      utmSource: 'google',
      utmMedium: 'cpc',
      utmCampaign: 'kerala-launch',
      utmTerm: 'restaurant pos',
      utmContent: 'ad-a',
      referrer: 'https://www.google.com/',
      landingPath: '/?utm_source=google',
    },
    userAgent: 'Mozilla/5.0 (test)',
    website: '',
    ...overrides,
  }
}

export const MINIMAL_BODY = {
  name: 'Ravi',
  phone: '9876543210',
  restaurantName: 'Dosa Corner',
  city: 'Chennai',
  outlets: '1',
  consent: true,
  attribution: {},
}

/** The phone formats Indian visitors actually type, and their +91 form. */
export const PHONE_CASES = [
  { input: '9876543210', expected: '+919876543210' },
  { input: '98765 43210', expected: '+919876543210' },
  { input: '+919876543210', expected: '+919876543210' },
  { input: '+91 98765 43210', expected: '+919876543210' },
  { input: '+91-98765-43210', expected: '+919876543210' },
  { input: '91 9876543210', expected: '+919876543210' },
  { input: '09876543210', expected: '+919876543210' },
  { input: '0091 98765 43210', expected: '+919876543210' },
  { input: '(987) 654-3210', expected: '+919876543210' },
  { input: '  098765 43210 ', expected: '+919876543210' },
  // Rejected: landline-style, wrong country, wrong length, junk.
  { input: '1234567890', expected: null },
  { input: '5876543210', expected: null },
  { input: '987654321', expected: null },
  { input: '98765432101', expected: null },
  { input: '+1 415 555 0123', expected: null },
  { input: 'not a phone', expected: null },
  { input: '', expected: null },
  { input: undefined, expected: null },
  { input: 12345, expected: null },
  { input: { a: 1 }, expected: null },
]

const LONG_ATTRIBUTION = 'x'.repeat(600)

/**
 * `body` is fed to both validators verbatim. `valid` documents the expectation
 * so a case cannot silently become a no-op; `fields` lists the keys that must
 * be reported when it is invalid.
 */
export const VALIDATION_CASES = [
  { label: 'complete request', body: validBody(), valid: true },
  { label: 'minimal request', body: MINIMAL_BODY, valid: true },
  {
    label: 'legacy bundle still sending a turnstile token',
    body: validBody({ turnstileToken: 'tok' }),
    valid: true,
  },
  {
    label: 'no turnstile token (Turnstile was dropped)',
    body: validBody({ turnstileToken: undefined }),
    valid: true,
  },
  { label: 'empty object', body: {}, valid: false, fields: ['name', 'phone', 'restaurantName', 'city', 'outlets', 'consent'] },
  { label: 'null', body: null, valid: false, fields: ['name'] },
  { label: 'a bare string', body: 'a string', valid: false, fields: ['name'] },
  { label: 'an array', body: [], valid: false, fields: ['name'] },
  {
    label: 'hostile value types',
    body: { name: 42, phone: { a: 1 }, city: [], outlets: null, consent: 'yes' },
    valid: false,
    fields: ['name', 'phone', 'city', 'outlets', 'consent'],
  },

  // Boundaries — inclusive on both ends.
  { label: 'name at min length', body: validBody({ name: 'Jo' }), valid: true },
  { label: 'name one below min', body: validBody({ name: 'J' }), valid: false, fields: ['name'] },
  { label: 'name at max length', body: validBody({ name: 'a'.repeat(80) }), valid: true },
  {
    label: 'name one over max',
    body: validBody({ name: 'a'.repeat(81) }),
    valid: false,
    fields: ['name'],
  },
  { label: 'restaurantName at min', body: validBody({ restaurantName: 'Ka' }), valid: true },
  {
    label: 'restaurantName one over max',
    body: validBody({ restaurantName: 'b'.repeat(121) }),
    valid: false,
    fields: ['restaurantName'],
  },
  { label: 'message at max', body: validBody({ message: 'c'.repeat(1000) }), valid: true },
  {
    label: 'message one over max',
    body: validBody({ message: 'c'.repeat(1001) }),
    valid: false,
    fields: ['message'],
  },
  { label: 'city one below min', body: validBody({ city: 'K' }), valid: false, fields: ['city'] },
  {
    label: 'preferredLanguage too long',
    body: validBody({ preferredLanguage: 'en-GB-oxendict' }),
    valid: false,
    fields: ['preferredLanguage'],
  },

  // Consent must be literally true.
  { label: 'consent false', body: validBody({ consent: false }), valid: false, fields: ['consent'] },
  {
    label: 'consent as the string "true"',
    body: validBody({ consent: 'true' }),
    valid: false,
    fields: ['consent'],
  },
  { label: 'consent as 1', body: validBody({ consent: 1 }), valid: false, fields: ['consent'] },
  {
    label: 'consent missing',
    body: validBody({ consent: undefined }),
    valid: false,
    fields: ['consent'],
  },

  // Email is optional, but must look like an email when present.
  { label: 'email absent', body: validBody({ email: undefined }), valid: true },
  { label: 'email blank', body: validBody({ email: '   ' }), valid: true },
  { label: 'email without a tld', body: validBody({ email: 'a@b' }), valid: false, fields: ['email'] },
  { label: 'email with a space', body: validBody({ email: 'a @b.in' }), valid: false, fields: ['email'] },
  { label: 'email with no local part', body: validBody({ email: '@spicegarden.in' }), valid: false, fields: ['email'] },
  { label: 'email that is not an email', body: validBody({ email: 'nope' }), valid: false, fields: ['email'] },
  {
    label: 'email over the length limit',
    body: validBody({ email: `${'a'.repeat(160)}@spicegarden.in` }),
    valid: false,
    fields: ['email'],
  },

  // Enums.
  { label: 'outlets outside the enum', body: validBody({ outlets: '3' }), valid: false, fields: ['outlets'] },
  {
    label: 'restaurantType outside the enum',
    body: validBody({ restaurantType: 'food_truck' }),
    valid: false,
    fields: ['restaurantType'],
  },
  { label: 'restaurantType blank', body: validBody({ restaurantType: '' }), valid: true },
  { label: 'outlets 20+', body: validBody({ outlets: '20+' }), valid: true },

  // Phones, through the full validator rather than just normalisePhone.
  { label: 'phone with a 0 prefix', body: validBody({ phone: '09876543210' }), valid: true },
  { label: 'phone too short', body: validBody({ phone: '12345' }), valid: false, fields: ['phone'] },

  // Whitespace and optional-field handling.
  {
    label: 'padded values',
    body: validBody({ name: '  Anjali Menon  ', email: '   ', message: '', restaurantType: '' }),
    valid: true,
  },

  // Attribution is decoration: junk and overlong values never fail a lead.
  { label: 'attribution absent', body: validBody({ attribution: undefined }), valid: true },
  { label: 'attribution null', body: validBody({ attribution: null }), valid: true },
  { label: 'attribution not an object', body: validBody({ attribution: 'nope' }), valid: true },
  { label: 'attribution numeric', body: validBody({ attribution: 42 }), valid: true },
  {
    label: 'attribution with unknown keys and an overlong value',
    body: validBody({ attribution: { utmSource: 'google', utmCampaign: LONG_ATTRIBUTION, evil: 'dropped' } }),
    valid: true,
  },

  // The honeypot is never a validation error — it is handled separately.
  { label: 'honeypot filled', body: validBody({ website: 'http://spam.example' }), valid: true },
]

/** Honeypot verdicts, kept with the rest so both sides are checked on them. */
export const HONEYPOT_CASES = [
  { body: validBody({ website: 'http://spam.example' }), tripped: true },
  { body: validBody({ website: 'x' }), tripped: true },
  { body: validBody({ website: '' }), tripped: false },
  { body: validBody({ website: '   ' }), tripped: false },
  { body: validBody({ website: undefined }), tripped: false },
  { body: validBody({ website: 42 }), tripped: false },
  { body: {}, tripped: false },
  { body: null, tripped: false },
  { body: 'a string', tripped: false },
]
