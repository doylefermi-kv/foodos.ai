import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'

/**
 * `https://foodos.ai/#book-a-demo` opens the form straight away, so a WhatsApp
 * message or an ad can deep-link to the one conversion on the page.
 */
export const DEMO_HASH = '#book-a-demo'

interface DemoModalValue {
  isOpen: boolean
  /** `source` is for our own logs only — the contract has no such field. */
  open: (source: string) => void
  close: () => void
  source: string | null
}

const DemoModalContext = createContext<DemoModalValue | null>(null)

export function DemoModalProvider({ children }: { children: ReactNode }) {
  const [source, setSource] = useState<string | null>(null)
  // Focus has to come back to whatever the visitor clicked, which React does
  // not track for us once the modal unmounts.
  const openerRef = useRef<HTMLElement | null>(null)

  const open = useCallback((from: string) => {
    openerRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null
    setSource(from)
  }, [])

  const close = useCallback(() => {
    setSource(null)
    // Leaving #book-a-demo in the URL would both lie about the page state and
    // stop the hash reopening the form later.
    if (window.location.hash === DEMO_HASH) {
      window.history.replaceState(
        null,
        '',
        window.location.pathname + window.location.search,
      )
    }
    const opener = openerRef.current
    openerRef.current = null
    if (opener && document.contains(opener)) {
      opener.focus()
    }
  }, [])

  useEffect(() => {
    const sync = () => {
      if (window.location.hash === DEMO_HASH) setSource('hash')
    }
    sync()
    window.addEventListener('hashchange', sync)
    return () => window.removeEventListener('hashchange', sync)
  }, [])

  const value = useMemo<DemoModalValue>(
    () => ({ isOpen: source !== null, open, close, source }),
    [source, open, close],
  )

  return (
    <DemoModalContext.Provider value={value}>{children}</DemoModalContext.Provider>
  )
}

export function useDemoModal(): DemoModalValue {
  const value = useContext(DemoModalContext)
  if (!value) {
    throw new Error('useDemoModal must be used inside <DemoModalProvider>')
  }
  return value
}
