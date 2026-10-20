// lib/quote-links.ts
//
// ?price-breakdown on a product page sends people to the quote calculator
// (components/quote/QuoteCalculator.tsx), for the exact variant chosen:
//
//   staff         → /admin/quote, pre-filled with the seller's price,
//                   currency, weight and store type: the full calculator.
//   shoppers      → /demo/quote?product=<store>/<handle>&variant=<id>: the
//                   calculator's customer mode. Only a product reference
//                   travels in the URL; the shopper-safe numbers are
//                   computed on the server by buildCustomerQuote below, so
//                   the seller's own price never reaches the browser.
//   marketplace   → the full calculator for everyone: those are link-based
//   (link-based)    products, the shopper already knows the source price.

import 'server-only'
import type { StoreProduct, StoreProductVariant } from '@/lib/store.types'
import type { PricingSettings } from '@/lib/pricing-settings'
import type { CustomerQuote, CustomerQuoteOption } from '@/components/quote/QuoteCalculator'
import { getDualDeliveryPricing, isFixedPriceItem, isLocalItem, type DeliveryPriceOption } from '@/lib/pricing'
import { variantFor } from '@/lib/product-selection'
import { isEconomyLocked } from '@/lib/feature-flags'

type Query = Record<string, string | string[] | undefined>

function first(q: Query, key: string): string | undefined {
  const v = q[key]
  return Array.isArray(v) ? v[0] : v
}

/** The variant a breakdown link asks for: ?variant=<id>, else ?size= / ?color=. */
export function variantFromQuery(product: StoreProduct, q: Query): StoreProductVariant | null {
  const id = first(q, 'variant')
  if (id) {
    const byId = product.variants?.find((v) => v.id === id)
    if (byId) return byId
  }
  const size = first(q, 'size')
  const color = first(q, 'color')
  return variantFor(product, { ...(size ? { Size: size } : {}), ...(color ? { Color: color } : {}) })
}

/** The product as priced for one variant: its own price / was-price win. */
function pricedFor(product: StoreProduct, variant: StoreProductVariant | null): StoreProduct {
  if (!variant || !(variant.price > 0)) return product
  const compareAt = variant.compareAtPrice != null && variant.compareAtPrice > variant.price ? variant.compareAtPrice : undefined
  return { ...product, price: variant.price, compareAtPrice: compareAt, onSale: compareAt != null }
}

function variantLabel(variant: StoreProductVariant | null): string | null {
  if (!variant) return null
  return variant.options.filter(Boolean).join(' / ') || variant.title || null
}

export function productPagePath(platform: string, handle: string, variant: StoreProductVariant | null): string {
  const base = `/stores/${platform}/product/${encodeURIComponent(handle)}`
  return variant ? `${base}?variant=${encodeURIComponent(variant.id)}` : base
}

/** Full calculator, pre-filled. Uses the params the calculator already reads. */
export function fullQuoteHref(
  base: '/admin/quote' | '/demo/quote',
  product: StoreProduct,
  variant: StoreProductVariant | null,
  settings: PricingSettings,
): string {
  const p = pricedFor(product, variant)
  const params = new URLSearchParams({
    mode: 'simple',
    delivery: isEconomyLocked(settings) ? 'express' : 'economy',
    pcs: '1',
    value: String(p.price),
    currency: (p.currency || 'INR').toUpperCase(),
  })
  if (p.weightKg != null) params.set('weight', String(p.weightKg))
  if (p.origin === 'LK') params.set('origin', 'LK')
  if (p.marginIncluded) params.set('margin', 'included')
  const label = [product.name, variantLabel(variant)].filter(Boolean).join(' · ')
  if (label) params.set('label', label)
  return `${base}?${params.toString()}`
}

/** The calculator's customer mode for one product + variant. */
export function customerQuoteHref(platform: string, handle: string, variant: StoreProductVariant | null): string {
  const params = new URLSearchParams({ product: `${platform}/${handle}` })
  if (variant) params.set('variant', variant.id)
  return `/demo/quote?${params.toString()}`
}

function toOption(id: CustomerQuoteOption['id'], label: string, o: DeliveryPriceOption, unavailable?: boolean): CustomerQuoteOption {
  return {
    id,
    label,
    unavailable,
    price: o.priceLKR,
    compareAt: o.compareAtPriceLKR,
    discountPercent: o.discountPercent,
    serviceCharge: o.serviceChargeLKR,
    delivery: o.deliveryFeeLKR,
    total: o.actualTotalLKR,
  }
}

/**
 * Shopper-safe numbers for the calculator's customer mode. Straight from
 * getDualDeliveryPricing — the same numbers the product page and cart
 * show — and nothing else: no source price, rate, profit or freight.
 */
export function buildCustomerQuote(
  product: StoreProduct,
  variant: StoreProductVariant | null,
  store: { name: string; platform: string },
  settings: PricingSettings,
  fullCalculatorHref: string | null,
): CustomerQuote {
  const priced = pricedFor(product, variant)
  const dual = getDualDeliveryPricing(priced, settings)
  const single = isFixedPriceItem(priced) || isLocalItem(priced)

  const options: CustomerQuoteOption[] = single
    ? [toOption('single', 'Delivery to your door', dual.express)]
    : [
        toOption('express', 'Express delivery', dual.express),
        toOption('economy', 'Economy delivery', dual.economy, isEconomyLocked(settings)),
      ]

  return {
    productName: product.name,
    variantLabel: variantLabel(variant),
    image: variant?.fullImage ?? variant?.image ?? product.images?.[0] ?? product.image ?? null,
    storeName: store.name,
    productPath: productPagePath(store.platform, product.handle || product.id, variant),
    options,
    pickupFeeLKR: isLocalItem(priced) ? settings.local.pickupFeeLKR : null,
    fullCalculatorHref,
  }
}
