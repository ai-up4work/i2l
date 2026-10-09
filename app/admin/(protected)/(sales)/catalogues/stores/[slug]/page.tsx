// app/admin/(protected)/(sales)/catalogues/stores/[slug]/page.tsx
//
// One catalogue store (an Instagram / Facebook seller with no website
// feed): create it (/admin/catalogues/stores/new) and manage it — store
// profile, contact, default margin, seller-portal login, live/hidden.
// Products themselves are on the Catalogues page.
//
// These stores are created here, not in the seller wizard: the wizard's
// "mock" method is for stores with a custom extractor built into the code.
'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, Copy, ExternalLink, ImagePlus, Loader2 } from 'lucide-react'
import { panelClass } from '@/components/admin/seller/shared'
import { uploadMedia } from '@/lib/upload/useMediaUpload'
import { imageThumb } from '@/lib/media'
import { storeSlugFromName, storeSlugProblem } from '@/lib/catalogue-stores'
import type { AdminStore } from '@/lib/catalogue-stores-admin'
import StoreCollections from '@/components/admin/catalogue/StoreCollections'

const inputClass = 'w-full rounded-xl border border-ink/15 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-teal'
const labelClass = 'mb-1.5 block text-xs font-semibold text-ink/60'
const primaryButton = 'rounded-xl bg-teal-deep px-4 py-2.5 text-sm font-semibold text-parchment hover:bg-teal disabled:opacity-60'

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) } })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.error ?? 'Something went wrong')
  return body as T
}

// ─── Create ──────────────────────────────────────────────────────────────

