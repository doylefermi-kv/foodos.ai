/**
 * Cloudflare Turnstile loader.
 *
 * The script is fetched lazily — only once the demo form is actually opened —
 * so it never sits on the critical path of the landing page. The widget is
 * rendered explicitly (`render=explicit`) rather than by auto-scanning the DOM,
 * because React owns the container element.
 */

export interface TurnstileRenderOptions {
  sitekey: string
  callback: (token: string) => void
  'error-callback'?: () => void
  'expired-callback'?: () => void
  'timeout-callback'?: () => void
  theme?: 'light' | 'dark' | 'auto'
  action?: string
  appearance?: 'always' | 'execute' | 'interaction-only'
}

interface TurnstileApi {
  render: (el: HTMLElement, options: TurnstileRenderOptions) => string
  remove: (widgetId: string) => void
  reset: (widgetId?: string) => void
}

declare global {
  interface Window {
    turnstile?: TurnstileApi
    onTurnstileLoad?: () => void
  }
}

const SCRIPT_SRC =
  'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=onTurnstileLoad'

/** Cloudflare's documented "always passes, visible" test key. */
export const TEST_SITE_KEY = '1x00000000000000000000AA'

export const SITE_KEY: string =
  import.meta.env.VITE_TURNSTILE_SITE_KEY || TEST_SITE_KEY

/** The script is slow or blocked often enough that an unbounded wait is a bug. */
const LOAD_TIMEOUT_MS = 10_000

let loader: Promise<TurnstileApi> | null = null

export function loadTurnstile(): Promise<TurnstileApi> {
  if (loader) return loader

  loader = new Promise<TurnstileApi>((resolve, reject) => {
    if (window.turnstile) {
      resolve(window.turnstile)
      return
    }

    const timer = window.setTimeout(() => {
      reject(new Error('Turnstile script timed out'))
    }, LOAD_TIMEOUT_MS)

    const settle = () => {
      window.clearTimeout(timer)
      if (window.turnstile) resolve(window.turnstile)
      else reject(new Error('Turnstile script loaded without an API'))
    }

    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${SCRIPT_SRC}"]`,
    )
    if (existing) {
      window.onTurnstileLoad = settle
      existing.addEventListener('error', () => {
        window.clearTimeout(timer)
        reject(new Error('Turnstile script failed to load'))
      })
      return
    }

    window.onTurnstileLoad = settle

    const script = document.createElement('script')
    script.src = SCRIPT_SRC
    script.async = true
    script.defer = true
    script.addEventListener('error', () => {
      window.clearTimeout(timer)
      reject(new Error('Turnstile script failed to load'))
    })
    document.head.appendChild(script)
  })

  // A failed load must not be cached — reopening the form should retry.
  loader.catch(() => {
    loader = null
  })

  return loader
}
