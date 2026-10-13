import { useEffect, useRef, type SyntheticEvent } from 'react'
import { DemoForm } from './DemoForm'
import { useDemoModal } from '../lib/demo-modal'

export function DemoModal() {
  const { isOpen, close } = useDemoModal()
  const dialogRef = useRef<HTMLDialogElement>(null)
  const cardRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return

    if (isOpen && !dialog.open) {
      dialog.showModal()
      // showModal() focuses the first tabbable thing, which here is the close
      // button — a screen reader would announce "Close" and nothing else. Move
      // focus to the card so the dialog's title is read first, and the visitor
      // then tabs forward into the form. Not the first input: autofocusing a
      // text field pops the keyboard on every phone.
      cardRef.current?.focus()
      // The page behind a modal must not scroll under it on iOS.
      document.body.style.overflow = 'hidden'
    } else if (!isOpen && dialog.open) {
      dialog.close()
    }

    return () => {
      document.body.style.overflow = ''
    }
  }, [isOpen])

  // Escape fires `cancel`; clicking the backdrop lands on the dialog element
  // itself, since the card covers everything inside it.
  const onCancel = (event: SyntheticEvent<HTMLDialogElement>) => {
    event.preventDefault()
    close()
  }

  if (!isOpen) return null

  return (
    <dialog
      className="modal"
      ref={dialogRef}
      aria-labelledby="demo-modal-title"
      onCancel={onCancel}
      onClose={close}
      onMouseDown={(event) => {
        if (event.target === dialogRef.current) close()
      }}
    >
      <div className="modal__card" ref={cardRef} tabIndex={-1}>
        <div className="modal__head">
          <div>
            <h2 id="demo-modal-title">Book a demo</h2>
            <p>
              30 minutes, on your own menu. We’ll raise a live bill, fire a KOT
              and show you what the AI says about your Saturday.
            </p>
          </div>
          <button
            type="button"
            className="modal__close"
            onClick={close}
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <div className="modal__body">
          <DemoForm onDone={close} />
        </div>
      </div>
    </dialog>
  )
}
