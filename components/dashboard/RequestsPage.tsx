import { useCallback, useLayoutEffect, useRef } from 'react'
import { Plus, Search, Inbox, CreditCard, Truck, CheckCircle2, XCircle } from 'lucide-react'
import Image from 'next/image'
import RequestCard from './RequestCard'
import InfoRail from './InfoRail'
import type { ItemRequest } from './types'

type RequestsPageProps = {
  requests: ItemRequest[]
  activeTab: string
  setActiveTab: (tab: string) => void
  onRequest: () => void
}

type TabDef = {
  label: string
  icon: React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>
  // Widened to `string` (rather than ItemRequest['status']) so this file can
  // preview all five tabs with mock data below, even though the real type
  // currently only defines 'Requested' | 'Awaiting payment'. Once the other
  // three statuses exist on ItemRequest, this can go back to the narrower
  // type and MOCK_REQUESTS can be swapped for real `requests` data.
  match: (status: string) => boolean
}

const TABS: TabDef[] = [
  { label: 'Requested', icon: Inbox, match: (s) => s === 'Requested' },
  { label: 'Ready to Pay', icon: CreditCard, match: (s) => s === 'Awaiting payment' },
  { label: 'In Progress', icon: Truck, match: (s) => s === 'In Progress' },
  { label: 'Purchased', icon: CheckCircle2, match: (s) => s === 'Purchased' },
  { label: 'Cancelled', icon: XCircle, match: (s) => s === 'Cancelled' },
]

// The dial needs buffer tabs on both sides of whichever one is centered so
// it can be scrolled/dragged in either direction and always find another
// tab underneath the cursor before running out of content. Three copies of
// the 5 real tabs (15 buttons total) is enough buffer for any reasonable
// viewport width; SET_COUNT/MIDDLE_COPY below drive the loop-jump math.
const SET_COUNT = 3
const MIDDLE_COPY = 1
const TABS_LOOPED: TabDef[] = Array.from({ length: SET_COUNT }, () => TABS).flat()

const EMPTY_COPY: Record<string, string> = {
  Requested: "Paste a product link and we'll take it from here.",
  'Ready to Pay': "Nothing's waiting on you right now.",
  'In Progress': "Once payment clears, we'll track the purchase here.",
  Purchased: 'Items bought through us will land here.',
  Cancelled: 'Cancelled requests stay here for your records.',
}

// ---- PREVIEW-ONLY MOCK DATA -------------------------------------------
// Field names here MUST match what RequestCard.tsx actually reads:
// `name` (not productName), `unitPrice` (not price), `qty` (not quantity),
// `platform` (not sourceSite). A previous version of this mock used the
// wrong names, which is what caused unitPrice to be undefined and render
// as the literal string "LKRNaN" in RequestCard's price formatting.
// Swap this block out (and the `requests={MOCK_REQUESTS}` prop below) once
// wired to real data. Delete this whole block when done previewing.
const MOCK_REQUESTS: (ItemRequest & Record<string, unknown>)[] = [
  {
    id: 'req_1',
    status: 'Requested',
    name: 'Sony WH-1000XM5 Headphones',
    image: '/products/hero-product-1.png',
    unitPrice: 89500,
    currency: 'LKR',
    qty: 1,
    platform: 'Amazon',
    requestedAt: '2026-08-28',
  },
  {
    id: 'req_2',
    status: 'Requested',
    name: 'Nike Air Zoom Pegasus 41',
    image: '/products/hero-product-2.png',
    unitPrice: 32000,
    currency: 'LKR',
    qty: 1,
    platform: 'Nike',
    requestedAt: '2026-08-27',
  },
  {
    id: 'req_3',
    status: 'Awaiting payment',
    name: 'Anker 737 Power Bank',
    image: '/products/hero-product-3.png',
    unitPrice: 24750,
    currency: 'LKR',
    qty: 2,
    platform: 'Amazon',
    requestedAt: '2026-08-25',
    totalDue: 'LKR 49,500.00',
    totalHours: 72,
    hoursRemaining: 45,
  },
  {
    id: 'req_4',
    status: 'In Progress',
    name: 'Kindle Paperwhite 11th Gen',
    image: '/products/hero-product-4.png',
    unitPrice: 41200,
    currency: 'LKR',
    qty: 1,
    platform: 'Amazon',
    requestedAt: '2026-08-15',
    trackingNumber: 'US4482910372LK',
    carrier: 'DHL Express',
  },
  {
    id: 'req_5',
    status: 'In Progress',
    name: "Levi's 501 Original Jeans",
    image: '/products/hero-product-5.png',
    unitPrice: 18900,
    currency: 'LKR',
    qty: 2,
    platform: 'eBay',
    requestedAt: '2026-08-12',
    trackingNumber: 'US4471820019LK',
    carrier: 'FedEx',
  },
  {
    id: 'req_6',
    status: 'Purchased',
    name: 'Le Creuset Dutch Oven 5.5qt',
    image: '/products/hero-product-1.png',
    unitPrice: 76300,
    currency: 'LKR',
    qty: 1,
    platform: 'eBay',
    requestedAt: '2026-07-30',
    deliveredAt: '2026-08-20',
  },
  {
    id: 'req_7',
    status: 'Cancelled',
    name: 'Razer DeathAdder V3',
    image: '/products/hero-product-2.png',
    unitPrice: 14500,
    currency: 'LKR',
    qty: 1,
    platform: 'eBay',
    requestedAt: '2026-08-10',
    cancelReason: 'Item went out of stock at source',
  },
] as unknown as (ItemRequest & Record<string, unknown>)[]
// ------------------------------------------------------------------------

