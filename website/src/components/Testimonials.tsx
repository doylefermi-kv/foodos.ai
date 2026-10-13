import { Ph } from './Placeholder'

const QUOTES = [
  {
    quote: 'Day-close was forty minutes. Now it’s one tap and I see it on my phone before I leave.',
    where: 'Café · Bengaluru',
  },
  {
    quote: 'It orders the paneer before I notice it’s running out. That alone paid for it.',
    where: 'Multi-cuisine · Pune',
  },
  {
    quote: 'Three outlets, one screen. I finally know which kitchen actually makes money.',
    where: 'QSR chain · Hyderabad',
  },
]

export function Testimonials() {
  return (
    <section className="section center" aria-labelledby="quotes-h">
      <div className="wrap">
        <span className="sticker">Owners</span>
        <h2 id="quotes-h">What they tell us.</h2>
        <p className="lede lede--mt">
          <Ph>Placeholder quotes &amp; names — replace after pilots</Ph>
        </p>
        <div className="quotes">
          {QUOTES.map((entry) => (
            <figure className="quote" key={entry.where}>
              <p>“{entry.quote}”</p>
              <figcaption>
                <span className="av" aria-hidden="true">
                  PH
                </span>
                <span>
                  <b>Owner name</b>
                  <span>{entry.where}</span>
                </span>
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  )
}
