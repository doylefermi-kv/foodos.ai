import test from 'node:test'
import assert from 'node:assert/strict'

import { verifyTurnstile } from '../turnstile.ts'

const SITEVERIFY = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'

function mockFetch(
  handler: (url: string, init?: RequestInit) => Response | Promise<Response>,
): {
  fetchImpl: (url: string, init?: RequestInit) => Promise<Response>
  calls: { url: string; init?: RequestInit }[]
} {
  const calls: { url: string; init?: RequestInit }[] = []
  return {
    calls,
    fetchImpl: async (url, init) => {
      calls.push({ url, init })
      return handler(url, init)
    },
  }
}

const ok = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })

test('a valid token passes', async () => {
  const { fetchImpl } = mockFetch(() => ok({ success: true }))
  const result = await verifyTurnstile({ token: 'good', secret: 's', fetchImpl })
  assert.equal(result.success, true)
})

test('posts the token, secret and remote IP to siteverify as form data', async () => {
  const { fetchImpl, calls } = mockFetch(() => ok({ success: true }))
  await verifyTurnstile({
    token: 'tok-123',
    secret: 'secret-abc',
    remoteIp: '203.0.113.9',
    fetchImpl,
  })

  assert.equal(calls.length, 1)
  assert.equal(calls[0].url, SITEVERIFY)
  assert.equal(calls[0].init?.method, 'POST')

  const sent = new URLSearchParams(String(calls[0].init?.body))
  assert.equal(sent.get('response'), 'tok-123')
  assert.equal(sent.get('secret'), 'secret-abc')
  assert.equal(sent.get('remoteip'), '203.0.113.9')
})

test('omits remoteip when the IP is unknown', async () => {
  const { fetchImpl, calls } = mockFetch(() => ok({ success: true }))
  await verifyTurnstile({ token: 't', secret: 's', fetchImpl })
  assert.equal(new URLSearchParams(String(calls[0].init?.body)).has('remoteip'), false)
})

test('a rejected token fails and surfaces the error codes', async () => {
  const { fetchImpl } = mockFetch(() =>
    ok({ success: false, 'error-codes': ['invalid-input-response'] }),
  )
  const result = await verifyTurnstile({ token: 'bad', secret: 's', fetchImpl })
  assert.equal(result.success, false)
  assert.deepEqual(result.errorCodes, ['invalid-input-response'])
})

test('a missing token short-circuits without calling Cloudflare', async () => {
  const { fetchImpl, calls } = mockFetch(() => ok({ success: true }))
  const result = await verifyTurnstile({ token: '', secret: 's', fetchImpl })
  assert.equal(result.success, false)
  assert.deepEqual(result.errorCodes, ['missing-input-response'])
  assert.equal(calls.length, 0)
})

test('a missing secret fails closed', async () => {
  const { fetchImpl, calls } = mockFetch(() => ok({ success: true }))
  const result = await verifyTurnstile({ token: 't', secret: '', fetchImpl })
  assert.equal(result.success, false)
  assert.deepEqual(result.errorCodes, ['missing-input-secret'])
  assert.equal(calls.length, 0)
})

test('an HTTP error from siteverify fails closed rather than throwing', async () => {
  const { fetchImpl } = mockFetch(() => new Response('nope', { status: 500 }))
  const result = await verifyTurnstile({ token: 't', secret: 's', fetchImpl })
  assert.equal(result.success, false)
  assert.deepEqual(result.errorCodes, ['siteverify-http-500'])
})

test('a network failure fails closed rather than throwing', async () => {
  const { fetchImpl } = mockFetch(() => {
    throw new TypeError('connection refused')
  })
  const result = await verifyTurnstile({ token: 't', secret: 's', fetchImpl })
  assert.equal(result.success, false)
  assert.deepEqual(result.errorCodes, ['siteverify-network'])
})

test('a malformed JSON body fails closed', async () => {
  const { fetchImpl } = mockFetch(() => new Response('<html>', { status: 200 }))
  const result = await verifyTurnstile({ token: 't', secret: 's', fetchImpl })
  assert.equal(result.success, false)
})

test('a non-boolean success field is not treated as success', async () => {
  const { fetchImpl } = mockFetch(() => ok({ success: 'true' }))
  const result = await verifyTurnstile({ token: 't', secret: 's', fetchImpl })
  assert.equal(result.success, false)
})

test('a hung siteverify call times out and fails closed', async () => {
  const fetchImpl = (_url: string, init?: RequestInit) =>
    new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => {
        const error = new Error('aborted')
        error.name = 'AbortError'
        reject(error)
      })
    })

  const result = await verifyTurnstile({ token: 't', secret: 's', fetchImpl, timeoutMs: 20 })
  assert.equal(result.success, false)
  assert.deepEqual(result.errorCodes, ['siteverify-timeout'])
})
