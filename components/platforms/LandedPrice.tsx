// components/platforms/LandedPrice.tsx
//
// The price a shopper actually pays for a pasted-link product, shown on
// every platform view (Amazon, FirstCry, Myntra...).
//
// Before this, each view printed the store price through formatPrice(),
// which only converts currency — a ₹1,499 kurti showed as "Rs. 5,396"
// with no freight, customs clearance, service charge or delivery, and the
// weight those depend on was silently 0.5 kg. Now each view shows:
//
//   - the delivered price for one unit, Express, through the same
//     lib/pricing.ts the cart and checkout use;
//   - the store's own price, for reference;
//   - the weight used (lib/weight-estimate.ts), which the shopper can change
//     when the store didn't give one: pick a category or type a weight.
//
// ItemInfoModal owns the weight and provides it through LinkWeightContext,
// so the platform views, the "Get quote" breakdown and the cart line all
// use the same number. Without a provider the views still work, with the
// automatic estimate and no way to change it.
'use client'

import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { Check, ChevronDown, Scale } from 'lucide-react'
import { getDualDeliveryPricing, formatLKR, type DeliveryPriceOption } from '@/lib/pricing'
import { getPricingSettings } from '@/lib/pricing-settings'
import type { ScrapeResult } from '@/lib/scrape/parsers'
import {
  CUSTOMER_WEIGHT_LIMITS,
  clampCustomerWeight,
  formatKg,
  initialWeightChoice,
  isEstimatedWeight,
  type WeightChoice,
} from '@/lib/weight-estimate'

type LinkWeightContextValue = {
  weight: WeightChoice
  setWeight: (w: WeightChoice) => void
}

export const LinkWeightContext = createContext<LinkWeightContextValue | null>(null)

function toNumber(v: unknown): number | null {
  if (v == null || v === '') return null
  const n = typeof v === 'number' ? v : Number(String(v).replace(/[^0-9.]/g, ''))
  return Number.isFinite(n) && n > 0 ? n : null
}

/** The automatic weight for a listing (store's own, else a category guess
 *  from the title and breadcrumb, else the weight block). */
export function initialWeightFor(result: ScrapeResult): WeightChoice {
  return initialWeightChoice({ title: result.title, category: result.categoryPath, weightKg: result.weightKg })
}

/** The modal's weight, or the automatic estimate when there's no modal. */
export function useLinkWeight(result: ScrapeResult): { weight: WeightChoice; setWeight: ((w: WeightChoice) => void) | null } {
  const ctx = useContext(LinkWeightContext)
  const fallback = useMemo(
    () => initialWeightFor(result),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [result.url, result.title, result.weightKg],
  )
  return ctx ? { weight: ctx.weight, setWeight: ctx.setWeight } : { weight: fallback, setWeight: null }
}

/** Express and Economy pricing for one unit of `result` at `weightKg`. */
export function landedPricing(
  result: Pick<ScrapeResult, 'price' | 'mrp' | 'currencyCode'>,
  weightKg: number,
): { express: DeliveryPriceOption; economy: DeliveryPriceOption; compareExpressLKR: number | null } | null {
  const price = toNumber(result.price)
  if (price == null) return null
  const currency = result.currencyCode ?? 'INR'
  const dual = getDualDeliveryPricing({ price, currency, weightKg })
  const mrp = toNumber(result.mrp)
  const compareExpressLKR =
    mrp != null && mrp > price ? getDualDeliveryPricing({ price: mrp, currency, weightKg }).express.actualTotalLKR : null
  return { express: dual.express, economy: dual.economy, compareExpressLKR }
}

/**
 * Drop-in replacement for the views' old `fmt(result.price, ...)` /
 * `fmt(result.mrp, ...)` pair: the same strings, but the delivered price.
 */
export function useLandedPrice(result: ScrapeResult): { price: string | null; mrp: string | null } {
  const { weight } = useLinkWeight(result)
  return useMemo(() => {
    const p = landedPricing(result, weight.kg)
    if (!p) return { price: null, mrp: null }
    return {
      price: formatLKR(p.express.actualTotalLKR),
      mrp: p.compareExpressLKR != null ? formatLKR(p.compareExpressLKR) : null,
    }
  }, [result, weight.kg])
}

