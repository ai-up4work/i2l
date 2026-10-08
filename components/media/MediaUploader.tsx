// components/media/MediaUploader.tsx
//
// Photo + video picker for a product. Used by the seller portal and by
// staff in Admin → Catalogues. Files go straight to Cloudinary
// (lib/upload/useMediaUpload.ts); this component only holds the links.
//
// Built for phones first: one big "Add photos or videos" button that
// opens the gallery/camera, several files at once, a progress bar per
// file. The first photo is the main one shown on the store page.
'use client'

import { useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, ImagePlus, Loader2, Play, Star, X } from 'lucide-react'
import { CLIENT_MEDIA_LIMITS, kindOfFile, uploadMedia, type MediaKind } from '@/lib/upload/useMediaUpload'
import { imageThumb, videoPoster } from '@/lib/media'

type Pending = { id: string; name: string; kind: MediaKind; percent: number }

interface Props {
  images: string[]
  videos: string[]
  onChange: (next: { images: string[]; videos: string[] }) => void
  /** Staff only: the seller whose folder the files go into. */
  sellerId?: string
  /** Lets the parent block Save while files are still uploading. */
  onBusyChange?: (busy: boolean) => void
  disabled?: boolean
}

export default function MediaUploader({ images, videos, onChange, sellerId, onBusyChange, disabled }: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [pending, setPending] = useState<Pending[]>([])
  const [errors, setErrors] = useState<string[]>([])
  const [linkOpen, setLinkOpen] = useState(false)
  const [link, setLink] = useState('')

  // The latest lists, so several uploads finishing close together each
  // add to the newest list instead of overwriting one another.
  const latest = useRef({ images, videos })
  latest.current = { images, videos }
  const active = useRef(0)

  const L = CLIENT_MEDIA_LIMITS

  async function handleFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return
    const problems: string[] = []
    let imageRoom = L.image.maxCount - latest.current.images.length - pending.filter((p) => p.kind === 'image').length
    let videoRoom = L.video.maxCount - latest.current.videos.length - pending.filter((p) => p.kind === 'video').length

    const queue: { file: File; kind: MediaKind; id: string }[] = []
    for (const file of Array.from(fileList)) {
      const kind = kindOfFile(file)
      if (!kind) {
        problems.push(`${file.name}: not a photo or video we can use.`)
        continue
      }
      if (kind === 'image' ? imageRoom <= 0 : videoRoom <= 0) {
        problems.push(`${file.name}: you can add up to ${L[kind].maxCount} ${kind === 'image' ? 'photos' : 'videos'} per product.`)
        continue
      }
      if (kind === 'image') imageRoom--
      else videoRoom--
      queue.push({ file, kind, id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}` })
    }

    setErrors(problems)
    if (queue.length === 0) return
    setPending((p) => [...p, ...queue.map((q) => ({ id: q.id, name: q.file.name, kind: q.kind, percent: 0 }))])
    active.current += queue.length
    onBusyChange?.(true)

    await Promise.all(
      queue.map(async ({ file, kind, id }) => {
        try {
          const url = await uploadMedia(file, kind, {
            sellerId,
            onProgress: (percent) => setPending((p) => p.map((x) => (x.id === id ? { ...x, percent } : x))),
          })
          const cur = latest.current
          const next = kind === 'image' ? { images: [...cur.images, url], videos: cur.videos } : { images: cur.images, videos: [...cur.videos, url] }
          latest.current = next
          onChange(next)
        } catch (err) {
          setErrors((e) => [...e, `${file.name}: ${err instanceof Error ? err.message : 'Upload failed.'}`])
        } finally {
          setPending((p) => p.filter((x) => x.id !== id))
          active.current -= 1
          if (active.current === 0) onBusyChange?.(false)
        }
      }),
    )
  }

  function moveImage(index: number, to: number) {
    if (to < 0 || to >= images.length) return
    const next = [...images]
    const [item] = next.splice(index, 1)
    next.splice(to, 0, item)
    onChange({ images: next, videos })
  }

  function addLink() {
    const url = link.trim()
    if (!url) return
    if (!/^https:\/\//i.test(url)) return setErrors(['Photo links must start with https://'])
    if (images.length >= L.image.maxCount) return setErrors([`You can add up to ${L.image.maxCount} photos per product.`])
    onChange({ images: [...images, url], videos })
    setLink('')
    setLinkOpen(false)
    setErrors([])
  }

  const busy = pending.length > 0
  const empty = images.length === 0 && videos.length === 0 && !busy

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={`${L.image.accept},${L.video.accept}`}
        className="hidden"
        onChange={(e) => {
          void handleFiles(e.target.files)
          e.target.value = '' // so picking the same file again still fires
        }}
      />

      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {images.map((url, i) => (
          <div key={url + i} className="group relative aspect-square overflow-hidden rounded-xl border border-ink/10 bg-parchment">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imageThumb(url, 300)} alt="" className="h-full w-full object-cover" />
            {i === 0 && (
              <span className="absolute left-1.5 top-1.5 flex items-center gap-1 rounded-full bg-gold px-2 py-0.5 text-[10px] font-bold text-ink">
                <Star size={10} fill="currentColor" /> Main
              </span>
            )}
            <button
              type="button"
              onClick={() => onChange({ images: images.filter((_, x) => x !== i), videos })}
              aria-label={`Remove photo ${i + 1}`}
              className="absolute right-1.5 top-1.5 grid h-7 w-7 place-items-center rounded-full bg-ink/70 text-white hover:bg-ink"
            >
              <X size={14} />
            </button>
            {images.length > 1 && (
              <div className="absolute inset-x-1.5 bottom-1.5 flex justify-between">
                <button
                  type="button"
                  onClick={() => moveImage(i, i - 1)}
                  disabled={i === 0}
                  aria-label="Move photo earlier"
                  className="grid h-7 w-7 place-items-center rounded-full bg-white/90 text-ink shadow-sm disabled:opacity-0"
                >
                  <ChevronLeft size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => moveImage(i, i + 1)}
                  disabled={i === images.length - 1}
                  aria-label="Move photo later"
                  className="grid h-7 w-7 place-items-center rounded-full bg-white/90 text-ink shadow-sm disabled:opacity-0"
                >
                  <ChevronRight size={14} />
                </button>
              </div>
            )}
          </div>
        ))}

        {videos.map((url, i) => (
          <div key={url + i} className="relative aspect-square overflow-hidden rounded-xl border border-ink/10 bg-ink">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={videoPoster(url, 300)} alt="" className="h-full w-full object-cover opacity-90" />
            <span className="pointer-events-none absolute inset-0 grid place-items-center">
              <span className="grid h-9 w-9 place-items-center rounded-full bg-white/90 text-ink">
                <Play size={16} fill="currentColor" />
              </span>
            </span>
            <span className="absolute left-1.5 top-1.5 rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-bold text-ink">Video</span>
            <button
              type="button"
              onClick={() => onChange({ images, videos: videos.filter((_, x) => x !== i) })}
              aria-label={`Remove video ${i + 1}`}
              className="absolute right-1.5 top-1.5 grid h-7 w-7 place-items-center rounded-full bg-ink/70 text-white hover:bg-black"
            >
              <X size={14} />
            </button>
          </div>
        ))}

        {pending.map((p) => (
          <div key={p.id} className="relative flex aspect-square flex-col items-center justify-center gap-2 overflow-hidden rounded-xl border border-ink/10 bg-parchment px-2 text-center">
            <Loader2 size={18} className="animate-spin text-teal-deep" />
            <span className="w-full truncate text-[11px] text-ink/60">{p.kind === 'video' ? 'Video' : 'Photo'} {p.percent}%</span>
            <span className="absolute inset-x-0 bottom-0 h-1 bg-ink/10">
              <span className="block h-full bg-teal transition-[width]" style={{ width: `${p.percent}%` }} />
            </span>
          </div>
        ))}

        {!empty && (
          <button
            type="button"
            disabled={disabled}
            onClick={() => inputRef.current?.click()}
            className="flex aspect-square flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-ink/25 text-ink/55 hover:border-teal hover:text-teal-deep disabled:opacity-50"
          >
            <ImagePlus size={20} />
            <span className="text-[11px] font-semibold">Add more</span>
          </button>
        )}
      </div>

      {empty && (
        <button
          type="button"
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
          className="flex w-full flex-col items-center gap-2 rounded-2xl border border-dashed border-ink/25 px-4 py-8 text-center hover:border-teal disabled:opacity-50"
        >
          <span className="grid h-11 w-11 place-items-center rounded-full bg-teal/10 text-teal-deep">
            <ImagePlus size={20} />
          </span>
          <span className="text-sm font-semibold text-ink">Add photos or videos</span>
          <span className="text-xs text-ink/50">Choose from your phone or computer. You can pick several at once.</span>
        </button>
      )}

      <p className="mt-2 text-xs text-ink/45">
        {images.length}/{L.image.maxCount} photos (up to 10 MB each) · {videos.length}/{L.video.maxCount} videos (up to 100 MB each).
        The first photo is the main one.
      </p>

      {errors.length > 0 && (
        <ul className="mt-2 space-y-1">
          {errors.map((e, i) => (
            <li key={i} className="text-xs font-medium text-red-600">
              {e}
            </li>
          ))}
        </ul>
      )}

      {linkOpen ? (
        <div className="mt-2 flex gap-2">
          <input
            value={link}
            onChange={(e) => setLink(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                addLink()
              }
            }}
            placeholder="https://… photo link"
            className="min-w-0 flex-1 rounded-xl border border-ink/15 px-3 py-2 text-sm outline-none focus:border-teal"
          />
          <button type="button" onClick={addLink} className="rounded-xl bg-ink px-3 py-2 text-sm font-semibold text-white">
            Add
          </button>
        </div>
      ) : (
        <button type="button" onClick={() => setLinkOpen(true)} className="mt-2 text-xs font-semibold text-teal-deep underline">
          Or paste a photo link
        </button>
      )}
    </div>
  )
}
