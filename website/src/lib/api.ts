/**
 * Book-a-demo transport.
 *
 * The endpoint is a Google Apps Script web app (see "Revision 2" in
 * `docs/website-architecture.md`). Three of its properties shape everything
 * below:
 *
 *  1. Apps Script cannot answer a CORS preflight, so the POST has to stay a
 *     CORS *simple request*: no custom headers, and a `Content-Type` from the
 *     allowed list. The body is still JSON — the script parses
 *     `e.postData.contents` itself.
 *  2. `/exec` replies with a redirect to googleusercontent.com, so the fetch
 *     must follow redirects.
 *  3. Every reply is HTTP 200, failures included. The status code carries no
 *     information; the JSON body is the contract (FOO-7):
 *     `{ ok: true, id }` or `{ ok: false, error, fields? }`.
 */

import {
  validateDemoRequest,
  type DemoRequest,
  type DemoRequestField,
} from '../../shared/contract.ts'

/**
 * What the browser sends. Turnstile is gone (Revision 2), so the token the
 * shared contract still carries is no longer collected or sent. `Omit` of a
 * key that Backend later removes stays valid, so this survives FOO-7 either way.
 */
export type DemoRequestPayload = Omit<DemoRequest, 'turnstileToken'>

export type FieldErrors = Partial<Record<DemoRequestField, string>>

/**
 * Every field the form can show an error against, in tab order — so "focus the
 * first bad field" means the topmost one, and so a server response can't make
 * us render an error against something that isn't on screen (the honeypot is
 * deliberately absent: a filled `website` comes back as `bot`, not a field error).
 */
export const DEMO_REQUEST_FIELDS: readonly DemoRequestField[] = [
  'name',
  'phone',
  'restaurantName',
  'city',
  'outlets',
  'restaurantType',
  'email',
  'preferredLanguage',
  'message',
  'consent',
]

export type SubmitResult =
  | { kind: 'ok'; id: string }
  | { kind: 'validation'; fields: FieldErrors }
  /** No endpoint in this build — the form never submits. */
  | { kind: 'not_configured' }
  | { kind: 'error'; message: string; retryable: boolean }

/** Copy for the failure modes the contract names, in the visitor's terms. */
export const MESSAGES = {
  bot: "We couldn't verify that you're human. Please refresh the page and try again.",
  rate_limited:
    "That's a few requests in a row from your connection. Please wait a minute and try again.",
  upstream:
    "Something broke on our side — your details did not reach us. Please try again, or WhatsApp us and we'll take it down manually.",
  network: "We couldn't reach the server. Check your connection and try again.",
  timeout:
    'That took too long, so we stopped waiting. Please try again — if it keeps happening, WhatsApp us.',
  unexpected: 'Something went wrong. Please try again in a moment.',
} as const

/** Apps Script can hang on a cold start; an unbounded wait is a stuck button. */
export const TIMEOUT_MS = 15_000

/**
 * The `/exec` URL, injected at build time from a GitHub Actions repository
 * variable. Empty when the site is built without one — a fresh clone, or a
 * preview put up before the CTO has deployed the script.
 */
export const DEMO_ENDPOINT: string = readEndpointFromEnv()

function readEndpointFromEnv(): string {
  try {
    const value = import.meta.env.VITE_DEMO_REQUEST_URL
    return typeof value === 'string' ? value.trim() : ''
  } catch {
    // Not a Vite build: the unit tests import this module under plain Node,
    // where `import.meta.env` does not exist.
    return ''
  }
}

export function isDemoRequestConfigured(url: string = DEMO_ENDPOINT): boolean {
  return url.length > 0
}

let warned = false

/** Dev-only nudge: in production an unset endpoint is a deploy problem, and
 *  the visitor already sees the inline "not configured" state. */
