/**
 * Local-dev and test sink. Prints the sheet row exactly as `GoogleSheetSink`
 * would append it, so `wrangler pages dev` shows what production would store.
 */

import type { Lead } from '../lead.ts'
import { toSheetRow } from '../lead.ts'
import { SHEET_COLUMNS } from '../../../../shared/contract.ts'
import type { LeadSink } from './sink.ts'

export interface ConsoleSinkOptions {
  /** Injectable for tests. */
  logger?: Pick<Console, 'log'>
}

export class ConsoleSink implements LeadSink {
  readonly name = 'console'
  private readonly logger: Pick<Console, 'log'>

  constructor(options: ConsoleSinkOptions = {}) {
    this.logger = options.logger ?? console
  }

  async write(lead: Lead): Promise<void> {
    const row = toSheetRow(lead)
    const record = Object.fromEntries(SHEET_COLUMNS.map((column, i) => [column, row[i]]))

    this.logger.log(
      `[lead:console] ${lead.id} ${lead.request.restaurantName} <${lead.request.phone}>`,
    )
    this.logger.log(JSON.stringify({ sink: 'console', row, record }, null, 2))
  }
}
