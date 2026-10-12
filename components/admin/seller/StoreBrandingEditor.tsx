// components/admin/seller/StoreBrandingEditor.tsx
//
// One control for a store's two images, laid out like its public page:
// the cover banner on top with the circular logo ("profile picture")
// overlapping its bottom-left corner. Click either to change it.
//
// "Dumb" like the old LogoPicker: values live in the parent form, this only
// reads, validates and downsizes the picked file, then reports the result.
//   - cover: max 1600px wide, JPEG   (optional; the page shows a gradient without it)
//   - logo:  max 512px, PNG/JPEG     (shown in a circle on the storefront)
// Downsizing keeps the base64 data URLs small enough to send in the JSON payload.
'use client'

import { useId, useState } from 'react'
import { ImagePlus, Loader2, Pencil, UserPlus, X } from 'lucide-react'

const MAX_INPUT_BYTES = 8 * 1024 * 1024

type Kind = 'cover' | 'logo'

const LIMITS: Record<Kind, { maxSide: number; quality: number }> = {
  cover: { maxSide: 1600, quality: 0.85 },
  logo: { maxSide: 512, quality: 0.92 },
}

function readAndResize(file: File, kind: Kind): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new window.Image()
    img.onload = () => {
      try {
        const { maxSide, quality } = LIMITS[kind]
        // Cover is limited by width, logo by its longest side.
        const longest = kind === 'cover' ? img.naturalWidth : Math.max(img.naturalWidth, img.naturalHeight)
        const scale = Math.min(1, maxSide / longest)
        const w = Math.max(1, Math.round(img.naturalWidth * scale))
        const h = Math.max(1, Math.round(img.naturalHeight * scale))
        const canvas = document.createElement('canvas')
        canvas.width = w
        canvas.height = h
        const ctx = canvas.getContext('2d')
        if (!ctx) throw new Error('no canvas')

        // Logos keep transparency (PNG) when the source can have it;
        // covers are always flattened onto white and saved as JPEG.
        const keepAlpha = kind === 'logo' && /png|webp|svg|gif/.test(file.type)
        if (!keepAlpha) {
          ctx.fillStyle = '#ffffff'
          ctx.fillRect(0, 0, w, h)
        }
        ctx.drawImage(img, 0, 0, w, h)
        resolve(keepAlpha ? canvas.toDataURL('image/png') : canvas.toDataURL('image/jpeg', quality))
      } catch (e) {
        reject(e)
      } finally {
        URL.revokeObjectURL(url)
      }
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('decode'))
    }
    img.src = url
  })
}

