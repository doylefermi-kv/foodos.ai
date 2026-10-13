/**
 * Server-side Cloudflare Turnstile verification.
 *
 * Local dev uses Cloudflare's documented always-pass test keys, so no real
 * secret is needed to run the endpoint end to end:
 *   secret (always passes): 1x0000000000000000000000000000000AA
 *   secret (always fails):  2x0000000000000000000000000000000AA
 *   site key (always passes, frontend): 1x00000000000000000000AA
 */

const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'

/** Always-pass secret. Used when TURNSTILE_SECRET_KEY is unset locally. */
export const TURNSTILE_TEST_SECRET_ALWAYS_PASSES = '1x0000000000000000000000000000000AA'
/** Always-fail secret, for exercising the bot path. */
export const TURNSTILE_TEST_SECRET_ALWAYS_FAILS = '2x0000000000000000000000000000000AA'

export interface TurnstileResult {
  success: boolean
  /** Cloudflare's machine-readable reasons, for logging only. */
  errorCodes?: string[]
}

/** Injectable for tests; defaults to global fetch. */
export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

export interface VerifyTurnstileOptions {
  token: string
  secret: string
  remoteIp?: string
  fetchImpl?: FetchLike
  /** Abort the siteverify call after this long. */
  timeoutMs?: number
}

/**
 * Verify a Turnstile token. Never throws: a network failure or a malformed
 * response is reported as `success: false` so the caller can answer 403 rather
 * than 500.
 */
export async function verifyTurnstile(options: VerifyTurnstileOptions): Promise<TurnstileResult> {
  const { token, secret, remoteIp, fetchImpl = fetch, timeoutMs = 5_000 } = options

  if (!token) return { success: false, errorCodes: ['missing-input-response'] }
  if (!secret) return { success: false, errorCodes: ['missing-input-secret'] }

  const body = new URLSearchParams({ secret, response: token })
  if (remoteIp) body.set('remoteip', remoteIp)

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetchImpl(SITEVERIFY_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
      signal: controller.signal,
    })

    if (!response.ok) {
      return { success: false, errorCodes: [`siteverify-http-${response.status}`] }
    }

    const data = (await response.json()) as { success?: unknown; 'error-codes'?: unknown }
    const errorCodes = Array.isArray(data['error-codes'])
      ? (data['error-codes'] as string[])
      : undefined

    return { success: data.success === true, errorCodes }
  } catch (error) {
    const reason = error instanceof Error && error.name === 'AbortError' ? 'timeout' : 'network'
    return { success: false, errorCodes: [`siteverify-${reason}`] }
  } finally {
    clearTimeout(timer)
  }
}
