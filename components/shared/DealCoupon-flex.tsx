// components/shared/DealCoupon-flex.tsx

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
/* Storefront shape — unchanged.                                          */
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
/* Pattern layer — programmatic, tinted texture. Fully independent of the */
/* product visual: pick a type + a color, nothing else needed.            */
/*                                                                          */
/* Tiles are intentionally more ornate than a single repeated shape — most */
/* combine 2–4 layered paths per tile (like the damask/vine cards you see  */
/* on real deal sites) so they read as "textile pattern" rather than       */
/* "sparse icon repeated". Every tile is still a pure function of a single */
/* hex color, so palette swaps stay free.                                  */
/*                                                                          */
/* The tiles below `topography`, `circuit`, `hexagons`, and everything     */
/* after them are redrawn in the spirit of the Hero Patterns library       */
/* (heropatterns.com, MIT-licensed, by Steve Schoger) — same "single-color */
/* geometric tile" idea, hand-rebuilt here as our own path data so they    */
/* plug straight into the existing `svg(color) -> data-uri` contract.      */
/* ---------------------------------------------------------------------- */

export type PatternType =
  | 'none'
  | 'external'
  | 'dots'
  | 'leaves'
  | 'diagonal'
  | 'grid'
  | 'waves'
  | 'damask'
  | 'vine'
  | 'herringbone'
  | 'houndstooth'
  | 'argyle'
  | 'fineDotGrid'
  | 'topography'
  | 'circuit'
  | 'hexagons'
  | 'bubbles'
  | 'zigzag'
  | 'plusSigns'
  | 'moroccan'
  | 'overlappingCircles'
  | 'jigsaw'
  | 'wiggle'
  | 'confetti'
  | 'heroPolkaDots'
  | 'heroGraphPaper'

