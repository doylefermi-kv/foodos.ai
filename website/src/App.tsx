import { Ticker } from './components/Ticker'
import { Nav } from './components/Nav'
import { Hero } from './components/Hero'
import { Proof } from './components/Proof'
import { Features } from './components/Features'
import { AiSection } from './components/AiSection'
import { WhoItsFor } from './components/WhoItsFor'
import { Testimonials } from './components/Testimonials'
import { Faq } from './components/Faq'
import { CtaSection } from './components/CtaSection'
import { Footer } from './components/Footer'
import { DemoModal } from './components/DemoModal'
import { DemoModalProvider } from './lib/demo-modal'

export function App() {
  return (
    <DemoModalProvider>
      <a className="skip-link" href="#top">
        Skip to content
      </a>
      <Ticker />
      <Nav />
      <main id="top">
        <Hero />
        <Proof />
        <Features />
        <AiSection />
        <WhoItsFor />
        <Testimonials />
        <Faq />
        <CtaSection />
      </main>
      <Footer />
      <DemoModal />
    </DemoModalProvider>
  )
}
