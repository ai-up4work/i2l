// lib/scrape/extractors/seleqt.ts
import type { CheerioAPI } from 'cheerio'
import { cleanText, domainCurrency, detectCurrencyAndClean } from '../shared'
import type { AmazonVariantDimension, AmazonVariantOption } from './amazon'

// ---------------------------------------------------------------------
// Seleqt by Wishlink (seleqt.wishlink.com) product-page extractor.
//
// CONFIRMED against one real captured PDP (product/1080452, "Cotton
// Floral Embroidered Dress" by ZUMMER) — both the selectors below and
// the render requirement this file depends on:
//   - A plain fetch() of a Seleqt product URL returns almost nothing:
//     the nav shell, a tracking pixel, and the page <title> (server-
//     rendered via Next.js metadata) — no price, images, sizes, or
//     anything else this parser reads. This is why 'seleqt' is in
//     RENDER_FALLBACK_HOSTS in parsers.ts: unlike Hopscotch (which
//     turned out to embed everything in a __NEXT_DATA__ script tag
//     the plain fetch already sees), Seleqt genuinely needs Playwright
//     rendering (fetchRendered) before this parser has anything to
//     work with. No __NEXT_DATA__ or other embedded JSON blob was
//     found in the raw response either — if a future pass finds one,
//     switching to that would be more robust than the DOM scraping
//     below and should replace it, the same way Hopscotch's extractor
//     was rewritten once its real data source was found (see that
//     file's own doc comments).
//   - Every selector below is copied from that one real page. Tailwind
//     utility classes (not hashed/scoped) are relatively durable across
//     redeploys, but this has only ever been checked against a single
//     product — a different category (no discount, sold out, a product
//     with no size selector) may not match every selector here. Falls
//     through to null/empty rather than throwing when something's
//     missing, so a partial page still returns whatever it can.

export type SeleqtParsed = {
  title: string | null
  brand: string | null
  price: string | null
  mrp: string | null
  currencyCode: string | null
  rating: string | null
  description: string | null
  images: string[]
  variants: AmazonVariantDimension[]
  itemSpecifics: { name: string; value: string }[] | null
}

// The <h1> is two spans — brand (font-semibold) then product name
// (text-neutral-700) — e.g. "ZUMMER" + " Cotton Floral Embroidered
// Dress". Returns both combined (for `title`) and the brand alone (for
// `brand`), rather than making the caller re-parse the same h1 twice.
function extractTitleAndBrand($: CheerioAPI): { title: string | null; brand: string | null } {
  const h1 = $('h1').first()
  if (!h1.length) return { title: null, brand: null }
  const brand = cleanText(h1.find('span').first())
  const full = cleanText(h1)
  return { title: full, brand: brand || null }
}

// Price block: a strikethrough MRP span (only present when discounted),
// a bold current-price span, and a separate "N% OFF" pill, all inside
// one container div (classes "mt-4 flex items-baseline gap-2").
//
// FIX 1: this used to select `span.font-bold` anywhere on the page —
// but `font-bold` isn't unique to the price. The image carousel has its
// own "Key Highlights" overlay heading using the same class
// (`text-[15px] leading-tight font-bold text-white`), earlier in the
// DOM, so `.first()` grabbed that instead — cheerio's `.text()`
// collapses the overlay's `<br>` with no space, which is exactly how a
// completely-wrong "KeyHighlights" ended up as the scraped price in a
// real QA run. Scoping to the specific price container (rather than
// `span.font-bold` anywhere in the page) is what actually fixes this,
// not just picking a different class name — `font-bold` alone will
// likely never be page-unique on a real product page like this one.
//
// FIX 2: this used to return the raw display text ("₹1,699") as-is.
// Every other extractor in this folder returns price/mrp as a CLEAN
// NUMERIC STRING (e.g. "1699") via detectCurrencyAndClean — not a
// display-formatted one — because downstream code does `Number(result
// .price)` directly (see ItemInfoModal.tsx's canBuildBreakdown and
// toPriceableItem). `Number("₹1,699")` is NaN, which silently failed
// canBuildBreakdown and sent every Seleqt quote through the "Price to
// be confirmed by our team" fallback instead of showing the real
// computed price breakdown — a real, user-visible bug this fixes, not
// just an internal inconsistency. detectCurrencyAndClean also replaces
// the standalone domainCurrency(url) call parseSeleqt used to make for
// currencyCode — same helper, same domainHint input, one fewer
// redundant call, and now also correctly deferring to the ₹ symbol or
// an inline ISO code if either is more specific than the domain
// default (see that function's own priority-order comment).
function extractPriceAndMrp(
  $: CheerioAPI,
  domainHint: string | null,
): { price: string | null; mrp: string | null; currencyCode: string | null } {
  const container = $('div.mt-4.flex.items-baseline.gap-2').first()
  if (!container.length) return { price: null, mrp: null, currencyCode: null }
  const mrpRaw = cleanText(container.find('span.line-through').first())
  // Scoped to text-foreground specifically — the "N% OFF" pill in this
  // same container is also font-bold, but text-white, not
  // text-foreground, so this doesn't need a :not() to exclude it.
  const priceRaw = cleanText(container.find('span.text-foreground.font-bold').first())
  const { amount: price, code } = detectCurrencyAndClean(priceRaw, domainHint)
  const { amount: mrp } = detectCurrencyAndClean(mrpRaw, domainHint)
  return { price, mrp, currencyCode: code }
}

