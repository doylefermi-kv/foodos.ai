/** End-to-end tests for the handler: status codes and bodies per the contract. */

import test from 'node:test'
import assert from 'node:assert/strict'

import type { Env, PagesFunctionContext } from '../env.ts'
import type { Lead } from '../lead.ts'
import type { LeadSink } from '../sinks/sink.ts'
import { LeadSinkError } from '../sinks/sink.ts'
import { createRateLimiter } from '../rate-limit.ts'
import { handleDemoRequest, onRequest } from '../../demo-requests.ts'

const ENDPOINT = 'http://localhost:8788/api/demo-requests'

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
    attribution: { utmSource: 'google', landingPath: '/' },
    turnstileToken: 'test-token',
    website: '',
    ...overrides,
  }
}

function post(
  body: unknown,
  init: { ip?: string; headers?: Record<string, string> } = {},
): Request {
  return new Request(ENDPOINT, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'cf-connecting-ip': init.ip ?? '203.0.113.9',
      'user-agent': 'Mozilla/5.0 (test)',
      ...init.headers,
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

function context(request: Request, env: Env = {}): PagesFunctionContext {
  return { request, env, waitUntil: () => {} }
}

/** Collects leads instead of writing them anywhere. */
class RecordingSink implements LeadSink {
  readonly name = 'recording'
  readonly leads: Lead[] = []
  async write(lead: Lead): Promise<void> {
    this.leads.push(lead)
  }
}

class FailingSink implements LeadSink {
  readonly name = 'failing'
  async write(): Promise<void> {
    throw new LeadSinkError(this.name, 'Sheets append failed (403): permission denied')
  }
}

const silentLogger = { log: () => {}, error: () => {}, warn: () => {} }

/** Captures logs so the 502 path can be asserted on. */
function capturingLogger() {
  const lines: string[] = []
  const push = (msg: unknown) => lines.push(String(msg))
  return { lines, logger: { log: push, error: push, warn: push } }
}

type TurnstileStub = (url: string, init?: RequestInit) => Promise<Response>

const passingTurnstile: TurnstileStub = async () =>
  new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })

const failingTurnstile: TurnstileStub = async () =>
  new Response(JSON.stringify({ success: false, 'error-codes': ['invalid-input-response'] }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })

function deps(overrides: Partial<Parameters<typeof handleDemoRequest>[1]> = {}) {
  return {
    sink: new RecordingSink(),
    rateLimiter: createRateLimiter({ limit: 100, windowMs: 60_000 }),
    fetchImpl: passingTurnstile,
    logger: silentLogger,
    ...overrides,
  }
}

/* -------------------------------------------------------------- */
/* Happy path                                                      */
/* -------------------------------------------------------------- */

test('a valid request returns 201 with an id and stores the lead', async () => {
  const sink = new RecordingSink()
  const response = await handleDemoRequest(
    context(post(validBody())),
    deps({ sink, newId: () => 'lead-abc', now: () => new Date('2026-10-13T04:31:08.266Z') }),
  )

  assert.equal(response.status, 201)
  assert.equal(response.headers.get('content-type'), 'application/json; charset=utf-8')
  assert.deepEqual(await response.json(), { id: 'lead-abc' })

  assert.equal(sink.leads.length, 1)
  const lead = sink.leads[0]
  assert.equal(lead.id, 'lead-abc')
  assert.equal(lead.receivedAt, '2026-10-13T10:01:08.266+05:30')
  assert.equal(lead.status, 'new')
  assert.equal(lead.userAgent, 'Mozilla/5.0 (test)')
  // The phone reaches the sink normalised, not as typed.
  assert.equal(lead.request.phone, '+919876543210')
})

test('lead responses are never cached', async () => {
  const response = await handleDemoRequest(context(post(validBody())), deps())
  assert.equal(response.headers.get('cache-control'), 'no-store')
})

/* -------------------------------------------------------------- */
/* 400 validation                                                  */
/* -------------------------------------------------------------- */

test('an invalid request returns 400 with per-field messages and stores nothing', async () => {
  const sink = new RecordingSink()
  const response = await handleDemoRequest(
    context(post(validBody({ phone: '12345', name: 'A', consent: false }))),
    deps({ sink }),
  )

  assert.equal(response.status, 400)
  const body = (await response.json()) as { error: string; fields: Record<string, string> }
  assert.equal(body.error, 'validation')
  assert.ok(body.fields.phone)
  assert.ok(body.fields.name)
  assert.ok(body.fields.consent)
  assert.equal(sink.leads.length, 0)
})

