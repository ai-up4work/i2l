// components/stores/ProductPurchasePanel.tsx
//
// Owns the ONE piece of state page.tsx never actually shared: which
// size/color the shopper has picked. Before this, ProductGallery (left
// column) was rendered server-side straight off the base product, and
// ProductActions (right column) owned selectedSize/selectedColor
// entirely internally — the two never talked to each other, so picking
// a variant never changed the displayed photo or price, even though
// findMatchingVariant() was already correctly finding the right variant
// the whole time (it just wasn't used for anything but enabling "Add to
// bag"). This component replaces both halves of that grid with one
// client component that computes the match once and feeds it to the
// gallery, the price block, and ProductActions together.
//
// getDualDeliveryPricing (lib/pricing.ts) is safe to call client-side —
// it's pure math over lib/quote.ts/lib/currency.ts, no server-only
// imports — so the Economy/Express price block can be recomputed here
// on every selection instead of needing a round-trip to the server.
//
// ECONOMY LOCKED (temporary): Economy delivery is disabled sitewide for
// now (see the cart page's DeliveryModeToggle, which does the same thing
// with a grayed-out "Coming soon" sub-label and defaults to Express).
// `economyLocked` — passed down from page.tsx — swaps this card's
// visual hierarchy: Express becomes the full-opacity, "recommended" row
// and Economy becomes a muted, non-interactive row with its price
// hidden behind a "Coming soon" label instead of a real number. The
// underlying dualPricing.economy math is untouched (still computed,
// still correct) — only how it's DISPLAYED changes, so re-enabling
// Economy later is just flipping this flag back, not re-deriving
// pricing.

'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Clock, Package, Star, Weight, Zap } from 'lucide-react'
import { getDualDeliveryPricing } from '@/lib/pricing'
import { findMatchingVariant, isMatchableOption } from '@/lib/product-options'
import ProductActions from '@/components/stores/ProductActions'
import ProductGallery from '@/components/stores/ProductGallery'
import ProductRequestButton from '@/components/stores/ProductRequestButton'
import SizeAndColorPicker from '@/components/stores/SizeAndColorPicker'
import type { StoreProduct } from '@/lib/store.types'

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

