'use client'

// WhatsApp-style album: several chat photos / videos shown as one grid
// inside a single bubble (grouping rules: lib/chat-albums.ts).
//
//   2 items  → side by side
//   3 items  → one wide on top, two below
//   4+ items → 2 × 2, the last tile showing "+N" for the rest
//
// Tapping a tile opens a full-screen viewer that can flip through every
// item in the album (arrows, ← / → keys, Esc to close). Single
// attachments keep using AttachmentMedia.

import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronLeft, ChevronRight, Play, X } from 'lucide-react'

export interface AlbumItem {
  url: string
  kind: 'image' | 'video'
}

export default function AttachmentAlbum({
  items,
  onDelete,
  className = '',
}: {
  items: AlbumItem[]
  /** Admin only: shows a delete button on each tile (index into `items`). */
  onDelete?: (index: number) => void
  className?: string
}) {
  const [openAt, setOpenAt] = useState<number | null>(null)
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  const count = items.length
  const tiles = items.slice(0, 4)
  const extra = count - tiles.length

  const step = useCallback(
    (dir: 1 | -1) => setOpenAt((i) => (i === null ? i : (i + dir + count) % count)),
    [count],
  )

  useEffect(() => {
    if (openAt === null) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenAt(null)
      else if (e.key === 'ArrowRight') step(1)
      else if (e.key === 'ArrowLeft') step(-1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [openAt, step])

  const open = openAt !== null ? items[openAt] : null

  return (
    <>
      <div className={`grid w-64 max-w-full grid-cols-2 gap-0.5 overflow-hidden rounded-lg ${className}`}>
        {tiles.map((item, i) => {
          const wide = count === 3 && i === 0
          const showMore = i === 3 && extra > 0
          return (
            <div key={`${item.url}-${i}`} className={`group/tile relative ${wide ? 'col-span-2 aspect-[2/1]' : 'aspect-square'}`}>
              <button
                type="button"
                onClick={() => setOpenAt(i)}
                aria-label={`Open ${item.kind === 'video' ? 'video' : 'photo'} ${i + 1} of ${count}`}
                className="block h-full w-full cursor-zoom-in bg-ink/10"
              >
                {item.kind === 'video' ? (
                  <>
                    <video src={item.url} muted playsInline preload="metadata" className="h-full w-full object-cover" />
                    <span className="absolute inset-0 grid place-items-center">
                      <span className="grid h-9 w-9 place-items-center rounded-full bg-black/55 text-white">
                        <Play size={16} className="translate-x-px" fill="currentColor" />
                      </span>
                    </span>
                  </>
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.url} alt={`Photo ${i + 1} of ${count}`} className="h-full w-full object-cover" loading="lazy" />
                )}
                {showMore && (
                  <span className="absolute inset-0 grid place-items-center bg-black/50 font-body text-2xl font-semibold text-white">
                    +{extra}
                  </span>
                )}
              </button>
              {onDelete && !showMore && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    onDelete(i)
                  }}
                  aria-label={`Delete ${item.kind === 'video' ? 'video' : 'photo'} ${i + 1}`}
                  title="Delete attachment"
                  className="absolute right-1 top-1 grid h-6 w-6 place-items-center rounded-full bg-black/60 text-white opacity-0 transition-opacity hover:bg-black/80 focus-visible:opacity-100 group-hover/tile:opacity-100"
                >
                  <X size={13} />
                </button>
              )}
            </div>
          )
        })}
      </div>

      {mounted &&
        open &&
        createPortal(
          <div
            className="fixed inset-0 z-[200] flex items-center justify-center bg-ink/90 p-4 backdrop-blur-sm"
            onClick={() => setOpenAt(null)}
            role="dialog"
            aria-modal="true"
            aria-label={`Photo ${openAt! + 1} of ${count}`}
          >
            <div onClick={(e) => e.stopPropagation()} className="flex max-h-full max-w-full items-center justify-center">
              {open.kind === 'video' ? (
                // eslint-disable-next-line jsx-a11y/media-has-caption
                <video key={open.url} src={open.url} controls autoPlay className="max-h-[86vh] max-w-[92vw] rounded-xl shadow-2xl" />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={open.url} alt="" className="max-h-[86vh] max-w-[92vw] rounded-xl object-contain shadow-2xl" />
              )}
            </div>

            {count > 1 && (
              <>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    step(-1)
                  }}
                  aria-label="Previous"
                  className="absolute left-3 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-black/40 text-white transition-colors hover:bg-black/60 sm:left-6"
                >
                  <ChevronLeft size={22} />
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    step(1)
                  }}
                  aria-label="Next"
                  className="absolute right-3 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-black/40 text-white transition-colors hover:bg-black/60 sm:right-6"
                >
                  <ChevronRight size={22} />
                </button>
                <span className="absolute bottom-5 left-1/2 -translate-x-1/2 rounded-full bg-black/45 px-3 py-1 font-body text-xs font-semibold text-white">
                  {openAt! + 1} / {count}
                </span>
              </>
            )}

            <button
              type="button"
              onClick={() => setOpenAt(null)}
              aria-label="Close"
              className="absolute right-5 top-5 grid h-10 w-10 place-items-center rounded-full bg-black/40 text-white transition-colors hover:bg-black/60"
            >
              <X size={20} />
            </button>
          </div>,
          document.body,
        )}
    </>
  )
}
