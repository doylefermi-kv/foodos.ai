import { PosMock } from './PosMock'
import { useDemoModal } from '../lib/demo-modal'

const TAGS = [
  '₹ GST-ready',
  'Offline billing',
  'UPI QR',
  'Hindi + English',
  'Android & Windows',
  'No per-bill cut',
]

export function Hero() {
  const { open } = useDemoModal()

  return (
    <section className="hero">
      <div className="wrap hero__grid">
        <div>
          <span className="sticker">Made in India · for Indian restaurants</span>
          <h1>
            Bill fast. Waste less. <mark>Know your numbers.</mark>
          </h1>
          <p className="hero__sub">
            The POS built for how restaurants here actually run — GST bills in one
            tap, KOTs to the tandoor, Zomato and Swiggy in the same queue, and AI
            that tells you what to prep tomorrow.
          </p>
          <div className="hero__actions">
            <button
              type="button"
              className="btn btn--primary btn--lg"
              onClick={() => open('hero')}
            >
              Book a demo
            </button>
            <a className="btn btn--lg" href="#features">
              See everything it does
            </a>
          </div>
          <ul className="hero__tags">
            {TAGS.map((tag) => (
              <li key={tag}>{tag}</li>
            ))}
          </ul>
        </div>

        <PosMock />
      </div>
    </section>
  )
}