test('malformed JSON returns 400 rather than crashing', async () => {
  const response = await handleDemoRequest(context(post('{ not json')), deps())
  assert.equal(response.status, 400)
  assert.equal(((await response.json()) as { error: string }).error, 'validation')
})

test('validation failure skips the Turnstile call entirely', async () => {
  let called = 0
  const response = await handleDemoRequest(
    context(post(validBody({ phone: 'nope' }))),
    deps({
      fetchImpl: async (...args: Parameters<typeof passingTurnstile>) => {
        called++
        return passingTurnstile(...args)
      },
    }),
  )

  assert.equal(response.status, 400)
  assert.equal(called, 0, 'no network call should be made for an invalid body')
})

/* -------------------------------------------------------------- */
/* 403 bot                                                         */
/* -------------------------------------------------------------- */

test('a filled honeypot returns a bare 403 and stores nothing', async () => {
  const sink = new RecordingSink()
  const response = await handleDemoRequest(
    context(post(validBody({ website: 'http://spam.example' }))),
    deps({ sink }),
  )

  assert.equal(response.status, 403)
  // No field hints — a bot must not learn which input gave it away.
  assert.deepEqual(await response.json(), { error: 'bot' })
  assert.equal(sink.leads.length, 0)
})

test('the honeypot is checked before validation, so a bot learns nothing', async () => {
  const response = await handleDemoRequest(
    context(post(validBody({ website: 'spam', phone: 'garbage', name: '' }))),
    deps(),
  )
  assert.equal(response.status, 403)
  assert.deepEqual(await response.json(), { error: 'bot' })
})

test('a rejected Turnstile token returns 403 and stores nothing', async () => {
  const sink = new RecordingSink()
  const response = await handleDemoRequest(
    context(post(validBody())),
    deps({ sink, fetchImpl: failingTurnstile }),
  )

  assert.equal(response.status, 403)
  assert.deepEqual(await response.json(), { error: 'bot' })
  assert.equal(sink.leads.length, 0)
})

test('the configured Turnstile secret is the one sent to Cloudflare', async () => {
  const seen: string[] = []
  await handleDemoRequest(
    context(post(validBody()), { TURNSTILE_SECRET_KEY: 'real-secret' }),
    deps({
      fetchImpl: async (url: string, init?: RequestInit) => {
        seen.push(new URLSearchParams(String(init?.body)).get('secret') ?? '')
        return passingTurnstile(url, init)
      },
    }),
  )
  assert.deepEqual(seen, ['real-secret'])
})

test('with no secret configured, the always-pass test key is used so local dev works', async () => {
  const seen: string[] = []
  const response = await handleDemoRequest(
    context(post(validBody()), {}),
    deps({
      fetchImpl: async (url: string, init?: RequestInit) => {
        seen.push(new URLSearchParams(String(init?.body)).get('secret') ?? '')
        return passingTurnstile(url, init)
      },
    }),
  )
  assert.equal(response.status, 201)
  assert.deepEqual(seen, ['1x0000000000000000000000000000000AA'])
})

test('a Turnstile outage fails closed with 403, never storing an unverified lead', async () => {
  const sink = new RecordingSink()
  const response = await handleDemoRequest(
    context(post(validBody())),
    deps({
      sink,
      fetchImpl: async () => {
        throw new TypeError('connection refused')
      },
    }),
  )

  assert.equal(response.status, 403)
  assert.equal(sink.leads.length, 0)
})

/* -------------------------------------------------------------- */
/* 429 rate limited                                                */
/* -------------------------------------------------------------- */

test('the Nth+1 request from one IP returns 429 with Retry-After', async () => {
  const rateLimiter = createRateLimiter({ limit: 2, windowMs: 60_000 })
  const d = deps({ rateLimiter })

  assert.equal((await handleDemoRequest(context(post(validBody())), d)).status, 201)
  assert.equal((await handleDemoRequest(context(post(validBody())), d)).status, 201)

  const blocked = await handleDemoRequest(context(post(validBody())), d)
  assert.equal(blocked.status, 429)
  assert.deepEqual(await blocked.json(), { error: 'rate_limited' })
  assert.ok(Number(blocked.headers.get('retry-after')) > 0)
})

