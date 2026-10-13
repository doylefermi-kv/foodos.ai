import { Logo } from './Logo'
import { Ph } from './Placeholder'
import { useDemoModal } from '../lib/demo-modal'

const COLUMNS = [
  {
    heading: 'Product',
    links: [
      { label: 'Billing', href: '#features' },
      { label: 'Tables & KOT', href: '#features' },
      { label: 'Inventory', href: '#features' },
      { label: 'Online orders', href: '#features' },
      { label: 'AI', href: '#ai' },
    ],
  },
  {
    heading: 'Company',
    links: [
      { label: 'About', href: '#top' },
      { label: 'Careers', href: '#top' },
      { label: 'Blog', href: '#top' },
    ],
  },
  {
    heading: 'Support',
    links: [
      { label: 'Help centre', href: '#faq' },
      { label: 'Hardware', href: '#top' },
      { label: 'Status', href: '#top' },
      { label: 'WhatsApp us', href: '#top' },
    ],
  },
]

export function Footer() {
  const { open } = useDemoModal()

  return (
    <footer className="foot">
      <div className="wrap">
        <div className="foot__g">
          <div>
            <Logo />
            <p className="foot__about">
              The restaurant POS with AI built in. Made in India, for Indian
              restaurants.
            </p>
          </div>

          {COLUMNS.map((column) => (
            <div key={column.heading}>
              <h4>{column.heading}</h4>
              <ul>
                {column.links.map((link) => (
                  <li key={link.label}>
                    <a href={link.href}>{link.label}</a>
                  </li>
                ))}
                {column.heading === 'Company' && (
                  <li>
                    <button
                      type="button"
                      className="foot__link"
                      onClick={() => open('footer')}
                    >
                      Contact
                    </button>
                  </li>
                )}
              </ul>
            </div>
          ))}
        </div>

        <div className="foot__base">
          <span>
            © {new Date().getFullYear()} FOODOS.AI <Ph>ENTITY TBD</Ph>
          </span>
          <span>PRIVACY · TERMS · GST</span>
        </div>
      </div>
    </footer>
  )
}
