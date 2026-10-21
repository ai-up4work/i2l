// components/store-modules/casecraft/CaseCraftStorefront.tsx
//
// Case Craft's store page.
//
//   home    two big choices (design your own / ready-made), then rows of
//           bestsellers and new designs, how it works, and — lower down —
//           the most-loved designs and "fresh from the printer" photos;
//   custom  the builder (full screen on phones, so the case stays in view);
//   ready   every ready-made design;
//   orders  the shopper's Case Craft orders.
//
// The view and an open design live in the address (?view=ready&design=…),
// so a design can be shared and the back button works. Data comes from the
// server with Wishdrop's margin already in the prices.
'use client'

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { ArrowLeft, Camera, ChevronRight, Heart, Package, Palette, ReceiptText, Truck, Upload, X } from 'lucide-react'
import StoreCover from '@/components/stores/StoreCover'
import FollowButton from '@/components/stores/social/FollowButton'
import ShareButton from '@/components/stores/ShareButton'
import { useAuth } from '@/contexts/AuthContext'
import { imageThumb } from '@/lib/media'
import { formatRs, ORDER_STATUSES, type StorefrontData, type StorefrontDesign, type StorefrontPrint } from '@/lib/store-modules/casecraft/settings'
import CustomCaseBuilder from './CustomCaseBuilder'
import ReadyMadeCases, { DesignCard, DesignSheet } from './ReadyMadeCases'
import { LikeButton, LikesProvider } from './likes'

type View = 'home' | 'custom' | 'ready' | 'orders'
const VIEWS: View[] = ['home', 'custom', 'ready', 'orders']

/** A real product photo for the "Design your own" tile (public/phoneCases). */
const CUSTOM_TILE_PHOTO = '/phoneCases/case_images/I%20Phone/iPhone%2015%20Plus/1.jpg'

export type StorefrontStore = { platform: string; name: string; logo: string; cover?: string | null; tagline?: string | null; description?: string | null }

function readAddress(): { view: View; design: string | null } {
  const q = new URLSearchParams(window.location.search)
  const v = q.get('view') as View | null
  const design = q.get('design')
  return { view: v && VIEWS.includes(v) ? v : design ? 'ready' : 'home', design }
}