test('rate limiting is per IP, so one spammer cannot block everyone', async () => {
  const rateLimiter = createRateLimiter({ limit: 1, windowMs: 60_000 })
  const d = deps({ rateLimiter })

  assert.equal((await handleDemoRequest(context(post(validBody(), { ip: '1.1.1.1' })), d)).status, 201)
  assert.equal((await handleDemoRequest(context(post(validBody(), { ip: '1.1.1.1' })), d)).status, 429)
  // A different visitor is unaffected.
  assert.equal((await handleDemoRequest(context(post(validBody(), { ip: '2.2.2.2' })), d)).status, 201)
})

test('a rate-limited request does no work: no Turnstile call, no write', async () => {
  const sink = new RecordingSink()
  let turnstileCalls = 0
  const rateLimiter = createRateLimiter({ limit: 1, windowMs: 60_000 })
  const d = deps({
    sink,
    rateLimiter,
    fetchImpl: async (url: string, init?: RequestInit) => {
      turnstileCalls++
      return passingTurnstile(url, init)
    },
  })

  await handleDemoRequest(context(post(validBody())), d)
  await handleDemoRequest(context(post(validBody())), d)

  assert.equal(turnstileCalls, 1, 'the blocked request must not reach Cloudflare')
  assert.equal(sink.leads.length, 1)
})

/* -------------------------------------------------------------- */
/* 502 upstream                                                    */
/* -------------------------------------------------------------- */

test('a sink failure returns 502 and logs the full lead so none is lost', async () => {
  const { lines, logger } = capturingLogger()
  const response = await handleDemoRequest(
    context(post(validBody())),
    deps({ sink: new FailingSink(), logger, newId: () => 'lead-lost' }),
  )

  assert.equal(response.status, 502)
  assert.deepEqual(await response.json(), { error: 'upstream' })

  const logged = lines.join('\n')
  assert.match(logged, /UNSAVED LEAD/)
  assert.match(logged, /lead-lost/)
  // The whole payload must be recoverable from the log, not just an id.
  assert.match(logged, /Spice Garden/)
  assert.match(logged, /\+919876543210/)
  assert.match(logged, /anjali@spicegarden\.in/)
})

test('a misconfigured sink also returns 502 and logs the lead', async () => {
  const { lines, logger } = capturingLogger()
  const response = await handleDemoRequest(
    // google_sheet selected without credentials.
    context(post(validBody()), { LEAD_SINK: 'google_sheet' }),
    { rateLimiter: createRateLimiter({ limit: 10, windowMs: 60_000 }), fetchImpl: passingTurnstile, logger },
  )

  assert.equal(response.status, 502)
  assert.deepEqual(await response.json(), { error: 'upstream' })
  assert.match(lines.join('\n'), /UNSAVED LEAD/)
})

/* -------------------------------------------------------------- */
/* Methods and CORS                                                */
/* -------------------------------------------------------------- */

test('OPTIONS preflight from an allowed origin is answered 204', async () => {
  const request = new Request(ENDPOINT, {
    method: 'OPTIONS',
    headers: { origin: 'http://localhost:5173' },
  })
  const response = (await onRequest(context(request))) as Response

  assert.equal(response.status, 204)
  assert.equal(response.headers.get('access-control-allow-origin'), 'http://localhost:5173')
  assert.match(response.headers.get('access-control-allow-methods') ?? '', /POST/)
  assert.equal(response.headers.get('vary'), 'Origin')
})

test('GET is rejected with 405 and an Allow header', async () => {
  const response = (await onRequest(context(new Request(ENDPOINT)))) as Response
  assert.equal(response.status, 405)
  assert.equal(response.headers.get('allow'), 'POST, OPTIONS')
})

test('an unknown origin gets no CORS grant', async () => {
  const request = new Request(ENDPOINT, {
    method: 'OPTIONS',
    headers: { origin: 'https://evil.example' },
  })
  const response = (await onRequest(context(request))) as Response
  assert.equal(response.headers.get('access-control-allow-origin'), null)
})

test('an origin on the configured allowlist is granted CORS', async () => {
  const request = new Request(ENDPOINT, {
    method: 'OPTIONS',
    headers: { origin: 'https://foodos.ai' },
  })
  const response = (await onRequest(
    context(request, { ALLOWED_ORIGINS: 'https://foodos.ai, https://www.foodos.ai' }),
  )) as Response
  assert.equal(response.headers.get('access-control-allow-origin'), 'https://foodos.ai')
})
