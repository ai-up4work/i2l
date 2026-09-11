// components/admin/collection/shared.tsx
'use client'

import { useState } from 'react'
import Image from 'next/image'
import { Plus, Search, X, Check, Layers } from 'lucide-react'

import type { CollectionStatus, PickableProduct } from '@/data/collections/data'

// ---------------------------------------------------------------------------
// Same two-tier chrome as components/admin/seller/shared.tsx:
//   panelClass  — a whole section (Details, Items, header). Solid card
//                 surface, hairline border, one soft shadow.
//   groupClass  — something nested inside a panel (a field cluster, an
//                 empty-state well). Flat parchment tint, no shadow.
//
// These are intentionally duplicated here rather than imported from
// components/admin/seller/shared, since that file mixes in seller-only
// concerns (ProviderPicker, extractor CHECKS). If these tokens ever need
// to change, consider lifting panelClass/groupClass/inputClass/Field/
// SectionHeading into a truly domain-agnostic components/admin/shared.tsx
// that both seller/shared and collection/shared import from.
// ---------------------------------------------------------------------------

export const panelClass =
  'rounded-2xl border border-ink/10 bg-card shadow-[0_1px_2px_rgba(32,36,43,0.04),0_20px_50px_-32px_rgba(32,36,43,0.35)]'

export const groupClass = 'rounded-xl border border-ink/10 bg-parchment/60'

export const inputClass =
  'w-full rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm text-ink outline-none transition-colors focus:border-teal/60 focus:ring-2 focus:ring-teal/10'

export const monoInputClass = `${inputClass} font-mono`

export function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

// ---------------------------------------------------------------------------
// Status vocabulary — dot / pill / left-edge bar, same three-part pattern
// as STATUS_DOT / STATUS_PILL / STATUS_EDGE on the sellers list page, so a
// collection row's left border, pill, and dot always agree with each
// other and with what "published" or "draft" means everywhere else.
// ---------------------------------------------------------------------------

export const STATUS_DOT: Record<CollectionStatus, string> = {
  published: 'bg-teal-deep',
  draft: 'bg-ink/30',
}

export const STATUS_PILL: Record<CollectionStatus, string> = {
  published: 'bg-teal/12 text-teal-deep ring-1 ring-inset ring-teal/25',
  draft: 'bg-ink/[0.05] text-ink/50 ring-1 ring-inset ring-ink/10',
}

export const STATUS_EDGE: Record<CollectionStatus, string> = {
  published: 'before:bg-teal-deep/70',
  draft: 'before:bg-transparent',
}

// Fill rotates through the trust/weight and accent tones only — same
// restricted palette as the sellers list's avatarColor, gold excluded
// since it's reserved for badges, not fills.
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
// Section chrome & form fields — identical shape to seller/shared.tsx.
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
  className,
  children,
}: {
  label: string
  required?: boolean
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
// Items panel pieces — the product picker modal and the item row list,
// styled with the same panel/group tokens as everything above rather than
// the one-off styling the first pass used.
// ---------------------------------------------------------------------------

export function ProductPicker({
  products,
  alreadyAddedIds,
  onAdd,
  onClose,
}: {
  products: PickableProduct[]
  alreadyAddedIds: Set<string>
  onAdd: (product: PickableProduct) => void
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
          <h2 className="font-display text-lg text-ink">Add products</h2>
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
              const added = alreadyAddedIds.has(product.id)
              return (
                <button
                  key={product.id}
                  type="button"
                  disabled={added}
                  onClick={() => onAdd(product)}
                  className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors ${
                    added ? 'cursor-default opacity-50' : 'hover:bg-ink/[0.04]'
                  }`}
                >
                  <span className="relative block h-11 w-11 flex-none overflow-hidden rounded-lg bg-parchment">
                    <Image src={product.image} alt="" fill className="object-cover" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-ink">{product.name}</span>
                    <span className="block truncate text-xs text-ink/45">{product.sellerName}</span>
                  </span>
                  <span className="flex-none text-sm text-ink/50">Rs. {product.price.toLocaleString()}</span>
                  <span
                    className={`grid h-7 w-7 flex-none place-items-center rounded-full ${
                      added ? 'bg-teal-deep text-parchment' : 'bg-ink/[0.06] text-ink/50'
                    }`}
                  >
                    {added ? <Check size={14} /> : <Plus size={14} />}
                  </span>
                </button>
              )
            })
          )}
        </div>

        <div className="flex-none border-t border-ink/10 px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="ml-auto block rounded-xl bg-teal-deep px-4 py-2 text-sm font-semibold text-parchment transition-colors hover:bg-teal"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  )
}

export function CollectionThumb({ name, image, size = 40 }: { name: string; image?: string; size?: number }) {
  if (image) {
    return (
      <span
        className="block flex-none overflow-hidden rounded-full"
        style={{ height: size, width: size }}
      >
        <Image src={image} alt="" width={size} height={size} className="h-full w-full object-cover" />
      </span>
    )
  }
  return (
    <span
      className={`grid flex-none place-items-center rounded-full ${thumbColor(name)}`}
      style={{ height: size, width: size }}
    >
      <Layers size={size * 0.45} strokeWidth={1.75} />
    </span>
  )
}