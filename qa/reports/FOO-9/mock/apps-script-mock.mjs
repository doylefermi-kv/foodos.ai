/**
 * Mock of the Google Apps Script /exec endpoint, for FOO-9 QA only.
 *
 * Never talks to Google. The site is built once against `/exec` and the
 * *server* decides which documented response to give, so every case is covered
 * without rebuilding — and the browser always posts to the one URL it would in
 * production. Modes, from apps-script/README.md:
 *
 *   ok           {"ok":true,"id":"<uuid>"}
 *   ok-no-id     {"ok":true}                      (accepted, no reference)
 *   validation   {"ok":false,"error":"validation","fields":{...}}
 *   bot          {"ok":false,"error":"bot"}
 *   rate_limited {"ok":false,"error":"rate_limited"}
 *   upstream     {"ok":false,"error":"upstream"}
 *   nonjson      an HTML Google sign-in page, 200
 *   slow         {"ok":true,...} after 20s (client timeout is 15s)
 *   unknown      {"ok":false,"error":"teapot"}    (unrecognised code)
 *   hangup       socket destroyed mid-request      (network failure)
 *
 *   GET /__mode?set=<name>  switch mode
 *   GET /__received         every payload this server has been POSTed
 *   GET /__reset            clears the log
 *
 * Apps Script always answers HTTP 200, including on failure, so every response
 * here is 200 on purpose.
 */
import { createServer } from 'node:http'
import { randomUUID } from 'node:crypto'

const PORT = Number(process.env.PORT || 8799)
const received = []

const SIGN_IN_HTML =
  '<!doctype html><html><head><title>Sign in - Google Accounts</title></head>' +
  '<body><h1>Sign in</h1><p>to continue to Apps Script</p></body></html>'

const BODIES = {
  ok: () => ({ ok: true, id: randomUUID() }),
  'ok-no-id': () => ({ ok: true }),
  validation: () => ({
    ok: false,
    error: 'validation',
    fields: {
      phone: 'Enter a 10-digit Indian mobile number, e.g. 98765 43210.',
      city: 'Please enter your city.',
    },
  }),
  bot: () => ({ ok: false, error: 'bot' }),
  rate_limited: () => ({ ok: false, error: 'rate_limited' }),
  upstream: () => ({ ok: false, error: 'upstream' }),
  unknown: () => ({ ok: false, error: 'teapot' }),
  slow: () => ({ ok: true, id: randomUUID() }),
}

let mode = 'ok'

/** The form POSTs cross-origin as a CORS *simple* request, so no preflight is
 *  expected — but the response still needs to be readable. */
function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS')
}

function send(res, status, body, type = 'application/json') {
  cors(res)
  res.writeHead(status, { 'Content-Type': type })
  res.end(typeof body === 'string' ? body : JSON.stringify(body))
}

const server = createServer((req, res) => {
  const path = new URL(req.url, 'http://x').pathname

  if (req.method === 'OPTIONS') {
    // Logged so the report can say whether the browser ever sent a preflight.
    received.push({ preflight: true, path, at: new Date().toISOString() })
    cors(res)
    res.writeHead(204)
    return res.end()
  }

  if (req.method === 'GET' && path === '/__received') {
    return send(res, 200, received)
  }
  if (path === '/__reset') {
    received.length = 0
    return send(res, 200, { ok: true })
  }
  if (path === '/__mode') {
    const next = new URL(req.url, 'http://x').searchParams.get('set')
    if (next) mode = next
    return send(res, 200, { mode })
  }
  if (req.method === 'GET') {
    // Health check, same as the real script.
    return send(res, 200, { ok: true, service: 'foodos-leads-MOCK', mode })
  }

  let raw = ''
  req.on('data', (chunk) => {
    raw += chunk
  })
  req.on('end', () => {
    let parsed = null
    try {
      parsed = JSON.parse(raw)
    } catch {
      /* record it raw below */
    }
    received.push({
      path,
      mode,
      at: new Date().toISOString(),
      contentType: req.headers['content-type'] ?? null,
      // Which headers actually arrived — the contract says exactly one.
      headers: req.headers,
      raw,
      parsed,
    })

    if (mode === 'nonjson') return send(res, 200, SIGN_IN_HTML, 'text/html')
    if (mode === 'hangup') return req.socket.destroy()
    if (mode === 'slow') {
      return setTimeout(() => send(res, 200, BODIES.slow()), 20_000)
    }
    const make = BODIES[mode]
    if (!make) return send(res, 200, { ok: false, error: 'upstream' })
    send(res, 200, make())
  })
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[mock] apps-script mock on http://127.0.0.1:${PORT}`)
})
