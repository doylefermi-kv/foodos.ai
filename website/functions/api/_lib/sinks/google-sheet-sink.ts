/**
 * Appends leads to a Google Sheet via the Sheets API `values.append`.
 *
 * Authenticated with a service-account JWT signed through WebCrypto — no
 * `googleapis` Node SDK, which cannot run in the Workers runtime. The sheet
 * must be shared with `GOOGLE_SERVICE_ACCOUNT_EMAIL` as an editor.
 */

import type { Lead } from '../lead.ts'
import { toSheetRow } from '../lead.ts'
import type { ServiceAccountCredentials, FetchLike } from '../google-auth.ts'
import { getAccessToken } from '../google-auth.ts'
import type { LeadSink } from './sink.ts'
import { LeadSinkError } from './sink.ts'

export interface GoogleSheetSinkOptions {
  sheetId: string
  credentials: ServiceAccountCredentials
  /** Tab name or A1 range to append after. Defaults to `Leads`. */
  range?: string
  fetchImpl?: FetchLike
}

export class GoogleSheetSink implements LeadSink {
  readonly name = 'google_sheet'

  private readonly sheetId: string
  private readonly credentials: ServiceAccountCredentials
  private readonly range: string
  private readonly fetchImpl: FetchLike

  constructor(options: GoogleSheetSinkOptions) {
    this.sheetId = options.sheetId
    this.credentials = options.credentials
    this.range = options.range ?? 'Leads'
    this.fetchImpl = options.fetchImpl ?? fetch
  }

  async write(lead: Lead): Promise<void> {
    const row = toSheetRow(lead)

    let accessToken: string
    try {
      accessToken = await getAccessToken(this.credentials, { fetchImpl: this.fetchImpl })
    } catch (error) {
      throw new LeadSinkError(this.name, 'Google authentication failed', error)
    }

    const url =
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(this.sheetId)}` +
      `/values/${encodeURIComponent(this.range)}:append` +
      // RAW so a lead's text is never reinterpreted as a formula or a date.
      `?valueInputOption=RAW&insertDataOption=INSERT_ROWS`

    let response: Response
    try {
      response = await this.fetchImpl(url, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${accessToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ values: [row] }),
      })
    } catch (error) {
      throw new LeadSinkError(this.name, 'Sheets API request failed', error)
    }

    if (!response.ok) {
      const detail = await response.text().catch(() => '')
      throw new LeadSinkError(
        this.name,
        `Sheets append failed (${response.status}): ${detail.slice(0, 500)}`,
      )
    }
  }
}
