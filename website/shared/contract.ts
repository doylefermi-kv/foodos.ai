/**
 * The demo-request contract: what the browser sends, and what comes back.
 *
 * Owned by Backend (FOO-2), imported by Frontend. Source of truth is
 * `docs/website-architecture.md` — change that first, then this file.
 *
 * Since Revision 2 (no Cloudflare) the server is a Google Apps Script web app
 * bound to the leads Sheet; its source is `apps-script/Code.gs` and it carries
 * a hand-port of the validation below. The two are held together by
 * `apps-script/tests/parity.test.ts`, which runs both over one set of fixtures:
 * edit the rules here and that test fails until the port catches up.
 *
 * Zero dependencies on purpose: this module is imported by the React bundle
 * (Vite) and read line-by-line by whoever maintains the Apps Script port, so it
 * must stay runtime-agnostic — no Node built-ins, no validation library.
 */

/* ------------------------------------------------------------------ */
/* Request                                                             */
/* ------------------------------------------------------------------ */

export const OUTLETS = ['1', '2-5', '6-20', '20+'] as const
export type Outlets = (typeof OUTLETS)[number]

export const RESTAURANT_TYPES = [
  'qsr',
  'cafe',
  'cloud_kitchen',
  'casual_dining',
  'fine_dining',
  'bar',
  'other',
] as const
export type RestaurantType = (typeof RESTAURANT_TYPES)[number]

/** Aliases — both spellings are supported so neither side has to churn. */
export const OUTLETS_OPTIONS = OUTLETS
export const RESTAURANT_TYPE_OPTIONS = RESTAURANT_TYPES

export interface Attribution {
  utmSource?: string
  utmMedium?: string
  utmCampaign?: string
  utmTerm?: string
  utmContent?: string
  referrer?: string
  landingPath?: string
}

export interface DemoRequest {
  /** 2–80 chars */
  name: string
  /** Indian mobile, normalised to +91XXXXXXXXXX */
  phone: string
  email?: string
  /** 2–120 chars */
  restaurantName: string
  city: string
  outlets: Outlets
  restaurantType?: RestaurantType
  /** ISO-ish language code, e.g. "en", "hi", "ml", "ta", "te" */
  preferredLanguage?: string
  /** max 1000 chars */
  message?: string
  /** must be true */
  consent: true
  attribution: Attribution
  /**
   * The browser's own user agent, for the `userAgent` sheet column. Apps Script
   * never sees request headers, so unlike the old Pages Function the server
   * cannot read this itself — if the form doesn't send it, the column is empty.
   */
  userAgent?: string
  /**
   * @deprecated Turnstile was dropped in Revision 2 of the architecture doc.
   * Still accepted (and ignored) by the server so a cached old bundle keeps
   * working; delete it from the form whenever the Frontend next touches it.
   */
  turnstileToken?: string
  /** honeypot — must be empty */
  website?: string
}

export type DemoRequestField = keyof Omit<DemoRequest, 'attribution'>

/**
 * A request that has passed validation: `phone` is in +91XXXXXXXXXX form,
 * blank optional fields are `undefined` (not `''`), and `attribution` is
 * sanitised. This is what the sinks receive.
 */
export interface ValidatedDemoRequest extends DemoRequest {
  attribution: Attribution
}

/* ------------------------------------------------------------------ */
/* Responses                                                           */
/* ------------------------------------------------------------------ */

export type DemoRequestErrorCode = 'validation' | 'bot' | 'rate_limited' | 'upstream'

/**
 * What the Apps Script web app returns.
 *
 * READ THIS BEFORE WIRING THE FORM: an Apps Script web app answers HTTP 200 to
 * everything, including its own crashes, so `response.status` tells you nothing.
 * Branch on `ok` in the body instead. The old status codes map like this:
 *
 * | body                                    | was | show the visitor            |
 * |-----------------------------------------|-----|-----------------------------|
 * | `{ ok: true, id }`                      | 201 | the success state           |
 * | `{ ok: false, error: 'validation', … }` | 400 | `fields`, inline            |
 * | `{ ok: false, error: 'bot' }`           | 403 | generic "could not verify"  |
 * | `{ ok: false, error: 'rate_limited' }`  | 429 | "wait a minute and retry"   |
 * | `{ ok: false, error: 'upstream' }`      | 502 | "try again / WhatsApp us"   |
 */
