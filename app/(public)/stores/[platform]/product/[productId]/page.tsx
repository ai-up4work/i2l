import { cache } from 'react'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { fetchAffiliatedStore } from '@/lib/supabase/affiliated-stores'
import { fetchStoreProduct } from '@/lib/store-providers/product'
import { getDualDeliveryPricing } from '@/lib/pricing'
import ProductPurchasePanel from '@/components/stores/ProductPurchasePanel'
import ProductRequestOverlay from '@/components/stores/ProductRequestOverlay'
import ShareButton from '@/components/stores/ShareButton'
import ProductInfoTabs from '@/components/stores/ProductInfoTabs'
import { DashboardProvider } from '@/contexts/DashboardContext'
import ViewTracker from './ViewTracker'
import JsonLd, { breadcrumbSchema, productSchema } from '@/components/seo/JsonLd'
import { clampDescription, pageMetadata } from '@/lib/seo'
import type { StoreProduct } from '@/lib/store.types'

// No generateStaticParams: live-feed stores (Shopify/WooCommerce) can add
// or remove products at any time, so every product handle can't be known
// at build time the way mockProducts' fixed IDs could. This route renders
// on demand instead — fetchStoreProduct() below hits the live upstream (or
// mockProducts, for stores still on the mock provider) per request.
//
// loading.tsx sits alongside this file and is shown automatically by
// Next.js while fetchStoreProduct() is in flight.
//
// Option-availability logic (optionAvailability, colorImageMap) and the
// SizeAndColorPicker itself now live in lib/product-options.ts and
// components/stores/SizeAndColorPicker.tsx respectively, since the picker
// needs to be interactive (clickable, tracks a selection) inside
// ProductActions, but is also rendered here read-only for the marketplace
// "Request this item" flow, which has no cart to select a variant into.
//
// MARKETPLACE REQUEST FLOW: this page is wrapped in DashboardProvider so
// "Checkout" (ProductRequestButton) can open the SAME ItemInfoModal flow
// AddRequestOverlay uses elsewhere — pre-filled with this product's own
// URL instead of asking the shopper to paste one — without needing the
// /account layout or a login redirect first. ProductRequestOverlay renders
// that modal in place, reading from the same DashboardContext instance.
//
// HEADER HEIGHT: ItemInfoModal positions itself using the CSS var
// --account-header-h (see .item-overlay-bounds in ItemInfoModal.tsx),
// which AccountLayout sets from its own <Header>'s live-measured height.
// This page has no <AccountShell> ancestor, so that var is never set —
// without help, the modal falls back to ItemInfoModal's hardcoded
// HEADER_BAR_HEIGHT constant, which doesn't match this page's own sticky
// breadcrumb bar below (h-14 = 56px, hidden below `sm`). The wrapping div
// in the JSX below sets --account-header-h to 0px under `sm` and 3.5rem
// (56px) from `sm` up — matching the bar's own `hidden sm:block` — so
// ItemInfoModal sits flush under it, same as it does in the account
// layout. It's set on the outer wrapper (not lower) because
// ProductRequestOverlay is a sibling of the sticky-bar/content div, both
// under DashboardProvider — the var needs a common ancestor to reach both.
//
// CHECKOUT STATE: ProductRequestButton now accepts unavailable/loading/
// disabled the same way FlipkartCommerceActions' buttons do — passing
// unavailable={!product.inStock} here means a sold-out product's "Checkout"
// button visibly disables and swaps its label ("Not available")
// instead of silently doing nothing on click.
//
// SOLD OUT SIGNAL: shown in two places now, both understated —
//   1. On the gallery image itself (soft corner tag + slight desaturation).
//   2. Right above the variant picker (SizeAndColorPicker), since a
//      sold-out product's sizes are read-only/for-reference only in the
//      marketplace flow — a shopper landing straight on the size grid
//      needs to know before they pick one why nothing is selectable.
// Both use the same muted dot + text treatment (no solid-fill badge, no
// all-caps) so they read as calm status info, not an error banner. The
// disabled CTA (ProductActions / ProductRequestButton) is the third and
// final signal, at the point of action.
//
// DISPLAYED PRICE: product.price/compareAtPrice come straight from the
// upstream feed (Shopify/WooCommerce/marketplace), in the seller's own
// currency — that's just their sticker price, not what we'd actually
// quote a Sri Lankan shopper once freight/customs/postal and our markup
// are folded in. getDualDeliveryPricing() (lib/pricing.ts) runs the
// storefront's shared display-pricing logic — the Economy-locked and
// Express-locked catalog math from lib/quote.ts, plus each method's own
// discount-% calculation and the Express-over-Economy price delta — so
// this page can show the shopper a delivery-method comparison while
// still never disagreeing with the catalog grid or mini-cart (which
// continue to use the single-method getProductPricing/getDisplayPriceLKR
// helpers) on what either method actually costs.
//
// PRICING BLOCK STYLE: styled like a two-part shipping/customs slip —
// a ticket-stub perforation (two page-background-colored circles punched
// into the card's side edges) separates Economy from Express, instead of
// a plain hairline divider. Each option gets its own full-opacity accent
// color (teal for Economy, gold for Express) rather than graying Express
// down — low-opacity grey reads as a disabled control in most UI
// conventions, and both delivery methods here are equally real, just
// visually distinct by hue. The perforation notch color assumes the page
// background directly behind this card is `parchment` — if that
// background ever changes, update the notch spans' bg-parchment to
// match, or the seam will show instead of blending in.
//
// FULL DETAILS / DESCRIPTION / SPECS: previously handled inline via
// ExpandableDescription in the right-hand buy-box column. That's been
// replaced with ProductInfoTabs — a bottom-most, full-width tab strip
// (Description / Details / Shipping & Returns / Size chart), mirroring
// ShopifyProductView's ProductInfoTabs layout and position. Tabs are
// availability-driven: a tab only renders if the product actually has
// data backing it (no empty "we don't have this" placeholder tabs here),
// and the whole block renders null if nothing qualifies.
//
// RECENTLY VIEWED: ViewTracker is a client-only leaf (renders null) that
// calls useRecentlyViewed().markViewed() in an effect keyed on
// platform+productId. It has to live in a separate 'use client' file
// because this page itself is an async server component — server
// components can't call hooks directly. It's mounted unconditionally
// (marketplace and non-marketplace alike, in-stock and sold-out alike):
// recently-viewed reflects browsing, not purchasability, and a shopper
// landing on a marketplace/request-flow product has still "viewed" it in
// the same sense a catalogue shopper has. It's placed after the
// try/catch below returns early on a failed fetch, so a broken upstream
// load never gets recorded as a view.

