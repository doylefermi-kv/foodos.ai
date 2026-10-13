import { Fragment } from 'react'

const PHRASES = [
  'GST-ready bills',
  'Works without internet',
  'Zomato + Swiggy in one queue',
  'UPI, card, cash',
  'Hindi & English',
  'Setup in one day',
]

const strip = PHRASES.map((phrase) => (
  <Fragment key={phrase}>
    {phrase}
    <b>•</b>
  </Fragment>
))

/**
 * Two identical copies scroll by -50%, which makes the loop seamless. The
 * duplicate is decorative, so it is hidden from assistive tech; with reduced
 * motion the CSS hides it visually too (a static strip must not stutter).
 */
export function Ticker() {
  return (
    <div className="ticker">
      <div className="ticker__t">
        <span>{strip}</span>
        <span aria-hidden="true">{strip}</span>
      </div>
    </div>
  )
}
