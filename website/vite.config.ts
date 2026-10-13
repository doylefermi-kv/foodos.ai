import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

// Static marketing site, served by GitHub Pages from the artifact that
// `.github/workflows/website.yml` uploads. Build output is plain files in
// `dist/`; there is no server side left in this package (Revision 2 of
// docs/website-architecture.md moved the lead API to apps-script/).

/**
 * Where the site is served from.
 *
 * GitHub Pages publishes a *project* site under the repo name, so today that is
 * `https://doylefermi-kv.github.io/foodos.ai/` and every asset URL has to carry
 * the `/foodos.ai/` prefix. On a custom domain it becomes `/`. Both are one
 * environment variable, so switching domains is a variable change and a rebuild,
 * never a code edit — see docs/runbooks/website-setup.md (step 7).
 */
const DEFAULT_BASE = '/foodos.ai/'
const DEFAULT_SITE_ORIGIN = 'https://doylefermi-kv.github.io'

/** Vite requires `base` to start and end with `/`; be forgiving about input. */
function normaliseBase(value: string): string {
  const trimmed = value.trim()
  if (!trimmed || trimmed === '/') return '/'
  return `/${trimmed.replace(/^\/+/, '').replace(/\/+$/, '')}/`
}

/**
 * Everything GitHub Pages needs that Vite does not emit on its own.
 *
 * Runs in `closeBundle`, which is after Vite has copied `public/` into `dist/`,
 * so it can rewrite the files that came from there.
 */
function githubPagesAssets(outDir: string, base: string, siteOrigin: string): Plugin {
  // The site's own absolute URL, for the two static files that cannot use a
  // relative path: robots.txt's `Sitemap:` line and sitemap.xml's `<loc>` both
  // have to be absolute, by spec. src/lib/meta.ts handles the equivalent
  // problem for canonical/og:url at runtime; these two files have no runtime.
  const siteUrl = `${siteOrigin.replace(/\/+$/, '')}${base}`

  return {
    name: 'foodos:github-pages-assets',
    apply: 'build',
    closeBundle() {
      const dist = (file: string) => resolve(outDir, file)

      // Jekyll would otherwise refuse to publish paths starting with `_`.
      // `deploy-pages` skips Jekyll for uploaded artifacts, so this is belt and
      // braces — it costs one empty file and removes a whole class of surprise.
      writeFileSync(dist('.nojekyll'), '')

      // Pages serves 404.html for any unmatched path under the project's
      // sub-path. The app is a single page with hash-only navigation, so a copy
      // of index.html is both the branded 404 and a working page: it renders the
      // site rather than GitHub's generic grey 404. It must be a copy made HERE,
      // after the build, so it references the same content-hashed assets.
      const indexHtml = dist('index.html')
      if (!existsSync(indexHtml)) {
        this.error('index.html missing from the build output — cannot create 404.html')
      }
      writeFileSync(dist('404.html'), readFileSync(indexHtml))

      // `%SITE_URL%` in public/robots.txt and public/sitemap.xml, resolved at
      // build time so the sub-path build and a later custom-domain build are
      // each self-consistent. CI fails the build if a placeholder survives.
      for (const file of ['robots.txt', 'sitemap.xml']) {
        const path = dist(file)
        if (!existsSync(path)) continue
        const source = readFileSync(path, 'utf8')
        writeFileSync(path, source.replaceAll('%SITE_URL%', siteUrl))
      }
    },
  }
}

export default defineConfig(({ mode }) => {
  // Prefix '' loads every variable, not just VITE_ ones: BASE_PATH and SITE_ORIGIN
  // are build configuration and must NOT reach the browser bundle.
  const env = loadEnv(mode, process.cwd(), '')
  const base = normaliseBase(env.BASE_PATH ?? DEFAULT_BASE)
  const siteOrigin = env.SITE_ORIGIN?.trim() || DEFAULT_SITE_ORIGIN
  const outDir = resolve(process.cwd(), 'dist')

  return {
    base,
    plugins: [react(), githubPagesAssets(outDir, base, siteOrigin)],
    build: {
      target: 'es2022',
      cssCodeSplit: false,
      // The polyfill is an INLINE <script>, which the CSP in index.html blocks
      // (no 'unsafe-inline' on script-src). Every browser we target supports
      // modulepreload natively, so dropping it costs nothing.
      modulePreload: { polyfill: false },
    },
    server: {
      port: 5173,
    },
  }
})
