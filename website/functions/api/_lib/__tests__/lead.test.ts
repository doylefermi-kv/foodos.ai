/** Row mapping — column order is fixed by `docs/website-architecture.md`. */

import test from 'node:test'
import assert from 'node:assert/strict'

import { SHEET_COLUMNS } from '../../../../shared/contract.ts'
import type { ValidatedDemoRequest } from '../../../../shared/contract.ts'
import { createLead, toIstIsoString, toSheetRow } from '../lead.ts'
import { ConsoleSink } from '../sinks/console-sink.ts'
import { GoogleSheetSink } from '../sinks/google-sheet-sink.ts'
import { LeadSinkError } from '../sinks/sink.ts'
import { selectSink } from '../sinks/index.ts'

/**
 * Throwaway 2048-bit RSA key, generated for these tests only. It signs nothing
 * that leaves the process — the Google token endpoint is mocked below. This is
 * not, and must never be replaced by, a real service-account credential.
 */
const TEST_KEY = `-----BEGIN PRIVATE KEY-----
MIIEvAIBADANBgkqhkiG9w0BAQEFAASCBKYwggSiAgEAAoIBAQC9pGn111qYzcBw
q7vPGK5F5z6VWptayvq6T5kHH3UL9sT44LdCDlkeoEmXn8r3JFmP/Bm0NLEceKuB
qEAdiVap9H6DILFGdt/Sma3qJ/3a+f0nCiI9M820O81X+yMrAmMSWGBJVyXdTnC4
yoIeSrWhufBhL+xFtmPVN12VNlk9OVPfOh0WI2ip0wcg7cIkGUHycic9tvhwMyHf
Uae3rmXP+cgLsZlp1sh9SwSs0qDX4VSq2v18thvX3kALt5xgz+kH0LDXr3b4pRCT
iYY2GDtUDhHZMp+qIap02RfVfRHjHqnFDAl8pBWWWFFWDXsb+q7zSBLgwTq99d5Q
0WfeNFgtAgMBAAECggEAHs31rkrgewC0+ThUJgQ+zrkM1+rjYGCnUJs8YsVP2HUp
srmh2veEr25e9eOtbu63I6XSMQz8FgFd7o47d/DGpI3D/R3S3fzSR53R+76qRCcm
YXCKdkGTcOrj5J41LLfTCvhTD6a5zlR/B+1RLIV7Mn2HF+pWaU6CsfAv4dx1q3V8
SkIu48ekHdN23+SPHcwIugR5J3haPKQ/lqEfYoOR6OddPhOOxgEWU7Yxf2PRS0/p
AjrO9vd1RG/d+P/16C+Lhwkm8Kwvma6+w7nTm9Gr6vwDM8X9ZCti8I0Unti0PGQp
qAjBcQUDY2yQG6EH6rYd9yU3x3fPMIPJYIW530JxwQKBgQDnAmAet3R36D2BWOVX
Cc3Wyh76NH2rnPz6XFPBhu3GVER9ibYOwGLnpF/nB5USCFnhrD66gM0U9VCA1KXr
qvBkMjn2jF9GKmX+JF2NHB/7l7+nT7FoSsNBa4X6xqWuFnJBpu3BQabGJ5Au/jyj
sY9ov5lxZgyeb/EHB5NJhvbq4QKBgQDSKGj9ZZWVqgoWzflpkS7TRVh/lMjcKV/3
wX+vM7kxrpYoYq1gzi1HPD894SLAkwUmo8Mzx3zzaKojL0d8vWOhxhkE0oGpilbe
VehOhwgK6TeUD4e0iX5kIddAaO2n8s22Lw/gzny9ygtGTUFoYa1H7VBp43efK7D9
OdmBYbSCzQKBgCW6BpadoWC/xeOs7+9yA3LTmZGFJwzy24HLuEX/0i80rebOqbPp
CX4JIzxoyZijUoJ/jdMJm/STR61yjRJa3V2PslWogRrFa9jAeaLE+BgvpTYe1rtQ
kmjJtZzJ+l7e/ZPpPiT0otbzuSFjleWp5uDVgaq6Xs81OujJ/OziJMshAoGAXgBZ
Rc6kY/dU3/JttzyLV1DTTu28Ek4ncOiKNlHKamCPJa1No9lVA2H9X65OHxkj2q6x
Z325dB7Cy04gibkk0X2MP03xVWZdiMGgUU+w10CN7ZostyIw+JTydQr6En9WaEEQ
txtlTHcNJ/ryYMAgA+Ywa8yk+vtOBVZU5bxQQ5kCgYBFFJovhjZRcE4ImiwhhAQf
JhE3GFEJiwV2l3cX/O7I7u3hDXrdPidj5xCZEUd7u7veNSjxJ8+8lzNUTF6ydBUV
ngBENq4MyXRY6vKKkNFBK9MNUJGN7PoUadB8OAvDDPiJQfKXtAicu+CCytL0qFlc
8ZYWMI9RqwPoUqtumb87Aw==
-----END PRIVATE KEY-----`

