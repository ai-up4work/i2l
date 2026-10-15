// lib/coupons/design.ts
//
// How a coupon LOOKS — shared by Admin → Coupons (designing it), My coupons
// and the cart (showing it). Every coupon is drawn with the same DealCoupon
// card as the customizer demo (components/shared/DealCoupon-flex.tsx), so a
// coupon looks identical everywhere.
//
// Stored per coupon in `coupons.design` (jsonb). Only appearance lives here —
// the discount, rules and limits stay in their own columns and are always
// checked on the server.

import type { CouponDisplay, PatternType, ProductIconType } from '@/components/shared/DealCoupon-flex'

export type CouponDesign = {
  bgColor: string
  accentColor: string
  patternType: PatternType
  productIcon: ProductIconType
  /** Hosted image URL (uploaded via /api/upload), shown instead of the icon */
  productImage: string | null
  /** Hosted logo URL for the footer */
  footerLogo: string | null
  /** Footer line, e.g. the store or campaign name. Empty = coupon title. */
  footerText: string
  /** Two letters shown in the footer when there's no logo. Empty = from footer text. */
  footerInitials: string
  /** Small line under the amount. Empty = automatic ("Off your order", "Percentage off"). */
  eyebrow: string
}

export const COUPON_PALETTES = [
  { label: 'Indigo', bg: '#EAE8FB', accent: '#5B57F0' },
  { label: 'Amber', bg: '#FBEEDC', accent: '#B9791F' },
  { label: 'Green', bg: '#E4F3EA', accent: '#2FA36B' },
  { label: 'Red', bg: '#FBE9E9', accent: '#D6414F' },
  { label: 'Teal', bg: '#E2F1F3', accent: '#0B7280' },
  { label: 'Night', bg: '#DDE3EE', accent: '#08274F' },
] as const

// Must match the PatternType union in DealCoupon-flex.tsx.
export const COUPON_PATTERNS: PatternType[] = [
  'none', 'damask', 'vine', 'fineDotGrid', 'herringbone', 'houndstooth',
  'argyle', 'leaves', 'dots', 'diagonal', 'grid', 'waves', 'topography',
  'circuit', 'hexagons', 'bubbles', 'zigzag', 'plusSigns', 'moroccan',
  'overlappingCircles', 'jigsaw', 'wiggle', 'confetti', 'heroPolkaDots',
  'heroGraphPaper',
]

export const COUPON_ICONS: { label: string; value: ProductIconType }[] = [
  { label: 'None', value: 'none' },
  { label: 'Percent', value: 'percent' },
  { label: 'Coin', value: 'coin' },
  { label: 'Gift', value: 'gift' },
  { label: 'Tag', value: 'tag' },
]

export const DEFAULT_COUPON_DESIGN: CouponDesign = {
  bgColor: COUPON_PALETTES[0].bg,
  accentColor: COUPON_PALETTES[0].accent,
  patternType: 'damask',
  productIcon: 'percent',
  productImage: null,
  footerLogo: null,
  footerText: '',
  footerInitials: '',
  eyebrow: '',
}

const HEX = /^#[0-9a-f]{6}$/i

