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
  items: Item[]
}

// Illustrations are our own (public/images/prohibited/*.svg).
const categories: Category[] = [
  {
    name: 'Dangerous goods',
    items: [
      {
        title: 'Hazardous and toxic substances',
        description:
          'Explosives, radioactive material, toxic or corrosive chemicals, oxidisers, strong magnets and anything else classed as hazardous for air freight.',
        image: '/images/prohibited/harmful-substances.svg',
      },
      {
        title: 'Flammable items',
        description:
          'Flammable liquids and solids such as nail polish, hair dye, matches, fuel, paint thinners and some metal powders.',
        image: '/images/prohibited/flammable.svg',
      },
      {
        title: 'Gas and pressurised containers',
        description:
          'Aerosol sprays, gas cylinders, fire extinguishers, lighters, dry ice, airbags and carbonated or canned drinks.',
        image: '/images/prohibited/compressed-gas.svg',
      },
      {
        title: 'Loose batteries and power banks',
        description:
          'Batteries or power banks sent on their own, and large lithium batteries. Batteries fitted inside a device may be accepted — ask us first.',
        image: '/images/prohibited/batteries.svg',
      },
    ],
  },
  {
    name: 'Weapons and controlled items',
    items: [
      {
        title: 'Firearms and replicas',
        description:
          'Real firearms, ammunition and parts, plus air guns, replica or toy guns, and military or combat equipment.',
        image: '/images/prohibited/firearms.svg',
      },
      {
        title: 'Knives, blades and bows',
        description: 'Restricted knives, swords, blades, bows and arrows. Ordinary kitchen cutlery is fine.',
        image: '/images/prohibited/knives-and-bows.svg',
      },
      {
        title: 'Alcohol',
        description: 'Alcoholic drinks of any kind, and products with a high alcohol content.',
        image: '/images/prohibited/alcohol.svg',
      },
    ],
  },
  {
    name: 'Regulated goods',
    items: [
      {
        title: 'Cash, tickets and counterfeits',
        description: 'Cash and cash equivalents, event tickets, personal letters and documents, and counterfeit or replica branded goods.',
        image: '/images/prohibited/cash-and-tickets.svg',
      },
    ],
  },
  {
    name: 'Others',
    items: [
      {
        title: 'Items restricted by law',
        description:
          'Anything Sri Lankan or Indian law prohibits, or that needs a permit or approval from Customs or another authority before it can be imported.',
        image: '/images/prohibited/restricted-by-law.svg',
      },
    ],
  },
]

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
      </Section>

      {categories.map((category) => (
        <Section key={category.name} title={category.name}>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {category.items.map((item) => (
              <div key={item.title} className="group flex flex-col overflow-hidden rounded-3xl bg-card ring-1 ring-ink/[0.08]">
                <div className="relative h-40 w-full overflow-hidden bg-parchment">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={item.image} alt="" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" />
                  {item.badge && (
                    <span className="absolute right-3 top-3 rounded-full bg-gold px-2 py-0.5 font-body text-[10px] font-bold uppercase tracking-wider text-indigo">
                      {item.badge}
                    </span>
                  )}
                </div>
                <div className="flex flex-col gap-1.5 p-5">
                  <h3 className="font-display text-lg font-semibold leading-snug text-indigo">{item.title}</h3>
                  <p className="font-body text-sm leading-relaxed text-ink/60">{item.description}</p>
                </div>
              </div>
            ))}
          </div>
        </Section>
      ))}

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
