// components/stores/social/SocialStoreTiles.tsx
//
// The "Shops from Instagram & Facebook" section on /stores: one tile per
// custom seller, led by their own photos (cover, or their newest
// products), with logo, name, tagline and item count. Renders nothing
// while there are no such shops with products.
'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Play } from 'lucide-react'
import { imageThumb } from '@/lib/media'
import type { SocialStoreTile } from '@/lib/social-stores'

function TileArt({ tile }: { tile: SocialStoreTile }) {
  if (tile.cover) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={imageThumb(tile.cover, 700)} alt="" loading="lazy" className="h-full w-full object-cover" />
  }
  const [a, b, c] = tile.previews
  if (!a) {
    return <div className="h-full w-full bg-[radial-gradient(120%_140%_at_0%_0%,var(--color-teal)_0%,var(--color-indigo)_60%)]" />
  }
  if (!b) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={imageThumb(a, 700)} alt="" loading="lazy" className="h-full w-full object-cover object-top" />
  }
  // Newest product large on the left, the next one or two stacked on the right.
  return (
    <div className="grid h-full w-full grid-cols-3 gap-0.5">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={imageThumb(a, 500)} alt="" loading="lazy" className="col-span-2 h-full w-full object-cover object-top" />
      <div className={`grid h-full gap-0.5 ${c ? 'grid-rows-2' : 'grid-rows-1'}`}>
        {[b, c].filter(Boolean).map((src) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={src} src={imageThumb(src as string, 300)} alt="" loading="lazy" className="h-full min-h-0 w-full object-cover object-top" />
        ))}
      </div>
    </div>
  )
}

export default function SocialStoreTiles() {
  const [tiles, setTiles] = useState<SocialStoreTile[] | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch('/api/stores/social')
      .then((r) => (r.ok ? r.json() : { stores: [] }))
      .then((d: { stores?: SocialStoreTile[] }) => !cancelled && setTiles(d.stores ?? []))
      .catch(() => !cancelled && setTiles([]))
    return () => {
      cancelled = true
    }
  }, [])

  if (tiles !== null && tiles.length === 0) return null

  return (
    <section className="mb-10 sm:mb-16">
      <div className="mb-5 sm:mb-8">
        <h2 className="font-display text-xl font-extrabold tracking-tight text-ink sm:text-2xl">SHOPS FROM INSTAGRAM &amp; FACEBOOK</h2>
        <p className="mt-1 font-body text-sm text-ink/55">Small sellers you&rsquo;d usually message to order from. Browse their photos and videos and buy here.</p>
      </div>

      <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:grid sm:grid-cols-2 sm:gap-4 sm:overflow-visible sm:px-0 lg:grid-cols-3 [&::-webkit-scrollbar]:hidden">
        {tiles === null
          ? Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="w-[78vw] flex-none snap-start sm:w-auto">
                <div className="aspect-[16/10] animate-pulse rounded-2xl bg-ink/10" />
                <div className="mt-3 h-4 w-32 animate-pulse rounded bg-ink/10" />
              </div>
            ))
          : tiles.map((tile) => (
              <Link
                key={tile.slug}
                href={`/stores/${tile.slug}`}
                className="group w-[78vw] flex-none snap-start overflow-hidden rounded-2xl border border-ink/10 bg-card transition-shadow hover:shadow-lg sm:w-auto"
              >
                <div className="relative aspect-[16/10] overflow-hidden bg-ink/5">
                  <div className="h-full w-full transition-transform duration-700 group-hover:scale-[1.03]">
                    <TileArt tile={tile} />
                  </div>
                  {tile.videoCount > 0 && (
                    <span className="absolute right-2.5 top-2.5 flex items-center gap-1 rounded-full bg-ink/70 px-2 py-1 font-body text-[10px] font-semibold text-white backdrop-blur-sm">
                      <Play size={10} fill="currentColor" /> {tile.videoCount} video{tile.videoCount === 1 ? '' : 's'}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3 p-3.5">
                  <span className="grid h-11 w-11 flex-none place-items-center overflow-hidden rounded-full border border-ink/10 bg-parchment">
                    {tile.logo ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={imageThumb(tile.logo, 120)} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <span className="font-display text-lg font-bold text-teal-deep">{tile.name.charAt(0).toUpperCase()}</span>
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-body text-sm font-bold text-ink group-hover:text-teal-deep">{tile.name}</p>
                    <p className="truncate font-body text-xs text-ink/50">
                      {tile.itemCount} item{tile.itemCount === 1 ? '' : 's'}
                      {tile.tagline ? ` · ${tile.tagline}` : ''}
                    </p>
                  </div>
                </div>
              </Link>
            ))}
      </div>
    </section>
  )
}
