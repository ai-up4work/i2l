// lib/scrape/extractors/amazon.ts
//
// Amazon-specific scraping logic, split out of parsers.ts into its own
// module so each piece (title, price, mrp, images, options, variants, ...)
// can be tweaked and tested in isolation instead of editing one big
// parseAmazon().
//
// Shared helpers (cleanText, domainCurrency, detectCurrencyAndClean) live in
// ../shared rather than ../parsers specifically so this file and parsers.ts
// don't end up importing each other in a circle.
import type { CheerioAPI } from 'cheerio'
import { cleanText, detectCurrencyAndClean, domainCurrency } from '../shared'

// ---------- Title ----------

export function extractAmazonTitle($: CheerioAPI): string | null {
  return cleanText($('#productTitle').first())
}

// ---------- Price / MRP ----------
//
// Scoped to known single-buybox containers ONLY. Do not add a fallback here
// that queries `.a-price` / `.a-price-whole` unscoped anywhere on the page —
// see the comment on extractAmazonPriceRaw below for why that exact
// shortcut is what produced a completely wrong price on the "See All Buying
// Options" comparison-grid layout (grabbed one grid tile's price and a
// DIFFERENT tile's strikethrough MRP, unrelated to the actually-selected
// Maroon/Large variant — Rs. 73,200 / Rs. 14,997 on a page whose real price
// was $23.86).

const BUYBOX_PRICE_CONTAINERS = [
  '#corePriceDisplay_desktop_feature_div',
  '#corePrice_feature_div',
  '#apex_desktop',
  '#unifiedPrice_feature_div',
]

/**
 * Detects Amazon's collapsed-buybox "See All Buying Options" layout: a
 * horizontal grid of swatch tiles (one per color/variant), each with its
 * own price + strikethrough MRP, and NO single buybox price element at all.
 *
 * Requires a structural signal — an actual grid of multiple offer/swatch
 * tiles — in addition to the "see all buying options" phrase, since that
 * phrase/link also appears on completely ordinary single-buybox listings
 * whenever more than one seller offers the item.
 */
export function hasBuyingOptionsGridLayout($: CheerioAPI): boolean {
  const hasGridContainer =
    $('#variation_color_name .imgSwatch').length > 2 ||
    $('[data-csa-c-content-id="olp-desktop-widget"]').length > 0 ||
    $('#aod-offer-list .aod-offer').length > 1 ||
    $('div[id^="aod-price-"]').length > 1

  if (!hasGridContainer) return false

  return /see all buying options/i.test($('body').text())
}

/**
 * Detects a genuinely dead/unsellable ASIN: no add-to-cart/buy-now button
 * AND no buybox container rendered anywhere on the page at all.
 *
 * Distinct from "buybox container present but our price selector inside it
 * came back empty" — that case is a real selector-drift bug and should
 * keep producing the drift warning. This only fires when the entire
 * buybox apparatus is absent, which on Amazon specifically and reliably
 * means: this child ASIN (a specific size/color variant) has no live,
 * purchasable offer right now — commonly a retired/discontinued variant
 * while the parent product page (title/images/rating, which are
 * parent-level data) is still served normally.
 */
export function isAmazonUnavailable($: CheerioAPI): boolean {
  const availabilityText = cleanText($('#availability span').first()) || ''
  if (/currently unavailable|out of stock|unavailable/i.test(availabilityText)) return true

  const hasAddToCart = $('#add-to-cart-button, #buy-now-button').length > 0
  const hasAnyBuyboxContainer = BUYBOX_PRICE_CONTAINERS.some((sel) => $(sel).length > 0)

  return !hasAddToCart && !hasAnyBuyboxContainer
}

