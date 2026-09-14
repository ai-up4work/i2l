'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, ChevronLeft, ChevronRight, MessageSquareText, Send } from 'lucide-react'
import { useAdminData } from '@/contexts/AdminDataContext'
import { StatusPill } from '@/components/admin/warehouse/status-pill'
import {
  fetchAdminOrder,
  fetchOrderStageHistory,
  fetchOrderInternalNotes,
  fetchSites,
  setOrderStage,
  setOrderDelayed,
  reassignOrderSite,
  addInternalNote,
  STAGE_ORDER,
  STAGE_LABEL,
  CHANNEL_LABEL,
  type AdminOrder,
  type StageHistoryEvent,
  type InternalNote,
  type DbOrderStage,
} from '@/lib/supabase/orders-admin'

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export default function AdminOrderDetailPage() {
  const params = useParams<{ orderId: string }>()
  const router = useRouter()
  const { currentUser, permissions } = useAdminData()

  const [order, setOrder] = useState<AdminOrder | null>(null)
  const [history, setHistory] = useState<StageHistoryEvent[]>([])
  const [notes, setNotes] = useState<InternalNote[]>([])
  const [sites, setSites] = useState<{ id: string; name: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [noteDraft, setNoteDraft] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const [o, s] = await Promise.all([fetchAdminOrder(params.orderId), fetchSites()])
    setOrder(o)
    setSites(s)
    if (o) {
      const [h, n] = await Promise.all([fetchOrderStageHistory(o.id), fetchOrderInternalNotes(o.id)])
      setHistory(h)
      setNotes(n)
    }
    setLoading(false)
  }, [params.orderId])

  useEffect(() => {
    load()
  }, [load])

  const canMutate =
    permissions.canMutateOrderStage && (!permissions.ordersScopedToOwnSite || order?.siteId === currentUser.siteId)

  async function handleStageChange(stage: DbOrderStage) {
    if (!order) return
    setBusy(true)
    const res = await setOrderStage(order.id, stage, currentUser.id)
    setBusy(false)
    if (res.ok) load()
    else alert(res.error ?? 'Could not update stage')
  }

  async function handleDelayedToggle() {
    if (!order) return
    setBusy(true)
    const res = await setOrderDelayed(order.id, !order.delayed)
    setBusy(false)
    if (res.ok) load()
  }

  async function handleReassign(siteId: string) {
    if (!order) return
    setBusy(true)
    const res = await reassignOrderSite(order.id, siteId, currentUser.id)
    setBusy(false)
    if (res.ok) load()
  }

  async function handleAddNote() {
    if (!order || !noteDraft.trim()) return
    setBusy(true)
    const res = await addInternalNote(order.id, currentUser.id, noteDraft.trim())
    setBusy(false)
    if (res.ok) {
      setNoteDraft('')
      load()
    }
  }

  if (loading) {
    return <div className="h-64 animate-pulse rounded-2xl border border-ink/10 bg-card/60" />
  }

  if (!order) {
    return (
      <div className="rounded-2xl border border-dashed border-ink/15 bg-card px-8 py-16 text-center">
        <p className="font-body text-sm text-ink/50">Order not found.</p>
        <Link href="/admin/orders" className="mt-3 inline-block font-body text-sm text-teal-deep underline">
          Back to orders
        </Link>
      </div>
    )
  }

  const stageIdx = STAGE_ORDER.indexOf(order.stage as DbOrderStage)

  return (
    <div className="flex flex-col gap-6">
      <button
        onClick={() => router.push('/admin/orders')}
        className="inline-flex w-fit items-center gap-1.5 font-body text-sm text-ink/50 hover:text-ink"
      >
        <ArrowLeft size={14} /> Back to orders
      </button>

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4 rounded-2xl border border-ink/10 bg-card p-6">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-mono text-xl font-semibold text-ink">{order.displayId}</h1>
            <StatusPill label={CHANNEL_LABEL[order.channel]} tone={order.channel === 3 ? 'amber' : 'teal'} />
            {order.delayed && <StatusPill label="Delayed" tone="rose" />}
          </div>
          <p className="mt-1 font-body text-sm text-ink/65">{order.customerName} · {order.customerEmail}</p>
          <p className="mt-0.5 font-body text-xs text-ink/40">
            Placed {formatDateTime(order.createdAt)} · {order.siteName ?? 'No site assigned'}
          </p>
        </div>
        <div className="text-right">
          <p className="font-display text-2xl font-semibold text-ink">
            {order.currency} {order.totalValue.toLocaleString()}
          </p>
          <p className="mt-1 font-body text-xs text-ink/40">Current stage: {STAGE_LABEL[order.stage as DbOrderStage] ?? order.stage}</p>
        </div>
      </div>

      {/* Stage stepper */}
      <div className="rounded-2xl border border-ink/10 bg-card p-6">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-base font-semibold text-ink">Pipeline stage</h2>
          {order.stage !== 'delivered' && canMutate && (
            <div className="flex items-center gap-2">
              <button
                disabled={busy || stageIdx <= 0}
                onClick={() => handleStageChange(STAGE_ORDER[stageIdx - 1])}
                className="inline-flex items-center gap-1 rounded-full border border-ink/15 px-3 py-1.5 font-body text-xs font-semibold text-ink disabled:opacity-30"
              >
                <ChevronLeft size={13} /> Roll back
              </button>
              <button
                disabled={busy || stageIdx >= STAGE_ORDER.length - 1}
                onClick={() => handleStageChange(STAGE_ORDER[stageIdx + 1])}
                className="inline-flex items-center gap-1 rounded-full bg-ink px-3 py-1.5 font-body text-xs font-semibold text-parchment disabled:opacity-30"
              >
                Advance <ChevronRight size={13} />
              </button>
            </div>
          )}
        </div>
        <div className="mt-4 flex items-center gap-1">
          {STAGE_ORDER.map((s, i) => (
            <div key={s} className="flex flex-1 items-center gap-1">
              <div className="flex flex-col items-center gap-1.5">
                <div
                  className={`h-2.5 w-2.5 rounded-full ${
                    i <= stageIdx ? 'bg-teal-deep' : 'bg-ink/15'
                  }`}
                />
                <span className={`whitespace-nowrap font-body text-[10px] ${i <= stageIdx ? 'text-ink/70' : 'text-ink/30'}`}>
                  {STAGE_LABEL[s]}
                </span>
              </div>
              {i < STAGE_ORDER.length - 1 && (
                <div className={`h-px flex-1 ${i < stageIdx ? 'bg-teal-deep' : 'bg-ink/10'}`} />
              )}
            </div>
          ))}
        </div>

        {canMutate && (
          <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-ink/10 pt-4">
            <label className="flex items-center gap-2 font-body text-xs text-ink/60">
              <input type="checkbox" checked={order.delayed} onChange={handleDelayedToggle} disabled={busy} />
              Flag as delayed
            </label>
            {permissions.canReassignSite && sites.length > 0 && (
              <label className="flex items-center gap-2 font-body text-xs text-ink/60">
                Site
                <select
                  value={order.siteId ?? ''}
                  onChange={(e) => handleReassign(e.target.value)}
                  disabled={busy}
                  className="rounded-lg border border-ink/15 bg-parchment px-2 py-1 font-body text-xs text-ink"
                >
                  <option value="" disabled>
                    Unassigned
                  </option>
                  {sites.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
        {/* Items */}
        <div className="rounded-2xl border border-ink/10 bg-card p-6">
          <h2 className="font-display text-base font-semibold text-ink">Items</h2>
          <div className="mt-4 flex flex-col divide-y divide-ink/10">
            {order.items.map((item) => (
              <div key={item.id} className="flex items-center gap-4 py-3">
                {item.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.image} alt="" className="h-14 w-14 flex-none rounded-lg object-cover" />
                ) : (
                  <div className="h-14 w-14 flex-none rounded-lg bg-parchment" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-body text-sm font-medium text-ink">{item.title}</p>
                  <p className="font-body text-xs text-ink/45">
                    {[item.variant, `Qty: ${item.quantity}`].filter(Boolean).join(' · ')}
                  </p>
                  {order.channel === 3 && item.requestLink && (
                    <a href={item.requestLink} target="_blank" rel="noreferrer" className="font-body text-xs text-teal-deep underline">
                      Original request link
                    </a>
                  )}
                  {item.sellerName && (
                    <p className="font-body text-xs text-ink/40">
                      {item.sellerName}
                      {item.storeUrl && ' · storefront'}
                    </p>
                  )}
                </div>
                <p className="flex-none font-body text-sm font-semibold text-ink">
                  {order.currency} {item.unitPrice.toLocaleString()}
                </p>
              </div>
            ))}
          </div>

          {order.recipient && (
            <div className="mt-4 rounded-xl bg-parchment/60 p-4">
              <p className="font-body text-xs font-semibold uppercase tracking-wide text-ink/35">Delivering to</p>
              <p className="mt-1 font-body text-sm text-ink/70">
                {order.recipient.name} — {order.recipient.city}, {order.recipient.country}
              </p>
            </div>
          )}

          {order.chatThreadId && (
            <Link
              href={`/admin/chat?thread=${order.chatThreadId}`}
              className="mt-4 inline-flex items-center gap-1.5 font-body text-xs font-semibold text-teal-deep"
            >
              <MessageSquareText size={13} /> Open linked chat thread
            </Link>
          )}
        </div>

        {/* Stage history + internal notes */}
        <div className="flex flex-col gap-6">
          <div className="rounded-2xl border border-ink/10 bg-card p-6">
            <h2 className="font-display text-base font-semibold text-ink">Stage history</h2>
            <div className="mt-4 flex flex-col gap-3">
              {history.length === 0 && <p className="font-body text-xs text-ink/40">No transitions logged yet.</p>}
              {history.map((h) => (
                <div key={h.id} className="flex items-start gap-3">
                  <div className="mt-1.5 h-1.5 w-1.5 flex-none rounded-full bg-teal-deep" />
                  <div>
                    <p className="font-body text-sm text-ink">
                      {STAGE_LABEL[h.stage as DbOrderStage] ?? h.stage}
                      <span className="ml-2 font-body text-xs text-ink/40">
                        {formatDateTime(h.at)} · {h.byStaffName ?? 'System'}
                      </span>
                    </p>
                    {h.note && <p className="mt-0.5 font-body text-xs text-ink/50">{h.note}</p>}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-ink/10 bg-card p-6">
            <h2 className="font-display text-base font-semibold text-ink">Internal notes</h2>
            <p className="mt-1 font-body text-xs text-ink/40">Ops-only — never shown to the customer.</p>
            <div className="mt-4 flex gap-2">
              <input
                value={noteDraft}
                onChange={(e) => setNoteDraft(e.target.value)}
                placeholder="Add a note…"
                className="flex-1 rounded-xl border border-ink/15 bg-parchment px-3 py-2 font-body text-sm text-ink outline-none focus:border-teal"
              />
              <button
                onClick={handleAddNote}
                disabled={busy || !noteDraft.trim()}
                className="inline-flex items-center gap-1.5 rounded-xl bg-ink px-3 py-2 font-body text-xs font-semibold text-parchment disabled:opacity-40"
              >
                <Send size={13} />
              </button>
            </div>
            <div className="mt-4 flex flex-col gap-3">
              {notes.length === 0 && <p className="font-body text-xs text-ink/40">No internal notes yet.</p>}
              {notes.map((n) => (
                <div key={n.id} className="rounded-lg bg-parchment/60 p-3">
                  <p className="font-body text-sm text-ink/75">{n.text}</p>
                  <p className="mt-1 font-body text-[11px] text-ink/40">
                    {n.staffName ?? 'Staff'} · {formatDateTime(n.at)}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