export default function ProductPurchasePanel({
  product,
  platform,
  storeName,
  storeLogo,
  isMarketplace,
  economyLocked = false,
}: {
  product: StoreProduct
  platform: string
  storeName: string
  storeLogo: string
  isMarketplace: boolean
  /** Economy delivery is temporarily unavailable sitewide — see the
   * top-of-file comment. Defaults to false so any caller that hasn't
   * been updated yet keeps the old two-full-price display. */
  economyLocked?: boolean
}) {
  const [selectedSize, setSelectedSize] = useState<string | undefined>()
  const [selectedColor, setSelectedColor] = useState<string | undefined>()
  const [qty, setQty] = useState(1)

  const hasSizes = !!product.sizes?.length
  const hasColors = !!product.colors?.length
  // A size/color list can be purely informational (shown for reference,
  // no real per-value stock/price behind it) rather than a required
  // selection — see isMatchableOption's own comment. Only require
  // picking one before matching a variant when it's actually backed by
  // real variant data; otherwise a shown-but-not-matchable size would
  // block color selection from ever resolving to a variant at all.
  const sizeRequired = hasSizes && isMatchableOption(product, 'size')
  const colorRequired = hasColors && isMatchableOption(product, 'color')
  const needsSelection = (sizeRequired && !selectedSize) || (colorRequired && !selectedColor)

  // Computed once, here, and handed down to both the gallery/price block
  // AND ProductActions — a size that's fine on its own can still be sold
  // out in the color just picked, which checking each chip in isolation
  // can't catch, and neither side should risk disagreeing with the other
  // about which variant (if any) is actually selected.
  const variantMatch = useMemo(() => {
    if (isMarketplace || needsSelection) return null
    const selected: Record<string, string> = {}
    if (selectedSize) selected['Size'] = selectedSize
    if (selectedColor) selected['Color'] = selectedColor
    return findMatchingVariant(product, selected)
  }, [product, selectedSize, selectedColor, needsSelection, isMarketplace])

  // Only swap away from the base product's own price/photo once a
  // specific variant is unambiguously matched (variantMatch is a real
  // object, not null/undefined) — before anything's picked, or when the
  // chosen combination doesn't exist, show the product's own numbers
  // rather than guessing at one variant among several.
  const effectivePrice = variantMatch?.price ?? product.price
  const effectiveVariantImage = variantMatch?.image

  // Progressive image swap: `variant.image` (the swatch thumbnail) shows
  // immediately — no waiting — while `variant.fullImage`, when a provider
  // has one, loads quietly in the background and takes over once it's
  // actually ready. Prevents the gallery from either sitting on a blurry
  // thumbnail forever or flashing blank while a full-resolution original
  // downloads. `variantId` tracks which variant the preload belongs to,
  // so a rapid second click can't have an earlier variant's slow-loading
  // full image land after the shopper has already moved on.
  const [displayImage, setDisplayImage] = useState<{ variantId: string | undefined; url: string | undefined }>({
    variantId: variantMatch?.id,
    url: effectiveVariantImage,
  })

  useEffect(() => {
    const variantId = variantMatch?.id
    const thumb = variantMatch?.image
    const full = variantMatch?.fullImage

    // Show the thumbnail (or, with no variant selected, nothing extra —
    // galleryImages below falls back to the base product's own photos)
    // right away, then only upgrade if there's actually a different,
    // higher-resolution image to wait for.
    setDisplayImage({ variantId, url: thumb })
    if (!full || full === thumb) return

    let cancelled = false
    const img = new window.Image()
    img.onload = () => {
      if (cancelled) return
      setDisplayImage((prev) => (prev.variantId === variantId ? { variantId, url: full } : prev))
    }
    img.src = full
    return () => {
      cancelled = true
    }
  }, [variantMatch?.id, variantMatch?.image, variantMatch?.fullImage])

  const galleryImages = useMemo(() => {
    const base = product.images?.length ? product.images : product.image ? [product.image] : []
    // With a variant selected, its own photo is the WHOLE gallery, not a
    // lead image with the base product's photo tacked on after it — for
    // this kind of catalog, `product.images` is really just the first
    // variant's own photo (there's no second real angle behind it), so
    // appending `base` here just showed an unrelated design's picture as
    // a second thumbnail no matter which variant was actually selected.
    // Only fall back to the base product's own gallery when nothing's
    // been picked yet.
    if (!variantMatch) return base
    const lead = displayImage.variantId === variantMatch.id ? displayImage.url : effectiveVariantImage
    return lead ? [lead] : base
  }, [product.images, product.image, displayImage, variantMatch?.id, effectiveVariantImage])

  // Recomputed on every price change rather than once on load — this is
  // the actual fix for "price doesn't change when I pick a variant".
  const dualPricing = useMemo(
    () => getDualDeliveryPricing({ ...product, price: effectivePrice }),
    [product, effectivePrice]
  )

  return (
    <>
      <div className={`relative min-w-0 ${!product.inStock ? 'grayscale-[0.4] opacity-90' : ''}`}>
        {/* resetKey ties the gallery's own internal "which photo is
            active" state to the current variant SELECTION, not the raw
            image URL — using the URL directly would also reset when the
            thumbnail silently upgrades to fullImage for the SAME
            variant, which should update the photo in place, not jump
            the gallery back to slide 0 a second time. */}
        <ProductGallery images={galleryImages} alt={product.name} resetKey={variantMatch?.id ?? product.image} />
        {!product.inStock && (
          <span className="absolute left-4 top-4 rounded-full border border-ink/10 bg-parchment/95 px-3 py-1 text-xs font-semibold text-ink/70 shadow-sm backdrop-blur-sm">
            Sold out
          </span>
        )}
      </div>
      <div className="flex h-full min-w-0 flex-col">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-semibold text-ink/50">
          <span className="inline-flex items-center gap-2">
            {dualPricing.fixedPrice ? (
              <span className="grid h-5 w-5 shrink-0 place-items-center overflow-hidden rounded-full border border-ink/10 bg-card">
                <img src={storeLogo} alt="" className="h-full w-full object-cover" />
              </span>
            ) : (
              <Link
                href={`/demo/quote?${new URLSearchParams({
                  mode: 'simple',
                  // Economy locked — the breakdown link should reflect the
                  // only delivery method actually bookable right now. See
                  // economyLocked's own doc comment above.
                  delivery: economyLocked ? 'express' : 'economy',
                  pcs: '1',
                  value: String(effectivePrice),
                  currency: product.currency,
                  ...(product.weightKg != null ? { weight: String(product.weightKg) } : {}),
                }).toString()}`}
                target="_blank"
                rel="noopener noreferrer"
                title="See price breakdown"
                className="grid h-5 w-5 shrink-0 place-items-center overflow-hidden rounded-full border border-ink/10 bg-card transition-opacity hover:opacity-75"
              >
                <img src={storeLogo} alt="" className="h-full w-full object-cover" />
              </Link>
            )}
            {storeName} · {product.condition}
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

        {dualPricing.fixedPrice ? (
          // Fixed-price store (Wishdrop Mall): the price is set in LKR and
          // already covers everything, so there's no delivery-method
          // comparison — just the price and the flat delivery fee.
          <div className="mt-3 rounded-3xl border border-ink/15 bg-card px-5 py-4 shadow-[0_1px_2px_rgba(15,42,42,0.04),0_12px_28px_-16px_rgba(15,42,42,0.35)]">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="font-display text-2xl font-extrabold tabular-nums text-ink sm:text-[28px]">
                {dualPricing.express.formattedPrice}
              </span>
              {dualPricing.express.formattedCompareAtPrice != null && (
                <span className="text-sm text-ink/45">
                  <span className="line-through">{dualPricing.express.formattedCompareAtPrice}</span>
                  {dualPricing.express.discountPercent != null && (
                    <span className="ml-1.5 font-semibold text-teal-deep">{dualPricing.express.discountPercent}% less</span>
                  )}
                </span>
              )}
            </div>
            <p className="mt-1 text-xs text-ink/55">
              + {dualPricing.express.formattedDeliveryFee} delivery · no tax or import charges
            </p>
          </div>
        ) : (
          <>
          {/* Economy vs Express delivery-price comparison, styled like a
              two-part shipping slip: a ticket-stub perforation separates
              the options instead of a plain divider.
              economyLocked=false (old/default behavior): both rows keep
              their own full-opacity accent color (teal / gold), Economy
              keeps the larger price treatment as the storefront default.
              economyLocked=true: Express takes over as the full-opacity,
              "recommended" row with the larger price treatment; Economy is
              muted (grey icon/text, no accent background) and shows
              "Coming soon" instead of a real price — same treatment as the
              cart page's own locked Economy button, just in this card's
              layout instead of a toggle. */}
          <div className="mt-3 rounded-3xl border border-ink/15 bg-card shadow-[0_1px_2px_rgba(15,42,42,0.04),0_12px_28px_-16px_rgba(15,42,42,0.35)]">
            <div
              className={`flex items-center gap-3 rounded-t-[calc(1.5rem-1px)] px-5 py-4 ${
                economyLocked ? 'bg-ink/[0.02]' : 'bg-teal/[0.05]'
              }`}
            >
              <Package
                size={18}
                strokeWidth={1.75}
                className={`shrink-0 ${economyLocked ? 'text-ink/25' : 'text-teal-deep'}`}
              />
              <div className="min-w-0 flex-1">
                <p className={`text-sm font-semibold ${economyLocked ? 'text-ink/40' : 'text-ink'}`}>
                  Economy
                  {!economyLocked && <span className="font-normal text-teal-deep"> · recommended</span>}
                </p>
                <p className={`text-xs italic ${economyLocked ? 'text-ink/30' : 'text-ink/45 not-italic'}`}>
                  {economyLocked ? 'Coming soon' : 'Delivery arrives in 3–4 weeks'}
                </p>
              </div>
              <div className="shrink-0 text-right">
                {economyLocked ? (
                  <span className="inline-flex items-center gap-1 rounded-full border border-ink/10 bg-ink/[0.04] px-2.5 py-1 text-[11px] font-semibold text-ink/35">
                    <Clock size={11} strokeWidth={2} />
                    Coming soon
                  </span>
                ) : (
                  <>
                    <p className="font-display text-2xl font-bold tabular-nums text-teal-deep sm:text-[28px]">
                      {dualPricing.economy.formattedPrice}
                    </p>
                    {dualPricing.economy.formattedCompareAtPrice != null && (
                      <p className="text-xs text-ink/35">
                        <span className="line-through">{dualPricing.economy.formattedCompareAtPrice}</span>
                        {dualPricing.economy.discountPercent != null && (
                          <span className="ml-1.5 text-teal-deep">{dualPricing.economy.discountPercent}% less</span>
                        )}
                      </p>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Perforation seam — notches are page-background-colored
                circles punched into the card's side edges at the seam
                height. */}
            <div className="relative">
              <div className="border-t border-dashed border-ink/15" />
              <span className="absolute left-[-13px] top-1/2 h-6 w-6 -translate-y-1/2 rounded-full bg-parchment" />
              <span className="absolute right-[-13px] top-1/2 h-6 w-6 -translate-y-1/2 rounded-full bg-parchment" />
            </div>

            <div className="flex items-center gap-3 rounded-b-[calc(1.5rem-1px)] bg-gold/[0.06] px-5 py-4">
              <Zap size={18} strokeWidth={1.75} className="shrink-0 text-gold-deep" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-ink">
                  Express
                  {economyLocked && <span className="font-normal text-gold-deep"> · recommended</span>}
                </p>
                <p className="text-xs text-ink/45">
                  Delivery arrives in 12 - 15 days
                  {!economyLocked && dualPricing.formattedExpressPremium != null && (
                    <> · {dualPricing.formattedExpressPremium} more</>
                  )}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p
                  className={`font-display font-bold tabular-nums text-gold-deep ${
                    economyLocked ? 'text-2xl sm:text-[28px]' : 'text-xl sm:text-2xl'
                  }`}
                >
                  {dualPricing.express.formattedPrice}
                </p>
                {dualPricing.express.formattedCompareAtPrice != null && (
                  <p className="text-xs text-ink/35">
                    <span className="line-through">{dualPricing.express.formattedCompareAtPrice}</span>
                    {dualPricing.express.discountPercent != null && (
                      <span className="ml-1.5 text-gold-deep">{dualPricing.express.discountPercent}% less</span>
                    )}
                  </p>
                )}
              </div>
            </div>
          </div>
          </>
        )}

        <p className="mt-3 text-xs text-ink/45">Sold by {product.seller}</p>

        {product.weightKg != null && (
          <p className="mt-1.5 inline-flex items-center gap-1.5 text-xs text-ink/50">
            <Weight size={12} strokeWidth={1.8} className="text-ink/35" />
            Ships at {product.weightKg} kg
          </p>
        )}

        {/* Marketplace flow can't add a specific variant to a bag (it goes
            through the request/proxy-buy flow instead), so the picker
            renders read-only here — no onSelect props means
            SizeAndColorPicker just displays availability. The
            non-marketplace flow's interactive picker lives inside
            ProductActions instead, since the selection needs to be wired
            into "Add to bag" (and, now, into the gallery/price above).
            When the product is sold out, a small status line sits just
            above the picker — same muted dot + text treatment as the
            gallery tag — since a sold-out product's sizes are shown for
            reference only here and can't actually be selected toward a
            purchase. */}
        {isMarketplace && (
          <div className="mt-5">
            {!product.inStock && (
              <p className="mb-2 inline-flex items-center gap-1.5 text-xs font-semibold text-ink/50">
                <span className="h-1.5 w-1.5 rounded-full bg-ink/35" />
                Sold out — sizes shown for reference only
              </p>
            )}
            <SizeAndColorPicker product={product} />
          </div>
        )}

        {isMarketplace ? (
          <ProductRequestButton
            productUrl={product.url ?? ''}
            unavailable={!product.inStock}
            className="mt-6 flex w-full items-center justify-center rounded-xl bg-teal px-5 py-3.5 text-sm font-bold text-white transition-colors hover:bg-teal-deep sm:w-auto sm:px-8"
          >
            CHECKOUT
          </ProductRequestButton>
        ) : (
          <ProductActions
            product={product}
            platform={platform}
            qty={qty}
            onQtyChange={setQty}
            selectedSize={selectedSize}
            selectedColor={selectedColor}
            onSelectSize={setSelectedSize}
            onSelectColor={setSelectedColor}
            variantMatch={variantMatch}
          />
        )}
      </div>
    </>
  )
}