function NewStore() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [slugTouched, setSlugTouched] = useState(false)
  const [contactName, setContactName] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  const [contactPhone, setContactPhone] = useState('')
  const [margin, setMargin] = useState('25')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Opened from a seller application (?application=…): pre-fill, and
  // after creating, mark the application done and copy its social links.
  const [fromApplication, setFromApplication] = useState<{ id: string; instagram?: string; facebook?: string } | null>(null)
  useEffect(() => {
    const qs = new URLSearchParams(window.location.search)
    const id = qs.get('application')
    if (!id) return
    setName(qs.get('name') ?? '')
    setContactName(qs.get('contactName') ?? '')
    setContactEmail(qs.get('email') ?? '')
    setContactPhone(qs.get('phone') ?? '')
    setFromApplication({ id, instagram: qs.get('instagram') ?? undefined, facebook: qs.get('facebook') ?? undefined })
  }, [])

  const effectiveSlug = slugTouched ? slug : storeSlugFromName(name)
  const slugError = effectiveSlug ? storeSlugProblem(effectiveSlug) : null

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return setError('Store name is required.')
    if (slugError) return setError(slugError)
    setSaving(true)
    setError(null)
    try {
      const { store } = await api<{ store: AdminStore }>('/api/admin/catalogues/stores', {
        method: 'POST',
        body: JSON.stringify({ name, slug: effectiveSlug, contactName, contactEmail, contactPhone, marginPercent: margin }),
      })
      if (fromApplication) {
        await fetch('/api/admin/catalogues/applications', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: fromApplication.id, status: 'approved', sellerId: store.id }),
        }).catch(() => {})
        if (fromApplication.instagram || fromApplication.facebook) {
          // Best effort: needs data/wishdrop-social-stores.sql.
          await fetch(`/api/admin/catalogues/stores/${store.slug}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ instagram: fromApplication.instagram ?? '', facebook: fromApplication.facebook ?? '' }),
          }).catch(() => {})
        }
      }
      router.push(`/admin/catalogues/stores/${store.slug}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the store')
      setSaving(false)
    }
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-8xl px-6 py-8">
        <Link href="/admin/catalogues" className="flex items-center gap-1.5 text-sm font-semibold text-ink/55 hover:text-ink">
          <ArrowLeft size={15} /> Social Stores
        </Link>
        <h1 className="mt-4 font-display text-3xl text-ink">New social store</h1>
        {fromApplication && <p className="mt-2 rounded-lg bg-teal/10 px-3 py-2 text-sm text-teal-deep">Filled in from their application. Check the details, then create the store.</p>}
        <p className="mt-1 text-sm text-ink/55">
          For a seller with no website to pull products from, such as an Instagram or Facebook shop. Their products,
          photos and videos are added here or by the seller in their portal. The store starts hidden; you make it live
          when it&rsquo;s ready.
        </p>

        <form onSubmit={handleSubmit} className={`mt-6 flex flex-col gap-4 p-6 ${panelClass}`}>
          <label className="block">
            <span className={labelClass}>Store name</span>
            <input required autoFocus value={name} maxLength={80} onChange={(e) => setName(e.target.value)} placeholder="e.g. Meera Handlooms" className={inputClass} />
          </label>

          <label className="block">
            <span className={labelClass}>Web address</span>
            <div className="flex items-center rounded-xl border border-ink/15 bg-white focus-within:border-teal">
              <span className="pl-3.5 text-sm text-ink/45">/stores/</span>
              <input
                value={effectiveSlug}
                onChange={(e) => {
                  setSlugTouched(true)
                  setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))
                }}
                placeholder="meera-handlooms"
                className="min-w-0 flex-1 bg-transparent py-2.5 pr-3.5 text-sm outline-none"
              />
            </div>
            <span className={`mt-1 block text-xs ${slugError ? 'font-medium text-red-600' : 'text-ink/45'}`}>
              {slugError ?? 'Filled in from the name. It can’t be changed after the store is created.'}
            </span>
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className={labelClass}>Seller&rsquo;s name (optional)</span>
              <input value={contactName} onChange={(e) => setContactName(e.target.value)} className={inputClass} />
            </label>
            <label className="block">
              <span className={labelClass}>WhatsApp / phone (optional)</span>
              <input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} className={inputClass} />
            </label>
            <label className="block">
              <span className={labelClass}>Seller&rsquo;s email (optional)</span>
              <input type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} placeholder="Needed later for a portal login" className={inputClass} />
            </label>
            <label className="block">
              <span className={labelClass}>Wishdrop margin %</span>
              <input type="number" min="0" step="0.5" value={margin} onChange={(e) => setMargin(e.target.value)} className={inputClass} />
            </label>
          </div>
          <p className="text-xs text-ink/45">
            The margin is added on top of the seller&rsquo;s own price for each product. You can change it later, for the
            whole store or for one product.
          </p>

          {error && <p className="text-sm font-medium text-red-600">{error}</p>}

          <div className="flex justify-end gap-3">
            <Link href="/admin/catalogues" className="rounded-xl px-4 py-2.5 text-sm font-semibold text-ink/60">
              Cancel
            </Link>
            <button type="submit" disabled={saving} className={primaryButton}>
              {saving ? 'Creating…' : 'Create store'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Manage ──────────────────────────────────────────────────────────────

function ManageStore({ slug }: { slug: string }) {
  const [store, setStore] = useState<AdminStore | null>(null)
  const [needsMigration, setNeedsMigration] = useState(false)
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState<AdminStore | null>(null)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const [uploading, setUploading] = useState<'logo' | 'cover' | null>(null)
  const logoInput = useRef<HTMLInputElement | null>(null)
  const coverInput = useRef<HTMLInputElement | null>(null)

  const [loginEmail, setLoginEmail] = useState('')
  const [loginBusy, setLoginBusy] = useState(false)
  const [loginError, setLoginError] = useState<string | null>(null)
  const [credentials, setCredentials] = useState<{ email: string; tempPassword: string } | null>(null)

  function apply(next: AdminStore) {
    setStore(next)
    setForm(next)
    setLoginEmail((prev) => prev || next.contactEmail)
  }

  useEffect(() => {
    api<{ store: AdminStore; needsMigration: boolean }>(`/api/admin/catalogues/stores/${slug}`)
      .then((body) => {
        apply(body.store)
        setNeedsMigration(body.needsMigration)
      })
      .catch(() => setStore(null))
      .finally(() => setLoading(false))
  }, [slug])

  async function patch(payload: Record<string, unknown>, okText: string) {
    setSaving(true)
    setMessage(null)
    try {
      const { store: next } = await api<{ store: AdminStore }>(`/api/admin/catalogues/stores/${slug}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      })
      apply(next)
      setMessage({ ok: true, text: okText })
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : 'Could not save' })
    } finally {
      setSaving(false)
    }
  }

  async function pick(kind: 'logo' | 'cover', file: File | undefined) {
    if (!file || !store) return
    setUploading(kind)
    setMessage(null)
    try {
      const url = await uploadMedia(file, 'image', { sellerId: store.id })
      setForm((f) => (f ? { ...f, [kind === 'logo' ? 'logoUrl' : 'coverUrl']: url } : f))
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : 'Upload failed.' })
    } finally {
      setUploading(null)
    }
  }

  function saveAll(e: React.FormEvent) {
    e.preventDefault()
    if (!form || !store) return
    const payload: Record<string, unknown> = {
      name: form.name,
      tagline: form.tagline,
      description: form.description,
      instagram: form.instagram,
      facebook: form.facebook,
      country: form.country,
      contactName: form.contactName,
      contactEmail: form.contactEmail,
      contactPhone: form.contactPhone,
      notes: form.notes,
      marginPercent: form.defaultMarginPercent,
    }
    // Only send images that changed — an older logo may be a plain link
    // from before uploads existed, which the server would refuse.
    if (form.logoUrl !== store.logoUrl) payload.logoUrl = form.logoUrl
    if (form.coverUrl !== store.coverUrl) payload.coverUrl = form.coverUrl
    void patch(payload, 'Saved.')
  }

  async function login(reset: boolean) {
    setLoginBusy(true)
    setLoginError(null)
    try {
      const body = await api<{ email: string; tempPassword: string }>(`/api/admin/sellers/${slug}/create-login`, {
        method: 'POST',
        body: JSON.stringify(reset ? { reset: true } : { email: loginEmail.trim() }),
      })
      setCredentials(body)
      setStore((s) => (s ? { ...s, hasLogin: true } : s))
    } catch (err) {
      setLoginError(err instanceof Error ? err.message : 'Could not create the login')
    } finally {
      setLoginBusy(false)
    }
  }

  if (loading) {
    return (
      <div className="flex h-full flex-col items-center gap-2 overflow-y-auto py-20 text-ink/50">
        <Loader2 size={20} className="animate-spin" />
        <p className="text-sm">Loading store…</p>
      </div>
    )
  }
  if (!store || !form) {
    return (
      <div className="h-full overflow-y-auto">
        <div className="mx-auto max-w-2xl px-6 py-16 text-center">
          <p className="text-sm text-ink/55">Store not found.</p>
          <Link href="/admin/catalogues" className="mt-3 inline-block text-sm font-semibold text-teal-deep">
            Back to Social Stores
          </Link>
        </div>
      </div>
    )
  }

  const live = store.status === 'active'
  const set = <K extends keyof AdminStore>(key: K, value: AdminStore[K]) => setForm((f) => (f ? { ...f, [key]: value } : f))

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-8xl px-6 py-8">
        <Link href="/admin/catalogues" className="flex items-center gap-1.5 text-sm font-semibold text-ink/55 hover:text-ink">
          <ArrowLeft size={15} /> Social Stores
        </Link>

        <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="font-display text-3xl text-ink">{store.name}</h1>
            <p className="mt-1 text-sm text-ink/55">
              /stores/{store.slug} · {store.productCount} product{store.productCount === 1 ? '' : 's'}
              {store.productCount !== store.activeProductCount ? ` (${store.activeProductCount} active)` : ''}
            </p>
          </div>
          <div className="flex flex-none items-center gap-2">
            <a
              href={`/stores/${store.slug}`}
              target="_blank"
              rel="noreferrer"
              title={live ? undefined : 'Only staff can open it while it is hidden'}
              className="flex items-center gap-1.5 rounded-full border border-ink/15 px-3 py-1.5 text-xs font-semibold text-ink/65 hover:text-ink"
            >
              <ExternalLink size={13} /> {live ? 'View store' : 'Preview store'}
            </a>
            <span className={`rounded-full px-3 py-1.5 text-xs font-semibold ${live ? 'bg-teal/10 text-teal-deep' : 'bg-ink/5 text-ink/50'}`}>
              {live ? 'Live' : 'Hidden'}
            </span>
          </div>
        </div>

        {store.kind === 'legacy' && (
          <div className="mt-5 rounded-xl border border-gold/40 bg-gold/10 px-4 py-3 text-sm text-ink">
            <p className="font-semibold">This store was set up the old way, through the seller wizard.</p>
            <p className="mt-1 text-ink/70">
              It still works, but it keeps the standard store page and shows in the Sellers list. Make it a catalogue
              store to give it the photo-and-video store page and manage it only from here.
            </p>
            <button onClick={() => patch({ convert: true }, 'This is now a catalogue store.')} disabled={saving} className={`mt-3 ${primaryButton}`}>
              Make this a catalogue store
            </button>
          </div>
        )}

        {needsMigration && (
          <p className="mt-5 rounded-xl border border-gold/40 bg-gold/10 px-4 py-3 text-sm text-ink">
            Cover photo, tagline and social links can&rsquo;t be saved until the database is updated: run{' '}
            <code className="font-mono text-xs">data/wishdrop-social-stores.sql</code> in Supabase.
          </p>
        )}

        {/* ── Setup steps ── */}
        <section className={`mt-5 p-5 ${panelClass}`}>
          <h2 className="font-semibold text-ink">Setting up this store</h2>
          <ol className="mt-3 flex flex-col">
            {[
              { done: true, title: 'Create the store', body: 'Name, web address and margin.', href: undefined, action: undefined },
              {
                done: store.hasLogin,
                title: 'Give the seller a login',
                body: store.hasLogin ? 'The seller can sign in and manage their own products.' : 'Optional. Skip it if you will add the products for them.',
                href: '#seller-login',
                action: store.hasLogin ? 'Manage' : 'Create login',
              },
              {
                done: store.activeProductCount > 0,
                title: 'Add products',
                body:
                  store.productCount > 0
                    ? `${store.activeProductCount} active of ${store.productCount}.`
                    : 'Photos, videos, price, sizes and colours.',
                href: `/admin/catalogues?add=${store.id}`,
                action: 'Add product',
              },
              {
                done: false,
                optional: true,
                title: 'Group products into collections',
                body: 'Optional. Shoppers can filter the store by them.',
                href: '#collections',
                action: 'Collections',
              },
              {
                done: Boolean(store.logoUrl && store.coverUrl),
                title: 'Customise the store page',
                body: 'Logo, cover photo, tagline and social links.',
                href: '#store-page',
                action: 'Edit',
              },
              {
                done: live,
                title: 'Go live',
                body: live ? 'Shoppers can find and buy from this store.' : 'Shoppers can’t see the store until you do this.',
                href: undefined,
                action: undefined,
              },
            ].map((step, i, all) => (
              <li key={step.title} className="relative flex gap-3 pb-4 last:pb-0">
                {i < all.length - 1 && <span className="absolute left-[13px] top-7 h-[calc(100%-1.75rem)] w-px bg-ink/10" />}
                <span
                  className={`grid h-7 w-7 flex-none place-items-center rounded-full text-xs font-bold ${
                    step.done ? 'bg-teal text-white' : 'border border-ink/20 bg-card text-ink/50'
                  }`}
                >
                  {step.done ? '✓' : i + 1}
                </span>
                <div className="flex min-w-0 flex-1 flex-wrap items-start justify-between gap-2 pt-0.5">
                  <div className="min-w-0">
                    <p className={`text-sm font-semibold ${step.done ? 'text-ink' : 'text-ink/80'}`}>{step.title}</p>
                    <p className="text-xs text-ink/50">{step.body}</p>
                  </div>
                  {step.href && step.action && (
                    <Link href={step.href} className="flex-none rounded-lg border border-ink/15 px-3 py-1.5 text-xs font-semibold text-ink/70 hover:text-ink">
                      {step.action}
                    </Link>
                  )}
                  {i === all.length - 1 && (
                    <button
                      onClick={() => {
                        if (!live && store.activeProductCount === 0 && !window.confirm('This store has no active products yet, so shoppers will see an empty store. Go live anyway?')) return
                        void patch({ status: live ? 'inactive' : 'active' }, live ? 'Store hidden. Only staff can preview it now.' : 'Store is live.')
                      }}
                      disabled={saving}
                      className={live ? 'flex-none rounded-lg border border-ink/15 px-3 py-1.5 text-xs font-semibold text-ink/70 hover:text-ink' : 'flex-none rounded-lg bg-teal-deep px-3 py-1.5 text-xs font-semibold text-parchment hover:bg-teal disabled:opacity-50'}
                    >
                      {live ? 'Hide store' : 'Go live'}
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ol>
          {message && <p className={`mt-3 text-sm font-semibold ${message.ok ? 'text-teal-deep' : 'text-red-700'}`}>{message.text}</p>}
        </section>

        {/* ── Seller login ── */}
        <section id="seller-login" className={`mt-4 scroll-mt-4 p-6 ${panelClass}`}>
          <h2 className="font-semibold text-ink">Seller portal login</h2>
          <p className="mt-0.5 text-sm text-ink/55">
            Lets the seller sign in at /seller/login and add their own products, photos and videos. Optional: you can
            also add everything for them.
          </p>

          {credentials ? (
            <div className="mt-4 rounded-xl border border-teal/30 bg-teal/[0.06] p-4 text-sm text-ink">
              <p className="font-semibold">Send these to the seller now. The password is shown only once.</p>
              <p className="mt-2">
                Email: <span className="font-mono">{credentials.email}</span>
              </p>
              <p>
                Temporary password: <span className="font-mono font-semibold">{credentials.tempPassword}</span>
              </p>
              <button
                type="button"
                onClick={() => navigator.clipboard?.writeText(`Wishdrop seller login\n${window.location.origin}/seller/login\nEmail: ${credentials.email}\nPassword: ${credentials.tempPassword}`)}
                className="mt-3 flex items-center gap-1.5 text-xs font-semibold text-teal-deep underline"
              >
                <Copy size={12} /> Copy as a message
              </button>
            </div>
          ) : store.hasLogin ? (
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <span className="text-sm text-ink/70">This seller has a login.</span>
              <button onClick={() => login(true)} disabled={loginBusy} className="rounded-xl border border-ink/15 px-4 py-2 text-sm font-semibold text-ink/70 hover:text-ink disabled:opacity-60">
                {loginBusy ? 'Working…' : 'Reset password'}
              </button>
            </div>
          ) : (
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <input type="email" value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)} placeholder="Seller's email" className={`${inputClass} max-w-xs`} />
              <button onClick={() => login(false)} disabled={loginBusy || !loginEmail.trim()} className={primaryButton}>
                {loginBusy ? 'Creating…' : 'Create login'}
              </button>
            </div>
          )}
          {loginError && <p className="mt-2 text-sm font-semibold text-red-700">{loginError}</p>}
        </section>

        {/* ── Products ── */}
        <section className={`mt-4 flex flex-wrap items-center justify-between gap-4 p-5 ${panelClass}`}>
          <div>
            <h2 className="font-semibold text-ink">Products</h2>
            <p className="mt-0.5 text-sm text-ink/55">
              {store.productCount === 0 ? 'No products yet.' : `${store.productCount} product${store.productCount === 1 ? '' : 's'}, ${store.activeProductCount} active.`}
            </p>
          </div>
          <div className="flex gap-2">
            <Link href={`/admin/catalogues?store=${store.id}`} className="rounded-xl border border-ink/15 px-4 py-2.5 text-sm font-semibold text-ink/70 hover:text-ink">
              See products
            </Link>
            <Link href={`/admin/catalogues?add=${store.id}`} className={primaryButton}>
              Add product
            </Link>
          </div>
        </section>

        <StoreCollections slug={store.slug} />

        {/* ── Profile, contact, margin ── */}
        <form id="store-page" onSubmit={saveAll} className={`mt-4 flex scroll-mt-4 flex-col gap-5 p-6 ${panelClass}`}>
          <div>
            <h2 className="font-semibold text-ink">Store page</h2>
            <p className="mt-0.5 text-sm text-ink/55">What shoppers see at the top of the store. The seller can also edit this in their portal.</p>
          </div>

          <div>
            <span className={labelClass}>Cover photo and logo</span>
            <div className="relative">
              <button type="button" onClick={() => coverInput.current?.click()} aria-label="Change cover photo" className="relative block h-48 w-full overflow-hidden rounded-xl border border-dashed border-ink/25 bg-parchment sm:h-64">
                {form.coverUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={imageThumb(form.coverUrl, 900)} alt="" className="h-full w-full object-cover" />
                ) : (
                  <span className="flex h-full flex-col items-center justify-center gap-1 text-ink/50">
                    <ImagePlus size={20} />
                    <span className="text-xs font-semibold">Add a cover photo</span>
                  </span>
                )}
                {uploading === 'cover' && (
                  <span className="absolute inset-0 grid place-items-center bg-white/70">
                    <Loader2 size={20} className="animate-spin text-teal-deep" />
                  </span>
                )}
              </button>
              <button type="button" onClick={() => logoInput.current?.click()} aria-label="Change logo" className="absolute -bottom-6 left-4 grid h-20 w-20 place-items-center overflow-hidden rounded-full border-4 border-card bg-parchment shadow-sm">
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
            <p className="mt-9 text-xs text-ink/45">Click the cover or the logo to change it.</p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className={labelClass}>Store name</span>
              <input required value={form.name} maxLength={80} onChange={(e) => set('name', e.target.value)} className={inputClass} />
            </label>
            <label className="block">
              <span className={labelClass}>Country</span>
              <input value={form.country} onChange={(e) => set('country', e.target.value)} className={inputClass} />
            </label>
          </div>
          <label className="block">
            <span className={labelClass}>Tagline</span>
            <input value={form.tagline} maxLength={120} onChange={(e) => set('tagline', e.target.value)} placeholder="e.g. Handmade jewellery from Jaipur" className={inputClass} />
          </label>
          <label className="block">
            <span className={labelClass}>About the store</span>
            <textarea value={form.description} maxLength={1000} rows={3} onChange={(e) => set('description', e.target.value)} className={inputClass} />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className={labelClass}>Instagram</span>
              <input value={form.instagram} onChange={(e) => set('instagram', e.target.value)} placeholder="@theirshop" className={inputClass} />
            </label>
            <label className="block">
              <span className={labelClass}>Facebook page</span>
              <input value={form.facebook} onChange={(e) => set('facebook', e.target.value)} placeholder="theirshop or facebook.com/theirshop" className={inputClass} />
            </label>
          </div>

          <div className="border-t border-ink/10 pt-5">
            <h2 className="font-semibold text-ink">Seller and margin</h2>
            <p className="mt-0.5 text-sm text-ink/55">For staff only. Shoppers never see this.</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className={labelClass}>Seller&rsquo;s name</span>
              <input value={form.contactName} onChange={(e) => set('contactName', e.target.value)} className={inputClass} />
            </label>
            <label className="block">
              <span className={labelClass}>WhatsApp / phone</span>
              <input value={form.contactPhone} onChange={(e) => set('contactPhone', e.target.value)} className={inputClass} />
            </label>
            <label className="block">
              <span className={labelClass}>Email</span>
              <input type="email" value={form.contactEmail} onChange={(e) => set('contactEmail', e.target.value)} className={inputClass} />
            </label>
            <label className="block">
              <span className={labelClass}>Wishdrop margin % (new products)</span>
              <input type="number" min="0" step="0.5" value={form.defaultMarginPercent} onChange={(e) => set('defaultMarginPercent', Number(e.target.value))} className={inputClass} />
            </label>
          </div>
          <label className="block">
            <span className={labelClass}>Notes</span>
            <textarea value={form.notes} rows={2} onChange={(e) => set('notes', e.target.value)} placeholder="Payment terms, how they ship to our warehouse, anything staff should know." className={inputClass} />
          </label>
          <p className="text-xs text-ink/45">Changing the margin affects products added from now on. Products already added keep theirs; change those on the product.</p>

          <div className="flex items-center justify-end gap-3">
            {message && <span className={`text-sm font-semibold ${message.ok ? 'text-teal-deep' : 'text-red-700'}`}>{message.text}</span>}
            <button type="submit" disabled={saving || uploading !== null} className={primaryButton}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>

      </div>
    </div>
  )
}

export default function CatalogueStorePage() {
  const params = useParams<{ slug: string }>()
  return params.slug === 'new' ? <NewStore /> : <ManageStore key={params.slug} slug={params.slug} />
}
