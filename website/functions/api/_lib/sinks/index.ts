/**
 * Sink selection. `LEAD_SINK` picks the implementation; the handler never knows
 * which one it got.
 */

import type { Env } from '../env.ts'
import type { LeadSink } from './sink.ts'
import { ConsoleSink } from './console-sink.ts'
import { GoogleSheetSink } from './google-sheet-sink.ts'

export type { LeadSink } from './sink.ts'
export { LeadSinkError } from './sink.ts'
export { ConsoleSink } from './console-sink.ts'
export { GoogleSheetSink } from './google-sheet-sink.ts'

/**
 * Build the sink named by `LEAD_SINK`. Defaults to `console` so a fresh
 * checkout runs with no configuration at all.
 *
 * The CTO settled the two naming collisions from FOO-2: the sink value is
 * `google_sheet` (underscore) and the spreadsheet id is `GOOGLE_SHEET_ID`.
 *
 * `google-sheet` is still accepted as a deprecated alias, with a warning. Nothing
 * we ship says the hyphen any more — `wrangler.toml` and the runbook both say
 * `google_sheet` — so this is now only a safety net for a value typed into the
 * Cloudflare dashboard by hand before that was settled. An unrecognised
 * LEAD_SINK 502s every lead, which is a bad way to find out. @Backend: safe to
 * delete once a deploy has been seen writing rows.
 *
 * Throws if `google_sheet` is selected without complete credentials — failing
 * at startup is better than discovering it on the first real lead.
 */
export function selectSink(env: Env, logger: Pick<Console, 'warn'> = console): LeadSink {
  const name = (env.LEAD_SINK ?? 'console').trim().toLowerCase()

  if (name === 'google-sheet') {
    logger.warn(
      '[lead:sink] LEAD_SINK="google-sheet" is deprecated; the agreed value is "google_sheet".',
    )
  }

  switch (name) {
    case 'console':
      return new ConsoleSink()

    case 'google-sheet':
    case 'google_sheet': {
      const missing: string[] = []
      if (!env.GOOGLE_SHEET_ID) missing.push('GOOGLE_SHEET_ID')
      if (!env.GOOGLE_SERVICE_ACCOUNT_EMAIL) missing.push('GOOGLE_SERVICE_ACCOUNT_EMAIL')
      if (!env.GOOGLE_PRIVATE_KEY) missing.push('GOOGLE_PRIVATE_KEY')

      if (missing.length > 0) {
        throw new Error(`LEAD_SINK=google_sheet requires ${missing.join(', ')}`)
      }

      return new GoogleSheetSink({
        sheetId: env.GOOGLE_SHEET_ID!,
        range: env.SHEET_RANGE,
        credentials: {
          clientEmail: env.GOOGLE_SERVICE_ACCOUNT_EMAIL!,
          privateKey: env.GOOGLE_PRIVATE_KEY!,
        },
      })
    }

    default:
      throw new Error(`Unknown LEAD_SINK "${name}" (expected "console" or "google_sheet")`)
  }
}
