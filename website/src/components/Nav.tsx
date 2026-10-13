import { useEffect, useRef, useState } from 'react'
import { Logo } from './Logo'
import { useDemoModal } from '../lib/demo-modal'

const LINKS = [
  { href: '#features', label: 'Features' },
  { href: '#ai', label: 'AI' },
  { href: '#who', label: "Who it's for" },
  { href: '#faq', label: 'FAQ' },
]

export function Nav() {
  const [open, setOpen] = useState(false)
  const navRef = useRef<HTMLElement>(null)
  const burgerRef = useRef<HTMLButtonElement>(null)
  const { open: openDemo } = useDemoModal()

  // The drawer overlays the page, so Escape and an outside click have to close
  // it — otherwise a keyboard user is stuck behind it.
  useEffect(() => {
    if (!open) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false)
        burgerRef.current?.focus()
      }
    }
    const onPointerDown = (event: PointerEvent) => {
      if (navRef.current && !navRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }

    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('pointerdown', onPointerDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('pointerdown', onPointerDown)
    }
  }, [open])

  return (
    <header className={open ? 'nav is-open' : 'nav'} id="nav" ref={navRef}>
      <div className="wrap nav__inner">
        <Logo />

        <div className="nav__menu" id="nav-menu">
          <nav className="nav__links" aria-label="Main">
            {LINKS.map((link) => (
              <a key={link.href} href={link.href} onClick={() => setOpen(false)}>
                {link.label}
              </a>
            ))}
          </nav>
          <div className="nav__cta">
            {/* Pre-launch: there is no app to sign in to yet, so this lands on
                the closing CTA like every other secondary link in the design. */}
            <a className="btn" href="#cta" onClick={() => setOpen(false)}>
              Sign in
            </a>
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => {
                setOpen(false)
                openDemo('nav')
              }}
            >
              Book a demo
            </button>
          </div>
        </div>

        <button
          type="button"
          className="nav__burger"
          ref={burgerRef}
          aria-label={open ? 'Close menu' : 'Open menu'}
          aria-expanded={open}
          aria-controls="nav-menu"
          onClick={() => setOpen((value) => !value)}
        >
          <span />
        </button>
      </div>
    </header>
  )
}
