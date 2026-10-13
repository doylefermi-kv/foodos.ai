/**
 * POST /api/demo-requests — request/response contract.
 *
 * Owned by Backend (FOO-2), imported by Frontend. Source of truth is
 * `docs/website-architecture.md` — change that first, then this file.
 *
 * This is the Backend version that replaces the Frontend's parallel stub. It
 * keeps every export name the stub published (`OUTLETS`, `RESTAURANT_TYPES`,
 * `normalisePhone`, `validateDemoRequest`, `INDIAN_MOBILE_RE`, `EMAIL_RE`,
 * `LIMITS`, the response types) with the same signatures and the same message
 * strings, so the form needs no change. What's new is additive: `parseDemoRequest`
 * (validate *and* normalise, for the server), `isHoneypotTripped`, `SHEET_COLUMNS`,
 * and US-spelling aliases.
 *
 * Zero dependencies on purpose: this module is imported by the React bundle
 * (Vite) *and* by the Pages Function (Workers runtime), so it must stay
 * runtime-agnostic — no Node built-ins, no validation library.
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
  turnstileToken: string
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

/** 201 */
export interface DemoRequestCreated {
  id: string
}

/** 400 */
export interface DemoRequestValidationError {
  error: 'validation'
  fields: Partial<Record<DemoRequestField, string>>
}

/** 403 | 429 | 502 */
export interface DemoRequestError {
  error: 'bot' | 'rate_limited' | 'upstream'
}

export type DemoRequestResponse =
  | DemoRequestCreated
  | DemoRequestValidationError
  | DemoRequestError

export type DemoRequestErrorCode = 'validation' | 'bot' | 'rate_limited' | 'upstream'

/** Aliases for the same shapes. */
export type ValidationErrorResponse = DemoRequestValidationError
export type SimpleErrorResponse = DemoRequestError

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

  // Presence only; the real verification happens server-side against Turnstile.
  if (!str(body.turnstileToken).trim()) {
    fields.turnstileToken = 'Please complete the spam check.'
  }

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
      turnstileToken: str(body.turnstileToken).trim(),
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
