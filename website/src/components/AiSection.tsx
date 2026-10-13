import { useRef, useState, type KeyboardEvent } from 'react'
import { LanguageWheel } from './LanguageWheel'
import { Ph } from './Placeholder'

const CAPABILITIES = [
  {
    id: 'b1',
    n: '01',
    title: 'Stock that reorders itself',
    body: "Predicts run-outs against your vendor's delivery days and drafts the purchase order for you to approve on WhatsApp.",
  },
  {
    id: 'b2',
    n: '02',
    title: 'Menu & pricing insights',
    body: "Finds dishes that sell but don't earn, suggests combos, and shows the impact before you change a price.",
  },
  {
    id: 'b3',
    n: '03',
    title: 'WhatsApp pe order',
    body: 'Regulars order on your own number in their own words. The order lands in the kitchen queue — no commission.',
  },
  {
    id: 'b4',
    n: '04',
    title: 'Aapki bhasha mein',
    body: 'Not just Hindi and English. Tamil, Telugu, Malayalam, Kannada, Marathi, Bengali, Gujarati — the POS, the KOT and your customer’s replies, all in the language your floor actually speaks.',
  },
] as const

type PaneId = (typeof CAPABILITIES)[number]['id']

const STOCK_ROWS = [
  { item: 'Fresh cream', qty: '2.0 L', tag: 'today', tone: 'bad' },
  { item: 'Paneer', qty: '4.2 kg', tag: '2 days', tone: 'bad' },
  { item: 'Basmati rice', qty: '18 kg', tag: '3 days', tone: 'warn' },
  { item: 'Ghee', qty: '11 kg', tag: '9 days', tone: 'ok' },
] as const

const MENU_ROWS = [
  { item: 'Fresh Lime Soda', qty: '84%', tag: 'star', tone: 'ok' },
  { item: 'Veg Hakka Noodles', qty: '71%', tag: 'star', tone: 'ok' },
  { item: 'Paneer Butter Masala', qty: '58%', tag: 'watch', tone: 'warn' },
  { item: 'Mutton Rogan Josh', qty: '38%', tag: 'puzzle', tone: 'bad' },
] as const

const WHATSAPP = [
  { from: 'in', text: 'Bhaiya 2 butter naan aur ek paneer butter masala parcel, 8 baje tak' },
  { from: 'out', text: '2 × Butter Naan (₹120) + 1 × Paneer Butter Masala (₹340). With GST: ₹483. Pickup 8:00 pm. Confirm?' },
  { from: 'in', text: 'Haan, ek gulab jamun bhi' },
  { from: 'out', text: 'Added (₹110). New total ₹598. UPI link bhej diya.' },
  { from: 'in', text: 'Done ✅' },
  { from: 'out', text: 'Order #2271 kitchen queue mein hai. Pack hote hi message karenge.' },
] as const

function Rows({ rows }: { rows: readonly { item: string; qty: string; tag: string; tone: string }[] }) {
  return (
    <ul className="rows">
      {rows.map((row) => (
        <li className="row" key={row.item}>
          <span>{row.item}</span>
          <span>
            <b>{row.qty}</b> <span className={`tag tag--${row.tone}`}>{row.tag}</span>
          </span>
        </li>
      ))}
    </ul>
  )
}

