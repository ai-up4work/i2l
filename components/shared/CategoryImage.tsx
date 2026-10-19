'use client'

// A category's photo from public/categories/ (lib/store-categories.ts).
// If the file is missing, shows the category's icon instead, so a new
// category never shows a broken image while its photo is being added.

import { useEffect, useRef, useState } from 'react'
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
  const [failed, setFailed] = useState(false)
  const img = useRef<HTMLImageElement | null>(null)
  const Icon = category.icon

  // The image can fail before React is ready to hear onError (it's in the
  // server HTML), so also check once on mount.
  useEffect(() => {
    const el = img.current
    if (el && el.complete && el.naturalWidth === 0) setFailed(true)
  }, [])

  if (failed) {
    return (
      <span className={`grid place-items-center bg-teal/10 text-teal-deep ${className}`}>
        <Icon className={iconClassName} strokeWidth={1.8} aria-hidden />
      </span>
    )
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- static file from public/, onError fallback
    <img ref={img} src={category.image} alt="" loading="lazy" onError={() => setFailed(true)} className={`object-cover ${className}`} />
  )
}
