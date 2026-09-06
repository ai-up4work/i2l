// components/stores/ProductGallery.tsx
'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'

export interface ProductGalleryTheme {
  frameBorder?: string
  activeThumb?: string
  restingThumb?: string
  placeholderText?: string
}

interface ProductGalleryProps {
  images: string[]
  alt?: string | null
  title?: string | null
  resetKey?: string | number
  theme?: ProductGalleryTheme
}

const AUTOPLAY_INTERVAL_MS = 8000
const EASE = [0.16, 1, 0.3, 1] as const

const DEFAULT_THEME: Required<ProductGalleryTheme> = {
  frameBorder: 'border-ink/10',
  activeThumb: 'ring-1 ring-ink',
  restingThumb: 'ring-1 ring-ink/10',
  placeholderText: 'text-ink/40',
}

function useIsScrollable<T extends HTMLElement>(ref: React.RefObject<T | null>, deps: unknown[]) {
  const [scrollable, setScrollable] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const check = () => setScrollable(el.scrollWidth > el.clientWidth + 1)
    check()
    const ro = new ResizeObserver(check)
    ro.observe(el)
    window.addEventListener('resize', check)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', check)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  return scrollable
}

const IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif'])

function normalizeFilename(filename: string): string {
  const parts = filename.split('.')
  if (parts.length <= 1) return filename
  const ext = parts[parts.length - 1].toLowerCase()
  if (!IMAGE_EXTENSIONS.has(ext)) return filename
  return `${parts[0]}.${ext}`
}

function getImageIdentity(url: string): string {
  try {
    const u = new URL(url)
    const segments = u.pathname.split('/').filter(Boolean)
    const normalized = segments
      .map((seg, i) => {
        if (/^\d+$/.test(seg)) return null
        return i === segments.length - 1 ? normalizeFilename(seg) : seg
      })
      .filter((seg): seg is string => seg !== null)
    return `${u.hostname}/${normalized.join('/')}`
  } catch {
    return url
  }
}

function getSizeHint(url: string): number {
  const candidates: number[] = []
  try {
    const u = new URL(url)
    u.pathname.split('/').forEach((seg) => {
      if (/^\d+$/.test(seg)) candidates.push(Number(seg))
    })
    for (const m of u.pathname.matchAll(/S[XYL](\d+)/gi)) {
      candidates.push(Number(m[1]))
    }
    for (const key of ['w', 'width', 'h', 'height', 'size']) {
      const val = u.searchParams.get(key)
      if (val && /^\d+$/.test(val)) candidates.push(Number(val))
    }
  } catch {
    // no candidates gathered — falls through to the 0 default below
  }
  return candidates.length ? Math.max(...candidates) : 0
}

const MIN_ACCEPTABLE_SIZE = 200

function isLowResolution(url: string): boolean {
  const size = getSizeHint(url)
  return size > 0 && size < MIN_ACCEPTABLE_SIZE
}

function isPromoImage(url: string): boolean {
  try {
    const u = new URL(url)
    return u.pathname.toLowerCase().includes('/promos/')
  } catch {
    return false
  }
}

function isVideoOverlayThumb(url: string): boolean {
  return /play-button-overlay/i.test(url)
}

function dedupeImages(images: string[]): string[] {
  const byIdentity = new Map<string, string>()
  for (const url of images.filter(
    (u) => Boolean(u) && !isPromoImage(u) && !isVideoOverlayThumb(u) && !isLowResolution(u)
  )) {
    const key = getImageIdentity(url)
    const existing = byIdentity.get(key)
    if (!existing || getSizeHint(url) > getSizeHint(existing)) {
      byIdentity.set(key, url)
    }
  }
  return Array.from(byIdentity.values())
}