const fullRequest: ValidatedDemoRequest = {
  name: 'Anjali Menon',
  phone: '+919876543210',
  email: 'anjali@spicegarden.in',
  restaurantName: 'Spice Garden',
  city: 'Kochi',
  outlets: '2-5',
  restaurantType: 'casual_dining',
  preferredLanguage: 'ml',
  message: 'Looking to switch from our current POS.',
  consent: true,
  attribution: {
    utmSource: 'google',
    utmMedium: 'cpc',
    utmCampaign: 'kerala-launch',
    utmTerm: 'restaurant pos',
    utmContent: 'ad-a',
    referrer: 'https://www.google.com/',
    landingPath: '/?utm_source=google',
  },
  turnstileToken: 'tok',
}

const minimalRequest: ValidatedDemoRequest = {
  name: 'Ravi',
  phone: '+919876543210',
  restaurantName: 'Dosa Corner',
  city: 'Chennai',
  outlets: '1',
  consent: true,
  attribution: {},
  turnstileToken: 'tok',
}

function leadFrom(request: ValidatedDemoRequest, userAgent = 'Mozilla/5.0 (test)') {
  return createLead(request, {
    id: 'lead-1',
    receivedAt: new Date('2026-10-13T04:31:08.266Z'),
    userAgent,
  })
}

/* -------------------------------------------------------------- */
/* Column order                                                    */
/* -------------------------------------------------------------- */

test('the contract still declares the exact columns the architecture doc fixed', () => {
  // Guards against a silent reorder: existing sheets have these headers already.
  assert.deepEqual(
    [...SHEET_COLUMNS],
    [
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
      'status',
    ],
  )
})

test('toSheetRow emits values in SHEET_COLUMNS order', () => {
  const row = toSheetRow(leadFrom(fullRequest))

  assert.equal(row.length, SHEET_COLUMNS.length)
  assert.deepEqual(row, [
    'lead-1',
    '2026-10-13T10:01:08.266+05:30',
    'Anjali Menon',
    '+919876543210',
    'anjali@spicegarden.in',
    'Spice Garden',
    'Kochi',
    '2-5',
    'casual_dining',
    'ml',
    'Looking to switch from our current POS.',
    'google',
    'cpc',
    'kerala-launch',
    'restaurant pos',
    'ad-a',
    'https://www.google.com/',
    '/?utm_source=google',
    'Mozilla/5.0 (test)',
    'new',
  ])
})

test('absent optional fields become empty cells, keeping every row the same width', () => {
  const row = toSheetRow(leadFrom(minimalRequest, ''))

  assert.equal(row.length, SHEET_COLUMNS.length)
  assert.equal(row[SHEET_COLUMNS.indexOf('email')], '')
  assert.equal(row[SHEET_COLUMNS.indexOf('restaurantType')], '')
  assert.equal(row[SHEET_COLUMNS.indexOf('message')], '')
  assert.equal(row[SHEET_COLUMNS.indexOf('utmSource')], '')
  assert.equal(row[SHEET_COLUMNS.indexOf('userAgent')], '')
  // Required fields and the defaults still land in the right place.
  assert.equal(row[SHEET_COLUMNS.indexOf('name')], 'Ravi')
  assert.equal(row[SHEET_COLUMNS.indexOf('status')], 'new')
})

