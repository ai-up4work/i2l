// components/stores/social/ReelsRow.tsx
//
// A row of the store's product videos. Tapping one opens a full-screen,
// swipe-up viewer (one video per screen, like the reels the seller
// already posts) with the product's name, price and a link to buy it.
//
// Only the video on screen plays. Videos start muted — browsers block
// autoplay with sound — with a button to turn sound on.
'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import * as Dialog from '@radix-ui/react-dialog'
import { ChevronDown, ChevronUp, Play, Volume2, VolumeX, X } from 'lucide-react'
import { getProductPricing } from '@/lib/pricing'
import { imageThumb, videoPlayback, videoPoster } from '@/lib/media'
import type { StoreProduct } from '@/lib/store.types'
import { productHref } from './SocialProductCard'

type Reel = { product: StoreProduct; video: string }

function toReels(products: StoreProduct[]): Reel[] {
  // One reel per product (its first video), so the row shows variety.
  return products.flatMap((p) => (p.videos?.[0] ? [{ product: p, video: p.videos[0] }] : []))
}

export default function ReelsRow({
  products,
  platform,
  title = 'Watch and shop',
}: {
  products: StoreProduct[]
  platform: string
  title?: string
}) {
  const reels = toReels(products)
  const [openAt, setOpenAt] = useState<number | null>(null)

  if (reels.length === 0) return null

  return (
    <section aria-label={title}>
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="font-display text-xl font-bold text-ink">{title}</h2>
        <span className="font-body text-xs text-ink/45">
          {reels.length} video{reels.length === 1 ? '' : 's'}
        </span>
      </div>

      <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:-mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden">
        {reels.map((reel, i) => {
          const pricing = getProductPricing(reel.product)
          return (
            <button
              key={reel.product.id}
              type="button"
              onClick={() => setOpenAt(i)}
              aria-label={`Play video: ${reel.product.name}`}
              className="group relative aspect-[9/16] w-[38vw] max-w-[190px] flex-none snap-start overflow-hidden rounded-2xl bg-ink text-left sm:w-44"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={videoPoster(reel.video, 400) || reel.product.image}
                alt=""
                loading="lazy"
                className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
              />
              <span className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/0 to-black/10" />
              <span className="absolute left-2.5 top-2.5 grid h-7 w-7 place-items-center rounded-full bg-white/90 text-ink">
                <Play size={12} fill="currentColor" />
              </span>
              <span className="absolute inset-x-2.5 bottom-2.5 text-white">
                <span className="line-clamp-2 font-body text-xs font-semibold leading-snug">{reel.product.name}</span>
                <span className="mt-0.5 block font-body text-xs font-bold">{pricing.formattedPrice}</span>
              </span>
            </button>
          )
        })}
      </div>

      <Dialog.Root open={openAt != null} onOpenChange={(open) => !open && setOpenAt(null)}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[60] bg-black" />
          <Dialog.Content className="fixed inset-0 z-[60] focus:outline-none" onOpenAutoFocus={(e) => e.preventDefault()}>
            <Dialog.Title className="sr-only">{title}</Dialog.Title>
            {openAt != null && <ReelsViewer reels={reels} platform={platform} startAt={openAt} />}
            <Dialog.Close asChild>
              <button
                type="button"
                aria-label="Close videos"
                className="absolute right-3 top-3 z-10 grid h-10 w-10 place-items-center rounded-full bg-black/50 text-white backdrop-blur-sm"
              >
                <X size={18} />
              </button>
            </Dialog.Close>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </section>
  )
}

