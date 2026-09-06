// app/(public)/stores/[platform]/product/[productId]/page.tsx
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, ChevronRight, ExternalLink, Package, Star, Weight, Zap } from 'lucide-react'
import { affiliatedStores } from '@/components/dashboard/data'
import { fetchStoreProduct } from '@/lib/store-providers/product'
import { getDualDeliveryPricing } from '@/lib/pricing'
import ProductActions from '@/components/stores/ProductActions'
import ProductGallery from '@/components/stores/ProductGallery'
import ProductRequestButton from '@/components/stores/ProductRequestButton'
import ProductRequestOverlay from '@/components/stores/ProductRequestOverlay'
import ShareButton from '@/components/stores/ShareButton'
import SizeAndColorPicker from '@/components/stores/SizeAndColorPicker'
import TagList from '@/components/stores/TagList'
import { DashboardProvider } from '@/contexts/DashboardContext'
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
// "Get Quote" (ProductRequestButton) can open the SAME ItemInfoModal flow
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
// GET QUOTE STATE: ProductRequestButton now accepts unavailable/loading/
// disabled the same way FlipkartCommerceActions' buttons do — passing
// unavailable={!product.inStock} here means a sold-out product's "Get
// Quote" button visibly disables and swaps its label ("Not available")
// instead of silently doing nothing on click.
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

/** Renders 1–5 filled/outline stars. Rounds to the nearest half-star visually via two overlaid glyphs is overkill here — whole-star rounding reads clearly at this size. */
function RatingStars({ rating, count }: { rating: number; count?: number }) {
  const rounded = Math.round(rating)
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="inline-flex items-center gap-0.5" aria-hidden="true">
        {Array.from({ length: 5 }).map((_, i) => (
          <Star
            key={i}
            size={13}
            className={i < rounded ? 'fill-gold-deep text-gold-deep' : 'fill-transparent text-ink/20'}
            strokeWidth={1.5}
          />
        ))}
      </span>
      <span className="text-xs font-semibold text-ink/60">
        {rating.toFixed(1)}
        {count != null && count > 0 && <span className="font-normal text-ink/40"> ({count})</span>}
      </span>
    </span>
  )
}

