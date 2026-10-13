import type { Attribution } from '../../shared/contract'

const KEY = 'foodos.attribution.v1'

const UTM_KEYS = {
  utm_source: 'utmSource',
  utm_medium: 'utmMedium',
  utm_campaign: 'utmCampaign',
  utm_term: 'utmTerm',
  utm_content: 'utmContent',
} as const satisfies Record<string, keyof Attribution>

/** Keeps a stray 4 KB query string out of the Sheet. */
const MAX_VALUE = 256

function clean(value: string | null): string | undefined {
  if (!value) return undefined
  const trimmed = value.trim().slice(0, MAX_VALUE)
  return trimmed || undefined
}

function capture(): Attribution {
  const params = new URLSearchParams(window.location.search)
  const attribution: Attribution = {}

  for (const [param, field] of Object.entries(UTM_KEYS) as [
    keyof typeof UTM_KEYS,
    keyof Attribution,
  ][]) {
    const value = clean(params.get(param))
    if (value) attribution[field] = value
  }

  // An internal referrer means this is not the first visit of the session —
  // but we only ever get here once, so same-origin referrers are still noise.
  const referrer = clean(document.referrer)
  if (referrer && !referrer.startsWith(window.location.origin)) {
    attribution.referrer = referrer
  }

  attribution.landingPath = clean(window.location.pathname + window.location.search)

  return attribution
}

/**
 * First visit of the session wins: later navigations (and the `?utm_*`-free
 * URL after a share) must not overwrite how the visitor actually arrived.
 * sessionStorage, not localStorage — no cookie banner, no cross-session tracking.
 */
export function getAttribution(): Attribution {
  let stored: string | null = null
  try {
    stored = window.sessionStorage.getItem(KEY)
  } catch {
    // Private mode / storage disabled — fall through to a fresh capture.
  }

  if (stored) {
    try {
      return JSON.parse(stored) as Attribution
    } catch {
      // Corrupt entry; overwrite it below.
    }
  }

  const attribution = capture()
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify(attribution))
  } catch {
    // Not worth failing a form submit over.
  }
  return attribution
}
