// app/admin/(protected)/(manager)/referrals/page.tsx
//
// Admin → Referrals. Set what the new customer and the person who shared
// the link each get (and the rules), and see every referral: who referred
// whom, whether the friend has ordered, whether rewards were issued and
// used. Staff can reward a referral by hand or void it (fraud, same
// person) — voiding withdraws reward coupons that haven't been used.
//
// Manager and Super Admin only (enforced again by /api/admin/referrals).
'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Gift, Loader2, Search } from 'lucide-react'
import { useCurrentStaff } from '@/hooks/useCurrentStaff'
import { adminInputClass as inputClass } from '@/components/admin/CustomerPicker'

type Settings = {
  enabled: boolean
  friendRewardType: 'percent' | 'fixed'
  friendRewardValue: number
  friendMaxDiscountLKR: number | null
  friendMinOrderLKR: number
  friendValidDays: number
  referrerRewardType: 'percent' | 'fixed'
  referrerRewardValue: number
  referrerMaxDiscountLKR: number | null
  referrerMinOrderLKR: number
  referrerValidDays: number
  qualifyingOrderLKR: number
  updatedAt: string | null
  updatedBy: string | null
}

type Person = { id: string; name: string; email: string | null; code: string | null }

type Referral = {
  id: string
  referrer: Person
  friend: Person
  status: 'joined' | 'rewarded' | 'void'
  joinedAt: string | null
  rewardedAt: string | null
  rewardLabel: string | null
  voidReason: string | null
  friendCouponId: string | null
  friendCouponUsed: boolean
  referrerCouponId: string | null
  referrerCouponUsed: boolean
  qualifyingOrders: string[]
}

const nf = new Intl.NumberFormat('en-LK')
const df = new Intl.DateTimeFormat('en-LK', { dateStyle: 'medium' })

const STATUS = {
  joined: { label: 'Waiting for first order', className: 'bg-indigo/10 text-indigo' },
  rewarded: { label: 'Rewarded', className: 'bg-teal/12 text-teal-deep' },
  void: { label: 'Voided', className: 'bg-ink/8 text-ink/50' },
}

function RewardEditor({
  title,
  hint,
  type,
  value,
  cap,
  minOrder,
  days,
  onChange,
}: {
  title: string
  hint: string
  type: 'percent' | 'fixed'
  value: number
  cap: number | null
  minOrder: number
  days: number
  onChange: (patch: Partial<{ type: 'percent' | 'fixed'; value: number; cap: number | null; minOrder: number; days: number }>) => void
}) {
  return (
    <div className="rounded-2xl border border-ink/10 bg-parchment/50 p-4">
      <p className="font-semibold">{title}</p>
      <p className="text-xs text-ink/55">{hint}</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-xl border border-ink/15 bg-card p-1">
          {(['fixed', 'percent'] as const).map((t) => (
            <button
              key={t}
              type="button"
              aria-pressed={type === t}
              onClick={() => onChange({ type: t })}
              className={`rounded-lg px-3 py-1 text-sm font-semibold ${type === t ? 'bg-indigo text-parchment' : 'text-ink/60'}`}
            >
              {t === 'fixed' ? 'Rs.' : '%'}
            </button>
          ))}
        </div>
        <input
          value={value || ''}
          onChange={(e) => onChange({ value: Number(e.target.value.replace(/[^\d.]/g, '')) || 0 })}
          inputMode="decimal"
          className={`${inputClass} w-28`}
          aria-label={`${title} amount`}
        />
        {type === 'percent' && (
          <input
            value={cap ?? ''}
            onChange={(e) => onChange({ cap: Number(e.target.value.replace(/\D/g, '')) || null })}
            inputMode="numeric"
            placeholder="Max Rs."
            className={`${inputClass} w-32`}
            aria-label={`${title} maximum`}
          />
        )}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <label className="text-xs text-ink/55">
          Minimum order (Rs.)
          <input
            value={minOrder || ''}
            onChange={(e) => onChange({ minOrder: Number(e.target.value.replace(/\D/g, '')) || 0 })}
            inputMode="numeric"
            placeholder="0"
            className={`${inputClass} mt-1`}
          />
        </label>
        <label className="text-xs text-ink/55">
          Valid for (days)
          <input
            value={days || ''}
            onChange={(e) => onChange({ days: Number(e.target.value.replace(/\D/g, '')) || 0 })}
            inputMode="numeric"
            className={`${inputClass} mt-1`}
          />
        </label>
      </div>
    </div>
  )
}