// SEO: generateMetadata and the page need the same store + product. Without
// cache() each upstream (Shopify/WooCommerce/scraper) request ran twice per
// page view — once for <head>, once for the body.
const getStore = cache(fetchAffiliatedStore)
const getProduct = cache(fetchStoreProduct)

export async function generateMetadata({
  params,
}: {
  params: Promise<{ platform: string; productId: string }>
}) {
  const { platform, productId } = await params

  const store = await getStore(platform)
  if (!store) return { title: 'Product not found', robots: { index: false, follow: true } }

  try {
    const product = await getProduct(platform, productId)
    if (!product) return { title: 'Product not found', robots: { index: false, follow: true } }

    const description = product.description
      ? clampDescription(product.description)
      : `Buy ${product.name} from ${store.name} on WishDrop — quoted, purchased, quality-checked, and delivered to your door in Sri Lanka.`

    return pageMetadata({
      title: `${product.name} — ${store.name}`,
      description,
      // Canonical uses the route's own productId segment, which is the
      // handle the page was requested with.
      path: `/stores/${store.platform}/product/${productId}`,
      image: product.image || undefined,
      imageAlt: product.name,
    })
  } catch {
    return {}
  }
}

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ platform: string; productId: string }>
}) {
  const { platform, productId } = await params

  const store = await getStore(platform)
  if (!store) notFound()

  let product
  try {
    product = await getProduct(platform, productId)
  } catch (err) {
    // Upstream (Shopify/WooCommerce) request failed — show a soft error
    // instead of crashing the whole page into the nearest error boundary.
    console.error(`[product page] ${platform}/${productId}`, err)
    return (
      <div className="mx-auto max-w-6xl px-6 pb-16 pt-8 lg:px-10">
        <div className="mt-8 rounded-2xl border border-gold/40 bg-gold/10 p-6 text-center">
          <p className="text-sm font-semibold text-ink">Could not load this product</p>
          <p className="mt-1 text-xs text-ink/55">
            The store may be temporarily unavailable. Please try again shortly.
          </p>
        </div>
      </div>
    )
  }

  if (!product) notFound()

  // Marketplaces (eBay, Amazon, etc.) go through the request/proxy-buy
  // flow; local sellers with a live or mock catalog get the same
  // add-to-bag → WhatsApp flow as the store catalog page.
  const isMarketplace = store.storeType === 'marketplace'

  // Economy AND Express pricing, computed by the shared lib/pricing.ts
  // helper (same underlying lib/quote.ts math the catalog grid and
  // mini-cart use) so neither number shown here can ever drift from the
  // work-desk calculator.
  const dualPricing = getDualDeliveryPricing(product)

  const productPath = `/stores/${store.platform}/product/${productId}`

  return (
    <DashboardProvider>
      <JsonLd
        data={[
          productSchema({
            name: product.name,
            description: product.fullDescription || product.description,
            images: product.images?.length ? product.images : [product.image],
            path: productPath,
            sku: product.sku,
            brand: product.vendor || store.name,
            category: product.category,
            // The delivered Economy price is what this page shows first.
            priceLKR: dualPricing.economy.priceLKR,
            inStock: product.inStock,
            condition: product.condition,
            sellerName: store.name,
            averageRating: product.averageRating,
            reviewCount: product.reviewCount,
          }),
          breadcrumbSchema([
            { name: 'Home', path: '/' },
            { name: 'Stores', path: '/stores' },
            { name: store.name, path: `/stores/${store.platform}` },
            { name: product.name, path: productPath },
          ]),
        ]}
      />
      <ViewTracker
        platform={store.platform}
        productId={productId}
        product={product}
        formattedPrice={dualPricing.economy.formattedPrice}
        discountPercent={dualPricing.economy.discountPercent}
      />

      {/* Sets --account-header-h the same way AccountLayout does for its
          own <Header>, but as a plain CSS breakpoint match instead of a
          live JS measurement — this page's sticky bar below is `hidden
          sm:block` and `h-14` (56px), so the var is 0px under `sm` and
          3.5rem from `sm` up, matching the bar's own visibility exactly. */}
      <div className="[--account-header-h:0px] sm:[--account-header-h:3.5rem]">
        <div className="min-h-screen">
          {/* Sticky breadcrumb + share nav */}
          <div className="sticky top-0 z-30 hidden bg-parchment/80 backdrop-blur-md sm:block">
            <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-6 lg:px-10">
              <div className="flex min-w-0 items-center gap-2 text-xs text-ink/45">
                <Link href="/stores" className="shrink-0 font-medium transition-colors hover:text-ink">
                  Stores
                </Link>
                <ChevronRight size={11} className="shrink-0" />
                <Link href={`/stores/${store.platform}`} className="shrink-0 font-medium transition-colors hover:text-ink">
                  {store.name}
                </Link>
                <ChevronRight size={11} className="shrink-0" />
                <span className="max-w-[160px] truncate font-medium text-ink">{product.name}</span>
              </div>
              <ShareButton title={product.name} />
            </div>
          </div>

          {/* items-stretch + h-full on the info column keep the two sides
              matched in height, same fix as the old-money PDP: the buy-box
              column is bounded by the gallery's height rather than free to
              grow past it. ProductInfoTabs now sits below this grid instead
              of inside the column, so it's not subject to that height
              constraint — it's meant to grow full-width regardless of how
              tall the gallery is. */}
          <div className="mx-auto max-w-6xl px-6 pb-10 pt-8 lg:px-10">
            <div className="mt-4 grid gap-8 lg:grid-cols-2 items-stretch">
              <ProductPurchasePanel
                product={product}
                platform={store.platform}
                storeName={store.name}
                storeLogo={store.logo}
                isMarketplace={isMarketplace}
              />
            </div>

            {/* Description / Details / Shipping & Returns / Size chart —
                bottom-most, full-width tab strip, availability-driven
                (a tab only appears if the product has data backing it). */}
            <ProductInfoTabs product={product} />
          </div>
        </div>

        <ProductRequestOverlay />
      </div>
    </DashboardProvider>
  )
}