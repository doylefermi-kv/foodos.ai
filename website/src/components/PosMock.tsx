import { useState } from 'react'

const RAIL = [
  { glyph: '▤', label: 'Bill' },
  { glyph: '▦', label: 'Table' },
  { glyph: '◎', label: 'KOT' },
  { glyph: '≣', label: 'Menu' },
  { glyph: '◱', label: 'Stock' },
  { glyph: '◔', label: 'Report' },
]

const CATEGORIES = ['Starters', 'Main', 'Biryani', 'Breads', 'Drinks']

/** `veg: false` draws the pomegranate non-veg dot. */
const ITEMS = [
  { name: 'Paneer Tikka', price: '₹320', veg: true, selected: true },
  { name: 'Chicken 65', price: '₹340', veg: false, selected: false },
  { name: 'Gobi Manchurian', price: '₹260', veg: true, selected: false },
  { name: 'Dum Biryani (Mutton)', price: '₹480', veg: false, selected: true },
  { name: 'Butter Naan', price: '₹60', veg: true, selected: false },
  { name: 'Masala Chaas', price: '₹60', veg: true, selected: false },
]

const BILL_LINES = [
  { qty: '2×', name: 'Paneer Tikka', modifier: 'less spicy', amount: '640' },
  { qty: '1×', name: 'Dum Biryani (Mutton)', amount: '480' },
  { qty: '4×', name: 'Butter Naan', amount: '240' },
  { qty: '2×', name: 'Masala Chaas', amount: '120' },
]

/**
 * Hand-built POS screenshot: CSS grid, no image, so it stays sharp at any zoom
 * and the long-item-name case ("Dum Biryani (Mutton)") keeps proving the
 * layout holds. The item tiles are the one genuinely interactive part.
 */
export function PosMock() {
  const [selected, setSelected] = useState(
    () => new Set(ITEMS.filter((item) => item.selected).map((item) => item.name)),
  )

  const toggle = (name: string) =>
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })

  return (
    <div className="pos">
      <div className="pos__bar">
        <b>FOODOS POS — SPICE ROUTE, INDIRANAGAR</b>
        <span className="live">Online</span>
      </div>

      <div className="pos__body">
        <div className="pos__rail" aria-hidden="true">
          {RAIL.map((entry, index) => (
            <div key={entry.label} className={index === 0 ? 'rl is-on' : 'rl'}>
              <b>{entry.glyph}</b>
              {entry.label}
            </div>
          ))}
        </div>

        <div className="pos__menu">
          <div className="cats" aria-hidden="true">
            {CATEGORIES.map((category, index) => (
              <span key={category} className={index === 0 ? 'cat is-on' : 'cat'}>
                {category}
              </span>
            ))}
          </div>
          <div className="items">
            {ITEMS.map((item) => {
              const isOn = selected.has(item.name)
              return (
                <button
                  type="button"
                  key={item.name}
                  className={isOn ? 'it is-on' : 'it'}
                  aria-pressed={isOn}
                  onClick={() => toggle(item.name)}
                >
                  <span className="it__n">{item.name}</span>
                  <span className="it__b">
                    <span
                      className={item.veg ? 'dot' : 'dot dot--n'}
                      aria-hidden="true"
                    />
                    <span className="it__p">{item.price}</span>
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        <div className="pos__bill">
          <div className="rcpt__h">
            <b>SPICE ROUTE</b>
            <span>GSTIN 29ABCDE1234F1Z5</span>
          </div>
          <div className="rcpt__meta">
            <span>TABLE 07</span>
            <span>KOT #1042</span>
          </div>
          <ul className="rcpt__lines">
            {BILL_LINES.map((line) => (
              <li className="ln" key={line.name}>
                <span className="ln__q">{line.qty}</span>
                <span>
                  <span className="ln__n">{line.name}</span>
                  {line.modifier && <span className="ln__m">{line.modifier}</span>}
                </span>
                <span className="ln__a">{line.amount}</span>
              </li>
            ))}
          </ul>
          <div className="rcpt__t">
            <div className="tr">
              <span>SUB-TOTAL</span>
              <span>1,480.00</span>
            </div>
            <div className="tr">
              <span>CGST 2.5%</span>
              <span>37.00</span>
            </div>
            <div className="tr">
              <span>SGST 2.5%</span>
              <span>37.00</span>
            </div>
            <div className="tr tr--g">
              <span>TOTAL</span>
              <span>₹1,554</span>
            </div>
            <p className="rcpt__gst">
              Tax invoice · HSN 996331 · Thank you, visit again
            </p>
          </div>
          {/* Mock controls: rendered as spans, not buttons — a focusable
              no-op in the middle of a landing page is worse than no control. */}
          <div className="rcpt__btn" aria-hidden="true">
            <span>KOT</span>
            <span>Print</span>
            <span className="pay">Settle · UPI</span>
          </div>
        </div>
      </div>

      <div className="flag">
        <b>★ FoodOS AI says</b>
        <p>
          Fresh cream runs out <em>tonight</em>. Draft order to Sri Lakshmi Dairy
          is ready — approve on WhatsApp?
        </p>
      </div>
    </div>
  )
}
