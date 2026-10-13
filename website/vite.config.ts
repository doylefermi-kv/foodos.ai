import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Static marketing site. Build output is plain files in `dist/`, which is what
// Cloudflare Pages serves; `functions/api/` (Backend Engineer) is picked up by
// `wrangler pages dev dist` and is deliberately outside the Vite build.
export default defineConfig({
  plugins: [react()],
  build: {
    target: 'es2022',
    cssCodeSplit: false,
    // The polyfill is an INLINE <script>, which the CSP in public/_headers
    // blocks (no 'unsafe-inline' on script-src). Every browser we target
    // supports modulepreload natively, so dropping it costs nothing.
    // See the note at the top of public/_headers (DevOps, FOO-4).
    modulePreload: { polyfill: false },
  },
  server: {
    port: 5173,
    proxy: {
      // `npm run dev:ui` gives HMR but no Pages Functions. Point /api at a
      // `wrangler pages dev` on 8788 so the form can be exercised end to end
      // without giving up fast reloads.
      '/api': {
        target: 'http://127.0.0.1:8788',
        changeOrigin: true,
      },
    },
  },
})
