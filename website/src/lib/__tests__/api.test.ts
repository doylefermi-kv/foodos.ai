/**
 * The Apps Script reply mapping, the not-configured state, and the request
 * shape the CORS "simple request" rule forces on us.
 *
 * Run with: node --test "website/src/lib/__tests__/*.test.ts"
 */

import test from 'node:test'
import assert from 'node:assert/strict'

import {
  MESSAGES,
  isDemoRequestConfigured,
  mapResponseBody,
  submitDemoRequest,
  validateDemoForm,
  type DemoRequestPayload,
} from '../api.ts'

const URL_UNDER_TEST = 'https://script.google.com/macros/s/AKfy/exec'

function payload(overrides: Partial<DemoRequestPayload> = {}): DemoRequestPayload {
  return {
    name: 'Anjali Menon',
    phone: '+919876543210',
    email: 'anjali@spicegarden.in',
    restaurantName: 'Spice Garden',
    city: 'Kochi',
    outlets: '2-5',
    restaurantType: 'casual_dining',
    preferredLanguage: 'ml',
    message: 'Switching from our current POS.',
    consent: true,
    attribution: { utmSource: 'google', landingPath: '/' },
    website: '',
    ...overrides,
  }
}

/** Stands in for the deployed script: always HTTP 200, body carries the verdict. */
function appsScriptReply(body: unknown, status = 200): typeof fetch {
  return (async () =>
    new Response(typeof body === 'string' ? body : JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    })) as unknown as typeof fetch
}

function withFetch<T>(impl: typeof fetch, run: () => Promise<T>): Promise<T> {
  const original = globalThis.fetch
  globalThis.fetch = impl
  return run().finally(() => {
    globalThis.fetch = original
  })
}

/* ------------------------------------------------------------------ */
/* Response mapping                                                    */
/* ------------------------------------------------------------------ */

test('a success body maps to ok with the reference id', () => {
  assert.deepEqual(mapResponseBody({ ok: true, id: 'LEAD-123' }), {
    kind: 'ok',
    id: 'LEAD-123',
  })
})

test('a success body without an id is still a success', () => {
  assert.deepEqual(mapResponseBody({ ok: true }), { kind: 'ok', id: '' })
})

test('the old Pages Function shape ({ id }) is still accepted', () => {
  // A half-migrated deploy should book the demo, not show an error.
  assert.deepEqual(mapResponseBody({ id: 'LEAD-9' }), { kind: 'ok', id: 'LEAD-9' })
})

test('a validation body maps to inline field errors', () => {
  const result = mapResponseBody({
    ok: false,
    error: 'validation',
    fields: { phone: 'Enter a 10-digit Indian mobile number.' },
  })
  assert.deepEqual(result, {
    kind: 'validation',
    fields: { phone: 'Enter a 10-digit Indian mobile number.' },
  })
})

test('validation errors for fields the form does not render are dropped', () => {
  const result = mapResponseBody({
    ok: false,
    error: 'validation',
    // `website` is the honeypot — it has no visible input to attach an error
    // to, and `nope` is not a field at all.
    fields: { website: 'bot', nope: 'x', city: 'Which city?' },
  })
  assert.deepEqual(result, { kind: 'validation', fields: { city: 'Which city?' } })
})

test('a validation body with no usable fields falls back to a generic error', () => {
  const result = mapResponseBody({ ok: false, error: 'validation', fields: {} })
  assert.equal(result.kind, 'error')
  assert.equal(result.kind === 'error' && result.message, MESSAGES.unexpected)
})

test('bot, rate_limited and upstream keep their own copy', () => {
  for (const [error, message] of [
    ['bot', MESSAGES.bot],
    ['rate_limited', MESSAGES.rate_limited],
    ['upstream', MESSAGES.upstream],
  ] as const) {
    const result = mapResponseBody({ ok: false, error })
    assert.equal(result.kind, 'error')
    assert.equal(result.kind === 'error' && result.message, message)
  }
})

test('only rate_limited and upstream invite a retry', () => {
  const retryable = (error: string) => {
    const result = mapResponseBody({ ok: false, error })
    return result.kind === 'error' && result.retryable
  }
  assert.equal(retryable('rate_limited'), true)
  assert.equal(retryable('upstream'), true)
  assert.equal(retryable('bot'), false)
})

test('an unknown error code does not throw', () => {
  const result = mapResponseBody({ ok: false, error: 'teapot' })
  assert.equal(result.kind, 'error')
  assert.equal(result.kind === 'error' && result.message, MESSAGES.unexpected)
})

test('a non-object body is an unexpected error', () => {
  for (const body of [null, 'not json', 42, ['a']]) {
    assert.equal(mapResponseBody(body).kind, 'error')
  }
})

/* ------------------------------------------------------------------ */
/* The request                                                         */
/* ------------------------------------------------------------------ */

