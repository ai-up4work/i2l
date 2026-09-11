// app/admin/collections/[collectionId]/page.tsx
'use client'

import { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, Check, GripVertical, Pencil, Plus, Trash2, X } from 'lucide-react'
import Image from 'next/image'

import { getCollection, STATUS_LABEL, STATUS_STYLE, getPickableProducts, type Collection, type CollectionItem, type CollectionStatus, type PickableProduct } from '@/data/collections/data'
import {
  panelClass,
  groupClass,
  inputClass,
  SectionHeading,
  Field,
  ReviewRow,
  SummaryRow,
  Stat,
  ProductPicker,
  CollectionThumb,
} from '@/components/admin/collections/shared'

// ---------------------------------------------------------------------------
// collectionId === <id>  -> EDIT mode: a Details card that loads read-only
//                           with its own "Edit" affordance swapping it into
//                           a form (Cancel reverts with no diff), plus an
//                           Items panel that's always live underneath —
//                           adding/removing/reordering items never needs an
//                           edit toggle, the same way the sellers page's
//                           Test & verify panel is always live regardless
//                           of whether Profile/Method are mid-edit.
//
// The wizard and the edit card/panel share the exact same underlying state
// and JSX blocks — only the shell around them differs by mode. This
// mirrors /admin/sellers/[sellerId]/page.tsx exactly, so the two admin
// sections read as the same product rather than two different ones bolted
// together.
// ---------------------------------------------------------------------------

const WIZARD_STEPS = ['Details', 'Items', 'Review'] as const

function slugify(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
}

