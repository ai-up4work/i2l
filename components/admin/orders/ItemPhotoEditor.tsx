'use client'

// components/admin/orders/ItemPhotoEditor.tsx
//
// The photo of one order item on the admin order page, with "Change photo":
// upload a file or paste an image link, or remove the override so the
// store's own photo (if any) shows again. Saves through
// PATCH /api/admin/order-items/[itemId].

import { useState } from 'react'
import { ImagePlus, Loader2, X } from 'lucide-react'
import { useImageUpload } from '@/lib/upload/useImageUpload'
import { NO_PHOTO_SRC, swapToNoPhoto } from '@/lib/image-fallback'

export default function ItemPhotoEditor({
  itemId,
  src,
  alt,
  onSaved,
}: {
  itemId: string
  src: string | null | undefined
  alt: string
  /** Called after the server has saved, so the page can re-read the order. */
  onSaved: () => void
}) {
  const [open, setOpen] = useState(false)
  const [url, setUrl] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { uploading, error: uploadError, upload } = useImageUpload()

  async function save(imageUrl: string | null) {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/order-items/${itemId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageUrl }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data?.error ?? 'Could not save the photo.')
        return
      }
      setOpen(false)
      setUrl('')
      onSaved()
    } catch {
      setError('Network problem. The photo was not changed.')
    } finally {
      setSaving(false)
    }
  }

  async function onFile(file: File | undefined) {
    if (!file) return
    const uploaded = await upload(file, 'products')
    if (uploaded) await save(uploaded)
  }

  const busy = saving || uploading

  return (
    <div className="flex-none">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src || NO_PHOTO_SRC}
        alt={alt}
        onError={swapToNoPhoto}
        className="h-20 w-20 rounded-xl border border-ink/[0.06] bg-parchment/60 object-contain"
      />
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="mt-1.5 w-20 text-center text-[11px] font-semibold text-teal-deep hover:underline"
      >
        Change photo
      </button>

      {open && (
        <div className="fixed inset-0 z-[120] flex items-end justify-center bg-ink/40 p-0 sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-label="Change item photo">
          <div className="w-full max-w-md rounded-t-3xl bg-card p-5 shadow-2xl sm:rounded-3xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-display text-lg font-semibold text-ink">Change photo</h3>
                <p className="mt-0.5 text-xs text-ink/55 line-clamp-1">{alt}</p>
              </div>
              <button type="button" onClick={() => setOpen(false)} disabled={busy} aria-label="Close" className="rounded-full p-1.5 text-ink/50 hover:bg-ink/5 disabled:opacity-40">
                <X size={16} />
              </button>
            </div>

            <label className="mt-4 flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-ink/20 bg-parchment/50 px-4 py-5 text-sm font-semibold text-ink/70 transition-colors hover:border-teal/50 hover:bg-teal/5">
              {uploading ? <Loader2 size={16} className="animate-spin" /> : <ImagePlus size={16} />}
              {uploading ? 'Uploading…' : 'Upload a photo'}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                className="sr-only"
                disabled={busy}
                onChange={(e) => {
                  void onFile(e.target.files?.[0])
                  e.target.value = ''
                }}
              />
            </label>

            <div className="mt-3 flex gap-2">
              <input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="or paste an image link (https://…)"
                className="w-full rounded-xl border border-ink/15 bg-card px-3 py-2 text-sm text-ink outline-none focus:border-teal/60 focus:ring-2 focus:ring-teal/10"
              />
              <button
                type="button"
                disabled={busy || !/^https:\/\//i.test(url.trim())}
                onClick={() => void save(url.trim())}
                className="flex-none rounded-xl bg-teal-deep px-4 text-sm font-semibold text-white hover:bg-teal disabled:cursor-not-allowed disabled:opacity-40"
              >
                Use
              </button>
            </div>

            {(error || uploadError) && <p role="alert" className="mt-3 text-xs font-medium text-rose-700">{error ?? uploadError}</p>}

            <div className="mt-4 flex items-center justify-between border-t border-ink/10 pt-3">
              <button
                type="button"
                disabled={busy}
                onClick={() => void save(null)}
                className="text-xs font-semibold text-ink/55 hover:text-rose-600 disabled:opacity-40"
                title="Go back to the store's own photo, if it has one"
              >
                Remove my photo
              </button>
              <button type="button" onClick={() => setOpen(false)} disabled={busy} className="rounded-full px-4 py-2 text-sm font-semibold text-ink/60 hover:bg-ink/5 disabled:opacity-40">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
