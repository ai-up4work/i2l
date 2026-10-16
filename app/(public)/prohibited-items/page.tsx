import { AlertCircle } from 'lucide-react'
import { Callout, CtaEnvelope, PageHero, Section } from '@/components/public/PageKit'
import { pageMetadata } from '@/lib/seo'

export const metadata = pageMetadata({
  path: '/prohibited-items',
  title: 'Prohibited Items | Wishdrop',
  description: 'Products Wishdrop cannot purchase, import, or ship on your behalf, by category.',
})

type Item = {
  title: string
  description: string
  image: string
  badge?: string
}

type Category = {
  name: string
  blurb: string
  items: Item[]
}

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')

// Illustrations are our own (public/images/prohibited/*.png).
const categories: Category[] = [
  {
    name: 'Dangerous goods',
    blurb: 'Anything classed as hazardous for air freight.',
    items: [
      {
        title: 'Hazardous and toxic substances',
        description:
          'Explosives, radioactive material, toxic or corrosive chemicals, oxidisers, strong magnets and anything else classed as hazardous for air freight.',
        image: '/images/prohibited/harmful-substances.png',
      },
      {
        title: 'Flammable items',
        description:
          'Flammable liquids and solids such as nail polish, hair dye, matches, fuel, paint thinners and some metal powders.',
        image: '/images/prohibited/flammable.png',
      },
      {
        title: 'Gas and pressurised containers',
        description:
          'Aerosol sprays, gas cylinders, fire extinguishers, lighters, dry ice, airbags and carbonated or canned drinks.',
        image: '/images/prohibited/compressed-gas.png',
      },
      {
        title: 'Loose batteries and power banks',
        description:
          'Batteries or power banks sent on their own, and large lithium batteries. Batteries fitted inside a device may be accepted — ask us first.',
        image: '/images/prohibited/batteries.png',
      },
    ],
  },
  {
    name: 'Weapons and controlled items',
    blurb: 'Weapons, replicas and alcohol.',
    items: [
      {
        title: 'Firearms and replicas',
        description:
          'Real firearms, ammunition and parts, plus air guns, replica or toy guns, and military or combat equipment.',
        image: '/images/prohibited/firearms.png',
      },
      {
        title: 'Knives, blades and bows',
        description: 'Restricted knives, swords, blades, bows and arrows. Ordinary kitchen cutlery is fine.',
        image: '/images/prohibited/knives-and-bows.png',
      },
      {
        title: 'Alcohol',
        description: 'Alcoholic drinks of any kind, and products with a high alcohol content.',
        image: '/images/prohibited/alcohol.png',
      },
    ],
  },
  {
    name: 'Regulated goods',
    blurb: 'Money, documents and fakes.',
    items: [
      {
        title: 'Cash, tickets and counterfeits',
        description:
          'Cash and cash equivalents, event tickets, personal letters and documents, and counterfeit or replica branded goods.',
        image: '/images/prohibited/cash-and-tickets.png',
      },
    ],
  },
  {
    name: 'Others',
    blurb: 'Anything the law or Customs says no to.',
    items: [
      {
        title: 'Items restricted by law',
        description:
          'Anything Sri Lankan or Indian law prohibits, or that needs a permit or approval from Customs or another authority before it can be imported.',
        image: '/images/prohibited/restricted-by-law.png',
        badge: 'Check first',
      },
    ],
  },
]

function ItemImage({ item, wide }: { item: Item; wide?: boolean }) {
  return (
    <div
      className={`relative flex items-center justify-center overflow-hidden bg-parchment ${
        wide ? 'aspect-[4/3] sm:aspect-auto sm:w-72 sm:shrink-0 lg:w-80' : 'aspect-[4/3] w-full'
      }`}
    >
      {/* object-contain so the whole illustration (including the red “no” sign) is always visible */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={item.image}
        alt=""
        loading="lazy"
        className="h-full w-full object-contain p-3 transition-transform duration-300 group-hover:scale-[1.03] motion-reduce:transition-none"
      />
      {item.badge && (
        <span className="absolute right-3 top-3 rounded-full bg-gold px-2.5 py-0.5 font-body text-xs font-semibold text-indigo">
          {item.badge}
        </span>
      )}
    </div>
  )
}

function ItemCard({ item, wide }: { item: Item; wide?: boolean }) {
  return (
    <article
      className={`group flex overflow-hidden rounded-3xl bg-card ring-1 ring-ink/[0.08] transition-shadow hover:shadow-lg hover:shadow-indigo/10 ${
        wide ? 'flex-col sm:flex-row sm:items-stretch lg:col-span-3 sm:col-span-2' : 'flex-col'
      }`}
    >
      <ItemImage item={item} wide={wide} />
      <div className={`flex flex-col gap-2 p-6 ${wide ? 'sm:justify-center sm:p-8' : ''}`}>
        <h3 className="font-display text-lg font-semibold leading-snug text-indigo">{item.title}</h3>
        <p className="max-w-prose font-body text-sm leading-relaxed text-ink/70">{item.description}</p>
      </div>
    </article>
  )
}

export default function ProhibitedItemsPage() {
  return (
    <main>
      <PageHero
        eyebrow="Shipping guidelines"
        title="What we"
        accent="can’t ship."
        intro="Some items can’t be bought, flown or imported into Sri Lanka. Here are the most common ones — check before you order."
      />

      <Section>
        <Callout tone="gold" icon={AlertCircle}>
          This list covers the most common items we can&apos;t buy or ship, but it isn&apos;t complete. If something you
          order turns out to be restricted, we&apos;ll contact you before doing anything with it. You may need to cover the
          cost of returning it to the seller, and re-shipping it elsewhere costs extra.
        </Callout>

        {/* Jump links */}
        <nav aria-label="Categories" className="mt-8 flex flex-wrap gap-2">
          {categories.map((c) => (
            <a
              key={c.name}
              href={`#${slugify(c.name)}`}
              className="rounded-full bg-card px-4 py-2 font-body text-sm font-medium text-indigo ring-1 ring-ink/10 transition-colors hover:bg-indigo hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo"
            >
              {c.name}
            </a>
          ))}
        </nav>

        {/* All categories live in one Section so spacing is controlled here, not by repeated Section padding */}
        <div className="mt-12 flex flex-col gap-14 sm:gap-16">
          {categories.map((category) => {
            const single = category.items.length === 1
            return (
              <section key={category.name} id={slugify(category.name)} aria-labelledby={`${slugify(category.name)}-h`} className="scroll-mt-28">
                <header className="mb-6 flex flex-col gap-1 border-b border-ink/10 pb-4 sm:flex-row sm:items-baseline sm:justify-between">
                  <h2 id={`${slugify(category.name)}-h`} className="font-display text-3xl font-bold text-indigo sm:text-4xl">
                    {category.name}
                  </h2>
                  <p className="font-body text-sm text-ink/60">{category.blurb}</p>
                </header>

                <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                  {category.items.map((item) => (
                    <ItemCard key={item.title} item={item} wide={single} />
                  ))}
                </div>
              </section>
            )
          })}
        </div>
      </Section>

      <CtaEnvelope
        eyebrow="Not sure about an item?"
        title="Ask us"
        accent="before you order."
        text="Send us the link and we’ll tell you whether we can bring it in."
        primary={{ href: '/contact', label: 'Ask us' }}
      />
    </main>
  )
}