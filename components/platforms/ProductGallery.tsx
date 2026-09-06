'use client'

import { useEffect, useState } from 'react'

export interface GalleryTheme {
  /** Border on the main image frame, e.g. 'border-ink/10' */
  frameBorder: string
  /** Full classes for the active thumbnail, e.g. 'border-teal-deep ring-1 ring-teal-deep' */
  activeThumb: string
  /** Classes for a non-active thumbnail, e.g. 'border-ink/10' */
  restingThumb: string
  /** Text color for the empty-state placeholder, e.g. 'text-ink/40' */
  placeholderText: string
}

interface ProductGalleryProps {
  images: string[]
  title?: string | null
  theme: GalleryTheme
  /** Reset key — pass result.url so the gallery resets when the product changes */
  resetKey?: string
}

export default function ProductGallery({ images, title, theme, resetKey }: ProductGalleryProps) {
  const [mainImage, setMainImage] = useState(images[0] ?? null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    setMainImage(images[0] ?? null)
    setLoaded(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey, images[0]])

  function selectImage(src: string) {
    if (src === mainImage) return
    setLoaded(false)
    setMainImage(src)
  }

  return (
    <div className="min-w-0">
      <div className={`group relative aspect-square overflow-hidden rounded-xl border bg-white ${theme.frameBorder}`}>
        {mainImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={mainImage}
            src={mainImage}
            alt={title ?? 'Product image'}
            onLoad={() => setLoaded(true)}
            className={`h-full w-full object-contain p-3 transition-all duration-300 ease-out group-hover:scale-[1.04] ${
              loaded ? 'scale-100 opacity-100' : 'scale-[0.98] opacity-0'
            }`}
          />
        ) : (
          <div className={`grid h-full place-items-center text-xs ${theme.placeholderText}`}>No image found</div>
        )}
      </div>

      {images.length > 1 && (
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
          {images.slice(0, 8).map((src, i) => {
            const active = mainImage === src
            return (
              <button
                key={src + i}
                type="button"
                onClick={() => selectImage(src)}
                aria-label={`View image ${i + 1}`}
                aria-current={active}
                className={`h-16 w-16 flex-none overflow-hidden rounded-xl border bg-white transition-colors duration-150 ${
                  active ? theme.activeThumb : `${theme.restingThumb} hover:opacity-80`
                }`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src} alt="" className="h-full w-full object-contain p-1" />
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}