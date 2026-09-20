// components/shared/ChatOrderContextBar.tsx
'use client'

// Shared by ChatPanel.tsx (floating widget) and /account/messages —
// both render the same ChatContext state, just in different layouts, so
// this lives once instead of being duplicated per composer.
//
// Two states, matching ChatContext's own doc comments:
//   1. orderChoicePending — more than one live order, nothing decided
//      yet this session. Shows the "which order is this about?" prompt
//      instead of the normal pill, and sendMessage refuses to send
//      until this resolves.
//   2. Otherwise — a slim pill showing the current context ("Re: Order
//      WD-1044" / "General") plus a picker to change it. The picker
//      deliberately lists EVERY order, completed included — the prompt
//      above only offers live ones (that's the "what am I probably
//      asking about" guess), but changing your mind afterwards should
//      never be limited to what happened to still be open.
//
// Product-preview positioning: the hover card is ONE element anchored to
// this bar's own root (`relative ${className}` below) — the same
// coordinate space the "change order" dropdown already safely uses —
// rather than to whichever small chip triggered it. An earlier version
// anchored the popup per-chip inside the wrapping flex row; a chip that
// happened to land near the panel's right edge then pushed the whole
// 256px card past the panel (and, in ChatPanel's bottom-right corner
// placement, straight off the edge of the screen). The bar itself spans
// nearly the full composer width, so anchoring here instead keeps the
// popup inside the panel regardless of which chip is hovered.
import { useState } from 'react'
import Image from 'next/image'
import { ChevronDown, X } from 'lucide-react'
import { useChat } from '@/contexts/ChatContext'
import { STATUS_BADGE, type Order } from '@/contexts/Ordercontexts'

const PLACEHOLDER_IMAGE = '/images/product-placeholder.png'

function OrderProductPreview({ order }: { order: Order }) {
  const items = order.items ?? []
  if (items.length === 0) return null
  const shown = items.slice(0, 3)
  const extra = items.length - shown.length

  return (
    <div
      role="tooltip"
      className="pointer-events-none absolute bottom-full left-0 z-20 mb-2 flex w-64 max-w-[calc(100vw-3rem)] flex-col gap-2 rounded-2xl border border-ink/10 bg-card p-3 shadow-lift"
    >
      <div className="flex items-center justify-between gap-2">
        <p className="font-display text-xs font-semibold text-ink">{order.id}</p>
        <span className={`flex-none rounded-full px-1.5 py-0.5 text-[9px] font-semibold ${STATUS_BADGE[order.status]}`}>
          {order.status}
        </span>
      </div>
      <div className="flex flex-col gap-1.5">
        {shown.map((item) => (
          <div key={item.id} className="flex items-center gap-2">
            <div className="relative h-9 w-9 flex-none overflow-hidden rounded-lg border border-ink/10 bg-white">
              <Image src={item.image || PLACEHOLDER_IMAGE} alt="" fill sizes="36px" className="object-cover" />
            </div>
            <p className="line-clamp-2 flex-1 font-body text-[11px] leading-snug text-ink/70">{item.name}</p>
          </div>
        ))}
      </div>
      {extra > 0 && <p className="font-body text-[10px] text-ink/40">+{extra} more item{extra > 1 ? 's' : ''}</p>}
      <div className="absolute -bottom-1 left-4 h-2 w-2 rotate-45 border-b border-r border-ink/10 bg-card" />
    </div>
  )
}

