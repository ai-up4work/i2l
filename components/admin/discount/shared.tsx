// components/admin/discount/shared.tsx
'use client'

import { useState } from 'react'
import { Plus, Search, X, Check, Percent, Banknote, Gift } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import type {
  DiscountStatus,
  DiscountType,
  DiscountScopeType,
  DiscountScopeTarget,
  PickableSeller,
  PickableCollection,
  PickableProductRef,
} from '@/data/discounts/data'

// ---------------------------------------------------------------------------
// Same two-tier chrome as components/admin/collection/shared.tsx (which
// itself mirrors components/admin/seller/shared.tsx). Duplicated here
// rather than imported, for the same reason collection/shared duplicates
// rather than importing from seller/shared — each domain file carries
// domain-only concerns (ScopePicker/DiscountValueField here, ProductPicker
// there). If panelClass etc. ever drift, that's the signal to finally pull
// them into a components/admin/shared.tsx all three import from.
// ---------------------------------------------------------------------------

export const panelClass =
  'rounded-2xl border border-ink/10 bg-card shadow-[0_1px_2px_rgba(32,36,43,0.04),0_20px_50px_-32px_rgba(32,36,43,0.35)]'

export const groupClass = 'rounded-xl border border-ink/10 bg-parchment/60'

export const inputClass =
  'w-full rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm text-ink outline-none transition-colors focus:border-teal/60 focus:ring-2 focus:ring-teal/10'

export const monoInputClass = `${inputClass} font-mono uppercase`

export function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

// ---------------------------------------------------------------------------
// Status vocabulary — dot / pill / left-edge bar, same three-part pattern
// as collection/shared's STATUS_DOT/PILL/EDGE, extended from 2 states to
// 5 since a discount's status is date- and usage-driven rather than a
// single manual toggle. STATUS_PILL intentionally duplicates STATUS_STYLE
// in data/discounts/data.ts — same duplication collection/shared already
// has against data/collections/data.ts's STATUS_STYLE.
// ---------------------------------------------------------------------------

export const STATUS_DOT: Record<DiscountStatus, string> = {
  active: 'bg-teal-deep',
  scheduled: 'bg-indigo',
  draft: 'bg-ink/30',
  expired: 'bg-ink/20',
  disabled: 'bg-ink/20',
}

export const STATUS_PILL: Record<DiscountStatus, string> = {
  active: 'bg-teal/12 text-teal-deep ring-1 ring-inset ring-teal/25',
  scheduled: 'bg-indigo/12 text-indigo-deep ring-1 ring-inset ring-indigo/25',
  draft: 'bg-ink/[0.05] text-ink/50 ring-1 ring-inset ring-ink/10',
  expired: 'bg-ink/[0.05] text-ink/40 ring-1 ring-inset ring-ink/10',
  disabled: 'bg-ink/[0.05] text-ink/40 ring-1 ring-inset ring-ink/10',
}

export const STATUS_EDGE: Record<DiscountStatus, string> = {
  active: 'before:bg-teal-deep/70',
  scheduled: 'before:bg-indigo/60',
  draft: 'before:bg-transparent',
  expired: 'before:bg-transparent',
  disabled: 'before:bg-transparent',
}

// Same restricted trust/weight + accent palette as collection/shared's
// THUMB_COLORS, gold still excluded (reserved for wishlist/new-drop
// badges elsewhere, not fills here).
const THUMB_COLORS = [
  'bg-indigo text-parchment',
  'bg-teal-deep text-parchment',
  'bg-ink text-parchment',
  'bg-indigo-deep text-parchment',
  'bg-teal/20 text-teal-deep',
  'bg-ink/10 text-ink',
]

export function thumbColor(name: string) {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0
  return THUMB_COLORS[hash % THUMB_COLORS.length]
}

// ---------------------------------------------------------------------------
// Section chrome & form fields — identical shape to collection/shared.tsx.
// ---------------------------------------------------------------------------

export function SectionHeading({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div>
      <h2 className="font-display text-xl text-ink">{title}</h2>
      <p className="mt-0.5 text-sm text-ink/45">{subtitle}</p>
    </div>
  )
}

export function Field({
  label,
  required,
  hint,
  className,
  children,
}: {
  label: string
  required?: boolean
  hint?: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <label className={`block ${className ?? ''}`}>
      <span className="text-xs font-semibold text-ink/50">
        {label}
        {required && <span className="text-red-600"> *</span>}
      </span>
      <div className="mt-1.5">{children}</div>
      {hint && <p className="mt-1 text-xs text-ink/40">{hint}</p>}
    </label>
  )
}

