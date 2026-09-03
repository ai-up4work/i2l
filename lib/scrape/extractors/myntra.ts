// lib/scrape/extractors/myntra.ts

import type { CheerioAPI } from 'cheerio'

import { cleanText, detectCurrencyAndClean, domainCurrency } from '../shared'

export const SITE_ID = 'myntra' as const

export type MyntraVariantOption = {
  label: string
  price: string | null
  currencyCode: string | null
  image: string | null
  url: string | null
  selected: boolean
  outOfStock?: boolean
  stock?: number
}

export type MyntraVariantDimension = {
  dimension: string
  options: MyntraVariantOption[]
}

// A single row of the rendered size chart table, keyed by whatever
// column headers actually appeared on the page (e.g. "Size",
// "To Fit Waist", "Inseam Length" — these vary by category/articleType,
// so this is intentionally NOT a fixed schema). `Available` is added by
// the extractor itself (not a real column Myntra renders) to flag
// sold-out rows.
export type MyntraSizeChartRow = Record<string, string>

export type MyntraSizeChartTable = {
  columns: string[]
  rows: MyntraSizeChartRow[]
  imageUrl?: string | null
  note?: string | null
  unit?: 'in' | 'cm'
}

export const REQUIRES_RENDER_FOR_VARIANTS = false

// ============================================================
// Helpers
// ============================================================

function resolveMyntraImageUrl(src: string): string {
  return src
    .replace('($height)', '1400')
    .replace('($width)', '1080')
    .replace('($qualityPercentage)', '90')
    .replace('http://', 'https://')
}

// FIX (404-on-variant-click bug): the old version of this function turned
// ANY non-empty href into an absolute URL and handed it back as a real,
// clickable variant link — including `href="javascript:void(0)"`/`href="#"`
// placeholders (very common on the currently-selected swatch) and stray
// internal-use paths findColorCandidates's generic tree-walk can pick up
// from unrelated objects in pdpData. This now requires a real myntra.com
// host AND the actual Myntra product-page URL shape before returning
// anything — everything else resolves to `null`, which the UI already
// treats as "selectable, but visual-only" (see SizeRow's tooltip in
// MyntraProductView.tsx).
const MYNTRA_HOST_RE = /(^|\.)myntra\.com$/i