export default function RequestsPage({ requests, activeTab, setActiveTab, onRequest }: RequestsPageProps) {
  // Using MOCK_REQUESTS for preview — swap back to `requests` prop once real
  // data covers all five statuses AND uses the same field names RequestCard
  // reads (name/unitPrice/qty/platform). If the real API response instead
  // uses productName/price/quantity/sourceSite, map it to this shape at the
  // fetch boundary rather than changing RequestCard's field names again.
  const sourceRequests = MOCK_REQUESTS as unknown as ItemRequest[]

  const activeDef = TABS.find((t) => t.label === activeTab) ?? TABS[0]
  const visible = sourceRequests.filter((r) => activeDef.match(r.status as unknown as string))

  // ---- Dial tab selector state/refs --------------------------------
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const highlightRef = useRef<HTMLDivElement | null>(null)
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([])
  const setWidthRef = useRef<number | null>(null) // px width of one full loop of TABS
  const rafRef = useRef<number | null>(null)
  const settleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isInternalChange = useRef(false) // true while a scroll-driven setActiveTab is in flight
  const hasCenteredOnce = useRef(false)

  // Distance-based visual response: nearest tab to the fixed center marker
  // gets full opacity/scale + the rust highlight's text color, everything
  // else fades and shrinks the further it drifts from center — same idea as
  // a camera-mode dial or an iOS date-picker wheel.
  const updateCentered = useCallback(() => {
    const container = scrollRef.current
    if (!container) return
    const containerCenter = container.scrollLeft + container.clientWidth / 2
    const maxDist = container.clientWidth / 2 || 1

    let closestIdx = 0
    let closestDist = Infinity

    tabRefs.current.forEach((el, i) => {
      if (!el) return
      const elCenter = el.offsetLeft + el.offsetWidth / 2
      const dist = Math.abs(elCenter - containerCenter)
      if (dist < closestDist) {
        closestDist = dist
        closestIdx = i
      }
      const t = Math.min(dist / maxDist, 1)
      el.style.opacity = String(1 - t * 0.75)
      el.style.transform = `scale(${1 - t * 0.16})`

      const isNearCenter = dist < el.offsetWidth * 0.5
      el.classList.toggle('text-paper', isNearCenter)
      el.classList.toggle('text-ink/60', !isNearCenter)
    })

    const activeEl = tabRefs.current[closestIdx]
    if (activeEl && highlightRef.current) {
      highlightRef.current.style.width = `${activeEl.offsetWidth}px`
    }

    const label = TABS[closestIdx % TABS.length].label
    if (label !== activeTab) {
      isInternalChange.current = true
      setActiveTab(label)
    }
  }, [activeTab, setActiveTab])

  // Once scrolling stops, silently (no animation) shift the scroll position
  // back into the middle copy of TABS_LOOPED if the user has drifted into
  // the first or last copy — this is what makes the loop feel infinite
  // instead of hitting a wall at either end.
  const settleLoop = useCallback(() => {
    const container = scrollRef.current
    if (!container || setWidthRef.current == null) return
    const containerCenter = container.scrollLeft + container.clientWidth / 2

    let closestIdx = 0
    let closestDist = Infinity
    tabRefs.current.forEach((el, i) => {
      if (!el) return
      const elCenter = el.offsetLeft + el.offsetWidth / 2
      const dist = Math.abs(elCenter - containerCenter)
      if (dist < closestDist) {
        closestDist = dist
        closestIdx = i
      }
    })

    const copyIndex = Math.floor(closestIdx / TABS.length)
    if (copyIndex !== MIDDLE_COPY) {
      container.scrollLeft += (MIDDLE_COPY - copyIndex) * setWidthRef.current
    }
  }, [])

  const handleScroll = useCallback(() => {
    if (rafRef.current == null) {
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null
        updateCentered()
      })
    }
    if (settleTimerRef.current) clearTimeout(settleTimerRef.current)
    settleTimerRef.current = setTimeout(settleLoop, 120)
  }, [updateCentered, settleLoop])

  const centerFlatIndex = useCallback((flatIndex: number, behavior: ScrollBehavior) => {
    const container = scrollRef.current
    const el = tabRefs.current[flatIndex]
    if (!container || !el) return
    const target = el.offsetLeft + el.offsetWidth / 2 - container.clientWidth / 2
    container.scrollTo({ left: target, behavior })
  }, [])

  const handleTabClick = useCallback(
    (flatIndex: number, realIndex: number) => {
      centerFlatIndex(flatIndex, 'smooth')
      isInternalChange.current = true
      setActiveTab(TABS[realIndex].label)
    },
    [centerFlatIndex, setActiveTab]
  )

  // Measure one full loop's pixel width (needed for the loop-jump math) and
  // re-measure on resize, since label widths reflow at different breakpoints.
  useLayoutEffect(() => {
    const measure = () => {
      const a = tabRefs.current[0]
      const b = tabRefs.current[TABS.length]
      if (a && b) setWidthRef.current = b.offsetLeft - a.offsetLeft
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [])

  // Center the active tab on mount, and re-center (instantly, no animation)
  // whenever activeTab changes from *outside* the dial — e.g. the parent
  // resets it, or a route deep-links straight into a tab. Scroll-driven
  // changes set isInternalChange first so this effect skips re-centering
  // and doesn't fight the user's own gesture.
  useLayoutEffect(() => {
    if (isInternalChange.current) {
      isInternalChange.current = false
      return
    }
    const realIndex = TABS.findIndex((t) => t.label === activeTab)
    if (realIndex === -1) return
    const flatIndex = TABS.length * MIDDLE_COPY + realIndex
    centerFlatIndex(flatIndex, hasCenteredOnce.current ? 'smooth' : 'auto')
    hasCenteredOnce.current = true
    // Run once synchronously after mount/measure so opacity/scale/highlight
    // reflect the initial position immediately rather than snapping in
    // after the first scroll event.
    requestAnimationFrame(updateCentered)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab])

  return (
    <div className="mx-auto max-w-7xl px-6 pb-8 font-body lg:px-10">
      {/* Guarantees the fadeUp/scaleIn keyframes exist even if missing from
          global CSS — mirrors HomePage's / ShoppingCommunityPage's inline
          style block so cards and interactions animate consistently. Also
          hides the dial's native scrollbar (kept via inline style for the
          scrollbar-width property, but WebKit needs this pseudo-element
          rule since it doesn't respect scrollbar-width). */}
      <style>{`
        @keyframes fadeUp {
          from {
            opacity: 0;
            transform: translateY(12px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        @keyframes scaleIn {
          from {
            opacity: 0;
            transform: scale(0.96);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }
        .tab-dial::-webkit-scrollbar {
          display: none;
        }
      `}</style>

      {/* Grid — identical structure to ShoppingCommunityPage/HomePage: the
          hero banner lives inside the left/middle column only, so it never
          bleeds behind the InfoRail sidebar, and the whole row is pulled up
          together via -mt-20 to sit close under the top illustration. */}
      <div className="grid gap-8 mt-6 lg:grid-cols-[minmax(0,1fr)_330px] lg:-mt-20 lg:items-start">
        <div className="min-w-0">
          <div className="relative -mt-24 flex min-h-[220px] flex-col justify-end overflow-hidden pt-8 sm:min-h-[260px]">
            <div
              className="absolute inset-0 z-0"
              style={{
                maskImage:
                  'radial-gradient(ellipse 75% 85% at 60% 35%, black 55%, transparent 100%)',
                WebkitMaskImage:
                  'radial-gradient(ellipse 75% 85% at 60% 35%, black 55%, transparent 100%)',
              }}
            >
              <Image
                src="/Refs/top-main-bg.png"
                alt=""
                fill
                sizes="(min-width: 1024px) 70vw, 100vw"
                className="object-cover object-top"
              />
            </div>

            <div className="relative z-10 flex flex-wrap items-end justify-between gap-4">
              <div>
                <h1 className="text-4xl font-extrabold tracking-tight text-ink motion-safe:[animation:fadeUp_0.35s_ease-out_both]">
                  Buying requests
                </h1>
                <p className="mt-2 text-sm text-ink/70 font-semibold mb-4 motion-safe:[animation:fadeUp_0.4s_ease-out_both]">
                  Track every product you&apos;ve asked us to buy, right through to delivery.
                </p>
              </div>
              <button
                onClick={onRequest}
                className="flex items-center gap-2 rounded-lg bg-rust px-5 py-3 text-sm font-semibold text-paper shadow-sm transition-all duration-200 hover:opacity-90 hover:shadow-md active:scale-95 motion-safe:[animation:fadeUp_0.4s_ease-out_both]"
              >
                <Plus size={18} strokeWidth={2.5} /> Add request
              </button>
            </div>
          </div>

          {/* Dial tab selector — a single row, never wraps. The rust
              highlight is fixed dead-center and never moves; the tabs
              themselves scroll/snap underneath it, fading and shrinking
              the further they sit from center. Three looped copies of TABS
              give enough buffer in both directions that scrolling past
              either end silently re-centers into the middle copy, so it
              reads as an endless dial rather than a list with an edge. */}
          <div className="relative mt-8 h-14 overflow-hidden rounded-full border border-ink/[0.06] bg-ink/[0.035] shadow-[inset_0_1px_2px_rgba(0,0,0,0.04)]">
            <div
              ref={highlightRef}
              className="pointer-events-none absolute inset-y-1.5 left-1/2 z-0 -translate-x-1/2 rounded-full bg-rust shadow-md shadow-rust/20 transition-[width] duration-150 ease-out"
            />
            <div
              ref={scrollRef}
              onScroll={handleScroll}
              className="tab-dial relative z-10 flex h-full items-center gap-1 overflow-x-auto px-2"
              style={{
                scrollSnapType: 'x mandatory',
                scrollbarWidth: 'none',
                WebkitOverflowScrolling: 'touch',
                maskImage: 'linear-gradient(to right, transparent 0%, black 14%, black 86%, transparent 100%)',
                WebkitMaskImage:
                  'linear-gradient(to right, transparent 0%, black 14%, black 86%, transparent 100%)',
              }}
            >
              {TABS_LOOPED.map((tab, i) => {
                const Icon = tab.icon
                const realIndex = i % TABS.length
                return (
                  <button
                    key={`${tab.label}-${i}`}
                    ref={(el) => {
                      tabRefs.current[i] = el
                    }}
                    onClick={() => handleTabClick(i, realIndex)}
                    style={{ scrollSnapAlign: 'center' }}
                    className="flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold text-ink/60"
                  >
                    <Icon size={15} strokeWidth={2.5} />
                    {tab.label}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="mt-6 flex flex-col gap-4">
            {visible.length ? (
              visible.map((request, i) => (
                <div
                  key={request.id}
                  className="motion-safe:[animation:fadeUp_0.45s_ease-out_both]"
                  style={{ animationDelay: `${i * 70}ms` }}
                >
                  <RequestCard request={request} />
                </div>
              ))
            ) : (
              <div className="mx-auto flex max-w-md flex-col items-center rounded-2xl border border-dashed border-ink/15 px-6 py-16 text-center transition-colors">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-ink/5 motion-safe:[animation:scaleIn_0.4s_ease-out_both]">
                  <Search size={20} className="text-ink/40" />
                </div>
                <h2 className="mt-5 font-display text-lg font-semibold text-ink">No {activeTab.toLowerCase()} yet</h2>
                <p className="mt-2 text-sm leading-relaxed text-ink/55">{EMPTY_COPY[activeTab]}</p>
                <button
                  onClick={onRequest}
                  className="mt-6 flex items-center gap-2 rounded-lg bg-rust px-6 py-3 text-sm font-semibold text-paper transition-all duration-200 hover:opacity-90 active:scale-95"
                >
                  <Plus size={16} strokeWidth={2.5} /> Add request
                </button>
              </div>
            )}
          </div>
        </div>

        <InfoRail />
      </div>
    </div>
  )
}