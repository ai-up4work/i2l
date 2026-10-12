// components/admin/seller/CoverPicker.tsx
//
// Optional cover-banner upload for the seller form (ADD wizard + EDIT card).
// Like LogoPicker it is "dumb": the value lives in the parent, this only
// reads/validates the file and reports the result.
//
// The picked image is downscaled in the browser (max 1600px wide, JPEG) so
// the data URL sent to the API stays small, a raw phone photo can be 5-10MB.
// A store without a cover shows the brand gradient on its page, so this
// field is never required.
'use client'

import { useId, useState } from 'react'
import { ImagePlus, Loader2, Pencil, X } from 'lucide-react'

const MAX_INPUT_BYTES = 8 * 1024 * 1024
const MAX_WIDTH = 1600
const JPEG_QUALITY = 0.85

function readAndResize(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new window.Image()
    img.onload = () => {
      try {
        const scale = Math.min(1, MAX_WIDTH / img.naturalWidth)
        const w = Math.round(img.naturalWidth * scale)
        const h = Math.round(img.naturalHeight * scale)
        const canvas = document.createElement('canvas')
        canvas.width = w
        canvas.height = h
        const ctx = canvas.getContext('2d')
        if (!ctx) throw new Error('no canvas')
        // JPEG has no alpha, so flatten transparent PNGs onto white.
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, w, h)
        ctx.drawImage(img, 0, 0, w, h)
        resolve(canvas.toDataURL('image/jpeg', JPEG_QUALITY))
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

export default function CoverPicker({
  value,
  onChange,
}: {
  value: string | null
  onChange: (next: string | null) => void
}) {
  const id = useId()
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
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
    setBusy(true)
    try {
      onChange(await readAndResize(file))
    } catch {
      setError("Couldn't read that file \u2014 try a different image.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <label
        htmlFor={id}
        title={value ? 'Change cover' : 'Add a cover banner'}
        className="group relative block aspect-[16/5] w-full cursor-pointer overflow-hidden rounded-xl border border-dashed border-ink/20 bg-card transition-colors hover:border-teal-deep/40"
      >
        <input id={id} type="file" accept="image/*" onChange={handleFile} className="sr-only" />

        {value ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element -- data-URL preview, not a static asset */}
            <img src={value} alt="" className="h-full w-full object-cover object-center" />
            <span className="absolute inset-0 flex items-center justify-center bg-ink/45 opacity-0 transition-opacity group-hover:opacity-100">
              <Pencil size={16} className="text-white" />
            </span>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                setError(null)
                onChange(null)
              }}
              title="Remove cover"
              className="absolute right-2 top-2 grid h-6 w-6 place-items-center rounded-full border border-ink/10 bg-white text-ink/50 shadow-sm transition-colors hover:bg-red-600/10 hover:text-red-600"
            >
              <X size={12} />
            </button>
          </>
        ) : (
          <span className="flex h-full w-full flex-col items-center justify-center gap-1.5 text-ink/40 transition-colors group-hover:text-teal-deep">
            {busy ? <Loader2 size={18} className="animate-spin" /> : <ImagePlus size={20} strokeWidth={1.75} />}
            <span className="text-xs font-semibold">{busy ? 'Processing\u2026' : 'Add a cover banner'}</span>
          </span>
        )}
      </label>

      <p className="mt-1 text-xs text-ink/40">
        Optional. Best at 1600\u00d7600 or wider; it&rsquo;s cropped to fit, so keep the important part near the centre.
        Without one, the store page shows the Wishdrop gradient.
      </p>
      {error && <p className="mt-1 text-xs font-medium text-red-600">{error}</p>}
    </div>
  )
}