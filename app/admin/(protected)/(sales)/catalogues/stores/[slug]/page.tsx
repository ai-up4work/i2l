// app/admin/(protected)/(sales)/catalogues/stores/[slug]/page.tsx
//
// One social store (an Instagram / Facebook seller with no website feed):
// create it (/admin/catalogues/stores/new) and manage it — store page,
// seller and margin, location, seller-portal login, live/hidden.
//
// These stores are created only here, never in the seller wizard: the
// wizard's "mock" method is an extractor store (lib/catalogue-stores.ts).
//
// Layout follows the shared Social Stores kit
// (components/admin/catalogue/ui.tsx): header with status, then a main
// column (what you edit) and a side column (setup progress, login,
// products) that stays in view while you scroll.
'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { Check, Copy, ExternalLink, Eye, EyeOff, ImagePlus, KeyRound, Loader2, Package, Plus, Store } from 'lucide-react'
import { uploadMedia } from '@/lib/upload/useMediaUpload'
import { imageThumb } from '@/lib/media'
import { storeSlugFromName, storeSlugProblem } from '@/lib/catalogue-stores'
import type { AdminStore } from '@/lib/catalogue-stores-admin'
import type { StoreOrigin } from '@/lib/store-origin'
import StoreCollections from '@/components/admin/catalogue/StoreCollections'
import { StoreOriginPicker } from '@/components/admin/StoreOriginPicker'
import { StoreCategoryPicker } from '@/components/admin/StoreCategoryPicker'
import {
  BackLink,
  btnPrimary,
  btnSecondary,
  btnSmall,
  card,
  FieldLabel,
  FullPageLoading,
  IconTile,
  input,
  Notice,
  OriginTag,
  PageHeader,
  PageShell,
  Section,
  StateShell,
  StatusPill,
  StoreAvatar,
} from '@/components/admin/catalogue/ui'

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
  const [origin, setOrigin] = useState<StoreOrigin>('IN')
  const [categories, setCategories] = useState<string[]>([])
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
        body: JSON.stringify({ name, slug: effectiveSlug, contactName, contactEmail, contactPhone, marginPercent: margin, storeOrigin: origin, categories }),
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
    <PageShell>
      <BackLink />
      <PageHeader
        leading={
          <IconTile>
            <Store size={22} strokeWidth={1.75} />
          </IconTile>
        }
        title="New social store"
        meta="For a seller with no website to pull products from, such as an Instagram or Facebook shop. The store starts hidden; you make it live when it’s ready."
      />
      {fromApplication && (
        <div className="mt-5">
          <Notice tone="teal">Filled in from their application. Check the details, then create the store.</Notice>
        </div>
      )}

      <form onSubmit={handleSubmit} className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex flex-col gap-4">
          <Section title="The store" description="What shoppers see, and where the store lives on the site.">
            <div className="flex flex-col gap-4">
              <FieldLabel label="Store name">
                <input required autoFocus value={name} maxLength={80} onChange={(e) => setName(e.target.value)} placeholder="e.g. Meera Handlooms" className={input} />
              </FieldLabel>
              <FieldLabel
                label="Web address"
                hint={<span className={slugError ? 'font-medium text-red-600' : undefined}>{slugError ?? 'Filled in from the name. It can’t be changed after the store is created.'}</span>}
              >
                <div className="flex items-center rounded-xl border border-ink/15 bg-white focus-within:border-teal/60 focus-within:ring-2 focus-within:ring-teal/10">
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
              </FieldLabel>
            </div>
          </Section>

          <Section title="Categories" description="Shoppers find the store under these in Shop by category.">
            <StoreCategoryPicker value={categories} onChange={setCategories} />
          </Section>

          <Section title="Store location" description="Staff only. Shoppers are never told where a store is.">
            <StoreOriginPicker value={origin} onChange={setOrigin} />
          </Section>

          <Section title="Seller and margin" description="Staff only. Shoppers never see this.">
            <div className="grid gap-4 sm:grid-cols-2">
              <FieldLabel label="Seller’s name (optional)">
                <input value={contactName} onChange={(e) => setContactName(e.target.value)} className={input} />
              </FieldLabel>
              <FieldLabel label="WhatsApp / phone (optional)">
                <input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} className={input} />
              </FieldLabel>
              <FieldLabel label="Seller’s email (optional)" hint="Needed later for a portal login.">
                <input type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} className={input} />
              </FieldLabel>
              <FieldLabel label="Wishdrop margin %" hint="Added on top of the seller’s price for each product.">
                <input type="number" min="0" step="0.5" value={margin} onChange={(e) => setMargin(e.target.value)} className={input} />
              </FieldLabel>
            </div>
          </Section>
        </div>

        <aside className="lg:sticky lg:top-6 lg:self-start">
          <div className={`p-6 ${card}`}>
            <h2 className="font-display text-lg font-semibold text-ink">After you create it</h2>
            <ol className="mt-4 flex flex-col gap-3 text-sm text-ink/65">
              {['Give the seller a login (optional)', 'Add products, photos and videos', 'Add a logo and cover photo', 'Go live'].map((t, i) => (
                <li key={t} className="flex gap-3">
                  <span className="grid h-6 w-6 flex-none place-items-center rounded-full border border-ink/15 text-xs font-bold text-ink/50">{i + 1}</span>
                  <span className="pt-0.5">{t}</span>
                </li>
              ))}
            </ol>
            {error && <p className="mt-4 text-sm font-medium text-red-600">{error}</p>}
            <div className="mt-6 flex flex-col gap-2">
              <button type="submit" disabled={saving} className={btnPrimary}>
                {saving ? 'Creating…' : 'Create store'}
              </button>
              <Link href="/admin/catalogues" className={btnSecondary}>
                Cancel
              </Link>
            </div>
          </div>
        </aside>
      </form>
    </PageShell>
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
  const [copied, setCopied] = useState(false)

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
      categories: form.categories,
    }
    if (form.origin !== store.origin) payload.storeOrigin = form.origin
    // Only send images that changed — an older logo may be a plain link
    // from before uploads existed, which the server would refuse.
    if (form.logoUrl !== store.logoUrl) payload.logoUrl = form.logoUrl
    if (form.coverUrl !== store.coverUrl) payload.coverUrl = form.coverUrl
    void patch(payload, 'Saved.')
  }

  function toggleLive() {
    if (!store) return
    const live = store.status === 'active'
    if (!live && store.activeProductCount === 0 && !window.confirm('This store has no active products yet, so shoppers will see an empty store. Go live anyway?')) return
    void patch({ status: live ? 'inactive' : 'active' }, live ? 'Store hidden. Only staff can preview it now.' : 'Store is live.')
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

  if (loading) return <FullPageLoading label="Loading store…" />
  if (!store || !form) {
    return (
      <PageShell narrow>
        <div className={`mt-10 ${card}`}>
          <StateShell
            icon={<Store size={22} className="text-ink/25" />}
            title="Store not found"
            body="It may not be a social store. Feed and extractor stores are managed in Sellers."
            action={
              <Link href="/admin/catalogues" className={btnSecondary}>
                Back to Social Stores
              </Link>
            }
          />
        </div>
      </PageShell>
    )
  }

  const live = store.status === 'active'
  const set = <K extends keyof AdminStore>(key: K, value: AdminStore[K]) => setForm((f) => (f ? { ...f, [key]: value } : f))
  const dirty = JSON.stringify(form) !== JSON.stringify(store)

  const steps = [
    { done: true, title: 'Create the store', body: 'Name, web address and margin.' },
    {
      done: store.hasLogin,
      title: 'Seller login',
      body: store.hasLogin ? 'The seller can manage their own products.' : 'Optional — skip it if you add products for them.',
      href: '#seller-login',
    },
    {
      done: store.activeProductCount > 0,
      title: 'Add products',
      body: store.productCount > 0 ? `${store.activeProductCount} active of ${store.productCount}.` : 'Photos, videos, price, sizes and colours.',
      href: `/admin/catalogues?add=${store.id}`,
    },
    { done: Boolean(store.logoUrl && store.coverUrl), title: 'Logo and cover photo', body: 'The top of the store page.', href: '#store-page' },
    { done: live, title: 'Go live', body: live ? 'Shoppers can find and buy from it.' : 'Shoppers can’t see it until you do this.' },
  ]
  const doneCount = steps.filter((s) => s.done).length

  return (
    <PageShell>
      <BackLink />
      <PageHeader
        leading={<StoreAvatar name={store.name} logoUrl={store.logoUrl} size={56} />}
        title={store.name}
        badges={
          <>
            <StatusPill tone={live ? 'live' : 'hidden'}>{live ? 'Live' : 'Hidden'}</StatusPill>
            <OriginTag origin={store.origin} />
          </>
        }
        meta={
          <>
            /stores/{store.slug} · {store.productCount} product{store.productCount === 1 ? '' : 's'}
            {store.productCount !== store.activeProductCount ? ` (${store.activeProductCount} active)` : ''}
          </>
        }
        actions={
          <>
            <a href={`/stores/${store.slug}`} target="_blank" rel="noreferrer" className={btnSecondary} title={live ? undefined : 'Only staff can open it while it is hidden'}>
              <ExternalLink size={14} aria-hidden /> {live ? 'View store' : 'Preview store'}
            </a>
            <button type="button" onClick={toggleLive} disabled={saving} className={live ? btnSecondary : btnPrimary}>
              {live ? <EyeOff size={14} aria-hidden /> : <Eye size={14} aria-hidden />} {live ? 'Hide store' : 'Go live'}
            </button>
          </>
        }
      />

      {(needsMigration || message) && (
        <div className="mt-5 flex flex-col gap-2">
          {needsMigration && (
            <Notice>
              Some settings can&rsquo;t be saved until the database is updated: run{' '}
              <code className="font-mono text-xs">data/wishdrop-social-stores.sql</code> and{' '}
              <code className="font-mono text-xs">data/wishdrop-store-types-and-location.sql</code> in Supabase.
            </Notice>
          )}
          {message && <Notice tone={message.ok ? 'teal' : 'red'}>{message.text}</Notice>}
        </div>
      )}

      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        {/* ── Main column: what you edit ── */}
        <div className="flex min-w-0 flex-col gap-4">
          <form id="store-page" onSubmit={saveAll} className="flex flex-col gap-4">
            <Section title="Store page" description="What shoppers see at the top of the store. The seller can also edit this in their portal.">
              <div>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => coverInput.current?.click()}
                    aria-label="Change cover photo"
                    className="relative block h-44 w-full overflow-hidden rounded-xl border border-dashed border-ink/20 bg-parchment sm:h-56"
                  >
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
                  <button
                    type="button"
                    onClick={() => logoInput.current?.click()}
                    aria-label="Change logo"
                    className="absolute -bottom-7 left-5 grid h-20 w-20 place-items-center overflow-hidden rounded-full border-4 border-card bg-parchment shadow-sm"
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
                <p className="mt-10 text-xs text-ink/45">Click the cover or the logo to change it.</p>
              </div>

              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <FieldLabel label="Store name">
                  <input required value={form.name} maxLength={80} onChange={(e) => set('name', e.target.value)} className={input} />
                </FieldLabel>
                <FieldLabel label="Tagline">
                  <input value={form.tagline} maxLength={120} onChange={(e) => set('tagline', e.target.value)} placeholder="e.g. Handmade jewellery from Jaipur" className={input} />
                </FieldLabel>
              </div>
              <div className="mt-4">
                <FieldLabel label="About the store">
                  <textarea value={form.description} maxLength={1000} rows={3} onChange={(e) => set('description', e.target.value)} className={input} />
                </FieldLabel>
              </div>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <FieldLabel label="Instagram">
                  <input value={form.instagram} onChange={(e) => set('instagram', e.target.value)} placeholder="@theirshop" className={input} />
                </FieldLabel>
                <FieldLabel label="Facebook page">
                  <input value={form.facebook} onChange={(e) => set('facebook', e.target.value)} placeholder="theirshop or facebook.com/theirshop" className={input} />
                </FieldLabel>
              </div>
            </Section>

            <Section title="Categories" description="Shoppers find the store under these in Shop by category.">
              <StoreCategoryPicker value={form.categories} onChange={(v) => set('categories', v)} />
            </Section>

            <Section title="Seller, margin and location" description="Staff only. Shoppers never see any of this.">
              <div className="grid gap-4 sm:grid-cols-2">
                <FieldLabel label="Seller’s name">
                  <input value={form.contactName} onChange={(e) => set('contactName', e.target.value)} className={input} />
                </FieldLabel>
                <FieldLabel label="WhatsApp / phone">
                  <input value={form.contactPhone} onChange={(e) => set('contactPhone', e.target.value)} className={input} />
                </FieldLabel>
                <FieldLabel label="Email">
                  <input type="email" value={form.contactEmail} onChange={(e) => set('contactEmail', e.target.value)} className={input} />
                </FieldLabel>
                <FieldLabel label="Wishdrop margin % (new products)" hint="Products already added keep theirs; change those on the product.">
                  <input type="number" min="0" step="0.5" value={form.defaultMarginPercent} onChange={(e) => set('defaultMarginPercent', Number(e.target.value))} className={input} />
                </FieldLabel>
              </div>
              <div className="mt-5">
                <span className="mb-1.5 block text-xs font-semibold text-ink/55">Store location</span>
                <StoreOriginPicker value={form.origin} onChange={(v) => set('origin', v)} />
                {form.origin !== store.origin && (
                  <p className="mt-2 text-xs font-medium text-gold-deep">
                    Seller prices will be read as {form.origin === 'LK' ? 'LKR' : 'INR'} after you save. Check this store&rsquo;s product prices.
                  </p>
                )}
              </div>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <FieldLabel label="Country (internal note)">
                  <input value={form.country} onChange={(e) => set('country', e.target.value)} className={input} />
                </FieldLabel>
              </div>
              <div className="mt-4">
                <FieldLabel label="Notes">
                  <textarea value={form.notes} rows={2} onChange={(e) => set('notes', e.target.value)} placeholder="Payment terms, how they get items to our warehouse, anything staff should know." className={input} />
                </FieldLabel>
              </div>
            </Section>

            {/* Save bar — sticks to the bottom while there are unsaved changes. */}
            <div className={`sticky bottom-4 z-10 flex items-center justify-between gap-3 px-5 py-3 ${card} ${dirty ? 'shadow-[0_18px_40px_-20px_rgba(32,36,43,0.45)]' : ''}`}>
              <span className="text-xs text-ink/50">{dirty ? 'You have unsaved changes.' : 'All changes saved.'}</span>
              <div className="flex gap-2">
                {dirty && (
                  <button type="button" onClick={() => setForm(store)} className={btnSecondary}>
                    Discard
                  </button>
                )}
                <button type="submit" disabled={saving || uploading !== null || !dirty} className={btnPrimary}>
                  {saving ? 'Saving…' : 'Save changes'}
                </button>
              </div>
            </div>
          </form>

          <StoreCollections slug={store.slug} />
        </div>

        {/* ── Side column ── */}
        <aside className="flex flex-col gap-4 lg:sticky lg:top-6 lg:self-start">
          <section className={`p-5 ${card}`}>
            <div className="flex items-baseline justify-between">
              <h2 className="font-display text-lg font-semibold text-ink">Setup</h2>
              <span className="text-xs font-semibold text-ink/45">
                {doneCount} of {steps.length} done
              </span>
            </div>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-ink/[0.06]">
              <div className="h-full rounded-full bg-teal-deep transition-all" style={{ width: `${(doneCount / steps.length) * 100}%` }} />
            </div>
            <ol className="mt-4 flex flex-col gap-3">
              {steps.map((step, i) => (
                <li key={step.title} className="flex gap-3">
                  <span
                    className={`grid h-6 w-6 flex-none place-items-center rounded-full text-[11px] font-bold ${
                      step.done ? 'bg-teal-deep text-parchment' : 'border border-ink/20 bg-card text-ink/45'
                    }`}
                  >
                    {step.done ? <Check size={12} strokeWidth={3} /> : i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    {step.href && !step.done ? (
                      <Link href={step.href} className="text-sm font-semibold text-ink hover:text-teal-deep">
                        {step.title}
                      </Link>
                    ) : (
                      <p className={`text-sm font-semibold ${step.done ? 'text-ink/60' : 'text-ink'}`}>{step.title}</p>
                    )}
                    <p className="text-xs text-ink/45">{step.body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </section>

          <section className={`p-5 ${card}`}>
            <div className="flex items-center justify-between gap-2">
              <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-ink">
                <Package size={16} className="text-ink/40" /> Products
              </h2>
              <span className="text-xs text-ink/45">
                {store.activeProductCount} active · {store.productCount - store.activeProductCount} hidden
              </span>
            </div>
            <div className="mt-4 flex gap-2">
              <Link href={`/admin/catalogues?store=${store.id}`} className={`${btnSecondary} flex-1`}>
                See products
              </Link>
              <Link href={`/admin/catalogues?add=${store.id}`} className={`${btnPrimary} flex-1`}>
                <Plus size={14} aria-hidden /> Add
              </Link>
            </div>
          </section>

          <section id="seller-login" className={`scroll-mt-6 p-5 ${card}`}>
            <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-ink">
              <KeyRound size={16} className="text-ink/40" /> Seller portal login
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-ink/55">
              Lets the seller sign in at /seller/login and add their own products, photos and videos. Optional.
            </p>

            {credentials ? (
              <div className="mt-4 rounded-xl border border-teal/30 bg-teal/[0.06] p-4 text-sm text-ink">
                <p className="text-xs font-semibold">Send these to the seller now. The password is shown only once.</p>
                <p className="mt-2 break-all text-xs">
                  Email: <span className="font-mono">{credentials.email}</span>
                </p>
                <p className="text-xs">
                  Password: <span className="font-mono font-semibold">{credentials.tempPassword}</span>
                </p>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard?.writeText(`Wishdrop seller login\n${window.location.origin}/seller/login\nEmail: ${credentials.email}\nPassword: ${credentials.tempPassword}`)
                    setCopied(true)
                    window.setTimeout(() => setCopied(false), 2000)
                  }}
                  className={`mt-3 ${btnSmall}`}
                >
                  {copied ? <Check size={12} /> : <Copy size={12} />} {copied ? 'Copied' : 'Copy as a message'}
                </button>
              </div>
            ) : store.hasLogin ? (
              <div className="mt-4 flex items-center justify-between gap-3">
                <StatusPill tone="live">Has a login</StatusPill>
                <button type="button" onClick={() => login(true)} disabled={loginBusy} className={btnSmall}>
                  {loginBusy ? 'Working…' : 'Reset password'}
                </button>
              </div>
            ) : (
              <div className="mt-4 flex flex-col gap-2">
                <input type="email" value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)} placeholder="Seller's email" className={input} />
                <button type="button" onClick={() => login(false)} disabled={loginBusy || !loginEmail.trim()} className={btnPrimary}>
                  {loginBusy ? 'Creating…' : 'Create login'}
                </button>
              </div>
            )}
            {loginError && <p className="mt-2 text-xs font-semibold text-red-700">{loginError}</p>}
          </section>
        </aside>
      </div>
    </PageShell>
  )
}

export default function CatalogueStorePage() {
  const params = useParams<{ slug: string }>()
  return params.slug === 'new' ? <NewStore /> : <ManageStore key={params.slug} slug={params.slug} />
}