export function AiSection() {
  const [active, setActive] = useState<PaneId>('b1')
  const tabsRef = useRef<(HTMLButtonElement | null)[]>([])

  // Tabs pattern: arrows move between tabs, Home/End jump to the ends.
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const last = CAPABILITIES.length - 1
    let next: number | null = null

    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowRight':
        next = index === last ? 0 : index + 1
        break
      case 'ArrowUp':
      case 'ArrowLeft':
        next = index === 0 ? last : index - 1
        break
      case 'Home':
        next = 0
        break
      case 'End':
        next = last
        break
      default:
        return
    }

    event.preventDefault()
    setActive(CAPABILITIES[next].id)
    tabsRef.current[next]?.focus()
  }

  return (
    <section className="section ai" id="ai" aria-labelledby="ai-h">
      <div className="wrap">
        <div className="head head--wide">
          <span className="sticker">The real difference</span>
          <h2 id="ai-h">
            Your POS should also <mark>do the thinking.</mark>
          </h2>
          <p className="lede lede--mt">
            Every bill teaches FoodOS something about your restaurant. It turns
            that into a reorder before you run out, a price worth changing, and
            an order taken on WhatsApp — in your customer’s own language.
          </p>
        </div>

        <div className="ai__grid">
          <div className="ailist" role="tablist" aria-orientation="vertical" aria-label="AI capabilities">
            {CAPABILITIES.map((capability, index) => {
              const isOn = capability.id === active
              return (
                <button
                  type="button"
                  key={capability.id}
                  ref={(element) => {
                    tabsRef.current[index] = element
                  }}
                  className={isOn ? 'aicard is-on' : 'aicard'}
                  role="tab"
                  id={`tab-${capability.id}`}
                  aria-selected={isOn}
                  aria-controls={capability.id}
                  tabIndex={isOn ? 0 : -1}
                  onClick={() => setActive(capability.id)}
                  onKeyDown={(event) => onKeyDown(event, index)}
                >
                  <span className="aicard__n" aria-hidden="true">
                    {capability.n}
                  </span>
                  <span>
                    <h3>{capability.title}</h3>
                    <p>{capability.body}</p>
                  </span>
                </button>
              )
            })}
          </div>

          <div className="panel">
            <div className="panel__h">
              <i aria-hidden="true">★</i>
              <b>FoodOS AI</b>
              <span>mock preview</span>
            </div>

            <div
              className="pane"
              id="b1"
              role="tabpanel"
              aria-labelledby="tab-b1"
              tabIndex={0}
              hidden={active !== 'b1'}
            >
              <p className="q">
                <small>Stock risk · next 48 hours</small>3 items run out before
                Monday’s delivery.
              </p>
              <Rows rows={STOCK_ROWS} />
              <p className="note">
                Draft PO ready — Sri Lakshmi Dairy, ₹8,340. Send on WhatsApp?
              </p>
            </div>

            <div
              className="pane"
              id="b2"
              role="tabpanel"
              aria-labelledby="tab-b2"
              tabIndex={0}
              hidden={active !== 'b2'}
            >
              <p className="q">
                <small>Menu engineering · last 90 days</small>Two dishes are
                quietly losing you money.
              </p>
              <Rows rows={MENU_ROWS} />
              <p className="note">
                Rogan Josh ₹480 → ₹520: about −6 orders a week, +₹14,200 a month.
              </p>
            </div>

            <div
              className="pane"
              id="b3"
              role="tabpanel"
              aria-labelledby="tab-b3"
              tabIndex={0}
              hidden={active !== 'b3'}
            >
              <ul className="wa">
                {WHATSAPP.map((bubble, index) => (
                  <li
                    className={bubble.from === 'in' ? 'bub bub--in' : 'bub bub--out'}
                    key={index}
                  >
                    {bubble.text}
                  </li>
                ))}
              </ul>
              <p className="note">
                Never sells an item that’s out of stock — it reads live inventory.
              </p>
            </div>

            <div
              className="pane"
              id="b4"
              role="tabpanel"
              aria-labelledby="tab-b4"
              tabIndex={0}
              hidden={active !== 'b4'}
            >
              <p className="q">
                <small>Order confirmation · same message, nine languages</small>
                Pick the language your floor speaks. Everything follows.
              </p>

              <LanguageWheel />

              <ul className="rows rows--mt">
                <li className="row">
                  <span>Billing screen &amp; menu</span>
                  <span className="tag tag--ok">switches</span>
                </li>
                <li className="row">
                  <span>Printed KOT &amp; bill</span>
                  <span className="tag tag--ok">switches</span>
                </li>
                <li className="row">
                  <span>WhatsApp replies to customers</span>
                  <span className="tag tag--ok">switches</span>
                </li>
              </ul>
              <p className="note">
                Each staff member picks their own language — the kitchen can read
                Tamil while the counter bills in English.
              </p>
              <p className="note note--tight">
                <Ph>
                  Translations are placeholders — need native-speaker review
                  before launch
                </Ph>
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
