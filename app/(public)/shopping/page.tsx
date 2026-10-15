import Link from 'next/link'
import { ArrowRight, BookOpen, Link2, ShoppingBag, Tag } from 'lucide-react'
import { CtaEnvelope, IconCard, IconTile, PageHero, Section, Steps } from '@/components/public/PageKit'
import { pageMetadata } from '@/lib/seo'

export const metadata = pageMetadata({
  path: '/shopping',
  title: 'How Shopping Works | Wishdrop',
  description:
    'Two ways to shop with Wishdrop: browse affiliated stores directly, or send us a link from an Indian store and let us buy it for you.',
})

const paths = [
  {
    icon: ShoppingBag,
    title: 'Browse affiliated stores',
    text: 'Shop directly from our catalogue of affiliated Indian sellers — prices, quotes, and checkout all happen in one place, no separate request needed.',
    cta: 'Browse stores',
    href: '/stores',
  },
  {
    icon: Link2,
    title: 'Send us a link',
    text: "Found something on a store we're not affiliated with? Paste the product link, tell us the size or variant you want, and we'll quote it for you.",
    cta: 'Start a request',
    href: '/account',
  },
]

const steps = [
  { title: 'Tell us what you want', text: 'Pick a product from an affiliated store, or paste a link and add any details (size, colour, quantity).' },
  { title: 'Review your quote', text: 'See the product price, our service fee, freight, and estimated customs charges before you pay anything.' },
  { title: 'We buy it', text: 'Once you accept and pay, Wishdrop purchases the item directly from the seller.' },
  { title: 'Track it home', text: 'Follow your order through quality check, shipping, and delivery from your account.' },
]

export default function ShoppingPage() {
  return (
    <main>
      <PageHero
        eyebrow="How shopping works"
        title="Two ways to shop,"
        accent="one journey."
        intro="Whatever you want to buy, Wishdrop is your buying agent — we find it, pay for it, check it and deliver it, so you don’t have to."
      />

      <Section>
        <div className="grid gap-5 md:grid-cols-2">
          {paths.map(({ icon, title, text, cta, href }, i) => (
            <Link
              key={title}
              href={href}
              className={`group flex flex-col rounded-3xl p-7 transition-all hover:-translate-y-0.5 sm:p-8 ${
                i === 0 ? 'bg-indigo text-parchment' : 'bg-card ring-1 ring-ink/[0.08] hover:ring-teal/30'
              }`}
            >
              {i === 0 ? (
                <span className="grid h-11 w-11 place-items-center rounded-2xl bg-parchment/10 text-gold">
                  <ShoppingBag size={20} strokeWidth={1.9} />
                </span>
              ) : (
                <IconTile icon={icon} />
              )}
              <h2 className={`mt-5 font-display text-2xl font-semibold ${i === 0 ? '' : 'text-indigo'}`}>{title}</h2>
              <p className={`mt-2 flex-1 font-body text-[15px] leading-relaxed ${i === 0 ? 'text-parchment/70' : 'text-ink/60'}`}>{text}</p>
              <span
                className={`mt-6 inline-flex w-fit items-center gap-2 rounded-full px-5 py-2.5 font-body text-sm font-semibold transition-colors ${
                  i === 0 ? 'bg-gold text-indigo group-hover:bg-parchment' : 'bg-teal text-white group-hover:bg-teal-deep'
                }`}
              >
                {cta} <ArrowRight size={14} />
              </span>
            </Link>
          ))}
        </div>
      </Section>

      <Section eyebrow="Step by step" title="From request to order">
        <Steps steps={steps} />
      </Section>

      <Section eyebrow="Not sure where to start?" title="Helpful reading">
        <div className="grid gap-4 md:grid-cols-2">
          <IconCard icon={BookOpen} layout="row" title="Shopping guides" text="Step-by-step help for sizing, links and your quote." href="/shopping-guides" />
          <IconCard icon={Tag} tone="gold" layout="row" title="Current deals" text="What’s discounted across our stores right now." href="/deals" />
        </div>
      </Section>

      <CtaEnvelope
        title="What can we"
        accent="get for you?"
        primary={{ href: '/account', label: 'Start a request' }}
        secondary={{ href: '/stores', label: 'Browse stores' }}
      />
    </main>
  )
}
