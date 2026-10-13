import { useEffect, useRef, useState } from 'react'
import { loadTurnstile, SITE_KEY } from '../lib/turnstile'

export type TurnstileStatus = 'loading' | 'ready' | 'solved' | 'failed'

interface Props {
  /** Called with the token, or null when it is cleared/expired. */
  onToken: (token: string | null) => void
  onStatusChange?: (status: TurnstileStatus) => void
}

/**
 * Offline / script-blocked local development would otherwise make the form
 * unsubmittable. In a dev build only, we fall back to a clearly-fake token so
 * the rest of the flow stays testable; the Pages Function rejects it, which is
 * the correct behaviour. Production never takes this branch.
 */
const DEV_FALLBACK_TOKEN = 'dev-turnstile-unavailable'

export function Turnstile({ onToken, onStatusChange }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [status, setStatus] = useState<TurnstileStatus>('loading')

  // Keep the latest callbacks in refs so the widget is mounted exactly once,
  // regardless of how often the parent re-renders while the user types.
  const onTokenRef = useRef(onToken)
  const onStatusChangeRef = useRef(onStatusChange)
  useEffect(() => {
    onTokenRef.current = onToken
    onStatusChangeRef.current = onStatusChange
  })

  useEffect(() => {
    onStatusChangeRef.current?.(status)
  }, [status])

  useEffect(() => {
    let cancelled = false
    let widgetId: string | undefined
    let api: Awaited<ReturnType<typeof loadTurnstile>> | undefined

    loadTurnstile()
      .then((turnstile) => {
        if (cancelled || !containerRef.current) return
        api = turnstile
        widgetId = turnstile.render(containerRef.current, {
          sitekey: SITE_KEY,
          theme: 'light',
          action: 'demo-request',
          callback: (token) => {
            if (cancelled) return
            setStatus('solved')
            onTokenRef.current(token)
          },
          'expired-callback': () => {
            if (cancelled) return
            setStatus('ready')
            onTokenRef.current(null)
          },
          'timeout-callback': () => {
            if (cancelled) return
            setStatus('ready')
            onTokenRef.current(null)
          },
          'error-callback': () => {
            if (cancelled) return
            setStatus('failed')
            onTokenRef.current(null)
          },
        })
        setStatus('ready')
      })
      .catch(() => {
        if (cancelled) return
        if (import.meta.env.DEV) {
          setStatus('solved')
          onTokenRef.current(DEV_FALLBACK_TOKEN)
        } else {
          setStatus('failed')
          onTokenRef.current(null)
        }
      })

    return () => {
      cancelled = true
      if (api && widgetId) {
        try {
          api.remove(widgetId)
        } catch {
          // Widget already gone — nothing to clean up.
        }
      }
    }
  }, [])

  return (
    <div className="ts">
      <div ref={containerRef} className="ts__widget" />
      {status === 'loading' && (
        <p className="ts__msg" role="status">
          Loading the spam check…
        </p>
      )}
      {status === 'failed' && (
        <p className="ts__msg ts__msg--bad" role="alert">
          The spam check couldn't load. Disable your ad blocker for this page, or
          WhatsApp us instead.
        </p>
      )}
      {status === 'solved' && import.meta.env.DEV && (
        <p className="ts__msg" role="status">
          Spam check satisfied.
        </p>
      )}
    </div>
  )
}
