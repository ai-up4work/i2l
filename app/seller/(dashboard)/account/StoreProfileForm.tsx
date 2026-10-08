// app/seller/(dashboard)/account/StoreProfileForm.tsx
//
// What shoppers see at the top of the seller's store page: logo, cover
// photo, a short tagline, "about" text and Instagram / Facebook links.
// Saved through /api/seller/profile (only these fields; name, web
// address and margin stay with Wishdrop staff).
'use client'

import { useEffect, useRef, useState } from 'react'
import { ImagePlus, Loader2 } from 'lucide-react'
import { uploadMedia } from '@/lib/upload/useMediaUpload'
import { imageThumb } from '@/lib/media'

type Profile = {
  name: string
  platform_slug: string
  description: string | null
  logo_url: string | null
  cover_url: string | null
  tagline: string | null
  instagram_url: string | null
  facebook_url: string | null
}

const inputClass = 'w-full rounded-xl border border-ink/15 bg-white px-3.5 py-3 text-base outline-none focus:border-teal sm:py-2.5 sm:text-sm'
const labelClass = 'mb-1.5 block text-xs font-semibold text-ink/60'

export default function StoreProfileForm() {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [form, setForm] = useState({ tagline: '', description: '', instagram: '', facebook: '', logoUrl: '', coverUrl: '' })
  const [uploading, setUploading] = useState<'logo' | 'cover' | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const logoInput = useRef<HTMLInputElement | null>(null)
  const coverInput = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    fetch('/api/seller/profile')
      .then(async (res) => {
        const body = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(body.error ?? 'Could not load your store profile')
        const p = body.profile as Profile
        setProfile(p)
        setForm({
          tagline: p.tagline ?? '',
          description: p.description ?? '',
          instagram: p.instagram_url ?? '',
          facebook: p.facebook_url ?? '',
          logoUrl: p.logo_url ?? '',
          coverUrl: p.cover_url ?? '',
        })
      })
      .catch((err: Error) => setLoadError(err.message))
  }, [])

  async function pick(kind: 'logo' | 'cover', file: File | undefined) {
    if (!file) return
    setError(null)
    setUploading(kind)
    try {
      const url = await uploadMedia(file, 'image')
      setForm((f) => ({ ...f, [kind === 'logo' ? 'logoUrl' : 'coverUrl']: url }))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed.')
    } finally {
      setUploading(null)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    setSaved(false)
    try {
      // Only send the logo if it changed — an older logo may be a link
      // from before uploads existed, which the server would refuse.
      const payload: Record<string, string> = {
        tagline: form.tagline,
        description: form.description,
        instagram: form.instagram,
        facebook: form.facebook,
      }
      if (form.logoUrl !== (profile?.logo_url ?? '')) payload.logoUrl = form.logoUrl
      if (form.coverUrl !== (profile?.cover_url ?? '')) payload.coverUrl = form.coverUrl

      const res = await fetch('/api/seller/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error ?? 'Could not save')
      const p = body.profile as Profile
      setProfile(p)
      setForm((f) => ({ ...f, instagram: p.instagram_url ?? '', facebook: p.facebook_url ?? '' }))
      setSaved(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save')
    } finally {
      setSaving(false)
    }
  }

  if (loadError) return <p className="rounded-2xl border border-gold/40 bg-gold/10 p-4 text-sm text-ink">{loadError}</p>
  if (!profile) {
    return (
      <div className="flex items-center gap-2 py-8 text-sm text-ink/50">
        <Loader2 size={16} className="animate-spin" /> Loading your store profile…
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5 rounded-2xl border border-ink/10 bg-card p-4 sm:p-6">
      <div>
        <span className={labelClass}>Cover photo and logo</span>
        <div className="relative">
          <button
            type="button"
            onClick={() => coverInput.current?.click()}
            className="relative block h-32 w-full overflow-hidden rounded-xl border border-dashed border-ink/25 bg-parchment sm:h-40"
            aria-label="Change cover photo"
          >
            {form.coverUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={imageThumb(form.coverUrl, 900)} alt="" className="h-full w-full object-cover" />
            ) : (
              <span className="flex h-full flex-col items-center justify-center gap-1 text-ink/50">
                <ImagePlus size={20} />
                <span className="text-xs font-semibold">Add a cover photo</span>
                <span className="text-[11px]">A wide photo works best</span>
              </span>
            )}
            {uploading === 'cover' && (
              <span className="absolute inset-0 grid place-items-center bg-white/70">
                <Loader2 size={20} className="animate-spin text-teal-deep" />
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => logoInput.current?.click()}
            className="absolute -bottom-6 left-4 grid h-20 w-20 place-items-center overflow-hidden rounded-full border-4 border-card bg-parchment shadow-sm"
            aria-label="Change logo"
          >
            {form.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={imageThumb(form.logoUrl, 200)} alt="" className="h-full w-full object-cover" />
            ) : (
              <span className="text-[11px] font-semibold text-ink/50">Add logo</span>
            )}
            {uploading === 'logo' && (
              <span className="absolute inset-0 grid place-items-center bg-white/70">
                <Loader2 size={16} className="animate-spin text-teal-deep" />
              </span>
            )}
          </button>
        </div>
        <input ref={coverInput} type="file" accept="image/*" className="hidden" onChange={(e) => { void pick('cover', e.target.files?.[0]); e.target.value = '' }} />
        <input ref={logoInput} type="file" accept="image/*" className="hidden" onChange={(e) => { void pick('logo', e.target.files?.[0]); e.target.value = '' }} />
        <p className="mt-9 text-xs text-ink/45">Tap the cover or the logo to change it.</p>
      </div>

      <label className="block">
        <span className={labelClass}>Tagline</span>
        <input value={form.tagline} maxLength={120} onChange={(e) => setForm((f) => ({ ...f, tagline: e.target.value }))} placeholder="e.g. Handmade jewellery from Jaipur" className={inputClass} />
      </label>

      <label className="block">
        <span className={labelClass}>About your store</span>
        <textarea value={form.description} maxLength={1000} rows={3} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="What you make or sell, and what makes it special." className={inputClass} />
      </label>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className={labelClass}>Instagram</span>
          <input value={form.instagram} onChange={(e) => setForm((f) => ({ ...f, instagram: e.target.value }))} placeholder="@yourshop" autoCapitalize="none" className={inputClass} />
        </label>
        <label className="block">
          <span className={labelClass}>Facebook page</span>
          <input value={form.facebook} onChange={(e) => setForm((f) => ({ ...f, facebook: e.target.value }))} placeholder="yourshop or facebook.com/yourshop" autoCapitalize="none" className={inputClass} />
        </label>
      </div>

      {error && <p className="text-sm font-medium text-red-600">{error}</p>}
      {saved && (
        <p className="text-sm font-medium text-teal-deep">
          Saved.{' '}
          <a href={`/stores/${profile.platform_slug}`} target="_blank" rel="noreferrer" className="underline">
            See your store page
          </a>
        </p>
      )}

      <button type="submit" disabled={saving || uploading !== null} className="rounded-xl bg-teal px-5 py-3 text-sm font-bold text-white hover:bg-teal-deep disabled:opacity-60 sm:self-end sm:py-2.5">
        {saving ? 'Saving…' : 'Save store profile'}
      </button>
    </form>
  )
}
