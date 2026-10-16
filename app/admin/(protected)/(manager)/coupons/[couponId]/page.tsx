// app/admin/(protected)/(manager)/coupons/[couponId]/page.tsx
//
// One coupon: its rules, the shareable signed code (for everyone / new
// customer campaigns), every customer who has it (and how they got it),
// and every time it was used — with the order numbers and the discount
// given. Staff can pause / resume / archive it, change the end date, give
// it to more customers, take it back from someone, or give a use back
// (e.g. the order was cancelled).
'use client'

import { use, useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Check, Copy, Loader2, Ticket, UserPlus } from 'lucide-react'
import { useCurrentStaff } from '@/hooks/useCurrentStaff'
import { couponState } from '@/components/admin/coupon-state'
import CouponDesigner from '@/components/admin/CouponDesigner'
import { normalizeDesign, type CouponDesign } from '@/lib/coupons/design'
import CustomerPicker, { adminInputClass as inputClass, type PickedCustomer } from '@/components/admin/CustomerPicker'

type Detail = {
  coupon: {
    id: string
    title: string
    description: string | null
    label: string
    discount_type: 'percent' | 'fixed'
    discount_value: number
    max_discount_lkr: number | null
    design: CouponDesign
    min_order_lkr: number
    store_scope: 'all' | 'stores'
    store_slugs: string[]
    audience: 'everyone' | 'new_customers' | 'selected'
    per_user_limit: number
    total_limit: number | null
    starts_at: string
    ends_at: string | null
    status: 'active' | 'paused' | 'archived'
    source: string
    created_by_name: string | null
    created_at: string
  }
  shareToken: string | null
  allocations: {
    id: string
    userId: string
    name: string
    email: string | null
    via: string
    allocatedAt: string
    allocatedBy: string | null
    revokedAt: string | null
    timesUsed: number
  }[]
  redemptions: {
    id: string
    userId: string
    name: string
    email: string | null
    amountLKR: number
    status: 'redeemed' | 'voided'
    redeemedAt: string
    voidedAt: string | null
    voidReason: string | null
    orders: string[]
  }[]
}

const nf = new Intl.NumberFormat('en-LK')
const dtf = new Intl.DateTimeFormat('en-LK', { dateStyle: 'medium', timeStyle: 'short' })

const VIA: Record<string, string> = {
  admin: 'Given by staff',
  claimed: 'Added it / used it',
  referral: 'Referral',
  compensation: 'QC credit',
  refund: 'Refund credit',
  migrated: 'Old coupon',
}

const AUDIENCE: Record<Detail['coupon']['audience'], string> = {
  everyone: 'Everyone',
  new_customers: 'New customers (first order)',
  selected: 'Chosen customers only',
}

function toLocalInput(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false)
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text)
          setDone(true)
          setTimeout(() => setDone(false), 1800)
        } catch {
          /* blocked */
        }
      }}
      className="inline-flex items-center gap-1.5 rounded-lg border border-ink/15 px-3 py-1.5 text-xs font-semibold hover:bg-ink/[0.04]"
    >
      {done ? <Check size={13} className="text-teal-deep" /> : <Copy size={13} />} {done ? 'Copied' : label}
    </button>
  )
}