export function ReviewRow({ label, onEdit, children }: { label: string; onEdit: () => void; children: React.ReactNode }) {
  return (
    <div className={`flex items-start justify-between gap-4 p-4 ${groupClass}`}>
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-ink/35">{label}</p>
        <div className="mt-1">{children}</div>
      </div>
      <button type="button" onClick={onEdit} className="flex flex-none items-center gap-1 text-xs font-semibold text-teal-deep hover:underline">
        Edit
      </button>
    </div>
  )
}

export function SummaryRow({ term, value, mono = false, multiline = false }: { term: string; value: string; mono?: boolean; multiline?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5 border-b border-ink/5 pb-3 last:border-0 last:pb-0">
      <dt className="text-[11px] font-semibold text-ink/40">{term}</dt>
      <dd className={`text-ink ${mono ? 'font-mono text-xs' : 'text-sm'} ${multiline ? 'whitespace-pre-wrap leading-relaxed' : ''}`}>{value}</dd>
    </div>
  )
}

export function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-xl border border-ink/10 bg-parchment/50 px-3 py-2.5 text-center">
      <p className="text-lg font-semibold text-ink">{value}</p>
      <p className="mt-0.5 text-xs text-ink/50">{label}</p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// SegmentedControl — the exact button-group [collectionId]/page.tsx built
// inline for the draft/published status toggle, generalized. Discounts
// need this three times (scope type, discount type, method) where
// Collections only needed it once, so it earns being lifted into shared
// rather than copy-pasted per use like the original was.
// ---------------------------------------------------------------------------