export default function ReferralsAdminPage() {
  const { staff, loading: staffLoading } = useCurrentStaff()
  const allowed = staff?.role === 'manager' || staff?.role === 'super_admin'
  const [settings, setSettings] = useState<Settings | null>(null)
  const [referrals, setReferrals] = useState<Referral[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  const [search, setSearch] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(async () => {
    const res = await fetch('/api/admin/referrals')
    const body = await res.json().catch(() => ({}))
    if (!res.ok) setError(body.error ?? 'Couldn’t load referrals.')
    else {
      setSettings(body.settings)
      setReferrals(body.referrals)
    }
  }, [])

  useEffect(() => {
    if (allowed) load()
  }, [allowed, load])

  const save = async () => {
    if (!settings) return
    setSaving(true)
    setNotice(null)
    const res = await fetch('/api/admin/referrals', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    })
    const body = await res.json().catch(() => ({}))
    setSaving(false)
    if (!res.ok) setNotice({ tone: 'error', text: body.error ?? 'Couldn’t save.' })
    else {
      setSettings(body.settings)
      setNotice({ tone: 'ok', text: 'Saved. New referrals use these rewards.' })
    }
  }

  const act = async (id: string, action: 'reward' | 'void') => {
    let reason = ''
    if (action === 'void') {
      const r = window.prompt('Void this referral? Unused reward coupons are withdrawn. Reason:')
      if (r === null) return
      reason = r
    } else if (!window.confirm('Give the referrer their reward now, without waiting for a paid order?')) return
    setBusyId(id)
    const res = await fetch(`/api/admin/referrals/${id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, reason }),
    })
    const body = await res.json().catch(() => ({}))
    setBusyId(null)
    setNotice(res.ok ? { tone: 'ok', text: action === 'reward' ? 'Reward issued.' : 'Referral voided.' } : { tone: 'error', text: body.error ?? 'Failed.' })
    load()
  }

  if (staffLoading || (allowed && !settings && !error)) {
    return (
      <div className="flex h-full items-center justify-center bg-parchment">
        <Loader2 className="animate-spin text-ink/30" />
      </div>
    )
  }
  if (!allowed || error || !settings) {
    return (
      <div className="h-full overflow-y-auto bg-parchment font-body text-ink">
        <div className="mx-auto max-w-2xl px-6 pt-16 lg:px-10">
          <h1 className="font-display text-3xl">Referrals</h1>
          <p className="mt-2 text-sm text-ink/60">{!allowed ? 'Only managers can manage referrals.' : error}</p>
        </div>
      </div>
    )
  }

  const set = (patch: Partial<Settings>) => setSettings({ ...settings, ...patch })
  const list = (referrals ?? []).filter((r) => {
    const q = search.trim().toLowerCase()
    if (!q) return true
    return [r.referrer.name, r.referrer.email, r.friend.name, r.friend.email, r.referrer.code]
      .filter(Boolean)
      .some((v) => (v as string).toLowerCase().includes(q))
  })
  const rewardedCount = (referrals ?? []).filter((r) => r.status === 'rewarded').length
  const joinedCount = (referrals ?? []).filter((r) => r.status !== 'void').length

  return (
    <div className="h-full overflow-y-auto bg-parchment font-body text-ink">
      <div className="mx-auto max-w-6xl px-6 pb-24 pt-10 lg:px-10">
        <div className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-full bg-indigo text-parchment">
            <Gift size={18} />
          </span>
          <div>
            <h1 className="font-display text-3xl leading-tight">Referrals</h1>
            <p className="text-sm text-ink/60">
              Customers share their link. The friend gets a welcome coupon; the sharer gets a reward once the friend’s first order is paid.
            </p>
          </div>
        </div>

        {notice && (
          <p className={`mt-6 rounded-xl px-4 py-3 text-sm ring-1 ${notice.tone === 'ok' ? 'bg-teal/[0.06] ring-teal/20' : 'bg-red-50 text-red-700 ring-red-200'}`}>
            {notice.text}
          </p>
        )}

        <section className="mt-6 rounded-2xl border border-ink/10 bg-card p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-display text-xl">Rewards</h2>
            <label className="inline-flex items-center gap-2 text-sm font-semibold">
              <input type="checkbox" checked={settings.enabled} onChange={(e) => set({ enabled: e.target.checked })} className="size-4 accent-teal" />
              Referral rewards on
            </label>
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <RewardEditor
              title="New customer gets"
              hint="Issued when they sign up with a link"
              type={settings.friendRewardType}
              value={settings.friendRewardValue}
              cap={settings.friendMaxDiscountLKR}
              minOrder={settings.friendMinOrderLKR}
              days={settings.friendValidDays}
              onChange={(p) =>
                set({
                  ...(p.type ? { friendRewardType: p.type } : {}),
                  ...(p.value !== undefined ? { friendRewardValue: p.value } : {}),
                  ...(p.cap !== undefined ? { friendMaxDiscountLKR: p.cap } : {}),
                  ...(p.minOrder !== undefined ? { friendMinOrderLKR: p.minOrder } : {}),
                  ...(p.days !== undefined ? { friendValidDays: p.days } : {}),
                })
              }
            />
            <RewardEditor
              title="Person who shared gets"
              hint="Issued when the friend’s first qualifying order is paid"
              type={settings.referrerRewardType}
              value={settings.referrerRewardValue}
              cap={settings.referrerMaxDiscountLKR}
              minOrder={settings.referrerMinOrderLKR}
              days={settings.referrerValidDays}
              onChange={(p) =>
                set({
                  ...(p.type ? { referrerRewardType: p.type } : {}),
                  ...(p.value !== undefined ? { referrerRewardValue: p.value } : {}),
                  ...(p.cap !== undefined ? { referrerMaxDiscountLKR: p.cap } : {}),
                  ...(p.minOrder !== undefined ? { referrerMinOrderLKR: p.minOrder } : {}),
                  ...(p.days !== undefined ? { referrerValidDays: p.days } : {}),
                })
              }
            />
          </div>
          <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
            <label className="text-sm">
              <span className="font-semibold">Friend’s first order must be at least (Rs.)</span>
              <input
                value={settings.qualifyingOrderLKR || ''}
                onChange={(e) => set({ qualifyingOrderLKR: Number(e.target.value.replace(/\D/g, '')) || 0 })}
                inputMode="numeric"
                placeholder="0"
                className={`${inputClass} mt-1 w-40`}
              />
            </label>
            <div className="flex items-center gap-3">
              {settings.updatedAt && (
                <span className="text-xs text-ink/50">
                  Last saved {df.format(new Date(settings.updatedAt))}
                  {settings.updatedBy ? ` by ${settings.updatedBy}` : ''}
                </span>
              )}
              <button
                type="button"
                onClick={save}
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-xl bg-indigo px-5 py-2.5 text-sm font-semibold text-parchment hover:bg-indigo-deep disabled:opacity-50"
              >
                {saving && <Loader2 size={15} className="animate-spin" />} Save rewards
              </button>
            </div>
          </div>
          <p className="mt-3 text-xs text-ink/50">
            Only genuinely new customers count: account under 14 days old, no orders yet, not the same phone number as the person who shared.
          </p>
        </section>

        <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-ink/60">
            <span className="font-semibold text-ink">{nf.format(joinedCount)}</span> joined ·{' '}
            <span className="font-semibold text-ink">{nf.format(rewardedCount)}</span> rewarded
          </p>
          <div className="relative w-full max-w-xs">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink/35" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, email or code" className={`${inputClass} pl-9`} />
          </div>
        </div>

        <div className="mt-3 overflow-hidden rounded-2xl border border-ink/10 bg-card">
          {list.length === 0 ? (
            <p className="p-10 text-center text-sm text-ink/55">No referrals yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] text-sm">
                <thead className="border-b border-ink/10 bg-parchment/60 text-left text-xs font-semibold uppercase tracking-wider text-ink/50">
                  <tr>
                    <th className="px-4 py-3">Shared by</th>
                    <th className="px-4 py-3">New customer</th>
                    <th className="px-4 py-3">Joined</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Coupons</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink/5">
                  {list.map((r) => (
                    <tr key={r.id} className={r.status === 'void' ? 'text-ink/45' : ''}>
                      <td className="px-4 py-3">
                        <div className="font-semibold">{r.referrer.name}</div>
                        <div className="text-xs text-ink/50">
                          {r.referrer.email}
                          {r.referrer.code ? ` · ${r.referrer.code}` : ''}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-semibold">{r.friend.name}</div>
                        <div className="text-xs text-ink/50">{r.friend.email}</div>
                      </td>
                      <td className="px-4 py-3 text-xs text-ink/60">{r.joinedAt ? df.format(new Date(r.joinedAt)) : '—'}</td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${STATUS[r.status].className}`}>{STATUS[r.status].label}</span>
                        {r.qualifyingOrders.length > 0 && <div className="mt-1 font-mono text-[11px] text-ink/50">{r.qualifyingOrders.join(', ')}</div>}
                        {r.voidReason && <div className="mt-1 text-[11px]">{r.voidReason}</div>}
                      </td>
                      <td className="px-4 py-3 text-xs text-ink/60">
                        {r.friendCouponId && (
                          <div>
                            Friend:{' '}
                            <Link href={`/admin/coupons/${r.friendCouponId}`} className="font-semibold text-teal-deep hover:underline">
                              {r.friendCouponUsed ? 'used' : 'not used yet'}
                            </Link>
                          </div>
                        )}
                        {r.referrerCouponId && (
                          <div>
                            Sharer:{' '}
                            <Link href={`/admin/coupons/${r.referrerCouponId}`} className="font-semibold text-teal-deep hover:underline">
                              {r.rewardLabel ?? 'reward'} · {r.referrerCouponUsed ? 'used' : 'not used yet'}
                            </Link>
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {r.status === 'joined' && (
                          <button
                            type="button"
                            disabled={busyId === r.id}
                            onClick={() => act(r.id, 'reward')}
                            className="mr-3 text-xs font-semibold text-teal-deep hover:underline disabled:opacity-50"
                          >
                            Reward now
                          </button>
                        )}
                        {r.status !== 'void' && (
                          <button
                            type="button"
                            disabled={busyId === r.id}
                            onClick={() => act(r.id, 'void')}
                            className="text-xs font-semibold text-red-600 hover:underline disabled:opacity-50"
                          >
                            Void
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
