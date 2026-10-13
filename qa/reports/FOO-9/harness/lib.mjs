import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

export const OUT = '/Users/doyle/Documents/Demo/PaperClip/foodos/qa/reports/FOO-9/screens'
export const BUILD = 'http://localhost:4174/foodos.ai/'
export const BUILD_UNSET = 'http://localhost:4175/foodos.ai/'
export const DEV = 'http://localhost:5173/'
export const DESIGN = 'http://localhost:4180/website/v3-bazaar/index.html'
export const MOCK = 'http://127.0.0.1:8799'

export const VIEWPORTS = {
  1440: { width: 1440, height: 900 },
  1024: { width: 1024, height: 800 },
  390: { width: 390, height: 844 },
}

export async function browser(opts = {}) {
  return chromium.launch({ channel: 'chrome', ...opts })
}

/** A page that records everything we might later call a finding. */
export async function newPage(b, { viewport = VIEWPORTS[1440], ...rest } = {}) {
  const ctx = await b.newContext({ viewport, deviceScaleFactor: 1, ...rest })
  const page = await ctx.newPage()
  const log = { console: [], pageErrors: [], requests: [], failed: [] }
  page.on('console', (m) => log.console.push({ type: m.type(), text: m.text() }))
  page.on('pageerror', (e) => log.pageErrors.push(String(e)))
  page.on('request', (r) => log.requests.push({ method: r.method(), url: r.url() }))
  page.on('requestfailed', (r) =>
    log.failed.push({ url: r.url(), error: r.failure()?.errorText }),
  )
  page.log = log
  page.ctx = ctx
  return page
}

export function shot(name) {
  const path = resolve(OUT, name)
  mkdirSync(dirname(path), { recursive: true })
  return path
}

export async function settle(page, ms = 700) {
  await page.waitForLoadState('networkidle').catch(() => {})
  await page.waitForTimeout(ms)
}

/** Freeze the marquee/wheel animations so paired screenshots are comparable. */
export async function freezeMotion(page) {
  await page.addStyleTag({
    content: `*, *::before, *::after { animation-play-state: paused !important;
      animation-delay: 0s !important; transition: none !important; }`,
  })
}

export async function setMode(mode) {
  const res = await fetch(`${MOCK}/__mode?set=${mode}`)
  return res.json()
}

export async function received() {
  const res = await fetch(`${MOCK}/__received`)
  return res.json()
}

export async function reset() {
  await fetch(`${MOCK}/__reset`)
}

export function hostsOf(requests) {
  const hosts = new Set()
  for (const r of requests) {
    try {
      hosts.add(new URL(r.url).host)
    } catch {
      hosts.add(r.url.slice(0, 24))
    }
  }
  return [...hosts].sort()
}

/** Console noise that matters: errors and warnings, minus Vite's dev chatter. */
export function noise(log) {
  return log.console.filter(
    (m) =>
      (m.type === 'error' || m.type === 'warning') &&
      !/\[vite\]|Download the React DevTools/.test(m.text),
  )
}