export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T
  options: { value: T; label: string }[]
  onChange: (value: T) => void
}) {
  return (
    <div className="flex gap-1 rounded-xl border border-ink/10 bg-parchment/60 p-1">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
            value === opt.value ? 'bg-teal-deep text-parchment' : 'text-ink/55 hover:text-ink'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// DiscountThumb — CollectionThumb's sibling. Discounts have no product
// image to fall back to (a storewide % discount isn't "of" any one
// product), so unlike CollectionThumb this never takes an image prop —
// it's icon-by-type, always. Same colour-hash-by-name fill underneath.
// ---------------------------------------------------------------------------

const TYPE_ICON: Record<DiscountType, LucideIcon> = {
  percentage: Percent,
  fixed: Banknote,
  free_gift: Gift,
}

export function DiscountThumb({ type, name, size = 40 }: { type: DiscountType; name: string; size?: number }) {
  const Icon = TYPE_ICON[type]
  return (
    <span className={`grid flex-none place-items-center rounded-full ${thumbColor(name)}`} style={{ height: size, width: size }}>
      <Icon size={size * 0.45} strokeWidth={1.75} />
    </span>
  )
}

// ---------------------------------------------------------------------------
// SearchableSingleSelect — generic inline (non-modal) picker used by both
// ScopePicker (seller / collection) and DiscountValueField (gift product).
// Inline rather than a modal like Collections' ProductPicker, because
// picking one seller/collection/gift-product is a single field in the
// form, not a growing multi-item list that needs its own overlay workflow
// the way Collection Items does.
// ---------------------------------------------------------------------------

export function SearchableSingleSelect<T extends { id: string; name: string }>({
  items,
  selectedId,
  onSelect,
  placeholder,
  renderMeta,
}: {
  items: T[]
  selectedId?: string
  onSelect: (item: T) => void
  placeholder: string
  renderMeta?: (item: T) => string | undefined
}) {
  const [query, setQuery] = useState('')
  const q = query.trim().toLowerCase()
  const results = !q ? items : items.filter((i) => i.name.toLowerCase().includes(q))

  return (
    <div className={`flex flex-col gap-2 p-3 ${groupClass}`}>
      <div className="relative">
        <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink/35" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={placeholder}
          className={`${inputClass} bg-white pl-8`}
        />
      </div>
      <div className="max-h-52 overflow-y-auto">
        {results.length === 0 ? (
          <p className="px-2 py-6 text-center text-xs text-ink/40">No matches.</p>
        ) : (
          results.map((item) => {
            const selected = item.id === selectedId
            const meta = renderMeta?.(item)
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelect(item)}
                className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                  selected ? 'bg-teal/10 text-teal-deep' : 'text-ink hover:bg-ink/[0.04]'
                }`}
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium">{item.name}</span>
                  {meta && <span className="block truncate text-xs text-ink/45">{meta}</span>}
                </span>
                {selected && <Check size={14} className="flex-none" />}
              </button>
            )
          })
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// ProductMultiPicker — Collections' ProductPicker modal, adapted: no
// image/price row (PickableProductRef carries neither — a discount scope
// doesn't need to show what a product costs, just what it is), and
// multi-select via a checkbox-style toggle instead of "add once and it's
// gone from the list."
// ---------------------------------------------------------------------------

export function ProductMultiPicker({
  products,
  selectedIds,
  onToggle,
  onClose,
}: {
  products: PickableProductRef[]
  selectedIds: Set<string>
  onToggle: (product: PickableProductRef) => void
  onClose: () => void
}) {
  const [query, setQuery] = useState('')
  const q = query.trim().toLowerCase()
  const results = !q
    ? products
    : products.filter((p) => p.name.toLowerCase().includes(q) || p.sellerName.toLowerCase().includes(q))

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/40 px-4">
      <div className={`flex max-h-[80vh] w-full max-w-lg flex-col overflow-hidden ${panelClass}`}>
        <div className="flex flex-none items-center justify-between border-b border-ink/10 px-5 py-4">
          <h2 className="font-display text-lg text-ink">Select products</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid h-8 w-8 place-items-center rounded-full text-ink/40 transition-colors hover:bg-ink/[0.06] hover:text-ink"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex-none border-b border-ink/10 px-5 py-3">
          <div className="relative">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink/35" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by product or seller"
              className={`${inputClass} pl-8`}
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-2 py-2">
          {results.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-ink/40">No products match &ldquo;{query}&rdquo;.</p>
          ) : (
            results.map((product) => {
              const selected = selectedIds.has(product.id)
              return (
                <button
                  key={product.id}
                  type="button"
                  onClick={() => onToggle(product)}
                  className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors ${
                    selected ? 'bg-teal/[0.06]' : 'hover:bg-ink/[0.04]'
                  }`}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-ink">{product.name}</span>
                    <span className="block truncate text-xs text-ink/45">{product.sellerName}</span>
                  </span>
                  <span
                    className={`grid h-6 w-6 flex-none place-items-center rounded-md border transition-colors ${
                      selected ? 'border-teal-deep bg-teal-deep text-parchment' : 'border-ink/20 text-transparent'
                    }`}
                  >
                    <Check size={13} />
                  </span>
                </button>
              )
            })
          )}
        </div>

        <div className="flex flex-none items-center justify-between border-t border-ink/10 px-5 py-3">
          <p className="text-xs font-medium text-ink/45">{selectedIds.size} selected</p>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl bg-teal-deep px-4 py-2 text-sm font-semibold text-parchment transition-colors hover:bg-teal"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// ScopePicker — the "Items"-equivalent for discounts. Branches into the
// right sub-picker per scope type: nothing for storewide, a single-select
// for seller/collection, a modal multi-select (+ removable chip list) for
// products. Switching scope type clears whatever was targeted under the
// previous type, same instinct as Collections not letting a removed
// item's stale data linger in state.
// ---------------------------------------------------------------------------

const SCOPE_OPTIONS: { value: DiscountScopeType; label: string }[] = [
  { value: 'storewide', label: 'Storewide' },
  { value: 'seller', label: 'Seller' },
  { value: 'collection', label: 'Collection' },
  { value: 'products', label: 'Products' },
]