/** "₹1,499" / "$24.99" — the store's own price, in its own currency. */
export function formatStorePrice(amount: unknown, currency: string | null | undefined): string | null {
  const n = toNumber(amount)
  if (n == null) return null
  const code = currency || 'INR'
  try {
    return new Intl.NumberFormat(code === 'INR' ? 'en-IN' : 'en-US', {
      style: 'currency',
      currency: code,
      maximumFractionDigits: n % 1 === 0 ? 0 : 2,
    }).format(n)
  } catch {
    return `${code} ${n.toLocaleString('en-US')}`
  }
}

/** Short line under the price: what it includes, and the store price. */
export function LandedPriceNote({ result }: { result: ScrapeResult }) {
  const storePrice = formatStorePrice(result.price, result.currencyCode)
  if (!storePrice) return null
  return (
    <p className="mt-1.5 text-xs leading-relaxed text-ink/50">
      Delivered to your door (Express) — includes international shipping, handling and delivery.{' '}
      <span className="whitespace-nowrap">
        Store price <span className="font-semibold text-ink/65">{storePrice}</span>
      </span>
    </p>
  )
}

/**
 * The weight row: what weight the price uses and, unless it came from the
 * store, a way to change it (category chips or a typed weight).
 */
export function WeightControl({ result, compact = false }: { result: ScrapeResult; compact?: boolean }) {
  const { weight, setWeight } = useLinkWeight(result)
  const presets = getPricingSettings().weightPresets
  // The store's weight (plus packaging) can be changed too, but it isn't
  // encouraged: a quiet "Edit" link instead of a button, and a warning.
  const editable = !!setWeight
  const auto = useMemo(
    () => initialWeightFor(result),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [result.url, result.title, result.weightKg],
  )
  const storeKnown = auto.source === 'store'
  const fromStore = weight.source === 'store'
  const [open, setOpen] = useState(false)
  const [custom, setCustom] = useState('')

  // Typing in the box is a draft until "Use"; keep it in step with the
  // chosen weight when that changes from outside.
  useEffect(() => {
    if (weight.source === 'custom') setCustom(String(weight.kg))
  }, [weight.source, weight.kg])

  const customKg = Number(custom)
  const customValid = custom.trim() !== '' && Number.isFinite(customKg) && customKg > 0

  const caption =
    weight.source === 'store'
      ? weight.storeKg != null && weight.marginPercent
        ? `Store weight ${formatKg(weight.storeKg)} + ${weight.marginPercent}% packaging`
        : 'From the store'
      : weight.source === 'custom'
        ? 'Your estimate'
        : weight.source === 'category'
          ? weight.label ?? 'Estimated'
          : 'Standard estimate'

  return (
    <div className={`${compact ? '' : 'mt-3'} rounded-xl bg-ink/[0.03] ring-1 ring-inset ring-ink/10`}>
      <div className="flex items-center gap-2.5 px-3 py-2.5">
        <Scale size={15} className="flex-none text-teal-deep" strokeWidth={2} />
        <div className="min-w-0 flex-1 text-xs">
          <p className="text-ink/70">
            Priced at <span className="font-bold tabular-nums text-ink">{formatKg(weight.kg)}</span>
            <span className="text-ink/45"> · {caption}</span>
          </p>
          {isEstimatedWeight(weight.source) && (
            <p className="mt-0.5 text-[11px] leading-snug text-ink/45">
              {storeKnown
                ? 'You changed the store’s weight — our team will check it before you pay.'
                : editable
                  ? 'Not the right kind of item? Change it for a closer price.'
                  : 'Estimated weight.'}
            </p>
          )}
        </div>
        {editable && fromStore && (
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            className="flex-none text-[11px] font-medium text-ink/40 underline decoration-ink/20 underline-offset-2 hover:text-ink/60"
          >
            {open ? 'Close' : 'Edit'}
          </button>
        )}
        {editable && !fromStore && (
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            className="inline-flex flex-none items-center gap-1 rounded-lg border border-ink/15 bg-white px-2.5 py-1.5 text-xs font-semibold text-teal-deep transition-colors hover:border-teal/40 hover:bg-teal/5"
          >
            Change
            <ChevronDown size={13} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
          </button>
        )}
      </div>

      {editable && open && (
        <div className="border-t border-ink/10 px-3 pb-3 pt-2.5">
          {storeKnown && (
            <div className="mb-3 rounded-lg bg-gold/10 px-2.5 py-2 text-[11px] leading-snug text-gold-deep ring-1 ring-inset ring-gold/25">
              <p>
                This weight comes from the store{auto.marginPercent ? `, plus ${auto.marginPercent}% for packaging` : ''}, so it’s usually right. Only
                change it if you’re sure it’s wrong — our team then checks it and may update the price before you pay.
              </p>
              {!fromStore && (
                <button
                  type="button"
                  onClick={() => {
                    setWeight!(auto)
                    setOpen(false)
                  }}
                  className="mt-1.5 font-semibold text-teal-deep underline underline-offset-2"
                >
                  Use the store’s weight ({formatKg(auto.kg)})
                </button>
              )}
            </div>
          )}
          {presets.length > 0 && (
            <>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-ink/40">What kind of item is it?</p>
              <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                {presets.map((p) => {
                  const active = weight.source === 'category' && weight.presetId === p.id
                  return (
                    <button
                      key={p.id}
                      type="button"
                      aria-pressed={active}
                      onClick={() => {
                        setWeight!({ kg: p.kg, source: 'category', presetId: p.id, label: p.label, guessed: false })
                        setOpen(false)
                      }}
                      className={`flex items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-xs transition-colors ${
                        active ? 'bg-teal/10 font-semibold text-teal-deep ring-1 ring-inset ring-teal/30' : 'bg-white text-ink/75 ring-1 ring-inset ring-ink/10 hover:ring-teal/30'
                      }`}
                    >
                      <span className="flex min-w-0 items-center gap-1.5">
                        {active && <Check size={12} className="flex-none" />}
                        <span className="truncate">{p.label}</span>
                      </span>
                      <span className="flex-none tabular-nums text-ink/45">{formatKg(p.kg)}</span>
                    </button>
                  )
                })}
              </div>
            </>
          )}

          <form
            className="mt-3 flex items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              if (!customValid) return
              setWeight!({ kg: clampCustomerWeight(customKg), source: 'custom', label: 'Your estimate' })
              setOpen(false)
            }}
          >
            <label className="flex min-w-0 flex-1 items-center overflow-hidden rounded-lg border border-ink/15 bg-white focus-within:border-teal/50 focus-within:ring-2 focus-within:ring-teal/15">
              <span className="sr-only">Weight in kilograms</span>
              <input
                type="number"
                inputMode="decimal"
                step="0.05"
                min={CUSTOMER_WEIGHT_LIMITS.min}
                max={CUSTOMER_WEIGHT_LIMITS.max}
                value={custom}
                onChange={(e) => setCustom(e.target.value)}
                placeholder="Or type the weight"
                className="w-full min-w-0 bg-transparent px-2.5 py-2 text-xs tabular-nums text-ink outline-none placeholder:text-ink/35"
              />
              <span className="flex-none border-l border-ink/10 bg-parchment/60 px-2.5 py-2 text-xs font-semibold text-ink/50">kg</span>
            </label>
            <button
              type="submit"
              disabled={!customValid}
              className="flex-none rounded-lg bg-teal-deep px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-indigo-deep disabled:cursor-not-allowed disabled:opacity-40"
            >
              Use
            </button>
          </form>
          <p className="mt-2 text-[11px] leading-snug text-ink/45">
            Between {CUSTOMER_WEIGHT_LIMITS.min} and {CUSTOMER_WEIGHT_LIMITS.max} kg. Our team checks the weight before buying — if it’s
            different, we update the price and let you know before you pay.
          </p>
        </div>
      )}
    </div>
  )
}

/** Note + weight row, placed straight under each view's price line. A
 *  sold-out listing can't be ordered, so it gets no weight row — just the
 *  store price for reference. */
export function LandedPriceDetails({ result }: { result: ScrapeResult }) {
  if (result.unavailable) {
    const storePrice = formatStorePrice(result.price, result.currencyCode)
    return (
      <p className="mt-1.5 text-xs leading-relaxed text-ink/50">
        Sold out at the store, so it can’t be ordered right now. Price shown for reference
        {storePrice ? ` — store price ${storePrice}` : ''}.
      </p>
    )
  }
  return (
    <>
      <LandedPriceNote result={result} />
      <WeightControl result={result} />
    </>
  )
}
