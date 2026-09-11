// app/admin/discounts/[discountId]/page.tsx
'use client'

import { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, Check, Pencil, Plus, X } from 'lucide-react'

import {
  getDiscount,
  getDiscountStatus,
  getPickableSellers,
  getPickableCollections,
  getPickableProducts,
  STATUS_LABEL,
  TYPE_LABEL,
  METHOD_LABEL,
  type Discount,
  type DiscountMethod,
  type DiscountType,
  type DiscountScopeTarget,
  type PickableProductRef,
} from '@/data/discounts/data'
import {
  panelClass,
  groupClass,
  inputClass,
  monoInputClass,
  SectionHeading,
  Field,
  ReviewRow,
  SummaryRow,
  Stat,
  SegmentedControl,
  DiscountThumb,
  ScopePicker,
  DiscountValueField,
  STATUS_PILL,
} from '@/components/admin/discount/shared'

// ---------------------------------------------------------------------------
// discountId === 'new' -> ADD mode: three-step wizard (Details, Scope &
//                         Value, Review) — same shell as the Collections
//                         wizard, one extra step's worth of fields because
//                         a discount carries dates/usage caps that a
//                         collection doesn't.
// discountId === <id>  -> EDIT mode: a Details card with its own Edit
//                         affordance (Cancel reverts, no diff), plus a
//                         Scope & Value panel that's always live
//                         underneath — same "some things toggle into edit,
//                         some things are just always live" split as the
//                         Items panel on Collections and the Test & verify
//                         panel on Sellers.
//
// Wizard steps and the edit card/panel share the same underlying state and
// JSX blocks (detailsFields / scopeAndValuePanel) — only the shell differs
// by mode, mirroring [collectionId]/page.tsx exactly so this reads as the
// same product, not a bolted-on third admin section.
// ---------------------------------------------------------------------------

const WIZARD_STEPS = ['Details', 'Scope & Value', 'Review'] as const

const METHOD_OPTIONS: { value: DiscountMethod; label: string }[] = [
  { value: 'automatic', label: METHOD_LABEL.automatic },
  { value: 'code', label: METHOD_LABEL.code },
]

const ENABLED_OPTIONS: { value: 'enabled' | 'disabled'; label: string }[] = [
  { value: 'enabled', label: 'Enabled' },
  { value: 'disabled', label: 'Disabled' },
]

