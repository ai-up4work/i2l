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
// VARIANT STATE: the match is held as a tagged `variantState`
// ({ status, variant }, see VariantStatus in lib/feature-flags.ts)
// rather than overloading null/undefined, so "still picking" and "no such
// combination" can never be confused between this file and ProductActions.
//
// getDualDeliveryPricing (lib/pricing.ts) is safe to call client-side —
// it's pure math over lib/quote.ts/lib/currency.ts, no server-only
// imports — so the Economy/Express price block can be recomputed here
// on every selection instead of needing a round-trip to the server.
//
// ECONOMY LOCKED (temporary): Economy delivery is disabled sitewide for
// now (see the cart page's DeliveryModeToggle, which does the same thing
// with a grayed-out "Coming soon" sub-label and defaults to Express).
// `economyLocked` — passed down from page.tsx, and defaulting to the
// shared Economy switch (isEconomyLocked in lib/feature-flags.ts, set in Admin → Pricing engine) — swaps this card's
// visual hierarchy: Express becomes the full-opacity, "recommended" row
// and Economy becomes a muted, non-interactive row with its price
// hidden behind a "Coming soon" label instead of a real number. The
// underlying dualPricing.economy math is untouched (still computed,
// still correct) — only how it's DISPLAYED changes, so re-enabling
// Economy later is just flipping that flag back, not re-deriving
// pricing.
//
// VARIANT PHOTO + LINK (this revision):
//   1. COLOUR-ONLY PHOTO: most Shopify catalogs attach one photo per
//      COLOUR (every size of a colour shares it). Waiting for BOTH a
//      size and a colour before swapping the photo meant tapping a
//      colour did nothing until a size was also picked. `imageVariant`
//      below falls back to the first variant of the chosen colour, so
//      the photo swaps the moment a colour is picked.
//   2. GALLERY KEEPS EXTRA PHOTOS: a matched variant used to REPLACE the
//      whole gallery with its single photo, hiding the seller's other
//      shots (detail/back/model photos that belong to no variant). It now
//      leads with the variant photo, then appends only the base photos
//      that aren't some variant's own photo — so an unrelated colour's
//      picture is still never shown as a second thumbnail.
//   3. VARIANT LINK: `variantUrl` is the product URL with ?variant=<id>
//      (Shopify's own deep-link format). It's written to the address bar
//      so a shared Wishdrop link reopens the same colour/size, read back
//      on load to preselect, and handed to ProductActions so the cart
//      line / request carries the exact variant's link, not the bare
//      product link.
//
// NO-HANG COLOUR SWAP (this revision): picking a variant never refetches
// product DATA (everything is already in `product`), but the variant's
// PHOTO is a fresh download the first time it's shown, which read as a
// "loading" hang. Two things fix that: (a) once the page is idle, every
// variant photo is preloaded into the browser cache so a click hits the
// cache instead of the network, and (b) the thumbnail -> fullImage upgrade
// only swaps after the full image is fully DECODED, so the upgrade can't
// flash or jank the paint.

'use client'

import { arrivalRange } from '@/lib/delivery-dates'
import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { ChevronRight, Clock, Package, Star, Weight, Zap } from 'lucide-react'
import { getDualDeliveryPricing, formatLKR } from '@/lib/pricing'
import { localPickupFeeLKR } from '@/lib/store-origin'
import { findMatchingVariant, isMatchableOption } from '@/lib/product-options'
import { isEconomyLocked, type VariantStatus } from '@/lib/feature-flags'
import ProductActions from '@/components/stores/ProductActions'
import ProductGallery from '@/components/stores/ProductGallery'
import ProductRequestButton from '@/components/stores/ProductRequestButton'
import SizeAndColorPicker from '@/components/stores/SizeAndColorPicker'
import FollowButton from '@/components/stores/social/FollowButton'
import { imageThumb } from '@/lib/media'
import type { StoreProduct } from '@/lib/store.types'

type Variant = NonNullable<StoreProduct['variants']>[number]

// Cap on how many variants' FULL-size images get warmed up front. Thumbnails
// are small so all of them are preloaded; full images can be large, so only
// the first few unique ones are, to avoid burning a shopper's data on a
// catalog with dozens of colours. Anything beyond the cap still loads on
// demand, exactly as before.
const MAX_FULL_IMAGE_PRELOADS = 12

