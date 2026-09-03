import type { CheerioAPI } from 'cheerio'
import { cleanText, detectCurrencyAndClean, domainCurrency } from '../shared'
import type { AmazonVariantDimension } from './amazon'

export const SITE_ID = 'ajio' as const

// Presumed true until confirmed against a real captured Ajio PDP — flip
// once verified, same as Myntra's flag was flipped after testing.
export const REQUIRES_RENDER_FOR_VARIANTS = true

const SOLD_OUT_PATTERN = /\b(sold out|out of stock|notify me|currently unavailable)\b/i
const ADD_TO_BAG_PATTERN = /\badd to bag\b/i

function detectAvailability($: CheerioAPI): { availability: string | null; unavailable: boolean } {
  const bodyText = cleanText($('body')).toLowerCase()
  const hasAddToBag =
    ADD_TO_BAG_PATTERN.test(bodyText) ||
    $('button, a').toArray().some((el) => ADD_TO_BAG_PATTERN.test(cleanText($(el))))
  const hasSoldOut = SOLD_OUT_PATTERN.test(bodyText)

  if (hasAddToBag && !hasSoldOut) return { availability: 'In stock', unavailable: false }
  if (hasSoldOut && !hasAddToBag) return { availability: 'Out of stock', unavailable: true }
  return { availability: null, unavailable: false }
}

export function extractAjioOptions($: CheerioAPI): Record<string, string> | null {
  const options: Record<string, string> = {}

  $('[class*="size" i]').each((_, el) => {
    const $el = $(el)
    const isSelected =
      $el.is('[aria-selected="true"]') || /\b(selected|active|is-selected)\b/i.test($el.attr('class') ?? '')
    if (!isSelected) return
    const label = cleanText($el)
    if (label && label.length <= 12) options['Size'] = label
  })

  $('[class*="color" i] [class*="selected" i], [class*="colour" i] [class*="selected" i]').each((_, el) => {
    const label = cleanText($(el)) || $(el).attr('title') || $(el).attr('aria-label') || ''
    if (label) options['Color'] = label
  })

  return Object.keys(options).length ? options : null
}

// Ajio's size pills swap PDP state client-side rather than linking to a
// distinct URL per size (unlike Amazon/Flipkart/Meesho/Myntra), so `url`
// is always null here — tiles render informational, not clickable.
function buildAjioVariantDimensions($: CheerioAPI): AmazonVariantDimension[] {
  const dimensions: AmazonVariantDimension[] = []
  const sizeEls = $('[class*="size-selector" i] [class*="size" i], [class*="sizeButton" i]')

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

export function parseAjio($: CheerioAPI, url: string) {
  const domainHint = domainCurrency(url)

  const priceRaw = cleanText($('div.prod-sp')) || cleanText($('[class*="price" i]').first())
  const mrpRaw = cleanText($('span.prod-cp')) || cleanText($('[class*="strike" i]').first())
  const { amount, code } = detectCurrencyAndClean(priceRaw, domainHint)

  const images = new Set<string>()
  $('div.img-container img, div.zoomContainer img, [class*="image-gallery" i] img').each((_, el) => {
    const src = $(el).attr('src') || $(el).attr('data-src')
    if (src) images.add(src)
  })

  const { availability, unavailable } = detectAvailability($)

  const parsed: Record<string, any> = {
    title: cleanText($('div.prod-name')) || cleanText($('h1').first()),
    price: amount,
    mrp: detectCurrencyAndClean(mrpRaw, domainHint).amount,
    currencyCode: code,
    rating: cleanText($('p.rating-value')) || null,
    review_count: cleanText($('p.rating-count')) || null,
    availability,
    seller: cleanText($('[class*="seller" i]').first()) || null,
    images: [...images],
  }

  const variants = buildAjioVariantDimensions($)
  if (variants.length) parsed.variants = variants

  if (unavailable) {
    parsed._ajioUnavailable = true
    parsed._ajioWarning =
      'No "Add to Bag" button found and sold-out/notify-me copy was detected — this listing looks genuinely unavailable rather than a scrape failure.'
  }

  return parsed
}

export function consumeAjioMeta(parsed: Record<string, any>): { warning?: string; unavailable?: boolean } {
  const warning = parsed._ajioWarning as string | undefined
  const unavailable = parsed._ajioUnavailable as boolean | undefined
  delete parsed._ajioWarning
  delete parsed._ajioUnavailable
  return { warning, unavailable }
}