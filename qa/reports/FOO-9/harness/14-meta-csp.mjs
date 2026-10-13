/**
 * FOO-9 follow-up: can the site go GitHub-Pages-only, with no Cloudflare?
 *
 * The CTO's answer to FOO-9-03 asked whether we can drop Cloudflare entirely.
 * The only part of that which is testable rather than theoretical is: does the
 * site still work once the `_headers` CSP is moved into a
 * `<meta http-equiv="Content-Security-Policy">`, which is the one delivery
 * mechanism GitHub Pages leaves us?
 *
 * This is the check that `public/_headers` itself warns about and that nobody
 * has ever run: the policy has no 'unsafe-inline' on script-src, so any inline
 * script Vite emits kills the page. If that fires, FOO-6 ships a blank site.
 *
 * Two variants are served, both as the real sub-path build:
 *   A  the production policy verbatim, minus the directives a meta tag ignores
 *   B  the same, plus the local mock in connect-src, to prove the form survives
 *
 * CSP violations are collected two ways — the `securitypolicyviolation` DOM
 * event and the console — because Chrome reports some blocks only one way.
 *
 * Nothing in website/ is touched: the build is copied to /tmp and patched there.
 */
import { cp, mkdir, readFile, writeFile, rm } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { extname, join, normalize } from 'node:path'
import { browser, newPage, shot, settle, setMode, received, reset, VIEWPORTS } from './lib.mjs'

const REPO = '/Users/doyle/Documents/Demo/PaperClip/foodos'
const DIST = `${REPO}/website/dist`
const WORK = '/tmp/foodos-qa-foo9/metacsp'
const MOCK = 'http://127.0.0.1:8799'

/**
 * The production policy from website/public/_headers, with the three directives
 * the HTML spec makes a meta tag ignore removed: frame-ancestors, report-uri,
 * sandbox. Only frame-ancestors is actually in our policy — that loss is the
 * finding, not a transcription slip.
 */
const BASE_CSP = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "form-action 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "frame-src 'none'",
  "manifest-src 'self'",
  'upgrade-insecure-requests',
]

/** Same fixture and the same name-based selectors as 07-form.mjs — the consent
 *  checkbox's label mentions WhatsApp, so a label regex grabs the wrong field. */
const GOOD = {
  name: 'Asha Menon',
  phone: '9876543210',
  restaurantName: 'Spice Route',
  city: 'Kochi',
  outlets: '2-5',
}

async function fillForm(page) {
  for (const k of ['name', 'phone', 'restaurantName', 'city']) {
    await page.fill(`dialog input[name=${k}]`, GOOD[k])
  }
  await page.selectOption('dialog select[name=outlets]', GOOD.outlets)
  const consent = page.locator('dialog input[name=consent]')
  if (await consent.count()) await consent.check()
}

const VARIANTS = {
  a: {
    port: 4190,
    csp: [...BASE_CSP, "connect-src 'self' https://script.google.com https://script.googleusercontent.com"].join('; '),
  },
  b: {
    port: 4191,
    csp: [...BASE_CSP, `connect-src 'self' https://script.google.com https://script.googleusercontent.com ${MOCK}`].join('; '),
  },
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.xml': 'application/xml',
  '.txt': 'text/plain; charset=utf-8',
}

/** A deliberately header-free static server: whatever protection survives here
 *  is protection the HTML itself carries, which is exactly what Pages gives us. */
function serve(root, port) {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x')
    let p = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, '')
    if (p.endsWith('/')) p += 'index.html'
    const file = join(root, p)
    try {
      const s = await stat(file)
      if (s.isDirectory()) throw new Error('dir')
      res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream' })
      createReadStream(file).pipe(res)
    } catch {
      res.writeHead(404, { 'content-type': 'text/plain' })
      res.end('not found')
    }
  })
  return new Promise((ok) => server.listen(port, () => ok(server)))
}

async function build() {
  await new Promise((ok, fail) => {
    const p = spawn(
      'npx',
      ['vite', 'build', '--base=/foodos.ai/'],
      {
        cwd: `${REPO}/website`,
        env: { ...process.env, VITE_DEMO_REQUEST_URL: `${MOCK}/exec` },
        stdio: 'inherit',
      },
    )
    p.on('exit', (c) => (c === 0 ? ok() : fail(new Error(`vite build exited ${c}`))))
  })
}

/** Inject the meta CSP as the FIRST child of <head>: a meta policy only governs
 *  resources the parser reaches after it, so position is part of the test. */
