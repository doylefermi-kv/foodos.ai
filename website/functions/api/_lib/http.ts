/**
 * JSON responses and CORS.
 *
 * In production the site and this function share an origin, so CORS is mostly
 * a local-dev concern (Vite on :5173 talking to `wrangler pages dev` on :8788).
 * The allowlist is therefore localhost plus anything in the optional
 * `ALLOWED_ORIGINS` env var — never `*`, so a third-party page can't post leads
 * from a visitor's browser.
 */

import type { Env } from './env.ts'

const LOCALHOST_ORIGIN_RE = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/

export function isAllowedOrigin(origin: string | null, env: Env): boolean {
  if (!origin) return false
  if (LOCALHOST_ORIGIN_RE.test(origin)) return true

  return (env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .includes(origin)
}

export function corsHeaders(request: Request, env: Env): Record<string, string> {
  const origin = request.headers.get('origin')
  if (!isAllowedOrigin(origin, env)) return {}

  return {
    'access-control-allow-origin': origin!,
    'access-control-allow-methods': 'POST, OPTIONS',
    'access-control-allow-headers': 'content-type',
    'access-control-max-age': '86400',
    // The allowed origin varies by request; without this a cache could hand
    // one origin's CORS headers to another.
    vary: 'Origin',
  }
}

export function json(
  body: unknown,
  init: { status?: number; headers?: Record<string, string> } = {},
): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...init.headers,
    },
  })
}