test('the POST stays a CORS simple request', async () => {
  let seen: { url: string; init: RequestInit } | null = null
  const result = await withFetch(
    (async (url: string, init: RequestInit) => {
      seen = { url, init }
      return new Response(JSON.stringify({ ok: true, id: 'LEAD-1' }))
    }) as unknown as typeof fetch,
    () => submitDemoRequest(payload(), { url: URL_UNDER_TEST }),
  )

  assert.deepEqual(result, { kind: 'ok', id: 'LEAD-1' })
  assert.ok(seen)
  const { url, init } = seen as unknown as { url: string; init: RequestInit }
  assert.equal(url, URL_UNDER_TEST)
  assert.equal(init.method, 'POST')
  // Any header beyond this one triggers a preflight, which Apps Script cannot
  // answer. This assertion is the guard on that.
  assert.deepEqual(init.headers, { 'Content-Type': 'text/plain;charset=utf-8' })
  assert.equal(init.redirect, 'follow')
  assert.deepEqual(JSON.parse(String(init.body)), payload())
})

test('the payload carries no Turnstile token', async () => {
  let body: Record<string, unknown> = {}
  await withFetch(
    (async (_url: string, init: RequestInit) => {
      body = JSON.parse(String(init.body)) as Record<string, unknown>
      return new Response(JSON.stringify({ ok: true, id: 'LEAD-1' }))
    }) as unknown as typeof fetch,
    () => submitDemoRequest(payload(), { url: URL_UNDER_TEST }),
  )
  assert.equal('turnstileToken' in body, false)
  // The honeypot still goes with it.
  assert.equal(body.website, '')
})

/* ------------------------------------------------------------------ */
/* Not configured                                                      */
/* ------------------------------------------------------------------ */

test('an unset endpoint is reported as not configured', () => {
  assert.equal(isDemoRequestConfigured(''), false)
  assert.equal(isDemoRequestConfigured('   '.trim()), false)
  assert.equal(isDemoRequestConfigured(URL_UNDER_TEST), true)
})

test('submitting without an endpoint never reaches the network', async () => {
  let called = false
  const result = await withFetch(
    (async () => {
      called = true
      return new Response('{}')
    }) as unknown as typeof fetch,
    () => submitDemoRequest(payload(), { url: '' }),
  )
  assert.deepEqual(result, { kind: 'not_configured' })
  assert.equal(called, false)
})

/* ------------------------------------------------------------------ */
/* Failure modes                                                       */
/* ------------------------------------------------------------------ */

test('a network failure is reported as one, and is retryable', async () => {
  const result = await withFetch(
    (async () => {
      throw new TypeError('Failed to fetch')
    }) as unknown as typeof fetch,
    () => submitDemoRequest(payload(), { url: URL_UNDER_TEST }),
  )
  assert.deepEqual(result, {
    kind: 'error',
    message: MESSAGES.network,
    retryable: true,
  })
})

test('a hung endpoint times out instead of leaving the button spinning', async () => {
  const result = await withFetch(
    ((_url: string, init: RequestInit) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () =>
          reject(new DOMException('Aborted', 'AbortError')),
        )
      })) as unknown as typeof fetch,
    () => submitDemoRequest(payload(), { url: URL_UNDER_TEST, timeoutMs: 20 }),
  )
  assert.deepEqual(result, {
    kind: 'error',
    message: MESSAGES.timeout,
    retryable: true,
  })
})

test('a non-JSON reply (an Apps Script sign-in page) does not throw', async () => {
  const result = await withFetch(
    appsScriptReply('<!DOCTYPE html><title>Sign in</title>'),
    () => submitDemoRequest(payload(), { url: URL_UNDER_TEST }),
  )
  assert.equal(result.kind, 'error')
  assert.equal(result.kind === 'error' && result.message, MESSAGES.unexpected)
  // A sign-in page means the web app was deployed wrong; retrying won't fix it.
  assert.equal(result.kind === 'error' && result.retryable, false)
})

test('an HTTP error with a readable error body still maps by body', async () => {
  const result = await withFetch(
    appsScriptReply({ ok: false, error: 'upstream' }, 500),
    () => submitDemoRequest(payload(), { url: URL_UNDER_TEST }),
  )
  assert.equal(result.kind === 'error' && result.message, MESSAGES.upstream)
})

test('closing the modal aborts the request', async () => {
  const controller = new AbortController()
  const result = await withFetch(
    ((_url: string, init: RequestInit) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () =>
          reject(new DOMException('Aborted', 'AbortError')),
        )
        controller.abort()
      })) as unknown as typeof fetch,
    () =>
      submitDemoRequest(payload(), {
        url: URL_UNDER_TEST,
        signal: controller.signal,
      }),
  )
  // The form drops this result on the floor; what matters is that it settles
  // rather than hanging, and is not reported as a timeout.
  assert.equal(result.kind === 'error' && result.message, MESSAGES.network)
})

/* ------------------------------------------------------------------ */
/* Client-side validation                                              */
/* ------------------------------------------------------------------ */

test('a valid payload passes without a Turnstile token', () => {
  assert.deepEqual(validateDemoForm(payload()), {})
})

test('validation still catches a bad phone number', () => {
  const errors = validateDemoForm(payload({ phone: '12345' }))
  assert.equal(Object.keys(errors).length, 1)
  assert.match(String(errors.phone), /mobile/i)
})
