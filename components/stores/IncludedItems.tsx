// components/stores/IncludedItems.tsx
//
// "What's included" list for hamper / gift-basket / bundle products — one
// row per item inside the bundle, with its photo and short note. Renders
// nothing unless the store's feed supplied product.includedItems (today:
// Guldasta Stories' basket_items, see lib/store-providers/sellers/guldasta-stories.ts).
//
// Server-safe (no hooks), so the product page can render it directly.
import { Check } from 'lucide-react'
import type { StoreProduct } from '@/lib/store.types'

export default function IncludedItems({ product }: { product: StoreProduct }) {
  const items = product.includedItems
  if (!items?.length) return null

  return (
    <section className="mt-8 border-t border-ink/10 pt-6" aria-labelledby="included-heading">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="included-heading" className="text-base font-semibold text-ink sm:text-lg">
          What&rsquo;s included
        </h2>
        <p className="text-xs font-medium text-ink/45">
          {items.length} {items.length === 1 ? 'item' : 'items'} in this hamper
        </p>
      </div>

      <ul className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {items.map((item, i) => (
          <li
            key={`${item.name}-${i}`}
            className="flex items-center gap-3.5 rounded-2xl border border-ink/[0.08] bg-ink/[0.015] p-3"
          >
            <div className="h-16 w-16 flex-none overflow-hidden rounded-xl bg-ink/[0.05] sm:h-[72px] sm:w-[72px]">
              {item.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={item.image} alt={item.name} loading="lazy" className="h-full w-full object-cover" />
              ) : null}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold leading-snug text-ink">
                {item.quantity ? <span className="text-ink/50">{item.quantity}&times; </span> : null}
                {item.name}
              </p>
              {item.description && (
                <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-ink/55">{item.description}</p>
              )}
              {item.sizes?.length ? (
                <p className="mt-1 text-[11px] font-medium text-ink/45">Sizes: {item.sizes.join(' · ')}</p>
              ) : null}
            </div>
            <span
              aria-hidden="true"
              className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-teal-deep/10 text-teal-deep"
            >
              <Check size={13} strokeWidth={2.5} />
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}
