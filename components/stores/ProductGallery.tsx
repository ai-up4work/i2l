// components/stores/ProductGallery.tsx
'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'

interface ProductGalleryProps {
  images: string[]
  alt: string
}

const AUTOPLAY_INTERVAL_MS = 8000
const TRANSITION_MS = 700

export default function ProductGallery({ images, alt }: ProductGalleryProps) {
  const safeImages = images.length ? images : ['/placeholder.png']
  const hasMultiple = safeImages.length > 1

  const [activeIndex, setActiveIndex] = useState(0)
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const [isHovering, setIsHovering] = useState(false)

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const thumbStripRef = useRef<HTMLDivElement | null>(null)

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const goPrev = useCallback(() => {
    setActiveIndex((i) => (i === 0 ? safeImages.length - 1 : i - 1))
  }, [safeImages.length])

  const goNext = useCallback(() => {
    setActiveIndex((i) => (i === safeImages.length - 1 ? 0 : i + 1))
  }, [safeImages.length])

  const selectManual = useCallback((i: number) => {
    setActiveIndex(i)
    clearTimer()
  }, [clearTimer])

  // Scrolls the thumbnail strip left/right by roughly one "page" of visible
  // thumbnails, instead of jumping to a specific slide — this is just strip
  // navigation, independent of which image is currently active.
  const scrollThumbs = useCallback((direction: 'left' | 'right') => {
    const el = thumbStripRef.current
    if (!el) return
    const amount = el.clientWidth * 0.8
    el.scrollBy({ left: direction === 'left' ? -amount : amount, behavior: 'smooth' })
  }, [])

  // Autoplay: only on the main inline gallery, only with >1 image, paused
  // on hover or while the lightbox is open.
  useEffect(() => {
    if (!hasMultiple || isHovering || lightboxOpen) {
      clearTimer()
      return
    }
    timerRef.current = setInterval(() => {
      setActiveIndex((i) => (i === safeImages.length - 1 ? 0 : i + 1))
    }, AUTOPLAY_INTERVAL_MS)
    return clearTimer
  }, [hasMultiple, isHovering, lightboxOpen, safeImages.length, clearTimer])

  // Keyboard nav while the lightbox is open
  useEffect(() => {
    if (!lightboxOpen) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightboxOpen(false)
      if (e.key === 'ArrowLeft') goPrev()
      if (e.key === 'ArrowRight') goNext()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [lightboxOpen, goPrev, goNext])

  // Lock body scroll while lightbox is open
  useEffect(() => {
    if (!lightboxOpen) return
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prevOverflow
    }
  }, [lightboxOpen])

  return (
    <div>
      {/* Main image — full width, height follows the active slide's natural
          ratio; all slides sit stacked/absolute for the crossfade. */}
      <div
        className="relative overflow-hidden rounded-2xl border border-ink/10 bg-card"
        onMouseEnter={() => setIsHovering(true)}
        onMouseLeave={() => setIsHovering(false)}
      >
        <button
          type="button"
          onClick={() => setLightboxOpen(true)}
          className="relative block w-full"
        >
          {/* Sizing image: invisible, sets the container's aspect ratio to
              match the active slide so the crossfade layer below can be
              absolutely positioned without collapsing the container. */}
          <img src={safeImages[activeIndex]} alt="" aria-hidden="true" className="block w-full h-auto opacity-0" />

          {safeImages.map((img, i) => (
            <img
              key={img + i}
              src={img}
              alt={i === activeIndex ? alt : ''}
              aria-hidden={i !== activeIndex}
              className="absolute inset-0 h-full w-full object-contain transition-opacity ease-in-out"
              style={{
                opacity: i === activeIndex ? 1 : 0,
                transitionDuration: `${TRANSITION_MS}ms`,
              }}
            />
          ))}
        </button>

        {hasMultiple && (
          <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-1.5">
            {safeImages.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => selectManual(i)}
                aria-label={`Go to image ${i + 1}`}
                className={
                  i === activeIndex
                    ? 'h-1.5 w-5 rounded-full bg-white shadow transition-all'
                    : 'h-1.5 w-1.5 rounded-full bg-white/60 shadow transition-all hover:bg-white/80'
                }
              />
            ))}
          </div>
        )}
      </div>

      {/* Thumbnails — scrollbar hidden, arrow buttons scroll the strip instead */}
      {hasMultiple && (
        <div className="relative mt-3 flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => scrollThumbs('left')}
            aria-label="Scroll thumbnails left"
            className="grid h-7 w-7 flex-none place-items-center rounded-full border border-ink/10 bg-white text-ink/50 shadow-sm transition-colors hover:text-ink"
          >
            <ChevronLeft size={14} />
          </button>

          <div
            ref={thumbStripRef}
            className="flex flex-1 gap-2 overflow-x-auto scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {safeImages.map((img, i) => (
              <button
                key={img + i}
                type="button"
                onClick={() => selectManual(i)}
                className={
                  i === activeIndex
                    ? 'h-16 w-16 flex-none overflow-hidden rounded-lg ring-2 ring-teal'
                    : 'h-16 w-16 flex-none overflow-hidden rounded-lg ring-1 ring-ink/10 opacity-70 transition-opacity hover:opacity-100'
                }
              >
                <img src={img} alt="" className="h-full w-full object-cover" />
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => scrollThumbs('right')}
            aria-label="Scroll thumbnails right"
            className="grid h-7 w-7 flex-none place-items-center rounded-full border border-ink/10 bg-white text-ink/50 shadow-sm transition-colors hover:text-ink"
          >
            <ChevronRight size={14} />
          </button>
        </div>
      )}

        {/* Fullscreen lightbox / slideshow */}
        {lightboxOpen && (
        <div
            className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/90 px-4"
            role="dialog"
            aria-modal="true"
            onClick={() => setLightboxOpen(false)}
        >
            <button
            type="button"
            onClick={() => setLightboxOpen(false)}
            aria-label="Close"
            className="absolute right-4 top-4 grid h-9 w-9 place-items-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
            >
            <X size={18} />
            </button>

            <div className="flex min-h-0 flex-1 items-center justify-center">
            <img
                src={safeImages[activeIndex]}
                alt={alt}
                onClick={(e) => e.stopPropagation()}
                className="block max-w-full max-h-[75vh] w-auto h-auto rounded-lg transition-opacity"
                style={{ transitionDuration: `${TRANSITION_MS}ms` }}
            />
            </div>

            {hasMultiple && (
            <>
                <button
                type="button"
                onClick={(e) => {
                    e.stopPropagation()
                    goPrev()
                }}
                aria-label="Previous image"
                className="absolute left-4 top-1/2 -translate-y-1/2 grid h-10 w-10 place-items-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
                >
                <ChevronLeft size={20} />
                </button>
                <button
                type="button"
                onClick={(e) => {
                    e.stopPropagation()
                    goNext()
                }}
                aria-label="Next image"
                className="absolute right-4 top-1/2 -translate-y-1/2 grid h-10 w-10 place-items-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
                >
                <ChevronRight size={20} />
                </button>

                {/* Bottom thumbnail strip — tap any thumbnail to jump straight
                    to that image instead of stepping one-by-one with the arrows. */}
                <div
                className="mt-4 flex max-w-full gap-2 overflow-x-auto px-2 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                onClick={(e) => e.stopPropagation()}
                >
                {safeImages.map((img, i) => (
                    <button
                    key={img + i}
                    type="button"
                    onClick={() => selectManual(i)}
                    aria-label={`Go to image ${i + 1}`}
                    className={
                        i === activeIndex
                        ? 'h-14 w-14 flex-none overflow-hidden rounded-lg ring-2 ring-white'
                        : 'h-14 w-14 flex-none overflow-hidden rounded-lg ring-1 ring-white/30 opacity-60 transition-opacity hover:opacity-100'
                    }
                    >
                    <img src={img} alt="" className="h-full w-full object-cover" />
                    </button>
                ))}
                </div>

                <span className="mt-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white">
                {activeIndex + 1} / {safeImages.length}
                </span>
            </>
            )}
        </div>
        )}
    </div>
  )
}