export default function CaseCraftStorefront({ store, data }: { store: StorefrontStore; data: StorefrontData }) {
  const { user } = useAuth()
  const [view, setView] = useState<View>('home')
  const [design, setDesign] = useState<string | null>(null)

  // The address is the source of truth: read it on load and on back/forward.
  useEffect(() => {
    const sync = () => {
      const a = readAddress()
      setView(a.view)
      setDesign(a.design)
    }
    sync()
    window.addEventListener('popstate', sync)
    return () => window.removeEventListener('popstate', sync)
  }, [])

  const go = useCallback((next: View, nextDesign: string | null = null, replace = false) => {
    const url = new URL(window.location.href)
    url.searchParams.delete('view')
    url.searchParams.delete('design')
    if (next !== 'home') url.searchParams.set('view', next)
    if (nextDesign) url.searchParams.set('design', nextDesign)
    window.history[replace ? 'replaceState' : 'pushState'](null, '', url)
    setView(next)
    setDesign(nextDesign)
    if (!nextDesign && !replace) window.scrollTo({ top: 0 })
  }, [])

  // Phones: the builder is full screen; keep the page behind it still.
  useEffect(() => {
    if (view !== 'custom' || window.matchMedia('(min-width: 1024px)').matches) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [view])

  const prices = Object.values(data.prices).flatMap((p) => (p ? Object.values(p) : []))
  const fromCustom = prices.length ? Math.min(...prices) : null
  const fromReady = data.designs.length ? Math.min(...data.designs.map((d) => d.price)) : null
  const openDesign = useMemo(() => data.designs.find((d) => d.id === design) ?? null, [data.designs, design])

  return (
    <LikesProvider store={data.storeSlug}>
      <div className="pb-20">
        <StoreCover name={store.name} cover={store.cover} compact />

        <div className="mx-auto w-full max-w-6xl px-4 sm:px-10">
          {/* Store identity: name, follow, share, the shopper's orders. */}
          <div className="relative flex flex-wrap items-end justify-between gap-x-3 gap-y-3">
            <div className="flex min-w-[13rem] flex-1 items-end gap-3 sm:gap-4">
              <span className="-mt-8 grid h-[72px] w-[72px] flex-none place-items-center overflow-hidden rounded-full border-4 border-parchment bg-white shadow-sm sm:-mt-10 sm:h-24 sm:w-24">
                {store.logo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={imageThumb(store.logo, 200)} alt={`${store.name} logo`} className="h-full w-full object-cover" />
                ) : (
                  <span className="font-display text-2xl font-semibold text-indigo">{store.name.charAt(0)}</span>
                )}
              </span>
              <div className="min-w-0 pt-2">
                <h1 className="truncate font-display text-2xl font-bold tracking-tight text-ink sm:text-3xl">{store.name}</h1>
                <p className="truncate font-body text-xs text-ink/55 sm:text-sm">{store.tagline || 'Custom-printed phone cases'}</p>
              </div>
            </div>
            <div className="flex flex-none items-center gap-1.5 pb-1 sm:gap-2">
              <FollowButton slug={store.platform} />
              <ShareButton title={store.name} text={`${store.name} on Wishdrop — design your own phone case`} url={`/stores/${store.platform}`} look="round" label="Share this store" />
              {user && (
                <button
                  type="button"
                  onClick={() => go('orders')}
                  aria-label="Your Case Craft orders"
                  title="Your orders"
                  className={`grid h-9 w-9 place-items-center rounded-full border transition-colors ${
                    view === 'orders' ? 'border-indigo bg-indigo text-parchment' : 'border-ink/15 bg-card text-ink/70 hover:text-ink'
                  }`}
                >
                  <ReceiptText size={15} />
                </button>
              )}
            </div>
          </div>

          {view !== 'home' && view !== 'custom' && (
            <button type="button" onClick={() => go('home')} className="mt-5 inline-flex items-center gap-1.5 font-body text-sm font-semibold text-ink/60 hover:text-ink">
              <ArrowLeft size={15} aria-hidden /> {store.name}
            </button>
          )}

          <div className={view === 'home' ? 'mt-6' : 'mt-4'}>
            {view === 'home' && (
              <Home
                store={store}
                data={data}
                fromCustom={fromCustom}
                fromReady={fromReady}
                onCustom={() => go('custom')}
                onReady={() => go('ready')}
                onDesign={(d) => go('home', d.id)}
              />
            )}
            {view === 'ready' && (
              <>
                <h2 className="mb-4 font-display text-2xl font-bold tracking-tight text-ink">Ready-made designs</h2>
                <ReadyMadeCases data={data} openId={design} onOpenChange={(id) => go('ready', id, !id)} />
              </>
            )}
            {view === 'orders' && user && <MyOrders />}
            {view === 'custom' && (
              // Phones: a full-screen page of its own. Desktop: in the page.
              <div className="fixed inset-0 z-[55] flex flex-col bg-parchment lg:static lg:z-auto lg:block lg:bg-transparent">
                <div className="flex flex-none items-center gap-2 border-b border-ink/10 bg-parchment/95 px-2 py-2 backdrop-blur lg:mb-4 lg:border-0 lg:bg-transparent lg:p-0">
                  <button type="button" onClick={() => go('home')} aria-label={`Back to ${store.name}`} className="grid h-10 w-10 place-items-center rounded-full text-ink/70 hover:bg-ink/5 lg:hidden">
                    <X size={20} />
                  </button>
                  <button type="button" onClick={() => go('home')} className="hidden items-center gap-1.5 font-body text-sm font-semibold text-ink/60 hover:text-ink lg:inline-flex">
                    <ArrowLeft size={15} aria-hidden /> {store.name}
                  </button>
                  <p className="flex-1 font-display text-lg font-semibold text-ink lg:hidden">Design your own</p>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-10 pt-3 lg:overflow-visible lg:p-0">
                  <CustomCaseBuilder data={data} />
                </div>
              </div>
            )}
          </div>
        </div>

        {view === 'home' && openDesign && <DesignSheet design={openDesign} data={data} onClose={() => go('home', null, true)} />}
      </div>
    </LikesProvider>
  )
}

// ---- Home ----------------------------------------------------------------------

