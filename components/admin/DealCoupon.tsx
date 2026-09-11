'use client'

import { useState } from 'react'
import { Percent, Tag, Gift, Copy, Check } from 'lucide-react'
import {
  type Discount,
  formatDiscountValue,
  formatDiscountScope,
  getDiscountStatus,
  STATUS_LABEL,
  STATUS_STYLE,
} from '@/data/discounts/data'

// Visual theme per discount type — Discount records (unlike the old
// hardcoded `Deal` array) don't carry their own bgColor/accent/logo, so we
// derive a palette from `type` instead. This keeps free-gift, percentage,
// and fixed-amount promos visually distinct at a glance, same intent as
// the old topDeals array hand-picking a color per brand.
const TYPE_THEME: Record<Discount['type'], { bg: string; accent: string; icon: typeof Percent }> = {
  percentage: { bg: '#EAE8FB', accent: 'text-[#5B57F0]', icon: Percent },
  fixed: { bg: '#FBEEDC', accent: 'text-[#E0A429]', icon: Tag },
  free_gift: { bg: '#E4F3EA', accent: 'text-[#2FA36B]', icon: Gift },
}

// Where a click should go — the old `Deal` type carried an explicit
// `href`; Discount doesn't, so we derive one from scope instead.
function discountHref(discount: Discount): string {
  const s = discount.scope
  switch (s.type) {
    case 'seller':
      return s.sellerId ? `/stores/${s.sellerId}` : '/stores'
    case 'collection':
      return s.collectionId ? `/collections/${s.collectionId}` : '/collections'
    case 'products':
      return s.productIds?.length === 1 ? `/products/${s.productIds[0]}` : '/deals'
    case 'storewide':
    default:
      return '/deals'
  }
}

function formatEndsAt(discount: Discount): string | null {
  if (!discount.endsAt) return null
  return new Date(discount.endsAt).toLocaleDateString('en-LK', { day: 'numeric', month: 'short' })
}