// The variant's value for a named option axis ("size" / "color"),
// resolved through the product's own options list so it works no matter
// which position the axis sits in (Color/Size vs Size/Color).
function optionValueFor(product: StoreProduct, variant: Variant, name: 'size' | 'color'): string | undefined {
  const idx = product.options?.findIndex((o) => o.name.trim().toLowerCase() === name) ?? -1
  if (idx < 0) return undefined
  return variant.options?.[idx] ?? undefined
}

// Product URL + ?variant=<id>. Goes through the URL API so an emoji or
// otherwise non-ASCII handle is percent-encoded exactly once.
function withVariantParam(url: string | undefined, variantId?: string): string {
  if (!url) return ''
  if (!variantId) return url
  try {
    const u = new URL(url)
    u.searchParams.set('variant', variantId)
    return u.toString()
  } catch {
    return url
  }
}

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
  economyLocked = isEconomyLocked(),
  social,
}: {
  product: StoreProduct
  platform: string
  storeName: string
  storeLogo: string
  isMarketplace: boolean
  /** Economy delivery is temporarily unavailable sitewide — see the
   * top-of-file comment. Defaults to the shared Economy switch (isEconomyLocked) so
   * any caller that hasn't been updated yet still agrees with the rest
   * of the site. */
  economyLocked?: boolean
  /** Set for custom (Instagram / Facebook) seller stores: swaps the small
   * store line for a store block with a Follow button, and the
   * Economy/Express slip for one clear price. Everything else (gallery,
   * variant picking, add to bag) is unchanged. */
  social?: { storeHref: string; tagline?: string }
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
  const variantState = useMemo<{ status: VariantStatus; variant: Variant | null }>(() => {
    if (isMarketplace || !product.variants?.length || (!sizeRequired && !colorRequired)) {
      return { status: 'not-applicable', variant: null }
    }
    if (needsSelection) return { status: 'incomplete', variant: null }
    const selected: Record<string, string> = {}
    if (selectedSize) selected['Size'] = selectedSize
    if (selectedColor) selected['Color'] = selectedColor
    const match = findMatchingVariant(product, selected) ?? null
    return match ? { status: 'match', variant: match } : { status: 'none', variant: null }
  }, [product, selectedSize, selectedColor, needsSelection, sizeRequired, colorRequired, isMarketplace])

  const variantMatch = variantState.variant

  // Photo-only variant: as soon as a COLOUR is chosen, use that colour's
  // own photo even if no size has been picked yet (photos are almost
  // always per colour, shared by every size). Price still waits for a
  // full match — this is only used for the gallery.
  const colorOnlyVariant = useMemo(() => {
    if (isMarketplace || !selectedColor || !product.variants?.length) return null
    return (
      product.variants.find((v) => optionValueFor(product, v, 'color') === selectedColor && !!v.image) ?? null
    )
  }, [product, selectedColor, isMarketplace])

  const imageVariant = variantMatch ?? colorOnlyVariant

  // Only swap away from the base product's own price once a specific
  // variant is unambiguously matched (variantMatch is a real object, not
  // null) — before anything's picked, or when the chosen combination
  // doesn't exist, show the product's own numbers rather than guessing
  // at one variant among several.
  const effectivePrice = variantMatch?.price ?? product.price

  // Warm the browser cache for every variant photo once the page is idle,
  // so a colour click swaps instantly from cache instead of waiting on a
  // download (the "hang"). All thumbnails are preloaded; full-size images
  // only for the first MAX_FULL_IMAGE_PRELOADS unique ones. Runs once per
  // product, deferred to idle time so it never competes with first paint.
  useEffect(() => {
    if (isMarketplace || !product.variants?.length) return

    const thumbs = new Set<string>()
    const fulls = new Set<string>()
    for (const v of product.variants) {
      if (v.image) thumbs.add(v.image)
      if (v.fullImage && v.fullImage !== v.image && fulls.size < MAX_FULL_IMAGE_PRELOADS) fulls.add(v.fullImage)
    }

    const preload = (src: string) => {
      const img = new window.Image()
      img.decoding = 'async'
      img.src = src
    }
    const run = () => {
      thumbs.forEach(preload)
      fulls.forEach(preload)
    }

    const w = window as Window & {
      requestIdleCallback?: (cb: () => void) => number
      cancelIdleCallback?: (id: number) => void
    }
    if (w.requestIdleCallback) {
      const id = w.requestIdleCallback(run)
      return () => w.cancelIdleCallback?.(id)
    }
    const t = setTimeout(run, 300)
    return () => clearTimeout(t)
  }, [product.id, product.variants, isMarketplace])

  // Progressive image swap: `variant.image` (the swatch thumbnail) shows
  // immediately — no waiting — while `variant.fullImage`, when a provider
  // has one, loads quietly in the background and takes over once it's
  // actually ready. Prevents the gallery from either sitting on a blurry
  // thumbnail forever or flashing blank while a full-resolution original
  // downloads. `variantId` tracks which variant the preload belongs to,
  // so a rapid second click can't have an earlier variant's slow-loading
  // full image land after the shopper has already moved on.
  //
  // The thumbnail is NOT stored in state here any more: galleryImages
  // below already falls back to `imageVariant.image` whenever
  // displayImage belongs to a different variant, so setting it here only
  // caused an extra render on every click. State is written once, and only
  // when the full image is decoded and ready to take over.
  const [displayImage, setDisplayImage] = useState<{ variantId: string | undefined; url: string | undefined }>({
    variantId: imageVariant?.id,
    url: imageVariant?.image,
  })

  useEffect(() => {
    const variantId = imageVariant?.id
    const thumb = imageVariant?.image
    const full = imageVariant?.fullImage

    // Nothing higher-resolution to wait for: the thumbnail (via the
    // galleryImages fallback) is already what's shown.
    if (!variantId || !full || full === thumb) return

    let cancelled = false
    const apply = () => {
      if (cancelled) return
      setDisplayImage({ variantId, url: full })
    }

    const img = new window.Image()
    img.decoding = 'async'
    img.src = full
    // decode() resolves once the image is fully decoded, so the swap can't
    // flash a half-painted frame; browsers without it fall back to onload.
    if (typeof img.decode === 'function') {
      img.decode().then(apply, apply)
    } else {
      img.onload = apply
    }
    return () => {
      cancelled = true
    }
  }, [imageVariant?.id, imageVariant?.image, imageVariant?.fullImage])

  // Every variant's own photo — used to tell "a photo that belongs to
  // some colour" apart from "a general gallery shot".
  const variantImageSet = useMemo(
    () => new Set((product.variants ?? []).flatMap((v) => (v.image ? [v.image] : []))),
    [product.variants]
  )

  const galleryImages = useMemo(() => {
    const base = product.images?.length ? product.images : product.image ? [product.image] : []
    if (!imageVariant) return base
    const lead = displayImage.variantId === imageVariant.id ? displayImage.url : imageVariant.image
    if (!lead) return base
    // Lead with the selected variant's photo, then keep the seller's
    // general shots (photos that belong to NO variant). Base photos that
    // are another colour's own picture are dropped, so an unrelated
    // design never shows up as a second thumbnail.
    const extras = base.filter((src) => src !== lead && !variantImageSet.has(src))
    return [lead, ...extras]
  }, [product.images, product.image, displayImage, imageVariant?.id, imageVariant?.image, variantImageSet])

  // Recomputed on every price change rather than once on load — this is
  // the actual fix for "price doesn't change when I pick a variant".
  const dualPricing = useMemo(
    () => getDualDeliveryPricing({ ...product, price: effectivePrice }),
    [product, effectivePrice]
  )

  // Shopify deep link for the exact variant picked (product URL with
  // ?variant=<id>). Falls back to the plain product URL until a full
  // size+colour match exists.
  const variantUrl = useMemo(() => withVariantParam(product.url, variantMatch?.id), [product.url, variantMatch?.id])

  // Preselect from a shared/bookmarked link: /product/<handle>?variant=<id>
  // Runs once on mount. Only the option axes the product really has get
  // set, so a colour-only product still works.
  useEffect(() => {
    if (isMarketplace || !product.variants?.length) return
    const id = new URLSearchParams(window.location.search).get('variant')
    if (!id) return
    const v = product.variants.find((x) => x.id === id)
    if (!v) return
    const size = optionValueFor(product, v, 'size')
    const color = optionValueFor(product, v, 'color')
    if (size) setSelectedSize(size)
    if (color) setSelectedColor(color)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product.id])

  // Keep the address bar in sync with the matched variant so copying the
  // link (or the Share button) reopens exactly this colour + size. Only
  // ever SETS the param — options can't be un-picked, so there's nothing
  // to clear, and not clearing avoids wiping ?variant= before the
  // preselect effect above has read it.
  useEffect(() => {
    if (isMarketplace || !variantMatch) return
    const u = new URL(window.location.href)
    if (u.searchParams.get('variant') === variantMatch.id) return
    u.searchParams.set('variant', variantMatch.id)
    window.history.replaceState(window.history.state, '', u)
  }, [variantMatch?.id, isMarketplace])

  // Desktop: the buy box matches the MAIN photo's height (not the photo +
  // thumbnail strip), so the buttons line up with the bottom of the photo.
  // Measured live — the photo's height changes with the image shown and
  // the window size.
  const galleryRef = useRef<HTMLDivElement | null>(null)
  const [mainPhotoHeight, setMainPhotoHeight] = useState<number | null>(null)
  useEffect(() => {
    const main = galleryRef.current?.querySelector<HTMLElement>('[data-gallery-main]')
    if (!main || typeof ResizeObserver === 'undefined') return
    const update = () => setMainPhotoHeight(Math.round(main.getBoundingClientRect().height))
    update()
    const ro = new ResizeObserver(update)
    ro.observe(main)
    return () => ro.disconnect()
  }, [])

  return (
    <>
      <div ref={galleryRef} className={`relative min-w-0 ${!product.inStock ? 'grayscale-[0.4] opacity-90' : ''}`}>
        {/* resetKey ties the gallery's own internal "which photo is
            active" state to the photo being SHOWN for the current
            selection (the thumbnail URL, or the product's own image when
            nothing is picked) — not to the variant id, which would jump
            the gallery back to slide 0 on every size change even though
            the colour photo stayed the same, and not to the upgraded
            fullImage URL, which would reset a second time when the same
            variant's thumbnail silently upgrades. */}
        <ProductGallery
          images={galleryImages}
          videos={product.videos}
          alt={product.name}
          resetKey={imageVariant?.image ?? product.image}
        />
        {!product.inStock && (
          <span className="absolute left-4 top-4 rounded-full border border-ink/10 bg-parchment/95 px-3 py-1 text-xs font-semibold text-ink/70 shadow-sm backdrop-blur-sm">
            Sold out
          </span>
        )}
      </div>
      <div
        id="buy-box"
        className="flex min-w-0 flex-col lg:min-h-[var(--main-photo-h)] lg:self-start"
        style={mainPhotoHeight ? ({ '--main-photo-h': `${mainPhotoHeight}px` } as React.CSSProperties) : undefined}
      >
        {social ? (
          <div className="flex items-center gap-3 rounded-2xl border border-ink/10 bg-card px-3.5 py-3">
            <Link href={social.storeHref} className="grid h-11 w-11 flex-none place-items-center overflow-hidden rounded-full border border-ink/10 bg-parchment">
              {storeLogo ? (
                <img src={imageThumb(storeLogo, 120)} alt="" className="h-full w-full object-cover" />
              ) : (
                <span className="font-display text-lg font-bold text-teal-deep">{storeName.charAt(0).toUpperCase()}</span>
              )}
            </Link>
            <Link href={social.storeHref} className="min-w-0 flex-1">
              <span className="block truncate text-sm font-bold text-ink">{storeName}</span>
              <span className="block truncate text-xs text-ink/50">{social.tagline || 'Visit store'}</span>
            </Link>
            <FollowButton slug={platform} />
          </div>
        ) : (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-semibold text-ink/50">
          <span className="inline-flex items-center gap-2">
            {/* ?price-breakdown → the quote calculator for this exact
                variant: the full calculator for staff, its customer mode
                (no seller price) for shoppers. See lib/quote-links.ts. */}
            <Link
              href={`/stores/${platform}/product/${encodeURIComponent(product.handle || product.id)}?${
                variantMatch?.id ? `variant=${encodeURIComponent(variantMatch.id)}&` : ''
              }price-breakdown`}
              target="_blank"
              rel="noopener noreferrer"
              title="See price breakdown"
              className="grid h-5 w-5 shrink-0 place-items-center overflow-hidden rounded-full border border-ink/10 bg-card transition-opacity hover:opacity-75"
            >
              <img src={storeLogo} alt="" className="h-full w-full object-cover" />
            </Link>
            {storeName} · {product.condition}
          </span>
          {product.averageRating != null && (
            <>
              <span className="text-ink/20">·</span>
              <RatingStars rating={product.averageRating} count={product.reviewCount} />
            </>
          )}
        </div>
        )}

        <h1 className={`${social ? 'mt-4' : 'mt-2'} font-display text-2xl font-extrabold tracking-tight text-ink sm:text-3xl`}>
          {product.name}
        </h1>
        {social && product.averageRating != null && (
          <div className="mt-1.5">
            <RatingStars rating={product.averageRating} count={product.reviewCount} />
          </div>
        )}

        {(social && !dualPricing.fixedPrice) || dualPricing.localStore ? (
          // Custom seller stores AND every local Sri Lankan shop (social or
          // feed / extractor, e.g. a JSON partner feed): one clear price (the delivery method
          // that can actually be booked), then what gets added at
          // checkout, so the total is never a surprise.
          //
          // Local Sri Lankan shops use this exact same layout and wording,
          // so nothing tells a shopper the shop is local: their once-per-
          // order handling fee is shown as the service charge, just like
          // an imported product's.
          (() => {
            const local = Boolean(dualPricing.localStore)
            const p = local ? dualPricing.express : economyLocked ? dualPricing.express : dualPricing.economy
            const serviceCharge = local ? formatLKR(localPickupFeeLKR()) : p.formattedServiceCharge
            return (
              <div className="mt-3">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className="font-display text-3xl font-extrabold tabular-nums text-ink">{p.formattedPrice}</span>
                  {p.formattedCompareAtPrice != null && (
                    <span className="text-sm text-ink/45">
                      <span className="line-through">{p.formattedCompareAtPrice}</span>
                      {p.discountPercent != null && p.discountPercent > 0 && (
                        <span className="ml-2 rounded-md bg-ink px-1.5 py-0.5 text-xs font-bold text-white">-{p.discountPercent}%</span>
                      )}
                    </span>
                  )}
                </div>
                <p className="mt-1.5 text-xs text-ink/55">
                  At checkout: {serviceCharge} service charge
                  {p.deliveryFeeLKR > 0 && <> + {p.formattedDeliveryFee} delivery</>}.
                </p>
                <ul className="mt-3 grid grid-cols-1 gap-2 text-xs text-ink/70 sm:grid-cols-2">
                  <li className="flex items-center gap-2 rounded-xl bg-teal/[0.07] px-3 py-2.5">
                    <Zap size={14} className="flex-none text-teal-deep" />
                    Arrives {local ? arrivalRange(3, 7) : economyLocked ? arrivalRange(12, 15) : arrivalRange(21, 28)}
                  </li>
                  <li className="flex items-center gap-2 rounded-xl bg-teal/[0.07] px-3 py-2.5">
                    <Package size={14} className="flex-none text-teal-deep" />
                    Checked by us before it ships
                  </li>
                </ul>
              </div>
            )
          })()
        ) : dualPricing.fixedPrice ? (
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
            {/* Local shops never reach this card — they use the layout above. */}
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
                  {economyLocked ? 'Coming soon' : `Arrives around ${arrivalRange(21, 28)} · 3–4 weeks`}
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
                  Arrives around {arrivalRange(12, 15)} · 12–15 days
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

        {/* What happens after ordering — one line, same for every store
            (never says where a shop is). */}
        {!isMarketplace && (
          <p className="mt-3 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-ink/50">
            <span className="font-semibold text-ink/65">After you order:</span>
            we buy it <ChevronRight size={11} className="text-ink/30" /> check it <ChevronRight size={11} className="text-ink/30" /> deliver it to your door
          </p>
        )}

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
          <div className="mt-5 lg:my-auto lg:py-6">
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
          <div id="buy-actions" className="lg:flex lg:flex-1 lg:flex-col">
          <ProductActions
            product={product}
            platform={platform}
            qty={qty}
            onQtyChange={setQty}
            selectedSize={selectedSize}
            selectedColor={selectedColor}
            onSelectSize={setSelectedSize}
            onSelectColor={setSelectedColor}
            variantStatus={variantState.status}
            variantUrl={variantUrl}
          />
          </div>
        )}
      </div>
    </>
  )
}