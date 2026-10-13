/**
 * The lead record and its mapping onto a Google Sheet row.
 *
 * The column order in `SHEET_COLUMNS` (shared/contract.ts) is fixed by
 * `docs/website-architecture.md`. `toSheetRow` must stay in lockstep with it —
 * the test `row mapping` asserts that, so reordering one without the other
 * fails loudly rather than silently writing leads into the wrong columns.
 */

import type { ValidatedDemoRequest } from '../../../shared/contract.ts';
import { SHEET_COLUMNS } from '../../../shared/contract.ts';

export type LeadStatus = 'new';

export interface Lead {
  id: string;
  /** ISO 8601 with the +05:30 offset — the sales team reads this in IST. */
  receivedAt: string;
  request: ValidatedDemoRequest;
  userAgent: string;
  status: LeadStatus;
}

const IST_OFFSET_MINUTES = 5 * 60 + 30;

/**
 * Format a timestamp as an ISO 8601 string in IST, e.g.
 * `2026-10-13T15:31:08.266+05:30`.
 *
 * Google Sheets renders this as a readable timestamp and it still sorts
 * lexicographically, which a localised format would not.
 */
export function toIstIsoString(date: Date): string {
  const shifted = new Date(date.getTime() + IST_OFFSET_MINUTES * 60_000);
  return `${shifted.toISOString().slice(0, -1)}+05:30`;
}

export function createLead(
  request: ValidatedDemoRequest,
  options: { id: string; receivedAt: Date; userAgent: string },
): Lead {
  return {
    id: options.id,
    receivedAt: toIstIsoString(options.receivedAt),
    request,
    userAgent: options.userAgent,
    status: 'new',
  };
}

/**
 * Flatten a lead into a row of strings, in `SHEET_COLUMNS` order.
 * Absent optional values become `''` so every row has the same width.
 */
export function toSheetRow(lead: Lead): string[] {
  const r = lead.request;
  const a = r.attribution ?? {};

  const byColumn: Record<(typeof SHEET_COLUMNS)[number], string | undefined> = {
    id: lead.id,
    receivedAt: lead.receivedAt,
    name: r.name,
    phone: r.phone,
    email: r.email,
    restaurantName: r.restaurantName,
    city: r.city,
    outlets: r.outlets,
    restaurantType: r.restaurantType,
    preferredLanguage: r.preferredLanguage,
    message: r.message,
    utmSource: a.utmSource,
    utmMedium: a.utmMedium,
    utmCampaign: a.utmCampaign,
    utmTerm: a.utmTerm,
    utmContent: a.utmContent,
    referrer: a.referrer,
    landingPath: a.landingPath,
    userAgent: lead.userAgent,
    status: lead.status,
  };

  return SHEET_COLUMNS.map((column) => {
    const value = byColumn[column] ?? '';
    // `phone` is not free text by this point — it is whatever `normalisePhone`
    // produced, i.e. `+91` and ten digits. Escaping it would write a stray
    // apostrophe into every row.
    return column === 'phone' ? value : sanitizeCell(value);
  });
}

/**
 * Blunt the classic spreadsheet-injection starters. The sheet is written with
 * `valueInputOption=RAW`, so nothing is evaluated on write; this protects the
 * next hop — a CSV export opened in Excel, where `=`, `+`, `-` and `@` all
 * begin a formula.
 */
function sanitizeCell(value: string): string {
  return /^[=+\-@]/.test(value) ? `'${value}` : value;
}
