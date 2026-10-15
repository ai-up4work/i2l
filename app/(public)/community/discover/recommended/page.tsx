import Link from 'next/link'
import Image from 'next/image'
import { CtaEnvelope, PageHero, Section } from '@/components/public/PageKit'
import { mockProducts } from '@/data/stores/data'
import { formatPrice } from '@/lib/currency'
import { ensurePricingSettings } from '@/lib/pricing-settings-server'
import { pageMetadata } from '@/lib/seo'

export const metadata = pageMetadata({
  path: '/community/discover/recommended',
  title: 'Trending Now | Wishdrop',
  description: 'Popular products from Wishdrop’s affiliated stores.',
})

// Deterministic "trending" slice (every 7th product) rather than random,
// so the page is stable across renders/server vs. client.
const trending = mockProducts.filter((_, i) => i % 7 === 0).slice(0, 12)

export default async function TrendingPage() {
  await ensurePricingSettings() // formatPrice converts with the saved exchange rates
  return (
    <main>
      <PageHero
        eyebrow="Trending now"
        title="Popular picks from"
        accent="our stores."
        intro="A snapshot of products from our affiliated stores. Tap anything to see the full listing and the delivered price."
      />

      <Section>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {trending.map((product) => (
            <Link
              key={product.id}
              href={`/stores/${product.storeSlug}/product/${product.id}`}
              className="group flex flex-col overflow-hidden rounded-3xl bg-card ring-1 ring-ink/[0.08] transition-all hover:-translate-y-0.5 hover:ring-teal/30 hover:shadow-[0_18px_40px_-24px_rgba(8,39,79,0.35)]"
            >
              <div className="relative aspect-square w-full overflow-hidden bg-parchment">
                <Image
                  src={product.image}
                  alt={product.name}
                  fill
                  sizes="(max-width: 640px) 50vw, 25vw"
                  className="object-cover transition-transform duration-300 group-hover:scale-105"
                />
              </div>
              <div className="flex flex-1 flex-col gap-1 p-4">
                <p className="font-body text-[11px] font-semibold uppercase tracking-wide text-teal-deep">{product.category}</p>
                <p className="line-clamp-2 font-body text-sm font-medium text-ink/80">{product.name}</p>
                <p className="mt-auto pt-1 font-display text-lg font-semibold text-indigo">{formatPrice(product.price, product.currency)}</p>
              </div>
            </Link>
          ))}
        </div>
      </Section>

      <CtaEnvelope
        title="Looking for"
        accent="something specific?"
        primary={{ href: '/stores', label: 'Browse stores' }}
        secondary={{ href: '/account', label: 'Start a request' }}
      />
    </main>
  )
}
