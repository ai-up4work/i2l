'use client'

import Link from 'next/link'
import { ChevronRight, Clock } from 'lucide-react'
import { StatusPill, type StatusTone } from '@/components/admin/warehouse/status-pill'
import {
  STAGE_LABEL,
  CHANNEL_LABEL,
  hoursSince,
  isStageAgeBreached,
  type AdminOrder,
  type AdminOrderItem,
  type DbOrderStage,
} from '@/lib/supabase/orders-admin'

const MAX_VISIBLE_THUMBS = 3

/** Small overlapping thumbnail stack — the item-photo strip every order row had before this page went real-data. */
function ItemThumbStack({ items }: { items: AdminOrderItem[] }) {
  if (items.length === 0) return <div className="h-11 w-11 flex-none rounded-lg bg-parchment" />
  const visible = items.slice(0, MAX_VISIBLE_THUMBS)
  const overflow = items.length - visible.length
  return (
    <div className="flex flex-none items-center">
      {visible.map((item, i) => (
        <div
          key={item.id}
          className="relative h-11 w-11 overflow-hidden rounded-lg border-2 border-card bg-parchment"
          style={{ marginLeft: i === 0 ? 0 : -14, zIndex: visible.length - i }}
        >
          {/* Real product_snapshots photos are external URLs (loremflickr/CDN), so next/image needs
              a configured remote pattern for every host — plain <img> avoids that per-host allowlist
              friction for a purely decorative thumbnail. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={item.image} alt="" className="h-full w-full object-cover" />
        </div>
      ))}
      {overflow > 0 && (
        <div
          className="relative flex h-11 w-11 flex-none items-center justify-center rounded-lg border-2 border-card bg-ink/10 font-body text-[10px] font-semibold text-ink/60"
          style={{ marginLeft: -14, zIndex: 0 }}
        >
          +{overflow}
        </div>
      )}
    </div>
  )
}

function formatAge(hours: number): string {
  if (hours < 1) return '<1h'
  if (hours < 24) return `${Math.round(hours)}h`
  const days = Math.floor(hours / 24)
  const remHours = Math.round(hours % 24)
  return remHours > 0 ? `${days}d ${remHours}h` : `${days}d`
}

function stageTone(order: AdminOrder): StatusTone {
  if (order.delayed || isStageAgeBreached(order.stage, order.stageEnteredAt)) return 'rose'
  if (order.stage === 'delivered') return 'teal'
  return 'amber'
}

interface OrderQueueTableProps {
  orders: AdminOrder[]
  /** Detail route each row links into, e.g. "/admin/orders" -> "/admin/orders/WD-1234". */
  detailBasePath: string
  loading?: boolean
  emptyLabel?: string
  /** Extra column shown per row, e.g. destination for Pack & label. */
  extraColumn?: { header: string; render: (order: AdminOrder) => React.ReactNode }
}

export function OrderQueueTable({
  orders,
  detailBasePath,
  loading,
  emptyLabel = 'Nothing in this queue right now.',
  extraColumn,
}: OrderQueueTableProps) {
  if (loading) {
    return (
      <div className="flex flex-col gap-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-20 animate-pulse rounded-2xl border border-ink/10 bg-card/60" />
        ))}
      </div>
    )
  }

  if (orders.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-ink/15 bg-card px-8 py-16 text-center">
        <p className="font-body text-sm text-ink/50">{emptyLabel}</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {orders.map((order) => {
        const breached = isStageAgeBreached(order.stage, order.stageEnteredAt)
        return (
          <Link
            key={order.id}
            href={`${detailBasePath}/${order.displayId}`}
            className={`flex items-center gap-4 rounded-2xl border bg-card p-4 transition-colors hover:border-teal/40 ${
              order.delayed || breached ? 'border-l-4 border-l-rose-500' : 'border-l-4 border-l-ink/10'
            } border-ink/10`}
          >
            <ItemThumbStack items={order.items} />

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-sm font-semibold text-ink">{order.displayId}</span>
                <StatusPill label={CHANNEL_LABEL[order.channel]} tone={order.channel === 3 ? 'amber' : 'teal'} />
                {order.delayed && <StatusPill label="Delayed" tone="rose" />}
              </div>
              <p className="mt-1 truncate font-body text-sm text-ink/70">{order.customerName}</p>
              <p className="mt-0.5 truncate font-body text-xs text-ink/45">
                {order.items.map((i) => i.title).join(', ') || 'No items'}
              </p>
            </div>

            {extraColumn && (
              <div className="hidden w-40 flex-none font-body text-xs text-ink/55 sm:block">
                <p className="font-semibold uppercase tracking-wide text-ink/35">{extraColumn.header}</p>
                <p className="mt-1">{extraColumn.render(order)}</p>
              </div>
            )}

            <div className="hidden w-28 flex-none text-right font-body text-xs text-ink/55 md:block">
              <p className="font-semibold uppercase tracking-wide text-ink/35">Stage age</p>
              <p className={`mt-1 flex items-center justify-end gap-1 ${breached ? 'text-rose-600' : ''}`}>
                <Clock size={12} />
                {formatAge(hoursSince(order.stageEnteredAt))}
              </p>
            </div>

            <div className="hidden w-28 flex-none text-right font-body text-sm font-semibold text-ink lg:block">
              {order.currency} {order.totalValue.toLocaleString()}
            </div>

            <StatusPill label={STAGE_LABEL[order.stage as DbOrderStage] ?? order.stage} tone={stageTone(order)} />
            <ChevronRight size={16} className="flex-none text-ink/25" />
          </Link>
        )
      })}
    </div>
  )
}

export { formatAge }