/** Small inline spec list — only renders the facts that actually came back from the upstream feed. Weight is deliberately not here; it gets its own shipping callout below since it matters for delivery cost/estimate, not just as trivia. */
function SpecRow({ product }: { product: StoreProduct }) {
  const specs: string[] = []
  if (product.vendor) specs.push(product.vendor)
  if (product.productType) specs.push(product.productType)
  if (product.sku) specs.push(`SKU ${product.sku}`)
  if (!specs.length) return null

  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-ink/45">
      {specs.map((s, i) => (
        <span key={s} className="inline-flex items-center gap-2.5">
          {i > 0 && <span className="text-ink/20">·</span>}
          {s}
        </span>
      ))}
    </div>
  )
}

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ platform: string; productId: string }>
}) {
  const { platform, productId } = await params

  const store = affiliatedStores.find((s) => s.platform === platform)
  if (!store) notFound()

  let product
  try {
    product = await fetchStoreProduct(platform, productId)
  } catch (err) {
    // Upstream (Shopify/WooCommerce) request failed — show a soft error
    // instead of crashing the whole page into the nearest error boundary.
    console.error(`[product page] ${platform}/${productId}`, err)
    return (
      <div className="mx-auto max-w-6xl px-6 pb-16 pt-8 lg:px-10">
        {/* <Link
          href={`/stores/${store.platform}`}
          className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-teal-deep transition-colors hover:text-teal"
        >
          <ArrowLeft size={14} /> Back to {store.name}
        </Link> */}
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

  // Only show a "Full details" expander when there's a genuinely longer
  // description distinct from the short one — not when the upstream feed
  // just duplicated the same text into both fields.
  const hasExtendedDescription =
    !!product.fullDescription && product.fullDescription.trim() !== product.description.trim()

  // Economy AND Express pricing, computed by the shared lib/pricing.ts
  // helper (same underlying lib/quote.ts math the catalog grid and
  // mini-cart use) so neither number shown here can ever drift from the
  // work-desk calculator.
  const dualPricing = getDualDeliveryPricing(product)

  return (
    <DashboardProvider>
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
              matched in height, same fix as the old-money PDP: description
              and the (now capped) tag list live inside this same flex
              column instead of trailing below the grid, so the whole right
              side is bounded by the gallery's height rather than free to
              grow past it. */}
          <div className="mx-auto max-w-6xl px-6 pb-10 pt-8 lg:px-10">
            {/* <Link
              href={`/stores/${store.platform}`}
              className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-teal-deep transition-colors hover:text-teal"
            >
              <ArrowLeft size={14} /> Back to {store.name}
            </Link> */}

            <div className="mt-4 grid gap-8 lg:grid-cols-2 items-stretch">
              <div className="min-w-0">
                <ProductGallery images={product.images?.length ? product.images : [product.image]} alt={product.name} />
              </div>
              <div className="flex h-full min-w-0 flex-col">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-semibold text-ink/50">
                  <span className="inline-flex items-center gap-2">
                    <span className="grid h-5 w-5 place-items-center overflow-hidden rounded-full border border-ink/10 bg-card">
                      <img src={store.logo} alt="" className="h-full w-full object-cover" />
                    </span>
                    {store.name} · {product.condition}
                  </span>
                  {product.averageRating != null && (
                    <>
                      <span className="text-ink/20">·</span>
                      <RatingStars rating={product.averageRating} count={product.reviewCount} />
                    </>
                  )}
                </div>

                <h1 className="mt-2 font-display text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">
                  {product.name}
                </h1>

                <SpecRow product={product} />

                {/* Economy vs Express delivery-price comparison.
                    One divided block, not two matching cards: Economy is
                    the storefront default, so it carries the primary
                    price treatment; Express sits underneath as a quieter
                    comparison row, with the price delta spelled out as
                    one line instead of making the shopper subtract two
                    absolute numbers themselves. */}
                <div className="mt-3 rounded-2xl border border-ink/10">
                  <div className="flex items-center gap-3 px-4 py-3.5">
                    <Package size={17} strokeWidth={1.75} className="shrink-0 text-teal-deep" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-ink">Economy</p>
                      <p className="text-xs text-ink/45">Postal delivery, arrives in 2–3 weeks</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="font-display text-xl font-bold text-teal-deep sm:text-2xl">
                        {dualPricing.economy.formattedPrice}
                      </p>
                      {dualPricing.economy.formattedCompareAtPrice != null && (
                        <p className="text-xs text-ink/35">
                          <span className="line-through">{dualPricing.economy.formattedCompareAtPrice}</span>
                          {dualPricing.economy.discountPercent != null && (
                            <span className="ml-1.5 text-teal-deep">
                              {dualPricing.economy.discountPercent}% less
                            </span>
                          )}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="mx-4 h-px bg-ink/8" />

                  <div className="flex items-center gap-3 px-4 py-3.5">
                    <Zap size={17} strokeWidth={1.75} className="shrink-0 text-ink/30" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-ink/70">Express</p>
                      <p className="text-xs text-ink/45">
                        Courier delivery, arrives in 3–5 days
                        {dualPricing.formattedExpressPremium != null && (
                          <> · {dualPricing.formattedExpressPremium} more than Economy</>
                        )}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-base font-bold text-ink/60">{dualPricing.express.formattedPrice}</p>
                      {dualPricing.express.formattedCompareAtPrice != null && (
                        <p className="text-xs text-ink/35 line-through">
                          {dualPricing.express.formattedCompareAtPrice}
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                {!product.inStock && (
                  <p className="mt-2 inline-block rounded-md bg-ink px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-parchment">
                    Sold out
                  </p>
                )}

                <p className="mt-1 text-xs text-ink/45">Sold by {product.seller}</p>

                {product.weightKg != null && (
                  <p className="mt-1.5 inline-flex items-center gap-1.5 text-xs text-ink/50">
                    <Weight size={12} strokeWidth={1.8} className="text-ink/35" />
                    Ships at {product.weightKg} kg
                  </p>
                )}

                {/* Marketplace flow can't add a specific variant to a bag (it
                    goes through the request/proxy-buy flow instead), so the
                    picker renders read-only here — no onSelect props means
                    SizeAndColorPicker just displays availability. The
                    non-marketplace flow's interactive picker lives inside
                    ProductActions instead, since the selection needs to be
                    wired into "Add to bag". */}
                {isMarketplace && <SizeAndColorPicker product={product} />}

                {isMarketplace ? (
                  <ProductRequestButton
                    productUrl={product.url ?? ''}
                    unavailable={!product.inStock}
                    className="mt-6 flex w-full items-center justify-center rounded-xl bg-teal px-5 py-3.5 text-sm font-bold text-white transition-colors hover:bg-teal-deep sm:w-auto sm:px-8"
                  >
                    Get Quote
                  </ProductRequestButton>
                ) : (
                  <ProductActions product={product} platform={store.platform} />
                )}

                <p className="mt-5 text-sm leading-relaxed text-ink/65">{product.description}</p>

                {hasExtendedDescription && (
                  <details className="group mt-2">
                    <summary className="cursor-pointer list-none text-xs font-bold uppercase tracking-wide text-teal-deep transition-colors hover:text-teal">
                      Full details
                      <span className="ml-1 inline-block transition-transform group-open:rotate-180">⌄</span>
                    </summary>
                    <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-ink/65">
                      {product.fullDescription}
                    </p>
                  </details>
                )}

                <TagList tags={product.tags ?? []} />

                {product.url && (
                  <a
                    href={product.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-ink/45 transition-colors hover:text-ink"
                  >
                    View on {store.name}&rsquo;s site <ExternalLink size={12} />
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>

        <ProductRequestOverlay />
      </div>
    </DashboardProvider>
  )
}