function Home({
  store,
  data,
  fromCustom,
  fromReady,
  onCustom,
  onReady,
  onDesign,
}: {
  store: StorefrontStore
  data: StorefrontData
  fromCustom: number | null
  fromReady: number | null
  onCustom: () => void
  onReady: () => void
  onDesign: (d: StorefrontDesign) => void
}) {
  const best = data.designs.filter((d) => d.isBestseller)
  const fresh = data.designs.filter((d) => d.isNew && !d.isBestseller)
  // If the seller hasn't flagged any yet, still show some designs up top.
  const firstRow = best.length ? best : data.designs.slice(0, 10)
  const loved = [...data.designs].filter((d) => d.likes > 0).sort((a, b) => b.likes - a.likes).slice(0, 10)
  const collage = data.designs.slice(0, 3)

  return (
    <div className="flex flex-col gap-10 sm:gap-14">
      {/* The two ways to buy, side by side even on phones. */}
      <section className="grid grid-cols-2 gap-3 sm:gap-5" aria-label="Shop">
        <ChoiceTile
          onClick={onCustom}
          title="Design your own"
          line={fromCustom ? `Your photo · from ${formatRs(fromCustom)}` : 'Your photo, your case'}
          icon={<Palette size={16} aria-hidden />}
          tone="dark"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={CUSTOM_TILE_PHOTO}
            alt=""
            onError={(e) => (e.currentTarget.style.display = 'none')}
            className="absolute inset-0 h-full w-full object-cover opacity-80 transition-transform duration-500 group-hover:scale-[1.04] motion-reduce:transition-none"
          />
        </ChoiceTile>
        <ChoiceTile
          onClick={onReady}
          title="Ready-made"
          line={fromReady ? `${data.designs.length} designs · from ${formatRs(fromReady)}` : 'Designs coming soon'}
          icon={<Package size={16} aria-hidden />}
          tone="light"
        >
          <div className="absolute inset-0 grid grid-cols-3 gap-1.5 p-3 pb-24 sm:gap-2 sm:p-4 sm:pb-28">
            {collage.map((d, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={d.id}
                src={imageThumb(d.imageUrl, 300)}
                alt=""
                className={`h-full w-full rounded-xl object-cover shadow-sm ring-1 ring-ink/10 transition-transform duration-500 motion-reduce:transition-none ${
                  i === 1 ? '-translate-y-1.5 group-hover:-translate-y-3' : 'translate-y-1.5 group-hover:translate-y-0'
                }`}
              />
            ))}
          </div>
        </ChoiceTile>
      </section>

      {firstRow.length > 0 && (
        <Row title={best.length ? 'Bestsellers' : 'Ready-made designs'} onAll={onReady} allLabel={`All ${data.designs.length}`}>
          {firstRow.map((d) => (
            <DesignCard key={d.id} design={d} onOpen={onDesign} className="w-[42%] flex-none snap-start sm:w-48" />
          ))}
        </Row>
      )}

      {best.length > 0 && fresh.length > 0 && (
        <Row title="New arrivals" onAll={onReady} allLabel="See all">
          {fresh.slice(0, 12).map((d) => (
            <DesignCard key={d.id} design={d} onOpen={onDesign} className="w-[42%] flex-none snap-start sm:w-48" />
          ))}
        </Row>
      )}

      <HowItWorks leadTime={data.leadTime} onCustom={onCustom} />

      {/* Social proof, further down: what people like and what's been made. */}
      {loved.length > 0 && (
        <Row title="Loved by customers" icon={<Heart size={17} className="fill-[#e5484d] text-[#e5484d]" aria-hidden />} onAll={onReady} allLabel="See all">
          {loved.map((d) => (
            <DesignCard key={d.id} design={d} onOpen={onDesign} className="w-[42%] flex-none snap-start sm:w-48" />
          ))}
        </Row>
      )}

      {data.prints.length > 0 && <FreshPrints prints={data.prints} designs={data.designs} onDesign={onDesign} storeName={store.name} />}
    </div>
  )
}

