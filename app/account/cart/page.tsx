// app/account/cart/page.tsx
'use client'

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { motion } from 'framer-motion'
import {
  ShoppingBag,
  ClipboardList,
  Truck,
  Plane,
  Lock,
  ArrowRight,
  Tag,
  ShieldCheck,
  User,
  Mail,
  Phone,
  MapPin,
  Store,
  Link2,
  ChevronDown,
  ChevronRight,
  X,
  Info,
  Check,
  Trash2,
  AlertCircle,
  SlidersHorizontal,
  Minus,
  Plus,
  MessageCircle,
} from 'lucide-react'
import CartVariantPicker, { cartLineHandle, optionsLabel } from '@/components/cart/CartVariantPicker'
import { useCart, type CartLineItem, type CartProduct } from '@/contexts/Cartcontext'
import { useOrders } from '@/contexts/Ordercontexts'
import { useAuth } from '@/contexts/AuthContext'
import { createClient } from '@/lib/supabase/client'
import {
  getDualDeliveryPricing,
  withExtraServiceCharge,
  formatLKR,
  TERMS_URL,
  TERMS_SUMMARY,
  type ProductPriceableItem,
  type DeliveryPriceOption,
} from '@/lib/pricing'
import { useStorePricingLookup } from '@/hooks/useStorePricingLookup'
import { localPickupFees, localServiceShares, localPickupFeeLKR, type StorePricingInfo } from '@/lib/store-origin'
import Image from 'next/image'
import DealCoupon from '@/components/shared/DealCoupon-flex'
import { COUPON_BADGE, couponToDisplay, type CouponDesign } from '@/lib/coupons/design'

type DeliveryChoice = 'economy' | 'express'

const EASE_OUT_EXPO = [0.16, 1, 0.3, 1] as const

const COMMON_COUNTRIES = [
  'Sri Lanka',
  'India',
  'United States',
  'United Kingdom',
  'Australia',
  'Canada',
  'United Arab Emirates',
  'Singapore',
  'Germany',
  'France',
] as const

// Recognized WhatsApp country codes — matches the <select> options in the
// shipping form below. Used to split a stored "+94 77 123 4567"-style
// phone number (from `addresses.phone`) back into the code dropdown +
// bare number when prefilling, without guessing at codes the form
// doesn't actually support.
const KNOWN_WHATSAPP_CODES = ['+94', '+91', '+1', '+44']

function toPriceableItem(product: CartProduct, info?: StorePricingInfo): ProductPriceableItem {
  return {
    // Local Sri Lankan shops are priced without the import formula — see
    // lib/store-origin.ts. `info` comes from the live store list
    // (useStorePricingLookup); without it, what the line remembered.
    origin: info?.origin ?? product.origin ?? null,
    marginIncluded: info?.marginIncluded ?? product.marginIncluded,
    price: product.sourcePrice != null ? Number(product.sourcePrice) : 0,
    // Social stores: the store's currency wins over what the line remembered.
    currency: info?.currency ?? product.currencyCode ?? 'USD',
    weightKg: product.weightKg ?? undefined,
    // Lets lib/pricing.ts recognise fixed-price stores (Wishdrop Mall:
    // price as set + delivery only, no import charges).
    storeSlug: product.site ?? null,
  }
}

/** What POST /api/checkout(/quote) needs per line. Prices sent here are
 *  only a last resort — the server looks up each item's real price. */
function toCheckoutLine(line: CartLineItem) {
  const p = line.product
  return {
    id: p.id,
    url: p.url,
    site: p.site ?? null,
    title: p.title,
    image: p.image ?? null,
    currencyCode: p.currencyCode ?? null,
    sourcePrice: p.sourcePrice ?? null,
    weightKg: p.weightKg ?? null,
    source: p.source ?? 'link',
    selectedOptions: p.selectedOptions ?? null,
    productHandle: p.productHandle ?? null,
    qty: line.qty,
  }
}

/** POST /api/checkout/quote response (lib/checkout/server.ts CheckoutQuote). */
type ServerQuote = {
  priceSubtotalLKR: number
  serviceSubtotalLKR: number
  deliverySubtotalLKR: number
  pickupLKR: number
  discountLKR: number
  totalLKR: number
  coupon: { id: string; title: string; label: string } | null
  couponError: string | null
  needsReview: boolean
  /** Per line; missingOptions = size / colour still to choose. */
  lines?: { id: string; inStock: boolean; priceLKR: number; missingOptions: ('Size' | 'Color')[] }[]
  /** Every coupon on the account, checked against this bag (lib/checkout/server.ts CartCoupon). */
  availableCoupons: CartCoupon[]
}

type CartCoupon = {
  id: string
  title: string
  token: string
  discountType: 'percent' | 'fixed'
  discountValue: number
  maxDiscountLKR: number | null
  minOrderLKR: number
  stores: string[] | null
  endsAt: string | null
  design: CouponDesign
  savingLKR: number | null
  reason: string | null
  best: boolean
}

/** "Your coupons" row in the bag: each coupon card, what it saves on THIS
 *  order (worked out on the server), tap to apply. Ones that don't fit yet
 *  are dimmed with the reason (e.g. "needs Rs. 7,000"). */
