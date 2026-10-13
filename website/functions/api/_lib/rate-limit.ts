/**
 * Simple per-IP sliding-window rate limiter.
 *
 * SCOPE — read before relying on this: the counters live in the module scope of
 * a single Worker isolate. Cloudflare runs many isolates across many colos and
 * recycles them freely, so this is a cheap speed bump against a naive script
 * hammering one connection, not a global guarantee. That is the right trade for
 * a demo form: it costs nothing, adds no binding, and the real spam defence is
 * Turnstile. If we ever need an actual global limit, the upgrade is a
 * Durable Object or Cloudflare's own Rate Limiting rules — swap
 * `createRateLimiter` for that and the handler is unchanged.
 */

export interface RateLimitDecision {
  allowed: boolean
  /** Requests left in the current window. */
  remaining: number
  /** Seconds until the oldest hit falls out of the window. */
  retryAfterSeconds: number
}

export interface RateLimiterOptions {
  /** Max requests per key per window. */
  limit: number
  windowMs: number
  /** Guard against unbounded memory if a flood brings many distinct IPs. */
  maxKeys?: number
}

export interface RateLimiter {
  check(key: string, now?: number): RateLimitDecision
  reset(): void
}

export const DEFAULT_RATE_LIMIT = { limit: 5, windowMs: 10 * 60_000 }

export function createRateLimiter(options: RateLimiterOptions): RateLimiter {
  const { limit, windowMs, maxKeys = 10_000 } = options
  const hits = new Map<string, number[]>()

  function prune(now: number): void {
    for (const [key, timestamps] of hits) {
      const live = timestamps.filter((t) => now - t < windowMs)
      if (live.length === 0) hits.delete(key)
      else hits.set(key, live)
    }
  }

  return {
    check(key: string, now: number = Date.now()): RateLimitDecision {
      // Only sweep when the map is actually growing, so the common path stays O(1).
      if (hits.size >= maxKeys) {
        prune(now)
        if (hits.size >= maxKeys) hits.clear()
      }

      const window = (hits.get(key) ?? []).filter((t) => now - t < windowMs)

      if (window.length >= limit) {
        const oldest = window[0]
        hits.set(key, window)
        return {
          allowed: false,
          remaining: 0,
          retryAfterSeconds: Math.max(1, Math.ceil((windowMs - (now - oldest)) / 1000)),
        }
      }

      window.push(now)
      hits.set(key, window)
      return { allowed: true, remaining: limit - window.length, retryAfterSeconds: 0 }
    },

    reset(): void {
      hits.clear()
    },
  }
}

/**
 * Best-effort client IP. `CF-Connecting-IP` is set by Cloudflare's edge and
 * cannot be spoofed by the client on a real request; the others are dev-only
 * fallbacks. Returns `unknown` rather than throwing so a missing header can
 * never 500 the endpoint — it just shares one bucket.
 */
export function clientIpFrom(request: Request): string {
  return (
    request.headers.get('cf-connecting-ip') ??
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    request.headers.get('x-real-ip') ??
    'unknown'
  )
}
