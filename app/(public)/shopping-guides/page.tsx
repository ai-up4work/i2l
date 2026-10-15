import Link from 'next/link'
import { BookOpen, Link2, Ruler, Store, Wallet } from 'lucide-react'
import { CtaEnvelope, IconCard, PageHero, Section } from '@/components/public/PageKit'
import { pageMetadata } from '@/lib/seo'

export const metadata = pageMetadata({
  path: '/shopping-guides',
  title: 'Shopping Guides | Wishdrop',
  description: 'Practical, step-by-step guides for buying confidently from Indian stores through Wishdrop.',
})

const guides = [
  {
    icon: Link2,
    title: 'How to submit a product link',
    text: "Copy the product page URL from any store, paste it into New Request, and add size, colour, or quantity details so we quote it correctly the first time.",
  },
  {
    icon: Ruler,
    title: 'Reading size charts across brands',
    text: 'Sizing varies a lot between Indian and Western brands. Check the seller\u2019s own size chart on the product page before ordering — we quality-check against what was ordered, not what "should" fit.',
  },
  {
    icon: Wallet,
    title: 'Understanding your quote',
    text: 'Every quote breaks down product price, service fee, freight, and estimated customs charges separately. See our Shipping Pricing page for exactly how each line is calculated.',
  },
  {
    icon: BookOpen,
    title: 'Requesting something we don\u2019t sell yet',
    text: 'If a store isn\u2019t in our affiliated catalogue, submit it as a custom request — we\u2019ll review availability and get back to you with a manual quote.',
  },
]

const marketplaces = [
  { name: 'eBay', slug: 'ebay', blurb: 'Auctions and fixed-price listings, largely used-and-new electronics, collectibles, and parts.' },
  { name: 'Mercari', slug: 'mercari', blurb: 'A peer-to-peer marketplace popular for fashion, collectibles, and hobby items.' },
]

export default function ShoppingGuidesPage() {
  return (
    <main>
      <PageHero
        eyebrow="Shopping guides"
        title="Shop like you’ve"
        accent="done this before."
        intro="A few practical tips to help your first — or fiftieth — Wishdrop order go smoothly."
      />

      <Section eyebrow="The basics" title="Before you order">
        <div className="grid gap-4 md:grid-cols-2">
          {guides.map(({ icon, title, text }, i) => (
            <IconCard key={title} icon={icon} tone={i % 2 ? 'gold' : 'teal'} layout="row" title={title} text={text} />
          ))}
        </div>
      </Section>

      <Section eyebrow="Store guides" title="Buying from marketplaces">
        <div className="grid gap-4 md:grid-cols-2">
          {marketplaces.map((m) => (
            <IconCard key={m.slug} icon={Store} layout="row" title={`Buying from ${m.name}`} text={m.blurb} href={`/shopping/marketplaces/${m.slug}`} />
          ))}
        </div>
      </Section>

      <CtaEnvelope
        title="Found something?"
        accent="Send us the link."
        primary={{ href: '/account', label: 'Start a request' }}
        secondary={{ href: '/contact', label: 'Ask us first' }}
      />
    </main>
  )
}
