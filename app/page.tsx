import ChatButton from '@/components/landing/ChatButton'
import Community from '@/components/landing/Community'
import Deals from '@/components/landing/Deals'
import Destinations from '@/components/landing/Destinations'
import Footer from '@/components/landing/Footer'
import GiftBanner from '@/components/landing/GiftBanner'
import Header from '@/components/landing/Header'
import Hero from '@/components/landing/Hero'
import HowItWorks from '@/components/landing/HowItWorks'
import LinkCta from '@/components/landing/LinkCta'
import Partners from '@/components/landing/Partners'
import PromoCodesSection from '@/components/landing/PromoCodesSection'
import PromoStrip from '@/components/landing/PromoStrip'
import StatsBand from '@/components/landing/StatsBand'
import Testimonials from '@/components/landing/Testimonials'
import TopChoices from '@/components/landing/TopChoices'

export default function Home() {
  return (
    <main className="bg-paper">
      <Header />
      <Hero />
      <Partners />
      <TopChoices />
      <HowItWorks />
      <PromoStrip />
      <Deals />
      <PromoCodesSection />
      <StatsBand />
      <Community />
      <Testimonials />
      <GiftBanner />
      <LinkCta />
      <Footer />
      <ChatButton />
    </main>
  )
}