// Carousel images are tagged `alt="<title> — image N"` on real slides;
// the last slide is also duplicated in a hidden `aria-hidden="true"`
// wrapper div to make the snap-scroll carousel loop, and one slide in
// the middle is a creator-reel <video>, not an <img> — none of that
// needs special-casing since the alt-pattern + a straight `<img>` tag
// selector already excludes both on their own (the video has no alt
// text matching, and dedup below collects the hidden duplicate but
// Set() removes it since it's the exact same URL).
function extractImages($: CheerioAPI): string[] {
  const urls = new Set<string>()
  $('img[alt*=" — image "]').each((_, el) => {
    const src = $(el).attr('src')
    if (src) urls.add(src)
  })
  return Array.from(urls)
}

// "Select Size :" heading followed by a row of plain-text buttons
// (XS/S/M/L/XL/2XL). No per-size price/image/stock data is exposed in
// the DOM at all (unlike Amazon/Hopscotch) — Seleqt's size buttons are
// just a label with an aria-pressed state, so every AmazonVariantOption
// field beyond `label`/`selected` is genuinely unavailable here, not an
// extraction gap.
function extractSizeVariants($: CheerioAPI): AmazonVariantDimension[] {
  const heading = $('h2').filter((_, el) => /select size/i.test($(el).text())).first()
  if (!heading.length) return []
  const row = heading.closest('section').find('button').filter((_, el) => {
    const t = $(el).text().trim()
    return t.length > 0 && t.length <= 4 // size labels only — excludes "Size chart ›" etc.
  })
  if (!row.length) return []

  const options: AmazonVariantOption[] = []
  row.each((_, el) => {
    const label = $(el).text().trim()
    if (!label) return
    options.push({
      label,
      price: null,
      currencyCode: null,
      image: null,
      url: null,
      selected: $(el).attr('aria-pressed') === 'true',
    })
  })
  return options.length ? [{ dimension: 'Size', options }] : []
}

// "Creator Ratings & Reviews" section's big "Overall Rating" number
// (e.g. "5.0") — deliberately NOT the small "Brand Rating" badge
// overlaid on the image carousel (also present on the page, e.g.
// "4.1"). The two are genuinely different things: Brand Rating is
// about ZUMMER generally, Overall Rating is specific to THIS listing's
// reviews — the badge's own accessible name ("View ratings") vs. the
// section's own heading text is how they're told apart here, since
// both happen to use similarly-sized bold numeric spans.
function extractRating($: CheerioAPI): string | null {
  const heading = $('h2').filter((_, el) => /creator ratings/i.test($(el).text())).first()
  if (!heading.length) return null
  return cleanText(heading.closest('section').find('span.text-\\[22px\\]').first())
}

// "Product Highlights" section — free-text copy, distinct from the
// structured Fabric/Gender/Pattern rows in extractItemSpecifics below
// (which live in a separately-headed "Product Details" section). On
// the one page checked, this text has no space between sentences
// ("Cotton Floral Embroidered Dress100% Cotton") — that's how the
// source renders it (whitespace-pre-line collapsing what were
// presumably separate lines), not a bug in this extraction.
function extractDescription($: CheerioAPI): string | null {
  const heading = $('h2').filter((_, el) => /product highlights/i.test($(el).text())).first()
  if (!heading.length) return null
  return cleanText(heading.closest('section').find('p').first())
}

// "Product Details" section — a plain label/value list (Fabric,
// Gender, Pattern, etc.). Whatever fields a given product actually has
// vary, so this reads every row present rather than assuming a fixed
// set.
function extractItemSpecifics($: CheerioAPI): { name: string; value: string }[] | null {
  const specifics: { name: string; value: string }[] = []
  $('h2')
    .filter((_, el) => /product details/i.test($(el).text()))
    .first()
    .closest('section')
    .find('li')
    .each((_, li) => {
      const spans = $(li).find('span')
      const name = cleanText(spans.eq(0))
      const value = cleanText(spans.eq(1))
      if (name && value) specifics.push({ name, value })
    })
  return specifics.length ? specifics : null
}

// ---------- main parser ----------

export function parseSeleqt($: CheerioAPI, url: string): SeleqtParsed {
  const { title, brand } = extractTitleAndBrand($)
  const { price, mrp, currencyCode } = extractPriceAndMrp($, domainCurrency(url))
  return {
    title,
    brand,
    price,
    mrp,
    currencyCode,
    rating: extractRating($),
    description: extractDescription($),
    images: extractImages($),
    variants: extractSizeVariants($),
    itemSpecifics: extractItemSpecifics($),
  }
}