function CartCouponPicker({
  coupons,
  appliedId,
  busy,
  onApply,
  onRemove,
}: {
  coupons: CartCoupon[]
  appliedId: string | null
  busy: boolean
  onApply: (c: CartCoupon) => void
  onRemove: () => void
}) {
  if (coupons.length === 0) return null
  const usable = coupons.filter((c) => c.savingLKR).length
  return (
    <div className="mb-4">
      <div className="flex items-baseline justify-between">
        <p className="text-xs font-semibold text-ink/60">Your coupons</p>
        <p className="text-[11px] text-ink/45">
          {usable ? `${usable} can be used on this order` : 'None fit this order yet'}
        </p>
      </div>
      <div className="-mx-6 mt-2 flex snap-x scroll-px-6 gap-3 overflow-x-auto px-6 pb-2 pt-1 [scrollbar-width:thin]">
        {coupons.map((c) => {
          const applied = c.id === appliedId
          const fits = !!c.savingLKR
          const display = couponToDisplay(
            {
              id: c.id,
              title: c.title,
              discountType: c.discountType,
              discountValue: c.discountValue,
              maxDiscountLKR: c.maxDiscountLKR,
              minOrderLKR: c.minOrderLKR,
              stores: c.stores,
              design: c.design,
            },
            {
              badge: applied ? COUPON_BADGE.applied : c.best ? COUPON_BADGE.best : undefined,
              dimmed: !fits,
            },
          )
          return (
            <div key={c.id} className="w-[230px] flex-none snap-start">
              <DealCoupon
                coupon={{ ...display, actionLabel: applied ? 'Applied' : fits ? 'Apply' : 'Not yet' }}
                onSelect={() => {
                  if (busy || !fits) return
                  if (applied) onRemove()
                  else onApply(c)
                }}
                selected={applied}
                notchColor="#ffffff"
              />
              <p className={`mt-1.5 px-0.5 text-[11px] leading-snug ${fits ? 'font-semibold text-teal-deep' : 'text-ink/50'}`}>
                {fits ? `Saves ${formatLKR(c.savingLKR!)}${applied ? ' · tap to remove' : ''}` : c.reason}
              </p>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function cleanSiteLabel(site: string): string {
  const trimmed = site.trim().replace(/^www\./i, '')
  if (trimmed.includes('.')) return trimmed
  return trimmed
    .replace(/[-_]+/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((word) => word[0]?.toUpperCase() + word.slice(1))
    .join(' ')
}

// Economy is temporarily disabled sitewide ("coming soon") — Express is
// the only selectable mode for now. Kept as a data-driven `disabled` flag
// per option (rather than hardcoding a two-button layout with one button
// removed) so re-enabling Economy later is just deleting one flag here,
// not restructuring the toggle.
function DeliveryModeToggle({
  value,
  onChange,
}: {
  value: DeliveryChoice
  onChange: (value: DeliveryChoice) => void
}) {
  const options: { key: DeliveryChoice; label: string; sub: string; icon: React.ReactNode; disabled?: boolean }[] = [
    { key: 'economy', label: 'Economy', sub: 'Coming soon', icon: <Truck size={15} strokeWidth={1.8} />, disabled: true },
    { key: 'express', label: 'Express', sub: '12–15 days', icon: <Plane size={15} strokeWidth={1.8} /> },
  ]
  return (
    <div className="flex gap-2.5">
      {options.map((opt) => {
        const active = value === opt.key
        return (
          <button
            key={opt.key}
            type="button"
            onClick={() => !opt.disabled && onChange(opt.key)}
            disabled={opt.disabled}
            aria-pressed={active}
            aria-disabled={opt.disabled || undefined}
            title={opt.disabled ? 'Economy shipping is coming soon' : undefined}
            className={`flex flex-1 items-center gap-2 rounded-xl border px-3.5 py-2.5 text-left transition-colors ${
              opt.disabled
                ? 'cursor-not-allowed border-ink/10 bg-ink/[0.02] opacity-60'
                : active
                  ? 'border-teal/50 bg-teal/10'
                  : 'border-ink/12 bg-transparent hover:bg-ink/[0.03]'
            }`}
          >
            <span className={opt.disabled ? 'text-ink/25' : active ? 'text-teal-deep' : 'text-ink/40'}>
              {opt.icon}
            </span>
            <span className="min-w-0">
              <span
                className={`block text-sm font-semibold ${
                  opt.disabled ? 'text-ink/35' : active ? 'text-teal-deep' : 'text-ink'
                }`}
              >
                {opt.label}
              </span>
              <span className={`block text-[11px] ${opt.disabled ? 'italic text-ink/30' : 'text-ink/40'}`}>
                {opt.sub}
              </span>
            </span>
          </button>
        )
      })}
    </div>
  )
}

function FieldLabel({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label className="mb-1.5 block text-xs font-semibold text-ink/50">
      {children}
      {required && <span className="text-red-400"> *</span>}
    </label>
  )
}

const inputClass =
  'w-full rounded-xl border border-ink/15 bg-white px-3.5 py-2.5 text-sm text-ink placeholder:text-ink/35 transition-colors focus:border-teal-deep focus:outline-none focus:ring-2 focus:ring-teal/20'

function ConfirmCheckbox({
  checked,
  onChange,
  children,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  children: React.ReactNode
}) {
  return (
    <label className="flex cursor-pointer items-start gap-2.5 text-xs text-ink/60">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 flex-none rounded border-ink/25 text-teal-deep focus:ring-teal/30"
      />
      <span>{children}</span>
    </label>
  )
}

function SourceBadge({ product }: { product: CartProduct }) {
  const source = product.source ?? 'link'
  const siteLabel = product.site ? cleanSiteLabel(product.site) : null

  if (source === 'catalogue') {
    return (
      <span className="inline-flex max-w-full items-center gap-1 whitespace-nowrap rounded-full bg-teal/10 px-2 py-0.5 text-[10px] font-semibold text-teal-deep">
        <Store size={10} strokeWidth={2} />
        {siteLabel || 'Affiliated store'}
      </span>
    )
  }

  return (
    <span className="inline-flex max-w-full items-center gap-1 overflow-hidden whitespace-nowrap rounded-full bg-ink/[0.06] px-2 py-0.5 text-[10px] font-semibold text-ink/50">
      <Link2 size={10} strokeWidth={2} />
      Pasted link{siteLabel ? ` · ${siteLabel}` : ''}
    </span>
  )
}

function BreakdownColumn({
  option,
  qty,
  heading,
  active,
}: {
  option: DeliveryPriceOption
  qty: number
  heading?: string
  active?: boolean
}) {
  const rows: { label: string; value: number }[] = [
    { label: 'Price', value: option.priceLKR * qty },
    { label: 'Service charge', value: option.serviceChargeLKR * qty },
    { label: 'Delivery', value: option.deliveryFeeLKR * qty },
  ]

  return (
    <div className={`rounded-xl ${active ? 'bg-teal/10' : 'bg-ink/[0.03]'} px-3 py-2.5`}>
      {heading && (
        <p className={`mb-1.5 text-xs font-semibold ${active ? 'text-teal-deep' : 'text-ink/50'}`}>{heading}</p>
      )}
      <div className="space-y-1">
        {rows.map((row) => (
          <div key={row.label} className="flex items-baseline justify-between gap-3">
            <span className="text-[11px] text-ink/45">{row.label}</span>
            <span className="text-xs tabular-nums text-ink/70">{formatLKR(row.value)}</span>
          </div>
        ))}
      </div>
      <p className="mt-1.5 text-[10px] leading-snug text-ink/35">
        Price includes currency conversion, freight &amp; handling.
      </p>
      <div className="mt-2 flex items-baseline justify-between gap-3 border-t border-ink/[0.08] pt-2">
        <span className="text-xs font-semibold text-ink">Total</span>
        <span className="text-sm font-bold tabular-nums text-ink">
          {formatLKR(option.actualTotalLKR * qty)}
        </span>
      </div>
    </div>
  )
}

function PriceBreakdownOverlay({
  line,
  deliveryChoice,
  onClose,
  serviceShare = 0,
}: {
  line: CartLineItem
  deliveryChoice: DeliveryChoice
  onClose: () => void
  /** Local shops: this item's share of the handling fee, shown as service charge. */
  serviceShare?: number
}) {
  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [onClose])

  const { lookup } = useStorePricingLookup()
  const raw = getDualDeliveryPricing(toPriceableItem(line.product, lookup(line.product.site)))
  const dual = { ...raw, economy: withExtraServiceCharge(raw.economy, serviceShare), express: withExtraServiceCharge(raw.express, serviceShare) }
  const option = deliveryChoice === 'economy' ? dual.economy : dual.express

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 sm:items-center"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="max-h-[85vh] w-full overflow-y-auto rounded-t-2xl bg-card p-5 shadow-[0_8px_30px_rgba(32,36,43,0.15)] sm:max-h-[80vh] sm:w-full sm:max-w-md sm:rounded-2xl sm:p-6"
        style={{ border: '1px solid rgba(32, 36, 43, 0.08)' }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={`Price breakdown for ${line.product.title}`}
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-ink/10 sm:hidden" />

        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <div className="h-16 w-16 flex-none overflow-hidden rounded-xl border border-ink/10 bg-white">
              {line.product.image ? (
                <Image
                  src={line.product.image}
                  alt=""
                  className="h-full w-full object-cover"
                  width={64}
                  height={64}
                />
              ) : (
                <div className="grid h-full w-full place-items-center text-ink/15">
                  <ShoppingBag size={16} strokeWidth={1.3} />
                </div>
              )}
            </div>
            <div className="min-w-0">
              <p className="line-clamp-2 text-sm font-semibold text-ink">{line.product.title}</p>
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                <SourceBadge product={line.product} />
                <span className="text-xs text-ink/40">{line.qty}×</span>
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close price breakdown"
            className="grid h-8 w-8 flex-none place-items-center rounded-md text-ink/40 transition-colors hover:bg-ink/[0.08] hover:text-ink/70"
          >
            <X size={18} />
          </button>
        </div>

        <div className="mt-4">
          <p className="mb-1.5 text-xs font-semibold text-ink/50">
            Breakdown · {deliveryChoice === 'economy' ? 'Economy' : 'Express'} (selected)
          </p>
          <BreakdownColumn option={option} qty={line.qty} />
        </div>

        <div className="mt-4">
          <p className="mb-1.5 flex items-center gap-1 text-xs font-semibold text-ink/50">
            <Info size={11} />
            Compare delivery methods
          </p>
          <div className="grid grid-cols-2 gap-2">
            <BreakdownColumn
              option={dual.express}
              qty={line.qty}
              heading="Express"
              active={deliveryChoice === 'express'}
            />
            <BreakdownColumn
              option={dual.economy}
              qty={line.qty}
              heading="Economy"
              active={deliveryChoice === 'economy'}
            />
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="mt-5 w-full rounded-full border border-ink/15 py-3 text-sm font-semibold text-ink transition-colors hover:bg-ink/[0.04]"
        >
          Close
        </button>
      </div>
    </div>
  )
}

/** Link items: the size / colour / anything staff should know, typed by
 *  the shopper. Saved on the bag line as selectedOptions.Details and sent
 *  with the order (it shows on the order item for staff). */
function LinkDetailsField({ line }: { line: CartLineItem }) {
  const cart = useCart()
  const saved = line.product.selectedOptions?.Details ?? ''
  const [value, setValue] = useState(saved)
  const [open, setOpen] = useState(Boolean(saved))
  useEffect(() => setValue(saved), [saved])

  const commit = () => {
    const v = value.trim().slice(0, 200)
    if (v === saved) return
    const rest = { ...(line.product.selectedOptions ?? {}) }
    delete rest.Details
    const next = v ? { ...rest, Details: v } : rest
    cart.updateProduct(line.product.id, { selectedOptions: Object.keys(next).length ? next : undefined })
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 rounded-full bg-gold/10 px-2.5 py-1 text-[11px] font-semibold text-gold-deep ring-1 ring-gold/25 hover:bg-gold/20"
      >
        + Add size, colour or notes
      </button>
    )
  }
  return (
    <input
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
      }}
      autoFocus={!saved}
      maxLength={200}
      placeholder="e.g. Size M, black — or anything we should know"
      className="w-full rounded-xl bg-parchment/70 px-3 py-2 text-xs text-ink ring-1 ring-ink/10 placeholder:text-ink/35 focus:outline-none focus:ring-2 focus:ring-teal/30"
    />
  )
}

function ReviewLine({
  line,
  deliveryChoice,
  onOpenBreakdown,
  selected,
  onToggleSelected,
  serviceShare = 0,
  missing,
  onChangeOptions,
  serverPriceLKR,
  soldOut,
}: {
  line: CartLineItem
  deliveryChoice: DeliveryChoice
  onOpenBreakdown: () => void
  selected: boolean
  onToggleSelected: () => void
  /** Local shops: this item's share of the handling fee, shown as service charge. */
  serviceShare?: number
  /** Size / colour this store item still needs (from the server quote). */
  missing?: ('Size' | 'Color')[]
  /** Opens the size / colour picker for this line. */
  onChangeOptions?: () => void
  /** The server's product price for this line (all units), from the quote. */
  serverPriceLKR?: number
  /** Server says the item (or the chosen option) is sold out. */
  soldOut?: boolean
}) {
  const { lookup } = useStorePricingLookup()
  const dual = getDualDeliveryPricing(toPriceableItem(line.product, lookup(line.product.site)))
  const option = withExtraServiceCharge(deliveryChoice === 'economy' ? dual.economy : dual.express, serviceShare)
  const grandLineTotal = option.actualTotalLKR * line.qty
  const { Details: _details, ...shownOptions } = line.product.selectedOptions ?? {}
  const chosen = optionsLabel(Object.keys(shownOptions).length ? shownOptions : undefined)
  const needs = missing && missing.length > 0
  const isLink = line.product.source !== 'catalogue'
  // The store's price moved since this was added (the server re-checks
  // every price). Say so, rather than letting the total jump silently.
  const shownPriceLKR = option.priceLKR * line.qty
  const priceMoved =
    serverPriceLKR != null && shownPriceLKR > 0 && Math.abs(serverPriceLKR - shownPriceLKR) > Math.max(50, shownPriceLKR * 0.01)

  const cart = useCart()

  return (
    <div className={`flex w-full items-start gap-3 py-4 transition-opacity ${selected ? '' : 'opacity-55'}`}>
      <button
        type="button"
        onClick={onToggleSelected}
        aria-pressed={selected}
        aria-label={selected ? `Leave ${line.product.title} out of this order` : `Include ${line.product.title} in this order`}
        className={`mt-[30px] flex h-5 w-5 flex-none items-center justify-center rounded-md border transition-colors ${
          selected ? 'border-teal-deep bg-teal-deep text-white' : 'border-ink/25 bg-white text-transparent hover:border-ink/40'
        }`}
      >
        <Check size={12} strokeWidth={3} />
      </button>

      <div className="h-20 w-20 flex-none overflow-hidden rounded-2xl bg-white ring-1 ring-ink/10 sm:h-24 sm:w-24">
        {line.product.image ? (
          <Image src={line.product.image} alt="" className="h-full w-full object-cover object-top" width={96} height={96} />
        ) : (
          <div className="grid h-full w-full place-items-center text-ink/15">
            <ShoppingBag size={18} strokeWidth={1.3} />
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="line-clamp-2 text-sm font-semibold leading-snug text-ink">{line.product.title}</p>
            <div className="mt-1">
              <SourceBadge product={line.product} />
            </div>
          </div>
          <div className="flex-none text-right">
            <p className="text-sm font-bold tabular-nums text-ink">{formatLKR(grandLineTotal)}</p>
            {line.qty > 1 && <p className="text-[11px] tabular-nums text-ink/40">{formatLKR(option.actualTotalLKR)} each</p>}
          </div>
        </div>

        {!isLink && (chosen || needs) && (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {needs ? (
              <button
                type="button"
                onClick={onChangeOptions}
                disabled={!onChangeOptions}
                className="inline-flex items-center gap-1.5 rounded-full bg-gold/15 px-2.5 py-1 text-[11px] font-semibold text-gold-deep ring-1 ring-gold/30 transition-colors hover:bg-gold/25"
              >
                <AlertCircle size={12} />
                {missing!.length === 2 ? 'Choose a size and colour' : missing![0] === 'Size' ? 'Choose a size' : 'Choose a colour'}
              </button>
            ) : (
              <>
                <span className="inline-flex max-w-full items-center truncate rounded-full bg-parchment px-2.5 py-1 text-[11px] font-medium text-ink/70 ring-1 ring-ink/[0.06]">
                  {chosen}
                </span>
                {onChangeOptions && (
                  <button
                    type="button"
                    onClick={onChangeOptions}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-teal-deep hover:underline"
                  >
                    <SlidersHorizontal size={11} /> Change
                  </button>
                )}
              </>
            )}
          </div>
        )}

        {isLink && (
          <div className="mt-2">
            {chosen && (
              <span className="mb-1.5 inline-flex max-w-full items-center truncate rounded-full bg-parchment px-2.5 py-1 text-[11px] font-medium text-ink/70 ring-1 ring-ink/[0.06]">
                {chosen}
              </span>
            )}
            <LinkDetailsField line={line} />
          </div>
        )}

        {(priceMoved || soldOut) && (
          <p className={`mt-2 flex items-start gap-1.5 text-[11px] font-medium ${soldOut ? 'text-rose-700' : 'text-gold-deep'}`}>
            <Info size={12} className="mt-px flex-none" />
            {soldOut
              ? 'Sold out at the store now — remove it or choose another option.'
              : `Price updated by the store: now ${formatLKR(serverPriceLKR!)} (was ${formatLKR(shownPriceLKR)}). Your total uses the new price.`}
          </p>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
          <div className="flex items-center rounded-full bg-parchment ring-1 ring-ink/10">
            <button
              type="button"
              onClick={() => cart.updateQty(line.product.id, line.qty - 1)}
              disabled={line.qty <= 1}
              aria-label="One fewer"
              className="grid h-8 w-8 place-items-center rounded-full text-ink/60 hover:text-ink disabled:opacity-30"
            >
              <Minus size={13} />
            </button>
            <span className="w-6 text-center text-xs font-bold tabular-nums text-ink">{line.qty}</span>
            <button
              type="button"
              onClick={() => cart.updateQty(line.product.id, Math.min(10, line.qty + 1))}
              disabled={line.qty >= 10}
              aria-label="One more"
              className="grid h-8 w-8 place-items-center rounded-full text-ink/60 hover:text-ink disabled:opacity-30"
            >
              <Plus size={13} />
            </button>
          </div>
          <button type="button" onClick={onOpenBreakdown} className="text-[11px] font-semibold text-teal-deep hover:underline">
            Price breakdown
          </button>
          <button
            type="button"
            onClick={() => cart.removeItem(line.product.id)}
            className="inline-flex items-center gap-1 text-[11px] font-semibold text-ink/40 hover:text-rose-700"
          >
            <Trash2 size={11} /> Remove
          </button>
        </div>
      </div>
    </div>
  )
}

/** A numbered section of the bag page (1 Your items, 2 Delivery, 3 Coupons). */
function Step({ n, title, right, children }: { n: number; title: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-[26px] bg-card p-5 ring-1 ring-ink/[0.08] sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-3 font-display text-lg font-semibold text-indigo">
          <span className="grid h-7 w-7 flex-none place-items-center rounded-full bg-indigo font-body text-xs font-bold text-gold">{n}</span>
          {title}
        </h2>
        {right}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  )
}

function CartSkeleton() {
  return (
    <div className="mx-auto max-w-6xl px-4 pb-20 sm:px-6 lg:px-10" aria-hidden="true">
      <div className="mt-4 h-36 animate-pulse rounded-[28px] bg-ink/[0.05]" />
      <div className="mt-6 grid gap-6 lg:grid-cols-12 lg:items-start">
        <div className="space-y-6 lg:col-span-7">
          <div className="rounded-[26px] bg-card p-6 ring-1 ring-ink/[0.08]">
            <div className="h-6 w-40 animate-pulse rounded bg-ink/[0.06]" />
            {[0, 1].map((i) => (
              <div key={i} className="mt-5 flex gap-3">
                <div className="h-24 w-24 animate-pulse rounded-2xl bg-ink/[0.06]" />
                <div className="flex-1 space-y-2 pt-1">
                  <div className="h-4 w-3/4 animate-pulse rounded bg-ink/[0.06]" />
                  <div className="h-3 w-24 animate-pulse rounded bg-ink/[0.06]" />
                  <div className="h-8 w-28 animate-pulse rounded-full bg-ink/[0.06]" />
                </div>
              </div>
            ))}
          </div>
          <div className="h-64 animate-pulse rounded-[26px] bg-ink/[0.05]" />
        </div>
        <div className="h-96 animate-pulse rounded-[26px] bg-ink/[0.05] lg:col-span-5" />
      </div>
    </div>
  )
}

function CartPageContent() {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  const cart = useCart()
  const { lookup: lookupStorePricing } = useStorePricingLookup()
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user } = useAuth()
  // Economy is temporarily locked ("coming soon" — see DeliveryModeToggle),
  // so Express is the only real choice right now and is the sane default.
  const [deliveryChoice, setDeliveryChoice] = useState<DeliveryChoice>('express')
  const [confirming, setConfirming] = useState(false)
  const [discountCode, setDiscountCode] = useState('')
  // The signed coupon code currently applied (lib/coupons). The server
  // decides whether it's valid and how much it takes off — see `quote`.
  const [couponToken, setCouponToken] = useState<string | null>(null)
  const [couponError, setCouponError] = useState<string | null>(null)
  const [quote, setQuote] = useState<ServerQuote | null>(null)
  const [quoteLoading, setQuoteLoading] = useState(false)

  const [breakdownLineId, setBreakdownLineId] = useState<string | null>(null)
  const breakdownLine = cart.items.find((line) => line.product.id === breakdownLineId) ?? null

  // Which cart lines are actually being checked out right now — lets the
  // customer leave some items in the cart for later instead of forcing
  // every visit to checkout to mean "buy everything currently in the
  // bag." Every item defaults to selected (matching the old "checkout
  // means the whole cart" behavior) and stays that way unless explicitly
  // unchecked; newly-added items also default to selected, and an item
  // removed from the cart is pruned from this set automatically.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set(cart.items.map((line) => line.product.id)))
  const [clearConfirming, setClearConfirming] = useState(false)
  // Bag line whose size / colour is being changed (CartVariantPicker).
  const [editingLineId, setEditingLineId] = useState<string | null>(null)
  const editingLine = cart.items.find((line) => line.product.id === editingLineId) ?? null

  useEffect(() => {
    setSelectedIds((prev) => {
      const cartIds = new Set(cart.items.map((line) => line.product.id))
      let changed = false
      const next = new Set(prev)
      cart.items.forEach((line) => {
        if (!next.has(line.product.id)) {
          next.add(line.product.id)
          changed = true
        }
      })
      next.forEach((id) => {
        if (!cartIds.has(id)) {
          next.delete(id)
          changed = true
        }
      })
      return changed ? next : prev
    })
  }, [cart.items])

  const selectedLines = useMemo(
    () => cart.items.filter((line) => selectedIds.has(line.product.id)),
    [cart.items, selectedIds],
  )
  const allSelected = cart.items.length > 0 && selectedLines.length === cart.items.length

  // Each local-shop item's share of its shop's handling fee, shown inside
  // its service charge (lib/store-origin.ts localServiceShares). Worked out
  // over the items being checked out; an unselected item shows what it
  // would carry on its own.
  const serviceShares = useMemo(
    () =>
      localServiceShares(
        selectedLines.map((line) => ({
          storeSlug: line.product.site,
          origin: lookupStorePricing(line.product.site, { origin: line.product.origin ?? undefined }).origin,
          qty: line.qty,
        })),
      ),
    [selectedLines, lookupStorePricing],
  )
  const serviceShareFor = (line: CartLineItem): number => {
    const origin = lookupStorePricing(line.product.site, { origin: line.product.origin ?? undefined }).origin
    if (origin !== 'LK') return 0
    return serviceShares.get(line.product.site || '(unknown store)') ?? localPickupFeeLKR() / Math.max(1, line.qty)
  }

  const toggleLineSelected = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSelectAll = () => {
    setSelectedIds(allSelected ? new Set() : new Set(cart.items.map((line) => line.product.id)))
  }

  const handleClearCart = () => {
    if (!clearConfirming) {
      setClearConfirming(true)
      return
    }
    cart.clearCart()
    setClearConfirming(false)
  }

  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [whatsappCode, setWhatsappCode] = useState('+94')
  const [whatsapp, setWhatsapp] = useState('')
  const [country, setCountry] = useState('')
  const [addressLine1, setAddressLine1] = useState('')
  const [addressLine2, setAddressLine2] = useState('')
  const [city, setCity] = useState('')
  const [stateRegion, setStateRegion] = useState('')
  const [zipCode, setZipCode] = useState('')
  // Id of the saved default address (Address Book) this form was prefilled
  // from, if any — passed through to confirmCartOrder so it updates that
  // same row instead of inserting a near-duplicate on every order.
  const [existingAddressId, setExistingAddressId] = useState<string | null>(null)
  // Saved, complete address -> shown as a summary with "Edit".
  const [editingAddress, setEditingAddress] = useState(false)
  const [termsAccepted, setTermsAccepted] = useState(false)
  const [confirmsRestrictions, setConfirmsRestrictions] = useState(false)
  const [confirmsPreowned, setConfirmsPreowned] = useState(false)

  // Prefill from the signed-in user + their default saved address — the
  // same sources the Profile page (useAuth() for name/email) and Address
  // Book page (the `addresses` table) already read from. Previously
  // these fields all started as bare empty strings with no fetch behind
  // them at all, so a returning customer with a saved address still saw
  // a completely blank checkout form every time.
  //
  // Runs once user is available; every setter uses the `prev || value`
  // pattern so it only fills fields that are STILL EMPTY at the time
  // each part of the fetch resolves — it never overwrites something the
  // customer already typed (e.g. if they start filling the form in
  // before the address fetch, which is slower than the instant
  // name/email fill, finishes).
  useEffect(() => {
    if (!user) return
    let cancelled = false

    setFullName((prev) => prev || user.name || '')
    setEmail((prev) => prev || user.email || '')

    const supabase = createClient()
    supabase
      .from('addresses')
      .select('id, recipient_name, phone, address_line1, address_line2, city, country, postal_code, is_default')
      .eq('user_id', user.id)
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled || !data) return
        setExistingAddressId(data.id)
        setFullName((prev) => prev || data.recipient_name || '')
        setAddressLine1((prev) => prev || data.address_line1 || '')
        setAddressLine2((prev) => prev || data.address_line2 || '')
        setCity((prev) => prev || data.city || '')
        setCountry((prev) => prev || data.country || '')
        setZipCode((prev) => prev || data.postal_code || '')

        // Split a stored "+94 77 123 4567"-style phone into the code
        // dropdown + bare number, matching the WhatsApp field's own
        // two-part shape (whatsappCode/whatsapp). If the stored number
        // doesn't start with one of the codes this form's <select>
        // actually supports, leave whatsappCode at its default ('+94')
        // rather than guessing — the raw number still gets filled in
        // either way, so the customer just needs to double check the
        // code themselves in that edge case.
        if (data.phone) {
          const match = KNOWN_WHATSAPP_CODES.find((code) => data.phone.trim().startsWith(code))
          setWhatsapp((prev) => prev || data.phone.replace(match ?? '', '').trim())
          if (match) setWhatsappCode(match)
        }
      })

    return () => {
      cancelled = true
    }
  }, [user])

  const addressComplete = Boolean(
    fullName.trim() && email.trim() && whatsapp.trim() && country.trim() && addressLine1.trim() && city.trim(),
  )
  const showAddressForm = editingAddress || !existingAddressId || !addressComplete

  const detailsComplete =
    fullName.trim() &&
    email.trim() &&
    whatsapp.trim() &&
    country.trim() &&
    addressLine1.trim() &&
    city.trim() &&
    termsAccepted &&
    confirmsRestrictions &&
    confirmsPreowned

  const {
    priceSubtotalLKR,
    serviceChargeSubtotalLKR,
    deliverySubtotalLKR,
    pickupLKR,
    discountLKR,
    grandTotalLKR,
  } = useMemo(() => {
    let priceSubtotalLKR = 0
    let serviceChargeSubtotalLKR = 0
    let deliverySubtotalLKR = 0

    // Shop → warehouse handling, once per local store in this order. It's
    // shown to shoppers as part of the service charge (split across that
    // shop's items), never as its own line.
    const pickup = localPickupFees(
      selectedLines.map((line) => ({ storeSlug: line.product.site, origin: lookupStorePricing(line.product.site, { origin: line.product.origin ?? undefined }).origin })),
    )

    selectedLines.forEach((line) => {
      const dual = getDualDeliveryPricing(toPriceableItem(line.product, lookupStorePricing(line.product.site)))
      const option = deliveryChoice === 'economy' ? dual.economy : dual.express
      priceSubtotalLKR += option.priceLKR * line.qty
      serviceChargeSubtotalLKR += option.serviceChargeLKR * line.qty
      deliverySubtotalLKR += option.deliveryFeeLKR * line.qty
    })

    // These browser-side numbers are only an instant estimate while the
    // server quote loads. The server's numbers (quote) are what's shown
    // once available, and what /api/checkout actually charges — including
    // the coupon discount, which is never worked out here.
    if (quote) {
      return {
        priceSubtotalLKR: quote.priceSubtotalLKR,
        serviceChargeSubtotalLKR: quote.serviceSubtotalLKR,
        deliverySubtotalLKR: quote.deliverySubtotalLKR,
        pickupLKR: quote.pickupLKR,
        pickupStoreCount: pickup.storeCount,
        discountLKR: quote.discountLKR,
        grandTotalLKR: quote.totalLKR,
      }
    }
    return {
      priceSubtotalLKR,
      serviceChargeSubtotalLKR,
      deliverySubtotalLKR,
      pickupLKR: pickup.totalLKR,
      pickupStoreCount: pickup.storeCount,
      discountLKR: 0,
      grandTotalLKR: priceSubtotalLKR + serviceChargeSubtotalLKR + deliverySubtotalLKR + pickup.totalLKR,
    }
  }, [selectedLines, deliveryChoice, quote, lookupStorePricing])

  const pendingRequestCount = useOrders().orders.length
  const [checkoutError, setCheckoutError] = useState<string | null>(null)

  // ---- Server quote ------------------------------------------------------
  // Re-asked whenever the selection, quantities, delivery or coupon change.
  // A stale reply (an older request finishing late) is ignored.
  const quoteSeq = useRef(0)
  const requestQuote = useCallback(
    async (token: string | null) => {
      if (selectedLines.length === 0) {
        setQuote(null)
        return null
      }
      const seq = ++quoteSeq.current
      setQuoteLoading(true)
      try {
        const res = await fetch('/api/checkout/quote', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lines: selectedLines.map(toCheckoutLine), delivery: deliveryChoice, couponToken: token }),
        })
        const body = (await res.json().catch(() => ({}))) as ServerQuote & { error?: string }
        if (seq !== quoteSeq.current) return null
        if (!res.ok) {
          setQuote(null)
          return null
        }
        setQuote(body)
        return body
      } catch {
        if (seq === quoteSeq.current) setQuote(null)
        return null
      } finally {
        if (seq === quoteSeq.current) setQuoteLoading(false)
      }
    },
    [selectedLines, deliveryChoice],
  )

  useEffect(() => {
    if (!mounted || !user) return
    const t = setTimeout(() => {
      requestQuote(couponToken).then((q) => {
        // The coupon stopped applying (e.g. an item was unselected and
        // the minimum is no longer met) — say why and drop it.
        if (q && couponToken && q.couponError) {
          setCouponError(q.couponError)
          setCouponToken(null)
        }
      })
    }, 350)
    return () => clearTimeout(t)
  }, [mounted, user, requestQuote, couponToken])

  // "Use now" from My coupons arrives as /account/cart?coupon=<code>.
  const consumedCouponParam = useRef(false)
  useEffect(() => {
    if (consumedCouponParam.current) return
    const fromLink = searchParams.get('coupon')
    if (!fromLink) return
    consumedCouponParam.current = true
    setDiscountCode(fromLink)
    setCouponToken(fromLink)
  }, [searchParams])

  const applyFromList = (c: CartCoupon) => {
    setDiscountCode(c.token)
    void handleApplyCoupon(c.token)
  }

  const handleApplyCoupon = async (fromList?: string) => {
    setCouponError(null)
    const code = (fromList ?? discountCode).trim()
    if (!code) return
    const q = await requestQuote(code)
    if (!q) {
      setCouponError('Couldn’t check that code right now. Please try again.')
      return
    }
    if (q.couponError) {
      setCouponError(q.couponError)
      setCouponToken(null)
      requestQuote(null)
      return
    }
    setCouponToken(code)
  }

  const handleRemoveCoupon = () => {
    setCouponToken(null)
    setDiscountCode('')
    setCouponError(null)
  }

  const appliedCoupon = couponToken && quote?.coupon ? quote.coupon : null

  // Store items still missing a size / colour (the server checks each one
  // against its store). Checkout is blocked until they're chosen.
  const missingById = useMemo(() => {
    const m = new Map<string, ('Size' | 'Color')[]>()
    for (const l of quote?.lines ?? []) if (l.missingOptions?.length) m.set(l.id, l.missingOptions)
    return m
  }, [quote])
  const unpickedLines = selectedLines.filter((line) => missingById.has(line.product.id))
  const quoteLineById = useMemo(() => new Map((quote?.lines ?? []).map((l) => [l.id, l])), [quote])

  const handleConfirm = async () => {
    if (selectedLines.length === 0 || confirming || !detailsComplete) return
    setConfirming(true)
    setCheckoutError(null)

    try {
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lines: selectedLines.map(toCheckoutLine),
          delivery: deliveryChoice,
          couponToken,
          recipient: {
            fullName: fullName.trim(),
            phone: `${whatsappCode} ${whatsapp.trim()}`.trim(),
            addressLine1: addressLine1.trim(),
            addressLine2: addressLine2.trim() || undefined,
            city: city.trim(),
            postalCode: zipCode.trim() || undefined,
            country: country.trim(),
            existingAddressId,
          },
        }),
      })
      const body = (await res.json().catch(() => ({}))) as { checkoutId?: string; error?: string }
      if (!res.ok || !body.checkoutId) {
        setCheckoutError(body.error ?? 'Something went wrong placing your order. Please try again.')
        setConfirming(false)
        return
      }
      // Only remove what was actually checked out — an item left
      // unselected on purpose (see selectedIds) stays in the cart.
      selectedLines.forEach((line) => cart.removeItem(line.product.id))
      router.push(`/account/pay/${body.checkoutId}`)
    } catch {
      setCheckoutError('Couldn’t reach Wishdrop. Check your connection and try again.')
      setConfirming(false)
    }
  }

  if (!mounted) {
    return <CartSkeleton />
  }

  if (cart.items.length === 0) {
    return (
      <div className="mx-auto max-w-6xl px-4 pb-20 sm:px-6 lg:px-10">
        <div className="relative mt-4 overflow-hidden rounded-[28px] bg-card px-6 py-16 text-center ring-1 ring-ink/[0.08]">
          <div
            aria-hidden
            className="absolute inset-x-0 top-0 h-1.5"
            style={{ background: 'repeating-linear-gradient(45deg,#C1272D 0 10px,#FBF6EC 10px 20px,#1E3A5F 20px 30px,#FBF6EC 30px 40px)' }}
          />
          <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-teal/10">
            <ShoppingBag size={28} className="text-teal-deep" strokeWidth={1.5} />
          </div>
          <p className="mt-5 font-display text-3xl font-semibold text-indigo">Your bag is empty</p>
          <p className="mx-auto mt-2 max-w-sm text-sm text-ink/55">
            Browse our stores, or paste a product link from any Indian site and we’ll price it in rupees.
          </p>
          <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href="/stores"
              className="inline-flex w-full items-center justify-center rounded-full bg-teal-deep px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-indigo sm:w-auto"
            >
              Browse stores
            </Link>
            <Link
              href="/account/wishlist"
              className="inline-flex w-full items-center justify-center rounded-full px-6 py-3 text-sm font-semibold text-indigo ring-1 ring-indigo/20 hover:bg-indigo/[0.04] sm:w-auto"
            >
              Open my wishlist
            </Link>
          </div>

          {pendingRequestCount > 0 && (
            <Link
              href={'/account/orders'}
              className="mt-6 inline-flex items-center justify-center gap-1.5 text-xs font-semibold text-teal-deep hover:underline"
            >
              <ClipboardList size={14} />
              You also have {pendingRequestCount} request{pendingRequestCount !== 1 ? 's' : ''} in progress
            </Link>
          )}
        </div>
      </div>
    )
  }

  const itemCount = cart.items.reduce((n, l) => n + l.qty, 0)
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: EASE_OUT_EXPO }}
      className="mx-auto max-w-6xl px-4 pb-20 sm:px-6 lg:px-10"
    >
      {/* Header */}
      <div className="relative mt-4 overflow-hidden rounded-[28px] bg-card px-6 py-7 ring-1 ring-ink/[0.08] sm:px-8">
        <div
          aria-hidden
          className="absolute inset-x-0 top-0 h-1.5"
          style={{ background: 'repeating-linear-gradient(45deg,#C1272D 0 10px,#FBF6EC 10px 20px,#1E3A5F 20px 30px,#FBF6EC 30px 40px)' }}
        />
        <div aria-hidden className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-teal/10 blur-3xl" />
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-teal-deep">Checkout</p>
            <h1 className="mt-1 font-display text-3xl font-semibold tracking-[-0.01em] text-indigo sm:text-4xl">
              Your bag <span className="text-ink/30">· {itemCount}</span>
            </h1>
            <p className="mt-1.5 text-sm text-ink/55">Check your items, add your delivery details and confirm. You’ll pay on WhatsApp after.</p>
          </div>
          <ol className="flex items-center gap-1.5 whitespace-nowrap text-[11px] font-semibold text-ink/45 sm:gap-2">
            {['Bag', 'Confirm', 'Pay on WhatsApp'].map((label, i) => (
              <li key={label} className="flex items-center gap-2">
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 ${
                    i === 0 ? 'bg-indigo text-parchment' : 'bg-parchment ring-1 ring-ink/[0.08]'
                  }`}
                >
                  <span className={i === 0 ? 'text-gold' : ''}>{i + 1}</span>{' '}
                  {i === 2 ? (
                    <>
                      <span className="sm:hidden">Pay</span>
                      <span className="hidden sm:inline">{label}</span>
                    </>
                  ) : (
                    label
                  )}
                </span>
                {i < 2 && <ChevronRight size={12} className="text-ink/25" />}
              </li>
            ))}
          </ol>
        </div>
      </div>

      {pendingRequestCount > 0 && (
        <Link
          href={'/account/orders'}
          className="mt-4 flex items-center gap-2 rounded-2xl border border-teal/20 bg-teal/[0.06] px-4 py-3 text-xs font-semibold text-teal-deep transition-colors hover:bg-teal/10"
        >
          <ClipboardList size={14} className="shrink-0" />
          You also have {pendingRequestCount} request{pendingRequestCount !== 1 ? 's' : ''} being tracked
          separately
        </Link>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-12 lg:items-start">
        <div className="space-y-6 lg:col-span-7">
          <Step
            n={1}
            title="Your items"
            right={
              <div className="flex flex-none items-center gap-3">
              {clearConfirming ? (
                <div className="flex flex-none items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setClearConfirming(false)}
                    className="text-xs font-semibold text-ink/50 hover:text-ink"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleClearCart}
                    className="flex items-center gap-1 rounded-lg bg-red-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-red-700"
                  >
                    <Trash2 size={12} /> Confirm
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={handleClearCart}
                  className="flex flex-none items-center gap-1 text-xs font-semibold text-ink/45 hover:text-red-600"
                >
                  <Trash2 size={12} /> Clear cart
                </button>
              )}
              </div>
            }
          >
            <div className="mt-3 flex items-center justify-between">
              <button
                type="button"
                onClick={toggleSelectAll}
                className="text-xs font-semibold text-teal-deep hover:underline"
              >
                {allSelected ? 'Deselect all' : 'Select all'}
              </button>
              <span className="text-xs text-ink/45">
                {selectedLines.length} of {cart.items.length} selected for checkout
              </span>
            </div>

            <div className="mt-1 divide-y divide-ink/[0.07]">
              {cart.items.map((line) => (
                <div key={line.product.id}>
                  <ReviewLine
                    line={line}
                    deliveryChoice={deliveryChoice}
                    onOpenBreakdown={() => setBreakdownLineId(line.product.id)}
                    selected={selectedIds.has(line.product.id)}
                    onToggleSelected={() => toggleLineSelected(line.product.id)}
                    serviceShare={serviceShareFor(line)}
                    missing={missingById.get(line.product.id)}
                    serverPriceLKR={quoteLineById.get(line.product.id)?.priceLKR}
                    soldOut={quoteLineById.get(line.product.id)?.inStock === false}
                    onChangeOptions={cartLineHandle(line.product) ? () => setEditingLineId(line.product.id) : undefined}
                  />
                </div>
              ))}
            </div>
          </Step>

          <Step n={2} title="Delivery details">
          <div>
            <FieldLabel>Delivery method</FieldLabel>
            <DeliveryModeToggle value={deliveryChoice} onChange={setDeliveryChoice} />
          </div>

          {showAddressForm ? (
            <>
          <div className="mt-5">
            <FieldLabel required>Full name</FieldLabel>
            <div className="relative">
              <User size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink/30" />
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Enter full name"
                className={`${inputClass} pl-10`}
              />
            </div>
          </div>

          <div className="mt-4">
            <FieldLabel required>Email address</FieldLabel>
            <div className="relative">
              <Mail size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink/30" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter email address"
                className={`${inputClass} pl-10`}
              />
            </div>
          </div>

          <div className="mt-4">
            <FieldLabel required>WhatsApp number</FieldLabel>
            <div className="flex gap-2">
              <select
                value={whatsappCode}
                onChange={(e) => setWhatsappCode(e.target.value)}
                className="w-24 flex-none rounded-xl border border-ink/15 bg-white px-2 text-sm text-ink focus:border-teal-deep focus:outline-none focus:ring-2 focus:ring-teal/20"
              >
                <option value="+94">🇱🇰 +94</option>
                <option value="+91">🇮🇳 +91</option>
                <option value="+1">🇺🇸 +1</option>
                <option value="+44">🇬🇧 +44</option>
              </select>
              <div className="relative flex-1">
                <Phone size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink/30" />
                <input
                  type="tel"
                  value={whatsapp}
                  onChange={(e) => setWhatsapp(e.target.value)}
                  placeholder="Enter WhatsApp number"
                  className={`${inputClass} pl-10`}
                />
              </div>
            </div>
            <p className="mt-1.5 text-[11px] text-ink/40">We'll send order updates to this number.</p>
          </div>

          <div className="mt-4">
            <FieldLabel required>Country</FieldLabel>
            <div className="relative">
              <MapPin size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink/30" />
              <select
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                className={`${inputClass} appearance-none pl-10 pr-9 ${country ? 'text-ink' : 'text-ink/35'}`}
              >
                <option value="" disabled>
                  Select country
                </option>
                {COMMON_COUNTRIES.map((c) => (
                  <option key={c} value={c} className="text-ink">
                    {c}
                  </option>
                ))}
              </select>
              <ChevronDown
                size={15}
                className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-ink/30"
              />
            </div>
          </div>

          <div className="mt-4">
            <FieldLabel required>Address line 1</FieldLabel>
            <input
              type="text"
              value={addressLine1}
              onChange={(e) => setAddressLine1(e.target.value)}
              placeholder="Street address, P.O. box"
              className={inputClass}
            />
          </div>

          <div className="mt-4">
            <FieldLabel>Address line 2</FieldLabel>
            <input
              type="text"
              value={addressLine2}
              onChange={(e) => setAddressLine2(e.target.value)}
              placeholder="Apartment, suite, unit (optional)"
              className={inputClass}
            />
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <FieldLabel required>City</FieldLabel>
              <input
                type="text"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="Enter city"
                className={inputClass}
              />
            </div>
            <div>
              <FieldLabel>State</FieldLabel>
              <input
                type="text"
                value={stateRegion}
                onChange={(e) => setStateRegion(e.target.value)}
                placeholder="Enter state"
                className={inputClass}
              />
            </div>
            <div>
              <FieldLabel>ZIP code</FieldLabel>
              <input
                type="text"
                value={zipCode}
                onChange={(e) => setZipCode(e.target.value)}
                placeholder="Enter ZIP code"
                className={inputClass}
              />
            </div>
          </div>
            </>
          ) : (
            // Saved address, complete: a short summary instead of nine
            // fields, so a returning customer only has to confirm.
            <div className="mt-5 flex items-start gap-3 rounded-2xl bg-card p-4 ring-1 ring-ink/10">
              <span className="grid h-9 w-9 flex-none place-items-center rounded-full bg-teal/10 text-teal-deep">
                <MapPin size={16} />
              </span>
              <div className="min-w-0 flex-1 text-sm">
                <p className="font-semibold text-ink">{fullName}</p>
                <p className="mt-0.5 text-ink/60">
                  {[addressLine1, addressLine2, city, stateRegion, zipCode, country].filter((x) => x && x.trim()).join(', ')}
                </p>
                <p className="mt-0.5 text-xs text-ink/45">
                  {whatsappCode} {whatsapp} · {email}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingAddress(true)}
                className="flex-none text-xs font-semibold text-teal-deep hover:underline"
              >
                Edit
              </button>
            </div>
          )}

          </Step>

          <Step n={3} title="Coupons">
            <CartCouponPicker
              coupons={quote?.availableCoupons ?? []}
              appliedId={appliedCoupon?.id ?? null}
              busy={quoteLoading}
              onApply={applyFromList}
              onRemove={handleRemoveCoupon}
            />
            {appliedCoupon ? (
              <div className="flex items-center justify-between gap-2 rounded-xl border border-teal/25 bg-teal/[0.06] px-3.5 py-2.5">
                <div className="flex items-center gap-2 text-sm text-teal-deep">
                  <Tag size={14} className="flex-none" />
                  <span className="font-semibold">{appliedCoupon.title}</span>
                  <span className="text-teal-deep/70">· {appliedCoupon.label}</span>
                </div>
                <button
                  type="button"
                  onClick={handleRemoveCoupon}
                  className="flex-none text-xs font-semibold text-ink/50 underline decoration-dotted underline-offset-2 hover:text-ink"
                >
                  Remove
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <div className="flex flex-1 items-center gap-2 rounded-xl border border-ink/15 bg-white px-3.5 py-2.5">
                  <Tag size={14} className="flex-none text-ink/35" />
                  <input
                    type="text"
                    value={discountCode}
                    onChange={(e) => {
                      setDiscountCode(e.target.value)
                      if (couponError) setCouponError(null)
                    }}
                    onKeyDown={(e) => e.key === 'Enter' && handleApplyCoupon()}
                    placeholder="Or paste a coupon code"
                    className="w-full min-w-0 bg-transparent text-sm text-ink placeholder:text-ink/35 focus:outline-none"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => handleApplyCoupon()}
                  disabled={!discountCode.trim()}
                  className="flex-none rounded-xl border border-ink/15 px-4 py-2.5 text-sm font-semibold text-ink transition-colors hover:bg-ink/[0.04] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Apply
                </button>
              </div>
            )}
            {couponError && <p className="mt-2 text-xs font-semibold text-red-600">{couponError}</p>}

          </Step>
        </div>

        {/* Summary — sticky beside the steps on large screens */}
        <aside className="lg:sticky lg:top-6 lg:col-span-5">
          <div className="overflow-hidden rounded-[26px] bg-card ring-1 ring-ink/[0.08]">
            <div className="flex items-center justify-between gap-2 bg-indigo px-6 py-4 text-parchment">
              <p className="font-display text-lg font-semibold">Order summary</p>
              <span className="rounded-full bg-parchment/10 px-2.5 py-1 text-[11px] font-semibold text-parchment/80">
                {deliveryChoice === 'economy' ? 'Economy' : 'Express'} · {selectedLines.reduce((sum, l) => sum + l.qty, 0)} item{selectedLines.reduce((sum, l) => sum + l.qty, 0) !== 1 ? 's' : ''}
              </span>
            </div>
            <div className="px-6 py-6">
            <div className="space-y-2.5">
              <div className="flex items-center justify-between text-sm text-ink/50">
                <span>Price ({selectedLines.reduce((sum, l) => sum + l.qty, 0)} unit{selectedLines.reduce((sum, l) => sum + l.qty, 0) !== 1 ? 's' : ''})</span>
                <span className="tabular-nums">{formatLKR(priceSubtotalLKR)}</span>
              </div>
              <div className="flex items-center justify-between text-sm text-ink/50">
                <span>Service charge</span>
                {/* Includes local shops' handling fee (once per shop per
                    order) — shown as service charge, the same as imported
                    items, so shoppers aren't told which shops are local. */}
                <span className="tabular-nums">{formatLKR(serviceChargeSubtotalLKR + pickupLKR)}</span>
              </div>
              <div className="flex items-center justify-between text-sm text-ink/50">
                <span>Delivery</span>
                <span className="tabular-nums">{formatLKR(deliverySubtotalLKR)}</span>
              </div>
              {discountLKR > 0 && (
                <div className="flex items-center justify-between text-sm text-teal-deep">
                  <span>Coupon discount</span>
                  <span className="tabular-nums">-{formatLKR(discountLKR)}</span>
                </div>
              )}
              <div className="!mt-4 flex items-baseline justify-between border-t border-dashed border-ink/15 pt-4">
                <span className="text-base font-semibold text-ink">Total</span>
                <span className={`font-display text-3xl font-semibold tabular-nums text-indigo transition-opacity ${quoteLoading ? 'opacity-50' : ''}`}>
                  {formatLKR(grandTotalLKR)}
                </span>
              </div>
            </div>

          {/* One tick instead of three: it covers the terms, prohibited
              items / refund policy and the pre-owned / fragile rules, with
              the details one tap away. */}
          <div className="mt-5 rounded-2xl bg-parchment/70 p-3.5 ring-1 ring-ink/[0.06]">
            <ConfirmCheckbox
              checked={termsAccepted && confirmsRestrictions && confirmsPreowned}
              onChange={(v: boolean) => {
                setTermsAccepted(v)
                setConfirmsRestrictions(v)
                setConfirmsPreowned(v)
              }}
            >
              I agree to the{' '}
              <Link href={TERMS_URL} target="_blank" className="font-semibold text-teal-deep hover:underline">
                Terms
              </Link>{' '}
              and{' '}
              <a href="/refund-policy" target="_blank" className="font-semibold text-teal-deep hover:underline">
                refund policy
              </a>
              , and my order has no{' '}
              <a href="/prohibited-items" target="_blank" className="font-semibold text-teal-deep hover:underline">
                prohibited items
              </a>
              .
            </ConfirmCheckbox>
            <details className="group mt-2 pl-6">
              <summary className="cursor-pointer list-none text-[11px] font-semibold text-ink/45 hover:text-ink/70 [&::-webkit-details-marker]:hidden">
                What this covers <ChevronDown size={11} className="inline transition-transform group-open:rotate-180" />
              </summary>
              <div className="mt-2 space-y-1.5 text-[11px] leading-relaxed text-ink/50">
                <p>{TERMS_SUMMARY}</p>
                <p>
                  Pre-owned items can&apos;t be refunded or returned, as their condition can&apos;t be verified against the
                  seller&apos;s description. Fragile items and items sent by untracked standard mail can&apos;t be refunded
                  or returned either.
                </p>
              </div>
            </details>
          </div>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={confirming || !detailsComplete || selectedLines.length === 0 || unpickedLines.length > 0}
              title={
                selectedLines.length === 0
                  ? 'Select at least one item to check out'
                  : !detailsComplete
                    ? 'Fill in your delivery details and tick the agreement to continue'
                    : undefined
              }
              className="mt-4 flex w-full items-center justify-center gap-2.5 rounded-full bg-teal-deep px-6 py-4 text-sm font-semibold text-white shadow-[0_14px_28px_-14px_rgba(14,116,110,0.75)] transition-all hover:bg-indigo active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
            >
              <Lock size={15} />
              {confirming
                ? 'Confirming…'
                : selectedLines.length === 0
                  ? 'Select items to continue'
                  : unpickedLines.length > 0
                    ? 'Choose options to continue'
                    : 'Confirm order'}
              {!confirming && selectedLines.length > 0 && unpickedLines.length === 0 && <ArrowRight size={16} />}
            </button>

            {unpickedLines.length > 0 && (
              <p className="mt-2.5 text-center text-xs font-semibold text-gold-deep">
                Choose a size or colour for {unpickedLines.length === 1 ? `“${unpickedLines[0].product.title}”` : `${unpickedLines.length} items`} in your bag.
              </p>
            )}

            {checkoutError && (
              <p className="mt-2.5 text-center text-xs font-semibold text-red-600">{checkoutError}</p>
            )}


              <div className="mt-5 flex items-start gap-2.5 rounded-2xl bg-teal/[0.06] px-4 py-3 text-xs leading-relaxed text-ink/60">
                <MessageCircle size={15} className="mt-0.5 flex-none text-teal-deep" />
                <p>
                  <span className="font-semibold text-ink/75">No payment now.</span> After you confirm, we check the prices and
                  send payment details to your WhatsApp.
                </p>
              </div>
              <p className="mt-3 flex items-center justify-center gap-1.5 text-[11px] text-ink/40">
                <ShieldCheck size={12} className="text-teal-deep/60" /> Every item is quality-checked before it ships
              </p>
            </div>
          </div>
        </aside>
      </div>

      {breakdownLine && (
        <PriceBreakdownOverlay
          line={breakdownLine}
          deliveryChoice={deliveryChoice}
          serviceShare={serviceShareFor(breakdownLine)}
          onClose={() => setBreakdownLineId(null)}
        />
      )}

      {editingLine && (
        <CartVariantPicker
          line={editingLine}
          onClose={() => setEditingLineId(null)}
          onSave={(next) => {
            const qty = editingLine.qty
            // Same line id = same choice; otherwise a different variant
            // (it merges into an existing line of that variant, if any).
            cart.removeItem(editingLine.product.id)
            cart.addItem(next, qty)
            setEditingLineId(null)
          }}
        />
      )}
    </motion.div>
  )
}

// OrdersProvider now lives in app/layout.tsx — CartPageContent reads it
// directly, same instance, no second wrap/fetch.
export default function CartPage() {
  return (
    <Suspense fallback={<CartSkeleton />}>
      <CartPageContent />
    </Suspense>
  )
}