export default function CouponDetailPage({ params }: { params: Promise<{ couponId: string }> }) {
  const { couponId } = use(params)
  const { staff, loading: staffLoading } = useCurrentStaff()
  const allowed = staff?.role === 'manager' || staff?.role === 'super_admin'

  const [data, setData] = useState<Detail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [endsAt, setEndsAt] = useState('')
  const [adding, setAdding] = useState<PickedCustomer[]>([])
  const [tab, setTab] = useState<'used' | 'has'>('used')
  const [design, setDesign] = useState<CouponDesign | null>(null)
  const [designOpen, setDesignOpen] = useState(false)

  const load = useCallback(async () => {
    const res = await fetch(`/api/admin/coupons/${couponId}`)
    const body = await res.json().catch(() => ({}))
    if (!res.ok) setError(body.error ?? 'Couldn’t load this coupon.')
    else {
      setData(body)
      setEndsAt(toLocalInput(body.coupon.ends_at))
      setDesign(normalizeDesign(body.coupon.design))
    }
  }, [couponId])

  useEffect(() => {
    if (allowed) load()
  }, [allowed, load])

  const patch = async (key: string, payload: Record<string, unknown>, done: string) => {
    setBusy(key)
    setNotice(null)
    const res = await fetch(`/api/admin/coupons/${couponId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const body = await res.json().catch(() => ({}))
    setBusy(null)
    setNotice(res.ok ? done : body.error ?? 'Something went wrong.')
    if (res.ok) load()
  }

  const allocations = async (method: 'POST' | 'DELETE', payload: Record<string, unknown>, done: string) => {
    setBusy(method)
    setNotice(null)
    const res = await fetch(`/api/admin/coupons/${couponId}/allocations`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const body = await res.json().catch(() => ({}))
    setBusy(null)
    setNotice(res.ok ? done : body.error ?? 'Something went wrong.')
    if (res.ok) {
      setAdding([])
      load()
    }
  }

  if (staffLoading || (allowed && !data && !error)) {
    return (
      <div className="flex h-full items-center justify-center bg-parchment">
        <Loader2 className="animate-spin text-ink/30" />
      </div>
    )
  }
  if (!allowed || error || !data) {
    return (
      <div className="h-full overflow-y-auto bg-parchment font-body text-ink">
        <div className="mx-auto max-w-2xl px-6 pt-16 lg:px-10">
          <h1 className="font-display text-3xl">Coupon</h1>
          <p className="mt-2 text-sm text-ink/60">{!allowed ? 'Only managers can manage coupons.' : error}</p>
          <Link href="/admin/coupons" className="mt-4 inline-block text-sm font-semibold text-teal-deep hover:underline">
            Back to coupons
          </Link>
        </div>
      </div>
    )
  }

  const c = data.coupon
  const st = couponState(c)
  const used = data.redemptions.filter((r) => r.status === 'redeemed')
  const given = used.reduce((t, r) => t + r.amountLKR, 0)
  const shareLink =
    data.shareToken && typeof window !== 'undefined'
      ? `${window.location.origin}/account/coupons?add=${encodeURIComponent(data.shareToken)}`
      : null

  return (
    <div className="h-full overflow-y-auto bg-parchment font-body text-ink">
      <div className="mx-auto max-w-6xl px-6 pb-24 pt-8 lg:px-10">
        <Link href="/admin/coupons" className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink/55 hover:text-ink">
          <ArrowLeft size={15} /> Coupons
        </Link>

        <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <span className="grid size-11 flex-none place-items-center rounded-full bg-indigo text-parchment">
              <Ticket size={19} />
            </span>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="font-display text-3xl leading-tight">{c.title}</h1>
                <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${st.className}`}>{st.label}</span>
              </div>
              <p className="mt-0.5 text-sm text-ink/60">
                {c.label}
                {c.min_order_lkr > 0 ? ` on Rs. ${nf.format(c.min_order_lkr)}+` : ''} · {AUDIENCE[c.audience]}
              </p>
              {c.description && <p className="mt-1 text-sm text-ink/55">{c.description}</p>}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {c.status === 'active' ? (
              <button
                type="button"
                disabled={!!busy}
                onClick={() => patch('status', { status: 'paused' }, 'Paused. Customers can’t use it until you resume.')}
                className="rounded-xl border border-ink/15 px-4 py-2 text-sm font-semibold hover:bg-ink/[0.04] disabled:opacity-50"
              >
                Pause
              </button>
            ) : (
              <button
                type="button"
                disabled={!!busy}
                onClick={() => patch('status', { status: 'active' }, 'Active again.')}
                className="rounded-xl bg-teal-deep px-4 py-2 text-sm font-semibold text-white hover:bg-indigo disabled:opacity-50"
              >
                {c.status === 'archived' ? 'Restore' : 'Resume'}
              </button>
            )}
            {c.status !== 'archived' && (
              <button
                type="button"
                disabled={!!busy}
                onClick={() => {
                  if (window.confirm('Archive this coupon? It disappears from customers’ accounts.')) {
                    patch('status', { status: 'archived' }, 'Archived.')
                  }
                }}
                className="rounded-xl border border-ink/15 px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
              >
                Archive
              </button>
            )}
          </div>
        </div>

        {notice && <p className="mt-4 rounded-xl bg-card px-4 py-3 text-sm ring-1 ring-ink/10">{notice}</p>}

        {/* Stats */}
        <div className="mt-6 grid gap-3 sm:grid-cols-4">
          {[
            ['Customers who have it', nf.format(data.allocations.filter((a) => !a.revokedAt).length)],
            ['Times used', `${nf.format(used.length)}${c.total_limit ? ` of ${nf.format(c.total_limit)}` : ''}`],
            ['Discount given', `Rs. ${nf.format(Math.round(given))}`],
            ['Uses per customer', nf.format(c.per_user_limit)],
          ].map(([label, value]) => (
            <div key={label} className="rounded-2xl border border-ink/10 bg-card p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-ink/50">{label}</p>
              <p className="mt-1 font-display text-2xl">{value}</p>
            </div>
          ))}
        </div>

        {/* Card design */}
        <section className="mt-6 rounded-2xl border border-ink/10 bg-card p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold">Card design</p>
              <p className="text-xs text-ink/55">How this coupon looks in customers’ My coupons and in their bag.</p>
            </div>
            <div className="flex gap-2">
              {designOpen && design && (
                <button
                  type="button"
                  disabled={!!busy}
                  onClick={() => patch('design', { design }, 'Design saved. Customers see the new look straight away.')}
                  className="rounded-xl bg-indigo px-4 py-2 text-sm font-semibold text-parchment hover:bg-indigo-deep disabled:opacity-50"
                >
                  Save design
                </button>
              )}
              <button
                type="button"
                onClick={() => setDesignOpen((v) => !v)}
                className="rounded-xl border border-ink/15 px-4 py-2 text-sm font-semibold hover:bg-ink/[0.04]"
              >
                {designOpen ? 'Close' : 'Edit design'}
              </button>
            </div>
          </div>
          {designOpen && design && (
            <div className="mt-4">
              <CouponDesigner
                design={design}
                onChange={setDesign}
                facts={{
                  id: c.id,
                  title: c.title,
                  discountType: c.discount_type,
                  discountValue: Number(c.discount_value),
                  maxDiscountLKR: c.max_discount_lkr == null ? null : Number(c.max_discount_lkr),
                  minOrderLKR: Number(c.min_order_lkr),
                  stores: c.store_scope === 'stores' ? c.store_slugs : null,
                }}
              />
            </div>
          )}
        </section>

        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          {/* Tables */}
          <div className="min-w-0 rounded-2xl border border-ink/10 bg-card">
            <div className="flex gap-1 border-b border-ink/10 p-2">
              {(
                [
                  ['used', `Used (${used.length})`],
                  ['has', `Has it (${data.allocations.length})`],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setTab(key)}
                  className={`rounded-lg px-3.5 py-1.5 text-sm font-semibold ${tab === key ? 'bg-indigo text-parchment' : 'text-ink/60 hover:text-ink'}`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="overflow-x-auto">
              {tab === 'used' ? (
                data.redemptions.length === 0 ? (
                  <p className="p-8 text-center text-sm text-ink/55">Nobody has used this coupon yet.</p>
                ) : (
                  <table className="w-full min-w-[560px] text-sm">
                    <thead className="text-left text-xs font-semibold uppercase tracking-wider text-ink/50">
                      <tr>
                        <th className="px-4 py-3">Customer</th>
                        <th className="px-4 py-3">Order</th>
                        <th className="px-4 py-3 text-right">Discount</th>
                        <th className="px-4 py-3">When</th>
                        <th className="px-4 py-3" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-ink/5">
                      {data.redemptions.map((r) => (
                        <tr key={r.id} className={r.status === 'voided' ? 'text-ink/40' : ''}>
                          <td className="px-4 py-3">
                            <div className="font-semibold">{r.name}</div>
                            <div className="text-xs text-ink/50">{r.email}</div>
                          </td>
                          <td className="px-4 py-3 font-mono text-xs">{r.orders.join(', ') || '—'}</td>
                          <td className="px-4 py-3 text-right tabular-nums">Rs. {nf.format(Math.round(r.amountLKR))}</td>
                          <td className="px-4 py-3 text-xs text-ink/60">
                            {dtf.format(new Date(r.redeemedAt))}
                            {r.status === 'voided' && <div>Given back{r.voidReason ? ` — ${r.voidReason}` : ''}</div>}
                          </td>
                          <td className="px-4 py-3 text-right">
                            {r.status === 'redeemed' && (
                              <button
                                type="button"
                                disabled={!!busy}
                                onClick={() => {
                                  const reason = window.prompt('Give this use back to the customer? Reason (e.g. order cancelled):')
                                  if (reason !== null) {
                                    patch('void', { voidRedemptionId: r.id, reason }, 'Use given back — the customer can use the coupon again.')
                                  }
                                }}
                                className="text-xs font-semibold text-ink/55 hover:text-ink hover:underline"
                              >
                                Give back
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )
              ) : data.allocations.length === 0 ? (
                <p className="p-8 text-center text-sm text-ink/55">
                  {c.audience === 'selected'
                    ? 'Nobody has this coupon yet. Add customers on the right.'
                    : 'Customers appear here when they add the shared code or use the coupon. Everyone already sees it in My coupons.'}
                </p>
              ) : (
                <table className="w-full min-w-[560px] text-sm">
                  <thead className="text-left text-xs font-semibold uppercase tracking-wider text-ink/50">
                    <tr>
                      <th className="px-4 py-3">Customer</th>
                      <th className="px-4 py-3">How</th>
                      <th className="px-4 py-3">When</th>
                      <th className="px-4 py-3 text-right">Used</th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink/5">
                    {data.allocations.map((a) => (
                      <tr key={a.id} className={a.revokedAt ? 'text-ink/40' : ''}>
                        <td className="px-4 py-3">
                          <div className="font-semibold">{a.name}</div>
                          <div className="text-xs text-ink/50">{a.email}</div>
                        </td>
                        <td className="px-4 py-3 text-xs text-ink/60">
                          {VIA[a.via] ?? a.via}
                          {a.allocatedBy && <div>by {a.allocatedBy}</div>}
                        </td>
                        <td className="px-4 py-3 text-xs text-ink/60">
                          {dtf.format(new Date(a.allocatedAt))}
                          {a.revokedAt && <div>Taken back</div>}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">{a.timesUsed}</td>
                        <td className="px-4 py-3 text-right">
                          {!a.revokedAt && a.timesUsed < c.per_user_limit && (
                            <button
                              type="button"
                              disabled={!!busy}
                              onClick={() => {
                                if (window.confirm(`Take this coupon back from ${a.name}?`)) {
                                  allocations('DELETE', { allocationId: a.id }, `Taken back from ${a.name}.`)
                                }
                              }}
                              className="text-xs font-semibold text-red-600 hover:underline"
                            >
                              Take back
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* Side panel */}
          <div className="space-y-4">
            {data.shareToken && (
              <div className="rounded-2xl border border-ink/10 bg-card p-5">
                <p className="text-sm font-semibold">Share this coupon</p>
                <p className="mt-1 text-xs text-ink/55">
                  Signed code — it can’t be edited or guessed. Customers can paste it in My coupons, or open the link to add it.
                </p>
                <p className="mt-3 break-all rounded-xl bg-parchment px-3 py-2 font-mono text-[11px] text-ink/70">{data.shareToken}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <CopyButton text={data.shareToken} label="Copy code" />
                  {shareLink && <CopyButton text={shareLink} label="Copy link" />}
                </div>
              </div>
            )}

            <div className="rounded-2xl border border-ink/10 bg-card p-5">
              <p className="flex items-center gap-2 text-sm font-semibold">
                <UserPlus size={16} /> Give to customers
              </p>
              <p className="mt-1 text-xs text-ink/55">It appears in their My coupons straight away.</p>
              <div className="mt-3">
                <CustomerPicker picked={adding} onChange={setAdding} />
              </div>
              <button
                type="button"
                disabled={!adding.length || !!busy}
                onClick={() => allocations('POST', { userIds: adding.map((a) => a.id) }, `Given to ${adding.length} customer${adding.length === 1 ? '' : 's'}.`)}
                className="mt-3 w-full rounded-xl bg-indigo px-4 py-2.5 text-sm font-semibold text-parchment hover:bg-indigo-deep disabled:opacity-50"
              >
                Give coupon{adding.length ? ` to ${adding.length}` : ''}
              </button>
            </div>

            <div className="rounded-2xl border border-ink/10 bg-card p-5">
              <p className="text-sm font-semibold">Rules</p>
              <dl className="mt-2 space-y-1.5 text-sm">
                <div className="flex justify-between gap-3">
                  <dt className="text-ink/55">Stores</dt>
                  <dd className="text-right">{c.store_scope === 'all' ? 'All stores' : c.store_slugs.join(', ')}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-ink/55">Starts</dt>
                  <dd>{dtf.format(new Date(c.starts_at))}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-ink/55">Created</dt>
                  <dd className="text-right">
                    {dtf.format(new Date(c.created_at))}
                    {c.created_by_name ? ` · ${c.created_by_name}` : ''}
                  </dd>
                </div>
              </dl>
              <label className="mt-4 block">
                <span className="text-xs font-semibold text-ink/55">Ends</span>
                <div className="mt-1 flex gap-2">
                  <input type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} className={inputClass} />
                  <button
                    type="button"
                    disabled={!!busy}
                    onClick={() => patch('ends', { endsAt: endsAt ? new Date(endsAt).toISOString() : null }, 'End date saved.')}
                    className="flex-none rounded-xl border border-ink/15 px-3 text-sm font-semibold hover:bg-ink/[0.04] disabled:opacity-50"
                  >
                    Save
                  </button>
                </div>
              </label>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
