// components/store-modules/casecraft/CaseCraftStorefront.tsx
//
// Case Craft's store page: design your own case, ready-made designs, and
// the shopper's own Case Craft orders. Data comes from the server with
// Wishdrop's margin already in the prices (lib/store-modules/casecraft).
'use client'

import { useEffect, useState } from 'react'
import { Package, Palette, ReceiptText } from 'lucide-react'
import StoreCover from '@/components/stores/StoreCover'
import FollowButton from '@/components/stores/social/FollowButton'
import ShareButton from '@/components/stores/ShareButton'
import { useAuth } from '@/contexts/AuthContext'
import { imageThumb } from '@/lib/media'
import { formatRs, ORDER_STATUSES, type StorefrontData } from '@/lib/store-modules/casecraft/settings'
import CustomCaseBuilder from './CustomCaseBuilder'
import ReadyMadeCases from './ReadyMadeCases'

type Tab = 'custom' | 'ready' | 'orders'
const TAB_KEY = 'casecraft:tab:v1'

export type StorefrontStore = { platform: string; name: string; logo: string; cover?: string | null; tagline?: string | null; description?: string | null }

export default function CaseCraftStorefront({ store, data }: { store: StorefrontStore; data: StorefrontData }) {
  const { user } = useAuth()
  const [tab, setTab] = useState<Tab>('custom')

  useEffect(() => {
    try {
      const saved = window.sessionStorage.getItem(TAB_KEY) as Tab | null
      if (saved === 'ready' || saved === 'orders' || saved === 'custom') setTab(saved)
    } catch {
      /* ignore */
    }
  }, [])

  function choose(t: Tab) {
    setTab(t)
    try {
      window.sessionStorage.setItem(TAB_KEY, t)
    } catch {
      /* ignore */
    }
  }

  const prices = Object.values(data.prices).flatMap((p) => (p ? Object.values(p) : []))
  const fromCustom = prices.length ? Math.min(...prices) : null
  const fromReady = data.designs.length ? Math.min(...data.designs.map((d) => d.price)) : null

  const tabs: { id: Tab; label: string; hint: string; icon: typeof Palette }[] = [
    { id: 'custom', label: 'Design your own', hint: fromCustom ? `Your photo · from ${formatRs(fromCustom)}` : 'Upload your photo', icon: Palette },
    { id: 'ready', label: 'Ready-made', hint: fromReady ? `${data.designs.length} designs · from ${formatRs(fromReady)}` : 'Designed in Sri Lanka', icon: Package },
    ...(user ? [{ id: 'orders' as const, label: 'Your orders', hint: 'Track your cases', icon: ReceiptText }] : []),
  ]

  return (
    <div className="pb-20">
      <StoreCover name={store.name} cover={store.cover} />

      <div className="mx-auto w-full max-w-6xl px-4 sm:px-10">
        <div className="relative flex items-end justify-between gap-4">
          <div className="flex min-w-0 items-end gap-4">
            <span className="-mt-8 grid h-20 w-20 flex-none place-items-center overflow-hidden rounded-full border-4 border-parchment bg-white shadow-sm sm:-mt-10 sm:h-24 sm:w-24">
              {store.logo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={imageThumb(store.logo, 200)} alt={`${store.name} logo`} className="h-full w-full object-cover" />
              ) : (
                <span className="font-display text-2xl font-semibold text-indigo">{store.name.charAt(0)}</span>
              )}
            </span>
            <div className="min-w-0 pt-3">
              <h1 className="truncate font-display text-2xl font-bold tracking-tight text-ink sm:text-3xl">{store.name}</h1>
              <p className="mt-0.5 font-body text-xs text-ink/55">{store.tagline || 'Custom-printed phone cases'}</p>
            </div>
          </div>
          <div className="flex flex-none items-center gap-2 pb-1">
            <FollowButton slug={store.platform} />
            <ShareButton title={store.name} text={`${store.name} on Wishdrop — design your own phone case`} url={`/stores/${store.platform}`} look="round" label="Share this store" />
          </div>
        </div>

        {store.description && <p className="mt-4 max-w-2xl font-body text-sm text-ink/65">{store.description}</p>}

        <div className="mt-6 flex gap-2 overflow-x-auto pb-1 sm:gap-3" role="tablist">
          {tabs.map((t) => {
            const on = tab === t.id
            const Icon = t.icon
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => choose(t.id)}
                className={`flex flex-none items-center gap-2.5 rounded-2xl border px-4 py-2.5 text-left transition-colors ${
                  on ? 'border-indigo bg-indigo text-parchment' : 'border-ink/10 bg-card text-ink hover:border-ink/25'
                }`}
              >
                <Icon size={16} className="flex-none" aria-hidden />
                <span>
                  <span className="block font-body text-sm font-semibold leading-tight">{t.label}</span>
                  <span className={`block font-body text-[11px] ${on ? 'text-parchment/70' : 'text-ink/50'}`}>{t.hint}</span>
                </span>
              </button>
            )
          })}
        </div>

        <div className="mt-6">
          {tab === 'custom' && <CustomCaseBuilder data={data} />}
          {tab === 'ready' && <ReadyMadeCases data={data} />}
          {tab === 'orders' && user && <MyOrders />}
        </div>
      </div>
    </div>
  )
}

type MyOrder = {
  ref: string
  kind: 'custom' | 'ready'
  case_label: string
  model_label: string
  design_name: string | null
  preview_url: string | null
  quantity: number
  total_lkr: number
  status: string
  created_at: string
}

function MyOrders() {
  const [orders, setOrders] = useState<MyOrder[] | null>(null)
  useEffect(() => {
    fetch('/api/casecraft/orders')
      .then((r) => r.json())
      .then((b) => setOrders((b.orders ?? []) as MyOrder[]))
      .catch(() => setOrders([]))
  }, [])

  if (!orders) return <p className="py-10 text-center font-body text-sm text-ink/50">Loading your orders…</p>
  if (!orders.length) return <p className="rounded-2xl bg-card py-12 text-center font-body text-sm text-ink/55 ring-1 ring-ink/10">No orders yet.</p>

  return (
    <ul className="flex flex-col gap-2">
      {orders.map((o) => (
        <li key={o.ref} className="flex items-center gap-3 rounded-2xl bg-card p-3 ring-1 ring-ink/10">
          {o.preview_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={o.preview_url} alt="" className="h-16 w-9 flex-none rounded-lg object-cover ring-1 ring-ink/10" />
          ) : (
            <span className="grid h-16 w-9 flex-none place-items-center rounded-lg bg-parchment ring-1 ring-ink/10">
              <Package size={14} className="text-ink/30" aria-hidden />
            </span>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate font-body text-sm font-semibold text-ink">{o.kind === 'custom' ? `Custom ${o.case_label}` : o.design_name ?? o.case_label}</p>
            <p className="truncate font-body text-xs text-ink/55">
              {o.model_label} · {o.quantity} × · {o.ref} · {new Date(o.created_at).toLocaleDateString('en-LK', { day: 'numeric', month: 'short' })}
            </p>
          </div>
          <div className="flex-none text-right">
            <p className="font-body text-sm font-semibold text-ink">{formatRs(Number(o.total_lkr))}</p>
            <p className={`font-body text-xs font-semibold ${o.status === 'cancelled' ? 'text-red-600' : 'text-teal-deep'}`}>
              {ORDER_STATUSES.find((s) => s.id === o.status)?.customer ?? o.status}
            </p>
          </div>
        </li>
      ))}
    </ul>
  )
}
