import { ChevronRight } from 'lucide-react'
import PromoCodeCard from '@/components/shared/PromoCodeCard'
import { promoCodes } from './data'

export default function PromoCodesSection() {
  return (
    <section className="mx-auto max-w-7xl px-6 py-20 lg:px-10">
      <div className="flex items-center justify-between gap-4">
        <h2 className="font-display text-3xl text-ink sm:text-4xl">Trending Promo Codes</h2>
        <a href="/account/promo-codes" className="flex flex-none items-center gap-1 text-sm font-semibold text-ink hover:text-blue">
          View more <ChevronRight size={16} />
        </a>
      </div>

      <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {promoCodes.map((promo) => (
          <PromoCodeCard
            key={promo.code}
            tag={promo.tag}
            discount={promo.discount}
            title={promo.title}
            code={promo.code}
            expiresOn={promo.expiresOn}
          />
        ))}
      </div>
    </section>
  )
}