export default function StoreBrandingEditor({
  logo,
  cover,
  onLogoChange,
  onCoverChange,
  logoRequired = false,
  logoRequiredError = null,
}: {
  logo: string | null
  cover: string | null
  onLogoChange: (next: string | null) => void
  onCoverChange: (next: string | null) => void
  /** ADD mode: a logo must be picked before the seller can be created. */
  logoRequired?: boolean
  /** Shown once the admin has tried to continue without a logo. */
  logoRequiredError?: string | null
}) {
  const coverId = useId()
  const logoId = useId()
  const [coverError, setCoverError] = useState<string | null>(null)
  const [logoError, setLogoError] = useState<string | null>(null)
  const [busy, setBusy] = useState<Kind | null>(null)

  const pick = async (e: React.ChangeEvent<HTMLInputElement>, kind: Kind) => {
    const setError = kind === 'cover' ? setCoverError : setLogoError
    const apply = kind === 'cover' ? onCoverChange : onLogoChange
    const file = e.target.files?.[0]
    e.target.value = '' // so re-picking the same file still fires onChange
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setError('Please choose an image file.')
      return
    }
    if (file.size > MAX_INPUT_BYTES) {
      setError('That image is too large \u2014 please choose one under 8MB.')
      return
    }
    setError(null)
    setBusy(kind)
    try {
      apply(await readAndResize(file, kind))
    } catch {
      setError("Couldn't read that file \u2014 try a different image.")
    } finally {
      setBusy(null)
    }
  }

  const removeCover = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setCoverError(null)
    onCoverChange(null)
  }
  const removeLogo = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setLogoError(null)
    onLogoChange(null)
  }

  const logoMissing = logoRequired && !logo
  const logoProblem = logoError ?? logoRequiredError

  return (
    <div>
      {/* Preview mirrors the storefront: banner, logo overlapping bottom-left. */}
      <div className="relative pb-9">
        <label
          htmlFor={coverId}
          title={cover ? 'Change cover banner' : 'Add a cover banner'}
          className="group relative block aspect-[16/5] w-full cursor-pointer overflow-hidden rounded-2xl border border-dashed border-ink/20 bg-card transition-colors hover:border-teal-deep/40"
        >
          <input id={coverId} type="file" accept="image/*" onChange={(e) => pick(e, 'cover')} className="sr-only" />
          {cover ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element -- data-URL preview, not a static asset */}
              <img src={cover} alt="Cover banner preview" className="h-full w-full object-cover object-center" />
              <span className="absolute inset-0 flex items-center justify-center bg-ink/45 opacity-0 transition-opacity group-hover:opacity-100">
                <Pencil size={16} className="text-white" />
              </span>
              <button
                type="button"
                onClick={removeCover}
                title="Remove cover banner"
                className="absolute right-2 top-2 grid h-6 w-6 place-items-center rounded-full border border-ink/10 bg-white text-ink/50 shadow-sm transition-colors hover:bg-red-600/10 hover:text-red-600"
              >
                <X size={12} />
              </button>
            </>
          ) : (
            <span className="flex h-full w-full flex-col items-center justify-center gap-1.5 text-ink/40 transition-colors group-hover:text-teal-deep">
              {busy === 'cover' ? <Loader2 size={18} className="animate-spin" /> : <ImagePlus size={20} strokeWidth={1.75} />}
              <span className="text-xs font-semibold">{busy === 'cover' ? 'Processing\u2026' : 'Add a cover banner (optional)'}</span>
            </span>
          )}
        </label>

        {/* Logo / profile picture */}
        <div className="absolute bottom-0 left-4">
          <label
            htmlFor={logoId}
            title={logo ? 'Change logo' : "Add the store's logo"}
            className={`group relative grid h-20 w-20 cursor-pointer place-items-center overflow-hidden rounded-full border-4 bg-white shadow-sm transition-transform active:scale-[0.96] ${
              logoProblem ? 'border-red-500/50' : 'border-parchment'
            }`}
          >
            <input id={logoId} type="file" accept="image/*" onChange={(e) => pick(e, 'logo')} className="sr-only" />
            {logo ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element -- data-URL preview, not a static asset */}
                <img src={logo} alt="Store logo preview" className="h-full w-full object-contain p-1.5" />
                <span className="absolute inset-0 flex items-center justify-center bg-ink/50 opacity-0 transition-opacity group-hover:opacity-100">
                  <Pencil size={15} className="text-white" />
                </span>
              </>
            ) : busy === 'logo' ? (
              <Loader2 size={20} className="animate-spin text-teal-deep" />
            ) : (
              <span className="flex flex-col items-center gap-0.5 text-teal-deep">
                <UserPlus size={20} strokeWidth={1.75} />
                <span className="text-[10px] font-semibold">Logo</span>
              </span>
            )}
          </label>
          {logo && (
            <button
              type="button"
              onClick={removeLogo}
              title="Remove logo"
              className="absolute -right-0.5 top-0 grid h-5 w-5 place-items-center rounded-full border border-ink/10 bg-white text-ink/50 shadow-sm transition-colors hover:bg-red-600/10 hover:text-red-600"
            >
              <X size={11} />
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-1 text-xs">
        <p className="text-ink/40">
          <span className="font-semibold text-ink/55">Cover:</span> best at 1600&times;600 or wider. It&rsquo;s cropped to
          fit, so keep the important part near the centre. Without one, the store page shows the Wishdrop gradient.
        </p>
        <p className="text-ink/40">
          <span className="font-semibold text-ink/55">Logo:</span>{' '}
          {logoMissing ? 'required \u2014 ' : 'shown as a circle, '}a square image with some breathing room works best.
        </p>
        {coverError && <p className="font-medium text-red-600">{coverError}</p>}
        {logoProblem && <p className="font-medium text-red-600">{logoProblem}</p>}
      </div>
    </div>
  )
}