function ChoiceTile({
  onClick,
  title,
  line,
  icon,
  tone,
  children,
}: {
  onClick: () => void
  title: string
  line: string
  icon: ReactNode
  tone: 'dark' | 'light'
  children: ReactNode
}) {
  const dark = tone === 'dark'
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group relative isolate flex aspect-[4/5] flex-col justify-end overflow-hidden rounded-3xl p-3.5 text-left ring-1 transition-shadow hover:shadow-[0_18px_40px_-20px_rgba(8,39,79,0.45)] sm:aspect-[16/10] sm:p-6 ${
        dark ? 'bg-indigo ring-indigo' : 'bg-[#efe7d8] ring-ink/10'
      }`}
    >
      <div className="absolute inset-0 -z-10">{children}</div>
      {dark && <div className="absolute inset-0 -z-10 bg-gradient-to-t from-indigo via-indigo/55 to-transparent" />}
      {!dark && <div className="absolute inset-x-0 bottom-0 -z-10 h-2/5 bg-gradient-to-t from-[#efe7d8] via-[#efe7d8]/95 to-transparent" />}
      <span className={`mb-2 grid h-8 w-8 place-items-center rounded-full ${dark ? 'bg-gold text-indigo' : 'bg-indigo text-parchment'}`}>{icon}</span>
      <span className={`font-display text-xl font-bold leading-tight tracking-tight sm:text-3xl ${dark ? 'text-parchment' : 'text-ink'}`}>{title}</span>
      <span className={`mt-0.5 font-body text-xs sm:text-sm ${dark ? 'text-parchment/75' : 'text-ink/60'}`}>{line}</span>
      <span className={`mt-3 inline-flex w-max items-center gap-1 rounded-full px-3 py-1.5 font-body text-xs font-semibold sm:text-sm ${dark ? 'bg-parchment text-indigo' : 'bg-indigo text-parchment'}`}>
        {dark ? 'Start designing' : 'Browse designs'} <ChevronRight size={14} aria-hidden />
      </span>
    </button>
  )
}

function Row({ title, icon, onAll, allLabel, children }: { title: string; icon?: ReactNode; onAll: () => void; allLabel: string; children: ReactNode }) {
  return (
    <section aria-label={title}>
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="flex items-center gap-2 font-display text-xl font-bold tracking-tight text-ink sm:text-2xl">
          {icon}
          {title}
        </h2>
        <button type="button" onClick={onAll} className="inline-flex flex-none items-center gap-0.5 font-body text-sm font-semibold text-teal-deep hover:text-teal">
          {allLabel} <ChevronRight size={15} aria-hidden />
        </button>
      </div>
      <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 sm:-mx-10 sm:gap-4 sm:px-10 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">{children}</div>
    </section>
  )
}

function HowItWorks({ leadTime, onCustom }: { leadTime: string; onCustom: () => void }) {
  const steps = [
    { icon: Upload, title: 'Add your photo', body: 'Any photo, logo or name. Move, zoom and add text.' },
    { icon: Camera, title: 'See it for real', body: 'Preview it on a real photo of your phone’s case.' },
    { icon: Truck, title: 'Printed & delivered', body: leadTime ? `Printed and at your door in ${leadTime}.` : 'Printed and delivered to your door.' },
  ]
  return (
    <section aria-label="How it works" className="rounded-3xl bg-card p-5 ring-1 ring-ink/10 sm:p-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 className="font-display text-xl font-bold tracking-tight text-ink sm:text-2xl">Your own case in three steps</h2>
        <button type="button" onClick={onCustom} className="inline-flex items-center gap-1 rounded-full bg-indigo px-4 py-2 font-body text-sm font-semibold text-parchment hover:bg-indigo-deep">
          Start designing <ChevronRight size={15} aria-hidden />
        </button>
      </div>
      <ol className="mt-5 grid gap-4 sm:grid-cols-3 sm:gap-6">
        {steps.map((s, i) => (
          <li key={s.title} className="flex gap-3">
            <span className="relative grid h-11 w-11 flex-none place-items-center rounded-2xl bg-teal/10 text-teal-deep">
              <s.icon size={19} aria-hidden />
              <span className="absolute -right-1 -top-1 grid h-5 w-5 place-items-center rounded-full bg-indigo font-body text-[10px] font-bold text-parchment">{i + 1}</span>
            </span>
            <span>
              <span className="block font-body text-sm font-semibold text-ink">{s.title}</span>
              <span className="block font-body text-sm text-ink/60">{s.body}</span>
            </span>
          </li>
        ))}
      </ol>
    </section>
  )
}

// ---- Fresh from the printer ------------------------------------------------------

function FreshPrints({ prints, designs, onDesign, storeName }: { prints: StorefrontPrint[]; designs: StorefrontDesign[]; onDesign: (d: StorefrontDesign) => void; storeName: string }) {
  const [shown, setShown] = useState(8)
  const [open, setOpen] = useState<StorefrontPrint | null>(null)
  const design = open?.designId ? designs.find((d) => d.id === open.designId) ?? null : null

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(null)
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  return (
    <section aria-label="Fresh from the printer">
      <div className="mb-3">
        <h2 className="font-display text-xl font-bold tracking-tight text-ink sm:text-2xl">Fresh from the printer</h2>
        <p className="mt-0.5 font-body text-sm text-ink/55">Real cases {storeName} has printed and sent out.</p>
      </div>
      <div className="columns-2 gap-3 sm:columns-3 sm:gap-4 lg:columns-4">
        {prints.slice(0, shown).map((p) => (
          <figure key={p.id} className="relative mb-3 break-inside-avoid sm:mb-4">
            <button type="button" onClick={() => setOpen(p)} className="block w-full overflow-hidden rounded-2xl bg-card ring-1 ring-ink/10">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={imageThumb(p.imageUrl, 600)} alt={p.caption ?? 'A printed case'} loading="lazy" className="w-full" />
            </button>
            <LikeButton type="print" id={p.id} base={p.likes} className="absolute right-2 top-2" />
            {(p.caption || p.model) && (
              <figcaption className="mt-1.5 px-0.5 font-body text-xs leading-snug text-ink/60">
                {p.caption && <span className="text-ink/80">{p.caption}</span>}
                {p.caption && p.model ? ' · ' : ''}
                {p.model}
              </figcaption>
            )}
          </figure>
        ))}
      </div>
      {prints.length > shown && (
        <div className="mt-2 flex justify-center">
          <button type="button" onClick={() => setShown((n) => n + 12)} className="rounded-full bg-card px-5 py-2.5 font-body text-sm font-semibold text-ink ring-1 ring-ink/12 hover:ring-ink/30">
            Show more prints
          </button>
        </div>
      )}

      {open && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-ink/85 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label={open.caption ?? 'Printed case'} onClick={() => setOpen(null)}>
          <div className="flex max-h-full w-full max-w-lg flex-col overflow-hidden rounded-3xl bg-card" onClick={(e) => e.stopPropagation()}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imageThumb(open.imageUrl, 1200)} alt={open.caption ?? 'A printed case'} className="max-h-[70vh] w-full bg-parchment object-contain" />
            <div className="flex items-center gap-3 p-4">
              <div className="min-w-0 flex-1">
                {open.caption && <p className="font-body text-sm font-semibold text-ink">{open.caption}</p>}
                {open.model && <p className="font-body text-xs text-ink/55">{open.model}</p>}
              </div>
              <LikeButton type="print" id={open.id} base={open.likes} look="inline" />
              {design && (
                <button
                  type="button"
                  onClick={() => {
                    setOpen(null)
                    onDesign(design)
                  }}
                  className="flex-none rounded-full bg-indigo px-4 py-2 font-body text-sm font-semibold text-parchment"
                >
                  Get this design
                </button>
              )}
              <button type="button" onClick={() => setOpen(null)} aria-label="Close" className="grid h-9 w-9 flex-none place-items-center rounded-full text-ink/60 hover:bg-ink/5">
                <X size={18} />
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

// ---- Your orders ----------------------------------------------------------------------

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

  return (
    <div>
      <h2 className="mb-4 font-display text-2xl font-bold tracking-tight text-ink">Your orders</h2>
      {!orders ? (
        <p className="py-10 text-center font-body text-sm text-ink/50">Loading your orders…</p>
      ) : !orders.length ? (
        <p className="rounded-2xl bg-card py-12 text-center font-body text-sm text-ink/55 ring-1 ring-ink/10">No orders yet.</p>
      ) : (
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
                <p className="truncate font-body text-sm font-semibold text-ink">{o.kind === 'custom' ? `Custom ${o.case_label}` : (o.design_name ?? o.case_label)}</p>
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
      )}
    </div>
  )
}
