'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Check } from 'lucide-react'

import { EXTRACTOR_TYPE_LABEL } from '@/data/sellers/data'
import type { StoreProviderType } from '@/lib/store-config'

// ---------------------------------------------------------------------------
// /admin/sellers/new — Sales & Purchase Executive
// Add a new seller manually. `platform` is the slug used everywhere else
// (affiliatedStores, STORE_PROVIDERS, /stores/[platform]) — pick it once,
// here, since it becomes the join key across every downstream table.
//
// Demo only: on submit this shows a confirmation and returns to the list,
// but does NOT persist. Wire handleSubmit up to a real
// POST /api/admin/sellers once it exists — that endpoint should create
// both an affiliatedStores entry and a STORE_PROVIDERS entry (type: 'mock'
// if providerType is left as manual, or the selected type with just
// baseUrl/currency set — full field mapping/selectors get filled in on the
// Scrape config page afterward, not here).
// ---------------------------------------------------------------------------

const PROVIDER_TYPE_OPTIONS: StoreProviderType[] = ['mock', 'shopify', 'woocommerce', 'jsonapi', 'html-scrape']

const slugify = (s: string) =>
  s
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')

export default function NewSellerPage() {
  const router = useRouter()
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  const [form, setForm] = useState({
    storeName: '',
    platform: '',
    platformTouched: false,
    providerType: 'mock' as StoreProviderType,
    storeUrl: '',
    contactName: '',
    contactEmail: '',
    contactPhone: '',
    notes: '',
  })

  const onStoreNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const storeName = e.target.value
    setForm((prev) => ({
      ...prev,
      storeName,
      // Auto-derive the slug from the name until the person edits it
      // directly — once touched, typing the name never overwrites it again.
      platform: prev.platformTouched ? prev.platform : slugify(storeName),
    }))
  }

  const onPlatformChange = (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((prev) => ({ ...prev, platform: slugify(e.target.value), platformTouched: true }))

  const set = (key: keyof typeof form) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => setForm((prev) => ({ ...prev, [key]: e.target.value }))

  const canSubmit = form.storeName.trim().length > 0 && form.platform.length > 0 && form.contactEmail.trim().length > 0

  const handleSubmit = () => {
    if (!canSubmit) return
    setSubmitting(true)
    // TODO(wire-up): POST to /api/admin/sellers with `form`. On success,
    // router.push(`/admin/sellers/${form.platform}`) — or, if providerType
    // is anything other than 'mock', straight to
    // `/admin/sellers/${form.platform}/scrape-config` since there's more
    // to configure before the feed will actually pull products.
    window.setTimeout(() => {
      setSubmitting(false)
      setSubmitted(true)
      window.setTimeout(() => router.push('/admin/sellers'), 900)
    }, 500)
  }

  return (
    <div className="mx-auto max-w-2xl px-6 pb-20 pt-8 lg:px-10">
      <button
        type="button"
        onClick={() => router.push('/admin/sellers')}
        className="flex items-center gap-1.5 text-sm font-semibold text-ink/50 hover:text-ink"
      >
        <ArrowLeft size={14} />
        Sellers
      </button>

      <h1 className="mt-4 font-display text-3xl text-ink">Add a seller</h1>
      <p className="mt-2 text-sm text-ink/60">
        Enter the store and contact details. Feed field mapping or CSS selectors for a Custom
        provider get configured afterward, from the seller&rsquo;s Scrape config page.
      </p>

      {submitted ? (
        <div className="mt-8 flex items-center gap-2 rounded-xl border border-teal-deep/25 bg-teal-deep/10 px-4 py-3 text-sm font-semibold text-teal-deep">
          <Check size={16} />
          Seller added (demo — not yet saved to a backend). Returning to the list...
        </div>
      ) : (
        <div className="mt-8 flex flex-col gap-5 rounded-xl border border-ink/10 bg-card p-5">
          <Field label="Store name" required>
            <input
              type="text"
              value={form.storeName}
              onChange={onStoreNameChange}
              placeholder="e.g. Chennai Silk House"
              className={inputClass}
            />
          </Field>

          <Field label="Platform slug" required>
            <input
              type="text"
              value={form.platform}
              onChange={onPlatformChange}
              placeholder="chennai-silk-house"
              className={`${inputClass} font-mono`}
            />
            <p className="mt-1 text-xs text-ink/40">
              Used everywhere internally (feed config, storefront URL /stores/{form.platform || '...'})
              — auto-filled from the store name, editable if you need something different.
            </p>
          </Field>

          <Field label="Catalogue feed">
            <select
              value={form.providerType}
              onChange={(e) => setForm((prev) => ({ ...prev, providerType: e.target.value as StoreProviderType }))}
              className={inputClass}
            >
              {PROVIDER_TYPE_OPTIONS.map((t) => (
                <option key={t} value={t}>
                  {EXTRACTOR_TYPE_LABEL[t]}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Store URL">
            <input
              type="url"
              value={form.storeUrl}
              onChange={set('storeUrl')}
              placeholder="https://"
              className={inputClass}
            />
          </Field>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <Field label="Contact name">
              <input
                type="text"
                value={form.contactName}
                onChange={set('contactName')}
                placeholder="Full name"
                className={inputClass}
              />
            </Field>
            <Field label="Contact phone">
              <input
                type="tel"
                value={form.contactPhone}
                onChange={set('contactPhone')}
                placeholder="+91 ..."
                className={inputClass}
              />
            </Field>
          </div>

          <Field label="Contact email" required>
            <input
              type="email"
              value={form.contactEmail}
              onChange={set('contactEmail')}
              placeholder="name@store.com"
              className={inputClass}
            />
          </Field>

          <Field label="Notes">
            <textarea
              value={form.notes}
              onChange={set('notes')}
              rows={3}
              placeholder="Onboarding context, feed reliability, anything the next person should know..."
              className={inputClass}
            />
          </Field>

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => router.push('/admin/sellers')}
              className="rounded-xl border border-ink/15 px-4 py-2 text-sm font-semibold text-ink hover:bg-ink/5"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!canSubmit || submitting}
              className="rounded-xl bg-teal-deep px-4 py-2 text-sm font-semibold text-white transition-all hover:bg-teal disabled:cursor-not-allowed disabled:bg-ink/20"
            >
              {submitting ? 'Adding...' : 'Add seller'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

const inputClass =
  'w-full rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm text-ink outline-none focus:border-teal/50'

function Field({
  label,
  required,
  children,
}: {
  label: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <label className="block">
      <span className="text-xs font-semibold text-ink/50">
        {label}
        {required && <span className="text-red-600"> *</span>}
      </span>
      <div className="mt-1.5">{children}</div>
    </label>
  )
}