export function warnIfUnconfigured(): void {
  if (warned || isDemoRequestConfigured()) return
  warned = true
  try {
    if (!import.meta.env.DEV) return
  } catch {
    return
  }
  console.warn(
    '[demo] VITE_DEMO_REQUEST_URL is not set, so the demo form cannot submit. ' +
      'Copy .env.example to .env and point it at the Apps Script /exec URL.',
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Keep only messages for fields the form actually renders, and keep them
 *  short — this text goes straight onto the page. */
function pickFieldErrors(source: unknown): FieldErrors {
  const fields: FieldErrors = {}
  if (!isRecord(source)) return fields
  for (const field of DEMO_REQUEST_FIELDS) {
    const message = source[field]
    if (typeof message === 'string' && message.trim()) {
      fields[field] = message.trim().slice(0, 300)
    }
  }
  return fields
}

/**
 * Client-side validation, against the same rules the Apps Script runs — so a
 * typo is caught before a round trip, and the server stays the authority.
 * Filtered to the fields the form renders, so neither side can hand us an
 * error with nowhere to put it.
 */
export function validateDemoForm(payload: DemoRequestPayload): FieldErrors {
  return pickFieldErrors(validateDemoRequest(payload))
}

/**
 * Map an Apps Script reply onto something the form can render.
 *
 * Exported for the tests, and because the mapping — not the HTTP status — is
 * the actual API contract here. The older `{ id }` / `{ error, fields }` shape
 * from the Pages Function is still accepted, so a half-migrated deploy
 * degrades to the right message rather than to "something went wrong".
 */
export function mapResponseBody(body: unknown, httpOk = true): SubmitResult {
  if (!isRecord(body)) {
    // An HTML sign-in page (web app deployed as "Only myself") lands here.
    return { kind: 'error', message: MESSAGES.unexpected, retryable: false }
  }

  if (body.ok !== false && typeof body.id === 'string' && body.id) {
    return { kind: 'ok', id: body.id }
  }
  if (body.ok === true) {
    // Accepted, but the script did not give us a reference to show.
    return { kind: 'ok', id: '' }
  }

  switch (body.error) {
    case 'validation': {
      const fields = pickFieldErrors(body.fields)
      return Object.keys(fields).length > 0
        ? { kind: 'validation', fields }
        : { kind: 'error', message: MESSAGES.unexpected, retryable: false }
    }
    case 'bot':
      return { kind: 'error', message: MESSAGES.bot, retryable: false }
    case 'rate_limited':
      return { kind: 'error', message: MESSAGES.rate_limited, retryable: true }
    case 'upstream':
      return { kind: 'error', message: MESSAGES.upstream, retryable: true }
    default:
      return {
        kind: 'error',
        message: MESSAGES.unexpected,
        // A non-200 with no recognised error code is more likely a bad URL
        // than a blip, so don't invite a retry.
        retryable: httpOk,
      }
  }
}

export interface SubmitOptions {
  /** Aborts the request when the modal closes. */
  signal?: AbortSignal
  /** Overridden by the tests; defaults to the build-time endpoint. */
  url?: string
  timeoutMs?: number
}

export async function submitDemoRequest(
  payload: DemoRequestPayload,
  options: SubmitOptions = {},
): Promise<SubmitResult> {
  const url = options.url ?? DEMO_ENDPOINT
  if (!isDemoRequestConfigured(url)) return { kind: 'not_configured' }

  // One controller for both reasons we might stop: our own timeout and the
  // caller closing the modal. `timedOut` is what tells the two apart.
  const controller = new AbortController()
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, options.timeoutMs ?? TIMEOUT_MS)
  const abortFromCaller = () => controller.abort()
  options.signal?.addEventListener('abort', abortFromCaller)

  try {
    let response: Response
    try {
      response = await fetch(url, {
        method: 'POST',
        // Exactly one header, with a value CORS allows without a preflight.
        // Any other header here — including an Accept or an X-* — would make
        // the browser send an OPTIONS that Apps Script cannot answer.
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload),
        // /exec answers with a 302 to googleusercontent.com.
        redirect: 'follow',
        signal: controller.signal,
      })
    } catch {
      return timedOut
        ? { kind: 'error', message: MESSAGES.timeout, retryable: true }
        : { kind: 'error', message: MESSAGES.network, retryable: true }
    }

    let body: unknown
    try {
      body = await response.json()
    } catch {
      // Non-JSON: an Apps Script error page, or an aborted body read.
      return timedOut
        ? { kind: 'error', message: MESSAGES.timeout, retryable: true }
        : { kind: 'error', message: MESSAGES.unexpected, retryable: false }
    }

    return mapResponseBody(body, response.ok)
  } finally {
    clearTimeout(timer)
    options.signal?.removeEventListener('abort', abortFromCaller)
  }
}
