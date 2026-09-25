// lib/seo.ts
//
// Single source of truth for everything SEO + PWA: site identity, default
// copy, every image path that search engines / social cards / install
// prompts read, and the helpers pages use to build their metadata.
//
// REPLACING IMAGES: every path in SEO_IMAGES / PWA_ICONS points at a real
// placeholder file under /public. Drop your final artwork in at the SAME
// path with the SAME dimensions and nothing else needs to change. The full
// list, with sizes and rules, is in SEO_PWA.md at the project root.

import type { Metadata } from 'next'

// ─── Site identity ─────────────────────────────────────────────────────

function resolveSiteUrl(): string {
  const raw =
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : '') ||
    'http://localhost:3000'
  // Strip any trailing slash so `${SITE_URL}${path}` never produces "//".
  return raw.replace(/\/+$/, '')
}

export const SITE_URL = resolveSiteUrl()

export const SITE = {
  name: 'WishDrop',
  legalName: 'WishDrop',
  shortName: 'WishDrop',
  tagline: "Wish it. We'll drop it.",
  defaultTitle: "WishDrop — Wish it. We'll drop it.",
  description:
    'Shop from your favourite Indian stores — WishDrop buys it, quality-checks it, and delivers it to your door in Sri Lanka.',
  locale: 'en_LK',
  language: 'en',
  country: 'LK',
  currency: 'LKR',
  // Browser UI / installed-app title bar colour, and the splash background.
  // Kept in sync with @theme in app/globals.css (indigo + parchment).
  themeColor: '#08274f',
  backgroundColor: '#fbf6ec',
  keywords: [
    'WishDrop',
    'buy from India Sri Lanka',
    'Indian online shopping Sri Lanka',
    'shop Indian stores deliver to Sri Lanka',
    'Myntra Sri Lanka',
    'Flipkart Sri Lanka',
    'Amazon India to Sri Lanka',
    'Nykaa Sri Lanka',
    'Ajio Sri Lanka',
    'concierge shopping Sri Lanka',
    'buy for me service',
    'cross-border shopping',
    'India to Sri Lanka shipping',
  ],
  // Public contact points used in Organization structured data. Fill the
  // email in when you have a real support inbox; empty values are dropped.
  contact: {
    email: '', // e.g. 'support@wishdrop.shop'
    whatsapp: process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || '',
  },
  // Official social profiles (Organization "sameAs"). Empty entries are
  // ignored, so leave them blank until the profile exists.
  social: {
    facebook: '', // e.g. 'https://www.facebook.com/wishdrop'
    instagram: '',
    tiktok: '',
    youtube: '',
    linkedin: '',
    x: '',
  },
  // X/Twitter handle for twitter:site, including the @. Leave blank if none.
  twitterHandle: '',
} as const

// ─── Image paths (all files exist as placeholders under /public) ───────

export const SEO_IMAGES = {
  /** 1200×630 — default Open Graph card (Facebook, WhatsApp, LinkedIn, iMessage). */
  ogDefault: '/images/seo/og-default.png',
  /** 1200×630 — default X/Twitter summary_large_image card. */
  twitterDefault: '/images/seo/twitter-card.png',
  /** 512×512 — square logo for Google's Organization rich result. */
  logo: '/images/seo/logo-512.png',
} as const

export const OG_IMAGE_SIZE = { width: 1200, height: 630 } as const

export const PWA_ICONS = {
  favicon: '/favicon.ico',
  favicon16: '/icons/favicon-16x16.png',
  favicon32: '/icons/favicon-32x32.png',
  appleTouch: '/icons/apple-touch-icon.png', // 180×180
  icon192: '/icons/icon-192.png',
  icon512: '/icons/icon-512.png',
  maskable192: '/icons/icon-maskable-192.png',
  maskable512: '/icons/icon-maskable-512.png',
  shortcutStores: '/icons/shortcut-stores-96.png',
  shortcutRequest: '/icons/shortcut-request-96.png',
  shortcutOrders: '/icons/shortcut-orders-96.png',
  shortcutCart: '/icons/shortcut-cart-96.png',
  /** 96×96 white-on-transparent — Android status-bar icon for push notifications. */
  badge: '/icons/badge-96.png',
} as const

export const PWA_SCREENSHOTS = {
  wide: '/images/pwa/screenshot-wide.png', // 1280×720, desktop install dialog
  narrow: '/images/pwa/screenshot-narrow.png', // 750×1334, mobile install sheet
} as const

// iOS doesn't read the manifest for launch screens — it needs one exact-size
// image per device class. Each entry: file, CSS device size, pixel ratio.
export const APPLE_STARTUP_IMAGES: { url: string; w: number; h: number; dpr: number }[] = [
  { url: '/images/pwa/splash/apple-splash-1320x2868.png', w: 440, h: 956, dpr: 3 }, // iPhone 16 Pro Max
  { url: '/images/pwa/splash/apple-splash-1206x2622.png', w: 402, h: 874, dpr: 3 }, // iPhone 16 Pro
  { url: '/images/pwa/splash/apple-splash-1290x2796.png', w: 430, h: 932, dpr: 3 }, // 14/15 Pro Max, 15/16 Plus
  { url: '/images/pwa/splash/apple-splash-1179x2556.png', w: 393, h: 852, dpr: 3 }, // 14/15 Pro, 15/16
  { url: '/images/pwa/splash/apple-splash-1284x2778.png', w: 428, h: 926, dpr: 3 }, // 12/13 Pro Max, 14 Plus
  { url: '/images/pwa/splash/apple-splash-1170x2532.png', w: 390, h: 844, dpr: 3 }, // 12/13/14, 12/13 Pro
  { url: '/images/pwa/splash/apple-splash-1125x2436.png', w: 375, h: 812, dpr: 3 }, // X/XS/11 Pro, 12/13 mini
  { url: '/images/pwa/splash/apple-splash-1242x2688.png', w: 414, h: 896, dpr: 3 }, // XS Max, 11 Pro Max
  { url: '/images/pwa/splash/apple-splash-828x1792.png', w: 414, h: 896, dpr: 2 }, // XR, 11
  { url: '/images/pwa/splash/apple-splash-750x1334.png', w: 375, h: 667, dpr: 2 }, // SE 2/3, 8
  { url: '/images/pwa/splash/apple-splash-2048x2732.png', w: 1024, h: 1366, dpr: 2 }, // iPad Pro 12.9"
  { url: '/images/pwa/splash/apple-splash-1668x2388.png', w: 834, h: 1194, dpr: 2 }, // iPad Pro 11"
  { url: '/images/pwa/splash/apple-splash-1640x2360.png', w: 820, h: 1180, dpr: 2 }, // iPad Air
  { url: '/images/pwa/splash/apple-splash-1620x2160.png', w: 810, h: 1080, dpr: 2 }, // iPad 10.2"
]

