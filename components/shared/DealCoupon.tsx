// components/shared/DealCoupon.tsx
//
// SINGLE canonical coupon-card component. Both the public homepage
// (storefront `Deal` records) and the admin discounts page (`Discount`
// records) render through THIS component and only this component.
// delete components/admin/DealCoupon.tsx if it still exists — it's a
// stale duplicate that caused the two pages to drift out of sync.
//
// The component only knows about `CouponDisplay`, a normalized shape with
// no knowledge of "storefront" or "admin" concepts. Two adapter functions
// (`dealToCoupon`, `discountToCoupon`) map each data source onto that
// shape. Add a third data source later by adding a third adapter — the
// component itself never changes.

import type { Discount } from '@/data/discounts/data'
import {
  formatDiscountValue,
  formatDiscountScope,
  getDiscountStatus,
  STATUS_LABEL,
  STATUS_STYLE,
  TYPE_LABEL,
} from '@/data/discounts/data'

/* ---------------------------------------------------------------------- */
/* Storefront shape — unchanged from the original public Deal type, kept  */
/* exported so app/page.tsx's `topDeals: Deal[]` still type-checks as-is. */
/* ---------------------------------------------------------------------- */

export interface Deal {
  brand: string
  discount: string
  label?: string
  detail?: string
  bgColor?: string
  productImage?: string
  accent?: string
  href: string
  brandLogo?: string
}

/* ---------------------------------------------------------------------- */
/* Normalized shape the component actually renders. Neither "storefront"  */
/* nor "admin" concepts leak past this point.                             */
/* ---------------------------------------------------------------------- */

export interface CouponDisplay {
  key: string
  headline: string // "15%" / "15% off" / "Free gift: ..."
  eyebrow?: string // "Off" / "Percentage off"
  detail?: string // "On Select Items" / scope text
  badge?: { label: string; className: string } // top-right pill (status etc.)
  bgColor?: string
  accent?: string
  productImage?: string
  footerLogo?: string // real logo image, if one exists
  footerInitials?: string // generated avatar letters, used when there's no logo
  footerText: string // brand name / seller / collection / discount name
  href: string
  dimmed?: boolean
}

const FALLBACK_BG = '#F0EFEC'
const FALLBACK_ACCENT = 'text-ink'

/* ---------------------------------------------------------------------- */
/* Adapter: storefront Deal -> CouponDisplay                               */
/* ---------------------------------------------------------------------- */

export function dealToCoupon(deal: Deal): CouponDisplay {
  return {
    key: deal.brand,
    headline: deal.discount,
    eyebrow: deal.label,
    detail: deal.detail,
    bgColor: deal.bgColor,
    accent: deal.accent,
    productImage: deal.productImage,
    footerLogo: deal.brandLogo,
    footerText: deal.brand,
    href: deal.href,
  }
}

/* ---------------------------------------------------------------------- */
/* Adapter: admin Discount -> CouponDisplay                                 */
/* ---------------------------------------------------------------------- */

// Reuse existing homepage art as background texture per discount type,
// since there's no per-discount product photo in the data model. Not a
// literal product match — just texture, same role productImage plays on
// the storefront card.
const HOMEPAGE_BG_BY_TYPE: Record<Discount['type'], string> = {
  percentage: '/deals/zara-card-bg.png',
  fixed: '/deals/amazon-card-bg.png',
  free_gift: '/deals/rakuten-card-bg.png',
}

// Wider palette than a 3-bucket type-based one, so discounts of the same
// type don't all render identically. Spread across records via a cheap
// hash of `id` rather than a fixed per-type color.
const PALETTE: { bg: string; accent: string }[] = [
  { bg: '#EAE8FB', accent: 'text-[#5B57F0]' }, // indigo
  { bg: '#FBEEDC', accent: 'text-[#E0A429]' }, // amber
  { bg: '#E4F3EA', accent: 'text-[#2FA36B]' }, // green
  { bg: '#FBE9E9', accent: 'text-[#E24C5A]' }, // red
]

function hashPalette(id: string): { bg: string; accent: string } {
  const sum = [...id].reduce((acc, ch) => acc + ch.charCodeAt(0), 0)
  return PALETTE[sum % PALETTE.length]
}

// Generated avatar initials in place of a real logo — pulls from whatever
// identity is most specific: seller, then collection, then the discount's
// own name.
function initialsFor(discount: Discount): string {
  const source = discount.scope.sellerName ?? discount.scope.collectionName ?? discount.name
  const words = source.split(' ').filter(Boolean)
  return words
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('')
}

