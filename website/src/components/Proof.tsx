import { Ph } from './Placeholder'

const STATS = [
  { value: '1,200+', label: 'Outlets live' },
  { value: '₹480 Cr', label: 'Billed a year' },
  { value: '18 sec', label: 'Avg. bill time' },
  { value: '12%', label: 'Less wastage' },
]

export function Proof() {
  return (
    <section className="proof" aria-label="Proof points">
      <div className="wrap">
        <p className="proof__l">
          Kitchens running on FoodOS <Ph>Placeholder — pre-launch</Ph>
        </p>
        <ul className="logos">
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <li className="logo-ph" key={n}>
              LOGO {String(n).padStart(2, '0')}
            </li>
          ))}
        </ul>
        <ul className="stats">
          {STATS.map((stat) => (
            <li className="stat" key={stat.label}>
              <b>{stat.value}</b>
              <span>
                {stat.label} <Ph>PH</Ph>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
