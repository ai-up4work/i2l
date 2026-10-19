'use client'

// Pick which shopping categories a store belongs to (lib/store-categories.ts).
// Shoppers find the store under these on /categories and from the header's
// Shop menu. Used by the seller wizard and Social Stores.

import { Check } from 'lucide-react'
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
        {STORE_CATEGORIES.map(({ name, icon: Icon }) => {
          const on = picked.has(name)
          return (
            <button
              key={name}
              type="button"
              role="checkbox"
              aria-checked={on}
              disabled={disabled}
              onClick={() => toggle(name)}
              className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-left text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                on ? 'border-teal-deep bg-teal/[0.07] font-semibold text-ink ring-1 ring-teal-deep' : 'border-ink/12 bg-card text-ink/70 hover:border-ink/25'
              }`}
            >
              <span
                className={`grid h-7 w-7 flex-none place-items-center rounded-lg ${on ? 'bg-teal-deep text-white' : 'bg-teal/10 text-teal-deep'}`}
              >
                {on ? <Check size={14} strokeWidth={2.5} /> : <Icon size={14} strokeWidth={2} />}
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