export default function CollectionFormPage() {
  const router = useRouter()
  const params = useParams<{ collectionId: string }>()
  const isNew = params.collectionId === 'new'
  const collection = isNew ? undefined : getCollection(params.collectionId)

  // ---- Details state ----
  const [form, setForm] = useState({
    name: collection?.name ?? '',
    slug: collection?.slug ?? '',
    slugTouched: !isNew,
    description: collection?.description ?? '',
    status: collection?.status ?? ('draft' as CollectionStatus),
  })
  const [detailsSaved, setDetailsSaved] = useState(false)

  const onNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const name = e.target.value
    setForm((prev) => ({ ...prev, name, slug: prev.slugTouched ? prev.slug : slugify(name) }))
    setDetailsSaved(false)
  }

  const onSlugChange = (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((prev) => ({ ...prev, slug: slugify(e.target.value), slugTouched: true }))

  const set =
    (key: 'description') =>
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setForm((prev) => ({ ...prev, [key]: e.target.value }))
      setDetailsSaved(false)
    }

  const onStatusChange = (status: CollectionStatus) => {
    setForm((prev) => ({ ...prev, status }))
    setDetailsSaved(false)
  }

  const detailsValid = form.name.trim().length > 0 && form.slug.trim().length > 0
  const canSubmit = detailsValid

  const handleSaveDetails = () => {
    // TODO(wire-up): PATCH /api/admin/collections/[id]
    //   { name, slug, description, status }
    setDetailsSaved(true)
    setEditingDetails(false)
    window.setTimeout(() => setDetailsSaved(false), 2000)
  }

  // ---- Items state ----
  const [items, setItems] = useState<CollectionItem[]>(collection?.items ?? [])
  const [pickerOpen, setPickerOpen] = useState(false)
  const pickableProducts = getPickableProducts()
  const addedIds = new Set(items.map((i) => i.productId))

  // NOTE: in EDIT mode the panel copy says "changes save immediately," but
  // right now these three handlers only touch local state — there's no
  // backend yet to actually persist to. Once wired, each of these becomes
  // an optimistic update + a real request; TODOs mark where.
  const handleAddProduct = (product: PickableProduct) => {
    // TODO(wire-up, edit mode only): POST /api/admin/collections/[id]/items
    //   { productId: product.id }
    setItems((prev) => [
      ...prev,
      {
        id: `ci_new_${product.id}`,
        productId: product.id,
        productName: product.name,
        sellerName: product.sellerName,
        image: product.image,
        price: product.price,
        position: prev.length,
      },
    ])
  }

  const handleRemoveItem = (itemId: string) => {
    // TODO(wire-up, edit mode only): DELETE /api/admin/collections/[id]/items/[itemId]
    setItems((prev) => prev.filter((i) => i.id !== itemId).map((i, idx) => ({ ...i, position: idx })))
  }

  const moveItem = (index: number, direction: -1 | 1) => {
    // TODO(wire-up, edit mode only): PATCH /api/admin/collections/[id]/items/reorder
    //   { orderedItemIds: [...] } — debounce this one rather than firing
    //   per click, since a fast reorder session shouldn't be one request
    //   per arrow press.
    setItems((prev) => {
      const next = [...prev]
      const target = index + direction
      if (target < 0 || target >= next.length) return prev
      ;[next[index], next[target]] = [next[target], next[index]]
      return next.map((i, idx) => ({ ...i, position: idx }))
    })
  }

  // ---- Delete (EDIT mode only) ----
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const handleDelete = () => {
    // TODO(wire-up): DELETE /api/admin/collections/[id]
    router.push('/admin/collections')
  }

  // ---- ADD mode: wizard ----
  const [step, setStep] = useState(0)
  const stepValid = [detailsValid, true, canSubmit]
  const goNext = () => setStep((s) => Math.min(WIZARD_STEPS.length - 1, s + 1))
  const goBack = () => setStep((s) => Math.max(0, s - 1))

  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  const handleSubmit = () => {
    if (!canSubmit) return
    setSubmitting(true)
    // TODO(wire-up): POST /api/admin/collections
    //   { name, slug, description, status, items }
    // On success, router.push(`/admin/collections/${newId}`).
    window.setTimeout(() => {
      setSubmitting(false)
      setSubmitted(true)
      window.setTimeout(() => router.push('/admin/collections'), 900)
    }, 500)
  }

  // ---- EDIT mode: card edit toggle ----
  const [editingDetails, setEditingDetails] = useState(false)

  // ---- Not found (EDIT mode, bad id) ----
  if (!isNew && !collection) {
    return (
      <div className="min-h-screen bg-parchment font-body text-ink">
        <div className="mx-auto max-w-2xl px-6 pb-20 pt-8 text-center lg:px-10">
          <p className="mt-16 text-sm text-ink/50">
            No collection found for &ldquo;{params.collectionId}&rdquo;. It may have been removed.
          </p>
          <button
            type="button"
            onClick={() => router.push('/admin/collections')}
            className="mt-4 text-sm font-semibold text-teal-deep hover:underline"
          >
            Back to collections
          </button>
        </div>
      </div>
    )
  }

  // -------------------------------------------------------------------
  // Shared blocks reused by both the wizard steps (ADD) and the edit
  // card/panel (EDIT).
  // -------------------------------------------------------------------

  const detailsFields = (
    <div className="flex flex-col gap-5">
      <Field label="Name" required>
        <input type="text" value={form.name} onChange={onNameChange} placeholder="e.g. Diwali Picks" className={inputClass} />
      </Field>

      <Field label="Slug" required>
        <input type="text" value={form.slug} onChange={onSlugChange} placeholder="diwali-picks" className={`${inputClass} font-mono`} />
        <p className="mt-1 text-xs text-ink/40">Used in the storefront URL for this collection.</p>
      </Field>

      <Field label="Description">
        <textarea
          value={form.description}
          onChange={set('description')}
          rows={3}
          placeholder="A short line about what ties this collection together"
          className={inputClass}
        />
      </Field>

      <Field label="Status">
        <div className="flex gap-1 rounded-xl border border-ink/10 bg-parchment/60 p-1">
          {(['draft', 'published'] as CollectionStatus[]).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => onStatusChange(value)}
              className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                form.status === value ? 'bg-teal-deep text-parchment' : 'text-ink/55 hover:text-ink'
              }`}
            >
              {STATUS_LABEL[value]}
            </button>
          ))}
        </div>
      </Field>
    </div>
  )

  const itemsPanel = (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-ink/50">{items.length} in this collection</p>
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          className="flex items-center gap-1.5 rounded-lg border border-ink/15 px-2.5 py-1.5 text-xs font-semibold text-ink/60 hover:bg-ink/5 hover:text-ink"
        >
          <Plus size={12} />
          Add products
        </button>
      </div>

      {items.length === 0 ? (
        <div className={`flex flex-col items-center justify-center gap-2 p-10 text-center border-dashed ${groupClass}`}>
          <p className="max-w-xs text-xs leading-relaxed text-ink/45">No products added yet.</p>
        </div>
      ) : (
        <ul className="flex flex-col divide-y divide-ink/[0.06]">
          {items.map((item, index) => (
            <li key={item.id} className="flex items-center gap-3 py-3">
              <span className="flex-none text-ink/25">
                <GripVertical size={16} />
              </span>
              <span className="relative block h-11 w-11 flex-none overflow-hidden rounded-lg bg-parchment">
                <Image src={item.image} alt="" fill className="object-cover" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-ink">{item.productName}</span>
                <span className="block truncate text-xs text-ink/45">{item.sellerName}</span>
              </span>
              <span className="flex-none text-sm text-ink/50">Rs. {item.price.toLocaleString()}</span>
              <div className="flex flex-none items-center gap-1">
                <button
                  type="button"
                  disabled={index === 0}
                  onClick={() => moveItem(index, -1)}
                  aria-label="Move up"
                  className="grid h-7 w-7 place-items-center rounded-full text-ink/40 transition-colors hover:bg-ink/[0.06] hover:text-ink disabled:opacity-25 disabled:hover:bg-transparent"
                >
                  ↑
                </button>
                <button
                  type="button"
                  disabled={index === items.length - 1}
                  onClick={() => moveItem(index, 1)}
                  aria-label="Move down"
                  className="grid h-7 w-7 place-items-center rounded-full text-ink/40 transition-colors hover:bg-ink/[0.06] hover:text-ink disabled:opacity-25 disabled:hover:bg-transparent"
                >
                  ↓
                </button>
                <button
                  type="button"
                  onClick={() => handleRemoveItem(item.id)}
                  aria-label="Remove"
                  className="grid h-7 w-7 place-items-center rounded-full text-ink/40 transition-colors hover:bg-red-600/10 hover:text-red-600"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {pickerOpen && (
        <ProductPicker products={pickableProducts} alreadyAddedIds={addedIds} onAdd={handleAddProduct} onClose={() => setPickerOpen(false)} />
      )}
    </div>
  )

  return (
    <div className="min-h-screen bg-parchment font-body text-ink">
      <div className="mx-auto max-w-[1560px] px-6 pb-24 pt-10 lg:px-10">
        <button
          type="button"
          onClick={() => router.push('/admin/collections')}
          className="flex items-center gap-1.5 text-sm font-semibold text-ink/50 transition-colors hover:text-ink"
        >
          <ArrowLeft size={14} />
          Collections
        </button>

        {/* ---------------- Header ---------------- */}
        {isNew ? (
          <>
            <div className="mt-4 flex items-start gap-4">
              <div className="grid h-14 w-14 flex-none place-items-center rounded-2xl border border-ink/10 bg-card text-teal-deep shadow-[0_1px_2px_rgba(32,36,43,0.04),0_16px_40px_-24px_rgba(14,140,156,0.4)]">
                <Plus size={22} strokeWidth={1.75} />
              </div>
              <div>
                <h1 className="font-display text-3xl text-ink">Add a collection</h1>
                <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-ink/60">
                  Name it, decide who sees it, and pick the products that belong on this shelf.
                </p>
              </div>
            </div>

            {!submitted && (
              <div className="mt-7 flex items-center gap-2">
                {WIZARD_STEPS.map((label, i) => (
                  <div key={label} className="flex flex-1 items-center gap-2">
                    <button
                      type="button"
                      onClick={() => i < step && setStep(i)}
                      disabled={i > step}
                      className={`flex items-center gap-2 text-left text-xs font-semibold transition-colors ${
                        i === step ? 'text-ink' : i < step ? 'text-teal-deep' : 'text-ink/30'
                      }`}
                    >
                      <span
                        className={`grid h-6 w-6 flex-none place-items-center rounded-full border text-[11px] ${
                          i === step
                            ? 'border-indigo bg-indigo text-white'
                            : i < step
                            ? 'border-teal-deep/40 bg-teal-deep/10 text-teal-deep'
                            : 'border-ink/15 text-ink/30'
                        }`}
                      >
                        {i < step ? <Check size={12} /> : i + 1}
                      </span>
                      <span className="hidden sm:inline">{label}</span>
                    </button>
                    {i < WIZARD_STEPS.length - 1 && <span className={`h-px flex-1 ${i < step ? 'bg-teal-deep/40' : 'bg-ink/10'}`} />}
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <div className={`mt-4 flex flex-col gap-6 p-6 sm:flex-row sm:items-center sm:justify-between ${panelClass}`}>
            <div className="flex items-center gap-4">
              <CollectionThumb name={collection!.name} image={items[0]?.image} size={48} />
              <div>
                <div className="flex flex-wrap items-center gap-2.5">
                  <h1 className="font-display text-3xl leading-tight text-ink">{collection!.name}</h1>
                  <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_STYLE[form.status]}`}>
                    {STATUS_LABEL[form.status]}
                  </span>
                </div>
                <p className="mt-1 text-sm text-ink/50">/{form.slug}</p>
              </div>
            </div>

            <div className="grid flex-none grid-cols-2 gap-3 sm:min-w-[220px]">
              <Stat label="Items" value={items.length} />
              <Stat
                label="Updated"
                value={new Date(collection!.updatedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
              />
            </div>
          </div>
        )}

        {submitted ? (
          <div className={`mt-6 flex items-center gap-2 p-4 text-sm font-semibold text-teal-deep ${groupClass} border-teal-deep/25`}>
            <Check size={16} />
            Collection added (demo — not yet saved to a backend). Returning to the list...
          </div>
        ) : isNew ? (
          // ------------------------------------------------------------ WIZARD
          <div className="mt-6 flex flex-col gap-6">
            <section className={`p-6 ${panelClass}`}>
              {step === 0 && (
                <>
                  <SectionHeading title="Details" subtitle="Name, slug, and visibility for this collection." />
                  <div className="mt-5">{detailsFields}</div>
                </>
              )}
              {step === 1 && (
                <>
                  <SectionHeading title="Items" subtitle="Pick the products that belong on this shelf." />
                  <div className="mt-5">{itemsPanel}</div>
                </>
              )}
              {step === 2 && (
                <>
                  <SectionHeading title="Review" subtitle="Check everything over before adding this collection." />
                  <div className="mt-5 flex flex-col gap-4">
                    <ReviewRow label="Details" onEdit={() => setStep(0)}>
                      <p className="text-sm font-semibold text-ink">{form.name || '\u2014'}</p>
                      <p className="text-xs text-ink/50">/{form.slug || '\u2014'}</p>
                      <p className="mt-1 text-xs text-ink/40">{STATUS_LABEL[form.status]}</p>
                    </ReviewRow>

                    <ReviewRow label="Items" onEdit={() => setStep(1)}>
                      <p className="text-sm font-semibold text-ink">{items.length} product{items.length === 1 ? '' : 's'}</p>
                    </ReviewRow>
                  </div>
                </>
              )}
            </section>

            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={step === 0 ? () => router.push('/admin/collections') : goBack}
                className="rounded-xl border border-ink/15 px-4 py-2 text-sm font-semibold text-ink hover:bg-ink/5"
              >
                {step === 0 ? 'Cancel' : 'Back'}
              </button>

              {step < WIZARD_STEPS.length - 1 ? (
                <button
                  type="button"
                  onClick={goNext}
                  disabled={!stepValid[step]}
                  className="rounded-xl bg-teal-deep px-4 py-2.5 text-sm font-semibold text-parchment shadow-[0_10px_28px_-10px_rgba(11,114,128,0.55)] transition-all hover:bg-teal active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-ink/20 disabled:shadow-none disabled:active:scale-100"
                >
                  Continue
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={!canSubmit || submitting}
                  className="rounded-xl bg-teal-deep px-4 py-2.5 text-sm font-semibold text-parchment shadow-[0_10px_28px_-10px_rgba(11,114,128,0.55)] transition-all hover:bg-teal active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-ink/20 disabled:shadow-none disabled:active:scale-100"
                >
                  {submitting ? 'Adding...' : 'Add collection'}
                </button>
              )}
            </div>
          </div>
        ) : (
          // ------------------------------------------------------------ EDIT MODE
          <div className="mt-6 flex flex-col gap-6">
            {/* ---- Details card ---- */}
            <section className={`flex flex-col gap-5 p-6 ${panelClass}`}>
              <div className="flex items-start justify-between gap-3">
                <SectionHeading title="Details" subtitle="Name, slug, description, and visibility." />
                {!editingDetails && (
                  <button
                    type="button"
                    onClick={() => setEditingDetails(true)}
                    className="flex flex-none items-center gap-1.5 rounded-lg border border-ink/15 px-2.5 py-1.5 text-xs font-semibold text-ink/60 hover:bg-ink/5 hover:text-ink"
                  >
                    <Pencil size={12} />
                    Edit
                  </button>
                )}
              </div>

              {editingDetails ? (
                <>
                  {detailsFields}
                  <div className="flex items-center justify-end gap-2 border-t border-ink/10 pt-5">
                    {detailsSaved && (
                      <span className="mr-auto flex items-center gap-1 text-xs font-semibold text-teal-deep">
                        <Check size={13} /> Saved
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => setEditingDetails(false)}
                      className="flex items-center gap-1.5 rounded-xl border border-ink/15 px-3.5 py-2 text-sm font-semibold text-ink hover:bg-ink/5"
                    >
                      <X size={13} />
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveDetails}
                      disabled={!detailsValid}
                      className="rounded-xl bg-teal-deep px-4 py-2 text-sm font-semibold text-parchment shadow-[0_10px_28px_-10px_rgba(11,114,128,0.55)] transition-all hover:bg-teal active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-ink/20 disabled:shadow-none"
                    >
                      Save changes
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <dl className="flex flex-col gap-3.5 text-sm">
                    <SummaryRow term="Name" value={form.name} />
                    <SummaryRow term="Slug" value={`/${form.slug}`} mono />
                    <SummaryRow term="Description" value={form.description || '\u2014'} multiline />
                    <SummaryRow term="Status" value={STATUS_LABEL[form.status]} />
                  </dl>
                  <div className="flex items-center justify-between gap-2 border-t border-ink/10 pt-5">
                    {confirmingDelete ? (
                      <div className="flex items-center gap-2 text-sm">
                        <span className="text-ink/55">Delete this collection?</span>
                        <button type="button" onClick={handleDelete} className="font-semibold text-red-600 hover:underline">
                          Confirm
                        </button>
                        <button type="button" onClick={() => setConfirmingDelete(false)} className="text-ink/50 hover:underline">
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmingDelete(true)}
                        className="rounded-xl border border-red-600/25 px-3.5 py-2 text-sm font-semibold text-red-700 transition-all hover:bg-red-600/5"
                      >
                        Delete collection
                      </button>
                    )}
                  </div>
                </>
              )}
            </section>

            {/* ---- Items (always live) ---- */}
            <section className={`flex flex-col gap-5 p-6 ${panelClass}`}>
              <SectionHeading title="Items" subtitle="Add, remove, and reorder the products on this shelf. Changes here save immediately." />
              {itemsPanel}
            </section>
          </div>
        )}
      </div>
    </div>
  )
}