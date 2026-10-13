/**
 * Environment bindings and a minimal Pages Function context type.
 *
 * Typed locally rather than importing `@cloudflare/workers-types` so the
 * backend adds no dependency to the site. If DevOps later adds that package,
 * `PagesFunctionContext` can be replaced by `EventContext<Env, string, unknown>`
 * with no change to call sites.
 */

export interface Env {
  /** `console` (default) or `google_sheet`. */
  LEAD_SINK?: string;
  GOOGLE_SERVICE_ACCOUNT_EMAIL?: string;
  /** PKCS#8 PEM. Literal `\n` escapes are accepted and unescaped. */
  GOOGLE_PRIVATE_KEY?: string;
  /**
   * The spreadsheet id. FOO-2 originally said `SHEET_ID`; the CTO settled on
   * `GOOGLE_SHEET_ID`, matching the DevOps scaffolding and the runbook. That is
   * now the only name read — `SHEET_ID` is gone, so a stale one fails loudly at
   * sink selection rather than silently overriding.
   */
  GOOGLE_SHEET_ID?: string;
  /** Tab/range to append to. Defaults to `Leads`. */
  SHEET_RANGE?: string;
  TURNSTILE_SECRET_KEY?: string;
  /** Optional comma-separated CORS allowlist. Localhost is always allowed. */
  ALLOWED_ORIGINS?: string;
  /** Optional overrides for the per-IP rate limit. */
  RATE_LIMIT_MAX?: string;
  RATE_LIMIT_WINDOW_SECONDS?: string;
}

export interface PagesFunctionContext<E = Env> {
  request: Request;
  env: E;
  waitUntil(promise: Promise<unknown>): void;
}

export type PagesFunctionHandler<E = Env> = (
  context: PagesFunctionContext<E>,
) => Response | Promise<Response>;
