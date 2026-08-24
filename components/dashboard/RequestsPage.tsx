import { PackagePlus, Search } from 'lucide-react'
import RequestCard from './RequestCard'
import type { ItemRequest } from './types'

type RequestsPageProps = {
  requests: ItemRequest[]
  activeTab: string
  setActiveTab: (tab: string) => void
  onRequest: () => void
}

export default function RequestsPage({ requests, activeTab, setActiveTab, onRequest }: RequestsPageProps) {
  const tabs = [
    'Requested',
    `Ready to Pay (${requests.filter((r) => r.status === 'Awaiting payment').length})`,
    'In Progress',
    'Purchased',
    'Cancelled',
  ]

  const visible = activeTab.startsWith('Ready')
    ? requests.filter((r) => r.status === 'Awaiting payment')
    : activeTab === 'Requested'
      ? requests.filter((r) => r.status === 'Requested')
      : []

  return (
    <div className="mx-auto max-w-6xl px-6 pb-16 pt-8 lg:px-10">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-display text-4xl text-ink sm:text-5xl">Buying requests</h1>
        <button
          onClick={onRequest}
          className="flex items-center gap-2 rounded-xl bg-ink px-5 py-3 text-sm font-semibold text-paper transition-colors hover:bg-blue-deep"
        >
          <PackagePlus size={17} /> Add request
        </button>
      </div>

      <div className="mt-8 flex gap-7 overflow-auto border-b border-ink/10">
        {tabs.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`whitespace-nowrap border-b-[3px] pb-4 text-[15px] font-bold transition-colors ${
              activeTab === tab ? 'border-rust text-ink' : 'border-transparent text-ink/50 hover:text-ink'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      <div className="mt-8 flex flex-col gap-5">
        {visible.length ? (
          visible.map((request) => <RequestCard request={request} key={request.id} />)
        ) : (
          <div className="max-w-2xl rounded-2xl border border-dashed border-ink/25 px-6 py-16 text-center">
            <Search size={28} className="mx-auto text-muted" />
            <h2 className="mt-4 font-display text-xl text-ink">No {activeTab.toLowerCase()} yet</h2>
            <p className="mt-2 text-sm text-ink/60">Add a product link and we&apos;ll help bring it home.</p>
            <button
              onClick={onRequest}
              className="mx-auto mt-6 flex items-center gap-2 rounded-xl bg-ink px-6 py-3 text-sm font-semibold text-paper transition-colors hover:bg-blue-deep"
            >
              Add request
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
