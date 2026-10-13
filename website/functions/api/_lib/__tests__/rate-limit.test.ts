import test from 'node:test'
import assert from 'node:assert/strict'

import { clientIpFrom, createRateLimiter } from '../rate-limit.ts'

test('allows up to the limit, then blocks', () => {
  const limiter = createRateLimiter({ limit: 3, windowMs: 60_000 })
  const t0 = 1_000_000

  assert.equal(limiter.check('1.2.3.4', t0).allowed, true)
  assert.equal(limiter.check('1.2.3.4', t0 + 1).allowed, true)

  const third = limiter.check('1.2.3.4', t0 + 2)
  assert.equal(third.allowed, true)
  assert.equal(third.remaining, 0)

  const fourth = limiter.check('1.2.3.4', t0 + 3)
  assert.equal(fourth.allowed, false)
  assert.equal(fourth.remaining, 0)
  assert.ok(fourth.retryAfterSeconds > 0)
})

test('buckets are per IP', () => {
  const limiter = createRateLimiter({ limit: 1, windowMs: 60_000 })
  const t0 = 1_000_000

  assert.equal(limiter.check('1.1.1.1', t0).allowed, true)
  assert.equal(limiter.check('1.1.1.1', t0).allowed, false)
  // A different IP is unaffected by the first one's spending.
  assert.equal(limiter.check('2.2.2.2', t0).allowed, true)
})

test('the window slides: old hits expire', () => {
  const limiter = createRateLimiter({ limit: 2, windowMs: 10_000 })
  const t0 = 1_000_000

  limiter.check('ip', t0)
  limiter.check('ip', t0 + 1_000)
  assert.equal(limiter.check('ip', t0 + 2_000).allowed, false)

  // Just before the first hit expires, still blocked...
  assert.equal(limiter.check('ip', t0 + 9_999).allowed, false)
  // ...and once it falls out of the window, one slot frees up.
  assert.equal(limiter.check('ip', t0 + 10_001).allowed, true)
})

test('retryAfterSeconds counts down to when a slot frees up', () => {
  const limiter = createRateLimiter({ limit: 1, windowMs: 60_000 })
  const t0 = 1_000_000

  limiter.check('ip', t0)
  assert.equal(limiter.check('ip', t0 + 10_000).retryAfterSeconds, 50)
  assert.equal(limiter.check('ip', t0 + 59_500).retryAfterSeconds, 1)
})

test('reset clears all buckets', () => {
  const limiter = createRateLimiter({ limit: 1, windowMs: 60_000 })
  limiter.check('ip', 1_000)
  assert.equal(limiter.check('ip', 1_001).allowed, false)

  limiter.reset()
  assert.equal(limiter.check('ip', 1_002).allowed, true)
})

test('key tracking stays bounded under a many-IP flood', () => {
  const limiter = createRateLimiter({ limit: 1, windowMs: 60_000, maxKeys: 10 })
  // Far more distinct IPs than maxKeys; the limiter must not grow without end.
  for (let i = 0; i < 500; i++) {
    assert.equal(limiter.check(`10.0.0.${i}`, 1_000 + i).allowed, true)
  }
})

test('clientIpFrom prefers the header Cloudflare controls', () => {
  const request = new Request('https://foodos.ai/api/demo-requests', {
    headers: {
      'cf-connecting-ip': '203.0.113.9',
      // Client-supplied, and therefore not to be trusted over the one above.
      'x-forwarded-for': '198.51.100.1, 203.0.113.9',
    },
  })
  assert.equal(clientIpFrom(request), '203.0.113.9')
})

test('clientIpFrom falls back for local dev and never throws', () => {
  const forwarded = new Request('https://foodos.ai/', {
    headers: { 'x-forwarded-for': '198.51.100.1, 10.0.0.1' },
  })
  assert.equal(clientIpFrom(forwarded), '198.51.100.1')

  const bare = new Request('https://foodos.ai/')
  assert.equal(clientIpFrom(bare), 'unknown')
})
