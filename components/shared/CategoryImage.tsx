'use client'

// A category's photo from public/categories/ (lib/store-categories.ts).
// The category's icon always sits underneath; if the photo file is missing
// the <img> just hides itself and the icon shows through.
//
// Deliberately no React state: swapping the <img> for an icon with
// setState made the browser's HTML differ from the server's when the
// image failed before React loaded (a hydration error). Hiding it with a
// style change keeps the HTML the same on both sides.

import { useEffect, useRef } from 'react'
import type { StoreCategory } from '@/lib/store-categories'

export default function CategoryImage({
  category,
  className = '',
  iconClassName = 'h-6 w-6',
}: {
  category: StoreCategory
  className?: string
  iconClassName?: string
}) {
  const img = useRef<HTMLImageElement | null>(null)
  const Icon = category.icon

  // The image may have failed before React attached onError (it's in the
  // server HTML), so check once on mount too.
  useEffect(() => {
    const el = img.current
    if (el && el.complete && el.naturalWidth === 0) el.style.display = 'none'
  }, [])

  return (
    <span className={`block overflow-hidden ${className}`}>
      <span aria-hidden className="absolute inset-0 grid place-items-center bg-teal/10 text-teal-deep">
        <Icon className={iconClassName} strokeWidth={1.8} />
      </span>
      {/* eslint-disable-next-line @next/next/no-img-element -- static file from public/, hides itself if missing */}
      <img
        ref={img}
        src={category.image}
        alt=""
        loading="lazy"
        onError={(e) => {
          e.currentTarget.style.display = 'none'
        }}
        className="absolute inset-0 h-full w-full object-cover"
      />
    </span>
  )
}