export function extractAmazonPriceRaw($: CheerioAPI): string | null {
  for (const containerSel of BUYBOX_PRICE_CONTAINERS) {
    const text = cleanText($(containerSel).find('span.a-price span.a-offscreen').first())
    if (text) return text
  }
  const oldStyle = cleanText($('#priceblock_ourprice').first()) || cleanText($('#priceblock_dealprice').first())
  if (oldStyle) return oldStyle

  // Deliberately NOT falling back to an unscoped `span.a-price
  // span.a-offscreen` or `.a-price-whole` here — see comment above
  // hasBuyingOptionsGridLayout for why an unscoped fallback is unsafe on
  // comparison-grid listings.
  return null
}

export function extractAmazonMrpRaw($: CheerioAPI): string | null {
  for (const containerSel of BUYBOX_PRICE_CONTAINERS) {
    const text = cleanText($(containerSel).find('span.a-price.a-text-price span.a-offscreen').first())
    if (text) return text
  }
  return null
}

// ---------- Selected-swatch inline price teaser ----------
//
// Some listings render NO unified buybox at all, but a small price teaser
// — "1 option from $23.86" — still shows up somewhere near the variant
// selector. Confirmed live in two different DOM shapes:
//
//   Case 1 — per-tile twister: each <li class="inline-twister-swatch"> is
//   one color tile, price teaser lives INSIDE the tile flagged selected
//   (data-initiallyselected="true", or aria-checked="true" on its radio).
//
//   Case 2 — standalone dimension-slot element: no per-tile <li> wrapper.
//   A single, page-unique element (id="_price", classes including
//   twister_swatch_price / inline-twister-swatch-price) inside a
//   "dimension-slot-info-N" block. Because it's singular on the page, it
//   already reflects the current selection — same safety property as
//   case 1, just without a tile wrapper to filter by.
//
// Both cases explicitly resolve to the ONE element tied to the current
// selection before reading price, so there's no DOM-order ambiguity like
// the old unscoped `.a-price` fallback had.
export function extractAmazonSelectedSwatchPriceInfo(
  $: CheerioAPI
): { raw: string; optionCount: number } | null {
  let $priceEl = $()

  let $swatch = $('li.inline-twister-swatch[data-initiallyselected="true"]').first()
  if (!$swatch.length) {
    $swatch = $('li.inline-twister-swatch')
      .filter((_, el) => $(el).find('input.a-button-input[aria-checked="true"]').length > 0)
      .first()
  }
  if ($swatch.length) {
    $priceEl = $swatch
      .find('.inline-twister-swatch-price .olpWrapper, .twister_swatch_price .olpWrapper')
      .first()
  }

  if (!$priceEl.length) {
    $priceEl = $(
      '#_price .olpWrapper, .dimension-slot-info .twister_swatch_price .olpWrapper, .dimension-slot-info .inline-twister-swatch-price .olpWrapper'
    ).first()
  }

  const text = cleanText($priceEl)
  if (!text) return null

  const countMatch = text.match(/(\d+)\s+options?/i)
  const optionCount = countMatch ? parseInt(countMatch[1], 10) : 1
  return { raw: text, optionCount }
}

function stripOptionCountPrefix(raw: string): string {
  const m = raw.match(/from\s+(.+)$/i)
  return m ? m[1].trim() : raw
}

// ---------- Images ----------

export function extractAmazonImages($: CheerioAPI): string[] {
  const images = new Set<string>()
  $('#altImages img').each((_, el) => {
    const src = $(el).attr('src')
    if (src) images.add(src.replace(/\._[A-Z0-9,_]+_\./, '.'))
  })
  const landing = $('#landingImage')
  const oldHires = landing.attr('data-old-hires')
  if (oldHires) images.add(oldHires)
  const dynImgAttr = landing.attr('data-a-dynamic-image')
  if (dynImgAttr) {
    try {
      const dynImg = JSON.parse(dynImgAttr)
      Object.keys(dynImg).forEach((src) => images.add(src))
    } catch {
      // ignore malformed attribute
    }
  }
  const mainImg = landing.attr('src')
  if (mainImg) images.add(mainImg)
  return [...images]
}