export interface DemoRequestOk {
  ok: true
  id: string
}

export interface DemoRequestFailure {
  ok: false
  error: DemoRequestErrorCode
  /** Present only when `error` is `validation`. */
  fields?: Partial<Record<DemoRequestField, string>>
}

export type DemoResponseBody = DemoRequestOk | DemoRequestFailure

/* --- The Cloudflare-era response shapes. ----------------------------
 * Still exported so `src/lib/api.ts` keeps compiling until the Frontend
 * switches it to `readDemoResponse`; nothing serves them any more. */

/** @deprecated status codes are gone — see `DemoRequestOk`. */
export interface DemoRequestCreated {
  id: string
}

/** @deprecated see `DemoRequestFailure`. */
export interface DemoRequestValidationError {
  error: 'validation'
  fields: Partial<Record<DemoRequestField, string>>
}

/** @deprecated see `DemoRequestFailure`. */
export interface DemoRequestError {
  error: 'bot' | 'rate_limited' | 'upstream'
}

/** @deprecated see `DemoResponseBody`. */
export type DemoRequestResponse =
  | DemoRequestCreated
  | DemoRequestValidationError
  | DemoRequestError

/** @deprecated aliases for the same shapes. */
export type ValidationErrorResponse = DemoRequestValidationError
/** @deprecated aliases for the same shapes. */
export type SimpleErrorResponse = DemoRequestError

/**
 * @deprecated There is no same-origin API any more. The endpoint is the Apps
 * Script `/exec` URL, injected at build time as `VITE_DEMO_REQUEST_URL`.
 */
export const DEMO_REQUEST_ENDPOINT = '/api/demo-requests'

/* ------------------------------------------------------------------ */
/* Limits                                                              */
/* ------------------------------------------------------------------ */

export const LIMITS = {
  name: { min: 2, max: 80 },
  restaurantName: { min: 2, max: 120 },
  city: { min: 2, max: 80 },
  email: { max: 160 },
  message: { max: 1000 },
  preferredLanguage: { max: 10 },
  /** Attribution values longer than this are truncated, never rejected. */
  attributionValue: { max: 500 },
  /** Same treatment for the browser-supplied user agent. */
  userAgent: { max: 500 },
} as const

/* ------------------------------------------------------------------ */
/* Validation                                                          */
/* ------------------------------------------------------------------ */

/**
 * Indian mobile numbers: 10 digits starting 6–9, optionally prefixed with
 * +91 / 91 / 0. Shared so the client and the function agree on what they accept.
 */
export const INDIAN_MOBILE_RE = /^(?:\+?91[\s-]?|0)?([6-9]\d{9})$/

/** Deliberately permissive — the real check is that a human reads the reply. */
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

/** Coerce unknown input to a string. The function receives untrusted JSON, so
 * a non-string `name` must validate-and-fail, never throw. */
