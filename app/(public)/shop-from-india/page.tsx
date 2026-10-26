// app/(public)/shop-from-india/page.tsx — /shop-from-india
//
// Hub for the per-store guides (content/store-guides.ts). Targets the
// broad searches: "Indian online shopping Sri Lanka", "shop from India to
// Sri Lanka", "buy from India deliver to Sri Lanka".

import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { CtaEnvelope, FAQ, PageHero, Section } from '@/components/public/PageKit'
import JsonLd, { breadcrumbSchema, faqSchema, itemListSchema } from '@/components/seo/JsonLd'
import { SHARED_GUIDE_FAQS, STORE_GUIDES } from '@/content/store-guides'
import { pageMetadata } from '@/lib/seo'

export const metadata = pageMetadata({
  title: 'Shop from Indian Online Stores in Sri Lanka — Delivered to Your Door',
  description:
    'Buy from Amazon India, Flipkart, Myntra, Nykaa, AJIO and more from Sri Lanka. Wishdrop buys it in India, quality-checks it and delivers it — one price in LKR, no customs to pay on arrival.',
  path: '/shop-from-india',
})

const HUB_FAQS = [
  {
    q: 'Can I shop from Indian online stores in Sri Lanka?',
    a: 'Yes. Most Indian stores only deliver within India, so Wishdrop buys the item for you in India, checks it, and delivers it to your door in Sri Lanka with one price in LKR.',
  },
  {
    q: 'Which Indian stores can I buy from?',
    a: 'Big stores such as Amazon India, Flipkart, Myntra, AJIO, Nykaa, Meesho, FirstCry and Tata CLiQ, plus the stores listed on Wishdrop. For other Indian online stores, send us the product link.',
  },
  ...SHARED_GUIDE_FAQS('India').slice(0, 3),
]

export default function ShopFromIndiaPage() {
  return (
    <main>
      <JsonLd
        data={[
          breadcrumbSchema([
            { name: 'Home', path: '/' },
            { name: 'Shop from India', path: '/shop-from-india' },
          ]),
          itemListSchema(
            'Indian stores you can shop from Sri Lanka',
            STORE_GUIDES.map((g) => ({ name: `How to buy from ${g.name} in Sri Lanka`, path: `/shop-from-india/${g.slug}` })),
          ),
          faqSchema(HUB_FAQS),
        ]}
      />

      <PageHero
        eyebrow="Shop from India"
        title="India’s online stores,"
        accent="delivered to Sri Lanka."
        intro="Most Indian stores only ship within India. Send us the link — Wishdrop buys it in India, checks it at our facility and delivers it to your door, with one price in rupees and nothing to pay on arrival."
      />

      <Section eyebrow="Store guides" title="Pick a store">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STORE_GUIDES.map((g) => (
            <Link
              key={g.slug}
              href={`/shop-from-india/${g.slug}`}
              className="group flex flex-col rounded-3xl bg-card p-5 ring-1 ring-ink/[0.08] transition-shadow hover:shadow-[0_20px_40px_-24px_rgba(8,39,79,0.35)]"
            >
              <h2 className="font-display text-lg font-semibold text-indigo">{g.name}</h2>
              <p className="mt-1.5 flex-1 font-body text-[13px] leading-relaxed text-ink/60">{g.knownFor}</p>
              <span className="mt-4 inline-flex items-center gap-1.5 font-body text-sm font-semibold text-teal-deep">
                How to buy <ArrowRight size={14} className="transition-transform group-hover:translate-x-0.5" />
              </span>
            </Link>
          ))}
        </div>
      </Section>

      <Section eyebrow="Questions" title="Shopping from India: FAQs">
        <FAQ items={HUB_FAQS} />
      </Section>

      <CtaEnvelope
        title="Have a link"
        accent="from an Indian store?"
        text="See the delivered price in rupees before you commit."
        primary={{ href: '/estimate', label: 'Price an item' }}
        secondary={{ href: '/stores', label: 'Browse our stores' }}
      />
    </main>
  )
}
