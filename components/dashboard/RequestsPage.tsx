'use client'

import { useLayoutEffect, useRef, useState } from 'react'
import { Plus, Search } from 'lucide-react'
import RequestCard from './RequestCard'
import type { ItemRequest } from './types'

type RequestsPageProps = {
  requests: ItemRequest[]
  activeTab: string
  setActiveTab: (tab: string) => void
  onRequest: () => void
}

type TabDef = { label: string; match: (status: ItemRequest['status']) => boolean }
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
  const activeDef = TABS.find((tab) => tab.label === activeTab) ?? TABS[0]
  const visible = requests.filter((request) => activeDef.match(request.status))
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([])
  const [indicator, setIndicator] = useState({ left: 0, width: 0 })

  useLayoutEffect(() => {
    const element = tabRefs.current[TABS.findIndex((tab) => tab.label === activeTab)]
    if (element) setIndicator({ left: element.offsetLeft, width: element.offsetWidth })
  }, [activeTab])

  return (
    <div className="mx-auto max-w-5xl px-6 pb-16 pt-10 font-body lg:px-10">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-4xl font-semibold tracking-tight text-ink">Buying requests</h1>
        <button onClick={onRequest} className="flex items-center gap-2 rounded-md bg-rust px-5 py-3 text-sm font-semibold text-paper shadow-sm transition hover:opacity-90">
          <Plus size={18} /> Add request
        </button>
      </div>

      <div className="relative mt-12 flex gap-7 overflow-x-auto border-b border-ink/15" role="tablist" aria-label="Request status">
        <span className="absolute bottom-0 h-0.5 bg-rust transition-[left,width] duration-300" style={{ left: indicator.left, width: indicator.width }} aria-hidden />
        {TABS.map((tab, index) => {
          const count = requests.filter((request) => tab.match(request.status)).length
          const selected = tab.label === activeTab
          return (
            <button key={tab.label} ref={(element) => { tabRefs.current[index] = element }} onClick={() => setActiveTab(tab.label)} role="tab" aria-selected={selected} className={`relative shrink-0 pb-4 text-base font-medium transition-colors ${selected ? 'text-ink' : 'text-ink/60 hover:text-ink'}`}>
              {tab.label}{count > 0 && <span className="ml-1">({count})</span>}
            </button>
          )
        })}
      </div>

      <div className="mt-10 flex flex-col gap-5">
        {visible.length ? visible.map((request, index) => <div key={request.id} className="motion-safe:[animation:fadeUp_0.45s_ease-out_both]" style={{ animationDelay: `${index * 70}ms` }}><RequestCard request={request} /></div>) : (
          <div className="flex flex-col items-center rounded-xl border border-dashed border-ink/15 px-6 py-16 text-center">
            <Search size={22} className="text-ink/35" />
            <h2 className="mt-5 font-display text-lg font-semibold text-ink">No {activeTab.toLowerCase()} yet</h2>
            <p className="mt-2 text-sm text-ink/55">{EMPTY_COPY[activeTab]}</p>
            <button onClick={onRequest} className="mt-6 rounded-md bg-rust px-6 py-3 text-sm font-semibold text-paper">Add request</button>
          </div>
        )}
      </div>
    </div>
  )
}
