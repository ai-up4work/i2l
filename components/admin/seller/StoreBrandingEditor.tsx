// components/admin/seller/StoreBrandingEditor.tsx
'use client'

import { useRef, useState } from 'react'
import { ImagePlus, Camera, Loader2, X, Pencil } from 'lucide-react'

// ---------------------------------------------------------------------------
// Store branding editor — ONE control for the store's logo (circular profile
// picture) and cover banner, previewed the way the storefront lays them out:
// cover banner on top, circular logo overlapping its bottom-left corner.
//
// Props are controlled: `logo` / `cover` are data URLs (or remote URLs) and
// the parent owns the state. `null` = nothing picked.
//
// Both images are downsized in the browser before being handed to the parent
// so the data URLs sent to the API stay small:
//   - cover: max 1600px wide, JPEG
//   - logo:  max 480px on its longest side, PNG (keeps transparency), and
//            any blank white/transparent margin baked into the file is
//            trimmed so the logo fills the circle instead of floating in a
//            white ring.
//
// A real backend should upload these to storage (e.g. Supabase Storage) and
// keep only the hosted URL.
// ---------------------------------------------------------------------------

const MAX_INPUT_BYTES = 8 * 1024 * 1024 // refuse absurdly large source files
const COVER_MAX_WIDTH = 1600
const LOGO_MAX_SIDE = 480
const ACCEPT = 'image/png,image/jpeg,image/webp'

interface Props {
  logo: string | null
  cover: string | null
  onLogoChange: (next: string | null) => void
  onCoverChange: (next: string | null) => void
  logoRequired?: boolean
  logoRequiredError?: string | null
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new window.Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error("That file couldn't be read as an image."))
    }
    img.src = url
  })
}

/** Resize to fit within maxW x maxH (never upscales). */
function drawScaled(img: HTMLImageElement, maxW: number, maxH: number) {
  const scale = Math.min(1, maxW / img.naturalWidth, maxH / img.naturalHeight)
  const w = Math.max(1, Math.round(img.naturalWidth * scale))
  const h = Math.max(1, Math.round(img.naturalHeight * scale))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Your browser could not process this image.')
  ctx.drawImage(img, 0, 0, w, h)
  return { canvas, ctx, w, h }
}

async function processCover(file: File): Promise<string> {
  const img = await loadImage(file)
  const { canvas, ctx, w, h } = drawScaled(img, COVER_MAX_WIDTH, Number.MAX_SAFE_INTEGER)
  // JPEG has no alpha — paint white underneath so transparent PNGs don't go black.
  ctx.globalCompositeOperation = 'destination-over'
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, w, h)
  return canvas.toDataURL('image/jpeg', 0.82)
}

async function processLogo(file: File): Promise<string> {
  const img = await loadImage(file)
  const { canvas, ctx, w, h } = drawScaled(img, LOGO_MAX_SIDE, LOGO_MAX_SIDE)

  // Find the bounding box of "real" pixels: not transparent and not near-white.
  const { data } = ctx.getImageData(0, 0, w, h)
  let minX = w
  let minY = h
  let maxX = -1
  let maxY = -1
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4
      const a = data[i + 3]
      const isBlank = a < 16 || (data[i] > 244 && data[i + 1] > 244 && data[i + 2] > 244)
      if (!isBlank) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }

  // Nothing found (blank/all-white image) or nothing worth trimming -> keep as is.
  const cw = maxX - minX + 1
  const ch = maxY - minY + 1
  const trimmedMeaningfully = maxX >= 0 && (cw < w * 0.96 || ch < h * 0.96)
  if (!trimmedMeaningfully) return canvas.toDataURL('image/png')

  // Keep a hairline of breathing room so anti-aliased edges aren't cut.
  const pad = Math.round(Math.max(cw, ch) * 0.01)
  const sx = Math.max(0, minX - pad)
  const sy = Math.max(0, minY - pad)
  const sw = Math.min(w - sx, cw + pad * 2)
  const sh = Math.min(h - sy, ch + pad * 2)

  const out = document.createElement('canvas')
  out.width = sw
  out.height = sh
  out.getContext('2d')!.drawImage(canvas, sx, sy, sw, sh, 0, 0, sw, sh)
  return out.toDataURL('image/png')
}