test('status defaults to new, for the sales team to update', () => {
  assert.equal(leadFrom(minimalRequest).status, 'new')
})

test('cells that would be read as formulas are escaped', () => {
  const row = toSheetRow(leadFrom({ ...fullRequest, name: '=HYPERLINK("http://evil")' }))
  assert.equal(row[SHEET_COLUMNS.indexOf('name')], '\'=HYPERLINK("http://evil")')
  // The +91 phone must not be mangled into a formula either.
  assert.equal(row[SHEET_COLUMNS.indexOf('phone')], '+919876543210')
})

/* -------------------------------------------------------------- */
/* Timestamp                                                       */
/* -------------------------------------------------------------- */

test('receivedAt is ISO 8601 in IST', () => {
  assert.equal(toIstIsoString(new Date('2026-10-13T04:31:08.266Z')), '2026-10-13T10:01:08.266+05:30')
  // Crossing midnight UTC must roll the IST date forward.
  assert.equal(toIstIsoString(new Date('2026-10-12T20:00:00.000Z')), '2026-10-13T01:30:00.000+05:30')
})

/* -------------------------------------------------------------- */
/* Sinks                                                           */
/* -------------------------------------------------------------- */

test('ConsoleSink logs the row it would have appended', async () => {
  const lines: string[] = []
  await new ConsoleSink({ logger: { log: (msg: string) => lines.push(msg) } }).write(
    leadFrom(fullRequest),
  )

  const output = lines.join('\n')
  assert.match(output, /lead-1/)
  assert.match(output, /Spice Garden/)
  assert.match(output, /\+919876543210/)
})

