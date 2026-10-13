import type {
  DemoRequest,
  DemoRequestField,
  DemoRequestResponse,
} from '../../shared/contract'

export const DEMO_ENDPOINT = '/api/demo-requests'

export type SubmitResult =
  | { kind: 'ok'; id: string }
  | { kind: 'validation'; fields: Partial<Record<DemoRequestField, string>> }
  | { kind: 'error'; message: string; retryable: boolean }

/** Copy for the failure modes the contract names, in the visitor's terms. */
const MESSAGES = {
  bot: "We couldn't verify that you're human. Please refresh the page and try again.",
  rate_limited:
    "That's a few requests in a row from your connection. Please wait a minute and try again.",
  upstream:
    "Something broke on our side — your details did not reach us. Please try again, or WhatsApp us and we'll take it down manually.",
  network:
    "We couldn't reach the server. Check your connection and try again.",
  unexpected: 'Something went wrong. Please try again in a moment.',
} as const

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export async function submitDemoRequest(
  payload: DemoRequest,
  signal?: AbortSignal,
): Promise<SubmitResult> {
  let response: Response
  try {
    response = await fetch(DEMO_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal,
    })
  } catch {
    return { kind: 'error', message: MESSAGES.network, retryable: true }
  }

  // A 502 from the sink means the lead is logged server-side but unconfirmed;
  // a non-JSON body (an HTML error page from the edge) must not throw here.
  let body: unknown
  try {
    body = (await response.json()) as DemoRequestResponse
  } catch {
    body = null
  }

  if (response.status === 201 && isRecord(body) && typeof body.id === 'string') {
    return { kind: 'ok', id: body.id }
  }

  if (response.status === 400 && isRecord(body) && isRecord(body.fields)) {
    return {
      kind: 'validation',
      fields: body.fields as Partial<Record<DemoRequestField, string>>,
    }
  }

  switch (response.status) {
    case 403:
      return { kind: 'error', message: MESSAGES.bot, retryable: false }
    case 429:
      return { kind: 'error', message: MESSAGES.rate_limited, retryable: true }
    case 502:
      return { kind: 'error', message: MESSAGES.upstream, retryable: true }
    default:
      return { kind: 'error', message: MESSAGES.unexpected, retryable: true }
  }
}
