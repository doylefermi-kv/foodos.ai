/**
 * Runs `Code.gs` under Node with the Apps Script globals faked.
 *
 * `Code.gs` has no exports — it is pasted into a Sheet-bound script project, so
 * it must stay a flat list of globals. To test it, the file is evaluated inside
 * a `node:vm` context whose globals are the fakes below; afterwards every
 * top-level `function` and `var` in the file is a property of that context.
 *
 * The fakes are deliberately thin: just enough surface for the paths `Code.gs`
 * actually takes, plus recording so a test can assert what was appended, cached
 * or locked. They are not a reimplementation of Apps Script.
 */

import { readFileSync } from 'node:fs'
import vm from 'node:vm'

const CODE_PATH = new URL('../Code.gs', import.meta.url)

/* ------------------------------------------------------------------ */
/* Clock                                                               */
/* ------------------------------------------------------------------ */

function createClock(startMs) {
  let current = startMs

  class FakeDate extends Date {
    constructor(...args) {
      if (args.length === 0) super(current)
      else super(...args)
    }
    static now() {
      return current
    }
  }

  return {
    Date: FakeDate,
    now: () => current,
    advance(ms) {
      current += ms
    },
  }
}

/* ------------------------------------------------------------------ */
/* SpreadsheetApp                                                      */
/* ------------------------------------------------------------------ */

class FakeSheet {
  constructor(name) {
    this.name = name
    /** Every row ever appended, header row included. */
    this.rows = []
    this.frozenRows = 0
    this.boldRanges = []
  }

  getName() {
    return this.name
  }

  getLastRow() {
    return this.rows.length
  }

  appendRow(values) {
    this.rows.push([...values])
    return this
  }

  getRange(row, column, numRows, numColumns) {
    const sheet = this
    return {
      setFontWeight(weight) {
        sheet.boldRanges.push({ row, column, numRows, numColumns, weight })
        return this
      },
      setNumberFormat() {
        return this
      },
      setValues(values) {
        values.forEach((value, index) => {
          sheet.rows[row - 1 + index] = [...value]
        })
        return this
      },
    }
  }

  setFrozenRows(count) {
    this.frozenRows = count
    return this
  }

  /** Data rows, i.e. everything after the header. */
  get dataRows() {
    return this.rows.slice(1)
  }
}

class FakeSpreadsheet {
  constructor(sheetNames = []) {
    this.sheets = sheetNames.map((name) => new FakeSheet(name))
  }

  getSheetByName(name) {
    return this.sheets.find((sheet) => sheet.name === name) ?? null
  }

  insertSheet(name) {
    const sheet = new FakeSheet(name)
    this.sheets.push(sheet)
    return sheet
  }
}

/* ------------------------------------------------------------------ */
/* CacheService                                                        */
/* ------------------------------------------------------------------ */

class FakeCache {
  constructor(clock) {
    this.clock = clock
    this.entries = new Map()
    this.puts = []
  }

  get(key) {
    const entry = this.entries.get(key)
    if (!entry) return null
    if (entry.expiresAt <= this.clock.now()) {
      this.entries.delete(key)
      return null
    }
    return entry.value
  }

  put(key, value, ttlSeconds) {
    this.puts.push({ key, value, ttlSeconds })
    this.entries.set(key, {
      value: String(value),
      expiresAt: this.clock.now() + ttlSeconds * 1000,
    })
  }

  remove(key) {
    this.entries.delete(key)
  }
}

/* ------------------------------------------------------------------ */
/* LockService                                                         */
/* ------------------------------------------------------------------ */

class FakeLock {
  constructor() {
    this.waits = []
    this.releases = 0
    /** Set to an Error to simulate a lock timeout. */
    this.failWith = null
  }

  waitLock(timeoutMs) {
    this.waits.push(timeoutMs)
    if (this.failWith) throw this.failWith
  }

  releaseLock() {
    this.releases += 1
  }
}

/* ------------------------------------------------------------------ */
/* Loader                                                              */
/* ------------------------------------------------------------------ */

/**
 * Evaluate `Code.gs` in a fresh sandbox.
 *
 * @param {object} [options]
 * @param {number} [options.now]        Starting wall-clock time, ms since epoch.
 * @param {string[]} [options.sheets]   Tabs that already exist in the Sheet.
 * @param {boolean} [options.bound]     False to simulate a standalone script.
 * @param {() => never} [options.onAppend] Throw from here to fail the append.
 */
export function loadAppsScript(options = {}) {
  const {
    now = Date.parse('2026-10-13T04:31:08.266Z'),
    sheets = ['Leads'],
    bound = true,
    onAppend,
  } = options

  const clock = createClock(now)
  const spreadsheet = bound ? new FakeSpreadsheet(sheets) : null
  const cache = new FakeCache(clock)
  const lock = new FakeLock()
  const logs = { log: [], warn: [], error: [] }
  const uuids = []

  if (spreadsheet && onAppend) {
    for (const sheet of spreadsheet.sheets) {
      const original = sheet.appendRow.bind(sheet)
      sheet.appendRow = (values) => {
        // The header write must still succeed; only lead rows fail.
        if (sheet.rows.length > 0) onAppend(values)
        return original(values)
      }
    }
  }

  let uuidCounter = 0

  const sandbox = {
    Date: clock.Date,

    SpreadsheetApp: {
      getActiveSpreadsheet: () => spreadsheet,
      flush: () => {},
    },

    CacheService: {
      getScriptCache: () => cache,
      getUserCache: () => cache,
    },

    LockService: {
      getScriptLock: () => lock,
      getDocumentLock: () => lock,
    },

    ContentService: {
      MimeType: { JSON: 'application/json', TEXT: 'text/plain' },
      createTextOutput: (text) => ({
        content: text,
        mimeType: null,
        getContent() {
          return this.content
        },
        getMimeType() {
          return this.mimeType
        },
        setMimeType(mimeType) {
          this.mimeType = mimeType
          return this
        },
      }),
    },

    Utilities: {
      getUuid: () => {
        uuidCounter += 1
        const id = `00000000-0000-4000-8000-${String(uuidCounter).padStart(12, '0')}`
        uuids.push(id)
        return id
      },
    },

    console: {
      log: (...args) => logs.log.push(args.join(' ')),
      warn: (...args) => logs.warn.push(args.join(' ')),
      error: (...args) => logs.error.push(args.join(' ')),
      info: (...args) => logs.log.push(args.join(' ')),
    },
  }

  vm.createContext(sandbox)
  vm.runInContext(readFileSync(CODE_PATH, 'utf8'), sandbox, { filename: 'Code.gs' })

  return {
    /** The sandbox: every global `Code.gs` declares hangs off this. */
    script: sandbox,
    spreadsheet,
    get leadsSheet() {
      return spreadsheet ? spreadsheet.getSheetByName('Leads') : null
    },
    cache,
    lock,
    clock,
    logs,
    uuids,

    /** POST a JSON body the way the browser does (text/plain, JSON inside). */
    post(body) {
      const contents = typeof body === 'string' ? body : JSON.stringify(body)
      return readJson(sandbox.doPost({ postData: { contents, type: 'text/plain' } }))
    },

    /** POST with a malformed event object, e.g. an empty body. */
    postRaw(event) {
      return readJson(sandbox.doPost(event))
    },

    get() {
      return readJson(sandbox.doGet({}))
    },
  }
}

/** Parse what a `ContentService` text output would have returned. */
export function readJson(output) {
  return JSON.parse(output.getContent())
}

/** Re-create a sandbox object in this realm so `deepStrictEqual` can be used. */
export function plain(value) {
  return JSON.parse(JSON.stringify(value))
}
