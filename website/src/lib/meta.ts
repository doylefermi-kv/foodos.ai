/**
 * Canonical / Open Graph URLs under a sub-path.
 *
 * The site is served from `/foodos.ai/` on GitHub Pages (FOO-6) and from `/`
 * on the real domain later. Asset URLs in `index.html` handle that with
 * `%BASE_URL%`, but the *page's own* URL cannot: Open Graph needs it absolute,
 * and only the browser knows which origin actually served the page. So the
 * markup carries the production URL (what a non-JS crawler should see) and we
 * correct it on boot to wherever this copy really lives.
 */

/** Resolve a `%BASE_URL%`-relative URL against the page's own origin. */
export function absoluteUrl(value: string, origin: string): string {
  try {
    return new URL(value, origin).href
  } catch {
    // A malformed origin (never in a browser) must not take the page down.
    return value
  }
}

/** The absolute URL of this page: origin + whatever base it was built with. */
export function pageUrl(base: string, origin: string): string {
  return absoluteUrl(base || '/', origin)
}

function readBaseUrl(): string {
  try {
    return import.meta.env.BASE_URL || '/'
  } catch {
    return '/'
  }
}

export function applyAbsoluteMetaUrls(
  doc: Document = document,
  origin: string = window.location.origin,
  base: string = readBaseUrl(),
): void {
  const here = pageUrl(base, origin)
  for (const [selector, attribute] of [
    ['link[rel="canonical"]', 'href'],
    ['meta[property="og:url"]', 'content'],
  ] as const) {
    doc.querySelector(selector)?.setAttribute(attribute, here)
  }

  // These already point at a real file via %BASE_URL%; they only need the origin.
  for (const [selector, attribute] of [
    ['meta[property="og:image"]', 'content'],
    ['meta[name="twitter:image"]', 'content'],
  ] as const) {
    const element = doc.querySelector(selector)
    const value = element?.getAttribute(attribute)
    if (element && value) element.setAttribute(attribute, absoluteUrl(value, origin))
  }
}