function toLocalInput(iso?: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function fromLocalInput(value: string): string | null {
  if (!value) return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

function numberOrUndefined(raw: string): number | undefined {
  return raw === '' ? undefined : Number(raw)
}

export default function DiscountFormPage() {
  const router = useRouter()
  const params = useParams<{ discountId: string }>()
  const isNew = params.discountId === 'new'
  const discount = isNew ? undefined : getDiscount(params.discountId)

  const sellers = getPickableSellers()
  const collections = getPickableCollections()
  const products = getPickableProducts()

  // ---- Details state ----
  const [form, setForm] = useState({
    name: discount?.name ?? '',
    description: discount?.description ?? '',
    method: discount?.method ?? ('automatic' as DiscountMethod),
    code: discount?.code ?? '',
    minPurchaseAmount: discount?.minPurchaseAmount ?? undefined,
    usageLimitTotal: discount?.usageLimitTotal ?? undefined,
    usageLimitPerCustomer: discount?.usageLimitPerCustomer ?? undefined,
    enabled: discount?.enabled ?? true,
    startsAt: discount?.startsAt ?? new Date().toISOString(),
    endsAt: discount?.endsAt ?? null,
  })
  const [detailsSaved, setDetailsSaved] = useState(false)

  const touchDetails = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }))
    setDetailsSaved(false)
  }

  const detailsValid =
    form.name.trim().length > 0 &&
    (form.method !== 'code' || form.code.trim().length > 0) &&
    form.startsAt.length > 0

  const handleSaveDetails = () => {
    // TODO(wire-up): PATCH /api/admin/discounts/[id]
    //   { name, description, method, code, minPurchaseAmount,
    //     usageLimitTotal, usageLimitPerCustomer, enabled, startsAt, endsAt }
    setDetailsSaved(true)
    setEditingDetails(false)
    window.setTimeout(() => setDetailsSaved(false), 2000)
  }

  // ---- Scope & Value state ----
  const [type, setType] = useState<DiscountType>(discount?.type ?? 'percentage')
  const [value, setValue] = useState<number | undefined>(discount?.value)
  const [giftProductId, setGiftProductId] = useState<string | undefined>(discount?.giftProductId)
  const [giftProductName, setGiftProductName] = useState<string | undefined>(discount?.giftProductName)
  const [scope, setScope] = useState<DiscountScopeTarget>(discount?.scope ?? { type: 'storewide' })
  const [scopeSaved, setScopeSaved] = useState(false)

  const onTypeChange = (next: DiscountType) => {
    setType(next)
    // Switching type clears whatever the previous type was carrying —
    // a percentage value shouldn't linger once ops switches to "Free
    // gift," same instinct as ScopePicker clearing on scope-type switch.
    setValue(undefined)
    setGiftProductId(undefined)
    setGiftProductName(undefined)
    setScopeSaved(false)
  }

  const onGiftProductChange = (product: PickableProductRef) => {
    setGiftProductId(product.id)
    setGiftProductName(product.name)
    setScopeSaved(false)
  }

  const onScopeChange = (next: DiscountScopeTarget) => {
    setScope(next)
    setScopeSaved(false)
  }

  const scopeValid =
    (type !== 'free_gift' ? value != null && value > 0 : giftProductId != null) &&
    (scope.type !== 'seller' || !!scope.sellerId) &&
    (scope.type !== 'collection' || !!scope.collectionId) &&
    (scope.type !== 'products' || (scope.productIds?.length ?? 0) > 0)

  const canSubmit = detailsValid && scopeValid

  const handleSaveScope = () => {
    // TODO(wire-up, edit mode only): PATCH /api/admin/discounts/[id]
    //   { type, value, giftProductId, scope } — saved separately from
    //   Details since ops adjusting the target/value shouldn't require
    //   re-touching name/dates/usage caps.
    setScopeSaved(true)
    window.setTimeout(() => setScopeSaved(false), 2000)
  }

  // ---- Delete (EDIT mode only) ----
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const handleDelete = () => {
    // TODO(wire-up): DELETE /api/admin/discounts/[id]
    router.push('/admin/discounts')
  }

  // ---- ADD mode: wizard ----
  const [step, setStep] = useState(0)
  const stepValid = [detailsValid, scopeValid, canSubmit]
  const goNext = () => setStep((s) => Math.min(WIZARD_STEPS.length - 1, s + 1))
  const goBack = () => setStep((s) => Math.max(0, s - 1))

  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  const handleSubmit = () => {
    if (!canSubmit) return
    setSubmitting(true)
    // TODO(wire-up): POST /api/admin/discounts
    //   { name, description, method, code, type, value, giftProductId,
    //     scope, minPurchaseAmount, usageLimitTotal, usageLimitPerCustomer,
    //     enabled, startsAt, endsAt }
    // On success, router.push(`/admin/discounts/${newId}`).
    window.setTimeout(() => {
      setSubmitting(false)
      setSubmitted(true)
      window.setTimeout(() => router.push('/admin/discounts'), 900)
    }, 500)
  }

  // ---- EDIT mode: card edit toggle ----
  const [editingDetails, setEditingDetails] = useState(false)

  // Live status pill for the EDIT header — recomputed from current form
  // state (not the original record) so toggling Enabled or nudging a date
  // updates the pill immediately, the same way it would once this is
  // wired to a real backend that derives status at read time.
  const liveStatus =
    !isNew && discount
      ? getDiscountStatus({
          ...discount,
          enabled: form.enabled,
          startsAt: form.startsAt,
          endsAt: form.endsAt,
          usageLimitTotal: form.usageLimitTotal ?? null,
        })
      : undefined

  // ---- Not found (EDIT mode, bad id) ----
  if (!isNew && !discount) {
    return (
      <div className="min-h-screen bg-parchment font-body text-ink">
        <div className="mx-auto max-w-2xl px-6 pb-20 pt-8 text-center lg:px-10">
          <p className="mt-16 text-sm text-ink/50">
            No discount found for &ldquo;{params.discountId}&rdquo;. It may have been removed.
          </p>
          <button
            type="button"
            onClick={() => router.push('/admin/discounts')}
            className="mt-4 text-sm font-semibold text-teal-deep hover:underline"
          >
            Back to discounts
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
      <Field label="Name" required hint="Internal, ops-facing — not shown to customers.">
        <input
          type="text"
          value={form.name}
          onChange={(e) => touchDetails('name', e.target.value)}
          placeholder="e.g. Diwali storewide 15%"
          className={inputClass}
        />
      </Field>

      <Field label="Description">
        <textarea
          value={form.description}
          onChange={(e) => touchDetails('description', e.target.value)}
          rows={2}
          placeholder="A short note on what this discount is for"
          className={inputClass}
        />
      </Field>

      <Field label="Method">
        <SegmentedControl value={form.method} options={METHOD_OPTIONS} onChange={(v) => touchDetails('method', v)} />
      </Field>

      {form.method === 'code' && (
        <Field label="Coupon code" required hint="Customers enter this at checkout.">
          <input
            type="text"
            value={form.code}
            onChange={(e) => touchDetails('code', e.target.value.toUpperCase())}
            placeholder="WELCOME10"
            className={monoInputClass}
          />
        </Field>
      )}

      <Field label="Minimum purchase" hint="Leave blank for no minimum.">
        <div className="relative">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-ink/40">Rs.</span>
          <input
            type="number"
            min={0}
            value={form.minPurchaseAmount ?? ''}
            onChange={(e) => touchDetails('minPurchaseAmount', numberOrUndefined(e.target.value))}
            placeholder="5000"
            className={`${inputClass} pl-9`}
          />
        </div>
      </Field>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Total use limit" hint="Blank = unlimited">
          <input
            type="number"
            min={0}
            value={form.usageLimitTotal ?? ''}
            onChange={(e) => touchDetails('usageLimitTotal', numberOrUndefined(e.target.value))}
            placeholder="1000"
            className={inputClass}
          />
        </Field>
        <Field label="Per-customer limit" hint="Blank = unlimited">
          <input
            type="number"
            min={0}
            value={form.usageLimitPerCustomer ?? ''}
            onChange={(e) => touchDetails('usageLimitPerCustomer', numberOrUndefined(e.target.value))}
            placeholder="1"
            className={inputClass}
          />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Starts" required>
          <input
            type="datetime-local"
            value={toLocalInput(form.startsAt)}
            onChange={(e) => touchDetails('startsAt', fromLocalInput(e.target.value) ?? form.startsAt)}
            className={inputClass}
          />
        </Field>
        <Field label="Ends" hint="Blank = no end date">
          <input
            type="datetime-local"
            value={toLocalInput(form.endsAt)}
            onChange={(e) => touchDetails('endsAt', fromLocalInput(e.target.value))}
            className={inputClass}
          />
        </Field>
      </div>

      <Field label="Status">
        <SegmentedControl
          value={form.enabled ? 'enabled' : 'disabled'}
          options={ENABLED_OPTIONS}
          onChange={(v) => touchDetails('enabled', v === 'enabled')}
        />
        <p className="mt-1 text-xs text-ink/40">
          The badge shown to ops (Active, Scheduled, Expired...) is worked out from this switch plus
          the dates and usage caps above.
        </p>
      </Field>
    </div>
  )

  const scopeAndValuePanel = (
    <div className="flex flex-col gap-6">
      <div>
        <p className="mb-2 text-xs font-semibold text-ink/50">Value</p>
        <DiscountValueField
          type={type}
          onTypeChange={onTypeChange}
          value={value}
          onValueChange={(v) => {
            setValue(v)
            setScopeSaved(false)
          }}
          giftProductId={giftProductId}
          onGiftProductChange={onGiftProductChange}
          products={products}
        />
      </div>

      <div>
        <p className="mb-2 text-xs font-semibold text-ink/50">Applies to</p>
        <ScopePicker scope={scope} onChange={onScopeChange} sellers={sellers} collections={collections} products={products} />
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-parchment font-body text-ink">
      <div className="mx-auto max-w-[1560px] px-6 pb-24 pt-10 lg:px-10">
        <button
          type="button"
          onClick={() => router.push('/admin/discounts')}
          className="flex items-center gap-1.5 text-sm font-semibold text-ink/50 transition-colors hover:text-ink"
        >
          <ArrowLeft size={14} />
          Discounts
        </button>

        {/* ---------------- Header ---------------- */}
        {isNew ? (
          <>
            <div className="mt-4 flex items-start gap-4">
              <div className="grid h-14 w-14 flex-none place-items-center rounded-2xl border border-ink/10 bg-card text-teal-deep shadow-[0_1px_2px_rgba(32,36,43,0.04),0_16px_40px_-24px_rgba(14,140,156,0.4)]">
                <Plus size={22} strokeWidth={1.75} />
              </div>
              <div>
                <h1 className="font-display text-3xl text-ink">Add a discount</h1>
                <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-ink/60">
                  Name it, set how customers trigger it, then decide the value and what it applies to.
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
              <DiscountThumb type={type} name={discount!.name} size={48} />
              <div>
                <div className="flex flex-wrap items-center gap-2.5">
                  <h1 className="font-display text-3xl leading-tight text-ink">{discount!.name}</h1>
                  {liveStatus && (
                    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_PILL[liveStatus]}`}>
                      {STATUS_LABEL[liveStatus]}
                    </span>
                  )}
                </div>
                <p className="mt-1 text-sm text-ink/50">
                  {TYPE_LABEL[type]} · {form.method === 'code' ? form.code || 'No code set' : 'Automatic'}
                </p>
              </div>
            </div>

            <div className="grid flex-none grid-cols-2 gap-3 sm:min-w-[220px]">
              <Stat label="Redeemed" value={discount!.usageCount} />
              <Stat
                label="Updated"
                value={new Date(discount!.updatedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
              />
            </div>
          </div>
        )}

        {submitted ? (
          <div className={`mt-6 flex items-center gap-2 p-4 text-sm font-semibold text-teal-deep ${groupClass} border-teal-deep/25`}>
            <Check size={16} />
            Discount added (demo — not yet saved to a backend). Returning to the list...
          </div>
        ) : isNew ? (
          // ------------------------------------------------------------ WIZARD
          <div className="mt-6 flex flex-col gap-6">
            <section className={`p-6 ${panelClass}`}>
              {step === 0 && (
                <>
                  <SectionHeading title="Details" subtitle="Name, trigger method, dates, and usage limits." />
                  <div className="mt-5">{detailsFields}</div>
                </>
              )}
              {step === 1 && (
                <>
                  <SectionHeading title="Scope & value" subtitle="What the discount is worth, and what it applies to." />
                  <div className="mt-5">{scopeAndValuePanel}</div>
                </>
              )}
              {step === 2 && (
                <>
                  <SectionHeading title="Review" subtitle="Check everything over before adding this discount." />
                  <div className="mt-5 flex flex-col gap-4">
                    <ReviewRow label="Details" onEdit={() => setStep(0)}>
                      <p className="text-sm font-semibold text-ink">{form.name || '\u2014'}</p>
                      <p className="text-xs text-ink/50">
                        {METHOD_LABEL[form.method]}
                        {form.method === 'code' && form.code ? ` · ${form.code}` : ''}
                      </p>
                      <p className="mt-1 text-xs text-ink/40">
                        {form.enabled ? 'Enabled' : 'Disabled'} · from{' '}
                        {new Date(form.startsAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                        {form.endsAt
                          ? ` to ${new Date(form.endsAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`
                          : ', no end date'}
                      </p>
                    </ReviewRow>

                    <ReviewRow label="Scope & value" onEdit={() => setStep(1)}>
                      <p className="text-sm font-semibold text-ink">
                        {type === 'percentage' && `${value ?? 0}% off`}
                        {type === 'fixed' && `Rs. ${(value ?? 0).toLocaleString('en-LK')} off`}
                        {type === 'free_gift' && `Free gift: ${giftProductName ?? 'Not selected'}`}
                      </p>
                      <p className="text-xs text-ink/50">
                        {scope.type === 'storewide' && 'Storewide'}
                        {scope.type === 'seller' && `Seller: ${scope.sellerName ?? 'Not selected'}`}
                        {scope.type === 'collection' && `Collection: ${scope.collectionName ?? 'Not selected'}`}
                        {scope.type === 'products' && `${scope.productIds?.length ?? 0} product(s) selected`}
                      </p>
                    </ReviewRow>
                  </div>
                </>
              )}
            </section>

            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={step === 0 ? () => router.push('/admin/discounts') : goBack}
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
                  {submitting ? 'Adding...' : 'Add discount'}
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
                <SectionHeading title="Details" subtitle="Name, trigger method, dates, and usage limits." />
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
                    <SummaryRow term="Description" value={form.description || '\u2014'} multiline />
                    <SummaryRow term="Method" value={form.method === 'code' ? `${METHOD_LABEL.code} · ${form.code || '\u2014'}` : METHOD_LABEL.automatic} />
                    <SummaryRow
                      term="Minimum purchase"
                      value={form.minPurchaseAmount ? `Rs. ${form.minPurchaseAmount.toLocaleString('en-LK')}` : 'None'}
                    />
                    <SummaryRow
                      term="Usage limits"
                      value={`${form.usageLimitTotal ? `${form.usageLimitTotal} total` : 'Unlimited total'} · ${
                        form.usageLimitPerCustomer ? `${form.usageLimitPerCustomer} per customer` : 'unlimited per customer'
                      }`}
                    />
                    <SummaryRow
                      term="Dates"
                      value={`${new Date(form.startsAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })} — ${
                        form.endsAt
                          ? new Date(form.endsAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
                          : 'no end date'
                      }`}
                    />
                    <SummaryRow term="Status" value={form.enabled ? 'Enabled' : 'Disabled'} />
                  </dl>
                  <div className="flex items-center justify-between gap-2 border-t border-ink/10 pt-5">
                    {confirmingDelete ? (
                      <div className="flex items-center gap-2 text-sm">
                        <span className="text-ink/55">Delete this discount?</span>
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
                        Delete discount
                      </button>
                    )}
                  </div>
                </>
              )}
            </section>

            {/* ---- Scope & value (always live) ---- */}
            <section className={`flex flex-col gap-5 p-6 ${panelClass}`}>
              <div className="flex items-start justify-between gap-3">
                <SectionHeading title="Scope & value" subtitle="What the discount is worth, and what it applies to. Changes here save immediately." />
                {scopeSaved && (
                  <span className="flex flex-none items-center gap-1 text-xs font-semibold text-teal-deep">
                    <Check size={13} /> Saved
                  </span>
                )}
              </div>
              {scopeAndValuePanel}
              <div className="flex justify-end border-t border-ink/10 pt-5">
                <button
                  type="button"
                  onClick={handleSaveScope}
                  disabled={!scopeValid}
                  className="rounded-xl bg-teal-deep px-4 py-2 text-sm font-semibold text-parchment shadow-[0_10px_28px_-10px_rgba(11,114,128,0.55)] transition-all hover:bg-teal active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-ink/20 disabled:shadow-none"
                >
                  Save changes
                </button>
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  )
}