// ---------- Rating / reviews / availability / seller ----------

export function extractAmazonRating($: CheerioAPI): string | null {
  const ratingText = cleanText($('span.a-icon-alt').first())
  return ratingText ? ratingText.split(' out')[0] : null
}

export function extractAmazonReviewCount($: CheerioAPI): string | null {
  return cleanText($('#acrCustomerReviewText').first())
}

export function extractAmazonAvailability($: CheerioAPI): string | null {
  return cleanText($('#availability span').first())
}

export function extractAmazonSeller($: CheerioAPI): string | null {
  return cleanText($('#sellerProfileTriggerId').first()) || cleanText($('#merchant-info').first())
}

// ---------- Selected variant (Size/Color/etc) ----------

export function extractAmazonOptions($: CheerioAPI): Record<string, string> | null {
  const options: Record<string, string> = {}
  $('[id^="inline-twister-dim-title-"]').each((_, el) => {
    const $el = $(el)
    const label = cleanText($el.find('span.a-color-secondary').first())
    const value = cleanText($el.find('[id^="inline-twister-expanded-dimension-text-"]').first())
    if (label && value) {
      options[label.replace(/:\s*$/, '').trim()] = value
    }
  })
  return Object.keys(options).length ? options : null
}

// ---------- Size chart ----------
//
// Real markup (see conversation — captured from an actual "Size Chart"
// popover): `.fit-sizechartv2-tables-wrapper` contains one or more
// `div[id^="fit-sizechartv2-N"]` blocks, each with an optional `<h5>`
// title (e.g. "US MEN SWEATSHIRT") and a `<table>` whose first row is
// all `<th>` column headers (Brand Size / Chest (in) / Waist (in) /
// Hip (in)) and every subsequent row pairs a `<th>` row label with
// `<td>` measurement cells.
//
// NOT scoped to a specific `#a-popover-N` id — that id is autogenerated
// per page load and isn't stable — the `.fit-sizechartv2-tables-wrapper`
// class is the actual stable anchor.
//
// IMPORTANT CAVEAT: this only returns data if the popover's markup is
// already present in the fetched HTML. On some Amazon page variants
// this content may only be injected into the DOM after the "Size
// Chart" link is clicked (a client-side/lazy render), in which case a
// plain fetchDirect()/non-rendered ScraperAPI fetch will never see it
// and this correctly returns null — that is NOT the same as "no size
// chart exists for this product," just "not present in the HTML this
// tier fetched." A needVariants-style render tier would be the way to
// confirm one way or the other if this comes back null on a listing
// you can see has a chart when browsing normally.
//
// Deliberately returns null (not a fabricated/generic chart) when no
// real table is found — see conversation: a previous version filled
// this gap with a hardcoded S–XXL chest/length chart shown on every
// single product regardless of category, which was actively wrong
// (e.g. shown on kitchen items with no size dimension at all).
export type AmazonSizeChartRow = Record<string, string>

export type AmazonSizeChartTable = {
  title: string | null
  columns: string[]
  rows: AmazonSizeChartRow[]
}

export function extractAmazonSizeChart($: CheerioAPI): AmazonSizeChartTable[] | null {
  const tables: AmazonSizeChartTable[] = []

  $('.fit-sizechartv2-tables-wrapper > div[id^="fit-sizechartv2-"]').each((_, wrapperEl) => {
    const $wrapper = $(wrapperEl)
    const title = cleanText($wrapper.find('h5').first()) || null

    $wrapper.find('table').each((_, tableEl) => {
      const $table = $(tableEl)
      const $rows = $table.find('tr')
      if (!$rows.length) return

      const $headerRow = $rows.first()
      const columns: string[] = []
      $headerRow.find('th').each((_, th) => {
        columns.push(cleanText($(th)) || '')
      })
      if (!columns.length) return

      const rows: AmazonSizeChartRow[] = []
      $rows.slice(1).each((_, tr) => {
        const $tr = $(tr)
        const cells: string[] = []
        $tr.find('th, td').each((_, cell) => {
          cells.push(cleanText($(cell)) || '')
        })
        if (!cells.length) return

        const row: AmazonSizeChartRow = {}
        columns.forEach((col, i) => {
          row[col] = cells[i] ?? ''
        })
        rows.push(row)
      })

      if (rows.length) tables.push({ title, columns, rows })
    })
  })

  return tables.length ? tables : null
}

