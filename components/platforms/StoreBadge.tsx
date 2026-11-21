'use client'

// Header mark for ad-hoc Shopify / WooCommerce links: the store's own favicon
// and name when the scraper found them, otherwise the generic platform logo
// (Shopify / WooCommerce) as the last resort. The favicon is an arbitrary
// third-party URL, so a plain <img> is used and a failed load drops back to
// the platform logo instead of showing a broken image.

import { useState } from 'react'
import Image from 'next/image'

type Props = {
  storeName?: string | null
  storeFavicon?: string | null
  fallbackLogoSrc: string
  fallbackAlt: string
  fallbackWidth: number
  fallbackHeight: number
}

export default function StoreBadge({
  storeName,
  storeFavicon,
  fallbackLogoSrc,
  fallbackAlt,
  fallbackWidth,
  fallbackHeight,
}: Props) {
  const [iconFailed, setIconFailed] = useState(false)
  const name = storeName?.trim() || null
  const icon = storeFavicon && !iconFailed ? storeFavicon : null

  if (!name && !icon) {
    return (
      <Image
        src={fallbackLogoSrc}
        alt={fallbackAlt}
        width={fallbackWidth}
        height={fallbackHeight}
        style={{ height: fallbackHeight, width: 'auto' }}
      />
    )
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      {icon && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={icon}
          alt=""
          width={20}
          height={20}
          referrerPolicy="no-referrer"
          loading="lazy"
          onError={() => setIconFailed(true)}
          className="h-5 w-5 shrink-0 rounded-sm object-contain"
        />
      )}
      {name && <span className="text-sm font-semibold text-ink/70">{name}</span>}
    </span>
  )
}
