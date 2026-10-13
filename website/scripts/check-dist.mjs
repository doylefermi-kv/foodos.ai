/**
 * Gate on the four ways a GitHub Pages build can look fine and still ship broken.
 *
 * Run by `npm run check:dist` after `npm run build`, in CI and locally. All of
 * these have a failure mode that is invisible in the build log and obvious only
 * once the site is live, which is the worst time to find out:
 *
 *   1. A bare `vite build` with the wrong `base` produces `/assets/...` URLs and
 *      a blank page at /foodos.ai/. QA flagged exactly this (FOO-9-08).
 *   2. A missing 404.html means GitHub's generic grey page for every bad path.
 *   3. An unreplaced %SITE_URL% ships a literal placeholder to crawlers.
 *   4. A reintroduced `_headers` is a Cloudflare artifact GitHub Pages serves
 *      as a public file while applying none of it (FOO-9-03).
 *
 * Exits non-zero with a GitHub Actions error annotation on the first failure.
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const dist = join(import.meta.dirname, '..', 'dist')
const base = process.env.BASE_PATH?.trim() || '/foodos.ai/'

const problems = []
const fail = (message) => problems.push(message)

for (const file of ['index.html', '404.html', '.nojekyll', 'robots.txt', 'sitemap.xml']) {
  if (!existsSync(join(dist, file))) fail(`dist/${file} is missing`)
}

if (existsSync(join(dist, '_headers'))) {
  fail('dist/_headers exists — GitHub Pages ignores it and serves it publicly (FOO-9-03)')
}

if (existsSync(join(dist, 'index.html'))) {
  const html = readFileSync(join(dist, 'index.html'), 'utf8')

  // Every local reference must carry the base. Absolute http(s) URLs are the
  // canonical/og:url pair, which src/lib/meta.ts rewrites at runtime by design.
  const local = [...html.matchAll(/(?:href|src|content)="(\/[^"]*)"/g)].map((m) => m[1])
  const wrong = local.filter((url) => !url.startsWith(base))
  if (wrong.length > 0) {
    fail(`index.html references ${wrong.length} path(s) outside base "${base}": ${wrong.join(', ')}`)
  }
  if (local.length === 0) fail('index.html references no local assets at all — did the build run?')

  if (!/http-equiv="Content-Security-Policy"/.test(html)) {
    fail('index.html has no meta CSP — Pages cannot send headers, so this is the only policy there is')
  }
}

for (const file of ['robots.txt', 'sitemap.xml']) {
  const path = join(dist, file)
  if (existsSync(path) && readFileSync(path, 'utf8').includes('%SITE_URL%')) {
    fail(`dist/${file} still contains the %SITE_URL% placeholder`)
  }
}

if (problems.length > 0) {
  for (const problem of problems) console.error(`::error::${problem}`)
  process.exit(1)
}

console.log(`dist/ is deployable under base "${base}":`)
for (const entry of readdirSync(dist)) console.log(`  ${entry}`)
