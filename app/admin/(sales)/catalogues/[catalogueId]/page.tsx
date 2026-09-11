// app/admin/(sales)/catalogues/[catalogueId]/page.tsx
'use client'

import { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, Check, Clock, ImagePlus, Loader2, Plus, Search, Trash2, X } from 'lucide-react'

import {
  getCatalogueEntry,
  getSellerName,
  computeSellingPrice,
  approveChangeRequest,
  rejectChangeRequest,
  STATUS_LABEL,
  type CatalogueEntry,
  type CatalogueStatus,
  type CatalogueVariant,
} from '@/data/catalogues/data'
import { ADMIN_SELLERS } from '@/data/sellers/data'
import { panelClass, groupClass, inputClass, monoInputClass, Field, SectionHeading } from '@/components/admin/seller/shared'
import { ProductCard, type SampleProduct } from '@/components/admin/seller/ProductCard'
import type { JsonApiProviderConfig } from '@/lib/store-config'
import type { StoreProduct } from '@/lib/store.types'

// ---------------------------------------------------------------------------
// /admin/catalogues/[catalogueId] — Sales & Purchase Executive
//
// catalogueId === 'new' -> ADD mode: pick a seller, choose manual entry or
//                          "pull from feed", then fill in details/pricing.
// catalogueId === <id>  -> EDIT mode: everything loads as a form directly.
//
// "Pull from feed" (ADD mode only) calls the SAME
// /api/admin/sellers/test-extractor endpoint, in mode: 'single', that the
// seller onboarding page's "Test a specific product" box uses — this
// route makes a real fetch against the seller's live storefront and
// returns a real StoreProduct, nothing mocked. Only shopify/woocommerce/
// jsonapi sellers have a feed to pull from; mock and html-scrape sellers
// fall back to manual entry, matching what the route itself rejects
// server-side (see the providerType guard in test-extractor/route.ts).
//
// Pending seller changes (EDIT mode only): a seller can propose a cost
// price / availability change from their own /seller/catalogue/[id] page
// (see data/catalogues/data.ts — submitChangeRequest). It lands here as
// entry.pendingChange and is rendered as a review panel between Pricing
// and Variants, since it's specifically a pricing/availability diff.
// Approving applies the change immediately (approveChangeRequest);
// rejecting discards it (rejectChangeRequest). Neither writes anywhere
// else in this form — the panel manages its own commit, independent of
// the main "Save changes" button below.
//
// Delete policy (§4.1 / §3): no hard delete here. "Hide" sets status to
// 'hidden', same idiom as a seller's Deactivate — it prevents orphaning
// in-flight orders tied to this listing. Hard delete stays Manager-only.
// ---------------------------------------------------------------------------

interface TestExtractorProductResult {
  ok: boolean
  error?: string
  product?: StoreProduct
}

const FEED_TESTABLE_TYPES = new Set(['shopify', 'woocommerce', 'jsonapi'])