const PATTERN_TILE: Record<Exclude<PatternType, 'none' | 'external'>, { svg: (c: string) => string; size: string }> = {
  dots: {
    svg: (c: string) =>
      `<svg xmlns='http://www.w3.org/2000/svg' width='28' height='28'><circle cx='4' cy='4' r='2.4' fill='${c}' fill-opacity='0.18'/></svg>`,
    size: '28px 28px',
  },
  leaves: {
    svg: (c: string) =>
      `<svg xmlns='http://www.w3.org/2000/svg' width='56' height='56'><path d='M28 6c6 8 6 16 0 24-6-8-6-16 0-24z' fill='${c}' fill-opacity='0.16'/></svg>`,
    size: '56px 56px',
  },
  diagonal: {
    svg: (c: string) =>
      `<svg xmlns='http://www.w3.org/2000/svg' width='22' height='22'><path d='M0 22L22 0' stroke='${c}' stroke-opacity='0.16' stroke-width='2'/></svg>`,
    size: '22px 22px',
  },
  grid: {
    svg: (c: string) =>
      `<svg xmlns='http://www.w3.org/2000/svg' width='30' height='30'><path d='M30 0H0V30' fill='none' stroke='${c}' stroke-opacity='0.14' stroke-width='1.4'/></svg>`,
    size: '30px 30px',
  },
  waves: {
    svg: (c: string) =>
      `<svg xmlns='http://www.w3.org/2000/svg' width='48' height='24'><path d='M0 12c6-8 18-8 24 0s18 8 24 0' fill='none' stroke='${c}' stroke-opacity='0.16' stroke-width='2'/></svg>`,
    size: '48px 24px',
  },

  /* Layered floral/scroll motif — reads like the Zara/Rakuten damask.
     Built from a central fleur spine + two mirrored side scrolls, all in
     one tile so it repeats seamlessly without visible seams. */
  damask: {
    svg: (c: string) => `
      <svg xmlns='http://www.w3.org/2000/svg' width='100' height='100'>
        <g fill='none' stroke='${c}' stroke-opacity='0.20' stroke-width='1.6'>
          <path d='M50 4c10 10 10 22 0 32-10-10-10-22 0-32z'/>
          <path d='M50 36c14 4 20 16 14 28-12-4-18-16-14-28z'/>
          <path d='M50 36c-14 4-20 16-14 28 12-4 18-16 14-28z'/>
          <path d='M50 64c8 8 8 18 0 26-8-8-8-18 0-26z'/>
          <circle cx='50' cy='4' r='2.4' fill='${c}' fill-opacity='0.22' stroke='none'/>
          <circle cx='50' cy='90' r='2.4' fill='${c}' fill-opacity='0.22' stroke='none'/>
        </g>
      </svg>`,
    size: '100px 100px',
  },

  /* Continuous vine with alternating leaf pairs — denser than `leaves`,
     good for wide banner-style cards. */
  vine: {
    svg: (c: string) => `
      <svg xmlns='http://www.w3.org/2000/svg' width='90' height='60'>
        <g fill='none' stroke='${c}' stroke-opacity='0.18' stroke-width='1.6'>
          <path d='M0 30c15-18 30-18 45 0s30 18 45 0'/>
        </g>
        <g fill='${c}' fill-opacity='0.16'>
          <path d='M18 20c6 4 6 12 0 16-6-4-6-12 0-16z'/>
          <path d='M45 8c6 4 6 12 0 16-6-4-6-12 0-16z'/>
          <path d='M72 20c6 4 6 12 0 16-6-4-6-12 0-16z'/>
        </g>
      </svg>`,
    size: '90px 60px',
  },

  /* Classic textile herringbone — two rows of angled bars offset to
     interlock. */
  herringbone: {
    svg: (c: string) => `
      <svg xmlns='http://www.w3.org/2000/svg' width='32' height='32'>
        <g fill='${c}' fill-opacity='0.16'>
          <rect x='0' y='6' width='16' height='4' transform='rotate(45 8 8)'/>
          <rect x='16' y='6' width='16' height='4' transform='rotate(-45 24 8)'/>
          <rect x='0' y='22' width='16' height='4' transform='rotate(45 8 24)'/>
          <rect x='16' y='22' width='16' height='4' transform='rotate(-45 24 24)'/>
        </g>
      </svg>`,
    size: '32px 32px',
  },

  /* Houndstooth check — subtle, works well behind small headline text. */
  houndstooth: {
    svg: (c: string) => `
      <svg xmlns='http://www.w3.org/2000/svg' width='24' height='24'>
        <g fill='${c}' fill-opacity='0.16'>
          <path d='M0 0h6v6h6v6H6v6H0v-6h6V6H0z'/>
          <path d='M12 12h6v6h6v6h-6v-6h-6z'/>
        </g>
      </svg>`,
    size: '24px 24px',
  },

  /* Argyle diamond lattice with a thin cross-stitch line, like a
     premium gift-card texture. */
  argyle: {
    svg: (c: string) => `
      <svg xmlns='http://www.w3.org/2000/svg' width='60' height='60'>
        <g fill='none' stroke='${c}' stroke-opacity='0.16' stroke-width='1.4'>
          <path d='M30 0L60 30L30 60L0 30Z'/>
          <path d='M0 0L60 60M60 0L0 60' stroke-opacity='0.10'/>
        </g>
      </svg>`,
    size: '60px 60px',
  },

  /* Finer version of `dots`, arranged on a 45° grid — this is the tight
     crosshatch dot-grid visible on the eBay-style card. */
  fineDotGrid: {
    svg: (c: string) => `
      <svg xmlns='http://www.w3.org/2000/svg' width='18' height='18'>
        <circle cx='2' cy='2' r='1.3' fill='${c}' fill-opacity='0.22'/>
        <circle cx='11' cy='11' r='1.3' fill='${c}' fill-opacity='0.22'/>
      </svg>`,
    size: '18px 18px',
  },

  topography: {
    svg: (c: string) => `
      <svg xmlns='http://www.w3.org/2000/svg' width='100' height='100'>
        <path d='M0 50c20-20 30-20 50 0s30 20 50 0M0 20c20-20 30-20 50 0s30 20 50 0M0 80c20-20 30-20 50 0s30 20 50 0'
          fill='none' stroke='${c}' stroke-opacity='0.14' stroke-width='2'/>
      </svg>`,
    size: '100px 100px',
  },

  circuit: {
    svg: (c: string) => `
      <svg xmlns='http://www.w3.org/2000/svg' width='60' height='60'>
        <path d='M10 0v20M10 20h20M30 20v20M30 40h20' fill='none' stroke='${c}' stroke-opacity='0.15' stroke-width='2'/>
        <circle cx='10' cy='20' r='3' fill='${c}' fill-opacity='0.2'/>
        <circle cx='30' cy='40' r='3' fill='${c}' fill-opacity='0.2'/>
      </svg>`,
    size: '60px 60px',
  },

  hexagons: {
    svg: (c: string) => `
      <svg xmlns='http://www.w3.org/2000/svg' width='50' height='44'>
        <path d='M25 0l25 14v22l-25 14L0 36V14z' fill='none' stroke='${c}' stroke-opacity='0.15' stroke-width='2'/>
      </svg>`,
    size: '50px 44px',
  },

  /* "Bubbles" — a Hero Patterns staple: rings of varying radius, loosely
     scattered across a wide tile so the repeat isn't obvious. */
  bubbles: {
    svg: (c: string) => `
      <svg xmlns='http://www.w3.org/2000/svg' width='80' height='80'>
        <g fill='none' stroke='${c}' stroke-opacity='0.18' stroke-width='1.6'>
          <circle cx='14' cy='16' r='6'/>
          <circle cx='46' cy='10' r='3.5'/>
          <circle cx='64' cy='34' r='8'/>
          <circle cx='24' cy='52' r='4.5'/>
          <circle cx='58' cy='64' r='5.5'/>
          <circle cx='8' cy='70' r='3'/>
        </g>
      </svg>`,
    size: '80px 80px',
  },

  /* "Zigzag" — sharp chevron rows, good for a sportier/energetic card. */
  zigzag: {
    svg: (c: string) => `
      <svg xmlns='http://www.w3.org/2000/svg' width='40' height='20'>
        <path d='M0 20L10 0L20 20L30 0L40 20' fill='none' stroke='${c}' stroke-opacity='0.18' stroke-width='2'/>
      </svg>`,
    size: '40px 20px',
  },

  /* "Plus signs" — a light grid of crosses, classic Hero Patterns tile,
     reads as understated texture behind small text. */
  plusSigns: {
    svg: (c: string) => `
      <svg xmlns='http://www.w3.org/2000/svg' width='24' height='24'>
        <g stroke='${c}' stroke-opacity='0.2' stroke-width='2' stroke-linecap='round'>
          <path d='M12 6v12M6 12h12'/>
        </g>
      </svg>`,
    size: '24px 24px',
  },

  /* "Moroccan" — quatrefoil-style lattice, more ornate/premium feel,
     pairs well with gift-card or luxury-brand tiles. */
  moroccan: {
    svg: (c: string) => `
      <svg xmlns='http://www.w3.org/2000/svg' width='70' height='70'>
        <g fill='none' stroke='${c}' stroke-opacity='0.18' stroke-width='1.6'>
          <path d='M35 5c10 0 15 10 15 20s-5 20-15 20-15-10-15-20 5-20 15-20z'/>
          <path d='M5 35c0-10 10-15 20-15s20 5 20 15-10 15-20 15-20-5-20-15z' opacity='0'/>
          <circle cx='0' cy='0' r='16'/>
          <circle cx='70' cy='0' r='16'/>
          <circle cx='0' cy='70' r='16'/>
          <circle cx='70' cy='70' r='16'/>
        </g>
      </svg>`,
    size: '70px 70px',
  },

  /* "Overlapping circles" — two rows of large, thin rings that intersect;
     good for a spacious hero-banner-style card. */
  overlappingCircles: {
    svg: (c: string) => `
      <svg xmlns='http://www.w3.org/2000/svg' width='60' height='60'>
        <g fill='none' stroke='${c}' stroke-opacity='0.14' stroke-width='1.6'>
          <circle cx='15' cy='15' r='18'/>
          <circle cx='45' cy='45' r='18'/>
        </g>
      </svg>`,
    size: '60px 60px',
  },

  /* "Jigsaw" — interlocking puzzle-piece outlines, playful/gamified feel
     for referral or "unlock a reward" style cards. */
  jigsaw: {
    svg: (c: string) => `
      <svg xmlns='http://www.w3.org/2000/svg' width='48' height='48'>
        <path d='M0 16h12c0-6 8-6 8 0h12v12c-6 0-6 8 0 8v12H20c0-6-8-6-8 0H0V36c6 0 6-8 0-8z'
          fill='none' stroke='${c}' stroke-opacity='0.16' stroke-width='1.6'/>
      </svg>`,
    size: '48px 48px',
  },

  /* "Wiggle" — a soft sine squiggle row, friendlier/rounder than `waves`,
     reads more like a hand-drawn accent line. */
  wiggle: {
    svg: (c: string) => `
      <svg xmlns='http://www.w3.org/2000/svg' width='40' height='16'>
        <path d='M0 8q5-8 10 0t10 0 10 0 10 0' fill='none' stroke='${c}' stroke-opacity='0.2' stroke-width='2' stroke-linecap='round'/>
      </svg>`,
    size: '40px 16px',
  },

  /* "Confetti" — mixed small shapes (dot, dash, tiny square) scattered
     across a tile; good for a celebratory / limited-time-offer card. */
  confetti: {
    svg: (c: string) => `
      <svg xmlns='http://www.w3.org/2000/svg' width='60' height='60'>
        <g fill='${c}' fill-opacity='0.2'>
          <circle cx='8' cy='10' r='2.2'/>
          <rect x='30' y='6' width='6' height='2.4' transform='rotate(30 33 7)'/>
          <rect x='46' y='24' width='4' height='4' transform='rotate(15 48 26)'/>
          <circle cx='20' cy='38' r='1.8'/>
          <rect x='6' y='46' width='6' height='2.4' transform='rotate(-20 9 47)'/>
          <circle cx='50' cy='50' r='2.4'/>
        </g>
      </svg>`,
    size: '60px 60px',
  },

  /* --- Genuine Hero Patterns tiles (heropatterns.com, MIT, Steve Schoger) -
     these two are copied faithfully from the actual generated output (not
     hand-approximated like the tiles above) — verified against the site's
     own CSS export. Everything above this line is our own path data drawn
     in a similar spirit; everything below is the real thing. */

  /* "Polka Dots" — the exact heropatterns.com tile: two 3px-radius circles
     on a 20x20 grid, offset so the repeat reads as an even dot field. */
  heroPolkaDots: {
    svg: (c: string) => `
      <svg xmlns='http://www.w3.org/2000/svg' width='20' height='20' viewBox='0 0 20 20'>
        <g fill='${c}' fill-opacity='0.35' fill-rule='evenodd'>
          <circle cx='3' cy='3' r='3'/>
          <circle cx='13' cy='13' r='3'/>
        </g>
      </svg>`,
    size: '20px 20px',
  },

  /* "Graph Paper" — the exact heropatterns.com tile: a fine grid of small
     tick-mark squares plus a bold corner-crossing border line, reproduced
     verbatim from the site's generated CSS. */
  heroGraphPaper: {
    svg: (c: string) => `
      <svg xmlns='http://www.w3.org/2000/svg' width='100' height='100' viewBox='0 0 100 100'>
        <g fill-rule='evenodd'>
          <g fill='${c}' fill-opacity='0.35'>
            <path opacity='.5' d='M96 95h4v1h-4v4h-1v-4h-9v4h-1v-4h-9v4h-1v-4h-9v4h-1v-4h-9v4h-1v-4h-9v4h-1v-4h-9v4h-1v-4h-9v4h-1v-4H0v-1h15v-9H0v-1h15v-9H0v-1h15v-9H0v-1h15v-9H0v-1h15v-9H0v-1h15v-9H0v-1h15v-9H0v-1h15V0h1v15h9V0h1v15h9V0h1v15h9V0h1v15h9V0h1v15h9V0h1v15h9V0h1v15h9V0h1v15h9V0h1v15h4v1h-4v9h4v1h-4v9h4v1h-4v9h4v1h-4v9h4v1h-4v9h4v1h-4v9h4v1h-4v9h4v1h-4v9zm-1 0v-9h-9v9h9zm-10 0v-9h-9v9h9zm-10 0v-9h-9v9h9zm-10 0v-9h-9v9h9zm-10 0v-9h-9v9h9zm-10 0v-9h-9v9h9zm-10 0v-9h-9v9h9zm-10 0v-9h-9v9h9zm-9-10h9v-9h-9v9zm10 0h9v-9h-9v9zm10 0h9v-9h-9v9zm10 0h9v-9h-9v9zm10 0h9v-9h-9v9zm10 0h9v-9h-9v9zm10 0h9v-9h-9v9zm10 0h9v-9h-9v9zm9-10v-9h-9v9h9zm-10 0v-9h-9v9h9zm-10 0v-9h-9v9h9zm-10 0v-9h-9v9h9zm-10 0v-9h-9v9h9zm-10 0v-9h-9v9h9zm-10 0v-9h-9v9h9zm-10 0v-9h-9v9h9zm-9-10h9v-9h-9v9zm10 0h9v-9h-9v9zm10 0h9v-9h-9v9zm10 0h9v-9h-9v9zm10 0h9v-9h-9v9zm10 0h9v-9h-9v9zm10 0h9v-9h-9v9zm10 0h9v-9h-9v9zm9-10v-9h-9v9h9zm-10 0v-9h-9v9h9zm-10 0v-9h-9v9h9zm-10 0v-9h-9v9h9zm-10 0v-9h-9v9h9zm-10 0v-9h-9v9h9zm-10 0v-9h-9v9h9zm-10 0v-9h-9v9h9zm-9-10h9v-9h-9v9zm10 0h9v-9h-9v9zm10 0h9v-9h-9v9zm10 0h9v-9h-9v9zm10 0h9v-9h-9v9zm10 0h9v-9h-9v9zm10 0h9v-9h-9v9zm10 0h9v-9h-9v9zm9-10v-9h-9v9h9zm-10 0v-9h-9v9h9zm-10 0v-9h-9v9h9zm-10 0v-9h-9v9h9zm-10 0v-9h-9v9h9zm-10 0v-9h-9v9h9zm-10 0v-9h-9v9h9zm-10 0v-9h-9v9h9zm-9-10h9v-9h-9v9zm10 0h9v-9h-9v9zm10 0h9v-9h-9v9zm10 0h9v-9h-9v9zm10 0h9v-9h-9v9zm10 0h9v-9h-9v9zm10 0h9v-9h-9v9zm10 0h9v-9h-9v9z'/>
            <path d='M6 5V0H5v5H0v1h5v94h1V6h94V5H6z'/>
          </g>
        </g>
      </svg>`,
    size: '100px 100px',
  },
}

