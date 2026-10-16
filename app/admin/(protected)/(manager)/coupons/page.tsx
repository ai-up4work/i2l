// app/admin/(protected)/(manager)/coupons/page.tsx
//
// Admin → Coupons. Create coupons for everyone, new customers or chosen
// customers, optionally limited to certain stores, and see at a glance how
// many people have each one and how many have used it. Click a coupon for
// the full list of who has it and who used it (./[couponId]).
//
// Manager and Super Admin only (enforced again by /api/admin/coupons).
// Codes are signed on the server (lib/coupons/token.ts) — staff never type
// or see a guessable code.
'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ChevronRight, Loader2, Plus, Search, Ticket, X } from 'lucide-react'
import { useCurrentStaff } from '@/hooks/useCurrentStaff'
import { couponState } from '@/components/admin/coupon-state'
import CouponDesigner from '@/components/admin/CouponDesigner'
import { DEFAULT_COUPON_DESIGN, type CouponDesign } from '@/lib/coupons/design'
import CustomerPicker, { adminInputClass as inputClass, type PickedCustomer } from '@/components/admin/CustomerPicker'

type Audience = 'everyone' | 'new_customers' | 'selected'

type CouponListRow = {
  id: string
  title: string
  label: string
  audience: Audience
  store_scope: 'all' | 'stores'
  store_slugs: string[]
  per_user_limit: number
  total_limit: number | null
  starts_at: string
  ends_at: string | null
  status: 'active' | 'paused' | 'archived'
  source: 'admin' | 'referral' | 'compensation' | 'migrated' | 'refund'
  created_by_name: string | null
  created_at: string
  allocatedCount: number
  redeemedCount: number
  discountGivenLKR: number
}

type StoreOption = { slug: string; name: string; kind: 'store' | 'marketplace' }

const AUDIENCE_LABEL: Record<Audience, string> = {
  everyone: 'Everyone',
  new_customers: 'New customers',
  selected: 'Chosen customers',
}

const SOURCE_LABEL: Record<CouponListRow['source'], string> = {
  admin: 'Campaign',
  referral: 'Referral',
  compensation: 'QC credit',
  refund: 'Refund credit',
  migrated: 'Old coupon',
}

const nf = new Intl.NumberFormat('en-LK')
const df = new Intl.DateTimeFormat('en-LK', { dateStyle: 'medium' })

function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// ---------------------------------------------------------------------------
// Create form
// ---------------------------------------------------------------------------

function Choice<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T
  options: { key: T; label: string; hint?: string }[]
  onChange: (v: T) => void
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-3">
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          aria-pressed={value === o.key}
          onClick={() => onChange(o.key)}
          className={`rounded-xl border px-3.5 py-2.5 text-left transition-colors ${
            value === o.key ? 'border-teal bg-teal/[0.06]' : 'border-ink/15 hover:border-ink/30'
          }`}
        >
          <span className="block text-sm font-semibold">{o.label}</span>
          {o.hint && <span className="mt-0.5 block text-xs text-ink/55">{o.hint}</span>}
        </button>
      ))}
    </div>
  )
}

function Label({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <div className="mb-1.5">
      <span className="text-sm font-semibold">{children}</span>
      {hint && <span className="ml-2 text-xs text-ink/50">{hint}</span>}
    </div>
  )
}

