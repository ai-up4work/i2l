'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, CheckCircle2, ExternalLink, XCircle } from 'lucide-react'
import { useAdminData } from '@/contexts/AdminDataContext'
import { StatusPill, type StatusTone } from '@/components/admin/warehouse/status-pill'
import {
  fetchPurchase,
  fetchAdminOrder,
  markPurchasePurchased,
  markPurchaseFailed,
  recordOutboundPayment,
  CHANNEL_LABEL,
  type AdminPurchase,
  type AdminOrder,
} from '@/lib/supabase/orders-admin'

const STATUS_TONE: Record<string, StatusTone> = { pending: 'amber', purchased: 'teal', failed: 'rose' }

export default function PurchaseDetailPage() {
  const params = useParams<{ PurchaseId: string }>()
  const router = useRouter()
  const { currentUser } = useAdminData()

  const [purchase, setPurchase] = useState<AdminPurchase | null>(null)
  const [order, setOrder] = useState<AdminOrder | null>(null)
  const [loading, setLoading] = useState(true)
  const [receiptRef, setReceiptRef] = useState('')
  const [failReason, setFailReason] = useState('')
  const [payAmount, setPayAmount] = useState('')
  const [payMethod, setPayMethod] = useState('')
  const [payRef, setPayRef] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const p = await fetchPurchase(params.PurchaseId)
    setPurchase(p)
    if (p?.orderDisplayId) setOrder(await fetchAdminOrder(p.orderDisplayId))
    setLoading(false)
  }, [params.PurchaseId])

  useEffect(() => {
    load()
  }, [load])

  async function handleMarkPurchased() {
    if (!purchase || !receiptRef.trim()) return
    setBusy(true)
    const res = await markPurchasePurchased(purchase.id, receiptRef.trim())
    setBusy(false)
    if (res.ok) load()
    else alert(res.error)
  }

  async function handleMarkFailed() {
    if (!purchase || !failReason.trim()) return
    setBusy(true)
    const res = await markPurchaseFailed(purchase.id, failReason.trim())
    setBusy(false)
    if (res.ok) load()
    else alert(res.error)
  }

  async function handleRecordPayment() {
    if (!purchase || !payAmount || !payMethod.trim()) return
    setBusy(true)
    const res = await recordOutboundPayment(purchase.id, { amount: Number(payAmount), method: payMethod.trim(), reference: payRef.trim() })
    setBusy(false)
    if (res.ok) {
      setPayAmount('')
      setPayMethod('')
      setPayRef('')
      load()
    }
  }

  if (loading) return <div className="h-64 animate-pulse rounded-2xl border border-ink/10 bg-card/60" />

  if (!purchase) {
    return (
      <div className="rounded-2xl border border-dashed border-ink/15 bg-card px-8 py-16 text-center">
        <p className="font-body text-sm text-ink/50">Purchase not found.</p>
        <Link href="/admin/purchases" className="mt-3 inline-block font-body text-sm text-teal-deep underline">
          Back to purchases
        </Link>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <button onClick={() => router.push('/admin/purchases')} className="inline-flex w-fit items-center gap-1.5 font-body text-sm text-ink/50 hover:text-ink">
        <ArrowLeft size={14} /> Back to purchases
      </button>

      <div className="flex flex-wrap items-start justify-between gap-4 rounded-2xl border border-ink/10 bg-card p-6">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-mono text-lg font-semibold text-ink">{purchase.orderDisplayId ?? purchase.id.slice(0, 8)}</h1>
            <StatusPill label={CHANNEL_LABEL[purchase.channel]} tone={purchase.channel === 3 ? 'amber' : 'teal'} />
            <StatusPill label={purchase.status} tone={STATUS_TONE[purchase.status] ?? 'amber'} />
          </div>
          <p className="mt-1 font-body text-sm text-ink/65">{purchase.customerName ?? 'Unknown customer'}</p>
        </div>
        <p className="font-display text-2xl font-semibold text-ink">Rs. {purchase.amount.toLocaleString()}</p>
      </div>

      <div className="rounded-2xl border border-ink/10 bg-card p-6">
        <h2 className="font-display text-base font-semibold text-ink">Source</h2>
        <p className="mt-2 font-body text-sm text-ink/70">{purchase.sourceStore}</p>
        {order?.items[0]?.storeUrl && (
          <a href={order.items[0].storeUrl} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1.5 font-body text-xs font-semibold text-teal-deep">
            <ExternalLink size={13} /> Open source store link
          </a>
        )}
        {order && (
          <div className="mt-4 flex flex-col divide-y divide-ink/10 border-t border-ink/10 pt-3">
            {order.items.map((item) => (
              <div key={item.id} className="flex items-center justify-between py-2">
                <p className="font-body text-sm text-ink/75">{item.title}</p>
                <p className="font-body text-xs text-ink/45">Qty: {item.quantity} · {order.currency} {item.unitPrice.toLocaleString()}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {purchase.status === 'pending' && (
        <div className="grid gap-6 sm:grid-cols-2">
          <div className="rounded-2xl border border-ink/10 bg-card p-6">
            <h2 className="font-display text-base font-semibold text-ink">Mark as bought</h2>
            <input
              value={receiptRef}
              onChange={(e) => setReceiptRef(e.target.value)}
              placeholder="Receipt / reference number"
              className="mt-3 w-full rounded-xl border border-ink/15 bg-parchment px-3 py-2 font-body text-sm text-ink outline-none focus:border-teal"
            />
            <button
              onClick={handleMarkPurchased}
              disabled={busy || !receiptRef.trim()}
              className="mt-3 inline-flex items-center gap-2 rounded-full bg-ink px-4 py-2 font-body text-sm font-semibold text-parchment disabled:opacity-40"
            >
              <CheckCircle2 size={14} /> Mark bought
            </button>
          </div>

          <div className="rounded-2xl border border-rose-200 bg-rose-50/40 p-6">
            <h2 className="font-display text-base font-semibold text-ink">Mark as failed</h2>
            <textarea
              value={failReason}
              onChange={(e) => setFailReason(e.target.value)}
              placeholder="Reason (required) — customer and ops both need a record of why"
              rows={2}
              className="mt-3 w-full resize-none rounded-xl border border-ink/15 bg-white px-3 py-2 font-body text-sm text-ink outline-none focus:border-rose-400"
            />
            <button
              onClick={handleMarkFailed}
              disabled={busy || !failReason.trim()}
              className="mt-3 inline-flex items-center gap-2 rounded-full bg-rose-600 px-4 py-2 font-body text-sm font-semibold text-white disabled:opacity-40"
            >
              <XCircle size={14} /> Mark failed
            </button>
          </div>
        </div>
      )}

      {purchase.status === 'failed' && purchase.failReason && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50/40 p-6">
          <h2 className="font-display text-base font-semibold text-rose-700">Failure reason</h2>
          <p className="mt-2 font-body text-sm text-rose-700/80">{purchase.failReason}</p>
        </div>
      )}

      <div className="rounded-2xl border border-ink/10 bg-card p-6">
        <h2 className="font-display text-base font-semibold text-ink">Outbound payment to supplier</h2>
        <p className="mt-1 font-body text-xs text-ink/40">
          What WishDrop paid the source store — kept distinct from anything customer-payment-related.
        </p>
        {purchase.outboundPayment ? (
          <div className="mt-3 rounded-xl bg-parchment/60 p-4 font-body text-sm text-ink/70">
            Rs. {purchase.outboundPayment.amount.toLocaleString()} via {purchase.outboundPayment.method}
            {purchase.outboundPayment.reference && ` (${purchase.outboundPayment.reference})`}
            <span className="ml-2 text-xs text-ink/40">{new Date(purchase.outboundPayment.at).toLocaleString()}</span>
          </div>
        ) : (
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <input value={payAmount} onChange={(e) => setPayAmount(e.target.value)} type="number" placeholder="Amount" className="rounded-xl border border-ink/15 bg-parchment px-3 py-2 font-body text-sm text-ink outline-none focus:border-teal" />
            <input value={payMethod} onChange={(e) => setPayMethod(e.target.value)} placeholder="Method (e.g. bank transfer)" className="rounded-xl border border-ink/15 bg-parchment px-3 py-2 font-body text-sm text-ink outline-none focus:border-teal" />
            <input value={payRef} onChange={(e) => setPayRef(e.target.value)} placeholder="Reference (optional)" className="rounded-xl border border-ink/15 bg-parchment px-3 py-2 font-body text-sm text-ink outline-none focus:border-teal" />
            <button
              onClick={handleRecordPayment}
              disabled={busy || !payAmount || !payMethod.trim()}
              className="sm:col-span-3 inline-flex w-fit items-center gap-2 rounded-full border border-ink/15 px-4 py-2 font-body text-sm font-semibold text-ink disabled:opacity-40"
            >
              Record payment
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
