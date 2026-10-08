// components/stores/social/SocialProductCard.tsx
//
// Product card for custom (Instagram / Facebook) seller stores: a tall
// photo that fills the card, the price first, and a wishlist heart that's
// always tappable (the standard card only shows it on hover, which
// doesn't exist on a phone). A play badge marks products with a video.
'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import { Heart, Play } from 'lucide-react'
import { useWishlist, type WishlistProduct } from '@/contexts/Wishlistcontext'
import { getProductPricing } from '@/lib/pricing'
import { imageThumb } from '@/lib/media'
import type { StoreProduct } from '@/lib/store.types'

const FALLBACK_IMAGE = '/placeholder-product.png'

export function toWishlistSnapshot(product: StoreProduct, platform: string): WishlistProduct {
  const url = product.url || ''
  const id = url || `${platform}:${product.id}`
  return {
    id,
    url: url || id,
    site: platform,
    title: product.name,
    image: product.images?.[0] ?? product.image ?? null,
    currencyCode: product.currency ?? null,
    price: product.price != null ? String(product.price) : null,
  }
}

export function productHref(platform: string, product: Pick<StoreProduct, 'handle'>): string {
  return `/stores/${platform}/product/${encodeURIComponent(product.handle)}`
}

export default function SocialProductCard({
  product,
  platform,
  storeName,
  showStore = false,
}: {
  product: StoreProduct
  platform: string
  storeName?: string
  /** Show the store name line (used where products from the same store
   *  are listed away from that store's own page). */
  showStore?: boolean
}) {
  const wishlist = useWishlist()
  const snapshot = useMemo(() => toWishlistSnapshot(product, platform), [product, platform])
  const wishlisted = wishlist.isInWishlist(snapshot.id)
  const pricing = getProductPricing(product)
  const href = productHref(platform, product)
  const hasVideo = Boolean(product.videos?.length)
  const lowStock = product.inStock && product.stockCount != null && product.stockCount > 0 && product.stockCount <= 3

  return (
    <div className="group relative flex flex-col">
      <Link href={href} className="relative block aspect-[3/4] overflow-hidden rounded-xl bg-ink/5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={product.image ? imageThumb(product.image, 600) : FALLBACK_IMAGE}
          alt={product.name}
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={(e) => {
            e.currentTarget.src = FALLBACK_IMAGE
          }}
          className={`h-full w-full object-cover object-top transition-transform duration-700 group-hover:scale-[1.04] ${
            product.inStock ? '' : 'opacity-60 grayscale-[0.4]'
          }`}
        />

        <div className="absolute left-2 top-2 flex flex-col items-start gap-1">
          {pricing.discountPercent != null && pricing.discountPercent > 0 && (
            <span className="rounded-md bg-ink px-1.5 py-0.5 text-[10px] font-bold text-white">-{pricing.discountPercent}%</span>
          )}
          {!product.inStock && (
            <span className="rounded-md bg-card/95 px-1.5 py-0.5 text-[10px] font-bold text-ink">Sold out</span>
          )}
          {lowStock && (
            <span className="rounded-md bg-gold px-1.5 py-0.5 text-[10px] font-bold text-ink">Only {product.stockCount} left</span>
          )}
        </div>

        {hasVideo && (
          <span className="absolute bottom-2 left-2 flex items-center gap-1 rounded-full bg-ink/70 px-2 py-1 text-[10px] font-semibold text-white backdrop-blur-sm">
            <Play size={10} fill="currentColor" /> Video
          </span>
        )}
      </Link>

      <button
        type="button"
        onClick={() => wishlist.toggleItem(snapshot)}
        aria-label={wishlisted ? 'Remove from wishlist' : 'Add to wishlist'}
        aria-pressed={wishlisted}
        className="absolute right-2 top-2 grid h-9 w-9 place-items-center rounded-full bg-card/90 shadow-sm backdrop-blur-sm transition-transform active:scale-90"
      >
        <Heart size={16} className={wishlisted ? 'fill-red-500 text-red-500' : 'text-ink/70'} />
      </button>

      <Link href={href} className="mt-2.5 flex flex-col px-0.5">
        <span className="flex flex-wrap items-baseline gap-x-1.5">
          <span className="font-body text-sm font-bold text-ink">{pricing.formattedPrice}</span>
          {pricing.formattedCompareAtPrice != null && (
            <span className="font-body text-[11px] text-ink/40 line-through">{pricing.formattedCompareAtPrice}</span>
          )}
        </span>
        {showStore && storeName && (
          <span className="mt-0.5 truncate font-body text-[11px] font-semibold uppercase tracking-wide text-ink/45">{storeName}</span>
        )}
        <span className="mt-0.5 line-clamp-2 font-body text-[13px] leading-snug text-ink/70">{product.name}</span>
      </Link>
    </div>
  )
}

export function SocialProductCardSkeleton() {
  return (
    <div className="flex flex-col">
      <div className="aspect-[3/4] animate-pulse rounded-xl bg-ink/10" />
      <div className="mt-2.5 h-3.5 w-20 animate-pulse rounded bg-ink/10" />
      <div className="mt-1.5 h-3 w-full animate-pulse rounded bg-ink/10" />
    </div>
  )
}