// Real Myntra product pages always end in /<numeric style id>/buy
// (optionally followed by a query string or fragment), e.g.
//   /van-heusen-men-navy-solid-shirt/12345678/buy?pos=3
const MYNTRA_PRODUCT_PATH_RE = /\/\d+\/buy(?:[/?#]|$)/i

// FIX (404-on-variant-click bug, round 2): some Myntra hrefs (recommendation
// widgets, color-swatch links) embed the SAME category/brand/name/id block
// TWICE before /buy. A canonical Myntra product URL is always exactly
//   /<category>/<brand>/<name>/<styleId>/buy  (3 slug segments then the id)
// Collapse to the first id + /buy before ever handing the URL back as
// opt.url. This is idempotent — an already-canonical URL matches and
// comes back unchanged.
const MYNTRA_LEADING_ID_BLOCK_RE = /^(\/[^/]+\/[^/]+\/[^/]+\/(\d+))\//

function normalizeMyntraProductPath(pathname: string): string {
  const match = pathname.match(MYNTRA_LEADING_ID_BLOCK_RE)
  return match ? `${match[1]}/buy` : pathname
}

function looksLikeRealMyntraProductUrl(u: URL): boolean {
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return false
  if (!MYNTRA_HOST_RE.test(u.hostname)) return false
  return MYNTRA_PRODUCT_PATH_RE.test(u.pathname)
}

function resolveMyntraUrl(href: string | undefined | null, pageUrl: string): string | null {
  if (!href) return null

  const trimmed = href.trim()
  if (!trimmed || trimmed === '#' || /^javascript:/i.test(trimmed)) return null

  try {
    const resolved = new URL(trimmed, pageUrl)
    if (!looksLikeRealMyntraProductUrl(resolved)) return null

    resolved.pathname = normalizeMyntraProductPath(resolved.pathname)
    return resolved.toString()
  } catch {
    return null
  }
}

// ============================================================
// window.__myx extraction
// ============================================================

function parseBalancedJson(text: string, startIdx: number): Record<string, any> | null {
  let depth = 0
  let inString = false
  let escapeNext = false

  for (let i = startIdx; i < text.length; i++) {
    const ch = text[i]

    if (inString) {
      if (escapeNext) { escapeNext = false; continue }
      if (ch === '\\') { escapeNext = true; continue }
      if (ch === '"') inString = false
      continue
    }

    if (ch === '"') { inString = true; continue }

    if (ch === '{') {
      depth++
    } else if (ch === '}') {
      depth--
      if (depth === 0) {
        const jsonStr = text.slice(startIdx, i + 1)
        try {
          return JSON.parse(jsonStr)
        } catch {
          return null
        }
      }
    }
  }

  return null
}

export function extractMyxState($: CheerioAPI): Record<string, any> | null {
  let result: Record<string, any> | null = null

  $('script').each((_, el) => {
    if (result) return

    const text = $(el).html()
    if (!text || !text.includes('window.__myx')) return

    const markerIdx = text.indexOf('window.__myx')
    const eqIdx = text.indexOf('=', markerIdx)
    if (eqIdx === -1) return

    const jsonStart = text.indexOf('{', eqIdx)
    if (jsonStart === -1) return

    const parsed = parseBalancedJson(text, jsonStart)
    if (parsed) result = parsed
  })

  return result
}

// ============================================================
// Brand / Name / Title
// ============================================================

export function extractMyntraBrand($: CheerioAPI): string | null {
  return cleanText($('h1.pdp-title')) || null
}

export function extractMyntraName($: CheerioAPI): string | null {
  return cleanText($('h1.pdp-name')) || null
}

export function extractMyntraTitle($: CheerioAPI): string | null {
  const brand = extractMyntraBrand($)
  const name = extractMyntraName($)
  return [brand, name].filter(Boolean).join(' ') || null
}

// ============================================================
// Price / MRP
// ============================================================

export function extractMyntraPriceRaw($: CheerioAPI): string | null {
  return cleanText($('span.pdp-price strong')) || cleanText($('span.pdp-discount-price')) || null
}

export function extractMyntraMrpRaw($: CheerioAPI): string | null {
  return cleanText($('span.pdp-mrp s')) || null
}

// ============================================================
// Images - DOM
// ============================================================

export function extractMyntraImages($: CheerioAPI): string[] {
  const images = new Set<string>()

  $('div.image-grid-image').each((_, el) => {
    const style = $(el).attr('style') || ''
    const match = style.match(/url\((['"]?)(.*?)\1\)/)
    if (match?.[2]) images.add(resolveMyntraImageUrl(match[2]))
  })

  $(
    ['div.image-grid-imageContainer img', 'div.image-grid-container img', '.image-grid-image img'].join(', ')
  ).each((_, el) => {
    const src = $(el).attr('src') || $(el).attr('data-src') || $(el).attr('data-original')
    if (src) images.add(resolveMyntraImageUrl(src))
  })

  return [...images]
}

// ============================================================
// Images - pdpData
// ============================================================

function extractImagesFromPdpData(pdpData: Record<string, any>): string[] {
  const images = new Set<string>()
  const albums = pdpData?.media?.albums
  if (!Array.isArray(albums)) return []

  for (const album of albums) {
    const imgs = album?.images
    if (!Array.isArray(imgs)) continue

    for (const img of imgs) {
      const src = img?.src || img?.secureUrl || img?.url
      if (src) images.add(resolveMyntraImageUrl(src))
    }
  }

  return [...images]
}

// ============================================================
// Rating / Reviews / Seller
// ============================================================

export function extractMyntraRating($: CheerioAPI): string | null {
  return cleanText($('div.index-overallRating div').first()) || null
}

export function extractMyntraReviewCount($: CheerioAPI): string | null {
  return cleanText($('div.index-ratingsCount').first()) || null
}

export function extractMyntraSeller($: CheerioAPI): string | null {
  return cleanText($('span.supplier-productSellerName').first()) || null
}

// ============================================================
// Availability
// ============================================================

export function isMyntraUnavailable($: CheerioAPI): boolean {
  const hasAddToBag = $('div.pdp-add-to-bag, button.pdp-add-to-bag').length > 0
  if (hasAddToBag) return false

  const wholeProductSoldOutBanner = /^\s*(sold out|out of stock)\s*$/i.test(
    cleanText($('div.size-buttons-outof-stock-message').first()) || ''
  )

  const bodySaysOutOfStock = /this product is currently out of stock/i.test($('body').text())

  return wholeProductSoldOutBanner || bodySaysOutOfStock
}

// ============================================================
// Selected option
// ============================================================

export function extractMyntraOptions($: CheerioAPI): Record<string, string> | null {
  const $selectedSize = $('#sizeButtonsContainer button.size-buttons-size-button-selected').first()
  const sizeLabel = cleanText($selectedSize.find('p.size-buttons-unified-size').first())
  return sizeLabel ? { Size: sizeLabel } : null
}

// ============================================================
// COLOR EXTRACTION - DOM
// ============================================================

function extractMyntraColorsFromDom($: CheerioAPI, pageUrl: string): MyntraVariantOption[] {
  const options: MyntraVariantOption[] = []
  const seen = new Set<string>()

  function addOption(label: string, image: string | null, href: string | null, selected: boolean) {
    const normalized = label.trim().toLowerCase()
    if (!normalized || seen.has(normalized)) return
    seen.add(normalized)

    options.push({
      label: label.trim(),
      price: null,
      currencyCode: null,
      image: image ? resolveMyntraImageUrl(image) : null,
      url: resolveMyntraUrl(href, pageUrl),
      selected,
    })
  }

  // Current known Myntra color strip
  $('.colors-container a[title]').each((_, el) => {
    const $a = $(el)
    const label = $a.attr('title')?.trim()
    if (!label) return

    const image =
      $a.find('img.colors-image').attr('src') ||
      $a.find('img.colors-image').attr('data-src') ||
      $a.find('img').attr('src') ||
      null

    const href = $a.attr('href') || null
    const selected = $a.hasClass('selected') || $a.hasClass('active') || $a.attr('aria-selected') === 'true'

    addOption(label, image, href, selected)
  })

  // Generic color links (fallback)
  if (!options.length) {
    $('[class*="color"] a[title], [class*="Color"] a[title]').each((_, el) => {
      const $a = $(el)
      const label = $a.attr('title')?.trim()
      if (!label) return

      const image = $a.find('img').attr('src') || $a.find('img').attr('data-src') || null
      const href = $a.attr('href') || null
      const selected = $a.hasClass('selected') || $a.hasClass('active') || $a.attr('aria-selected') === 'true'

      addOption(label, image, href, selected)
    })
  }

  return options
}

// ============================================================
// COLOR EXTRACTION - embedded pdpData
// ============================================================

function looksLikeColorObject(value: Record<string, any>): boolean {
  if (!value || typeof value !== 'object') return false

  const lowerKeys = Object.keys(value).map((key) => key.toLowerCase())

  return (
    lowerKeys.some((key) => key.includes('color') || key.includes('colour')) ||
    (lowerKeys.includes('styleid') &&
      (lowerKeys.includes('image') || lowerKeys.includes('imageurl') || lowerKeys.includes('url')))
  )
}

function getString(obj: Record<string, any>, keys: string[]): string | null {
  for (const key of keys) {
    const value = obj?.[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
    if (typeof value === 'number') return String(value)
  }
  return null
}

function getImageFromObject(obj: Record<string, any>): string | null {
  const direct = getString(obj, ['image', 'imageUrl', 'imageURL', 'img', 'src', 'secureUrl', 'url'])
  if (direct) return direct

  const images = obj.images
  if (!Array.isArray(images)) return null

  for (const image of images) {
    if (typeof image === 'string' && image) return image
    if (image && typeof image === 'object') {
      const src = getString(image, ['src', 'secureUrl', 'url', 'image'])
      if (src) return src
    }
  }

  return null
}

function findColorCandidates(value: any, path = '', depth = 0): Record<string, any>[] {
  const results: Record<string, any>[] = []
  if (depth > 8 || value == null || typeof value !== 'object') return results

  if (Array.isArray(value)) {
    for (const item of value) results.push(...findColorCandidates(item, path, depth + 1))
    return results
  }

  if (looksLikeColorObject(value)) results.push(value)

  for (const [key, child] of Object.entries(value)) {
    const lowerKey = key.toLowerCase()
    const colorRelated =
      lowerKey.includes('color') || lowerKey.includes('colour') || lowerKey.includes('variant') ||
      lowerKey.includes('style') || lowerKey.includes('related')

    if (colorRelated || typeof child === 'object') {
      results.push(...findColorCandidates(child, path ? `${path}.${key}` : key, depth + 1))
    }
  }

  return results
}

function extractMyntraColorsFromPdpData(pdpData: Record<string, any>, pageUrl: string): MyntraVariantOption[] {
  const options: MyntraVariantOption[] = []
  const seen = new Set<string>()
  const candidates = findColorCandidates(pdpData)

  for (const candidate of candidates) {
    const label = getString(candidate, ['color', 'colour', 'colorName', 'colourName', 'baseColour', 'baseColor', 'label', 'name', 'title'])
    if (!label) continue

    // Avoid treating generic product names as colors.
    if (label.length > 100 || label.toLowerCase() === String(pdpData.name || '').trim().toLowerCase()) continue

    const normalized = label.toLowerCase()
    if (seen.has(normalized)) continue
    seen.add(normalized)

    const image = getImageFromObject(candidate)
    const href = getString(candidate, ['href', 'productUrl', 'landingPageUrl', 'url', 'link'])
    const selected = candidate.selected === true || candidate.isSelected === true || candidate.active === true
    const price = getString(candidate, ['discountedPrice', 'sellingPrice', 'price'])

    options.push({
      label,
      price,
      currencyCode: null,
      image: image ? resolveMyntraImageUrl(image) : null,
      url: resolveMyntraUrl(href, pageUrl),
      selected,
    })
  }

  return options
}

// ============================================================
// Combined color extraction
// ============================================================

function extractMyntraColorVariants(
  $: CheerioAPI,
  pageUrl: string,
  pdpData?: Record<string, any> | null
): MyntraVariantOption[] {
  if (pdpData) {
    const jsonColors = extractMyntraColorsFromPdpData(pdpData, pageUrl)
    if (jsonColors.length) return jsonColors
  }

  return extractMyntraColorsFromDom($, pageUrl)
}

// ============================================================
// SIZE - CSS fallback
// ============================================================

export function extractMyntraSizeVariants($: CheerioAPI): MyntraVariantOption[] {
  const options: MyntraVariantOption[] = []

  $('#sizeButtonsContainer .size-buttons-buttonContainer').each((_, el) => {
    const $container = $(el)
    const $button = $container.find('button').first()

    const label = cleanText($button.find('p.size-buttons-unified-size').first()) || cleanText($button)
    if (!label) return

    const outOfStock = $button.hasClass('size-buttons-size-button-disabled')
    const selected = $button.hasClass('size-buttons-size-button-selected')

    const inventoryText = cleanText($container.find('.size-buttons-inventory-left').first()) || ''
    const lowStockMatch = inventoryText.match(/(\d+)\s+left/i)
    const displayLabel = lowStockMatch ? `${label} (${lowStockMatch[1]} left)` : label

    options.push({ label: displayLabel, price: null, currencyCode: null, image: null, url: null, selected, outOfStock })
  })

  return options
}

// ============================================================
// SIZE - pdpData
// ============================================================

function summarizeSizeEntry(entry: Record<string, any>): {
  totalStock: number
  price: number | null
  mrp: number | null
  countryOfOrigin: string | null
  manufacturerInfo: string | null
} {
  const sellerRows = Array.isArray(entry.sizeSellerData) ? entry.sizeSellerData : []

  let totalStock = 0
  let price: number | null = null
  let mrp: number | null = null
  let countryOfOrigin: string | null = null
  let manufacturerInfo: string | null = null

  for (const row of sellerRows) {
    const stock = Number(row?.sellableInventoryCount ?? row?.availableCount ?? 0)
    if (Number.isFinite(stock)) totalStock += stock

    if (row?.discountedPrice != null) {
      const p = Number(row.discountedPrice)
      if (Number.isFinite(p) && (price == null || p < price)) price = p
    }

    if (row?.mrp != null && mrp == null) {
      const m = Number(row.mrp)
      if (Number.isFinite(m)) mrp = m
    }

    if (!countryOfOrigin && Array.isArray(row?.countryOfOrigin) && row.countryOfOrigin.length) {
      countryOfOrigin = String(row.countryOfOrigin[0])
    }

    if (!manufacturerInfo && row?.manufacturerInfo) {
      manufacturerInfo = String(row.manufacturerInfo)
    }
  }

  return { totalStock, price, mrp, countryOfOrigin, manufacturerInfo }
}

const LOW_STOCK_THRESHOLD = 10

function extractSizeVariantsFromPdpData(pdpData: Record<string, any>): MyntraVariantOption[] {
  const sizes = Array.isArray(pdpData.sizes) ? pdpData.sizes : []
  const options: MyntraVariantOption[] = []

  for (const entry of sizes) {
    const label = entry?.label
    if (!label) continue

    const { totalStock, price } = summarizeSizeEntry(entry)
    const outOfStock = entry.available === false || totalStock <= 0
    const isLowStock = !outOfStock && totalStock > 0 && totalStock <= LOW_STOCK_THRESHOLD
    const displayLabel = isLowStock ? `${label} (${totalStock} left)` : String(label)

    options.push({
      label: displayLabel,
      price: price != null ? String(price) : null,
      currencyCode: null,
      image: null,
      url: null,
      selected: false,
      outOfStock,
      stock: totalStock,
    })
  }

  return options
}

// ============================================================
// All variants
// ============================================================

export function extractMyntraAllVariants(
  $: CheerioAPI,
  pageUrl: string,
  pdpData?: Record<string, any> | null
): MyntraVariantDimension[] {
  const dimensions: MyntraVariantDimension[] = []

  const colors = extractMyntraColorVariants($, pageUrl, pdpData)
  if (colors.length) dimensions.push({ dimension: 'Color', options: colors })

  let sizes: MyntraVariantOption[] = pdpData ? extractSizeVariantsFromPdpData(pdpData) : []
  if (!sizes.length) sizes = extractMyntraSizeVariants($)
  if (sizes.length) dimensions.push({ dimension: 'Size', options: sizes })

  return dimensions
}

// ============================================================
// SIZE CHART - unit conversion helpers
// ============================================================
//
// Ported in from the size-chart-focused extractor. Needed because
// pdpData's measurements[] carry a raw numeric `value` + `unit` field
// separately from the pre-formatted `displayText`, and the real page
// itself offers an in/cm toggle built from that same raw value.

type UnitKind = 'in' | 'cm' | 'other'

function normalizeUnit(u?: string | null): UnitKind {
  if (!u) return 'other'
  const s = u.toLowerCase()
  if (s.startsWith('inch')) return 'in'
  if (s.startsWith('cm') || s.startsWith('centimet')) return 'cm'
  return 'other'
}

function convertMeasurement(value: number, from: UnitKind, to: UnitKind): number | null {
  if (from === to) return value
  if (from === 'in' && to === 'cm') return value * 2.54
  if (from === 'cm' && to === 'in') return value / 2.54
  return null
}

function formatMeasurement(value: number, unit: UnitKind): string {
  const rounded = Math.round(value * 10) / 10
  return unit === 'in' || unit === 'cm' ? `${rounded}${unit}` : String(rounded)
}

// ============================================================
// SIZE CHART - embedded pdpData (CONFIRMED — matched line-for-line
// against a real captured pdpData.sizes[] payload and a screenshot of
// the live rendered Size Chart modal: Raymond Men Checked Slim Fit
// Formal Trousers, styleId 20359014, including the selected-row radio
// and the greyed-out sold-out row)
// ============================================================
//
// This REPLACES the old speculative `findSizeChartCandidate`/
// `SIZE_CHART_KEY_RE` search (which never matched a real captured
// payload — that page's size chart wasn't embedded in pdpData at all
// via any "sizeChart"-shaped key). The real source is
// pdpData.sizes[].allSizesList (cross-size-system labels, e.g.
// Size/Brand Size/Waist) + pdpData.sizes[].measurements (numeric body
// measurements with their own unit).
//
// Column order is taken from the FIRST size entry and assumed
// consistent across every other entry — true in every captured sample.
// Values are keyed by name, not array index, so a row missing a
// particular column just gets a blank cell rather than the whole row
// misaligning.
//
// Returns TWO tables (native unit + converted opposite unit, e.g. in +
// cm) when every measurement column shares one recognized unit, so the
// UI can offer a toggle exactly like the real page's own "in | cm"
// pill. Returns just the native-unit table if units are mixed/
// unrecognized — never risks a silently-wrong conversion. Returns null
// (not an empty table) when pdpData.sizes[] entries carry no
// allSizesList/measurements at all.
function extractMyntraSizeChartsFromPdpData(pdpData: Record<string, any>): MyntraSizeChartTable[] | null {
  const sizes = Array.isArray(pdpData.sizes) ? pdpData.sizes : []
  if (!sizes.length) return null

  const first = sizes[0]
  const sizeLabelCols: string[] = Array.isArray(first?.allSizesList)
    ? first.allSizesList.map((s: any) => s?.size).filter(Boolean)
    : []
  const measurementDefs: { name: string; unit: UnitKind }[] = Array.isArray(first?.measurements)
    ? first.measurements.filter((m: any) => m?.name).map((m: any) => ({ name: m.name, unit: normalizeUnit(m.unit) }))
    : []

  const columns = [...sizeLabelCols, ...measurementDefs.map((m) => m.name)]
  if (!columns.length) return null

  const knownUnits = new Set(measurementDefs.map((m) => m.unit).filter((u) => u !== 'other'))
  const recognizedUnits = [...knownUnits].filter((u): u is 'in' | 'cm' => u === 'in' || u === 'cm')
  const nativeUnit: 'in' | 'cm' | null = recognizedUnits.length === 1 ? recognizedUnits[0] : null
  const altUnit: UnitKind | null = nativeUnit === 'in' ? 'cm' : nativeUnit === 'cm' ? 'in' : null

  function buildRows(targetUnit: UnitKind | null): MyntraSizeChartRow[] {
    return sizes.map((entry: any) => {
      const row: MyntraSizeChartRow = {}
      if (Array.isArray(entry.allSizesList)) {
        for (const s of entry.allSizesList) {
          if (s?.size) row[s.size] = String(s.sizeValue ?? '')
        }
      }
      if (Array.isArray(entry.measurements)) {
        for (const m of entry.measurements) {
          if (!m?.name) continue
          const mUnit = normalizeUnit(m.unit)
          const rawValue = Number(m.value)
          if (targetUnit && targetUnit !== mUnit && Number.isFinite(rawValue)) {
            const converted = convertMeasurement(rawValue, mUnit, targetUnit)
            row[m.name] =
              converted != null ? formatMeasurement(converted, targetUnit) : m.displayText ?? String(m.value ?? '')
          } else {
            row[m.name] = m.displayText ?? String(m.value ?? '')
          }
        }
      }
      // Sold-out sizes are still included as a row (matches the real
      // page's own greyed-out/struck row) rather than omitted.
      row['Available'] = entry.available === false ? 'false' : 'true'
      return row
    })
  }

  const tables: MyntraSizeChartTable[] = [
    { columns, rows: buildRows(nativeUnit), imageUrl: null, note: null, unit: nativeUnit ?? undefined },
  ]
  if (altUnit) {
    tables.push({ columns, rows: buildRows(altUnit), imageUrl: null, note: null, unit: altUnit as 'in' | 'cm' })
  }

  return tables
}

// ============================================================
// SIZE CHART - DOM (CONFIRMED against the same real captured page,
// styleId 20359014 — this REPLACES the old `.pdp-size-chart`/
// `.tableContainer` selector set, which was based on a different,
// separately-captured page (styleId 30063122) whose size chart loaded
// via a client-side XHR and wasn't present in that particular response)
// ============================================================
//
// div.sizeChartWeb-container
//   table.sizeChartWeb-tableNew
//     thead > tr.sizeChartWeb-newRow > th.sizeChartWeb-cell-title (+1
//       leading blank <th> for the radio column — skipped, it has no
//       .sizeChartWeb-cell-title class)
//     tbody > tr.sizeChartWeb-newRow (+ .sizeChartWeb-disabled if sold
//       out) > label (radio — skipped, not a <td>)
//               > td.sizeChartWeb-newCell (one per column, header order)
//   div.scaleAndUnits-unitText              (disclaimer text)
//   img.sizeChartWeb-image-size-chart       (how-to-measure diagram)
//
// Only the statically-rendered "in" values are read here — the cm
// toggle on the DOM path is a client-side conversion; the pdpData
// extractor above produces the real second table for that instead.
// Falls back to just the diagram image if no table is found, and
// returns null only if neither is present.
function extractMyntraSizeChartFromDom($: CheerioAPI): MyntraSizeChartTable[] | null {
  const imageSrc = $('img.sizeChartWeb-image-size-chart').attr('src') || null
  const imageUrl = imageSrc ? resolveMyntraImageUrl(imageSrc) : null
  const note = cleanText($('div.scaleAndUnits-unitText').first()) || null

  const $table = $('table.sizeChartWeb-tableNew').first()
  if (!$table.length) {
    return imageUrl ? [{ columns: [], rows: [], imageUrl, note }] : null
  }

  const columns: string[] = []
  $table.find('thead th.sizeChartWeb-cell-title').each((_, el) => {
    const label = cleanText($(el))
    if (label) columns.push(label)
  })

  if (!columns.length) {
    return imageUrl ? [{ columns: [], rows: [], imageUrl, note }] : null
  }

  const rows: MyntraSizeChartRow[] = []
  $table.find('tbody tr').each((_, tr) => {
    const $tr = $(tr)
    const cellTexts: string[] = []
    $tr.find('td.sizeChartWeb-newCell').each((_, td) => {
      cellTexts.push(cleanText($(td)) || '')
    })
    if (!cellTexts.length) return

    const row: MyntraSizeChartRow = {}
    columns.forEach((col, i) => {
      row[col] = cellTexts[i] ?? ''
    })
    row['Available'] = $tr.hasClass('sizeChartWeb-disabled') ? 'false' : 'true'
    rows.push(row)
  })

  if (!rows.length) {
    return imageUrl ? [{ columns: [], rows: [], imageUrl, note }] : null
  }

  return [{ columns, rows, imageUrl, note }]
}

// ============================================================
// Availability post-processing
// ============================================================

function applyUnavailableFlags(
  result: Record<string, any>,
  $: CheerioAPI,
  variants: MyntraVariantDimension[],
  pdpDataSaysAllZeroStock: boolean
) {
  if (isMyntraUnavailable($) || pdpDataSaysAllZeroStock) {
    result.availability = result.availability || 'Out of stock'
    result._myntraUnavailable = true
    result._myntraWarning =
      'No add-to-bag button was found (or every size shows zero stock in the embedded product state) — likely a genuinely unavailable product, not a scraper error.'
    return
  }

  const sizeDim = variants.find((d) => d.dimension === 'Size')

  if (sizeDim && sizeDim.options.length && sizeDim.options.every((o) => o.outOfStock)) {
    result._myntraWarning =
      'Every size tile found was flagged out of stock, though no whole-product sold-out banner was detected — double check this listing.'
  }
}

// ============================================================
// Build result from pdpData
// ============================================================

function buildResultFromPdpData(
  pdpData: Record<string, any>,
  $: CheerioAPI,
  url: string,
  domainHint: string | null,
  cheerioBasics: { brand: string | null; title: string | null; seller: string | null }
): Record<string, any> {
  const topPrice = pdpData.price && typeof pdpData.price === 'object' ? pdpData.price : {}

  let mrp: number | null = topPrice.mrp != null ? Number(topPrice.mrp) : null
  let selling: number | null =
    topPrice.discounted != null ? Number(topPrice.discounted) : topPrice.selling != null ? Number(topPrice.selling) : null

  // Fallback to first size seller.
  if (mrp == null || selling == null) {
    const firstSize = Array.isArray(pdpData.sizes) ? pdpData.sizes[0] : null
    const summary = firstSize ? summarizeSizeEntry(firstSize) : null

    if (summary) {
      if (mrp == null) mrp = summary.mrp
      if (selling == null) selling = summary.price
    }
  }

  const currencyCode = domainHint || 'INR'

  const variants = extractMyntraAllVariants($, url, pdpData)

  // Size chart: prefer pdpData (richer — carries the in/cm unit toggle,
  // and doesn't depend on DOM markup staying stable), falling back to
  // DOM only if pdpData has nothing usable. The "how to measure" diagram
  // + disclaimer note are DOM-only regardless, so they're merged into
  // whichever table set ends up being used.
  const domSizeChart = extractMyntraSizeChartFromDom($)
  const pdpSizeChart = extractMyntraSizeChartsFromPdpData(pdpData)
  const sizeChart = pdpSizeChart
    ? pdpSizeChart.map((t) => ({
        ...t,
        imageUrl: domSizeChart?.[0]?.imageUrl ?? null,
        note: domSizeChart?.[0]?.note ?? null,
      }))
    : domSizeChart

  const ratings = pdpData.ratings && typeof pdpData.ratings === 'object' ? pdpData.ratings : {}

  let countryOfOrigin: string | null = null
  let manufacturerInfo: string | null = null

  if (Array.isArray(pdpData.sizes)) {
    for (const entry of pdpData.sizes) {
      const s = summarizeSizeEntry(entry)
      if (s.countryOfOrigin) countryOfOrigin = s.countryOfOrigin
      if (s.manufacturerInfo) manufacturerInfo = s.manufacturerInfo
      if (countryOfOrigin && manufacturerInfo) break
    }
  }

  const brand =
    cheerioBasics.brand ||
    (typeof pdpData.brand === 'object' && pdpData.brand !== null ? pdpData.brand.name : pdpData.brand) ||
    null

  const jsonImages = extractImagesFromPdpData(pdpData)
  const images = jsonImages.length ? jsonImages : extractMyntraImages($)

  const result: Record<string, any> = {
    title: cheerioBasics.title || pdpData.name || null,
    brand,
    price: selling != null ? String(selling) : null,
    mrp: mrp != null ? String(mrp) : null,
    currencyCode,
    rating: ratings.averageRating != null ? String(ratings.averageRating) : null,
    review_count: ratings.totalCount != null ? String(ratings.totalCount) : null,
    availability: null,
    seller: cheerioBasics.seller,
    images,
    countryOfOrigin,
    manufacturer: manufacturerInfo,
    myntraStyleId: pdpData.id ?? pdpData.styleId ?? null,
  }

  const selected = extractMyntraOptions($)
  if (selected) result.options = selected

  if (variants.length) result.variants = variants
  if (sizeChart) result.sizeChart = sizeChart

  const pdpDataAllZeroStock =
    Array.isArray(pdpData.sizes) &&
    pdpData.sizes.length > 0 &&
    pdpData.sizes.every((entry: Record<string, any>) => summarizeSizeEntry(entry).totalStock <= 0)

  applyUnavailableFlags(result, $, variants, pdpDataAllZeroStock)

  return result
}

// ============================================================
// Build result from Cheerio fallback
// ============================================================

function buildResultFromCheerio(
  $: CheerioAPI,
  url: string,
  domainHint: string | null,
  cheerioBasics: { brand: string | null; title: string | null; seller: string | null }
): Record<string, any> {
  const priceRaw = extractMyntraPriceRaw($)
  const { amount, code } = detectCurrencyAndClean(priceRaw, domainHint)

  const mrpRaw = extractMyntraMrpRaw($)
  const { amount: mrpAmount } = detectCurrencyAndClean(mrpRaw, domainHint)

  const variants = extractMyntraAllVariants($, url, null)
  const sizeChart = extractMyntraSizeChartFromDom($)

  const result: Record<string, any> = {
    title: cheerioBasics.title,
    brand: cheerioBasics.brand,
    price: amount,
    mrp: mrpAmount,
    currencyCode: code,
    rating: extractMyntraRating($),
    review_count: extractMyntraReviewCount($),
    availability: null,
    seller: cheerioBasics.seller,
    images: extractMyntraImages($),
  }

  const options = extractMyntraOptions($)
  if (options) result.options = options

  if (variants.length) result.variants = variants
  if (sizeChart) result.sizeChart = sizeChart

  applyUnavailableFlags(result, $, variants, false)

  return result
}

// ============================================================
// Entry point
// ============================================================

export function parseMyntra($: CheerioAPI, url: string) {
  const domainHint = domainCurrency(url)

  const cheerioBasics = {
    brand: extractMyntraBrand($),
    title: extractMyntraTitle($),
    seller: extractMyntraSeller($),
  }

  const myx = extractMyxState($)
  const pdpData = myx && typeof myx.pdpData === 'object' ? (myx.pdpData as Record<string, any>) : null

  console.log('[Myntra] __myx:', !!myx)
  console.log('[Myntra] pdpData:', !!pdpData)

  if (pdpData) {
    const result = buildResultFromPdpData(pdpData, $, url, domainHint, cheerioBasics)

    const colorCount =
      result.variants?.find((v: MyntraVariantDimension) => v.dimension === 'Color')?.options?.length || 0

    console.log(`[Myntra] Colors found: ${colorCount}`)
    console.log('[Myntra] Size chart found:', !!result.sizeChart)
    if (result.sizeChart) {
      console.log(
        `[Myntra] Size chart tables: ${result.sizeChart.length}, first table rows: ${result.sizeChart[0].rows.length}, has image: ${!!result.sizeChart[0].imageUrl}`
      )
    }

    return result
  }

  console.log('[Myntra] Falling back to CSS selectors')
  return buildResultFromCheerio($, url, domainHint, cheerioBasics)
}

// ============================================================
// Consume Myntra metadata
// ============================================================

export function consumeMyntraMeta(parsed: Record<string, any>): { warning?: string; unavailable?: boolean } {
  const warning = parsed._myntraWarning as string | undefined
  const unavailable = parsed._myntraUnavailable as boolean | undefined

  delete parsed._myntraWarning
  delete parsed._myntraUnavailable

  return { warning, unavailable }
}