/**
 * POST /api/demo-requests — the one conversion endpoint of the marketing site.
 *
 * Pipeline, cheapest check first so a flood costs us as little as possible:
 *   rate limit (no I/O) → JSON parse → honeypot → validation (no I/O)
 *   → Turnstile (one network call) → lead sink.
 *
 * Contract: `docs/website-architecture.md`. Responses are
 * 201 {id} · 400 validation · 403 bot · 429 rate_limited · 502 upstream.
 */

import type { DemoRequestResponse } from '../../shared/contract.ts'
import { isHoneypotTripped, parseDemoRequest } from '../../shared/contract.ts'
import type { Env, PagesFunctionContext } from './_lib/env.ts'
import { corsHeaders, json } from './_lib/http.ts'
import { createLead } from './_lib/lead.ts'
import type { RateLimiter } from './_lib/rate-limit.ts'
import { DEFAULT_RATE_LIMIT, clientIpFrom, createRateLimiter } from './_lib/rate-limit.ts'
import type { LeadSink } from './_lib/sinks/index.ts'
import { selectSink } from './_lib/sinks/index.ts'
import { TURNSTILE_TEST_SECRET_ALWAYS_PASSES, verifyTurnstile } from './_lib/turnstile.ts'
import type { FetchLike } from './_lib/turnstile.ts'

/**
 * Module-scope so the window survives across requests in the same isolate.
 * Built lazily because the limits are configurable through env.
 */
let sharedLimiter: RateLimiter | undefined
let sharedLimiterKey = ''

function rateLimiterFor(env: Env): RateLimiter {
  const limit = Number(env.RATE_LIMIT_MAX) || DEFAULT_RATE_LIMIT.limit
  const windowMs =
    (Number(env.RATE_LIMIT_WINDOW_SECONDS) || DEFAULT_RATE_LIMIT.windowMs / 1000) * 1000

  const key = `${limit}:${windowMs}`
  if (!sharedLimiter || sharedLimiterKey !== key) {
    sharedLimiter = createRateLimiter({ limit, windowMs })
    sharedLimiterKey = key
  }
  return sharedLimiter
}

/** Seams for tests — production passes none of these. */
export interface HandlerDeps {
  sink?: LeadSink
  rateLimiter?: RateLimiter
  fetchImpl?: FetchLike
  now?: () => Date
  newId?: () => string
  logger?: Pick<Console, 'log' | 'error' | 'warn'>
}

export async function handleDemoRequest(
  context: PagesFunctionContext,
  deps: HandlerDeps = {},
): Promise<Response> {
  const { request, env } = context
  const {
    rateLimiter = rateLimiterFor(env),
    fetchImpl,
    now = () => new Date(),
    newId = () => crypto.randomUUID(),
    logger = console,
  } = deps

  const cors = corsHeaders(request, env)
  const respond = (body: DemoRequestResponse, status: number, headers: Record<string, string> = {}) =>
    json(body, { status, headers: { ...cors, ...headers } })

  // 1. Rate limit. Free, and it caps the cost of everything below.
  const ip = clientIpFrom(request)
  const decision = rateLimiter.check(ip)
  if (!decision.allowed) {
    logger.warn(`[demo-requests] rate limited ip=${ip}`)
    return respond({ error: 'rate_limited' }, 429, {
      'retry-after': String(decision.retryAfterSeconds),
    })
  }

  // 2. Body.
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return respond(
      { error: 'validation', fields: { name: 'Expected a JSON object.' } },
      400,
    )
  }

  // 3. Honeypot. A filled hidden field is a bot, and it never gets told why.
  if (isHoneypotTripped(body)) {
    logger.warn(`[demo-requests] honeypot tripped ip=${ip}`)
    return respond({ error: 'bot' }, 403)
  }

  // 4. Validation.
  const parsed = parseDemoRequest(body)
  if (!parsed.ok) {
    return respond({ error: 'validation', fields: parsed.fields }, 400)
  }
  const demoRequest = parsed.value

  // 5. Turnstile. Falls back to Cloudflare's always-pass test secret so a local
  //    checkout works without a real key; production always sets the secret.
  const turnstile = await verifyTurnstile({
    token: demoRequest.turnstileToken,
    secret: env.TURNSTILE_SECRET_KEY || TURNSTILE_TEST_SECRET_ALWAYS_PASSES,
    remoteIp: ip === 'unknown' ? undefined : ip,
    fetchImpl,
  })
  if (!turnstile.success) {
    logger.warn(
      `[demo-requests] turnstile rejected ip=${ip} codes=${(turnstile.errorCodes ?? []).join(',')}`,
    )
    return respond({ error: 'bot' }, 403)
  }

  // 6. Persist.
  const lead = createLead(demoRequest, {
    id: newId(),
    receivedAt: now(),
    userAgent: request.headers.get('user-agent') ?? '',
  })

  let sink: LeadSink
  try {
    sink = deps.sink ?? selectSink(env, logger)
  } catch (error) {
    // Misconfiguration, not a transient fault — but the lead still must survive.
    logger.error(`[demo-requests] sink misconfigured: ${String(error)}`)
    logger.error(`[demo-requests] UNSAVED LEAD ${JSON.stringify(lead)}`)
    return respond({ error: 'upstream' }, 502)
  }

  try {
    await sink.write(lead)
  } catch (error) {
    // Never lose a lead silently: the full payload goes to the log so it can be
    // replayed into the sheet by hand.
    logger.error(`[demo-requests] sink=${sink.name} write failed: ${String(error)}`)
    logger.error(`[demo-requests] UNSAVED LEAD ${JSON.stringify(lead)}`)
    return respond({ error: 'upstream' }, 502)
  }

  logger.log(`[demo-requests] stored lead ${lead.id} via ${sink.name}`)
  return respond({ id: lead.id }, 201)
}

/* ------------------------------------------------------------------ */
/* Pages Function entry points                                         */
/* ------------------------------------------------------------------ */

/**
 * A single catch-all handler that dispatches on method, rather than separate
 * `onRequestPost`/`onRequestOptions` exports — one export means there is no
 * question about which handler Pages picks for a given method.
 */
export const onRequest = (context: PagesFunctionContext): Response | Promise<Response> => {
  const { request, env } = context

  switch (request.method) {
    case 'POST':
      return handleDemoRequest(context)

    case 'OPTIONS':
      return new Response(null, { status: 204, headers: corsHeaders(request, env) })

    default:
      return json(
        { error: 'method_not_allowed' },
        {
          status: 405,
          headers: { allow: 'POST, OPTIONS', ...corsHeaders(request, env) },
        },
      )
  }
}