function patternStyle(type: PatternType | undefined, hex: string): React.CSSProperties {
  if (!type || type === 'none' || type === 'external') return {}
  const encoded = hex.replace('#', '%23')
  const tile = PATTERN_TILE[type]
  const svg = tile.svg(encoded).replace(/\s+/g, ' ').trim()
  return {
    backgroundImage: `url("data:image/svg+xml,${svg}")`,
    backgroundSize: tile.size,
  }
}

/* ---------------------------------------------------------------------- */
/* Product visual — generated, transparent SVG icons. No raster assets,   */
/* so there is never a solid background fighting the pattern layer.       */
/* `productImage` still exists as an escape hatch for a REAL transparent  */
/* cutout (e.g. an actual brand logo mark, or a user-uploaded image) when  */
/* you have one — it takes priority over the generated icon if both are   */
/* set.                                                                    */
/* ---------------------------------------------------------------------- */

export type ProductIconType = 'none' | 'percent' | 'gift' | 'coin' | 'tag'

function ProductIcon({ type, color }: { type: ProductIconType; color: string }) {
  if (type === 'none') return null

  const wrapperClass =
    'pointer-events-none absolute -bottom-[6%] -right-[4%] z-[1] h-[70%] w-auto opacity-40 transition-transform duration-500 group-hover:scale-105'

  switch (type) {
    case 'percent':
      return (
        <svg viewBox="0 0 100 100" fill="none" className={wrapperClass} aria-hidden="true">
          <circle cx="50" cy="50" r="45" stroke={color} strokeWidth="5" />
          <circle cx="34" cy="34" r="8" fill={color} />
          <circle cx="66" cy="66" r="8" fill={color} />
          <line x1="30" y1="70" x2="70" y2="30" stroke={color} strokeWidth="5" strokeLinecap="round" />
        </svg>
      )
    case 'gift':
      return (
        <svg viewBox="0 0 100 100" fill="none" className={wrapperClass} aria-hidden="true">
          <rect x="14" y="42" width="72" height="46" rx="4" stroke={color} strokeWidth="5" />
          <rect x="14" y="26" width="72" height="18" rx="4" fill={color} />
          <line x1="50" y1="26" x2="50" y2="88" stroke={color} strokeWidth="5" strokeOpacity="0.5" />
          <path d="M50 26c-4-16-32-12-22 2 6 8 22-2 22-2z" fill={color} />
          <path d="M50 26c4-16 32-12 22 2-6 8-22-2-22-2z" fill={color} />
        </svg>
      )
    case 'coin':
      return (
        <svg viewBox="0 0 100 100" fill="none" className={wrapperClass} aria-hidden="true">
          <circle cx="50" cy="50" r="44" stroke={color} strokeWidth="5" />
          <circle cx="50" cy="50" r="30" stroke={color} strokeWidth="3" />
          <text x="50" y="60" fontSize="26" fill={color} textAnchor="middle" fontFamily="serif">
            Rs
          </text>
        </svg>
      )
    case 'tag':
      return (
        <svg viewBox="0 0 100 100" fill="none" className={wrapperClass} aria-hidden="true">
          <path d="M12 50 L50 12 H82 a6 6 0 0 1 6 6 V50 L50 88 Z" stroke={color} strokeWidth="5" strokeLinejoin="round" />
          <circle cx="68" cy="32" r="6" fill={color} />
        </svg>
      )
    default:
      return null
  }
}

