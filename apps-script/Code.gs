/**
 * FoodOS.ai — demo-request web app, bound to the leads Google Sheet.
 *
 * This single file IS the API. Paste it into the Sheet's bound Apps Script
 * project (Extensions → Apps Script), deploy it as a web app, and the static
 * site on GitHub Pages posts leads straight here. Deploy steps, the response
 * mapping and the verification curls are in `apps-script/README.md`.
 *
 * It replaces the Cloudflare Pages Function (CTO decision, Revision 2 of
 * `docs/website-architecture.md`: no Cloudflare).
 *
 * THREE RULES FOR EDITING THIS FILE
 * 1. Self-contained. No imports, no npm, no build step — what is here is what
 *    runs. Apps Script has no module system, so everything is a global.
 * 2. Top-level values are `var`, never `const`/`let`. The Node test harness
 *    (`tests/apps-script-env.js`) loads this file into a `vm` sandbox and reads
 *    the functions off the sandbox's global object; `const` at top level is not
 *    a global property and would be invisible to the tests.
 * 3. The validation below is a port of `website/shared/contract.ts`. The two
 *    must agree exactly: `tests/parity.test.ts` runs both over the same
 *    fixtures and fails if they drift. Change the contract first, then here.
 *
 * Pipeline, cheapest check first so a flood costs as little as possible:
 *   global per-minute cap (cache) → JSON parse → honeypot → validation
 *   → per-phone duplicate window (cache) → lock → append.
 *
 * An Apps Script web app ALWAYS answers HTTP 200, even for a thrown error, so
 * the status code carries no meaning. Every response is JSON with an explicit
 * `ok` flag and the client branches on the body:
 *   { ok: true,  id }
 *   { ok: false, error: "validation", fields: { <field>: <message> } }
 *   { ok: false, error: "bot" | "rate_limited" | "upstream" }
 */

/* ------------------------------------------------------------------ */
/* Configuration                                                       */
/* ------------------------------------------------------------------ */

/** Tab the leads are appended to. Created with headers if it is missing. */
var LEADS_SHEET_NAME = 'Leads';

var THROTTLE = {
  /** The same phone inside this window is treated as a duplicate submit. */
  duplicateWindowSeconds: 10 * 60,
  /** Ceiling on accepted leads per wall-clock minute, across all callers. */
  globalPerMinute: 30,
  /** How long to wait for the append lock before giving up. */
  lockTimeoutMs: 15000
};

/* ------------------------------------------------------------------ */
/* Contract — ported from website/shared/contract.ts                   */
/* ------------------------------------------------------------------ */

/**
 * Column order is fixed by `docs/website-architecture.md`. Append only —
 * never reorder: sheets in the wild already carry these headers.
 */
var SHEET_COLUMNS = [
  'id',
  'receivedAt',
  'name',
  'phone',
  'email',
  'restaurantName',
  'city',
  'outlets',
  'restaurantType',
  'preferredLanguage',
  'message',
  'utmSource',
  'utmMedium',
  'utmCampaign',
  'utmTerm',
  'utmContent',
  'referrer',
  'landingPath',
  'userAgent',
  'status'
];

var OUTLETS = ['1', '2-5', '6-20', '20+'];

var RESTAURANT_TYPES = [
  'qsr',
  'cafe',
  'cloud_kitchen',
  'casual_dining',
  'fine_dining',
  'bar',
  'other'
];

var ATTRIBUTION_KEYS = [
  'utmSource',
  'utmMedium',
  'utmCampaign',
  'utmTerm',
  'utmContent',
  'referrer',
  'landingPath'
];

var LIMITS = {
  name: { min: 2, max: 80 },
  restaurantName: { min: 2, max: 120 },
  city: { min: 2, max: 80 },
  email: { max: 160 },
  message: { max: 1000 },
  preferredLanguage: { max: 10 },
  /** Attribution values longer than this are truncated, never rejected. */
  attributionValue: { max: 500 },
  /** Same treatment for the browser-supplied user agent. */
  userAgent: { max: 500 }
};

/**
 * Indian mobile numbers: 10 digits starting 6–9, optionally prefixed with
 * +91 / 91 / 0.
 */
var INDIAN_MOBILE_RE = /^(?:\+?91[\s-]?|0)?([6-9]\d{9})$/;

/** Deliberately permissive — the real check is that a human reads the reply. */
var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/* ------------------------------------------------------------------ */
/* Web app entry points                                                */
/* ------------------------------------------------------------------ */

