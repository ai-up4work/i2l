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

const categories: Category[] = [
  {
    name: 'Dangerous goods',
    items: [
      {
        title: 'Harmful substances',
        description:
          'Vehicle shock absorbers, explosives, strong magnets, radioactive material, oxidizers, organic peroxides (uranium, radium), toxic chemicals, and similar items.',
        image: 'https://www.buyandship.today/contents/uploads/2020/01/prohibited-all-radioactive-materials.jpg',
      },
      {
        title: 'Flammable materials',
        description:
          'Flammable solids, liquids, and substances that release flammable gas on contact with water — including matches, nail polish, hair dye, phosphorus, sulfur, and metal powders.',
        image: 'https://www.buyandship.today/contents/uploads/2020/01/prohibited-all-flammables.jpg',
      },
      {
        title: 'Gas and compressed gas tanks',
        description:
          'Compressed air, dry ice, fire extinguishers, gas cylinders, airbags, aerosols, gas lighters, light bulbs, and canned or carbonated beverages.',
        image:
          'https://www.buyandship.today/contents/uploads/2020/01/prohibited-all-gas-and-compressed-gas-cylinder.jpg',
      },
      {
        title: 'Battery',
        description:
          'Items that cannot clear security screening, including electronic components, standalone batteries, and separately-shipped batches of dry-cell or lithium batteries.',
        image: 'https://www.buyandship.today/contents/uploads/2020/01/prohibited-all-battery.jpg',
      },
    ],
  },
  {
    name: 'Weapons and controlled items',
    items: [
      {
        title: 'Firearms and related accessories',
        description:
          'All types of firearms and gun-related items, plus military or combat equipment such as gun slings, water guns, air guns, toy guns, shotguns, and bullets.',
        image:
          'https://www.buyandship.today/contents/uploads/2020/01/prohibited-all-guns-and-related-accessories.jpg',
      },
      {
        title: 'Controlled knives and arrows (excluding tableware)',
        description: 'All kinds of restricted knives, bows, blades, and similar controlled items.',
        image: 'https://www.buyandship.today/contents/uploads/2020/01/prohibited-all-controlled-knives-bow.jpg',
      },
      {
        title: 'Alcohols',
        description: 'All kinds of alcohol, including alcoholic beverages and perfumes.',
        image: 'https://www.buyandship.today/contents/uploads/2020/01/prohibited-all-alcohols.jpg',
      },
    ],
  },
  {
    name: 'Regulated consumer goods',
    items: [
      {
        title: 'Cash, and cash equivalents',
        description:
          'Concert and letters (bank, bills, personal), cash and cash equivalents, and counterfeit items.',
        image: 'https://www.buyandship.today/contents/uploads/2020/01/prohibited-jp-ticket.jpg',
        badge: 'Latest',
      },
    ],
  },
  {
    name: 'Others',
    items: [
      {
        title: 'Shipments prohibited by law or affected by law',
        description:
          'Shipments that are prohibited by law, restricted by regulations, or require prior approval, permits, or clearance from Customs or other relevant authorities may not be accepted or may be subject to additional clearance requrements..',
        image:
          'https://www.buyandship.today/contents/uploads/2024/03/Goods-restricted-by-law-or-that-may-impact-delivery.png',
        badge: 'Latest',
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
          Please note that the following list is a common prohibited item list and does not provide detailed
          examples of all prohibited items. We reserve the right to notify members that a product may still be
          unacceptable for import even if it is not explicitly listed. Where appropriate, we will contact you to
          discuss and take appropriate action — you may need to cover the cost of returning the product to the
          merchant, or we may handle the goods in any manner we deem appropriate. Reshipment, if required, incurs
          an additional fee.
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
                    alt={item.title}
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
        <p className="font-display text-lg text-ink">Is there a problem?</p>
        <p className="max-w-md text-sm leading-relaxed text-ink/60">
          Please first check out the Frequently Asked Questions to help answer your difficulties. If you have
          further questions, feel free to contact us.
        </p>
      </div>
    </div>
  )
}