async function patch(variant, csp) {
  const root = `${WORK}/${variant}`
  await rm(root, { recursive: true, force: true })
  await mkdir(`${root}/foodos.ai`, { recursive: true })
  await cp(DIST, `${root}/foodos.ai`, { recursive: true })
  const f = `${root}/foodos.ai/index.html`
  const html = await readFile(f, 'utf8')
  const meta =
    `<meta http-equiv="Content-Security-Policy" content="${csp}">\n    ` +
    `<meta name="referrer" content="strict-origin-when-cross-origin">\n    `
  const out = html.replace(/<head>\s*/, `<head>\n    ${meta}`)
  if (out === html) throw new Error('could not inject meta into <head>')
  await writeFile(f, out)
  return root
}

/** Collect CSP blocks from the DOM event as well as the console. */
async function instrument(page) {
  page.violations = []
  await page.exposeFunction('__cspViolation', (v) => page.violations.push(v))
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (e) => {
      window.__cspViolation({
        directive: e.effectiveDirective,
        blocked: String(e.blockedURI).slice(0, 120),
        sample: String(e.sample || '').slice(0, 120),
      })
    })
  })
}

const results = []
function record(name, pass, detail) {
  results.push({ name, pass, detail })
  console.log(`${pass ? '  ok  ' : '**FAIL**'}  ${name}${detail ? ` — ${detail}` : ''}`)
}

const b = await browser()

console.log('\n=== building sub-path bundle ===')
await build()

console.log('\n=== variant A: production policy as a meta tag ===')
const rootA = await patch('a', VARIANTS.a.csp)
const srvA = await serve(rootA, VARIANTS.a.port)
const urlA = `http://localhost:${VARIANTS.a.port}/foodos.ai/`

for (const [label, viewport] of Object.entries(VIEWPORTS)) {
  const page = await newPage(b, { viewport })
  await instrument(page)
  await page.goto(urlA, { waitUntil: 'load' })
  await settle(page)

  const rendered = await page.evaluate(() => ({
    h1: document.querySelector('h1')?.textContent?.trim() || null,
    sections: document.querySelectorAll('section').length,
    reactMounted: !!document.querySelector('#root')?.children.length,
    ctas: [...document.querySelectorAll('button, a')].filter((e) =>
      /book a demo/i.test(e.textContent || ''),
    ).length,
    cssApplied: getComputedStyle(document.body).backgroundColor,
  }))

  const errs = page.log.console.filter((m) => m.type === 'error')
  record(
    `@${label} page renders under meta CSP`,
    rendered.reactMounted && rendered.sections > 0 && !!rendered.h1,
    `h1=${JSON.stringify(rendered.h1)} sections=${rendered.sections} demo-CTAs=${rendered.ctas} body-bg=${rendered.cssApplied}`,
  )
  record(`@${label} zero CSP violations`, page.violations.length === 0,
    page.violations.length ? JSON.stringify(page.violations) : 'none')
  record(`@${label} zero console errors`, errs.length === 0,
    errs.length ? JSON.stringify(errs.slice(0, 3)) : 'none')
  record(`@${label} zero failed requests`, page.log.failed.length === 0,
    page.log.failed.length ? JSON.stringify(page.log.failed.slice(0, 3)) : 'none')

  await page.screenshot({ path: shot(`${label}/meta-csp-home.png`), fullPage: false })
  await page.ctx.close()
}

// The modal is the one piece of UI built entirely at runtime — if a policy is
// going to break something late, it breaks here.
{
  const page = await newPage(b)
  await instrument(page)
  await page.goto(urlA, { waitUntil: 'load' })
  await settle(page)
  await page.getByRole('button', { name: /book a demo/i }).first().click()
  await page.waitForSelector('dialog[open]', { timeout: 5000 })
  await settle(page, 400)
  const fields = await page.evaluate(
    () => document.querySelectorAll('dialog input, dialog select, dialog textarea').length,
  )
  record('modal opens and renders its fields under meta CSP', fields >= 5, `${fields} fields`)
  record('modal: zero CSP violations', page.violations.length === 0,
    page.violations.length ? JSON.stringify(page.violations) : 'none')
  await page.screenshot({ path: shot('1440/meta-csp-modal.png') })
  await page.ctx.close()
}

// What a meta tag cannot carry. Asserted against the live document rather than
// quoted from the spec, so the report states a measured fact.
{
  const page = await newPage(b)
  await page.goto(urlA, { waitUntil: 'load' })
  const res = await page.request.get(urlA)
  const headers = res.headers()
  const security = Object.keys(headers).filter((h) =>
    /content-security|strict-transport|x-frame|x-content-type|referrer-policy|permissions-policy|cross-origin/i.test(h),
  )
  record('a plain static host sends NO security response headers', security.length === 0,
    security.length ? security.join(', ') : 'none — confirms the headers must come from the HTML')

  await page.ctx.close()
}