/**
 * POST /exec — the one conversion endpoint of the marketing site.
 *
 * The browser sends `Content-Type: text/plain;charset=utf-8` so the request
 * stays "simple" and never triggers a CORS preflight, which an Apps Script web
 * app cannot answer. The body is still JSON; only the header is a white lie.
 */
function doPost(e) {
  var cache = CacheService.getScriptCache();

  try {
    // 1. Global cap. Free, and it bounds the cost of everything below.
    if (!underGlobalCap_(cache)) {
      console.warn('[demo-requests] over the global per-minute cap');
      return jsonOutput_({ ok: false, error: 'rate_limited' });
    }

    // 2. Body.
    var body = parseJsonObject_(e && e.postData ? e.postData.contents : '');
    if (body === null) {
      return jsonOutput_({
        ok: false,
        error: 'validation',
        fields: { name: 'Expected a JSON object.' }
      });
    }

    // 3. Honeypot. A filled hidden field is a bot, and it never gets told why.
    if (isHoneypotTripped(body)) {
      console.warn('[demo-requests] honeypot tripped');
      return jsonOutput_({ ok: false, error: 'bot' });
    }

    // 4. Validation.
    var parsed = parseDemoRequest(body);
    if (!parsed.ok) {
      return jsonOutput_({ ok: false, error: 'validation', fields: parsed.fields });
    }
    var request = parsed.value;

    // 5. Duplicate submit. Needs the normalised phone, so it runs after parse.
    if (isDuplicatePhone_(cache, request.phone)) {
      console.warn('[demo-requests] duplicate within the window phone=' + request.phone);
      return jsonOutput_({ ok: false, error: 'rate_limited' });
    }

    // 6. Persist.
    var lead = createLead(request, { id: Utilities.getUuid(), receivedAt: new Date() });
    try {
      appendLead_(lead);
    } catch (appendError) {
      // Never lose a lead silently: the whole payload goes to the execution log
      // (Apps Script → Executions) so it can be replayed into the sheet by hand.
      console.error('[demo-requests] append failed: ' + describeError_(appendError));
      console.error('[demo-requests] UNSAVED LEAD ' + JSON.stringify(lead));
      return jsonOutput_({ ok: false, error: 'upstream' });
    }

    // Only remembered once the row is safely in the sheet, so a failed append
    // never locks the visitor out of retrying.
    rememberPhone_(cache, request.phone);

    console.log('[demo-requests] stored lead ' + lead.id);
    return jsonOutput_({ ok: true, id: lead.id });
  } catch (error) {
    // Anything unforeseen still answers in the contract's shape rather than
    // letting Apps Script return its HTML error page.
    console.error('[demo-requests] unhandled: ' + describeError_(error));
    return jsonOutput_({ ok: false, error: 'upstream' });
  }
}

/**
 * GET /exec — health check for the runbook's verification step. Deliberately
 * says nothing about the sheet or its contents: this URL is public.
 */
function doGet(e) {
  return jsonOutput_({ ok: true, service: 'foodos-leads' });
}

/* ------------------------------------------------------------------ */
/* Validation — keep in lockstep with shared/contract.ts               */
/* ------------------------------------------------------------------ */

/**
 * Coerce unknown input to a string. The web app receives untrusted JSON, so a
 * non-string `name` must validate-and-fail, never throw.
 */
function str_(value) {
  return typeof value === 'string' ? value : '';
}