function StorePicker({ selected, onChange }: { selected: string[]; onChange: (s: string[]) => void }) {
  const [stores, setStores] = useState<StoreOption[] | null>(null)
  const [q, setQ] = useState('')
  useEffect(() => {
    fetch('/api/admin/coupons/stores')
      .then((r) => r.json())
      .then((b) => setStores(b.stores ?? []))
      .catch(() => setStores([]))
  }, [])
  const filtered = (stores ?? []).filter((s) => !q.trim() || s.name.toLowerCase().includes(q.trim().toLowerCase()))
  const toggle = (slug: string) => onChange(selected.includes(slug) ? selected.filter((s) => s !== slug) : [...selected, slug])
  return (
    <div className="rounded-xl border border-ink/10 p-3">
      <div className="relative">
        <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink/35" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a store" className={`${inputClass} pl-9`} />
      </div>
      <div className="mt-3 flex max-h-48 flex-wrap gap-1.5 overflow-y-auto">
        {!stores && <Loader2 size={16} className="animate-spin text-ink/35" />}
        {filtered.map((s) => {
          const on = selected.includes(s.slug)
          return (
            <button
              key={s.slug}
              type="button"
              onClick={() => toggle(s.slug)}
              className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
                on ? 'border-teal bg-teal text-white' : 'border-ink/15 text-ink/70 hover:border-ink/30'
              }`}
            >
              {s.name}
              {s.kind === 'marketplace' && <span className={`ml-1 font-normal ${on ? 'text-white/70' : 'text-ink/40'}`}>link</span>}
            </button>
          )
        })}
      </div>
      <p className="mt-2 text-xs text-ink/50">
        “link” = items customers paste from that site. {selected.length ? `${selected.length} selected.` : ''}
      </p>
    </div>
  )
}

function CreateCoupon({ onCancel }: { onCancel: () => void }) {
  const router = useRouter()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [discountType, setDiscountType] = useState<'percent' | 'fixed'>('fixed')
  const [value, setValue] = useState('')
  const [cap, setCap] = useState('')
  const [minOrder, setMinOrder] = useState('')
  const [audience, setAudience] = useState<Audience>('everyone')
  const [customers, setCustomers] = useState<PickedCustomer[]>([])
  const [storeScope, setStoreScope] = useState<'all' | 'stores'>('all')
  const [stores, setStores] = useState<string[]>([])
  const [perUser, setPerUser] = useState('1')
  const [totalLimit, setTotalLimit] = useState('')
  const [startsAt, setStartsAt] = useState(() => toLocalInput(new Date()))
  const [endsAt, setEndsAt] = useState(() => toLocalInput(new Date(Date.now() + 30 * 86_400_000)))
  const [design, setDesign] = useState<CouponDesign>(DEFAULT_COUPON_DESIGN)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const summary = useMemo(() => {
    const v = Number(value)
    if (!v) return null
    const amount = discountType === 'percent' ? `${v}% off${cap ? ` (max Rs. ${nf.format(Number(cap))})` : ''}` : `Rs. ${nf.format(v)} off`
    const who =
      audience === 'everyone'
        ? 'any customer'
        : audience === 'new_customers'
          ? 'customers placing their first order'
          : `${customers.length || 'no'} chosen customer${customers.length === 1 ? '' : 's'}`
    const where = storeScope === 'all' ? 'any store' : `${stores.length} store${stores.length === 1 ? '' : 's'}`
    const min = Number(minOrder) ? ` on orders of Rs. ${nf.format(Number(minOrder))}+` : ''
    return `${amount}${min} for ${who}, on ${where}, ${perUser === '1' ? 'once each' : `up to ${perUser} times each`}${
      totalLimit ? `, ${totalLimit} uses in total` : ''
    }.`
  }, [value, discountType, cap, audience, customers.length, storeScope, stores.length, minOrder, perUser, totalLimit])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError(null)
    const res = await fetch('/api/admin/coupons', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title,
        description,
        discountType,
        discountValue: Number(value),
        maxDiscountLKR: cap ? Number(cap) : null,
        minOrderLKR: minOrder ? Number(minOrder) : 0,
        audience,
        userIds: audience === 'selected' ? customers.map((c) => c.id) : [],
        storeScope,
        storeSlugs: stores,
        perUserLimit: Number(perUser) || 1,
        totalLimit: totalLimit ? Number(totalLimit) : null,
        startsAt: startsAt ? new Date(startsAt).toISOString() : null,
        endsAt: endsAt ? new Date(endsAt).toISOString() : null,
        design,
      }),
    })
    const body = await res.json().catch(() => ({}))
    setSaving(false)
    if (!res.ok) {
      setError(body.error ?? 'Couldn’t create the coupon.')
      return
    }
    router.push(`/admin/coupons/${body.coupon.id}`)
  }

  return (
    <form onSubmit={submit} className="mt-6 space-y-6 rounded-2xl border border-ink/10 bg-card p-6 sm:p-8">
      <div className="flex items-start justify-between gap-4">
        <h2 className="font-display text-2xl">New coupon</h2>
        <button type="button" onClick={onCancel} aria-label="Close" className="rounded-full p-1.5 text-ink/50 hover:bg-ink/5 hover:text-ink">
          <X size={18} />
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label hint="Customers see this">Name</Label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Avurudu sale" className={inputClass} />
        </div>
        <div>
          <Label hint="Optional">Short description</Label>
          <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Celebrate with Rs. 1,000 off" className={inputClass} />
        </div>
      </div>

      <div>
        <Label hint="Applies to product price only, never service or delivery">Discount</Label>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-xl border border-ink/15 p-1">
            {(['fixed', 'percent'] as const).map((t) => (
              <button
                key={t}
                type="button"
                aria-pressed={discountType === t}
                onClick={() => setDiscountType(t)}
                className={`rounded-lg px-4 py-1.5 text-sm font-semibold transition-colors ${
                  discountType === t ? 'bg-indigo text-parchment' : 'text-ink/60 hover:text-ink'
                }`}
              >
                {t === 'fixed' ? 'Rs. amount' : 'Percentage'}
              </button>
            ))}
          </div>
          <input
            value={value}
            onChange={(e) => setValue(e.target.value.replace(/[^\d.]/g, ''))}
            inputMode="decimal"
            placeholder={discountType === 'fixed' ? '1000' : '10'}
            className={`${inputClass} w-32`}
          />
          {discountType === 'percent' && (
            <input
              value={cap}
              onChange={(e) => setCap(e.target.value.replace(/\D/g, ''))}
              inputMode="numeric"
              placeholder="Max Rs. (optional)"
              className={`${inputClass} w-44`}
            />
          )}
        </div>
      </div>

      <div className="max-w-xs">
        <Label hint="Of eligible items, optional">Minimum order (Rs.)</Label>
        <input value={minOrder} onChange={(e) => setMinOrder(e.target.value.replace(/\D/g, ''))} inputMode="numeric" placeholder="0" className={inputClass} />
      </div>

      <div>
        <Label>Who can use it</Label>
        <Choice
          value={audience}
          onChange={setAudience}
          options={[
            { key: 'everyone', label: 'Everyone', hint: 'Shows in every customer’s My coupons' },
            { key: 'new_customers', label: 'New customers', hint: 'Only for a first order' },
            { key: 'selected', label: 'Chosen customers', hint: 'Only the people you pick' },
          ]}
        />
        {audience === 'selected' && (
          <div className="mt-3">
            <CustomerPicker picked={customers} onChange={setCustomers} />
          </div>
        )}
      </div>

      <div>
        <Label>Which stores</Label>
        <Choice
          value={storeScope}
          onChange={setStoreScope}
          options={[
            { key: 'all', label: 'All stores' },
            { key: 'stores', label: 'Only some stores', hint: 'Discount applies to their items only' },
          ]}
        />
        {storeScope === 'stores' && (
          <div className="mt-3">
            <StorePicker selected={stores} onChange={setStores} />
          </div>
        )}
      </div>

      <div>
        <Label hint="How the coupon card looks in My coupons and the cart">Card design</Label>
        <CouponDesigner
          design={design}
          onChange={setDesign}
          facts={{
            id: 'preview',
            title: title || 'Coupon name',
            discountType,
            discountValue: Number(value) || (discountType === 'percent' ? 10 : 1000),
            maxDiscountLKR: discountType === 'percent' && cap ? Number(cap) : null,
            minOrderLKR: Number(minOrder) || 0,
            stores: storeScope === 'stores' ? stores : null,
          }}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <Label>Uses per customer</Label>
          <input value={perUser} onChange={(e) => setPerUser(e.target.value.replace(/\D/g, ''))} inputMode="numeric" className={inputClass} />
        </div>
        <div>
          <Label hint="Optional">Total uses</Label>
          <input value={totalLimit} onChange={(e) => setTotalLimit(e.target.value.replace(/\D/g, ''))} inputMode="numeric" placeholder="No limit" className={inputClass} />
        </div>
        <div>
          <Label>Starts</Label>
          <input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} className={inputClass} />
        </div>
        <div>
          <Label hint="Optional">Ends</Label>
          <input type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} className={inputClass} />
        </div>
      </div>

      {summary && (
        <p className="rounded-xl bg-parchment px-4 py-3 text-sm">
          <span className="font-semibold">Summary: </span>
          <span className="text-ink/70">{summary}</span>
        </p>
      )}
      {error && <p className="text-sm font-semibold text-red-600">{error}</p>}

      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="rounded-xl border border-ink/15 px-5 py-2.5 text-sm font-semibold hover:bg-ink/[0.04]">
          Cancel
        </button>
        <button
          type="submit"
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-xl bg-indigo px-5 py-2.5 text-sm font-semibold text-parchment hover:bg-indigo-deep disabled:opacity-50"
        >
          {saving && <Loader2 size={15} className="animate-spin" />} Create coupon
        </button>
      </div>
    </form>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function CouponsAdminPage() {
  const { staff, loading: staffLoading } = useCurrentStaff()
  const allowed = staff?.role === 'manager' || staff?.role === 'super_admin'
  const [coupons, setCoupons] = useState<CouponListRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showSystem, setShowSystem] = useState(false)
  const [creating, setCreating] = useState(false)
  const [search, setSearch] = useState('')

  const load = useCallback(async () => {
    setCoupons(null)
    const res = await fetch(`/api/admin/coupons${showSystem ? '?all=1' : ''}`)
    const body = await res.json().catch(() => ({}))
    if (!res.ok) setError(body.error ?? 'Couldn’t load coupons.')
    else {
      setError(null)
      setCoupons(body.coupons ?? [])
    }
  }, [showSystem])

  useEffect(() => {
    if (allowed) load()
  }, [allowed, load])

  const visible = (coupons ?? []).filter((c) => !search.trim() || c.title.toLowerCase().includes(search.trim().toLowerCase()))

  if (staffLoading) {
    return (
      <div className="flex h-full items-center justify-center bg-parchment">
        <Loader2 className="animate-spin text-ink/30" />
      </div>
    )
  }
  if (!allowed) {
    return (
      <div className="h-full overflow-y-auto bg-parchment font-body text-ink">
        <div className="mx-auto max-w-2xl px-6 pt-16 lg:px-10">
          <h1 className="font-display text-3xl">Coupons</h1>
          <p className="mt-2 text-sm text-ink/60">Only managers can create and manage coupons.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto bg-parchment font-body text-ink">
      <div className="mx-auto max-w-6xl px-6 pb-24 pt-10 lg:px-10">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-full bg-indigo text-parchment">
              <Ticket size={18} />
            </span>
            <div>
              <h1 className="font-display text-3xl leading-tight">Coupons</h1>
              <p className="text-sm text-ink/60">Discounts for everyone, new customers or chosen people — with who has them and who used them.</p>
            </div>
          </div>
          {!creating && (
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="inline-flex items-center gap-2 rounded-xl bg-indigo px-4 py-2.5 text-sm font-semibold text-parchment hover:bg-indigo-deep"
            >
              <Plus size={16} /> New coupon
            </button>
          )}
        </div>

        {creating && <CreateCoupon onCancel={() => setCreating(false)} />}

        <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
          <div className="relative w-full max-w-xs">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink/35" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search coupons" className={`${inputClass} pl-9`} />
          </div>
          <label className="inline-flex items-center gap-2 text-sm text-ink/70">
            <input type="checkbox" checked={showSystem} onChange={(e) => setShowSystem(e.target.checked)} className="size-4 accent-teal" />
            Also show referral and QC-credit coupons
          </label>
        </div>

        <div className="mt-4 overflow-hidden rounded-2xl border border-ink/10 bg-card">
          {error ? (
            <p className="p-6 text-sm text-red-600">{error}</p>
          ) : !coupons ? (
            <div className="flex justify-center p-10">
              <Loader2 className="animate-spin text-ink/30" />
            </div>
          ) : visible.length === 0 ? (
            <div className="p-10 text-center text-sm text-ink/55">No coupons yet. Create one to get started.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] text-sm">
                <thead className="border-b border-ink/10 bg-parchment/60 text-left text-xs font-semibold uppercase tracking-wider text-ink/50">
                  <tr>
                    <th className="px-4 py-3">Coupon</th>
                    <th className="px-4 py-3">Who</th>
                    <th className="px-4 py-3">Stores</th>
                    <th className="px-4 py-3 text-right">Given / used</th>
                    <th className="px-4 py-3 text-right">Discount given</th>
                    <th className="px-4 py-3">Ends</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-2 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink/5">
                  {visible.map((c) => {
                    const st = couponState(c)
                    return (
                      <tr key={c.id} className="group hover:bg-parchment/50">
                        <td className="px-4 py-3">
                          <Link href={`/admin/coupons/${c.id}`} className="font-semibold hover:text-teal-deep">
                            {c.title}
                          </Link>
                          <div className="text-xs text-ink/55">
                            {c.label}
                            {c.source !== 'admin' && <span className="ml-1.5 rounded bg-ink/5 px-1.5 py-0.5">{SOURCE_LABEL[c.source]}</span>}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-ink/70">{AUDIENCE_LABEL[c.audience]}</td>
                        <td className="px-4 py-3 text-ink/70">{c.store_scope === 'all' ? 'All' : `${c.store_slugs.length} stores`}</td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          {nf.format(c.allocatedCount)} / <span className="font-semibold">{nf.format(c.redeemedCount)}</span>
                          {c.total_limit ? <span className="text-ink/45"> of {nf.format(c.total_limit)}</span> : null}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">Rs. {nf.format(Math.round(c.discountGivenLKR))}</td>
                        <td className="px-4 py-3 text-ink/70">{c.ends_at ? df.format(new Date(c.ends_at)) : 'No end'}</td>
                        <td className="px-4 py-3">
                          <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${st.className}`}>{st.label}</span>
                        </td>
                        <td className="px-2 py-3 text-ink/30 group-hover:text-ink/60">
                          <Link href={`/admin/coupons/${c.id}`} aria-label={`Open ${c.title}`}>
                            <ChevronRight size={16} />
                          </Link>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <p className="mt-3 text-xs text-ink/50">
          “Given” counts customers who have the coupon in their account (chosen by you, or who added a shared code / used it).
        </p>
      </div>
    </div>
  )
}