function str(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

/** Returns +91XXXXXXXXXX, or null if the input is not an Indian mobile. */
export function normalisePhone(raw: string): string | null {
  // Strip formatting, then the 00-international prefix the regex doesn't cover.
  const cleaned = str(raw).replace(/[\s()-]/g, '').replace(/^00/, '+')
  const match = INDIAN_MOBILE_RE.exec(cleaned)
  return match ? `+91${match[1]}` : null
}

/** US-spelling alias. */
export const normalizePhone = normalisePhone

export function isValidEmail(value: string): boolean {
  return EMAIL_RE.test(str(value)) && value.length <= LIMITS.email.max
}

/**
 * Field-level validation shared by the form and the function.
 * Returns a map of field -> message; empty means valid.
 *
 * Note: the honeypot (`website`) is NOT checked here. A filled honeypot is a
 * bot signal handled by the function (403), not a validation error a human
 * should ever see.
 */
export function validateDemoRequest(
  input: Partial<DemoRequest> | unknown,
): Partial<Record<DemoRequestField, string>> {
  const fields: Partial<Record<DemoRequestField, string>> = {}

  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return { name: 'Expected a JSON object.' }
  }
  const body = input as Record<string, unknown>

  const name = str(body.name).trim()
  if (name.length < LIMITS.name.min || name.length > LIMITS.name.max) {
    fields.name = `Please enter your name (${LIMITS.name.min}–${LIMITS.name.max} characters).`
  }

  if (!normalisePhone(str(body.phone))) {
    fields.phone = 'Enter a 10-digit Indian mobile number, e.g. 98765 43210.'
  }

  const email = str(body.email).trim()
  if (email && !isValidEmail(email)) {
    fields.email = 'That email address does not look right.'
  }

  const restaurantName = str(body.restaurantName).trim()
  if (
    restaurantName.length < LIMITS.restaurantName.min ||
    restaurantName.length > LIMITS.restaurantName.max
  ) {
    fields.restaurantName = `Please enter your restaurant's name (${LIMITS.restaurantName.min}–${LIMITS.restaurantName.max} characters).`
  }

  const city = str(body.city).trim()
  if (city.length < LIMITS.city.min || city.length > LIMITS.city.max) {
    fields.city = 'Please enter your city.'
  }

  const outlets = str(body.outlets).trim()
  if (!outlets || !(OUTLETS as readonly string[]).includes(outlets)) {
    fields.outlets = 'Please choose how many outlets you run.'
  }

  const restaurantType = str(body.restaurantType).trim()
  if (restaurantType && !(RESTAURANT_TYPES as readonly string[]).includes(restaurantType)) {
    fields.restaurantType = 'Please choose a valid restaurant type.'
  }

  if (str(body.preferredLanguage).trim().length > LIMITS.preferredLanguage.max) {
    fields.preferredLanguage = 'Unsupported language code.'
  }

  if (str(body.message).length > LIMITS.message.max) {
    fields.message = `Please keep this under ${LIMITS.message.max} characters.`
  }

  if (body.consent !== true) {
    fields.consent = 'Please agree to be contacted so we can call you back.'
  }

  // No Turnstile check: Turnstile was dropped in Revision 2. `turnstileToken`
  // is accepted and ignored so a cached old bundle keeps working.

  return fields
}

export type ParseResult =
  | { ok: true; value: ValidatedDemoRequest }
  | { ok: false; fields: Partial<Record<DemoRequestField, string>> }

/** Trimmed value, or undefined when blank — so optional fields stay absent. */
function optional(value: unknown): string | undefined {
  const trimmed = str(value).trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function sanitiseAttribution(input: unknown): Attribution {
  const out: Attribution = {}
  if (typeof input !== 'object' || input === null) return out
  const src = input as Record<string, unknown>
  const keys: (keyof Attribution)[] = [
    'utmSource',
    'utmMedium',
    'utmCampaign',
    'utmTerm',
    'utmContent',
    'referrer',
    'landingPath',
  ]
  for (const key of keys) {
    const value = optional(src[key])
    // Attribution is untrusted decoration, never a reason to reject a lead:
    // over-long values are truncated rather than erroring the whole request.
    if (value !== undefined) out[key] = value.slice(0, LIMITS.attributionValue.max)
  }
  return out
}

/**
 * Server-side entry point: validate *and* normalise untrusted JSON.
 * The frontend can keep using `validateDemoRequest` for inline errors.
 */
export function parseDemoRequest(input: unknown): ParseResult {
  const fields = validateDemoRequest(input)
  if (Object.keys(fields).length > 0) return { ok: false, fields }

  const body = input as Record<string, unknown>
  const userAgent = optional(body.userAgent)

  return {
    ok: true,
    value: {
      name: str(body.name).trim(),
      phone: normalisePhone(str(body.phone))!,
      email: optional(body.email),
      restaurantName: str(body.restaurantName).trim(),
      city: str(body.city).trim(),
      outlets: str(body.outlets).trim() as Outlets,
      restaurantType: optional(body.restaurantType) as RestaurantType | undefined,
      preferredLanguage: optional(body.preferredLanguage),
      message: optional(body.message),
      consent: true,
      attribution: sanitiseAttribution(body.attribution),
      userAgent: userAgent?.slice(0, LIMITS.userAgent.max),
    },
  }
}

/** `true` when the honeypot field was filled — i.e. the submitter is a bot. */
export function isHoneypotTripped(input: unknown): boolean {
  if (typeof input !== 'object' || input === null) return false
  const website = (input as Record<string, unknown>).website
  return typeof website === 'string' && website.trim().length > 0
}

/* ------------------------------------------------------------------ */
/* Sheet row                                                           */
/* ------------------------------------------------------------------ */

/** Column order is fixed by the architecture doc. Append only — never reorder. */
export const SHEET_COLUMNS = [
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
] as const
