import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'

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
    const opener = openerRef.current
    openerRef.current = null
    if (opener && document.contains(opener)) {
      opener.focus()
    }
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
