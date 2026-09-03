// app/(public)/stores/[platform]/product/[productId]/page.tsx
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, ChevronRight, ShieldCheck, ExternalLink, Star, Weight } from 'lucide-react'
import { affiliatedStores } from '@/components/dashboard/data'
import { fetchStoreProduct } from '@/lib/store-providers/product'
import { formatPrice } from '@/lib/currency'
import ProductActions from '@/components/stores/ProductActions'
import ProductGallery from '@/components/stores/ProductGallery'
import ShareButton from '@/components/stores/ShareButton'
import SizeAndColorPicker from '@/components/stores/SizeAndColorPicker'
import TagList from '@/components/stores/TagList'
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
      <div className="mx-auto max-w-5xl px-6 pb-16 pt-8 lg:px-10">
        <Link
          href={`/stores/${store.platform}`}
          className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-teal-deep transition-colors hover:text-teal"
        >
          <ArrowLeft size={14} /> Back to {store.name}
        </Link>
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

  const requestHref = `/login?redirect=${encodeURIComponent(
    `/account/requests/new?productId=${product.id}`
  )}`

  // Marketplaces (eBay, Amazon, etc.) go through the request/proxy-buy
  // flow; local sellers with a live or mock catalog get the same
  // add-to-bag → WhatsApp flow as the store catalog page.
  const isMarketplace = store.storeType === 'marketplace'

  // Only show a "Full details" expander when there's a genuinely longer
  // description distinct from the short one — not when the upstream feed
  // just duplicated the same text into both fields.
  const hasExtendedDescription =
    !!product.fullDescription && product.fullDescription.trim() !== product.description.trim()

  return (
    <div className="min-h-screen">
      {/* Sticky breadcrumb + share nav */}
      <div className="sticky top-0 z-30 hidden bg-parchment/80 backdrop-blur-md sm:block">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-4 px-6 lg:px-10">
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

      <div className="mx-auto max-w-5xl px-6 pb-16 pt-8 lg:px-10">
        <Link
          href={`/stores/${store.platform}`}
          className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-teal-deep transition-colors hover:text-teal"
        >
          <ArrowLeft size={14} /> Back to {store.name}
        </Link>

        {/* items-stretch + h-full on the info column keep the two sides
            matched in height, same fix as the old-money PDP: description
            and the (now capped) tag list live inside this same flex
            column instead of trailing below the grid, so the whole right
            side is bounded by the gallery's height rather than free to
            grow past it. */}
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

            <div className="mt-3 flex items-baseline gap-2">
              <p className="text-3xl font-bold text-teal-deep">{formatPrice(product.price, product.currency)}</p>
              {product.compareAtPrice && product.onSale && (
                <p className="text-base font-semibold text-ink/40 line-through">
                  {formatPrice(product.compareAtPrice, product.currency)}
                </p>
              )}
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
              <Link
                href={requestHref}
                className="mt-6 flex w-full items-center justify-center rounded-xl bg-teal px-5 py-3.5 text-sm font-bold text-white transition-colors hover:bg-teal-deep sm:w-auto sm:px-8"
              >
                Request this item
              </Link>
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

            {/* <div className="mt-5 flex items-start gap-2.5 rounded-xl border border-ink/10 bg-gold/10 px-4 py-3">
              <ShieldCheck size={16} className="mt-0.5 flex-none text-gold-deep" strokeWidth={1.8} />
              <p className="text-xs leading-relaxed text-ink/70">
                {isMarketplace
                  ? 'We buy, quality-check, and ship this to you — you pay only after we confirm the quote.'
                  : 'Add to your bag, then confirm your order with the seller over WhatsApp.'}
              </p>
            </div> */}
          </div>
        </div>
      </div>
    </div>
  )
}