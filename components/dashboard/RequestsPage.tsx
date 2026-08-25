import { useLayoutEffect, useRef, useState } from 'react'
import { Plus, Search } from 'lucide-react'
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
  match: (status: ItemRequest['status']) => boolean
}

// RequestStatus currently only covers 'Requested' | 'Awaiting payment'.
// The other three tabs are placeholders — they'll always be empty until
// those statuses exist on the type, this isn't a filtering bug.
const TABS: TabDef[] = [
  { label: 'Requested', match: (s) => s === 'Requested' },
  { label: 'Ready to Pay', match: (s) => s === 'Awaiting payment' },
  { label: 'In Progress', match: () => false },
  { label: 'Purchased', match: () => false },
  { label: 'Cancelled', match: () => false },
]

const EMPTY_COPY: Record<string, string> = {
  Requested: "Paste a product link and we'll take it from here.",
  'Ready to Pay': "Nothing's waiting on you right now.",
  'In Progress': "Once payment clears, we'll track the purchase here.",
  Purchased: 'Items bought through us will land here.',
  Cancelled: 'Cancelled requests stay here for your records.',
}

export default function RequestsPage({ requests, activeTab, setActiveTab, onRequest }: RequestsPageProps) {
  const activeDef = TABS.find((t) => t.label === activeTab) ?? TABS[0]
  const visible = requests.filter((r) => activeDef.match(r.status))

  const tabRefs = useRef<Array<HTMLButtonElement | null>>([])
  const [indicator, setIndicator] = useState<{ left: number; width: number }>({ left: 0, width: 0 })

  useLayoutEffect(() => {
    const activeIndex = TABS.findIndex((t) => t.label === activeTab)
    const el = tabRefs.current[activeIndex]
    if (el) setIndicator({ left: el.offsetLeft, width: el.offsetWidth })
  }, [activeTab])

  return (
    <div className="mx-auto max-w-7xl px-6 pb-16 pt-8 font-body lg:px-10">
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_330px]">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <h1 className="text-4xl font-extrabold tracking-tight text-gray-900">Buying requests</h1>
            <button
              onClick={onRequest}
              className="flex items-center gap-2 rounded-lg bg-rust px-5 py-3 text-sm font-semibold text-paper shadow-sm transition-all duration-200 hover:opacity-90 hover:shadow-md active:scale-95"
            >
              <Plus size={18} strokeWidth={2.5} /> Add request
            </button>
          </div>

          {/* Segmented pill tabs with a sliding active indicator */}
          <div className="relative mt-8 flex gap-1 overflow-x-auto rounded-full bg-ink/[0.04] p-1.5">
            <span
              className="absolute inset-y-1.5 rounded-full bg-card shadow-sm transition-[left,width] duration-300 ease-out motion-reduce:transition-none"
              style={{ left: indicator.left, width: indicator.width }}
              aria-hidden
            />
            {TABS.map((tab, i) => {
              const count = requests.filter((r) => tab.match(r.status)).length
              const isActive = activeTab === tab.label
              return (
                <button
                  key={tab.label}
                  ref={(el) => {
                    tabRefs.current[i] = el
                  }}
                  onClick={() => setActiveTab(tab.label)}
                  className={`relative z-10 shrink-0 whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold transition-colors duration-200 ${
                    isActive ? 'text-ink' : 'text-ink/45 hover:text-ink/70'
                  }`}
                >
                  {tab.label}
                  {count > 0 && (
                    <span className={`ml-1.5 ${isActive ? 'text-rust' : 'text-ink/35'}`}>({count})</span>
                  )}
                </button>
              )
            })}
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