/* ---------------------------------------------------------------------- */
/* Normalized shape                                                        */
/* ---------------------------------------------------------------------- */

export interface CouponDisplay {
  key: string
  headline: string
  eyebrow?: string
  detail?: string
  badge?: { label: string; className: string }
  bgColor?: string
  accent?: string
  patternType?: PatternType
  patternColor?: string
  productIcon?: ProductIconType // generated, transparent — used unless productImage is set
  productImage?: string // real asset override (art-directed photo OR user upload)
  footerLogo?: string // seller/brand logo (asset path, or user upload as data URL)
  footerInitials?: string
  footerText: string
  href: string
  dimmed?: boolean
}

const FALLBACK_BG = '#F0EFEC'
const FALLBACK_ACCENT = 'text-ink'
const FALLBACK_PATTERN_COLOR = '#08274F'

/* ---------------------------------------------------------------------- */
/* Adapter: storefront Deal -> CouponDisplay                              */
/* ---------------------------------------------------------------------- */

export function dealToCoupon(deal: Deal): CouponDisplay {
  return {
    key: deal.brand,
    headline: deal.discount,
    eyebrow: deal.label,
    detail: deal.detail,
    bgColor: deal.bgColor,
    accent: deal.accent,
    productImage: deal.productImage, // real art-directed photo, unchanged behavior
    footerLogo: deal.brandLogo,
    footerText: deal.brand,
    href: deal.href,
  }
}