export default function CatalogueFormPage() {
  const router = useRouter()
  const params = useParams<{ catalogueId: string }>()
  const isNew = params.catalogueId === 'new'
  const entry = isNew ? undefined : getCatalogueEntry(params.catalogueId)

  const [sourceMode, setSourceMode] = useState<'manual' | 'feed'>('manual')

  const [sellerId, setSellerId] = useState(entry?.sellerId ?? ADMIN_SELLERS[0]?.platform ?? '')
  const selectedSeller = ADMIN_SELLERS.find((s) => s.platform === sellerId)
  const sellerFeedType = selectedSeller?.providerConfig.type
  const sellerHasFeed = !!sellerFeedType && FEED_TESTABLE_TYPES.has(sellerFeedType)

  const [title, setTitle] = useState(entry?.title ?? '')
  const [description, setDescription] = useState(entry?.description ?? '')
  const [category, setCategory] = useState(entry?.category ?? '')
  const [sizesInput, setSizesInput] = useState(entry?.sizes?.join(', ') ?? '')
  const [colorsInput, setColorsInput] = useState(entry?.colors?.join(', ') ?? '')
  const [images, setImages] = useState<string[]>(entry?.images ?? [])
  const [imageUrlDraft, setImageUrlDraft] = useState('')
  const [sourceUrl, setSourceUrl] = useState(entry?.sourceUrl)
  const [sourceProductId, setSourceProductId] = useState(entry?.sourceProductId)

  const [costPrice, setCostPrice] = useState(entry?.costPrice ?? 0)
  const [currency, setCurrency] = useState(entry?.currency ?? 'INR')
  const [markupPercent, setMarkupPercent] = useState(entry?.markupPercent ?? 20)
  const [sellingPriceOverride, setSellingPriceOverride] = useState<number | null>(entry?.sellingPrice ?? null)
  const [priceTouched, setPriceTouched] = useState(!isNew)

  const [status, setStatus] = useState<CatalogueStatus>(entry?.status ?? 'draft')
  const [variants, setVariants] = useState<CatalogueVariant[]>(entry?.variants ?? [])

  // Local mirror of entry.pendingChange so approving/rejecting updates
  // this page immediately without a full route refresh/refetch.
  const [pendingChange, setPendingChange] = useState(entry?.pendingChange ?? null)

  const computedSelling = computeSellingPrice(costPrice, markupPercent)
  const sellingPrice = priceTouched && sellingPriceOverride != null ? sellingPriceOverride : computedSelling

  const onMarkupChange = (v: number) => {
    setMarkupPercent(v)
    setPriceTouched(false)
    setSellingPriceOverride(null)
  }

  const onSellingPriceChange = (v: number) => {
    setSellingPriceOverride(v)
    setPriceTouched(true)
  }

  const handleApproveChange = () => {
    if (!entry) return
    const applied = approveChangeRequest(entry.id)
    if (!applied) return
    // Reflect the now-applied change straight into this form's state,
    // since approveChangeRequest mutated the underlying entry, not this
    // page's local state.
    const refreshed = getCatalogueEntry(entry.id)
    if (refreshed) {
      setCostPrice(refreshed.costPrice)
      setPriceTouched(false)
      setSellingPriceOverride(null)
      setVariants(refreshed.variants ?? [])
    }
    setPendingChange(null)
  }

  const handleRejectChange = () => {
    if (!entry) return
    rejectChangeRequest(entry.id)
    setPendingChange(null)
  }

  // ---- Pull from feed (ADD mode only) ----
  const [feedInput, setFeedInput] = useState('')
  const [feedLoading, setFeedLoading] = useState(false)
  const [feedResult, setFeedResult] = useState<TestExtractorProductResult | null>(null)
  const [feedApplied, setFeedApplied] = useState(false)

  const runFeedPull = async () => {
    if (!feedInput.trim() || !selectedSeller || !sellerHasFeed) return
    setFeedLoading(true)
    setFeedResult(null)
    setFeedApplied(false)

    const cfg = selectedSeller.providerConfig
    const body: Record<string, unknown> = {
      mode: 'single',
      providerType: cfg.type,
      baseUrl: cfg.type !== 'mock' ? cfg.baseUrl : undefined,
      currency: cfg.type !== 'mock' ? cfg.currency : undefined,
      productInput: feedInput.trim(),
    }
    if (cfg.type === 'jsonapi') {
      const j = cfg as JsonApiProviderConfig
      body.jsonFields = {
        listEndpoint: j.listEndpoint,
        idField: j.idField,
        nameField: j.nameField,
        priceField: j.priceField,
        imageField: j.imageField,
        categoryField: j.categoryField ?? '',
        sizesField: j.sizesField ?? '',
        colorField: j.colorField ?? '',
      }
    }

    try {
      const res = await fetch('/api/admin/sellers/test-extractor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      setFeedResult((await res.json()) as TestExtractorProductResult)
    } catch (e) {
      setFeedResult({ ok: false, error: e instanceof Error ? e.message : 'Request failed.' })
    }
    setFeedLoading(false)
  }

  // Maps the fetched StoreProduct into a preview shape ProductCard already
  // knows how to render — same normalization the seller page uses for its
  // own manual-test preview, so a pulled product looks identical here and
  // there.
  const feedPreview: SampleProduct | null =
    feedResult?.ok && feedResult.product
      ? {
          id: feedResult.product.id,
          name: feedResult.product.name,
          price: feedResult.product.price,
          currency: feedResult.product.currency,
          compareAtPrice: feedResult.product.compareAtPrice,
          image: feedResult.product.image,
          url: feedResult.product.url,
          category: feedResult.product.category,
          sizes: feedResult.product.sizes,
          colors: feedResult.product.colors,
          inStock: feedResult.product.inStock,
          stockCount: feedResult.product.stockCount ?? undefined,
          description: feedResult.product.description,
        }
      : null

  const applyFeedProduct = () => {
    const p = feedResult?.ok ? feedResult.product : undefined
    if (!p) return

    setTitle(p.name)
    if (p.description) setDescription(p.description)
    if (p.category) setCategory(p.category)
    if (p.sizes?.length) setSizesInput(p.sizes.join(', '))
    if (p.colors?.length) setColorsInput(p.colors.join(', '))
    if (p.image) setImages(p.images?.length ? p.images : [p.image])
    setSourceUrl(p.url)
    setSourceProductId(p.id)

    setCostPrice(p.price)
    setCurrency(p.currency)
    setPriceTouched(false)
    setSellingPriceOverride(null)

    if (p.variants?.length) {
      setVariants(
        p.variants.map((v) => ({
          id: v.id,
          title: v.title || v.options?.filter(Boolean).join(' / ') || v.id,
          costPrice: v.price,
          sellingPrice: computeSellingPrice(v.price, markupPercent),
          available: v.available,
        }))
      )
    }

    setFeedApplied(true)
  }

  const addImageUrl = () => {
    const url = imageUrlDraft.trim()
    if (!url) return
    setImages((prev) => [...prev, url])
    setImageUrlDraft('')
  }

  const removeImage = (idx: number) => setImages((prev) => prev.filter((_, i) => i !== idx))

  const addVariant = () =>
    setVariants((prev) => [
      ...prev,
      { id: `v_${Date.now()}`, title: '', costPrice, sellingPrice: computedSelling, available: true },
    ])

  const updateVariant = (id: string, patch: Partial<CatalogueVariant>) =>
    setVariants((prev) => prev.map((v) => (v.id === id ? { ...v, ...patch } : v)))

  const removeVariant = (id: string) => setVariants((prev) => prev.filter((v) => v.id !== id))

  const canSubmit = title.trim().length > 0 && sellerId.length > 0 && costPrice > 0

  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [saved, setSaved] = useState(false)

  const handleSubmit = () => {
    if (!canSubmit) return
    setSubmitting(true)
    // TODO(wire-up): POST /api/admin/catalogues (isNew) or
    // PATCH /api/admin/catalogues/[catalogueId] with:
    //   { sellerId, title, description, category, sizes, colors, images,
    //     sourceUrl, sourceProductId, costPrice, currency, markupPercent,
    //     sellingPrice, status, variants }
    window.setTimeout(() => {
      setSubmitting(false)
      if (isNew) {
        setSubmitted(true)
        window.setTimeout(() => router.push('/admin/catalogues'), 900)
      } else {
        setSaved(true)
        window.setTimeout(() => setSaved(false), 2000)
      }
    }, 500)
  }

  const handleHide = () => {
    setStatus('hidden')
    // TODO(wire-up): PATCH catalogue.status -> 'hidden'. No hard delete —
    // prevents orphaning any in-flight order tied to this listing.
  }

  if (!isNew && !entry) {
    return (
      <div className="min-h-screen bg-parchment font-body text-ink">
        <div className="mx-auto max-w-2xl px-6 pb-20 pt-8 text-center lg:px-10">
          <p className="mt-16 text-sm text-ink/50">
            No catalogue entry found for &ldquo;{params.catalogueId}&rdquo;. It may have been removed.
          </p>
          <button
            type="button"
            onClick={() => router.push('/admin/catalogues')}
            className="mt-4 text-sm font-semibold text-teal-deep hover:underline"
          >
            Back to catalogues
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-parchment font-body text-ink">
      <div className="mx-auto max-w-4xl px-6 pb-24 pt-10 lg:px-10">
        <button
          type="button"
          onClick={() => router.push('/admin/catalogues')}
          className="flex items-center gap-1.5 text-sm font-semibold text-ink/50 transition-colors hover:text-ink"
        >
          <ArrowLeft size={14} />
          Catalogues
        </button>

        <div className="mt-4">
          <h1 className="font-display text-3xl text-ink">{isNew ? 'Add catalogue entry' : title || 'Edit entry'}</h1>
          <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-ink/60">
            {isNew
              ? 'Attach this product to a seller, then fill in details, media, and pricing.'
              : `Listed under ${getSellerName(sellerId)}.`}
          </p>
        </div>

        {submitted ? (
          <div className={`mt-6 flex items-center gap-2 p-4 text-sm font-semibold text-teal-deep ${groupClass} border-teal-deep/25`}>
            <Check size={16} />
            Entry added (demo — not yet saved to a backend). Returning to the list...
          </div>
        ) : (
          <div className="mt-6 flex flex-col gap-6">
            {/* ---- Source (ADD mode only) ---- */}
            {isNew && (
              <section className={`flex flex-col gap-5 p-6 ${panelClass}`}>
                <SectionHeading title="Source" subtitle="Which seller this product belongs to, and how it gets added." />

                <Field label="Seller" required>
                  <select
                    value={sellerId}
                    onChange={(e) => {
                      setSellerId(e.target.value)
                      setFeedResult(null)
                      setFeedApplied(false)
                      setFeedInput('')
                    }}
                    className={inputClass}
                  >
                    {ADMIN_SELLERS.map((s) => (
                      <option key={s.platform} value={s.platform}>
                        {s.store.name}
                      </option>
                    ))}
                  </select>
                </Field>

                <div className="flex gap-2">
                  {(['manual', 'feed'] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setSourceMode(m)}
                      disabled={m === 'feed' && !sellerHasFeed}
                      className={`flex-1 rounded-xl border px-3.5 py-2.5 text-left transition-all disabled:cursor-not-allowed disabled:opacity-40 ${
                        sourceMode === m
                          ? 'border-teal-deep bg-teal-deep/[0.06] text-teal-deep'
                          : 'border-ink/12 bg-white text-ink/55 hover:border-ink/25 hover:text-ink'
                      }`}
                    >
                      <span className="block text-sm font-semibold">
                        {m === 'manual' ? 'Add manually' : 'Pull from feed'}
                      </span>
                      <span className="mt-0.5 block text-xs text-ink/45">
                        {m === 'manual'
                          ? 'Fill in details yourself.'
                          : sellerHasFeed
                          ? "Fetch a real product from this seller's live store."
                          : 'This seller has no live feed to pull from.'}
                      </span>
                    </button>
                  ))}
                </div>

                {sourceMode === 'feed' && sellerHasFeed && (
                  <div className="flex flex-col gap-4">
                    <div className={`p-3.5 border-dashed ${groupClass}`}>
                      <p className="text-xs text-ink/50">
                        Paste a product URL from {selectedSeller?.store.name}
                        {sellerFeedType === 'jsonapi' ? ', or just the raw product id' : ''} — this fetches the
                        real, current product from their live store (same lookup the seller onboarding page uses
                        to test one product).
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={feedInput}
                        onChange={(e) => setFeedInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !feedLoading && feedInput.trim()) runFeedPull()
                        }}
                        placeholder={
                          sellerFeedType === 'jsonapi'
                            ? 'e.g. 5f2c... or a full product URL'
                            : sellerFeedType === 'shopify'
                            ? 'e.g. https://store.com/products/blue-shirt'
                            : 'e.g. https://store.com/product/blue-shirt/'
                        }
                        className={`flex-1 ${monoInputClass}`}
                      />
                      <button
                        type="button"
                        onClick={runFeedPull}
                        disabled={feedLoading || !feedInput.trim()}
                        className="flex flex-none items-center gap-1.5 rounded-xl bg-indigo px-3.5 py-2 text-sm font-semibold text-white shadow-[0_10px_28px_-10px_rgba(37,41,120,0.5)] transition-all hover:bg-indigo-deep active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-ink/20 disabled:shadow-none"
                      >
                        {feedLoading ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
                        Fetch
                      </button>
                    </div>

                    {feedResult && !feedResult.ok && !feedLoading && (
                      <div className="rounded-lg border border-red-600/25 bg-red-600/5 px-3 py-2.5 text-sm">
                        <p className="font-semibold text-red-700">Couldn&rsquo;t fetch that product</p>
                        <p className="mt-1 text-xs text-red-700/70">{feedResult.error}</p>
                      </div>
                    )}

                    {feedPreview && (
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                        <div className="max-w-xs flex-1">
                          <ProductCard product={feedPreview} highlight />
                        </div>
                        <div className="flex flex-none flex-col gap-2 sm:pt-1">
                          {feedApplied ? (
                            <span className="flex items-center gap-1.5 text-xs font-semibold text-teal-deep">
                              <Check size={13} />
                              Applied to the form below
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={applyFeedProduct}
                              className="rounded-xl bg-teal-deep px-3.5 py-2 text-sm font-semibold text-parchment shadow-[0_10px_28px_-10px_rgba(11,114,128,0.55)] transition-all hover:bg-teal active:scale-[0.98]"
                            >
                              Use this product
                            </button>
                          )}
                          <p className="max-w-[16rem] text-xs text-ink/40">
                            Fills in title, description, category, sizes/colors, images, cost price, and
                            variants below — everything stays editable before you save.
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </section>
            )}

            {/* ---- Product details ---- */}
            <section className={`flex flex-col gap-5 p-6 ${panelClass}`}>
              <SectionHeading title="Product details" subtitle="What shows on the storefront listing." />

              <Field label="Title" required>
                <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Banarasi Silk Saree — Emerald" className={inputClass} />
              </Field>

              <Field label="Description">
                <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} placeholder="Fabric, craftsmanship, what's included..." className={inputClass} />
              </Field>

              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                <Field label="Category">
                  <input type="text" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="e.g. Sarees" className={inputClass} />
                </Field>
                {!isNew && (
                  <Field label="Status">
                    <select value={status} onChange={(e) => setStatus(e.target.value as CatalogueStatus)} className={inputClass}>
                      <option value="draft">{STATUS_LABEL.draft}</option>
                      <option value="active">{STATUS_LABEL.active}</option>
                      <option value="hidden">{STATUS_LABEL.hidden}</option>
                    </select>
                  </Field>
                )}
              </div>

              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                <Field label="Sizes (comma separated)">
                  <input type="text" value={sizesInput} onChange={(e) => setSizesInput(e.target.value)} placeholder="S, M, L, XL" className={monoInputClass} />
                </Field>
                <Field label="Colors (comma separated)">
                  <input type="text" value={colorsInput} onChange={(e) => setColorsInput(e.target.value)} placeholder="Emerald, Maroon" className={monoInputClass} />
                </Field>
              </div>

              {sourceUrl && (
                <p className="text-xs text-ink/35">
                  Sourced from <span className="font-mono text-ink/50">{sourceUrl}</span>
                  {sourceProductId && <> · id {sourceProductId}</>}
                </p>
              )}
            </section>

            {/* ---- Media ---- */}
            <section className={`flex flex-col gap-5 p-6 ${panelClass}`}>
              <SectionHeading title="Media" subtitle="Image URLs, in display order. First image is the thumbnail." />

              <div className="flex items-center gap-2">
                <input
                  type="url"
                  value={imageUrlDraft}
                  onChange={(e) => setImageUrlDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      addImageUrl()
                    }
                  }}
                  placeholder="https://..."
                  className={`flex-1 ${monoInputClass}`}
                />
                <button
                  type="button"
                  onClick={addImageUrl}
                  disabled={!imageUrlDraft.trim()}
                  className="flex flex-none items-center gap-1.5 rounded-xl bg-indigo px-3.5 py-2 text-sm font-semibold text-white shadow-[0_10px_28px_-10px_rgba(37,41,120,0.5)] transition-all hover:bg-indigo-deep active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-ink/20 disabled:shadow-none"
                >
                  <Plus size={14} />
                  Add
                </button>
              </div>

              {images.length === 0 ? (
                <div className={`flex flex-col items-center justify-center gap-2 p-8 text-center border-dashed ${groupClass}`}>
                  <ImagePlus size={22} className="text-ink/20" strokeWidth={1.5} />
                  <p className="text-xs text-ink/45">No images added yet.</p>
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
                  {images.map((url, i) => (
                    <div key={`${url}-${i}`} className="group relative aspect-square overflow-hidden rounded-lg border border-ink/10 bg-white">
                      {/* eslint-disable-next-line @next/next/no-img-element -- arbitrary source-store image URLs */}
                      <img src={url} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
                      {i === 0 && (
                        <span className="absolute left-1 top-1 rounded bg-ink/70 px-1.5 py-0.5 text-[9px] font-semibold text-white">
                          Thumb
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => removeImage(i)}
                        className="absolute -right-1 -top-1 grid h-5 w-5 place-items-center rounded-full border border-ink/10 bg-white text-ink/50 opacity-0 shadow-[0_1px_3px_rgba(32,36,43,0.15)] transition-opacity hover:bg-red-600/10 hover:text-red-600 group-hover:opacity-100"
                      >
                        <X size={11} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* ---- Pricing ---- */}
            <section className={`flex flex-col gap-5 p-6 ${panelClass}`}>
              <SectionHeading title="Pricing" subtitle="Cost from the seller, plus WishDrop's markup." />

              <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
                <Field label="Cost price" required>
                  <input
                    type="number"
                    value={costPrice || ''}
                    onChange={(e) => setCostPrice(Number(e.target.value) || 0)}
                    placeholder="0"
                    className={inputClass}
                  />
                </Field>
                <Field label="Currency">
                  <input type="text" value={currency} onChange={(e) => setCurrency(e.target.value)} placeholder="INR" className={monoInputClass} />
                </Field>
                <Field label="Markup %">
                  <input
                    type="number"
                    value={markupPercent || ''}
                    onChange={(e) => onMarkupChange(Number(e.target.value) || 0)}
                    placeholder="20"
                    className={inputClass}
                  />
                </Field>
              </div>

              <div className={`flex items-center justify-between p-4 ${groupClass}`}>
                <div>
                  <p className="text-xs font-semibold text-ink/50">Selling price</p>
                  <p className="mt-1 text-xs text-ink/40">
                    Auto-calculated from cost + markup — override below if this product needs a manual price.
                  </p>
                </div>
                <input
                  type="number"
                  value={sellingPrice || ''}
                  onChange={(e) => onSellingPriceChange(Number(e.target.value) || 0)}
                  className="w-32 rounded-lg border border-ink/15 bg-white px-3 py-2 text-right text-sm font-bold text-teal-deep outline-none focus:border-teal/60 focus:ring-2 focus:ring-teal/10"
                />
              </div>
            </section>

            {/* ---- Pending change from seller (EDIT mode only) ---- */}
            {!isNew && entry && pendingChange && (
              <PendingChangePanel
                entry={{ ...entry, costPrice, variants }}
                pendingChange={pendingChange}
                onApprove={handleApproveChange}
                onReject={handleRejectChange}
              />
            )}

            {/* ---- Variants ---- */}
            <section className={`flex flex-col gap-5 p-6 ${panelClass}`}>
              <div className="flex items-center justify-between">
                <SectionHeading title="Variants" subtitle="Optional — only needed if size/color affect price or stock independently." />
                <button
                  type="button"
                  onClick={addVariant}
                  className="flex flex-none items-center gap-1.5 rounded-lg border border-ink/15 px-2.5 py-1.5 text-xs font-semibold text-ink/60 hover:bg-ink/5 hover:text-ink"
                >
                  <Plus size={12} />
                  Add variant
                </button>
              </div>

              {variants.length === 0 ? (
                <p className={`p-3.5 text-xs text-ink/45 border-dashed ${groupClass}`}>
                  No variants — this product sells as a single SKU.
                </p>
              ) : (
                <div className="flex flex-col gap-2">
                  {variants.map((v) => (
                    <div key={v.id} className="grid grid-cols-1 items-center gap-2 rounded-lg border border-ink/10 bg-white p-3 sm:grid-cols-[1.4fr_1fr_1fr_auto_auto]">
                      <input
                        type="text"
                        value={v.title}
                        onChange={(e) => updateVariant(v.id, { title: e.target.value })}
                        placeholder="e.g. Emerald, Size M"
                        className={inputClass}
                      />
                      <input
                        type="number"
                        value={v.costPrice || ''}
                        onChange={(e) => updateVariant(v.id, { costPrice: Number(e.target.value) || 0 })}
                        placeholder="Cost"
                        className={inputClass}
                      />
                      <input
                        type="number"
                        value={v.sellingPrice || ''}
                        onChange={(e) => updateVariant(v.id, { sellingPrice: Number(e.target.value) || 0 })}
                        placeholder="Sell price"
                        className={inputClass}
                      />
                      <label className="flex items-center justify-center gap-1.5 text-xs font-semibold text-ink/55">
                        <input
                          type="checkbox"
                          checked={v.available}
                          onChange={(e) => updateVariant(v.id, { available: e.target.checked })}
                          className="h-3.5 w-3.5 rounded border-ink/30 text-teal-deep focus:ring-teal/40"
                        />
                        Available
                      </label>
                      <button
                        type="button"
                        onClick={() => removeVariant(v.id)}
                        className="justify-self-center rounded-lg p-1.5 text-ink/35 hover:bg-red-600/10 hover:text-red-600"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* ---- Actions ---- */}
            <div className="flex items-center justify-between">
              {!isNew ? (
                <button
                  type="button"
                  onClick={handleHide}
                  disabled={status === 'hidden'}
                  className="rounded-xl border border-red-600/25 px-3.5 py-2 text-sm font-semibold text-red-700 transition-all hover:bg-red-600/5 disabled:cursor-not-allowed disabled:border-ink/10 disabled:text-ink/30"
                >
                  Hide listing
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => router.push('/admin/catalogues')}
                  className="rounded-xl border border-ink/15 px-4 py-2 text-sm font-semibold text-ink hover:bg-ink/5"
                >
                  Cancel
                </button>
              )}

              <div className="flex items-center gap-3">
                {saved && (
                  <span className="flex items-center gap-1 text-xs font-semibold text-teal-deep">
                    <Check size={13} /> Saved
                  </span>
                )}
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={!canSubmit || submitting}
                  className="rounded-xl bg-teal-deep px-4 py-2.5 text-sm font-semibold text-parchment shadow-[0_10px_28px_-10px_rgba(11,114,128,0.55)] transition-all hover:bg-teal active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-ink/20 disabled:shadow-none disabled:active:scale-100"
                >
                  {submitting ? 'Saving...' : isNew ? 'Add entry' : 'Save changes'}
                </button>
              </div>
            </div>

            {!isNew && (
              <p className="text-center text-xs text-ink/35">
                Only Manager and Super Admin can delete a catalogue entry outright.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Pending seller change — review panel
// ---------------------------------------------------------------------------

function PendingChangePanel({
  entry,
  pendingChange,
  onApprove,
  onReject,
}: {
  entry: CatalogueEntry
  pendingChange: NonNullable<CatalogueEntry['pendingChange']>
  onApprove: () => void
  onReject: () => void
}) {
  const [rejecting, setRejecting] = useState(false)

  return (
    <section className={`flex flex-col gap-4 p-6 border-gold-deep/30 ${panelClass}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-1.5 text-sm font-semibold text-gold-deep">
            <Clock size={14} />
            Change proposed by{' '}
            {pendingChange.submittedByName ?? (pendingChange.submittedBy === 'seller' ? 'the seller' : 'an admin')}
          </p>
          <p className="mt-1 text-xs text-ink/45">
            Submitted {new Date(pendingChange.submittedAt).toLocaleString('en-GB')}
          </p>
        </div>
      </div>

      {pendingChange.note && (
        <p className={`p-3 text-xs italic text-ink/60 ${groupClass}`}>&ldquo;{pendingChange.note}&rdquo;</p>
      )}

      <div className="flex flex-col gap-2">
        {pendingChange.changes.costPrice != null && (
          <DiffRow
            label="Cost price"
            current={`${entry.currency} ${entry.costPrice.toLocaleString()}`}
            proposed={`${entry.currency} ${pendingChange.changes.costPrice.toLocaleString()}`}
          />
        )}
        {pendingChange.changes.inStock != null && (
          <DiffRow
            label="Availability"
            current={entry.inStock ? 'In stock' : 'Out of stock'}
            proposed={pendingChange.changes.inStock ? 'In stock' : 'Out of stock'}
          />
        )}
        {pendingChange.changes.variants?.map((v) => {
          const current = entry.variants?.find((cv) => cv.id === v.id)
          if (!current) return null
          return (
            <DiffRow
              key={v.id}
              label={current.title}
              current={`${entry.currency} ${current.costPrice.toLocaleString()} · ${current.available ? 'Available' : 'Unavailable'}`}
              proposed={`${entry.currency} ${v.costPrice.toLocaleString()} · ${v.available ? 'Available' : 'Unavailable'}`}
            />
          )
        })}
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-ink/10 pt-4">
        {rejecting ? (
          <>
            <span className="mr-auto text-xs text-ink/50">Reject this change?</span>
            <button
              type="button"
              onClick={() => setRejecting(false)}
              className="rounded-xl border border-ink/15 px-3.5 py-2 text-sm font-semibold text-ink hover:bg-ink/5"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onReject}
              className="rounded-xl bg-red-600 px-3.5 py-2 text-sm font-semibold text-white transition-all hover:bg-red-700 active:scale-[0.98]"
            >
              Confirm reject
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => setRejecting(true)}
              className="rounded-xl border border-red-600/25 px-3.5 py-2 text-sm font-semibold text-red-700 hover:bg-red-600/5"
            >
              Reject
            </button>
            <button
              type="button"
              onClick={onApprove}
              className="rounded-xl bg-teal-deep px-4 py-2 text-sm font-semibold text-parchment shadow-[0_10px_28px_-10px_rgba(11,114,128,0.55)] transition-all hover:bg-teal active:scale-[0.98]"
            >
              Approve &amp; apply
            </button>
          </>
        )}
      </div>
    </section>
  )
}

function DiffRow({ label, current, proposed }: { label: string; current: string; proposed: string }) {
  return (
    <div className={`flex flex-col gap-1 p-3 sm:flex-row sm:items-center sm:justify-between ${groupClass}`}>
      <span className="text-xs font-semibold text-ink/50">{label}</span>
      <span className="flex items-center gap-2 text-xs">
        <span className="text-ink/40 line-through">{current}</span>
        <span className="text-teal-deep">→</span>
        <span className="font-semibold text-teal-deep">{proposed}</span>
      </span>
    </div>
  )
}