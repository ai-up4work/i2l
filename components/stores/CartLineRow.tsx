'use client'

import { useMemo } from 'react'
import Image from 'next/image'
import { Minus, Plus, Trash2, ShoppingBag } from 'lucide-react'
import type { CartLineItem } from '@/contexts/Cartcontext'
import { getDualDeliveryPricing, formatLKR, type ProductPriceableItem } from '@/lib/pricing'
import type { DeliveryChoice } from './CartDeliveryToggle'

/** Maps one cart line's snapshot onto the shape getDualDeliveryPricing
 * expects. sourcePrice/currencyCode/weightKg are exactly what
 * toCartSnapshot (AddToBagButton.tsx) populates. There's no
 * compareAtPrice/onSale on a cart snapshot, so this always shows a
 * straight price, not a "was" price — that comparison only makes sense
 * on the PDP where the live product record still has it. */
function toPriceableItem(line: CartLineItem): ProductPriceableItem {
  return {
    price: line.product.sourcePrice != null ? Number(line.product.sourcePrice) : 0,
    currency: line.product.currencyCode ?? 'USD',
    weightKg: line.product.weightKg ?? undefined,
  }
}

export default function CartLineRow({
  line,
  deliveryChoice,
  onUpdateQty,
  onRemove,
}: {
  line: CartLineItem
  deliveryChoice: DeliveryChoice
  onUpdateQty: (id: string, qty: number) => void
  onRemove: (id: string) => void
}) {
  const dual = useMemo(() => getDualDeliveryPricing(toPriceableItem(line)), [line])
  const option = deliveryChoice === 'economy' ? dual.economy : dual.express
  const lineTotalLKR = option.priceLKR * line.qty

  return (
    <div className="flex gap-4 border-b border-ink/10 py-5 last:border-0">
      <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl border border-ink/10 bg-card">
        {line.product.image ? (
          <Image
            src={line.product.image}
            alt={line.product.title}
            fill
            className="object-cover"
            sizes="80px"
          />
        ) : (
          <div className="grid h-full w-full place-items-center text-ink/25">
            <ShoppingBag size={20} />
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="line-clamp-2 text-sm font-semibold text-ink">{line.product.title}</p>
            {line.product.site && (
              <p className="mt-0.5 text-xs font-medium capitalize text-ink/40">{line.product.site}</p>
            )}
          </div>
          <button
            type="button"
            onClick={() => onRemove(line.product.id)}
            aria-label="Remove item"
            className="shrink-0 rounded-lg p-1.5 text-ink/35 transition-colors hover:bg-red-50 hover:text-red-500"
          >
            <Trash2 size={16} />
          </button>
        </div>

        <div className="mt-3 flex items-center justify-between gap-3">
          <div className="flex items-center overflow-hidden rounded-lg border border-ink/15">
            <button
              type="button"
              onClick={() => onUpdateQty(line.product.id, line.qty - 1)}
              aria-label="Decrease quantity"
              className="flex h-8 w-8 items-center justify-center transition-colors hover:bg-card"
            >
              <Minus size={12} />
            </button>
            <span className="w-7 text-center text-xs font-bold text-ink">{line.qty}</span>
            <button
              type="button"
              onClick={() => onUpdateQty(line.product.id, line.qty + 1)}
              aria-label="Increase quantity"
              className="flex h-8 w-8 items-center justify-center transition-colors hover:bg-card"
            >
              <Plus size={12} />
            </button>
          </div>

          <div className="text-right">
            <p className="font-display text-base font-bold tabular-nums text-ink">
              {formatLKR(lineTotalLKR)}
            </p>
            {line.qty > 1 && (
              <p className="text-[11px] text-ink/40">{option.formattedPrice} each</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}