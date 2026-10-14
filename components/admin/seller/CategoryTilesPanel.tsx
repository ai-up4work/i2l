'use client'

// Seller wizard: the images for a store's "Shop by category" row.
//
// After the extractor test passes, every category is shown with its
// image: the store's own category image when it has one, otherwise a
// random product photo from that category (picked automatically). Staff
// can click a category to choose a different photo, and untick the ones
// that shouldn't appear on the store page. Saved with the store as
// provider_config.categoryTiles — see lib/category-tiles.ts.

import { useState } from 'react'
import { Check, ImageOff, Loader2, RefreshCw } from 'lucide-react'
import type { CategoryImageCandidate, CategoryTile } from '@/lib/category-tiles'

const SOURCE_LABEL: Record<CategoryTile['source'], string> = {
  store: 'Store image',
  product: 'From a product',
  chosen: 'Chosen',
  none: 'No image',
}

const SOURCE_TONE: Record<CategoryTile['source'], string> = {
  store: 'bg-teal/10 text-teal-deep',
  product: 'bg-indigo-50 text-indigo-700',
  chosen: 'bg-ink text-parchment',
  none: 'bg-gold/15 text-ink/70',
}

function Thumb({ src, size, className = '' }: { src: string | null; size: number; className?: string }) {
  const [failed, setFailed] = useState(false)
  if (!src || failed) {
    return (
      <span style={{ width: size, height: size }} className={`grid flex-none place-items-center rounded-full bg-ink/[0.05] text-ink/30 ${className}`}>
        <ImageOff size={size / 3.5} />
      </span>
    )
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      style={{ width: size, height: size }}
      className={`flex-none rounded-full border border-ink/10 bg-card object-cover object-top ${className}`}
    />
  )
}

export function CategoryTilesPanel({
  tiles,
  candidates,
  loading,
  error,
  onChange,
  onRefresh,
  onSave,
  saveState = 'idle',
}: {
  tiles: CategoryTile[]
  candidates: CategoryImageCandidate[] | null
  loading: boolean
  error: string | null
  onChange: (tiles: CategoryTile[]) => void
  onRefresh?: () => void
  /** Editing a saved store: save just the category images. In the add
   *  wizard they're saved with the store on Finish instead. */
  onSave?: () => void
  saveState?: 'idle' | 'saving' | 'saved'
}) {
  const [open, setOpen] = useState<string | null>(null)
  const byHandle = new Map((candidates ?? []).map((c) => [c.handle, c]))

  const withImage = tiles.filter((t) => t.image).length
  const storeImages = tiles.filter((t) => t.source === 'store').length
  const shown = tiles.filter((t) => t.show && t.image).length

  const update = (handle: string, patch: Partial<CategoryTile>) =>
    onChange(tiles.map((t) => (t.handle === handle ? { ...t, ...patch } : t)))

  return (
    <div className="rounded-xl border border-ink/10 bg-parchment/60 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-ink/50">Category images</p>
          <p className="mt-0.5 text-xs text-ink/45">
            {loading
              ? 'Looking at each category for an image…'
              : tiles.length === 0
              ? 'No categories found yet.'
              : `${storeImages} of ${tiles.length} have the store’s own image · ${withImage - storeImages} use a product photo · ${shown} shown on the store page`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
        {onSave && tiles.length > 0 && (
          <button
            type="button"
            onClick={onSave}
            disabled={saveState === 'saving' || loading}
            className="inline-flex items-center gap-1.5 rounded-full bg-teal-deep px-3 py-1.5 text-xs font-semibold text-parchment hover:bg-teal disabled:opacity-50"
          >
            {saveState === 'saving' ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
            {saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Saved' : 'Save category images'}
          </button>
        )}
        {onRefresh && (
          <button
            type="button"
            onClick={onRefresh}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-full border border-ink/15 bg-card px-3 py-1.5 text-xs font-semibold text-ink/70 hover:text-ink disabled:opacity-50"
          >
            {loading ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />} {tiles.length ? 'Look again' : 'Find category images'}
          </button>
        )}
        </div>
      </div>

      {error && <p className="mt-3 text-xs font-semibold text-red-700">{error}</p>}

      {tiles.length > 0 && (
        <>
          <p className="mt-3 text-xs text-ink/50">
            Shoppers see the ticked categories as round photos at the top of the store. Click a photo to choose a different one.
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-4">
            {tiles.map((t) => {
              const c = byHandle.get(t.handle)
              const options = Array.from(new Set([c?.storeImage, ...(c?.productImages ?? []), t.image].filter((x): x is string => Boolean(x))))
              const isOpen = open === t.handle
              return (
                <div key={t.handle} className={`rounded-xl border bg-card p-3 transition-colors ${t.show && t.image ? 'border-teal-deep/25' : 'border-ink/10'} ${isOpen ? 'col-span-2 sm:col-span-3 xl:col-span-4' : ''}`}>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setOpen(isOpen ? null : t.handle)}
                      disabled={options.length === 0}
                      title={options.length ? 'Choose a different photo' : 'No photos found for this category'}
                      className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-teal/40 disabled:cursor-default"
                    >
                      <Thumb src={t.image} size={56} />
                    </button>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-ink">{t.title}</p>
                      <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-bold ${SOURCE_TONE[t.source]}`}>{SOURCE_LABEL[t.source]}</span>
                    </div>
                    <label className="flex flex-none cursor-pointer items-center gap-1.5 text-[11px] font-semibold text-ink/55" title={t.image ? undefined : 'Needs a photo first'}>
                      <input
                        type="checkbox"
                        checked={t.show && Boolean(t.image)}
                        disabled={!t.image}
                        onChange={(e) => update(t.handle, { show: e.target.checked })}
                        className="h-3.5 w-3.5 accent-teal-deep"
                      />
                      Show
                    </label>
                  </div>

                  {isOpen && (
                    <div className="mt-3 border-t border-ink/[0.06] pt-3">
                      <p className="text-[11px] font-semibold text-ink/45">Choose the photo for {t.title}</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {options.map((src) => {
                          const on = t.image === src
                          const isStore = c?.storeImage === src
                          return (
                            <button
                              key={src}
                              type="button"
                              onClick={() => {
                                update(t.handle, { image: src, source: isStore ? 'store' : 'chosen', show: true })
                                setOpen(null)
                              }}
                              className={`relative rounded-full ring-2 ring-offset-2 ring-offset-card transition ${on ? 'ring-teal-deep' : 'ring-transparent hover:ring-ink/20'}`}
                              title={isStore ? 'The store’s own category image' : 'A product photo from this category'}
                            >
                              <Thumb src={src} size={64} />
                              {on && (
                                <span className="absolute -right-1 -top-1 grid h-5 w-5 place-items-center rounded-full bg-teal-deep text-white">
                                  <Check size={11} strokeWidth={3} />
                                </span>
                              )}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