export default function DealCoupon({ discount }: { discount: Discount }) {
  const [copied, setCopied] = useState(false)
  const status = getDiscountStatus(discount)
  const isLive = status === 'active'
  const theme = TYPE_THEME[discount.type]
  const Icon = theme.icon
  const endsLabel = formatEndsAt(discount)
  const href = discountHref(discount)
  const Wrapper = isLive ? 'a' : 'div'

  function handleCopy(event: React.MouseEvent) {
    if (!discount.code || !isLive) return
    // Stops the click from also triggering the enclosing <a>'s navigation
    // — the button sits inside the coupon's clickable card, so without
    // this, copying the code would also send you to the deal page.
    event.preventDefault()
    event.stopPropagation()
    navigator.clipboard.writeText(discount.code).then(() => {
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    })
  }

  return (
    <Wrapper
      {...(isLive ? { href } : { 'aria-disabled': true })}
      className={`group relative flex aspect-[7/4] w-full overflow-hidden rounded-xl shadow-[0_1px_2px_rgba(8,39,79,0.06),0_12px_28px_-12px_rgba(8,39,79,0.25)] ring-1 ring-inset ring-black/5 transition-all duration-300 sm:rounded-2xl ${
        isLive
          ? 'hover:-translate-y-1.5 hover:shadow-[0_1px_2px_rgba(8,39,79,0.08),0_20px_36px_-14px_rgba(8,39,79,0.32)]'
          : 'cursor-default opacity-60 grayscale-[0.35]'
      }`}
      style={{ backgroundColor: theme.bg }}
    >
      <div className="relative flex min-w-0 flex-1 flex-col p-[clamp(0.65rem,3vw,1.5rem)]">
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-white/25 blur-2xl transition-transform duration-500 group-hover:scale-125"
        />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-white/20 to-transparent"
        />

        {/* Status badge — only shown for non-active states, so a normal
            live coupon stays as visually clean as the original design. */}
        {!isLive && (
          <span
            className={`absolute right-2 top-2 z-10 rounded-full px-2 py-0.5 font-body text-[9px] font-bold uppercase tracking-wide sm:right-3 sm:top-3 ${STATUS_STYLE[status]}`}
          >
            {STATUS_LABEL[status]}
          </span>
        )}

        <div className="relative z-10 flex min-w-0 items-start gap-2 pr-12">
          <span className={`mt-0.5 shrink-0 ${theme.accent}`}>
            <Icon style={{ height: 'clamp(0.9rem, 3vw, 1.5rem)', width: 'clamp(0.9rem, 3vw, 1.5rem)' }} />
          </span>
          <div className="min-w-0">
            <p
              className={`font-body font-extrabold leading-none ${theme.accent}`}
              style={{ fontSize: 'clamp(1rem, 4vw, 1.6rem)' }}
            >
              {formatDiscountValue(discount)}
            </p>
            <p
              className="mt-1 truncate font-body font-semibold text-ink/80"
              style={{ fontSize: 'clamp(0.6rem, 1.8vw, 0.8rem)' }}
            >
              {formatDiscountScope(discount)}
            </p>
          </div>
        </div>

        <div className="relative z-10 mt-auto min-w-0">
          <p className="truncate font-body text-ink/60" style={{ fontSize: 'clamp(0.55rem, 1.6vw, 0.75rem)' }}>
            {discount.minPurchaseAmount
              ? `On orders over Rs. ${discount.minPurchaseAmount.toLocaleString('en-LK')}`
              : endsLabel
                ? `Ends ${endsLabel}`
                : discount.name}
          </p>

          {discount.method === 'code' && discount.code ? (
            <button
              type="button"
              onClick={handleCopy}
              disabled={!isLive}
              className={`mt-1.5 inline-flex items-center gap-1.5 rounded-md border border-dashed px-2 py-1 font-body text-[10px] font-bold uppercase tracking-wide transition-colors sm:text-xs ${
                isLive ? `border-ink/25 ${theme.accent} hover:bg-white/50` : 'border-ink/15 text-ink/40'
              }`}
            >
              {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
              {copied ? 'Copied' : discount.code}
            </button>
          ) : (
            <p className="mt-1.5 font-body text-[10px] font-semibold uppercase tracking-wide text-ink/40 sm:text-xs">
              Applied automatically
            </p>
          )}
        </div>
      </div>

      <div className="relative w-0 flex-none">
        <span
          aria-hidden="true"
          className="absolute left-1/2 -translate-x-1/2 rounded-full bg-card"
          style={{ top: '-0.5rem', height: 'clamp(0.85rem, 1.6vw, 1.5rem)', width: 'clamp(0.85rem, 1.6vw, 1.5rem)' }}
        />
        <span
          aria-hidden="true"
          className="absolute left-1/2 -translate-x-1/2 rounded-full bg-card"
          style={{ bottom: '-0.5rem', height: 'clamp(0.85rem, 1.6vw, 1.5rem)', width: 'clamp(0.85rem, 1.6vw, 1.5rem)' }}
        />
        <span
          aria-hidden="true"
          className="absolute inset-y-2 left-1/2 w-0 -translate-x-1/2 border-l-2 border-dashed border-ink/15 sm:inset-y-3"
        />
      </div>

      <div
        className="relative flex flex-none flex-col items-center justify-center gap-3 py-2"
        style={{ width: 'clamp(1.75rem, 5vw, 4rem)' }}
      >
        <span
          className="rotate-180 whitespace-nowrap font-body font-semibold uppercase tracking-[0.15em] text-ink/50 [writing-mode:vertical-rl]"
          style={{ fontSize: 'clamp(6px, 1vw, 9px)' }}
        >
          {isLive ? 'View Deal' : STATUS_LABEL[status]}
        </span>
      </div>
    </Wrapper>
  )
}