import InfoRail from './InfoRail'
import ServiceCard from './ServiceCard'
import TagPercentIllustration from './illustrations/TagPercentIllustration'
import TruckIllustration from './illustrations/TruckIllustration'
import { offers } from './data'
import type { OfferTone } from './types'
import Image from 'next/image'

const toneGradient: Record<OfferTone, string> = {
  sun: 'from-amber-300 via-orange-400 to-rust',
  ebay: 'from-blue via-blue-deep to-ink',
  welcome: 'from-indigo-500 via-purple-500 to-fuchsia-500',
  rakuten: 'from-rust via-red-700 to-ink',
  referral: 'from-gold via-amber-500 to-rust',
  anime: 'from-pink-400 via-fuchsia-400 to-purple-500',
}

type HomePageProps = {
  onAddRequest: () => void
  onAddShipment: () => void
}

// Profile badges, credits, referrals, and promo-code counts now live on
// the Account page (see AccountHubPage.tsx) instead of duplicating them
// here — Home stays focused on the two actions and browsing offers.
export default function HomePage({ onAddRequest, onAddShipment }: HomePageProps) {
  return (
    <div className="mx-auto max-w-7xl px-6 pb-16 lg:px-10">
      <div className="grid gap-8 pt-8 lg:grid-cols-[minmax(0,1fr)_330px]">
        <div className="min-w-0">
          <h1 className="font-display text-4xl text-ink sm:text-5xl">Hello, Safnas Kaldeen!</h1>

          <div className="mt-6 flex flex-col gap-5">
            <ServiceCard
              image={'/icons/parcel.png'}
              title="Parcel forwarding"
              description="Get your overseas wishlist items at lower prices with our shipping service."
              button="Add shipment"
              onClick={onAddShipment}
            />
            <ServiceCard
              image={'/icons/global-shipping.png'}
              title="Global shopping"
              description="Simply place an order with us for that hard-to-find item. We'll handle the rest."
              button="Add request"
              onClick={onAddRequest}
            />
          </div>

          <h2 className="mt-11 font-display text-2xl text-ink">Exclusive offers</h2>
          <div className="mt-5 grid grid-cols-2 gap-4 lg:grid-cols-3">
            {offers.map((offer) => (
              <article key={offer.title} className="overflow-hidden rounded-2xl border border-ink/10">
                <Image src={offer.img} alt="" width={400} height={200} className="h-32 w-full object-cover sm:h-40" />
                <span className="block px-3 py-3 text-xs font-semibold leading-snug text-ink sm:px-4 sm:py-4 sm:text-sm">
                  {offer.title}
                </span>
              </article>
            ))}
          </div>
        </div>

        <InfoRail />
      </div>
    </div>
  )
}
