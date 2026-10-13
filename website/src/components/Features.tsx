interface Feature {
  n: string
  title: string
  body: string
  tags: string[]
  /** Half-width (span 3 of 6) rather than a third. */
  wide?: boolean
}

const FEATURES: Feature[] = [
  {
    n: '01',
    title: 'Billing & GST',
    wide: true,
    body: 'Dine-in, parcel and delivery on one screen. Split and merge bills, part payments, manager-PIN discounts, UPI QR, and a proper tax invoice with CGST/SGST, HSN and your GSTIN — printed in a second.',
    tags: ['SPLIT / MERGE', 'UPI · CARD · CASH', 'CGST + SGST', 'OFFLINE'],
  },
  {
    n: '02',
    title: 'Tables & floors',
    wide: true,
    body: 'Ground floor, terrace, bar counter — drawn the way your place actually is. Live table status, service timers, waiter assignment and reservations for the weekend rush.',
    tags: ['MULTI-FLOOR', 'TIMERS', 'WAITER-WISE', 'RESERVATIONS'],
  },
  {
    n: '03',
    title: 'KOT & kitchen display',
    body: 'Tickets go to the right station — tandoor, Chinese, dessert — on paper or on a KDS screen, with modifiers and a timer on every ticket.',
    tags: ['STATION-WISE', 'KDS', 'VOID / RECALL'],
  },
  {
    n: '04',
    title: 'Menu & inventory',
    body: 'Recipes linked to stock: sell a biryani and the rice, mutton and ghee come off by themselves. Alerts before the rush, not after.',
    tags: ['RECIPES', 'WASTAGE', 'VENDOR PO', 'AUTO-86'],
  },
  {
    n: '05',
    title: 'Zomato, Swiggy & your own site',
    body: 'Every channel in one ticket queue. One menu pushes everywhere; one stock count keeps it honest.',
    tags: ['ZOMATO', 'SWIGGY', 'OWN SITE', 'ONE MENU'],
  },
  {
    n: '06',
    title: 'Reports your CA will like',
    wide: true,
    body: 'Day-close in one tap. Sales by item, hour, channel and payment mode; discount and void audit by staff; food cost, wastage and a GST summary that’s ready to file.',
    tags: ['DAY CLOSE', 'ITEM-WISE', 'FOOD COST %', 'GST SUMMARY'],
  },
  {
    n: '07',
    title: 'Two outlets or twenty',
    wide: true,
    body: 'Push a price change to every outlet at once. Compare Koramangala with Indiranagar side by side. Keep recipes, vendors and staff roles central, with franchise-level access.',
    tags: ['CENTRAL MENU', 'COMPARE OUTLETS', 'ROLES', 'FRANCHISE'],
  },
]

export function Features() {
  return (
    <section className="section" id="features" aria-labelledby="features-h">
      <div className="wrap">
        <div className="head">
          <span className="sticker sticker--pom">Everything inside</span>
          <h2 id="features-h">Seven jobs. One system. No extra software.</h2>
          <p className="lede lede--mt">
            A sale moves stock. Stock updates the menu. The menu updates Zomato.
            Nobody retypes anything, and nobody keeps a parallel register in a
            notebook.
          </p>
        </div>

        <div className="feat">
          {FEATURES.map((feature) => (
            <article
              className={feature.wide ? 'card card--3' : 'card'}
              key={feature.n}
            >
              <span className="card__n" aria-hidden="true">
                {feature.n}
              </span>
              <h3>{feature.title}</h3>
              <p>{feature.body}</p>
              <ul>
                {feature.tags.map((tag) => (
                  <li key={tag}>{tag}</li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}