// ---------- All variants (for a full swatch/size picker in the UI) ----------
//
// Unlike extractAmazonOptions (which only reports the CURRENTLY selected
// value), this walks EVERY tile in Amazon's variation dimensions (color,
// size, style, ...) and returns each one's label, price (if that tile
// shows one), thumbnail, and the URL to that specific variant's own
// listing page — enough to render an Amazon-style clickable swatch grid.
//
// Price parsing reuses detectCurrencyAndClean so each option gets the same
// inline-ISO-code-wins-over-domain-hint treatment as the main price field
// (see shared.ts) — a tile showing "LKR3,594.33" is correctly read as LKR,
// not converted a second time as if it were USD.
//
// BEST-EFFORT / markup-dependent, same caveat as every other Amazon
// selector in this file — verify against a live page before leaning on it
// for anything beyond a UI nicety. `data-dp-url` is the attribute observed
// on live swatch tiles for the variant's link; a plain `<a href>` inside
// the tile is checked as a fallback since Amazon's template varies.
//
// REWRITE NOTE (see conversation — the "Size missing / merged into
// Color" bug): a real captured page showed Amazon reuses the EXACT same
// `<li class="inline-twister-swatch">` wrapper for BOTH the color
// swatches AND the plain-text size buttons — it is not an
// image-swatches-only class the way the original version here assumed.
// Querying `li.inline-twister-swatch` globally returned all 21 tiles
// (15 colors + 6 sizes) and dumped every one of them into a single
// dimension called "Color", while the separate
// `[id^="variation_size_name"]` container this file also checked for
// never matched at all (that's a different, older Amazon template this
// page doesn't use) — so Size silently never appeared as its own
// dimension.
//
// Fix: the real captured data itself gives a reliable, already-present
// split — every color tile carries a thumbnail `<img>`; every size tile
// has none. Partitioning swatch tiles on "has an image" is far more
// robust here than guessing at a specific container id we can't verify
// against a live page. The dimension label for the non-color group is
// read from whichever `inline-twister-dim-title-*` element's text does
// NOT say "Color" (falling back to the literal string "Size" if no
// second title element is found at all).
export type AmazonVariantOption = {
  label: string
  price: string | null
  currencyCode: string | null
  image: string | null
  url: string | null
  selected: boolean
  // Present when the tile itself is flagged unavailable (e.g. Flipkart's
  // "Out Of Stock" overlay badge on a swatch image). Undefined/false for
  // every site that doesn't detect this per-tile — Amazon's own variant
  // extractor never sets this.
  outOfStock?: boolean
}

export type AmazonVariantDimension = {
  dimension: string
  options: AmazonVariantOption[]
}

function resolveAmazonUrl(href: string | undefined | null, pageUrl: string): string | null {
  if (!href) return null
  try {
    return new URL(href, pageUrl).toString()
  } catch {
    return null
  }
}

// Reads every "<label>:" heading Amazon renders above a variation
// dimension (e.g. "Color:", "Size:") so the non-color swatch group below
// can be labeled correctly instead of hardcoding "Size" for every page
// (some listings use "Style" or "Pattern" instead).
function collectDimensionTitleLabels($: CheerioAPI): string[] {
  const labels: string[] = []
  $('[id^="inline-twister-dim-title-"]').each((_, el) => {
    const rawLabel = cleanText($(el).find('span.a-color-secondary').first())
    const label = rawLabel ? rawLabel.replace(/:\s*$/, '').trim() : null
    if (label) labels.push(label)
  })
  return labels
}