function safeUrl(v: unknown): string | null {
  if (typeof v !== 'string' || !v.trim()) return null
  const s = v.trim()
  // Hosted images or our own public files only — never data: URLs (too big
  // for the row) or javascript: URLs.
  if (/^https:\/\/[^\s"'<>]+$/i.test(s) || /^\/[^\s"'<>]*$/.test(s)) return s.slice(0, 1000)
  return null
}

/** Cleans whatever was stored or sent into a valid design (unknown → default). */
export function normalizeDesign(raw: unknown, fallbackIcon?: ProductIconType): CouponDesign {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const str = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '')
  return {
    bgColor: typeof r.bgColor === 'string' && HEX.test(r.bgColor) ? r.bgColor : DEFAULT_COUPON_DESIGN.bgColor,
    accentColor: typeof r.accentColor === 'string' && HEX.test(r.accentColor) ? r.accentColor : DEFAULT_COUPON_DESIGN.accentColor,
    patternType: COUPON_PATTERNS.includes(r.patternType as PatternType) ? (r.patternType as PatternType) : DEFAULT_COUPON_DESIGN.patternType,
    productIcon: COUPON_ICONS.some((i) => i.value === r.productIcon)
      ? (r.productIcon as ProductIconType)
      : fallbackIcon ?? DEFAULT_COUPON_DESIGN.productIcon,
    productImage: safeUrl(r.productImage),
    footerLogo: safeUrl(r.footerLogo),
    footerText: str(r.footerText, 40).trim(),
    footerInitials: str(r.footerInitials, 2).trim().toUpperCase(),
    eyebrow: str(r.eyebrow, 30).trim(),
  }
}

/** A sensible starting design for coupons nobody designed (referral
 *  rewards, QC credits, old coupons) — varied by kind so they don't all
 *  look the same. */
export function defaultDesignFor(kind: 'admin' | 'referral' | 'compensation' | 'migrated', discountType: 'percent' | 'fixed'): CouponDesign {
  const base = { ...DEFAULT_COUPON_DESIGN, productIcon: (discountType === 'percent' ? 'percent' : 'coin') as ProductIconType }
  if (kind === 'referral') return { ...base, bgColor: '#E4F3EA', accentColor: '#2FA36B', productIcon: 'gift', patternType: 'confetti' }
  if (kind === 'compensation') return { ...base, bgColor: '#E2F1F3', accentColor: '#0B7280', patternType: 'fineDotGrid' }
  return base
}

const lkr = new Intl.NumberFormat('en-LK', { maximumFractionDigits: 0 })

function initialsOf(text: string): string {
  return text
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('')
}

function storeName(slug: string) {
  return slug.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

export type CouponFacts = {
  id: string
  title: string
  discountType: 'percent' | 'fixed'
  discountValue: number
  maxDiscountLKR: number | null
  minOrderLKR: number
  stores: string[] | null
  design: CouponDesign
}

/** The DealCoupon card for a coupon. `badge`/`dimmed`/`href` vary by
 *  where it's shown (My coupons, cart, admin preview). */
export function couponToDisplay(
  c: CouponFacts,
  opts: { href?: string; badge?: CouponDisplay['badge']; dimmed?: boolean; detail?: string } = {},
): CouponDisplay {
  const d = c.design
  const headline = c.discountType === 'percent' ? `${lkr.format(c.discountValue)}% off` : `Rs. ${lkr.format(c.discountValue)}`
  const eyebrow =
    d.eyebrow || (c.discountType === 'percent' ? (c.maxDiscountLKR ? `Up to Rs. ${lkr.format(c.maxDiscountLKR)}` : 'Percentage off') : 'Off your order')
  const parts: string[] = []
  if (c.minOrderLKR > 0) parts.push(`On Rs. ${lkr.format(c.minOrderLKR)}+`)
  parts.push(c.stores?.length ? `Only ${c.stores.map(storeName).join(', ')}` : 'Any store')
  const footerText = d.footerText || c.title
  return {
    key: c.id,
    headline,
    eyebrow,
    detail: opts.detail ?? parts.join(' · '),
    badge: opts.badge,
    bgColor: d.bgColor,
    accentColor: d.accentColor,
    patternType: d.patternType,
    patternColor: d.accentColor,
    productIcon: d.productIcon,
    productImage: d.productImage ?? undefined,
    footerLogo: d.footerLogo ?? undefined,
    footerInitials: d.footerLogo ? undefined : d.footerInitials || initialsOf(footerText),
    footerText,
    href: opts.href ?? '#',
    dimmed: opts.dimmed,
  }
}

export const COUPON_BADGE = {
  available: { label: 'Ready to use', className: 'bg-[#E1F5EE] text-[#085041]' },
  soon: { label: 'Ends soon', className: 'bg-[#FBEEDC] text-[#8A5A12]' },
  used: { label: 'Used', className: 'bg-[rgba(33,29,26,0.06)] text-[rgba(33,29,26,0.55)]' },
  expired: { label: 'Expired', className: 'bg-[rgba(33,29,26,0.06)] text-[rgba(33,29,26,0.55)]' },
  unavailable: { label: 'Not active', className: 'bg-[rgba(33,29,26,0.06)] text-[rgba(33,29,26,0.55)]' },
  best: { label: 'Best saving', className: 'bg-[#0B7280] text-white' },
  applied: { label: 'Applied', className: 'bg-[#08274F] text-white' },
} as const