/** Trimmed value, or undefined when blank — so optional fields stay absent. */
function optional_(value) {
  var trimmed = str_(value).trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/** Returns +91XXXXXXXXXX, or null if the input is not an Indian mobile. */
function normalisePhone(raw) {
  // Strip formatting, then the 00-international prefix the regex doesn't cover.
  var cleaned = str_(raw).replace(/[\s()-]/g, '').replace(/^00/, '+');
  var match = INDIAN_MOBILE_RE.exec(cleaned);
  return match ? '+91' + match[1] : null;
}

function isValidEmail(value) {
  return EMAIL_RE.test(str_(value)) && str_(value).length <= LIMITS.email.max;
}

/**
 * Field-level validation. Returns a map of field -> message; an empty object
 * means valid. The messages are the ones the form already shows, word for word.
 *
 * The honeypot (`website`) is NOT checked here. A filled honeypot is a bot
 * signal handled by `doPost`, not a validation error a human should ever see.
 */
function validateDemoRequest(input) {
  var fields = {};

  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return { name: 'Expected a JSON object.' };
  }
  var body = input;

  var name = str_(body.name).trim();
  if (name.length < LIMITS.name.min || name.length > LIMITS.name.max) {
    fields.name =
      'Please enter your name (' + LIMITS.name.min + '–' + LIMITS.name.max + ' characters).';
  }

  if (!normalisePhone(str_(body.phone))) {
    fields.phone = 'Enter a 10-digit Indian mobile number, e.g. 98765 43210.';
  }

  var email = str_(body.email).trim();
  if (email && !isValidEmail(email)) {
    fields.email = 'That email address does not look right.';
  }

  var restaurantName = str_(body.restaurantName).trim();
  if (
    restaurantName.length < LIMITS.restaurantName.min ||
    restaurantName.length > LIMITS.restaurantName.max
  ) {
    fields.restaurantName =
      "Please enter your restaurant's name (" +
      LIMITS.restaurantName.min +
      '–' +
      LIMITS.restaurantName.max +
      ' characters).';
  }

  var city = str_(body.city).trim();
  if (city.length < LIMITS.city.min || city.length > LIMITS.city.max) {
    fields.city = 'Please enter your city.';
  }

  var outlets = str_(body.outlets).trim();
  if (!outlets || OUTLETS.indexOf(outlets) === -1) {
    fields.outlets = 'Please choose how many outlets you run.';
  }

  var restaurantType = str_(body.restaurantType).trim();
  if (restaurantType && RESTAURANT_TYPES.indexOf(restaurantType) === -1) {
    fields.restaurantType = 'Please choose a valid restaurant type.';
  }

  if (str_(body.preferredLanguage).trim().length > LIMITS.preferredLanguage.max) {
    fields.preferredLanguage = 'Unsupported language code.';
  }

  if (str_(body.message).length > LIMITS.message.max) {
    fields.message = 'Please keep this under ' + LIMITS.message.max + ' characters.';
  }

  if (body.consent !== true) {
    fields.consent = 'Please agree to be contacted so we can call you back.';
  }

  // No Turnstile check: Turnstile was dropped in Revision 2. `turnstileToken`
  // is accepted and ignored so a cached old bundle keeps working.

  return fields;
}

/**
 * Attribution is untrusted decoration, never a reason to reject a lead:
 * unknown keys are dropped and over-long values truncated.
 */
function sanitiseAttribution_(input) {
  var out = {};
  if (typeof input !== 'object' || input === null) return out;

  for (var i = 0; i < ATTRIBUTION_KEYS.length; i++) {
    var key = ATTRIBUTION_KEYS[i];
    var value = optional_(input[key]);
    if (value !== undefined) out[key] = value.slice(0, LIMITS.attributionValue.max);
  }
  return out;
}

/**
 * Validate *and* normalise untrusted JSON.
 * Returns `{ ok: true, value }` or `{ ok: false, fields }`.
 */
function parseDemoRequest(input) {
  var fields = validateDemoRequest(input);
  if (Object.keys(fields).length > 0) return { ok: false, fields: fields };

  var body = input;
  var userAgent = optional_(body.userAgent);

  return {
    ok: true,
    value: {
      name: str_(body.name).trim(),
      phone: normalisePhone(str_(body.phone)),
      email: optional_(body.email),
      restaurantName: str_(body.restaurantName).trim(),
      city: str_(body.city).trim(),
      outlets: str_(body.outlets).trim(),
      restaurantType: optional_(body.restaurantType),
      preferredLanguage: optional_(body.preferredLanguage),
      message: optional_(body.message),
      consent: true,
      attribution: sanitiseAttribution_(body.attribution),
      // Apps Script never sees request headers, so the browser sends its own
      // user agent in the payload. Absent is fine — the column just stays empty.
      userAgent: userAgent === undefined ? undefined : userAgent.slice(0, LIMITS.userAgent.max)
    }
  };
}

/** `true` when the honeypot field was filled — i.e. the submitter is a bot. */
function isHoneypotTripped(input) {
  if (typeof input !== 'object' || input === null) return false;
  var website = input.website;
  return typeof website === 'string' && website.trim().length > 0;
}

/* ------------------------------------------------------------------ */
/* Lead → sheet row                                                    */
/* ------------------------------------------------------------------ */

var IST_OFFSET_MINUTES = 5 * 60 + 30;

/**
 * Format a timestamp as ISO 8601 in IST, e.g. `2026-10-13T15:31:08.266+05:30`.
 * Sheets renders this readably and it still sorts lexicographically, which a
 * localised format would not.
 */
function toIstIsoString(date) {
  var shifted = new Date(date.getTime() + IST_OFFSET_MINUTES * 60000);
  return shifted.toISOString().slice(0, -1) + '+05:30';
}

function createLead(request, options) {
  return {
    id: options.id,
    receivedAt: toIstIsoString(options.receivedAt),
    request: request,
    userAgent: request.userAgent || '',
    status: 'new'
  };
}

