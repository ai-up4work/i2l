import type { CheerioAPI } from 'cheerio'
import { cleanText, detectCurrencyAndClean, domainCurrency } from '../shared'
import type { AmazonVariantDimension } from './amazon'

export const SITE_ID = 'jiomart' as const

// Presumed true until confirmed against a real captured JioMart PDP —
// most JioMart listings (groceries, single-SKU electronics) have no
// variant picker at all, but the fashion/apparel category does show
// size pills, and those are suspected to be client-hydrated same as
// Ajio's. Flip once verified against a real page.
export const REQUIRES_RENDER_FOR_VARIANTS = true

const SOLD_OUT_PATTERN = /\b(out of stock|currently unavailable|notify me|sold out)\b/i
const ADD_TO_CART_PATTERN = /\badd to cart\b/i

function detectAvailability($: CheerioAPI): { availability: string | null; unavailable: boolean } {
  const bodyText = cleanText($('body')).toLowerCase()
  const hasAddToCart =
    ADD_TO_CART_PATTERN.test(bodyText) ||
    $('button, a').toArray().some((el) => ADD_TO_CART_PATTERN.test(cleanText($(el))))
  const hasSoldOut = SOLD_OUT_PATTERN.test(bodyText)

  if (hasAddToCart && !hasSoldOut) return { availability: 'In stock', unavailable: false }
  if (hasSoldOut && !hasAddToCart) return { availability: 'Out of stock', unavailable: true }
  return { availability: null, unavailable: false }
}

export function extractJioMartOptions($: CheerioAPI): Record<string, string> | null {
  const options: Record<string, string> = {}

  // Pack-size selector (e.g. "500 g", "1 kg", "1 L") — JioMart's most
  // common variant axis, present across groceries as well as fashion.
  $('[class*="pack" i] [class*="selected" i], [class*="quantity-selector" i] [class*="active" i]').each((_, el) => {
    const label = cleanText($(el))
    if (label) options['Pack Size'] = label
  })

  $('[class*="size" i] [class*="selected" i], [class*="size" i][aria-selected="true"]').each((_, el) => {
    const label = cleanText($(el))
    if (label && label.length <= 12) options['Size'] = label
  })

  return Object.keys(options).length ? options : null
}

// JioMart's pack-size/size pills swap PDP state client-side rather than
// linking to a distinct URL per variant, so `url` is always null — tiles
// render informational, not clickable, same as Ajio's.
function buildJioMartVariantDimensions($: CheerioAPI): AmazonVariantDimension[] {
  const dimensions: AmazonVariantDimension[] = []

  const packEls = $('[class*="pack-size" i] [class*="option" i], [class*="quantity-selector" i] [class*="option" i]')
  if (packEls.length) {
    const options = packEls
      .toArray()
      .map((el) => {
        const $el = $(el)
        const label = cleanText($el)
        const outOfStock = /\b(disabled|out-of-stock|notify)\b/i.test($el.attr('class') ?? '') || $el.is('[disabled]')
        const selected =
          $el.is('[aria-selected="true"]') || /\b(selected|active|is-selected)\b/i.test($el.attr('class') ?? '')
        return { label, price: null, currencyCode: null, image: null, url: null, selected, outOfStock }
      })
      .filter((o) => o.label)

    if (options.length) dimensions.push({ dimension: 'Pack Size', options })
  }

  const sizeEls = $('[class*="size-selector" i] [class*="size" i]')
  if (sizeEls.length) {
    const options = sizeEls
      .toArray()
      .map((el) => {
        const $el = $(el)
        const label = cleanText($el)
        const outOfStock = /\b(disabled|out-of-stock|notify)\b/i.test($el.attr('class') ?? '') || $el.is('[disabled]')
        const selected =
          $el.is('[aria-selected="true"]') || /\b(selected|active|is-selected)\b/i.test($el.attr('class') ?? '')
        return { label, price: null, currencyCode: null, image: null, url: null, selected, outOfStock }
      })
      .filter((o) => o.label)

    if (options.length) dimensions.push({ dimension: 'Size', options })
  }

  return dimensions
}

export function parseJioMart($: CheerioAPI, url: string) {
  const domainHint = domainCurrency(url)

  const priceRaw = cleanText($('span.jm-heading-xs')) || cleanText($('span[class*="price" i]').first())
  const mrpRaw = cleanText($('span[class*="mrp" i] strike')) || cleanText($('span[class*="strike" i]').first())
  const { amount, code } = detectCurrencyAndClean(priceRaw, domainHint)

  const images = new Set<string>()
  $('img[class*="product" i], [class*="image-gallery" i] img').each((_, el) => {
    const src = $(el).attr('src') || $(el).attr('data-src')
    if (src) images.add(src)
  })

  const { availability, unavailable } = detectAvailability($)

  const parsed: Record<string, any> = {
    title: cleanText($('h1').first()),
    price: amount,
    mrp: detectCurrencyAndClean(mrpRaw, domainHint).amount,
    currencyCode: code,
    rating: cleanText($('[class*="rating-value" i]')) || null,
    review_count: cleanText($('[class*="rating-count" i]')) || null,
    availability,
    seller: cleanText($('[class*="seller" i]').first()) || null,
    images: [...images],
  }

  const variants = buildJioMartVariantDimensions($)
  if (variants.length) parsed.variants = variants

  if (unavailable) {
    parsed._jiomartUnavailable = true
    parsed._jiomartWarning =
      'No "Add to Cart" button found and sold-out/notify-me copy was detected — this listing looks genuinely unavailable rather than a scrape failure.'
  }

  return parsed
}

export function consumeJioMartMeta(parsed: Record<string, any>): { warning?: string; unavailable?: boolean } {
  const warning = parsed._jiomartWarning as string | undefined
  const unavailable = parsed._jiomartUnavailable as boolean | undefined
  delete parsed._jiomartWarning
  delete parsed._jiomartUnavailable
  return { warning, unavailable }
}