export default function ProductGallery({ images, alt, title, resetKey, theme }: ProductGalleryProps) {
  // `alt` is the true accessible label; `title` is a convenience fallback so callers
  // that only have a product title (like AmazonProductView) don't have to duplicate it.
  const resolvedAlt = alt ?? title ?? 'Product image'
  const t = { ...DEFAULT_THEME, ...theme }

  const deduped = dedupeImages(images)
  const safeImages = deduped.length ? deduped : ['/placeholder.png']
  const hasMultiple = safeImages.length > 1
  const reduceMotion = useReducedMotion()

  const [activeIndex, setActiveIndex] = useState(0)
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const [isHovering, setIsHovering] = useState(false)
  const [autoplayRunId, setAutoplayRunId] = useState(0)

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const thumbStripRef = useRef<HTMLDivElement | null>(null)
  const lightboxThumbStripRef = useRef<HTMLDivElement | null>(null)

  const thumbsScrollable = useIsScrollable(thumbStripRef, [safeImages.length])
  const lightboxThumbsScrollable = useIsScrollable(lightboxThumbStripRef, [safeImages.length, lightboxOpen])

  // Reset back to the first slide (and close the lightbox) whenever resetKey
  // changes — i.e. when the caller navigates to a different product, rather
  // than leaving the gallery on whatever slide index the previous product left it at.
  useEffect(() => {
    setActiveIndex(0)
    setAutoplayRunId((n) => n + 1)
    setLightboxOpen(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey])

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
    setAutoplayRunId((n) => n + 1)
    clearTimer()
  }, [clearTimer])

  const scrollThumbs = useCallback((direction: 'left' | 'right') => {
    const el = thumbStripRef.current
    if (!el) return
    const amount = el.clientWidth * 0.8
    el.scrollBy({ left: direction === 'left' ? -amount : amount, behavior: 'smooth' })
  }, [])

  useEffect(() => {
    if (!hasMultiple || isHovering || lightboxOpen) {
      clearTimer()
      return
    }
    timerRef.current = setInterval(() => {
      setActiveIndex((i) => (i === safeImages.length - 1 ? 0 : i + 1))
      setAutoplayRunId((n) => n + 1)
    }, AUTOPLAY_INTERVAL_MS)
    return clearTimer
  }, [hasMultiple, isHovering, lightboxOpen, safeImages.length, clearTimer])

  useEffect(() => {
    if (!lightboxOpen) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') goPrev()
      if (e.key === 'ArrowRight') goNext()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [lightboxOpen, goPrev, goNext])

  const isPlaying = hasMultiple && !isHovering && !lightboxOpen
  const crossfadeDuration = reduceMotion ? 0 : 0.7
  const isPlaceholder = safeImages[activeIndex] === '/placeholder.png'

  return (
    <div className="min-w-0 w-full">
      <div
        className={`group relative overflow-hidden rounded-2xl border ${t.frameBorder} bg-card`}
        onMouseEnter={() => setIsHovering(true)}
        onMouseLeave={() => setIsHovering(false)}
        onFocus={() => setIsHovering(true)}
        onBlur={() => setIsHovering(false)}
      >
        <button
          type="button"
          onClick={() => setLightboxOpen(true)}
          aria-label="Open full-screen view"
          className="relative block w-full cursor-zoom-in focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal focus-visible:ring-offset-2"
        >
          <img src={safeImages[activeIndex]} alt="" aria-hidden="true" className="block w-full h-auto opacity-0" />

          <AnimatePresence initial={false}>
            <motion.img
              key={safeImages[activeIndex] + activeIndex}
              src={safeImages[activeIndex]}
              alt={resolvedAlt}
              className={`absolute inset-0 h-full w-full object-contain ${isPlaceholder ? t.placeholderText : ''}`}
              initial={{ opacity: 0, scale: reduceMotion ? 1 : 1.015 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: crossfadeDuration, ease: EASE }}
            />
          </AnimatePresence>
        </button>

        {hasMultiple && (
          <div className="absolute inset-x-3 top-3 flex gap-1">
            {safeImages.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => selectManual(i)}
                aria-label={`Go to image ${i + 1}`}
                aria-current={i === activeIndex}
                className="h-[3px] flex-1 overflow-hidden rounded-full bg-white/30"
              >
                {i < activeIndex ? (
                  <span className="block h-full w-full bg-white" />
                ) : i > activeIndex ? (
                  <span className="block h-full w-0 bg-white" />
                ) : (
                  <motion.span
                    key={autoplayRunId}
                    className="block h-full bg-white"
                    initial={{ width: '0%' }}
                    animate={{ width: isPlaying && !reduceMotion ? '100%' : reduceMotion ? '100%' : '0%' }}
                    transition={{ duration: isPlaying ? AUTOPLAY_INTERVAL_MS / 1000 : 0, ease: 'linear' }}
                  />
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {hasMultiple && (
        <div className="relative mt-3 flex items-center gap-1.5">
          {thumbsScrollable && (
            <button
              type="button"
              onClick={() => scrollThumbs('left')}
              aria-label="Scroll thumbnails left"
              className="grid h-7 w-7 flex-none place-items-center rounded-full border border-ink/10 bg-white text-ink/50 shadow-sm transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal"
            >
              <ChevronLeft size={14} />
            </button>
          )}

          <div
            ref={thumbStripRef}
            className={`flex flex-1 snap-x snap-mandatory gap-2 overflow-x-auto scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${
              thumbsScrollable ? '' : 'justify-center'
            }`}
          >
            {safeImages.map((img, i) => (
              <button
                key={img + i}
                type="button"
                onClick={() => selectManual(i)}
                aria-current={i === activeIndex}
                aria-label={`View image ${i + 1}`}
                className={
                  i === activeIndex
                    ? `h-14 w-14 flex-none snap-start overflow-hidden rounded-lg shadow-sm transition-all duration-300 ${t.activeThumb}`
                    : `h-14 w-14 flex-none snap-start overflow-hidden rounded-lg opacity-55 grayscale-[20%] transition-all duration-300 hover:opacity-90 hover:grayscale-0 focus-visible:opacity-100 focus-visible:grayscale-0 ${t.restingThumb}`
                }
              >
                <img src={img} alt="" className="h-full w-full object-cover" />
              </button>
            ))}
          </div>

          {thumbsScrollable && (
            <button
              type="button"
              onClick={() => scrollThumbs('right')}
              aria-label="Scroll thumbnails right"
              className="grid h-7 w-7 flex-none place-items-center rounded-full border border-ink/10 bg-white text-ink/50 shadow-sm transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal"
            >
              <ChevronRight size={14} />
            </button>
          )}
        </div>
      )}

      <Dialog.Root open={lightboxOpen} onOpenChange={setLightboxOpen}>
        <Dialog.Portal>
          <Dialog.Overlay asChild>
            <motion.div
              className="fixed inset-0 z-50"
              style={{ background: 'radial-gradient(ellipse at center, rgba(18,18,18,0.96), rgba(0,0,0,0.99))' }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: reduceMotion ? 0 : 0.25 }}
            />
          </Dialog.Overlay>

          <Dialog.Content
            className="fixed inset-0 z-50 flex flex-col items-center justify-center px-4 focus:outline-none"
            onClick={() => setLightboxOpen(false)}
            onOpenAutoFocus={(e) => e.preventDefault()}
          >
            <Dialog.Title className="sr-only">{resolvedAlt} — full-screen image viewer</Dialog.Title>

            <Dialog.Close asChild>
              <button
                type="button"
                aria-label="Close"
                className="absolute right-4 top-4 grid h-9 w-9 place-items-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
              >
                <X size={18} />
              </button>
            </Dialog.Close>

            <div className="flex min-h-0 flex-1 items-center justify-center">
              <AnimatePresence initial={false} mode="wait">
                <motion.img
                  key={safeImages[activeIndex] + activeIndex}
                  src={safeImages[activeIndex]}
                  alt={resolvedAlt}
                  onClick={(e) => e.stopPropagation()}
                  className="block max-w-full max-h-[75vh] w-auto h-auto rounded-lg"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: crossfadeDuration, ease: EASE }}
                />
              </AnimatePresence>
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
                  className="absolute left-4 top-1/2 -translate-y-1/2 grid h-10 w-10 place-items-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
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
                  className="absolute right-4 top-1/2 -translate-y-1/2 grid h-10 w-10 place-items-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
                >
                  <ChevronRight size={20} />
                </button>

                <div
                  ref={lightboxThumbStripRef}
                  className={`mt-4 flex max-w-full gap-2 overflow-x-auto px-2 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${
                    lightboxThumbsScrollable ? '' : 'justify-center'
                  }`}
                  onClick={(e) => e.stopPropagation()}
                >
                  {safeImages.map((img, i) => (
                    <button
                      key={img + i}
                      type="button"
                      onClick={() => selectManual(i)}
                      aria-label={`Go to image ${i + 1}`}
                      aria-current={i === activeIndex}
                      className={
                        i === activeIndex
                          ? 'h-12 w-12 flex-none overflow-hidden rounded-lg ring-1 ring-white transition-all duration-300'
                          : 'h-12 w-12 flex-none overflow-hidden rounded-lg opacity-45 grayscale-[20%] ring-1 ring-white/20 transition-all duration-300 hover:opacity-80 hover:grayscale-0'
                      }
                    >
                      <img src={img} alt="" className="h-full w-full object-cover" />
                    </button>
                  ))}
                </div>

                <span className="mt-2 text-xs font-medium tracking-wide text-white/60 tabular-nums">
                  {activeIndex + 1} of {safeImages.length}
                </span>
              </>
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  )
}