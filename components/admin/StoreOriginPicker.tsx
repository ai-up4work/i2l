'use client'

// Store location picker: India (default) or a local Sri Lankan shop.
// Used by the seller wizard (feed / extractor stores) and Social Stores,
// so every kind of store can be local. What "local" changes is spelled
// out under the choice, from the same constants checkout uses
// (lib/store-origin.ts).

import { formatLKR } from '@/lib/pricing'
import {
  localDeliveryFeeLKR,
  localPickupFeeLKR,
  STORE_ORIGIN_FLAG,
  type StoreOrigin,
} from '@/lib/store-origin'

const OPTIONS: { value: StoreOrigin; title: string; hint: string }[] = [
  { value: 'IN', title: 'India', hint: 'Bought in India, quality-checked and shipped to Sri Lanka.' },
  { value: 'LK', title: 'Sri Lanka (local)', hint: 'Picked up from the shop and delivered from our Sri Lanka warehouse.' },
]

export function StoreOriginPicker({
  value,
  onChange,
  disabled,
  compact,
}: {
  value: StoreOrigin
  onChange: (value: StoreOrigin) => void
  disabled?: boolean
  /** Hide the explanation under the choice. */
  compact?: boolean
}) {
  return (
    <div>
      <div role="radiogroup" aria-label="Store location" className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {OPTIONS.map((o) => {
          const active = value === o.value
          return (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={active}
              disabled={disabled}
              onClick={() => onChange(o.value)}
              className={`flex items-start gap-3 rounded-xl border px-3.5 py-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                active ? 'border-teal-deep bg-teal/[0.07] ring-1 ring-teal-deep' : 'border-ink/12 bg-card hover:border-ink/25'
              }`}
            >
              <span aria-hidden className="text-lg leading-none">
                {STORE_ORIGIN_FLAG[o.value]}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-ink">{o.title}</span>
                <span className="mt-0.5 block text-xs leading-snug text-ink/55">{o.hint}</span>
              </span>
            </button>
          )
        })}
      </div>
      {!compact && value === 'LK' && (
        <p className="mt-2 rounded-lg bg-parchment px-3 py-2 text-xs leading-relaxed text-ink/65">
          Shoppers pay the shop&rsquo;s price (in LKR) + your margin, {formatLKR(localDeliveryFeeLKR())} delivery per item, and{' '}
          {formatLKR(localPickupFeeLKR())} pickup once per order from this shop. No import charges. Orders skip export
          and international shipping.
        </p>
      )}
    </div>
  )
}
