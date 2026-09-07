'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { ChevronRight, PackageSearch, Search, SlidersHorizontal } from 'lucide-react'
import InfoRail from './InfoRail'
import { useDashboard } from '@/contexts/DashboardContext'
import { pathForView } from '@/components/dashboard/routes'
import { REQUEST_STATUS_FLOW } from '@/components/dashboard/types'
import type { ItemRequest, RequestStatus } from '@/components/dashboard/types'

function formatLKR(amount: number): string {
  return `Rs. ${amount.toLocaleString('en-LK')}`
}

export default function OrdersHubPage() {
  const router = useRouter()
  const dashboard = useDashboard()

  // Local to this page — dashboard.activeTab is a separate string used
  // elsewhere with a different label convention ('Ready to Pay (1)'), so
  // this page doesn't read/write it to avoid clobbering that.
  const [activeTab, setActiveTab] = useState<RequestStatus>(REQUEST_STATUS_FLOW[0])
  const [query, setQuery] = useState('')

  const filteredRequests = useMemo(() => {
    const q = query.trim().toLowerCase()
    return dashboard.requests.filter((r: ItemRequest) => {
      if (r.status !== activeTab) return false
      if (!q) return true
      return r.name.toLowerCase().includes(q) || r.id.toLowerCase().includes(q)
    })
  }, [dashboard.requests, activeTab, query])

  const countFor = (status: RequestStatus) =>
    dashboard.requests.filter((r) => r.status === status).length

  return (
    <div className="mx-auto max-w-7xl px-6 pb-16 lg:px-10">
      <style>{`
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      <div className="grid gap-8 mt-6 lg:grid-cols-[minmax(0,1fr)_330px] lg:-mt-20 lg:items-start">
        <div className="min-w-0 max-w-3xl">
          {/* Hero */}
          <div className="relative -mt-24 flex min-h-[220px] flex-col justify-end overflow-hidden pt-8 sm:min-h-[260px]">
            <div
              className="absolute inset-0 z-0"
              style={{
                maskImage: 'radial-gradient(ellipse 75% 85% at 60% 35%, black 55%, transparent 100%)',
                WebkitMaskImage: 'radial-gradient(ellipse 75% 85% at 60% 35%, black 55%, transparent 100%)',
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

            <div className="relative z-10">
              <h1 className="font-display text-4xl text-ink sm:text-5xl motion-safe:[animation:fadeUp_0.35s_ease-out_both]">
                Orders
              </h1>
              <p className="mt-2 text-sm text-ink/55 motion-safe:[animation:fadeUp_0.4s_ease-out_both]">
                Everything you&apos;ve requested WishDrop to buy for you.
              </p>
            </div>
          </div>

          {/* Status tabs — the real request lifecycle, in order */}
          <div className="mt-8 flex items-center gap-6 overflow-x-auto border-b border-ink/10 pb-px">
            {REQUEST_STATUS_FLOW.map((status) => {
              const isActive = status === activeTab
              const count = countFor(status)
              return (
                <button
                  key={status}
                  type="button"
                  onClick={() => setActiveTab(status)}
                  className={`relative flex-none whitespace-nowrap pb-3 text-sm font-semibold transition-colors ${
                    isActive ? 'text-ink' : 'text-ink/45 hover:text-ink/70'
                  }`}
                >
                  {status}
                  {!!count && (
                    <span className="ml-1.5 rounded-full bg-teal-deep px-1.5 py-0.5 text-[10px] font-bold text-white">
                      {count}
                    </span>
                  )}
                  {isActive && <span className="absolute -bottom-px left-0 right-0 h-0.5 rounded-full bg-ink" />}
                </button>
              )
            })}
          </div>

          {/* Search row — filters dashboard.requests by name/id */}
          <div className="mt-4 flex items-center gap-3">
            <div className="flex flex-1 items-center gap-2 rounded-xl border border-ink/15 bg-card px-3 py-2.5">
              <Search size={16} className="flex-none text-ink/40" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Product name / order no."
                className="w-full bg-transparent text-sm text-ink placeholder:text-ink/40 focus:outline-none"
              />
            </div>
            <button
              type="button"
              className="flex flex-none items-center gap-1.5 rounded-xl border border-ink/15 bg-card px-3.5 py-2.5 text-sm font-semibold text-ink transition-colors hover:border-ink/30"
            >
              <SlidersHorizontal size={15} />
              Filters
            </button>
          </div>

          {/* dashboard.requests, filtered by the active tab + search */}
          {filteredRequests.length === 0 ? (
            <div className="mt-10 flex flex-col items-center justify-center rounded-2xl border border-dashed border-ink/15 py-16 text-center">
              <PackageSearch size={32} className="text-ink/25" />
              <p className="mt-3 text-sm text-ink/50">Nothing here yet.</p>
            </div>
          ) : (
            <div className="mt-6 flex flex-col gap-3">
              {filteredRequests.map((request) => {
                const isFinalStatus = request.status === REQUEST_STATUS_FLOW[REQUEST_STATUS_FLOW.length - 1]
                const nextStatus = REQUEST_STATUS_FLOW[REQUEST_STATUS_FLOW.indexOf(request.status) + 1]

                return (
                  <div
                    key={request.id}
                    className="flex items-center gap-4 rounded-2xl border border-ink/10 bg-card p-4"
                  >
                    <button
                      type="button"
                      onClick={() => router.push(pathForView('requests'))}
                      className="flex min-w-0 flex-1 items-center gap-4 text-left"
                    >
                      <div className="h-11 w-11 flex-none overflow-hidden rounded-xl border border-ink/10 bg-white">
                        {request.image && (
                          <Image
                            src={request.image}
                            alt=""
                            width={44}
                            height={44}
                            className="h-full w-full object-cover"
                          />
                        )}
                      </div>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold text-ink">{request.name}</span>
                        <span className="block text-xs text-ink/45">
                          {request.qty}× · {formatLKR(request.unitPrice)} · #{request.id}
                        </span>
                      </span>
                      <span className="flex-none text-xs font-semibold text-ink/50">{request.status}</span>
                    </button>

                    {!isFinalStatus && (
                      <button
                        type="button"
                        onClick={() => dashboard.advanceRequestStatus(request.id)}
                        className="flex-none rounded-lg border border-ink/15 px-2.5 py-1.5 text-xs font-semibold text-teal-deep transition-colors hover:border-teal-deep/40"
                        title={`Move to ${nextStatus}`}
                      >
                        Advance
                      </button>
                    )}

                    <ChevronRight size={18} className="text-ink/30" />
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <InfoRail />
      </div>
    </div>
  )
}