/* ---------------------------------------------------------------------- */
/* Adapter: admin Discount -> CouponDisplay                                */
/* ---------------------------------------------------------------------- */

const PALETTE: { bg: string; accent: string; pattern: string }[] = [
  { bg: '#EAE8FB', accent: 'text-[#5B57F0]', pattern: '#5B57F0' },
  { bg: '#FBEEDC', accent: 'text-[#E0A429]', pattern: '#E0A429' },
  { bg: '#E4F3EA', accent: 'text-[#2FA36B]', pattern: '#2FA36B' },
  { bg: '#FBE9E9', accent: 'text-[#E24C5A]', pattern: '#E24C5A' },
]

function hashPalette(id: string) {
  const sum = [...id].reduce((acc, ch) => acc + ch.charCodeAt(0), 0)
  return PALETTE[sum % PALETTE.length]
}

const PRODUCT_ICON_BY_TYPE: Record<Discount['type'], ProductIconType> = {
  percentage: 'percent',
  fixed: 'coin',
  free_gift: 'gift',
}

const SELLER_LOGO: Record<string, string> = {
  // sel_meera_textiles: '/logos/meera-textiles.png',
}

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
  const sellerId = discount.scope.sellerId
  const logo = sellerId ? SELLER_LOGO[sellerId] : undefined

  return {
    key: discount.id,
    headline: formatDiscountValue(discount),
    eyebrow: TYPE_LABEL[discount.type],
    detail: formatDiscountScope(discount),
    badge: { label: STATUS_LABEL[status], className: STATUS_STYLE[status] },
    bgColor: palette.bg,
    accent: palette.accent,
    patternType: 'damask',
    patternColor: palette.pattern,
    productIcon: PRODUCT_ICON_BY_TYPE[discount.type],
    footerLogo: logo,
    footerInitials: logo ? undefined : initialsFor(discount),
    footerText: discount.scope.sellerName ?? discount.scope.collectionName ?? discount.name,
    href: `/admin/discounts/${discount.id}`,
    dimmed: status === 'expired' || status === 'disabled',
  }
}

