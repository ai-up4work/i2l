// components/store-modules/casecraft/ReadyMadeCases.tsx
//
// Ready-made designs the seller uploads (seller portal → Ready-made
// designs). Pick a design, pick your phone, order.
'use client'

import { useEffect, useMemo, useState } from 'react'
import { ImageOff, X } from 'lucide-react'
import { imageThumb } from '@/lib/media'
import { getCaseType } from '@/lib/store-modules/casecraft/catalog'
import { formatRs, type DeliveryDetails, type PaymentMethod, type StorefrontData, type StorefrontDesign } from '@/lib/store-modules/casecraft/settings'
import CaseCheckout, { type PlacedOrder } from './CaseCheckout'
import { PhonePicker } from './parts'
import { LikeButton } from './likes'
import ShareButton from '@/components/stores/ShareButton'

type Filter = 'all' | 'new' | 'best' | 'loved'

/** One ready-made design: photo, heart, name, price. Used in grids and rows. */
/** "New" only means something when most designs aren't new. */
export function newBadgeMatters(designs: StorefrontDesign[]): boolean {
  return designs.filter((d) => d.isNew).length < designs.length / 2
}

export function DesignCard({
  design: d,
  onOpen,
  showNew = true,
  className = '',
}: {
  design: StorefrontDesign
  onOpen: (d: StorefrontDesign) => void
  /** Hide the "New" badge (e.g. when nearly every design is new). */
  showNew?: boolean
  className?: string
}) {
  const badge = d.isBestseller ? 'Bestseller' : d.isNew && showNew ? 'New' : null
  return (
    <div className={`group relative min-w-0 ${className}`}>
      <button type="button" onClick={() => onOpen(d)} className="block w-full text-left">
        <span className="relative block aspect-[3/4] overflow-hidden rounded-2xl bg-card ring-1 ring-ink/10">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={imageThumb(d.imageUrl, 500)} alt={d.name} loading="lazy" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03] motion-reduce:transition-none" />
          {badge && (
            <span className={`absolute left-2 top-2 rounded-full px-2 py-0.5 font-body text-[10px] font-bold ${d.isBestseller ? 'bg-gold text-ink' : 'bg-card/92 text-ink'}`}>
              {badge}
            </span>
          )}
        </span>
        <span className="mt-2 block truncate font-body text-sm font-semibold text-ink">{d.name}</span>
        <span className="mt-0.5 block font-body text-sm text-ink/70">{formatRs(d.price)}</span>
      </button>
      <LikeButton type="design" id={d.id} base={d.likes} className="absolute right-2 top-2" />
    </div>
  )
}