// Clickjacking: the policy says `frame-ancestors 'none'`, but a meta tag cannot
// carry that directive. Rather than quote the spec, embed the site from a
// genuinely different origin and see whether the frame renders. `127.0.0.1` and
// `localhost` are different origins to the browser, so this is a real test.
{
  await mkdir(`${WORK}/attacker`, { recursive: true })
  const attacker = await serve(`${WORK}/attacker`, 4192)
  await writeFile(
    `${WORK}/attacker/index.html`,
    `<!doctype html><title>attacker</title><h1>attacker page</h1>
     <iframe id="victim" src="http://127.0.0.1:${VARIANTS.a.port}/foodos.ai/"
             width="1200" height="800"></iframe>`,
  )
  const page = await newPage(b)
  await page.goto('http://localhost:4192/', { waitUntil: 'load' })
  await page.waitForTimeout(3000)

  // A frame blocked by frame-ancestors stays on about:blank with no content.
  const victim = page.frames().find((f) => /foodos\.ai/.test(f.url()))
  const inside = victim
    ? await victim.evaluate(() => ({
        h1: document.querySelector('h1')?.textContent?.trim() || null,
        sections: document.querySelectorAll('section').length,
      })).catch(() => null)
    : null
  const refused = page.log.console.some((m) => /refused to (display|frame)/i.test(m.text))

  record(
    "frame-ancestors 'none' is NOT enforced from a meta tag — the site IS frameable cross-origin",
    !!inside?.h1 && !refused,
    `frame url=${victim?.url() || 'none'} h1=${JSON.stringify(inside?.h1)} sections=${inside?.sections} refusal-in-console=${refused}`,
  )
  await page.screenshot({ path: shot('1440/meta-csp-clickjack.png') })
  await page.ctx.close()
  attacker.close()
}

srvA.close()

console.log('\n=== variant B: same policy + mock origin in connect-src (form end to end) ===')
const rootB = await patch('b', VARIANTS.b.csp)
const srvB = await serve(rootB, VARIANTS.b.port)
const urlB = `http://localhost:${VARIANTS.b.port}/foodos.ai/`

await setMode('ok')
await reset()
{
  const page = await newPage(b)
  await instrument(page)
  await page.goto(urlB, { waitUntil: 'load' })
  await settle(page)
  await page.locator('.nav__cta button').click()
  await page.waitForSelector('dialog.modal input[name=name]')
  await fillForm(page)
  await page.click('dialog button[type=submit]')
  await page.waitForTimeout(3000)

  const got = await received()
  record('form POSTs successfully through the meta CSP', got.length === 1,
    `${got.length} payload(s) received`)
  record('form submit: zero CSP violations', page.violations.length === 0,
    page.violations.length ? JSON.stringify(page.violations) : 'none')
  const success = await page.evaluate(
    () => /thank|received|got it|in touch|reference/i.test(document.querySelector('dialog')?.textContent || ''),
  )
  record('success state renders', success, '')
  await page.screenshot({ path: shot('1440/meta-csp-form-success.png') })
  await page.ctx.close()
}

// The negative control: with the production policy (variant A, no mock origin),
// the same POST must be BLOCKED. That proves connect-src is genuinely enforced
// from a meta tag rather than silently ignored like frame-ancestors.
console.log('\n=== control: connect-src enforcement ===')
const srvA2 = await serve(rootA, VARIANTS.a.port)
await reset()
{
  const page = await newPage(b)
  await instrument(page)
  await page.goto(urlA, { waitUntil: 'load' })
  await settle(page)
  await page.locator('.nav__cta button').click()
  await page.waitForSelector('dialog.modal input[name=name]')
  await fillForm(page)
  await page.click('dialog button[type=submit]')
  await page.waitForTimeout(3000)
  const got = await received()
  const blocked = page.violations.some((v) => /connect-src/.test(v.directive))
  record('connect-src IS enforced from a meta tag (POST blocked, 0 received)',
    got.length === 0 && blocked,
    `received=${got.length} violations=${JSON.stringify(page.violations)}`)
  const shown = await page.evaluate(
    () => document.querySelector('dialog [role="alert"]')?.textContent?.trim() || null,
  )
  record('a CSP-blocked submit still shows the visitor an error', !!shown, JSON.stringify(shown))
  await page.screenshot({ path: shot('1440/meta-csp-blocked-submit.png') })
  await page.ctx.close()
}
srvA2.close()
srvB.close()

await b.close()

console.log('\n================ summary ================')
const failed = results.filter((r) => !r.pass)
for (const r of results) console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}`)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
process.exit(failed.length ? 1 : 0)
