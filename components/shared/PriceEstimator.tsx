'use client'

// "Know the rupee price? See roughly what it costs here."
// Shopper types the price in INR and the weight (or picks a preset), and
// sees the approximate final price in LKR — same formula as checkout
// (lib/price-estimate.ts). A quick look only: nothing is ordered.
//
// Used on /estimate, in the landing page's "Estimate a price" pop-up, on
// Shipping → Pricing, and on the item screen when a link couldn't be read.

import { useId, useMemo, useState } from 'react'
import { Minus, Plus } from 'lucide-react'
import { formatLKR } from '@/lib/pricing'
import { ESTIMATE_LIMITS, WEIGHT_PRESETS, defaultEstimateWeightKg, estimateIndianItem, interpretWeightInput } from '@/lib/price-estimate'

export default function PriceEstimator({
  initialPriceINR,
  compact = false,
  className = '',
}: {
  /** Pre-fills the price, e.g. when a scrape read a rupee price but couldn't confirm it. */
  initialPriceINR?: number | null
  /** Tight layout for narrow spots like the item screen. */
  compact?: boolean
  className?: string
}) {
  const id = useId()
  const [priceText, setPriceText] = useState(initialPriceINR && initialPriceINR > 0 ? String(Math.round(initialPriceINR)) : '')
  const [preset, setPreset] = useState<number | null>(null) // index into WEIGHT_PRESETS
  const [weightText, setWeightText] = useState('')
  const [qty, setQty] = useState(1)

  const priceINR = Number(priceText.replace(/[^0-9.]/g, ''))
  // Typed weight is read forgivingly: "500" in the kg box means 500 g.
  const typedWeight = interpretWeightInput(weightText)
  const weightKg = preset != null ? WEIGHT_PRESETS[preset].kg : typedWeight.kg
  const estimate = useMemo(() => estimateIndianItem({ priceINR, weightKg, qty }), [priceINR, weightKg, qty])

  const label = 'mb-1.5 block font-body text-xs font-semibold text-ink/60'
  const field =
    'h-11 w-full rounded-xl border border-ink/15 bg-white px-3.5 font-body text-[15px] text-ink outline-none transition-shadow placeholder:text-ink/35 focus:border-teal/50 focus:ring-2 focus:ring-teal/15'

  const inputs = (
    <div className="flex flex-col gap-5">
      <div>
        <label htmlFor={`${id}-price`} className={label}>
          Price on the Indian store
        </label>
        <div className="relative">
          <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 font-body text-[15px] font-semibold text-ink/45">₹</span>
          <input
            id={`${id}-price`}
            inputMode="decimal"
            autoComplete="off"
            value={priceText}
            onChange={(e) => setPriceText(e.target.value.replace(/[^0-9.,]/g, '').slice(0, 12))}
            placeholder="e.g. 1,499"
            className={`${field} pl-8`}
          />
        </div>
      </div>

      <div>
        <span className={label}>Weight</span>
        {/* Preset chips take most of a phone screen, so phones get a quiet
            "What is it?" dropdown beside the weight box instead (same rule:
            picking one clears a typed weight, typing clears the pick).
            Tablets and up keep the chips. */}
        <div className="hidden flex-wrap gap-1.5 sm:flex">
          {WEIGHT_PRESETS.map((p, i) => {
            const on = preset === i
            return (
              <button
                key={p.label}
                type="button"
                aria-pressed={on}
                onClick={() => {
                  setPreset(on ? null : i)
                  setWeightText('')
                }}
                className={`rounded-full px-3 py-1.5 font-body text-xs font-medium ring-1 transition-colors ${
                  on ? 'bg-indigo text-parchment ring-indigo' : 'bg-white text-ink/70 ring-ink/12 hover:ring-teal/40'
                }`}
              >
                {p.label} <span className={on ? 'text-parchment/60' : 'text-ink/40'}>~{p.kg} kg</span>
              </button>
            )
          })}
        </div>
        <div className="flex items-center gap-2 sm:mt-2.5">
          <select
            aria-label="What is it? (fills a typical weight)"
            value={preset ?? ''}
            onChange={(e) => {
              setPreset(e.target.value === '' ? null : Number(e.target.value))
              setWeightText('')
            }}
            className={`${field} min-w-0 flex-1 text-sm text-ink/70 sm:hidden`}
          >
            <option value="">What is it? (optional)</option>
            {WEIGHT_PRESETS.map((p, i) => (
              <option key={p.label} value={i}>
                {p.label} · ~{p.kg} kg
              </option>
            ))}
          </select>
          <label htmlFor={`${id}-weight`} className="sr-only font-body text-xs text-ink/50 sm:not-sr-only">
            or exact weight
          </label>
          <div className="relative w-28 flex-none">
            <input
              id={`${id}-weight`}
              inputMode="decimal"
              autoComplete="off"
              value={weightText}
              onChange={(e) => {
                setWeightText(e.target.value.replace(/[^0-9.]/g, '').slice(0, 5))
                setPreset(null)
              }}
              placeholder={preset != null ? String(WEIGHT_PRESETS[preset].kg) : '0.5'}
              className={`${field} h-9 pr-9 text-sm`}
            />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 font-body text-xs text-ink/45">kg</span>
          </div>
        </div>
        {preset == null && typedWeight.note && (
          <p className="mt-1.5 font-body text-xs text-gold-deep" aria-live="polite">
            {typedWeight.note}
          </p>
        )}
      </div>

      <div className="flex items-center justify-between gap-3">
        <span className={`${label} mb-0`}>Quantity</span>
        <div className="flex items-center gap-3 rounded-xl border border-ink/15 bg-white px-2 py-1">
          <button
            type="button"
            aria-label="Fewer"
            onClick={() => setQty((q) => Math.max(1, q - 1))}
            className="grid h-7 w-7 place-items-center rounded-md text-ink/60 hover:bg-teal/10 hover:text-teal-deep"
          >
            <Minus size={14} />
          </button>
          <span className="min-w-[18px] text-center font-body text-sm font-bold tabular-nums">{qty}</span>
          <button
            type="button"
            aria-label="More"
            onClick={() => setQty((q) => Math.min(ESTIMATE_LIMITS.maxQty, q + 1))}
            className="grid h-7 w-7 place-items-center rounded-md text-ink/60 hover:bg-teal/10 hover:text-teal-deep"
          >
            <Plus size={14} />
          </button>
        </div>
      </div>
    </div>
  )

  const result = (
    <div aria-live="polite" className="flex flex-col justify-between rounded-2xl bg-indigo p-5 text-parchment">
      {estimate ? (
        <div className="flex flex-col gap-4">
          {estimate.options.map((o) =>
            o.locked ? (
              // Switched off in Admin → Pricing engine: tease it, no price.
              <div key={o.method} className="rounded-xl border border-dashed border-parchment/25 p-3">
                <p className="flex items-center gap-2 font-body text-[11px] font-semibold uppercase tracking-[0.18em] text-parchment/70">
                  {o.label} delivery
                  <span className="rounded-full bg-gold px-2 py-0.5 text-[9.5px] font-bold tracking-[0.12em] text-indigo">Coming soon</span>
                </p>
                <p className="mt-1 font-body text-xs leading-relaxed text-parchment/60">
                  A lower-cost, slower way to ship. Launching soon.
                </p>
              </div>
            ) : (
            <div key={o.method}>
              <p className="font-body text-[11px] font-semibold uppercase tracking-[0.18em] text-gold">
                About · {o.label} delivery
              </p>
              <p className="mt-1 font-display text-3xl font-semibold tracking-tight sm:text-4xl">{formatLKR(o.totalLKR)}</p>
              {estimate.qty > 1 && (
                <p className="font-body text-xs text-parchment/60">
                  {formatLKR(o.perItem.actualTotalLKR)} each × {estimate.qty}
                </p>
              )}
              <dl className="mt-3 flex flex-col gap-1.5 border-t border-parchment/15 pt-3 font-body text-xs">
                <div className="flex justify-between gap-3">
                  <dt className="text-parchment/65">{o.method === 'economy' ? 'Item, postage & customs' : 'Item, shipping & customs'}</dt>
                  <dd className="tabular-nums">{o.perItem.formattedPrice}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-parchment/65">Service charge</dt>
                  <dd className="tabular-nums">{o.perItem.formattedServiceCharge}</dd>
                </div>
                {o.perItem.deliveryFeeLKR > 0 && (
                  <div className="flex justify-between gap-3">
                    <dt className="text-parchment/65">Delivery to you</dt>
                    <dd className="tabular-nums">{o.perItem.formattedDeliveryFee}</dd>
                  </div>
                )}
                {estimate.qty > 1 && <p className="text-[11px] text-parchment/45">Per item</p>}
              </dl>
            </div>
            ),
          )}
        </div>
      ) : (
        <div>
          <p className="font-body text-[11px] font-semibold uppercase tracking-[0.18em] text-gold">Your estimate</p>
          <p className="mt-1 font-display text-3xl font-semibold text-parchment/35">LKR —</p>
          <p className="mt-2 font-body text-sm text-parchment/60">Type the price you see on the store to get a rough final price.</p>
        </div>
      )}
      <p className="mt-5 font-body text-[11px] leading-relaxed text-parchment/55">
        {estimate?.weightIsDefault
          ? `No weight given, so we used ${defaultEstimateWeightKg()} kg. `
          : ''}
        A rough guide, not a quote. Your exact price shows when you paste the product link, and is confirmed after we
        check the item.
      </p>
    </div>
  )

  if (compact) {
    // Tight version for narrow spots (the item screen): price + item type
    // side by side, weight + quantity on one row, and a short result bar.
    const express = estimate?.options.find((o) => o.method === 'express')
    const economy = estimate?.options.find((o) => o.method === 'economy')
    const small =
      'h-10 w-full rounded-lg border border-ink/15 bg-white px-3 font-body text-sm text-ink outline-none placeholder:text-ink/35 focus:border-teal/50 focus:ring-2 focus:ring-teal/15'
    return (
      <div className={`flex flex-col gap-3 ${className}`}>
        <div className="grid grid-cols-2 gap-2.5">
          <label className="min-w-0">
            <span className="mb-1 block font-body text-[11px] font-semibold text-ink/55">Price on the store</span>
            <span className="relative block">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-body text-sm font-semibold text-ink/45">₹</span>
              <input
                inputMode="decimal"
                autoComplete="off"
                value={priceText}
                onChange={(e) => setPriceText(e.target.value.replace(/[^0-9.,]/g, '').slice(0, 12))}
                placeholder="1,499"
                className={`${small} pl-7`}
              />
            </span>
          </label>
          <label className="min-w-0">
            <span className="mb-1 block font-body text-[11px] font-semibold text-ink/55">What is it?</span>
            <select
              value={preset ?? ''}
              onChange={(e) => {
                setPreset(e.target.value === '' ? null : Number(e.target.value))
                setWeightText('')
              }}
              className={`${small} pr-2`}
            >
              <option value="">Not sure</option>
              {WEIGHT_PRESETS.map((p, i) => (
                <option key={p.label} value={i}>
                  {p.label} (~{p.kg} kg)
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="flex items-center justify-between gap-3">
          <label className="flex items-center gap-2">
            <span className="font-body text-[11px] text-ink/50">or weight</span>
            <span className="relative w-20">
              <input
                inputMode="decimal"
                autoComplete="off"
                value={weightText}
                onChange={(e) => {
                  setWeightText(e.target.value.replace(/[^0-9.]/g, '').slice(0, 5))
                  setPreset(null)
                }}
                placeholder="0.5"
                className={`${small} h-8 pr-7 text-xs`}
              />
              <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 font-body text-[11px] text-ink/45">kg</span>
            </span>
          </label>
          <span className="flex items-center gap-2">
            <span className="font-body text-[11px] text-ink/50">Qty</span>
            <span className="flex items-center gap-1 rounded-lg border border-ink/15 bg-white px-1">
              <button type="button" aria-label="Fewer" onClick={() => setQty((q) => Math.max(1, q - 1))} className="grid h-7 w-7 place-items-center text-ink/60 hover:text-teal-deep">
                <Minus size={13} />
              </button>
              <span className="min-w-[14px] text-center font-body text-xs font-bold tabular-nums">{qty}</span>
              <button type="button" aria-label="More" onClick={() => setQty((q) => Math.min(ESTIMATE_LIMITS.maxQty, q + 1))} className="grid h-7 w-7 place-items-center text-ink/60 hover:text-teal-deep">
                <Plus size={13} />
              </button>
            </span>
          </span>
        </div>
        {preset == null && typedWeight.note && (
          <p className="-mt-1 font-body text-[11px] text-gold-deep">{typedWeight.note}</p>
        )}

        <div aria-live="polite" className="rounded-xl bg-indigo px-4 py-3 text-parchment">
          {express ? (
            <>
              <div className="flex items-baseline justify-between gap-3">
                <span className="font-body text-[10.5px] font-semibold uppercase tracking-[0.16em] text-gold">About · Express</span>
                <span className="font-display text-2xl font-semibold tabular-nums">{formatLKR(express.totalLKR)}</span>
              </div>
              <p className="mt-1 font-body text-[11px] text-parchment/60">
                {express.perItem.formattedPrice} item &amp; shipping · {express.perItem.formattedServiceCharge} service
                {express.perItem.deliveryFeeLKR > 0 ? ` · ${express.perItem.formattedDeliveryFee} delivery` : ''}
                {estimate!.qty > 1 ? ` (each, × ${estimate!.qty})` : ''}
              </p>
              {economy && (
                <div className="mt-2 flex items-center justify-between gap-3 border-t border-parchment/15 pt-2 font-body text-[11px]">
                  <span className="text-parchment/70">Economy</span>
                  {economy.locked ? (
                    <span className="rounded-full bg-gold px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-[0.1em] text-indigo">Coming soon</span>
                  ) : (
                    <span className="font-semibold tabular-nums">{formatLKR(economy.totalLKR)}</span>
                  )}
                </div>
              )}
            </>
          ) : (
            <p className="font-body text-xs text-parchment/65">Type the rupee price to see roughly what it costs delivered.</p>
          )}
        </div>
        <p className="font-body text-[10.5px] leading-snug text-ink/45">
          {estimate?.weightIsDefault ? `Weight not set, so we used ${defaultEstimateWeightKg()} kg. ` : ''}A rough guide only — the
          exact price is confirmed in the chat.
        </p>
      </div>
    )
  }

  return (
    <div className={`grid gap-5 md:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] md:gap-6 ${className}`}>
      {inputs}
      {result}
    </div>
  )
}
