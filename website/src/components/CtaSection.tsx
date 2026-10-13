import { useDemoModal } from '../lib/demo-modal'

const META = ['NO CARD NEEDED', 'SETUP INCLUDED', 'CANCEL ANYTIME']

export function CtaSection() {
  const { open } = useDemoModal()

  return (
    <section className="section cta center" id="cta" aria-labelledby="cta-h">
      <div className="wrap">
        <span className="sticker sticker--indigo">Get started</span>
        <h2 id="cta-h">Dekhiye, apne hi menu par.</h2>
        <p className="lede lede--mt">
          A 30-minute demo with your real dishes. We’ll raise a live bill, fire a
          KOT, and show you what the AI says about your Saturday.
        </p>
        <div className="cta__row">
          <button
            type="button"
            className="btn btn--ink btn--lg"
            onClick={() => open('cta')}
          >
            Book a demo
          </button>
        </div>
        <ul className="cta__meta">
          {META.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </div>
    </section>
  )
}