test('GoogleSheetSink appends the row with values.append and a bearer token', async () => {
  const calls: { url: string; init?: RequestInit }[] = []
  const fetchImpl = async (url: string, init?: RequestInit) => {
    calls.push({ url, init })
    if (url.startsWith('https://oauth2.googleapis.com/token')) {
      return new Response(JSON.stringify({ access_token: 'ya29.test', expires_in: 3600 }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }
    return new Response(JSON.stringify({ updates: { updatedRows: 1 } }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }

  const sink = new GoogleSheetSink({
    sheetId: 'sheet-123',
    range: 'Leads',
    // A throwaway key generated for this test only — never a real credential.
    credentials: { clientEmail: 'leads@foodos.iam.gserviceaccount.com', privateKey: TEST_KEY },
    fetchImpl,
  })

  await sink.write(leadFrom(fullRequest))

  const append = calls.find((c) => c.url.includes('sheets.googleapis.com'))
  assert.ok(append, 'expected a Sheets append call')
  assert.match(append.url, /\/v4\/spreadsheets\/sheet-123\/values\/Leads:append/)
  assert.match(append.url, /valueInputOption=RAW/)
  assert.match(append.url, /insertDataOption=INSERT_ROWS/)
  assert.equal((append.init?.headers as Record<string, string>).authorization, 'Bearer ya29.test')

  const body = JSON.parse(String(append.init?.body)) as { values: string[][] }
  assert.equal(body.values.length, 1)
  assert.deepEqual(body.values[0], toSheetRow(leadFrom(fullRequest)))
})

test('GoogleSheetSink turns a Sheets error into a LeadSinkError', async () => {
  const fetchImpl = async (url: string) => {
    if (url.startsWith('https://oauth2.googleapis.com/token')) {
      return new Response(JSON.stringify({ access_token: 'ya29.test', expires_in: 3600 }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }
    return new Response('permission denied', { status: 403 })
  }

  const sink = new GoogleSheetSink({
    sheetId: 'sheet-123',
    credentials: { clientEmail: 'leads@foodos.iam.gserviceaccount.com', privateKey: TEST_KEY },
    fetchImpl,
  })

  await assert.rejects(() => sink.write(leadFrom(fullRequest)), (error: unknown) => {
    assert.ok(error instanceof LeadSinkError)
    assert.match(error.message, /403/)
    return true
  })
})

/* -------------------------------------------------------------- */
/* Sink selection                                                  */
/* -------------------------------------------------------------- */

test('selectSink defaults to the console sink', () => {
  assert.equal(selectSink({}).name, 'console')
  assert.equal(selectSink({ LEAD_SINK: 'console' }).name, 'console')
  assert.equal(selectSink({ LEAD_SINK: ' CONSOLE ' }).name, 'console')
})

test('selectSink builds the sheet sink when fully configured', () => {
  const sink = selectSink({
    LEAD_SINK: 'google_sheet',
    GOOGLE_SHEET_ID: 'sheet-123',
    GOOGLE_SERVICE_ACCOUNT_EMAIL: 'leads@foodos.iam.gserviceaccount.com',
    GOOGLE_PRIVATE_KEY: TEST_KEY,
  })
  assert.equal(sink.name, 'google_sheet')
})

test('selectSink names the missing variables rather than failing on the first lead', () => {
  assert.throws(
    () => selectSink({ LEAD_SINK: 'google_sheet', GOOGLE_SHEET_ID: 'sheet-123' }),
    /GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY/,
  )
})

test('the sheet id is read from GOOGLE_SHEET_ID only', () => {
  const base = {
    GOOGLE_SERVICE_ACCOUNT_EMAIL: 'leads@foodos.iam.gserviceaccount.com',
    GOOGLE_PRIVATE_KEY: TEST_KEY,
  }
  assert.equal(
    selectSink({ ...base, LEAD_SINK: 'google_sheet', GOOGLE_SHEET_ID: 'b' }).name,
    'google_sheet',
  )
  // The CTO retired SHEET_ID: a stale one must fail loudly, not quietly win.
  assert.throws(
    () => selectSink({ ...base, LEAD_SINK: 'google_sheet', SHEET_ID: 'a' } as never),
    /GOOGLE_SHEET_ID/,
  )
  assert.throws(() => selectSink({ ...base, LEAD_SINK: 'google_sheet' }), /GOOGLE_SHEET_ID/)
})

test('the hyphenated LEAD_SINK spelling still works, but warns', () => {
  const warnings: unknown[] = []
  const sink = selectSink(
    {
      LEAD_SINK: 'google-sheet',
      GOOGLE_SHEET_ID: 'sheet-123',
      GOOGLE_SERVICE_ACCOUNT_EMAIL: 'leads@foodos.iam.gserviceaccount.com',
      GOOGLE_PRIVATE_KEY: TEST_KEY,
    },
    { warn: (...args: unknown[]) => warnings.push(args[0]) },
  )
  assert.equal(sink.name, 'google_sheet')
  assert.match(String(warnings[0]), /deprecated/)

  // The agreed spelling must stay silent, or the warning becomes noise.
  const quiet: unknown[] = []
  selectSink(
    {
      LEAD_SINK: 'google_sheet',
      GOOGLE_SHEET_ID: 'sheet-123',
      GOOGLE_SERVICE_ACCOUNT_EMAIL: 'leads@foodos.iam.gserviceaccount.com',
      GOOGLE_PRIVATE_KEY: TEST_KEY,
    },
    { warn: (...args: unknown[]) => quiet.push(args[0]) },
  )
  assert.deepEqual(quiet, [])
})

test('selectSink rejects the dropped "sheet" shorthand', () => {
  assert.throws(() => selectSink({ LEAD_SINK: 'sheet' }), /Unknown LEAD_SINK/)
})

test('selectSink rejects an unknown sink name', () => {
  assert.throws(() => selectSink({ LEAD_SINK: 'postgres' }), /Unknown LEAD_SINK/)
})