/**
 * Flatten a lead into a row of strings, in `SHEET_COLUMNS` order.
 * Absent optional values become `''` so every row has the same width.
 */
function toSheetRow(lead) {
  var r = lead.request;
  var a = r.attribution || {};

  var byColumn = {
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
    status: lead.status
  };

  var row = [];
  for (var i = 0; i < SHEET_COLUMNS.length; i++) {
    var value = byColumn[SHEET_COLUMNS[i]];
    row.push(sanitiseCell_(value === undefined || value === null ? '' : String(value)));
  }
  return row;
}

/**
 * Blunt spreadsheet injection. Unlike the Sheets REST API, which could append
 * with `valueInputOption=RAW`, `appendRow` parses what it writes exactly as if
 * a person had typed it — so `=`, `+`, `-` and `@` all start a formula. The
 * leading apostrophe is Sheets' own "this is text" marker: it is consumed on
 * write and is not part of the stored value.
 *
 * This is why `phone` is escaped here while the old Cloudflare code left it
 * alone: `+919876543210` would otherwise land in the sheet as a formula error.
 */
function sanitiseCell_(value) {
  return /^[=+\-@]/.test(value) ? "'" + value : value;
}

/* ------------------------------------------------------------------ */
/* Sheet access                                                        */
/* ------------------------------------------------------------------ */

/**
 * The `Leads` tab, created with a frozen header row if it does not exist yet —
 * so a fresh Sheet works with no manual setup, and a renamed tab fails by
 * creating a new one rather than appending into the wrong columns.
 */
function leadsSheet_() {
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  if (!spreadsheet) {
    throw new Error(
      'No bound spreadsheet. This script must live inside the leads Sheet ' +
        '(Extensions → Apps Script), not in a standalone project.'
    );
  }

  var sheet = spreadsheet.getSheetByName(LEADS_SHEET_NAME);
  if (!sheet) sheet = spreadsheet.insertSheet(LEADS_SHEET_NAME);

  if (sheet.getLastRow() === 0) {
    sheet.appendRow(SHEET_COLUMNS.slice());
    sheet.getRange(1, 1, 1, SHEET_COLUMNS.length).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }

  return sheet;
}

/**
 * Append one lead. The lock matters: two simultaneous submits both resolve
 * "the next empty row" to the same row, and one lead overwrites the other.
 */
function appendLead_(lead) {
  var lock = LockService.getScriptLock();
  lock.waitLock(THROTTLE.lockTimeoutMs);
  try {
    leadsSheet_().appendRow(toSheetRow(lead));
    SpreadsheetApp.flush();
  } finally {
    lock.releaseLock();
  }
}

/* ------------------------------------------------------------------ */
/* Throttling                                                          */
/* ------------------------------------------------------------------ */

/**
 * Best-effort ceiling on accepted leads per minute. The read-modify-write is
 * not atomic, so a burst can slip a few over the cap — that is fine. This is a
 * cheap brake on a script hammering the endpoint, not a billing boundary, and
 * the honeypot plus the per-phone window do the real work.
 *
 * Apps Script sees no client IP, so there is nothing finer to key on here.
 */
function underGlobalCap_(cache, now) {
  var minute = Math.floor((now === undefined ? Date.now() : now) / 60000);
  var key = 'leads:minute:' + minute;
  var current = Number(cache.get(key) || 0);

  if (current >= THROTTLE.globalPerMinute) return false;

  // 120s, not 60s: the window is keyed by minute, so the entry only has to
  // outlive the minute it counts.
  cache.put(key, String(current + 1), 120);
  return true;
}

/** Has this number already been accepted inside the duplicate window? */
function isDuplicatePhone_(cache, phone) {
  return cache.get(phoneKey_(phone)) !== null;
}

function rememberPhone_(cache, phone) {
  cache.put(phoneKey_(phone), '1', THROTTLE.duplicateWindowSeconds);
}

function phoneKey_(phone) {
  return 'leads:phone:' + phone;
}

/* ------------------------------------------------------------------ */
/* Plumbing                                                            */
/* ------------------------------------------------------------------ */

/** Parse a request body, returning null for anything that is not a JSON object. */
function parseJsonObject_(raw) {
  if (typeof raw !== 'string' || raw.trim() === '') return null;

  var parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    return null;
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;
  return parsed;
}

function jsonOutput_(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(
    ContentService.MimeType.JSON
  );
}

/** Stack included when there is one — these only ever reach the execution log. */
function describeError_(error) {
  if (error && error.stack) return String(error.stack);
  return String(error);
}
