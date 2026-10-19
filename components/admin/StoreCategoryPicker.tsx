'use client'

// Pick which shopping categories a store belongs to (lib/store-categories.ts).
// Shoppers find the store under these on /categories and from the header's
// Shop menu. Used by the seller wizard and Social Stores.

import { Check } from 'lucide-react'
import CategoryImage from '@/components/shared/CategoryImage'
import { STORE_CATEGORIES, normalizeStoreCategories } from '@/lib/store-categories'

export function StoreCategoryPicker({
  value,
  onChange,
  disabled,
}: {
  value: string[]
  onChange: (value: string[]) => void
  disabled?: boolean
}) {
  // Normalised so a store saved with an older name (e.g. "Beauty") shows
  // the matching category ticked.
  const picked = new Set(normalizeStoreCategories(value) ?? [])

  function toggle(name: string) {
    const next = new Set(picked)
    if (next.has(name)) next.delete(name)
    else next.add(name)
    // Keep the saved order the same as the list.
    onChange(STORE_CATEGORIES.filter((c) => next.has(c.name)).map((c) => c.name))
  }

  return (
    <div>
      <div role="group" aria-label="Store categories" className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {STORE_CATEGORIES.map((category) => {
          const { name } = category
          const on = picked.has(name)
          return (
            <button
              key={name}
              type="button"
              role="checkbox"
              aria-checked={on}
              disabled={disabled}
              onClick={() => toggle(name)}
              className={`flex items-center gap-2.5 rounded-xl border p-2 pr-3 text-left text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                on ? 'border-teal-deep bg-teal/[0.07] font-semibold text-ink ring-1 ring-teal-deep' : 'border-ink/12 bg-card text-ink/70 hover:border-ink/25'
              }`}
            >
              {/* Same photo as the landing page / Shop menu, with a tick on top when picked. */}
              <span className="relative h-10 w-10 flex-none overflow-hidden rounded-lg">
                <CategoryImage category={category} className="absolute inset-0 h-full w-full" iconClassName="h-4 w-4" />
                {on && (
                  <span className="absolute inset-0 grid place-items-center bg-teal-deep/70 text-white">
                    <Check size={16} strokeWidth={2.75} />
                  </span>
                )}
              </span>
              <span className="min-w-0 leading-snug">{name}</span>
            </button>
          )
        })}
      </div>
      <p className="mt-2 text-xs text-ink/45">
        {value.length === 0
          ? 'Pick at least one so shoppers can find this store under Shop by category.'
          : `Shoppers will find this store under ${value.join(', ')}.`}
      </p>
    </div>
  )
}
