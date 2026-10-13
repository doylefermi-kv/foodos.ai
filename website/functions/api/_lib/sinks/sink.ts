/**
 * The seam that lets us swap the lead store without touching the frontend.
 * Adding Postgres or a CRM later means one new file implementing `LeadSink`
 * and one new case in `selectSink` — nothing else changes.
 */

import type { Lead } from '../lead.ts'

export interface LeadSink {
  /** Human-readable name, used in logs. */
  readonly name: string
  /**
   * Persist a lead. Throws `LeadSinkError` on failure — the handler turns that
   * into a 502 and logs the full payload so the lead is recoverable from logs.
   */
  write(lead: Lead): Promise<void>
}

export class LeadSinkError extends Error {
  readonly sink: string
  readonly cause?: unknown

  constructor(sink: string, message: string, cause?: unknown) {
    super(message)
    this.name = 'LeadSinkError'
    this.sink = sink
    this.cause = cause
  }
}
