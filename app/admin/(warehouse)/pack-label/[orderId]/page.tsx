'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Printer, Tag } from 'lucide-react'
import { useAdminData } from '@/contexts/AdminDataContext'
import {
  fetchAdminOrder,
  fetchOrderPackageDetails,
  setOrderPackageDetails,
  setWarehouseSubstage,
  type AdminOrder,
} from '@/lib/supabase/orders-admin'

export default function PackLabelDetailPage() {
  const params = useParams<{ orderId: string }>()
  const router = useRouter()
  const { currentUser } = useAdminData()

  const [order, setOrder] = useState<AdminOrder | null>(null)
  const [loading, setLoading] = useState(true)
  const [weight, setWeight] = useState('')
  const [length, setLength] = useState('')
  const [width, setWidth] = useState('')
  const [height, setHeight] = useState('')
  const [labelRef, setLabelRef] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const o = await fetchAdminOrder(params.orderId)
    setOrder(o)
    if (o) {
      const details = await fetchOrderPackageDetails(o.id)
      if (details) {
        setWeight(details.weightKg?.toString() ?? '')
        setLength(details.lengthCm?.toString() ?? '')
        setWidth(details.widthCm?.toString() ?? '')
        setHeight(details.heightCm?.toString() ?? '')
        setLabelRef(details.labelRef ?? null)
      }
    }
    setLoading(false)
  }, [params.orderId])

  useEffect(() => {
    load()
  }, [load])

  async function handleGenerateLabel() {
    if (!order) return
    setBusy(true)
    const ref = `LBL-${order.displayId}-${Date.now().toString(36).toUpperCase()}`
    await setOrderPackageDetails(order.id, currentUser.id, {
      weightKg: weight ? Number(weight) : undefined,
      lengthCm: length ? Number(length) : undefined,
      widthCm: width ? Number(width) : undefined,
      heightCm: height ? Number(height) : undefined,
      labelRef: ref,
    })
    setLabelRef(ref)
    setBusy(false)
  }

  async function handleMarkPacked() {
    if (!order) return
    setBusy(true)
    const res = await setWarehouseSubstage(order.id, 'packed', currentUser.id, 'Packed & labeled')
    setBusy(false)
    if (res.ok) router.push('/admin/pack-label')
    else alert(res.error ?? 'Could not advance stage')
  }

  if (loading) return <div className="h-64 animate-pulse rounded-2xl border border-ink/10 bg-card/60" />

  if (!order) {
    return (
      <div className="rounded-2xl border border-dashed border-ink/15 bg-card px-8 py-16 text-center">
        <p className="font-body text-sm text-ink/50">Order not found.</p>
        <Link href="/admin/pack-label" className="mt-3 inline-block font-body text-sm text-teal-deep underline">
          Back to Pack & Label
        </Link>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <button onClick={() => router.push('/admin/pack-label')} className="inline-flex w-fit items-center gap-1.5 font-body text-sm text-ink/50 hover:text-ink">
        <ArrowLeft size={14} /> Back to Pack & Label
      </button>

      <div className="rounded-2xl border border-ink/10 bg-card p-6">
        <h1 className="font-mono text-lg font-semibold text-ink">{order.displayId}</h1>
        <p className="mt-1 font-body text-sm text-ink/60">{order.customerName}</p>
        {order.recipient && (
          <p className="mt-3 rounded-xl bg-parchment/60 p-3 font-body text-sm text-ink/70">
            Ship to: {order.recipient.name} — {order.recipient.city}, {order.recipient.country}
          </p>
        )}
      </div>

      <div className="rounded-2xl border border-ink/10 bg-card p-6">
        <h2 className="font-display text-base font-semibold text-ink">Order contents</h2>
        <div className="mt-3 flex flex-col divide-y divide-ink/10">
          {order.items.map((item) => (
            <div key={item.id} className="flex items-center justify-between py-2.5">
              <p className="font-body text-sm text-ink/75">{item.title}</p>
              <p className="font-body text-xs text-ink/45">Qty: {item.quantity}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-ink/10 bg-card p-6">
        <h2 className="font-display text-base font-semibold text-ink">Package details</h2>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <label className="flex flex-col gap-1">
            <span className="font-body text-xs text-ink/50">Weight (kg)</span>
            <input value={weight} onChange={(e) => setWeight(e.target.value)} type="number" step="0.01" className="rounded-lg border border-ink/15 bg-parchment px-2.5 py-1.5 font-body text-sm text-ink outline-none focus:border-teal" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-body text-xs text-ink/50">Length (cm)</span>
            <input value={length} onChange={(e) => setLength(e.target.value)} type="number" className="rounded-lg border border-ink/15 bg-parchment px-2.5 py-1.5 font-body text-sm text-ink outline-none focus:border-teal" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-body text-xs text-ink/50">Width (cm)</span>
            <input value={width} onChange={(e) => setWidth(e.target.value)} type="number" className="rounded-lg border border-ink/15 bg-parchment px-2.5 py-1.5 font-body text-sm text-ink outline-none focus:border-teal" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-body text-xs text-ink/50">Height (cm)</span>
            <input value={height} onChange={(e) => setHeight(e.target.value)} type="number" className="rounded-lg border border-ink/15 bg-parchment px-2.5 py-1.5 font-body text-sm text-ink outline-none focus:border-teal" />
          </label>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button
            onClick={handleGenerateLabel}
            disabled={busy || !weight}
            className="inline-flex items-center gap-2 rounded-full border border-ink/15 px-4 py-2 font-body text-sm font-semibold text-ink disabled:opacity-40"
          >
            <Tag size={14} /> {labelRef ? 'Regenerate label' : 'Generate label'}
          </button>
          {labelRef && (
            <span className="inline-flex items-center gap-1.5 font-body text-xs font-semibold text-teal-deep">
              <Printer size={13} /> {labelRef}
            </span>
          )}
        </div>

        <button
          onClick={handleMarkPacked}
          disabled={busy || !labelRef}
          className="mt-6 inline-flex items-center gap-2 rounded-full bg-ink px-5 py-2.5 font-body text-sm font-semibold text-parchment disabled:opacity-40"
        >
          Mark packed — send to Export Bin
        </button>
      </div>
    </div>
  )
}