/* ---------------------------------------------------------------------- */
/* Component                                                               */
/* ---------------------------------------------------------------------- */

export default function DealCoupon({ coupon }: { coupon: CouponDisplay }) {
  const bgColor = coupon.bgColor ?? FALLBACK_BG
  const accent = coupon.accent ?? FALLBACK_ACCENT
  const patternHex = coupon.patternColor ?? FALLBACK_PATTERN_COLOR

  return (
    <a
      href={coupon.href}
      className={`group relative flex aspect-[7/4] w-full overflow-hidden rounded-xl shadow-[0_1px_2px_rgba(8,39,79,0.06),0_12px_28px_-12px_rgba(8,39,79,0.25)] ring-1 ring-inset ring-black/5 transition-all duration-300 hover:-translate-y-1.5 hover:shadow-[0_1px_2px_rgba(8,39,79,0.08),0_20px_36px_-14px_rgba(8,39,79,0.32)] sm:rounded-2xl ${
        coupon.dimmed ? 'opacity-60 grayscale-[0.4]' : ''
      }`}
      style={{ backgroundColor: bgColor }}
    >
      <div className="relative flex min-w-0 flex-1 flex-col p-[clamp(0.65rem,3vw,1.5rem)]">
        {/* layer 1: pattern — programmatic, own color/type, independent of product */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-0"
          style={patternStyle(coupon.patternType, patternHex)}
        />

        {/* layer 2: product — EITHER a real transparent asset (art-directed OR
            user-uploaded) OR a generated transparent SVG icon. Never both,
            never a solid raster background fighting the pattern. */}
        {coupon.productImage ? (
          <img
            src={coupon.productImage}
            alt=""
            aria-hidden="true"
            className="pointer-events-none absolute bottom-0 right-0 z-[1] h-[60%] w-auto object-contain pb-2 pr-4 opacity-90 transition-transform duration-500 group-hover:scale-105"
          />
        ) : coupon.productIcon ? (
          <ProductIcon type={coupon.productIcon} color={patternHex} />
        ) : null}

        <span
          aria-hidden="true"
          className="pointer-events-none absolute -right-8 -top-8 z-[1] h-24 w-24 rounded-full bg-white/25 blur-2xl transition-transform duration-500 group-hover:scale-125"
        />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 z-[1] h-16 bg-gradient-to-b from-white/20 to-transparent"
        />

        <div className="relative z-10 min-w-0 max-w-[62%] pr-2">
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
              className="mt-1 line-clamp-2 font-body text-ink/70"
              style={{ fontSize: 'clamp(0.6rem, 1.8vw, 0.875rem)' }}
            >
              {coupon.detail}
            </p>
          )}
        </div>

        <div className="relative z-10 mt-auto flex min-w-0 max-w-[62%] items-center gap-2">
          {coupon.footerLogo ? (
            <img
              src={coupon.footerLogo}
              alt={`${coupon.footerText} logo`}
              className="w-auto shrink-0 object-contain"
              style={{ height: 'clamp(0.9rem, 3vw, 1.75rem)' }}
              onError={(e) => {
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
                backgroundColor: 'rgba(255,255,255,0.6)',
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

      {/* Perforation — two "torn ticket" notch circles + a dashed divider.
          Notches are sized down and pulled in closer to the edge (was
          -0.5rem offset / up to 1.5rem across) so they sit inside the
          card's rounded corner arc instead of poking past its curve at
          the very top and bottom. */}
      <div className="relative w-0 flex-none">
        <span
          aria-hidden="true"
          className="absolute left-1/2 -translate-x-1/2 rounded-full bg-card"
          style={{ top: '-0.35rem', height: 'clamp(0.6rem, 1.2vw, 1.1rem)', width: 'clamp(0.6rem, 1.2vw, 1.1rem)' }}
        />
        <span
          aria-hidden="true"
          className="absolute left-1/2 -translate-x-1/2 rounded-full bg-card"
          style={{
            bottom: '-0.35rem',
            height: 'clamp(0.6rem, 1.2vw, 1.1rem)',
            width: 'clamp(0.6rem, 1.2vw, 1.1rem)',
          }}
        />
        <span
          aria-hidden="true"
          className="absolute inset-y-3 left-1/2 w-0 -translate-x-1/2 border-l-2 border-dashed border-ink/15 sm:inset-y-4"
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