function ReelsViewer({ reels, platform, startAt }: { reels: Reel[]; platform: string; startAt: number }) {
  const scrollerRef = useRef<HTMLDivElement | null>(null)
  const [active, setActive] = useState(startAt)
  const [muted, setMuted] = useState(true)

  // Jump to the tapped reel on open (no animation — it should just be there).
  useEffect(() => {
    const el = scrollerRef.current
    if (el) el.scrollTop = startAt * el.clientHeight
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Whichever slide fills the screen is the active one.
  useEffect(() => {
    const el = scrollerRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && entry.intersectionRatio >= 0.6) {
            setActive(Number((entry.target as HTMLElement).dataset.index))
          }
        }
      },
      { root: el, threshold: [0.6] },
    )
    el.querySelectorAll('[data-index]').forEach((node) => observer.observe(node))
    return () => observer.disconnect()
  }, [reels.length])

  // Play the active video, pause and rewind the rest.
  useEffect(() => {
    const el = scrollerRef.current
    if (!el) return
    el.querySelectorAll('video').forEach((video) => {
      const index = Number(video.dataset.video)
      if (index === active) {
        video.muted = muted
        video.play().catch(() => {})
      } else {
        video.pause()
        video.currentTime = 0
      }
    })
  }, [active, muted])

  function go(delta: number) {
    const el = scrollerRef.current
    if (!el) return
    const next = Math.max(0, Math.min(reels.length - 1, active + delta))
    el.scrollTo({ top: next * el.clientHeight, behavior: 'smooth' })
  }

  return (
    <>
      <div
        ref={scrollerRef}
        className="h-[100dvh] snap-y snap-mandatory overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') go(1)
          if (e.key === 'ArrowUp') go(-1)
        }}
        tabIndex={0}
      >
        {reels.map((reel, i) => {
          const pricing = getProductPricing(reel.product)
          // Only load video files near the one being watched.
          const near = Math.abs(i - active) <= 1
          return (
            <div key={reel.product.id} data-index={i} className="relative flex h-[100dvh] snap-start snap-always items-center justify-center">
              <video
                data-video={i}
                src={near ? videoPlayback(reel.video, 720) : undefined}
                poster={videoPoster(reel.video, 720) || undefined}
                loop
                playsInline
                muted={muted}
                preload={near ? 'auto' : 'none'}
                onClick={(e) => {
                  const v = e.currentTarget
                  if (v.paused) v.play().catch(() => {})
                  else v.pause()
                }}
                className="h-full w-full max-w-[560px] object-contain"
              />

              <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent px-4 pb-6 pt-24">
                <div className="pointer-events-auto mx-auto flex max-w-[560px] items-center gap-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={reel.product.image ? imageThumb(reel.product.image, 160) : videoPoster(reel.video, 160)}
                    alt=""
                    className="h-14 w-14 flex-none rounded-lg object-cover"
                  />
                  <div className="min-w-0 flex-1 text-white">
                    <p className="line-clamp-1 font-body text-sm font-semibold">{reel.product.name}</p>
                    <p className="font-body text-sm font-bold">
                      {pricing.formattedPrice}
                      {pricing.formattedCompareAtPrice != null && (
                        <span className="ml-1.5 text-xs font-normal text-white/60 line-through">{pricing.formattedCompareAtPrice}</span>
                      )}
                    </p>
                  </div>
                  <Link
                    href={productHref(platform, reel.product)}
                    className="flex-none rounded-full bg-white px-4 py-2.5 font-body text-xs font-bold text-ink hover:bg-parchment"
                  >
                    View product
                  </Link>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <div className="absolute right-3 top-1/2 z-10 flex -translate-y-1/2 flex-col gap-2">
        <button
          type="button"
          onClick={() => setMuted((m) => !m)}
          aria-label={muted ? 'Turn sound on' : 'Turn sound off'}
          className="grid h-10 w-10 place-items-center rounded-full bg-black/50 text-white backdrop-blur-sm"
        >
          {muted ? <VolumeX size={17} /> : <Volume2 size={17} />}
        </button>
        <button
          type="button"
          onClick={() => go(-1)}
          disabled={active === 0}
          aria-label="Previous video"
          className="hidden h-10 w-10 place-items-center rounded-full bg-black/50 text-white backdrop-blur-sm disabled:opacity-30 sm:grid"
        >
          <ChevronUp size={18} />
        </button>
        <button
          type="button"
          onClick={() => go(1)}
          disabled={active === reels.length - 1}
          aria-label="Next video"
          className="hidden h-10 w-10 place-items-center rounded-full bg-black/50 text-white backdrop-blur-sm disabled:opacity-30 sm:grid"
        >
          <ChevronDown size={18} />
        </button>
      </div>
    </>
  )
}
