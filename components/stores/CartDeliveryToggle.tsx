'use client'

import { Package, Zap } from 'lucide-react'

export type DeliveryChoice = 'economy' | 'express'

/**
 * One delivery-method choice for the WHOLE cart — unlike the PDP, which
 * only ever *compares* Economy vs Express for a single product without
 * letting the shopper pick, this is a real selector: every line's price
 * and the grand total both re-derive off whichever option is active
 * here. Visually mirrors the PDP's shipping-slip pricing card (ticket
 * perforation seam, full-opacity teal/gold accents) so the two screens
 * read as the same design language.
 */
export default function CartDeliveryToggle({
  value,
  onChange,
}: {
  value: DeliveryChoice
  onChange: (choice: DeliveryChoice) => void
}) {
  return (
    <div className="rounded-3xl border border-ink/15 bg-card shadow-[0_1px_2px_rgba(15,42,42,0.04),0_12px_28px_-16px_rgba(15,42,42,0.35)]">
      <button
        type="button"
        onClick={() => onChange('economy')}
        aria-pressed={value === 'economy'}
        className={`flex w-full items-center gap-3 rounded-t-[calc(1.5rem-1px)] px-5 py-4 text-left transition-colors ${
          value === 'economy' ? 'bg-teal/[0.08]' : 'hover:bg-teal/[0.03]'
        }`}
      >
        <Package size={18} strokeWidth={1.75} className="shrink-0 text-teal-deep" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-ink">
            Economy <span className="font-normal text-teal-deep">· recommended</span>
          </p>
          <p className="text-xs text-ink/45">Delivery arrives in 3–4 weeks</p>
        </div>
        <span
          className={`h-4 w-4 shrink-0 rounded-full border-2 ${
            value === 'economy' ? 'border-teal-deep bg-teal-deep' : 'border-ink/25'
          }`}
        />
      </button>

      {/* Perforation seam — same treatment as the PDP's pricing card:
          page-background-colored circles punched into the card's side
          edges. Assumes the page background directly behind this card
          is `parchment` (matches AccountLayout) — update bg-parchment
          here if that background ever changes. */}
      <div className="relative">
        <div className="border-t border-dashed border-ink/15" />
        <span className="absolute left-[-13px] top-1/2 h-6 w-6 -translate-y-1/2 rounded-full bg-parchment" />
        <span className="absolute right-[-13px] top-1/2 h-6 w-6 -translate-y-1/2 rounded-full bg-parchment" />
      </div>

      <button
        type="button"
        onClick={() => onChange('express')}
        aria-pressed={value === 'express'}
        className={`flex w-full items-center gap-3 rounded-b-[calc(1.5rem-1px)] px-5 py-4 text-left transition-colors ${
          value === 'express' ? 'bg-gold/[0.08]' : 'hover:bg-gold/[0.03]'
        }`}
      >
        <Zap size={18} strokeWidth={1.75} className="shrink-0 text-gold-deep" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-ink">Express</p>
          <p className="text-xs text-ink/45">Delivery arrives in 12–15 days</p>
        </div>
        <span
          className={`h-4 w-4 shrink-0 rounded-full border-2 ${
            value === 'express' ? 'border-gold-deep bg-gold-deep' : 'border-ink/25'
          }`}
        />
      </button>
    </div>
  )
}