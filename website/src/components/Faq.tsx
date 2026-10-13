import type { ReactNode } from 'react'
import { Ph } from './Placeholder'

interface Entry {
  q: string
  a: ReactNode
}

const ENTRIES: Entry[] = [
  {
    q: 'Internet band ho gaya toh?',
    a: 'Billing, KOT and printing keep running on the device itself. Everything syncs the moment the connection is back — you never stop a queue because the router did.',
  },
  {
    q: 'Will you move my existing menu and data?',
    a: (
      <>
        Yes — categories, items, variants, taxes, recipes and customer lists, from
        Petpooja or any other POS. We do the import and check it with you before
        go-live. <Ph>Scope TBD</Ph>
      </>
    ),
  },
  {
    q: 'Do I need to buy new hardware?',
    a: (
      <>
        No. It runs on the Android tablets and Windows billing machines most
        restaurants already have, with standard thermal printers and cash drawers.{' '}
        <Ph>Hardware list TBD</Ph>
      </>
    ),
  },
  {
    q: 'Is the bill properly GST-compliant?',
    a: 'Item-level tax rates with CGST/SGST or IGST, HSN codes, your GSTIN on the invoice, and a monthly summary your CA can file from.',
  },
  {
    q: 'Kya yeh meri bhasha mein chalega?',
    a: (
      <>
        Yes. Hindi, Tamil, Telugu, Malayalam, Kannada, Marathi, Bengali, Gujarati
        and English — across the billing screen, the printed KOT and the WhatsApp
        replies your customers get. Each staff member picks their own, so the
        kitchen and the counter don’t have to agree. <Ph>Final language list TBD</Ph>
      </>
    ),
  },
  {
    q: 'Kitna time lagta hai setup mein?',
    a: (
      <>
        Usually one day for a single outlet — menu entry, printer setup and a
        training session with your staff. <Ph>To confirm</Ph>
      </>
    ),
  },
]

export function Faq() {
  return (
    <section className="section faq-section" id="faq" aria-labelledby="faq-h">
      <div className="wrap">
        <div className="center">
          <span className="sticker sticker--pom">FAQ</span>
          <h2 id="faq-h">Seedha jawab.</h2>
        </div>
        <div className="faq">
          {ENTRIES.map((entry, index) => (
            // Native <details>: the FAQ keeps working with no JS at all, and
            // browsers give us the correct keyboard and AT semantics for free.
            <details key={entry.q} open={index === 0}>
              <summary>{entry.q}</summary>
              <p>{entry.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  )
}