export function extractAmazonAllVariants($: CheerioAPI, pageUrl: string): AmazonVariantDimension[] {
  const domainHint = domainCurrency(pageUrl)
  const dimensions: AmazonVariantDimension[] = []

  const $swatchTiles = $('li.inline-twister-swatch')
  if ($swatchTiles.length) {
    const colorOptions: AmazonVariantOption[] = []
    const otherOptions: AmazonVariantOption[] = []

    $swatchTiles.each((_, el) => {
      const $tile = $(el)
      const imgSrc = $tile.find('img').attr('src') || null
      const label =
        $tile.find('img').attr('alt') ||
        cleanText($tile.find('.swatch-title-text-display, .swatch-title-text, .a-size-base, .a-button-text')) ||
        cleanText($tile) ||
        null
      if (!label) return // can't render an unlabeled swatch meaningfully

      const priceRaw = cleanText(
        $tile.find('.inline-twister-swatch-price .olpWrapper, .twister_swatch_price .olpWrapper').first()
      )
      const { amount, code } = priceRaw ? detectCurrencyAndClean(priceRaw, domainHint) : { amount: null, code: null }

      const href = $tile.attr('data-dp-url') || $tile.find('a').attr('href') || null
      const selected =
        $tile.attr('data-initiallyselected') === 'true' ||
        $tile.find('input.a-button-input[aria-checked="true"]').length > 0

      const option: AmazonVariantOption = {
        label,
        price: amount,
        currencyCode: code,
        image: imgSrc,
        url: resolveAmazonUrl(href, pageUrl),
        selected,
      }

      // The split that actually matters: color tiles have a thumbnail,
      // size/style tiles don't (confirmed against the real captured
      // page's data — 15/15 colors had an image URL, 6/6 sizes had
      // `image: null`).
      if (imgSrc) colorOptions.push(option)
      else otherOptions.push(option)
    })

    if (colorOptions.length) dimensions.push({ dimension: 'Color', options: colorOptions })

    if (otherOptions.length) {
      const titleLabels = collectDimensionTitleLabels($)
      const nonColorLabel = titleLabels.find((l) => !/colou?r/i.test(l)) || 'Size'
      dimensions.push({ dimension: nonColorLabel, options: otherOptions })
    }
  }

  // Fallback for the older variation_size_name/variation_style_name
  // container shape, only used if the pass above found no non-color
  // group at all — avoids double-adding a Size dimension when the
  // image-based split above already produced one.
  if (!dimensions.some((d) => /size|style/i.test(d.dimension))) {
    $('[id^="variation_size_name"], [id^="variation_style_name"]').each((_, container) => {
      const $container = $(container)
      const dimLabel = cleanText($container.prevAll('.a-form-label, .a-section').first()) || 'Size'
      const options: AmazonVariantOption[] = []
      $container.find('li').each((_, el) => {
        const $tile = $(el)
        const label = cleanText($tile.find('.a-size-base, .a-button-text').first()) || cleanText($tile)
        if (!label) return
        const href = $tile.attr('data-dp-url') || $tile.find('a').attr('href') || null
        const selected =
          $tile.attr('data-initiallyselected') === 'true' ||
          $tile.find('input.a-button-input[aria-checked="true"]').length > 0
        options.push({ label, price: null, currencyCode: null, image: null, url: resolveAmazonUrl(href, pageUrl), selected })
      })
      if (options.length) dimensions.push({ dimension: dimLabel, options })
    })
  }

  return dimensions
}

// ---------- Composed parser ----------

