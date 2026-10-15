import { AlertCircle } from 'lucide-react'
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
    <div className="mx-auto max-w-5xl px-6 pb-16 pt-6 lg:px-10">
      {/* Banner */}
      <div className="relative overflow-hidden rounded-2xl bg-ink motion-safe:[animation:fadeUp_0.4s_ease-out_both]">
        <div className="relative z-10 px-8 py-10 sm:px-10">
          <p className="font-mono text-xs uppercase tracking-[0.3em] text-parchment/50">Shipping guidelines</p>
          <h1 className="mt-2 font-display text-3xl font-extrabold tracking-tight text-parchment sm:text-4xl">
            List of prohibited items
          </h1>
        </div>
        <div className="pointer-events-none absolute -right-10 -top-10 h-56 w-56 rounded-full bg-gold/20 blur-3xl" aria-hidden />
      </div>

      {/* Disclaimer */}
      <div className="mt-6 flex items-start gap-3 rounded-2xl border border-gold/40 bg-gold/10 px-5 py-4 motion-safe:[animation:fadeUp_0.4s_ease-out_0.05s_both]">
        <AlertCircle size={18} className="mt-0.5 flex-none text-gold-deep" strokeWidth={1.8} />
        <p className="text-sm leading-relaxed text-ink/80">
          This list covers the most common items we can&apos;t buy or ship, but it isn&apos;t complete. If
          something you order turns out to be restricted, we&apos;ll contact you before doing anything with it. You
          may need to cover the cost of returning it to the seller, and re-shipping it elsewhere costs extra. Not
          sure about an item? Ask us before you order.
        </p>
      </div>

      {/* All categories, shown at once */}
      {categories.map((category, ci) => (
        <section
          key={category.name}
          className="mt-10 motion-safe:[animation:fadeUp_0.4s_ease-out_both]"
          style={{ animationDelay: `${ci * 60}ms` }}
        >
          <h2 className="font-display text-xl font-bold tracking-tight text-ink sm:text-2xl">{category.name}</h2>

          <div className="mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {category.items.map((item, i) => (
              <div
                key={item.title}
                className="group relative flex flex-col overflow-hidden rounded-2xl border border-ink/10 bg-card transition-colors duration-200 hover:border-gold-deep/30 motion-safe:[animation:fadeUp_0.35s_ease-out_both]"
                style={{ animationDelay: `${i * 40}ms` }}
              >
                <div className="relative h-40 w-full overflow-hidden bg-ink/5">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={item.image}
                    alt=""
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                  {item.badge && (
                    <span className="absolute right-3 top-3 rounded-full bg-gold/90 px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-ink">
                      {item.badge}
                    </span>
                  )}
                </div>
                <div className="flex flex-col gap-1.5 p-5">
                  <p className="text-sm font-semibold leading-snug text-ink">{item.title}</p>
                  <p className="text-xs leading-relaxed text-ink/60">{item.description}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}

      {/* Footer note */}
      <div className="mt-10 flex flex-col items-center gap-2 rounded-2xl border border-ink/10 bg-card px-6 py-8 text-center motion-safe:[animation:fadeUp_0.4s_ease-out_0.15s_both]">
        <p className="font-display text-lg text-ink">Not sure about an item?</p>
        <p className="max-w-md text-sm leading-relaxed text-ink/60">
          Send us the link before you order and we&apos;ll tell you whether we can bring it in.
        </p>
        <a
          href="/contact"
          className="mt-2 inline-flex items-center rounded-full bg-teal-deep px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-indigo"
        >
          Ask us
        </a>
      </div>
    </div>
  )
}