export default function ReadyMadeCases({
  data,
  openId,
  onOpenChange,
}: {
  data: StorefrontData
  /** The design whose sheet is open (kept in the address, so it can be shared). */
  openId?: string | null
  onOpenChange?: (id: string | null) => void
}) {
  const [filter, setFilter] = useState<Filter>('all')
  const [localOpen, setLocalOpen] = useState<string | null>(null)
  const openKey = onOpenChange ? (openId ?? null) : localOpen
  const setOpen = (id: string | null) => (onOpenChange ? onOpenChange(id) : setLocalOpen(id))
  const open = data.designs.find((d) => d.id === openKey) ?? null

  const showNew = newBadgeMatters(data.designs)
  // A "New" filter only helps when some designs aren't new.
  const hasNew = showNew && data.designs.some((d) => d.isNew)
  const hasBest = data.designs.some((d) => d.isBestseller)
  const hasLoved = data.designs.some((d) => d.likes > 0)
  const shown = data.designs
    .filter((d) => filter === 'all' || filter === 'loved' || (filter === 'new' ? d.isNew : d.isBestseller))
    .sort((a, b) => (filter === 'loved' ? b.likes - a.likes : 0))

  if (!data.designs.length) {
    return (
      <div className="rounded-2xl bg-card px-6 py-14 text-center ring-1 ring-ink/10">
        <ImageOff size={28} className="mx-auto text-ink/25" aria-hidden />
        <p className="mt-3 font-body text-sm text-ink/60">New designs are coming soon. Meanwhile, design your own.</p>
      </div>
    )
  }

  return (
    <div>
      {(hasNew || hasBest || hasLoved) && (
        <div className="-mx-1 mb-4 flex gap-2 overflow-x-auto px-1 pb-1">
          {(
            [
              ['all', `All ${data.designs.length}`],
              ...(hasBest ? [['best', 'Bestsellers']] : []),
              ...(hasLoved ? [['loved', 'Most loved']] : []),
              ...(hasNew ? [['new', 'New']] : []),
            ] as [Filter, string][]
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setFilter(id)}
              className={`flex-none rounded-full px-4 py-2 font-body text-sm font-semibold transition-colors ${
                filter === id ? 'bg-indigo text-parchment' : 'bg-card text-ink/65 ring-1 ring-ink/10 hover:text-ink'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 gap-x-3 gap-y-5 sm:grid-cols-3 sm:gap-x-4 lg:grid-cols-4">
        {shown.map((d) => (
          <DesignCard key={d.id} design={d} onOpen={(x) => setOpen(x.id)} showNew={showNew} />
        ))}
      </div>

      {open && <DesignSheet design={open} data={data} onClose={() => setOpen(null)} />}
    </div>
  )
}

export function DesignSheet({ design, data, onClose }: { design: StorefrontDesign; data: StorefrontData; onClose: () => void }) {
  const caseType = getCaseType(design.caseTypeId)
  const models = useMemo(() => caseType?.models.filter((m) => design.models.includes(m.label)) ?? [], [caseType, design.models])
  const [model, setModel] = useState<string | null>(models.length === 1 ? models[0].label : null)
  const [quantity, setQuantity] = useState(1)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [onClose])

  async function place(delivery: DeliveryDetails, payment: PaymentMethod): Promise<PlacedOrder> {
    const res = await fetch('/api/casecraft/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ storeSlug: data.storeSlug, kind: 'ready', designId: design.id, caseTypeId: design.caseTypeId, model, quantity, delivery, payment }),
    })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(body.error ?? 'Could not place the order.')
    return body as PlacedOrder
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/45 sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-label={design.name} onClick={onClose}>
      <div
        className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-t-3xl bg-parchment shadow-2xl sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-ink/10 bg-parchment/95 px-5 py-3 backdrop-blur">
          <p className="min-w-0 flex-1 truncate font-display text-lg font-semibold text-ink">{design.name}</p>
          <LikeButton type="design" id={design.id} base={design.likes} look="inline" />
          <ShareButton
            title={design.name}
            text={`${design.name} — a ready-made phone case on Wishdrop`}
            url={`/stores/${data.storeSlug}?view=ready&design=${design.id}`}
            label="Share this design"
          />
          <button type="button" onClick={onClose} aria-label="Close" className="grid h-9 w-9 flex-none place-items-center rounded-full text-ink/60 hover:bg-ink/5">
            <X size={18} />
          </button>
        </div>
        <div className="grid grid-cols-1 gap-5 p-5 sm:grid-cols-[220px_minmax(0,1fr)]">
          <div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imageThumb(design.imageUrl, 700)} alt={design.name} className="mx-auto aspect-[3/4] w-full max-w-[240px] rounded-2xl object-cover ring-1 ring-ink/10" />
            {design.subtitle && <p className="mt-2 text-center font-body text-xs text-ink/55">{design.subtitle}</p>}
            {caseType && <p className="mt-1 text-center font-body text-xs text-ink/55">Printed on a {caseType.label}</p>}
          </div>
          <div className="flex min-w-0 flex-col gap-5">
            <div>
              <p className="mb-2 font-body text-sm font-semibold text-ink">Your phone</p>
              <PhonePicker models={models} selected={model} onSelect={(m) => setModel(m.label)} />
            </div>
            {model ? (
              <CaseCheckout
                data={data}
                quantity={quantity}
                onQuantity={setQuantity}
                item={{
                  title: design.name,
                  detail: `${model} · ${caseType?.label ?? ''}`,
                  unitPrice: design.price,
                  thumb: (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={imageThumb(design.imageUrl, 120)} alt="" className="h-14 w-10 flex-none rounded-lg object-cover ring-1 ring-ink/10" />
                  ),
                }}
                onPlace={place}
              />
            ) : (
              <p className="font-body text-sm text-ink/55">Pick your phone to continue.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