export function ScopePicker({
  scope,
  onChange,
  sellers,
  collections,
  products,
}: {
  scope: DiscountScopeTarget
  onChange: (scope: DiscountScopeTarget) => void
  sellers: PickableSeller[]
  collections: PickableCollection[]
  products: PickableProductRef[]
}) {
  const [pickerOpen, setPickerOpen] = useState(false)

  const setType = (type: DiscountScopeType) => onChange({ type })

  const selectedProductIds = new Set(scope.productIds ?? [])

  const toggleProduct = (product: PickableProductRef) => {
    const ids = new Set(scope.productIds ?? [])
    if (ids.has(product.id)) {
      ids.delete(product.id)
    } else {
      ids.add(product.id)
    }
    const nextIds = [...ids]
    onChange({
      ...scope,
      productIds: nextIds,
      productNames: nextIds.map((id) => products.find((p) => p.id === id)?.name ?? id),
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <SegmentedControl value={scope.type} options={SCOPE_OPTIONS} onChange={setType} />

      {scope.type === 'seller' && (
        <SearchableSingleSelect
          items={sellers}
          selectedId={scope.sellerId}
          placeholder="Search sellers..."
          onSelect={(seller) => onChange({ type: 'seller', sellerId: seller.id, sellerName: seller.name })}
        />
      )}

      {scope.type === 'collection' && (
        <SearchableSingleSelect
          items={collections}
          selectedId={scope.collectionId}
          placeholder="Search collections..."
          onSelect={(collection) => onChange({ type: 'collection', collectionId: collection.id, collectionName: collection.name })}
        />
      )}

      {scope.type === 'products' && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-ink/50">
              {selectedProductIds.size} product{selectedProductIds.size === 1 ? '' : 's'} selected
            </p>
            <button
              type="button"
              onClick={() => setPickerOpen(true)}
              className="flex items-center gap-1.5 rounded-lg border border-ink/15 px-2.5 py-1.5 text-xs font-semibold text-ink/60 hover:bg-ink/5 hover:text-ink"
            >
              <Plus size={12} />
              Select products
            </button>
          </div>

          {scope.productIds && scope.productIds.length > 0 ? (
            <ul className={`flex flex-col divide-y divide-ink/[0.06] ${groupClass}`}>
              {scope.productIds.map((id, i) => (
                <li key={id} className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
                  <span className="truncate text-ink">{scope.productNames?.[i] ?? id}</span>
                  <button
                    type="button"
                    onClick={() => {
                      const product = products.find((p) => p.id === id)
                      if (product) toggleProduct(product)
                    }}
                    aria-label="Remove"
                    className="grid h-6 w-6 flex-none place-items-center rounded-full text-ink/40 transition-colors hover:bg-red-600/10 hover:text-red-600"
                  >
                    <X size={13} />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className={`flex items-center justify-center p-6 text-center border-dashed ${groupClass}`}>
              <p className="text-xs leading-relaxed text-ink/45">No products selected yet.</p>
            </div>
          )}

          {pickerOpen && (
            <ProductMultiPicker products={products} selectedIds={selectedProductIds} onToggle={toggleProduct} onClose={() => setPickerOpen(false)} />
          )}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// DiscountValueField — the type toggle (% / fixed / gift) plus whichever
// input actually matters for that type. A percentage discount has no use
// for a Rs. input and vice versa, and a free gift has no numeric value at
// all — it needs a product instead — so this swaps the whole input rather
// than showing all three and disabling two.
// ---------------------------------------------------------------------------

const TYPE_OPTIONS: { value: DiscountType; label: string }[] = [
  { value: 'percentage', label: 'Percentage' },
  { value: 'fixed', label: 'Fixed amount' },
  { value: 'free_gift', label: 'Free gift' },
]

export function DiscountValueField({
  type,
  onTypeChange,
  value,
  onValueChange,
  giftProductId,
  onGiftProductChange,
  products,
}: {
  type: DiscountType
  onTypeChange: (type: DiscountType) => void
  value?: number
  onValueChange: (value: number | undefined) => void
  giftProductId?: string
  onGiftProductChange: (product: PickableProductRef) => void
  products: PickableProductRef[]
}) {
  return (
    <div className="flex flex-col gap-4">
      <SegmentedControl value={type} options={TYPE_OPTIONS} onChange={onTypeChange} />

      {type === 'percentage' && (
        <div className="relative">
          <input
            type="number"
            min={0}
            max={100}
            value={value ?? ''}
            onChange={(e) => onValueChange(e.target.value === '' ? undefined : Number(e.target.value))}
            placeholder="15"
            className={`${inputClass} pr-9`}
          />
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-ink/40">%</span>
        </div>
      )}

      {type === 'fixed' && (
        <div className="relative">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-ink/40">Rs.</span>
          <input
            type="number"
            min={0}
            value={value ?? ''}
            onChange={(e) => onValueChange(e.target.value === '' ? undefined : Number(e.target.value))}
            placeholder="500"
            className={`${inputClass} pl-9`}
          />
        </div>
      )}

      {type === 'free_gift' && (
        <SearchableSingleSelect
          items={products}
          selectedId={giftProductId}
          placeholder="Search products to gift..."
          renderMeta={(p) => p.sellerName}
          onSelect={onGiftProductChange}
        />
      )}
    </div>
  )
}