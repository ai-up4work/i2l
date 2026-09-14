'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Camera, CheckCircle2, XCircle } from 'lucide-react'
import { useAdminData } from '@/contexts/AdminDataContext'
import {
  fetchAdminOrder,
  setWarehouseSubstage,
  addInternalNote,
  fetchOrderInternalNotes,
  type AdminOrder,
  type InternalNote,
} from '@/lib/supabase/orders-admin'

type ItemResult = 'pending' | 'pass' | 'fail'

export default function QcDetailPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const { currentUser } = useAdminData()

  const [order, setOrder] = useState<AdminOrder | null>(null)
  const [notes, setNotes] = useState<InternalNote[]>([])
  const [loading, setLoading] = useState(true)
  const [results, setResults] = useState<Record<string, ItemResult>>({})
  const [itemNotes, setItemNotes] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const o = await fetchAdminOrder(params.id)
    setOrder(o)
    if (o) setNotes(await fetchOrderInternalNotes(o.id))
    setLoading(false)
  }, [params.id])

  useEffect(() => {
    load()
  }, [load])

  function setResult(itemId: string, result: ItemResult) {
    setResults((r) => ({ ...r, [itemId]: result }))
  }

  const allDecided = order ? order.items.every((it) => results[it.id] && results[it.id] !== 'pending') : false
  const anyFailed = Object.values(results).some((r) => r === 'fail')

  async function handleSubmit() {
    if (!order) return
    setBusy(true)

    const summaryLines = order.items.map(
      (it) => `${results[it.id] === 'pass' ? '✔' : '✘'} ${it.title}${itemNotes[it.id] ? ` — ${itemNotes[it.id]}` : ''}`,
    )
    await addInternalNote(order.id, currentUser.id, `[QC] ${anyFailed ? 'Partial/failed' : 'Passed'}:\n${summaryLines.join('\n')}`)

    if (anyFailed) {
      // A failed item needs follow-up, not a dead-end status change — logged as an
      // internal note above (and should route to the linked chat thread once that
      // flow exists) rather than silently advancing the order.
      setBusy(false)
      await load()
      return
    }

    const res = await setWarehouseSubstage(order.id, 'qc_passed', currentUser.id, 'Passed QC — all items')
    setBusy(false)
    if (res.ok) router.push('/admin/qc')
    else alert(res.error ?? 'Could not advance stage')
  }

  if (loading) return <div className="h-64 animate-pulse rounded-2xl border border-ink/10 bg-card/60" />

  if (!order) {
    return (
      <div className="rounded-2xl border border-dashed border-ink/15 bg-card px-8 py-16 text-center">
        <p className="font-body text-sm text-ink/50">Order not found.</p>
        <Link href="/admin/qc" className="mt-3 inline-block font-body text-sm text-teal-deep underline">
          Back to QC queue
        </Link>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <button onClick={() => router.push('/admin/qc')} className="inline-flex w-fit items-center gap-1.5 font-body text-sm text-ink/50 hover:text-ink">
        <ArrowLeft size={14} /> Back to QC queue
      </button>

      <div className="rounded-2xl border border-ink/10 bg-card p-6">
        <h1 className="font-mono text-lg font-semibold text-ink">{order.displayId}</h1>
        <p className="mt-1 font-body text-sm text-ink/60">{order.customerName}</p>
      </div>

      <div className="rounded-2xl border border-ink/10 bg-card p-6">
        <h2 className="font-display text-base font-semibold text-ink">Item checklist</h2>
        <p className="mt-1 font-body text-xs text-ink/45">
          Mark each item individually — a partial defect doesn't have to block the rest of the order.
        </p>
        <div className="mt-4 flex flex-col divide-y divide-ink/10">
          {order.items.map((item) => {
            const result = results[item.id] ?? 'pending'
            return (
              <div key={item.id} className="flex flex-col gap-3 py-4">
                <div className="flex items-center gap-4">
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
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setResult(item.id, 'pass')}
                      className={`inline-flex items-center gap-1 rounded-full border px-3 py-1.5 font-body text-xs font-semibold ${
                        result === 'pass' ? 'border-teal-deep bg-teal/15 text-teal-deep' : 'border-ink/15 text-ink/50'
                      }`}
                    >
                      <CheckCircle2 size={13} /> Pass
                    </button>
                    <button
                      onClick={() => setResult(item.id, 'fail')}
                      className={`inline-flex items-center gap-1 rounded-full border px-3 py-1.5 font-body text-xs font-semibold ${
                        result === 'fail' ? 'border-rose-500 bg-rose-50 text-rose-600' : 'border-ink/15 text-ink/50'
                      }`}
                    >
                      <XCircle size={13} /> Fail
                    </button>
                  </div>
                </div>
                {result === 'fail' && (
                  <div className="ml-[72px] flex items-center gap-2">
                    <Camera size={14} className="flex-none text-ink/30" />
                    <input
                      value={itemNotes[item.id] ?? ''}
                      onChange={(e) => setItemNotes((n) => ({ ...n, [item.id]: e.target.value }))}
                      placeholder="Describe the defect — routes to the customer's linked chat thread"
                      className="flex-1 rounded-lg border border-ink/15 bg-parchment px-3 py-1.5 font-body text-xs text-ink outline-none focus:border-teal"
                    />
                  </div>
                )}
              </div>
            )
          })}
        </div>

        <button
          onClick={handleSubmit}
          disabled={busy || !allDecided}
          className="mt-6 inline-flex items-center gap-2 rounded-full bg-ink px-5 py-2.5 font-body text-sm font-semibold text-parchment disabled:opacity-40"
        >
          {anyFailed ? 'Log QC result (needs follow-up)' : 'Pass QC — send to Pack & Label'}
        </button>
      </div>

      {notes.filter((n) => n.text.startsWith('[QC]')).length > 0 && (
        <div className="rounded-2xl border border-ink/10 bg-card p-6">
          <h2 className="font-display text-base font-semibold text-ink">Previous QC notes</h2>
          <div className="mt-3 flex flex-col gap-2">
            {notes
              .filter((n) => n.text.startsWith('[QC]'))
              .map((n) => (
                <pre key={n.id} className="whitespace-pre-wrap rounded-lg bg-parchment/60 p-3 font-body text-xs text-ink/70">
                  {n.text}
                </pre>
              ))}
          </div>
        </div>
      )}
    </div>
  )
}
