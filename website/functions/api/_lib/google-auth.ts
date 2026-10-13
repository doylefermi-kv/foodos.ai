/**
 * Google service-account access tokens, signed with WebCrypto.
 *
 * The `googleapis` Node SDK does not run on Workers (no `crypto` module, no
 * `http`), so this implements the OAuth2 JWT-bearer flow directly:
 *   1. build a JWT claiming the Sheets scope,
 *   2. sign it RS256 with the service-account private key via `crypto.subtle`,
 *   3. exchange it at the token endpoint for a short-lived access token.
 *
 * Tokens are cached in module scope until shortly before expiry, so a burst of
 * leads costs one token exchange rather than one per request.
 */

const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const SHEETS_SCOPE = 'https://www.googleapis.com/auth/spreadsheets'
const TOKEN_LIFETIME_SECONDS = 3600
/** Refresh this far before actual expiry to tolerate clock skew. */
const EXPIRY_SKEW_SECONDS = 60

export interface ServiceAccountCredentials {
  clientEmail: string
  /** PKCS#8 PEM. Literal `\n` escapes are accepted. */
  privateKey: string
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

interface CachedToken {
  accessToken: string
  expiresAtMs: number
}

const tokenCache = new Map<string, CachedToken>()

/** Exposed for tests. */
export function clearTokenCache(): void {
  tokenCache.clear()
}

function base64UrlEncode(input: ArrayBuffer | string): string {
  const bytes =
    typeof input === 'string' ? new TextEncoder().encode(input) : new Uint8Array(input)

  // btoa is available in the Workers runtime; build the binary string in
  // chunks so a large input can't blow the argument limit.
  let binary = ''
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/**
 * Decode a PKCS#8 PEM into the DER bytes `crypto.subtle.importKey` wants.
 * Handles the `\n`-escaped form that env vars and secret stores produce.
 */
export function pemToArrayBuffer(pem: string): ArrayBuffer {
  const normalised = pem.replace(/\\n/g, '\n').trim()

  const match = /-----BEGIN (?:RSA )?PRIVATE KEY-----([\s\S]+?)-----END (?:RSA )?PRIVATE KEY-----/.exec(
    normalised,
  )
  if (!match) {
    throw new Error('GOOGLE_PRIVATE_KEY is not a PEM-encoded private key')
  }

  const base64 = match[1].replace(/\s+/g, '')
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes.buffer
}

async function importPrivateKey(pem: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'pkcs8',
    pemToArrayBuffer(pem),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  )
}

/** Build and RS256-sign the JWT assertion. Exported for tests. */
export async function createSignedJwt(
  credentials: ServiceAccountCredentials,
  options: { scope?: string; nowSeconds?: number } = {},
): Promise<string> {
  const { scope = SHEETS_SCOPE, nowSeconds = Math.floor(Date.now() / 1000) } = options

  const header = { alg: 'RS256', typ: 'JWT' }
  const claims = {
    iss: credentials.clientEmail,
    scope,
    aud: TOKEN_URL,
    iat: nowSeconds,
    exp: nowSeconds + TOKEN_LIFETIME_SECONDS,
  }

  const signingInput = `${base64UrlEncode(JSON.stringify(header))}.${base64UrlEncode(
    JSON.stringify(claims),
  )}`

  const key = await importPrivateKey(credentials.privateKey)
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    new TextEncoder().encode(signingInput),
  )

  return `${signingInput}.${base64UrlEncode(signature)}`
}

/**
 * Get an access token for the Sheets scope, using the cache when warm.
 * Throws on failure; `GoogleSheetSink` converts that into a 502.
 */
export async function getAccessToken(
  credentials: ServiceAccountCredentials,
  options: { fetchImpl?: FetchLike; nowMs?: number } = {},
): Promise<string> {
  const { fetchImpl = fetch, nowMs = Date.now() } = options

  const cacheKey = credentials.clientEmail
  const cached = tokenCache.get(cacheKey)
  if (cached && cached.expiresAtMs > nowMs) return cached.accessToken

  const assertion = await createSignedJwt(credentials, {
    nowSeconds: Math.floor(nowMs / 1000),
  })

  const response = await fetchImpl(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }).toString(),
  })

  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    throw new Error(`Google token exchange failed (${response.status}): ${detail.slice(0, 500)}`)
  }

  const data = (await response.json()) as { access_token?: string; expires_in?: number }
  if (!data.access_token) {
    throw new Error('Google token exchange returned no access_token')
  }

  const expiresIn = typeof data.expires_in === 'number' ? data.expires_in : TOKEN_LIFETIME_SECONDS
  tokenCache.set(cacheKey, {
    accessToken: data.access_token,
    expiresAtMs: nowMs + Math.max(0, expiresIn - EXPIRY_SKEW_SECONDS) * 1000,
  })

  return data.access_token
}