export function parseAmazon($: CheerioAPI, url: string) {
  const domainHint = domainCurrency(url)

  const priceRaw = extractAmazonPriceRaw($)
  let { amount, code } = detectCurrencyAndClean(priceRaw, domainHint)

  const mrpRaw = extractAmazonMrpRaw($)
  const { amount: mrpAmount } = detectCurrencyAndClean(mrpRaw, domainHint)

  const result: Record<string, any> = {
    title: extractAmazonTitle($),
    price: amount,
    mrp: mrpAmount,
    currencyCode: code,
    rating: extractAmazonRating($),
    review_count: extractAmazonReviewCount($),
    availability: extractAmazonAvailability($),
    seller: extractAmazonSeller($),
    images: extractAmazonImages($),
  }

  // Real per-listing size chart, if the page's HTML actually contains
  // one — see extractAmazonSizeChart() comment for the markup shape and
  // the lazy-render caveat. Left unset (not a fake fallback) when
  // absent so the UI can correctly hide the "Size Chart" affordance
  // entirely rather than showing made-up numbers.
  const sizeChart = extractAmazonSizeChart($)
  if (sizeChart) result.sizeChart = sizeChart

  // No unified buybox price found yet. Try the selected-swatch inline
  // price teaser before falling through to JSON-LD/OG/embedded-state.
  if (amount == null) {
    const swatchInfo = extractAmazonSelectedSwatchPriceInfo($)
    if (swatchInfo) {
      const swatchPriceRaw = stripOptionCountPrefix(swatchInfo.raw)
      const swatchParsed = detectCurrencyAndClean(swatchPriceRaw, domainHint)
      if (swatchParsed.amount != null) {
        amount = swatchParsed.amount
        code = code ?? swatchParsed.code
        result.price = amount
        if (!result.currencyCode) result.currencyCode = code
        result._amazonGridWarning =
          swatchInfo.optionCount > 1
            ? `Price was read from the selected variant's "${swatchInfo.optionCount} options from ..." teaser (no unified buybox on this listing) — this is the cheapest of ${swatchInfo.optionCount} offers for this variant, not necessarily a single fixed price, so treat it as a starting price and double-check before relying on it.`
            : 'Price was read from the selected variant\'s inline price teaser (no unified buybox on this listing) rather than a standard buybox element — double-check it if precision matters.'
      }
    }
  }

  // Flag (not fail) a still-missing buybox price. Three distinct cases,
  // checked in order of specificity:
  //   1. "See All Buying Options" comparison grid.
  //   2. Genuinely unsellable ASIN (isAmazonUnavailable) — not a scraper
  //      bug, the page has nothing to sell.
  //   3. Everything else — likely genuine selector drift, worth checking
  //      manually.
  if (amount == null) {
    if (hasBuyingOptionsGridLayout($)) {
      result._amazonGridWarning =
        'This listing appears to use Amazon\'s "See All Buying Options" comparison-grid layout with no single buybox price — price/mrp were intentionally left blank here rather than risk grabbing the wrong variant\'s tile; falling back to JSON-LD/OG/embedded data instead.'
    } else if (isAmazonUnavailable($)) {
      result._amazonGridWarning =
        'This ASIN appears to have no live, purchasable offer — no add-to-cart/buy-now button and no buybox container rendered anywhere on the page. This commonly means a retired or out-of-stock child variant while the parent product listing still displays normally. This is not a scraper error — try a different ASIN/URL for this product.'
      result.availability = result.availability || 'Unavailable'
      result._amazonUnavailable = true
    } else {
      result._amazonGridWarning =
        'No buybox price found in any known container (#corePriceDisplay_desktop_feature_div, #corePrice_feature_div, #apex_desktop, #unifiedPrice_feature_div, or the old priceblock ids), no selected-variant price teaser found either, and this does not look like the "See All Buying Options" grid layout or an unavailable listing — likely a selector drift on Amazon\'s side; falling back to JSON-LD/OG/embedded data, but this page is worth checking manually.'
    }
  }

  const variants = extractAmazonAllVariants($, url)
  if (variants.length) {
    result.variants = variants
  }

  return result
}