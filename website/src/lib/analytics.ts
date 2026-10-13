/**
 * Analytics seam.
 *
 * There is no analytics tool yet — it is an open CTO decision (Revision 2 in
 * `docs/website-architecture.md`); Cloudflare Web Analytics went away with
 * Cloudflare. This no-op keeps the *call sites* in place, so adding GA4,
 * Plausible or anything else later is a one-line change here rather than a
 * hunt for the two events worth measuring.
 *
 * Events currently fired:
 *   demo_open    { source }  — the Book-a-demo modal opened
 *   demo_submit  { outlets, city, hasReference } — a lead was accepted
 */

export type TrackProps = Record<string, string | number | boolean | undefined>

function isDev(): boolean {
  try {
    return Boolean(import.meta.env.DEV)
  } catch {
    return false
  }
}

export function track(event: string, props: TrackProps = {}): void {
  // Deliberately not sent anywhere. In dev it is visible in the console so the
  // events can be eyeballed while building.
  if (isDev()) console.debug('[track]', event, props)
}