// ─── Helpers ───────────────────────────────────────────────────────────

/** Turns a site-relative path (or an absolute URL) into an absolute URL. */
export function absoluteUrl(pathOrUrl: string = '/'): string {
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl
  const path = pathOrUrl.startsWith('/') ? pathOrUrl : `/${pathOrUrl}`
  return `${SITE_URL}${path}`
}

/** Trims text to a search-snippet-friendly length on a word boundary. */
export function clampDescription(text: string, max = 158): string {
  const clean = text.replace(/\s+/g, ' ').trim()
  if (clean.length <= max) return clean
  const cut = clean.slice(0, max - 1)
  const lastSpace = cut.lastIndexOf(' ')
  return `${(lastSpace > 80 ? cut.slice(0, lastSpace) : cut).replace(/[,.;:\-–—\s]+$/, '')}…`
}

/** Drops the legacy " | WishDrop" suffix pages used to hand-write. */
function stripBrandSuffix(title: string): string {
  return title.replace(/\s*[|–—-]\s*WishDrop\s*$/i, '').trim()
}

export interface PageMetadataInput {
  /** Page title WITHOUT the brand — " | WishDrop" is appended by the root template. */
  title: string
  description: string
  /** Site-relative path of this page, e.g. '/shipping'. Becomes the canonical URL. */
  path: string
  /** Optional page-specific social image (absolute URL or /public path). */
  image?: string
  imageAlt?: string
  /** Set false for pages that must stay out of search results. */
  index?: boolean
  type?: 'website' | 'article'
}

/**
 * Builds complete metadata for a page: title, description, canonical URL,
 * Open Graph and Twitter cards.
 *
 * Why a helper instead of a bare `{ title, description }` object: Next
 * merges metadata SHALLOWLY per key, so a page that sets its own
 * `openGraph` replaces the root layout's entirely (siteName, locale and
 * default image included). Building every page's cards here keeps them
 * complete. Canonicals must also be per-page — a canonical set in the root
 * layout would be inherited by every page and point them all at "/".
 */
export function pageMetadata({
  title,
  description,
  path,
  image,
  imageAlt,
  index = true,
  type = 'website',
}: PageMetadataInput): Metadata {
  const cleanTitle = stripBrandSuffix(title)
  // Titles that already name the brand ("About WishDrop", "Sell on
  // WishDrop") are used as-is rather than becoming "About WishDrop | WishDrop".
  const namesBrand = new RegExp(`\\b${SITE.name}\\b`, 'i').test(cleanTitle)
  const fullTitle =
    cleanTitle === SITE.name
      ? SITE.defaultTitle
      : namesBrand
        ? cleanTitle
        : `${cleanTitle} | ${SITE.name}`
  const desc = clampDescription(description)
  const url = absoluteUrl(path)
  const ogImage = image ?? SEO_IMAGES.ogDefault
  const twitterImage = image ?? SEO_IMAGES.twitterDefault
  const alt = imageAlt ?? `${cleanTitle} — ${SITE.name}`

  return {
    title: namesBrand || cleanTitle === SITE.name ? { absolute: fullTitle } : cleanTitle,
    description: desc,
    alternates: { canonical: url },
    openGraph: {
      type,
      url,
      siteName: SITE.name,
      locale: SITE.locale,
      title: fullTitle,
      description: desc,
      images: [
        image
          ? { url: ogImage, alt }
          : { url: ogImage, alt, ...OG_IMAGE_SIZE },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title: fullTitle,
      description: desc,
      images: [{ url: twitterImage, alt }],
      ...(SITE.twitterHandle ? { site: SITE.twitterHandle, creator: SITE.twitterHandle } : {}),
    },
    ...(index ? {} : { robots: { index: false, follow: true } }),
  }
}

/** For login/sign-up style pages: titled, but kept out of the index. */
export function noIndexMetadata(title: string, description?: string): Metadata {
  return {
    title: stripBrandSuffix(title),
    ...(description ? { description } : {}),
    robots: { index: false, follow: true, googleBot: { index: false, follow: true } },
  }
}

/** Official social URLs with blanks removed, for Organization.sameAs. */
export function socialProfiles(): string[] {
  return (Object.values(SITE.social) as string[]).filter(Boolean)
}

/** Path prefixes that must never be indexed or cached by the service worker. */
export const PRIVATE_PATH_PREFIXES = [
  '/account',
  '/admin',
  '/seller',
  '/catalogue',
  '/demo',
  '/auth',
  '/api',
] as const