export default function StoreBrandingEditor({
  logo,
  cover,
  onLogoChange,
  onCoverChange,
  logoRequired = false,
  logoRequiredError = null,
}: Props) {
  const logoInputRef = useRef<HTMLInputElement>(null)
  const coverInputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState<'logo' | 'cover' | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleFile = async (
    kind: 'logo' | 'cover',
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0]
    // Reset so picking the same file again still fires onChange.
    e.target.value = ''
    if (!file) return

    setError(null)
    if (!file.type.startsWith('image/')) {
      setError('Please choose a PNG, JPG or WebP image.')
      return
    }
    if (file.size > MAX_INPUT_BYTES) {
      setError('That image is over 8 MB. Choose a smaller file.')
      return
    }

    setBusy(kind)
    try {
      if (kind === 'logo') onLogoChange(await processLogo(file))
      else onCoverChange(await processCover(file))
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't process that image.")
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="flex flex-col gap-2.5">
      {/* Preview, laid out like the storefront: cover with the logo overlapping its corner. */}
      <div className="relative pb-9">
        {/* ---- Cover ---- */}
        {cover ? (
          <div className="group relative aspect-[16/5] w-full overflow-hidden rounded-2xl border border-ink/10 bg-ink/[0.03]">
            {/* eslint-disable-next-line @next/next/no-img-element -- data-URL / remote preview */}
            <img src={cover} alt="Cover banner" className="h-full w-full object-cover object-center" />
            <div className="absolute right-3 top-3 flex items-center gap-2">
              <button
                type="button"
                onClick={() => coverInputRef.current?.click()}
                disabled={busy === 'cover'}
                className="flex items-center gap-1.5 rounded-lg bg-white/90 px-2.5 py-1.5 text-xs font-semibold text-ink shadow-sm backdrop-blur transition-colors hover:bg-white disabled:opacity-60"
              >
                {busy === 'cover' ? <Loader2 size={12} className="animate-spin" /> : <Pencil size={12} />}
                Replace
              </button>
              <button
                type="button"
                onClick={() => onCoverChange(null)}
                disabled={busy === 'cover'}
                aria-label="Remove cover banner"
                className="grid h-7 w-7 place-items-center rounded-lg bg-white/90 text-ink/70 shadow-sm backdrop-blur transition-colors hover:bg-white hover:text-red-600 disabled:opacity-60"
              >
                <X size={14} />
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => coverInputRef.current?.click()}
            disabled={busy === 'cover'}
            className="flex aspect-[16/5] w-full flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-ink/20 bg-transparent text-teal-deep transition-colors hover:border-teal-deep/40 hover:bg-teal-deep/[0.03] disabled:cursor-wait"
          >
            {busy === 'cover' ? <Loader2 size={20} className="animate-spin" /> : <ImagePlus size={20} strokeWidth={1.75} />}
            <span className="text-xs font-semibold">
              {busy === 'cover' ? 'Processing…' : 'Add a cover banner (optional)'}
            </span>
          </button>
        )}

        {/* ---- Logo ----
            The circle is a `relative` box and the image is absolutely
            positioned to fill it (inset-0), so it always covers the full
            circle regardless of the image's own proportions. The remove
            button is a SIBLING of the clipped circle, so overflow-hidden
            doesn't cut it off. */}
        <div className="absolute bottom-0 left-4 h-20 w-20">
          <button
            type="button"
            onClick={() => logoInputRef.current?.click()}
            disabled={busy === 'logo'}
            aria-label={logo ? 'Replace store logo' : 'Add store logo'}
            className={`absolute inset-0 overflow-hidden rounded-full border-4 bg-white shadow-sm transition-colors ${
              logo
                ? 'border-parchment'
                : logoRequiredError
                ? 'border-dashed border-red-600/40 text-red-600/70'
                : 'border-dashed border-ink/20 text-teal-deep hover:border-teal-deep/40'
            }`}
          >
            {logo ? (
              // eslint-disable-next-line @next/next/no-img-element -- data-URL / remote preview
              <img src={logo} alt="Store logo" className="absolute inset-0 h-full w-full object-cover" />
            ) : (
              <span className="absolute inset-0 grid place-items-center">
                {busy === 'logo' ? <Loader2 size={20} className="animate-spin" /> : <Camera size={20} strokeWidth={1.75} />}
              </span>
            )}
            {logo && busy === 'logo' && (
              <span className="absolute inset-0 grid place-items-center bg-white/70">
                <Loader2 size={18} className="animate-spin text-teal-deep" />
              </span>
            )}
          </button>

          {logo && (
            <button
              type="button"
              onClick={() => onLogoChange(null)}
              aria-label="Remove store logo"
              className="absolute -right-1 -top-1 z-10 grid h-5 w-5 place-items-center rounded-full border border-ink/10 bg-white text-ink/50 shadow-sm transition-colors hover:text-red-600"
            >
              <X size={11} />
            </button>
          )}
        </div>

        {/* Label next to the logo when it's still empty. */}
        {!logo && (
          <p
            className={`absolute bottom-0 left-28 pb-1 text-xs ${
              logoRequiredError ? 'font-semibold text-red-700' : 'text-ink/40'
            }`}
          >
            {logoRequiredError ?? (logoRequired ? 'Add a store logo (required)' : 'Add a store logo')}
          </p>
        )}
      </div>

      {error && <p className="text-xs font-semibold text-red-700">{error}</p>}

      <p className="text-xs leading-relaxed text-ink/45">
        <span className="font-semibold text-ink/60">Cover:</span> best at 1600×600 or wider. It&rsquo;s cropped to fit, so
        keep the important part near the centre. Without one, the store page shows the Wishdrop gradient.
      </p>
      <p className="-mt-1.5 text-xs leading-relaxed text-ink/45">
        <span className="font-semibold text-ink/60">Logo:</span> shown as a circle. Blank white margins are trimmed
        automatically so it fills the circle.
      </p>

      <input
        ref={logoInputRef}
        type="file"
        accept={ACCEPT}
        className="hidden"
        onChange={(e) => handleFile('logo', e)}
      />
      <input
        ref={coverInputRef}
        type="file"
        accept={ACCEPT}
        className="hidden"
        onChange={(e) => handleFile('cover', e)}
      />
    </div>
  )
}