export function discountToCoupon(discount: Discount): CouponDisplay {
  const status = getDiscountStatus(discount)
  const palette = hashPalette(discount.id)

  return {
    key: discount.id,
    headline: formatDiscountValue(discount),
    eyebrow: TYPE_LABEL[discount.type],
    detail: formatDiscountScope(discount),
    // Deliberately no footnote/subtext fields here — keeping this to the
    // same 3-line budget (headline/eyebrow/detail) the storefront card
    // was designed for. Min-spend, method, and code details belong on the
    // discount detail page, not crammed onto the card face.
    badge: { label: STATUS_LABEL[status], className: STATUS_STYLE[status] },
    bgColor: palette.bg,
    accent: palette.accent,
    productImage: HOMEPAGE_BG_BY_TYPE[discount.type],
    footerInitials: initialsFor(discount),
    footerText: discount.scope.sellerName ?? discount.scope.collectionName ?? discount.name,
    href: `/admin/discounts/${discount.id}`,
    dimmed: status === 'expired' || status === 'disabled',
  }
}

/* ---------------------------------------------------------------------- */
/* Component — renders CouponDisplay only, no matter where it came from.  */
/* ---------------------------------------------------------------------- */

export default function DealCoupon({ coupon }: { coupon: CouponDisplay }) {
  const bgColor = coupon.bgColor ?? FALLBACK_BG
  const accent = coupon.accent ?? FALLBACK_ACCENT

  return (
    <a
      href={coupon.href}
      className={`group relative flex aspect-[7/4] w-full overflow-hidden rounded-xl shadow-[0_1px_2px_rgba(8,39,79,0.06),0_12px_28px_-12px_rgba(8,39,79,0.25)] ring-1 ring-inset ring-black/5 transition-all duration-300 hover:-translate-y-1.5 hover:shadow-[0_1px_2px_rgba(8,39,79,0.08),0_20px_36px_-14px_rgba(8,39,79,0.32)] sm:rounded-2xl ${
        coupon.dimmed ? 'opacity-60 grayscale-[0.4]' : ''
      }`}
      style={{ backgroundColor: bgColor }}
    >
      <div
        className="relative flex min-w-0 flex-1 flex-col bg-cover bg-center p-[clamp(0.65rem,3vw,1.5rem)]"
        style={coupon.productImage ? { backgroundImage: `url(${coupon.productImage})` } : undefined}
      >
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-white/25 blur-2xl transition-transform duration-500 group-hover:scale-125"
        />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-white/20 to-transparent"
        />

        {coupon.badge && (
          <span
            className={`absolute right-2 top-2 z-20 rounded-full px-2 py-0.5 font-body text-[10px] font-semibold uppercase tracking-wide ${coupon.badge.className}`}
          >
            {coupon.badge.label}
          </span>
        )}

        <div className="relative z-10 min-w-0 pr-16">
          <p
            className={`font-body font-extrabold leading-none ${accent}`}
            style={{ fontSize: 'clamp(1.05rem, 4.2vw, 1.875rem)' }}
          >
            {coupon.headline}
          </p>
          {coupon.eyebrow && (
            <p
              className={`mt-0.5 font-body font-semibold uppercase tracking-wide ${accent}`}
              style={{ fontSize: 'clamp(0.55rem, 1.6vw, 0.75rem)' }}
            >
              {coupon.eyebrow}
            </p>
          )}
          {coupon.detail && (
            <p
              className="mt-1 truncate font-body text-ink/70"
              style={{ fontSize: 'clamp(0.6rem, 1.8vw, 0.875rem)' }}
            >
              {coupon.detail}
            </p>
          )}
        </div>

        <div className="relative z-10 mt-auto flex min-w-0 items-center gap-2">
          {coupon.footerLogo ? (
            <img
              src={coupon.footerLogo}
              alt={`${coupon.footerText} logo`}
              className="w-auto shrink-0 object-contain"
              style={{ height: 'clamp(0.9rem, 3vw, 1.75rem)' }}
              onError={(e) => {
                // if the logo asset 404s, fall back to initials/text
                // instead of a broken-image icon
                e.currentTarget.style.display = 'none'
                e.currentTarget.nextElementSibling?.classList.remove('hidden')
              }}
            />
          ) : null}

          {!coupon.footerLogo && coupon.footerInitials ? (
            <span
              className={`grid shrink-0 place-items-center rounded-full font-body font-bold ${accent}`}
              style={{
                height: 'clamp(1.1rem, 3.4vw, 1.75rem)',
                width: 'clamp(1.1rem, 3.4vw, 1.75rem)',
                fontSize: 'clamp(0.5rem, 1.6vw, 0.75rem)',
                backgroundColor: 'rgba(255,255,255,0.55)',
              }}
            >
              {coupon.footerInitials}
            </span>
          ) : null}

          <p
            className={`truncate font-body font-bold uppercase tracking-wide ${accent} ${
              coupon.footerLogo ? 'hidden' : ''
            }`}
            style={{ fontSize: 'clamp(0.65rem, 2.2vw, 0.9rem)' }}
          >
            {coupon.footerText}
          </p>
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
          View Deal
        </span>
      </div>
    </a>
  )
}