export default function ChatOrderContextBar({ className = 'mx-3 mt-2.5' }: { className?: string }) {
  const { activeOrder, orderChoicePending, pendingOrderChoices, allOrders, setActiveOrder } = useChat()
  const [pickerOpen, setPickerOpen] = useState(false)
  // Which order's product preview to show — keyed by dbId, not per-chip
  // JSX state, so there's exactly one popup element regardless of how
  // many chips/rows are on screen. null = nothing hovered.
  const [previewOrderId, setPreviewOrderId] = useState<string | null>(null)

  const activeOrderFull =
    activeOrder && activeOrder !== 'general' ? allOrders.find((o) => o.dbId === activeOrder.dbId) : undefined

  const previewOrder =
    previewOrderId != null
      ? (pendingOrderChoices.find((o) => o.dbId === previewOrderId) ?? allOrders.find((o) => o.dbId === previewOrderId))
      : undefined

  const hoverHandlers = (dbId: string | undefined) =>
    dbId
      ? {
          onMouseEnter: () => setPreviewOrderId(dbId),
          onMouseLeave: () => setPreviewOrderId((cur) => (cur === dbId ? null : cur)),
        }
      : {}

  if (orderChoicePending) {
    return (
      <div className={`relative ${className} rounded-xl border border-gold/40 bg-gold/[0.08] px-3 py-2.5`}>
        <p className="font-body text-xs font-semibold text-ink/70">Which order is this about?</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {pendingOrderChoices.map((o) => (
            <button
              key={o.dbId}
              type="button"
              onClick={() => setActiveOrder({ dbId: o.dbId!, displayId: o.id })}
              {...hoverHandlers(o.dbId)}
              className="rounded-full border border-ink/15 bg-card px-3 py-1 font-body text-xs font-semibold text-ink/70 transition-colors hover:border-teal-deep hover:text-teal-deep"
            >
              {o.id}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setActiveOrder('general')}
            className="rounded-full px-3 py-1 font-body text-xs font-semibold text-ink/45 underline decoration-dotted hover:text-ink/70"
          >
            Not about an order
          </button>
        </div>
        {previewOrder && <OrderProductPreview order={previewOrder} />}
      </div>
    )
  }

  const label = activeOrder && activeOrder !== 'general' ? `Re: Order ${activeOrder.displayId}` : 'General'

  return (
    <div className={`relative ${className}`}>
      <div className="flex items-center justify-between rounded-full border border-ink/10 bg-ink/[0.03] py-1 pl-3 pr-1">
        <span
          {...hoverHandlers(activeOrderFull?.dbId)}
          className={`font-body text-xs font-semibold text-ink/60 ${activeOrderFull ? 'cursor-default' : ''}`}
        >
          {label}
        </span>
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={() => setPickerOpen((v) => !v)}
            aria-label="Change what this message is about"
            className="grid h-6 w-6 place-items-center rounded-full text-ink/40 transition-colors hover:bg-ink/5 hover:text-ink/60"
          >
            <ChevronDown size={13} className={pickerOpen ? 'rotate-180 transition-transform' : 'transition-transform'} />
          </button>
          {activeOrder !== 'general' && (
            <button
              type="button"
              onClick={() => setActiveOrder('general')}
              aria-label="Detach order — send as general"
              className="grid h-6 w-6 place-items-center rounded-full text-ink/40 transition-colors hover:bg-ink/5 hover:text-ink/60"
            >
              <X size={12} />
            </button>
          )}
        </div>
      </div>

      {previewOrder && !pickerOpen && <OrderProductPreview order={previewOrder} />}

      {pickerOpen && (
        <div className="absolute bottom-full left-0 z-10 mb-1.5 max-h-56 w-64 overflow-y-auto rounded-xl border border-ink/10 bg-card p-1.5 shadow-lift">
          <button
            type="button"
            onClick={() => {
              setActiveOrder('general')
              setPickerOpen(false)
            }}
            className={`block w-full rounded-lg px-2.5 py-1.5 text-left font-body text-xs font-semibold transition-colors hover:bg-ink/5 ${
              activeOrder === 'general' ? 'text-teal-deep' : 'text-ink/60'
            }`}
          >
            General (no order)
          </button>
          {allOrders.length > 0 && <div className="my-1 border-t border-ink/10" />}
          {allOrders.map((o) => {
            const selected = activeOrder !== 'general' && activeOrder?.dbId === o.dbId
            return (
              <button
                key={o.dbId ?? o.id}
                type="button"
                disabled={!o.dbId}
                onClick={() => {
                  if (!o.dbId) return
                  setActiveOrder({ dbId: o.dbId, displayId: o.id })
                  setPickerOpen(false)
                }}
                className={`flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left font-body text-xs font-semibold transition-colors hover:bg-ink/5 disabled:cursor-not-allowed disabled:opacity-40 ${
                  selected ? 'text-teal-deep' : 'text-ink/60'
                }`}
              >
                <span>{o.id}</span>
                <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${STATUS_BADGE[o.status]}`}>
                  {o.status}
                </span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}