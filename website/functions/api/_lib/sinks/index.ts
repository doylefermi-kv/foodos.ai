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
 * Throws if `google_sheet` is selected without complete credentials — failing
 * at startup is better than discovering it on the first real lead.
 */
export function selectSink(env: Env): LeadSink {
  const name = (env.LEAD_SINK ?? 'console').trim().toLowerCase()

  switch (name) {
    case 'console':
      return new ConsoleSink()

    case 'google_sheet':
    case 'google-sheet':
    case 'sheet': {
      const sheetId = env.SHEET_ID || env.GOOGLE_SHEET_ID
      const missing: string[] = []
      if (!sheetId) missing.push('SHEET_ID (or GOOGLE_SHEET_ID)')
      if (!env.GOOGLE_SERVICE_ACCOUNT_EMAIL) missing.push('GOOGLE_SERVICE_ACCOUNT_EMAIL')
      if (!env.GOOGLE_PRIVATE_KEY) missing.push('GOOGLE_PRIVATE_KEY')

      if (missing.length > 0) {
        throw new Error(`LEAD_SINK=google_sheet requires ${missing.join(', ')}`)
      }

      return new GoogleSheetSink({
        sheetId: sheetId!,
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
