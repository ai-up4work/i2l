/**
 * app/admin/orders/page.tsx
 *
 * Warehouse manager / ops console. This is the ONLY place status moves
 * forward by human action — customers never see an "advance" control.
 * Payment and courier webhooks would call the same `advance()` mutation
 * from a route handler instead of a click, once wired to a real backend.
 *
 * Self-contained on purpose (per request): types, mock data, and UI live
 * in one file. Swap `MOCK_REQUESTS` + the local `useState` for a real
 * data source (e.g. a server action + client cache) when wiring this up.
 */
'use client'

import { useMemo, useState } from 'react'
import {
  type ItemRequest,
  type RequestStatus,
  REQUEST_STATUS_FLOW,
  STATUS_COPY,
  appendHistory,
  nextStatus,
} from '@/lib/orderStatus'

// ---------------------------------------------------------------------------
// Mock data — replace with a fetch from your API/DB layer.
// ---------------------------------------------------------------------------

const MOCK_REQUESTS: ItemRequest[] = [
  {
    id: 'WD-10231',
    name: 'Noise-cancelling headphones',
    url: 'https://example-store.in/headphones',
    qty: 1,
    unitPrice: 12500,
    image: '',
    status: 'Order accepted',
    customerName: 'Nadeesha Perera',
    customerId: 'cust_1',
    statusHistory: [
      { status: 'Requested', at: '2026-09-01T09:00:00Z', actor: 'customer' },
      { status: 'Awaiting payment', at: '2026-09-01T10:00:00Z', actor: 'system' },
      { status: 'Order accepted', at: '2026-09-01T14:00:00Z', actor: 'system', note: 'Payment confirmed' },
    ],
  },
  {
    id: 'WD-10232',
    name: 'Ceramic cookware set',
    url: 'https://example-store.in/cookware',
    qty: 1,
    unitPrice: 8900,
    image: '',
    status: 'Product received',
    customerName: 'Ruwan Silva',
    customerId: 'cust_2',
    statusHistory: [
      { status: 'Requested', at: '2026-08-29T09:00:00Z', actor: 'customer' },
      { status: 'Awaiting payment', at: '2026-08-29T11:00:00Z', actor: 'system' },
      { status: 'Order accepted', at: '2026-08-29T15:00:00Z', actor: 'system' },
      { status: 'Product received', at: '2026-09-03T08:30:00Z', actor: 'admin', note: 'Scanned at Chennai facility' },
    ],
  },
  {
    id: 'WD-10233',
    name: 'Kids storybook set',
    url: 'https://example-store.in/books',
    qty: 2,
    unitPrice: 2200,
    image: '',
    status: 'Quality check',
    customerName: 'Ishara Fernando',
    customerId: 'cust_3',
    statusHistory: [
      { status: 'Requested', at: '2026-08-27T09:00:00Z', actor: 'customer' },
      { status: 'Awaiting payment', at: '2026-08-27T09:40:00Z', actor: 'system' },
      { status: 'Order accepted', at: '2026-08-27T12:00:00Z', actor: 'system' },
      { status: 'Product received', at: '2026-08-31T08:30:00Z', actor: 'admin' },
      { status: 'Quality check', at: '2026-09-01T09:00:00Z', actor: 'admin' },
    ],
    cancellationRequested: true,
  },
  {
    id: 'WD-10234',
    name: 'Desk lamp',
    url: 'https://example-store.in/lamp',
    qty: 1,
    unitPrice: 4300,
    image: '',
    status: 'Packaging',
    customerName: 'Dinuka Jayasuriya',
    customerId: 'cust_4',
    statusHistory: [
      { status: 'Requested', at: '2026-08-20T09:00:00Z', actor: 'customer' },
      { status: 'Awaiting payment', at: '2026-08-20T09:30:00Z', actor: 'system' },
      { status: 'Order accepted', at: '2026-08-20T13:00:00Z', actor: 'system' },
      { status: 'Product received', at: '2026-08-24T08:30:00Z', actor: 'admin' },
      { status: 'Quality check', at: '2026-08-25T09:00:00Z', actor: 'admin' },
      { status: 'Packaging', at: '2026-08-26T09:00:00Z', actor: 'admin' },
    ],
    delayed: true,
    delayReason: 'Waiting on a consolidated shipment slot',
  },
  {
    id: 'WD-10235',
    name: 'Bluetooth speaker',
    url: 'https://example-store.in/speaker',
    qty: 1,
    unitPrice: 6700,
    image: '',
    status: 'Requested',
    customerName: 'Achini Wickramasinghe',
    customerId: 'cust_5',
    statusHistory: [{ status: 'Requested', at: '2026-09-05T09:00:00Z', actor: 'customer' }],
  },
]

// ---------------------------------------------------------------------------
// Tab config — grouped the way a warehouse manager actually works: an
// "Attention needed" queue first, then the pipeline stages, then done.
// ---------------------------------------------------------------------------

type TabKey = 'attention' | RequestStatus

const WAREHOUSE_STAGES: RequestStatus[] = [
  'Order accepted',
  'Product received',
  'Quality check',
  'Packaging',
  'Shipped',
]

export default function AdminOrdersPage() {
  const [requests, setRequests] = useState<ItemRequest[]>(MOCK_REQUESTS)
  const [activeTab, setActiveTab] = useState<TabKey>('attention')
  const [query, setQuery] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [openId, setOpenId] = useState<string | null>(null)

  const attentionCount = requests.filter(
    (r) => r.cancellationRequested || r.delayed,
  ).length

  const filtered = useMemo(() => {
    let list = requests
    if (activeTab === 'attention') {
      list = list.filter((r) => r.cancellationRequested || r.delayed)
    } else {
      list = list.filter((r) => r.status === activeTab)
    }
    if (query.trim()) {
      const q = query.trim().toLowerCase()
      list = list.filter(
        (r) =>
          r.id.toLowerCase().includes(q) ||
          r.name.toLowerCase().includes(q) ||
          r.customerName.toLowerCase().includes(q),
      )
    }
    return list
  }, [requests, activeTab, query])

  const openRequest = requests.find((r) => r.id === openId) ?? null

  function updateRequest(id: string, updater: (r: ItemRequest) => ItemRequest) {
    setRequests((prev) => prev.map((r) => (r.id === id ? updater(r) : r)))
  }

  function advanceOne(id: string, note?: string) {
    updateRequest(id, (r) => {
      const next = nextStatus(r.status)
      if (!next) return r
      return appendHistory(r, next, 'admin', note)
    })
  }

  function advanceSelected() {
    selectedIds.forEach((id) => advanceOne(id))
    setSelectedIds(new Set())
  }

  function failQualityCheck(id: string, note: string) {
    updateRequest(id, (r) => appendHistory(r, 'Quality check', 'admin', note || 'Failed inspection — flagged'))
  }

  function markDelayed(id: string, reason: string) {
    updateRequest(id, (r) => ({ ...r, delayed: true, delayReason: reason }))
  }

  function clearDelay(id: string) {
    updateRequest(id, (r) => ({ ...r, delayed: false, delayReason: undefined }))
  }

  function resolveCancellation(id: string, approve: boolean, note?: string) {
    updateRequest(id, (r) => {
      const cleared = { ...r, cancellationRequested: false }
      if (approve) return appendHistory(cleared, 'Cancelled', 'admin', note || 'Cancellation approved')
      return { ...cleared, adminNote: note || 'Cancellation declined — order already in progress' }
    })
  }

  function setTracking(id: string, trackingNumber: string) {
    updateRequest(id, (r) => ({ ...r, trackingNumber }))
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const tabs: { key: TabKey; label: string; count?: number }[] = [
    { key: 'attention', label: 'Attention needed', count: attentionCount },
    ...WAREHOUSE_STAGES.map((s) => ({
      key: s,
      label: STATUS_COPY[s].label,
      count: requests.filter((r) => r.status === s).length,
    })),
    { key: 'Delivered', label: 'Delivered', count: requests.filter((r) => r.status === 'Delivered').length },
  ]

  const sameStageAsSelection =
    selectedIds.size > 0 &&
    activeTab !== 'attention' &&
    Array.from(selectedIds).every((id) => requests.find((r) => r.id === id)?.status === activeTab)

  return (
    <div className="min-h-screen bg-[#F6F1E7] font-[system-ui] text-[#1F2430]">
      <header className="border-b border-[#1F243015] bg-white px-6 py-5">
        <h1 className="font-serif text-2xl font-semibold text-[#232A63]">Orders — warehouse console</h1>
        <p className="mt-1 text-sm text-[#1F243099]">
          Move requests through the pipeline, resolve cancellation requests, and flag delays. Customers only see a
          read-only tracker — every status change here is what they'll see reflected there.
        </p>
      </header>

      <div className="mx-auto max-w-6xl px-6 py-6">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => {
                setActiveTab(tab.key)
                setSelectedIds(new Set())
              }}
              className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition ${
                activeTab === tab.key
                  ? 'bg-[#232A63] text-white'
                  : 'bg-white text-[#1F2430] hover:bg-[#23206]/5 border border-[#1F243020]'
              }`}
            >
              {tab.label}
              {typeof tab.count === 'number' && (
                <span
                  className={`ml-1.5 rounded-full px-1.5 text-xs ${
                    activeTab === tab.key ? 'bg-white/20' : 'bg-[#1F243010]'
                  }`}
                >
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="mb-4 flex items-center justify-between gap-3">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by order ID, item, or customer"
            className="w-full max-w-sm rounded-lg border border-[#1F243025] bg-white px-3 py-2 text-sm outline-none focus:border-[#1B8C82]"
          />
          {sameStageAsSelection && activeTab !== 'Delivered' && (
            <button
              onClick={advanceSelected}
              className="whitespace-nowrap rounded-lg bg-[#1B8C82] px-4 py-2 text-sm font-medium text-white hover:bg-[#166f67]"
            >
              Advance {selectedIds.size} selected to {nextStatus(activeTab as RequestStatus)}
            </button>
          )}
        </div>

        <div className="overflow-hidden rounded-xl border border-[#1F243020] bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-[#1F243015] bg-[#1F243006] text-xs uppercase tracking-wide text-[#1F243070]">
              <tr>
                <th className="w-8 px-4 py-3"></th>
                <th className="px-2 py-3">Order</th>
                <th className="px-2 py-3">Customer</th>
                <th className="px-2 py-3">Status</th>
                <th className="px-2 py-3">Flags</th>
                <th className="px-2 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-[#1F243070]">
                    Nothing in this queue right now.
                  </td>
                </tr>
              )}
              {filtered.map((r) => {
                const next = nextStatus(r.status)
                return (
                  <tr key={r.id} className="border-b border-[#1F243010] last:border-0 hover:bg-[#1F243004]">
                    <td className="px-4 py-3">
                      {activeTab !== 'attention' && activeTab !== 'Delivered' && (
                        <input
                          type="checkbox"
                          checked={selectedIds.has(r.id)}
                          onChange={() => toggleSelect(r.id)}
                        />
                      )}
                    </td>
                    <td className="px-2 py-3">
                      <button onClick={() => setOpenId(r.id)} className="text-left hover:underline">
                        <div className="font-medium">{r.name}</div>
                        <div className="text-xs text-[#1F243070]">{r.id}</div>
                      </button>
                    </td>
                    <td className="px-2 py-3">{r.customerName}</td>
                    <td className="px-2 py-3">
                      <span className="rounded-full bg-[#232A6312] px-2 py-0.5 text-xs font-medium text-[#232A63]">
                        {STATUS_COPY[r.status].label}
                      </span>
                    </td>
                    <td className="px-2 py-3">
                      <div className="flex gap-1">
                        {r.cancellationRequested && (
                          <span className="rounded-full bg-[#B8483012] px-2 py-0.5 text-xs text-[#B84830]">
                            Cancellation requested
                          </span>
                        )}
                        {r.delayed && (
                          <span className="rounded-full bg-[#C99A2812] px-2 py-0.5 text-xs text-[#8A6A1B]">
                            Delayed
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-2 py-3 text-right">
                      {next && !r.cancellationRequested && (
                        <button
                          onClick={() => advanceOne(r.id)}
                          className="rounded-lg border border-[#1F243025] px-3 py-1.5 text-xs font-medium hover:border-[#1B8C82] hover:text-[#1B8C82]"
                        >
                          Move to {STATUS_COPY[next].label}
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {openRequest && (
        <OrderDetailDrawer
          request={openRequest}
          onClose={() => setOpenId(null)}
          onAdvance={(note) => advanceOne(openRequest.id, note)}
          onFailQualityCheck={(note) => failQualityCheck(openRequest.id, note)}
          onMarkDelayed={(reason) => markDelayed(openRequest.id, reason)}
          onClearDelay={() => clearDelay(openRequest.id)}
          onResolveCancellation={(approve, note) => resolveCancellation(openRequest.id, approve, note)}
          onSetTracking={(t) => setTracking(openRequest.id, t)}
        />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Detail drawer — order history timeline + contextual actions for the stage
// the order is currently in. Kept in this same file per "minimal file count".
// ---------------------------------------------------------------------------

function OrderDetailDrawer({
  request,
  onClose,
  onAdvance,
  onFailQualityCheck,
  onMarkDelayed,
  onClearDelay,
  onResolveCancellation,
  onSetTracking,
}: {
  request: ItemRequest
  onClose: () => void
  onAdvance: (note?: string) => void
  onFailQualityCheck: (note: string) => void
  onMarkDelayed: (reason: string) => void
  onClearDelay: () => void
  onResolveCancellation: (approve: boolean, note?: string) => void
  onSetTracking: (trackingNumber: string) => void
}) {
  const [note, setNote] = useState('')
  const [delayReason, setDelayReason] = useState(request.delayReason ?? '')
  const [tracking, setTrackingInput] = useState(request.trackingNumber ?? '')
  const next = nextStatus(request.status)

  return (
    <div className="fixed inset-0 z-20 flex justify-end bg-black/30" onClick={onClose}>
      <div
        className="h-full w-full max-w-md overflow-y-auto bg-white p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-1 flex items-start justify-between">
          <h2 className="font-serif text-xl font-semibold text-[#232A63]">{request.name}</h2>
          <button onClick={onClose} className="text-sm text-[#1F243070] hover:text-[#1F2430]">
            Close
          </button>
        </div>
        <p className="text-sm text-[#1F243070]">
          {request.id} · {request.customerName} · Qty {request.qty} · LKR {request.unitPrice.toLocaleString()}
        </p>

        {request.cancellationRequested && (
          <div className="mt-4 rounded-lg border border-[#B8483030] bg-[#B8483008] p-4">
            <p className="text-sm font-medium text-[#B84830]">Customer requested cancellation</p>
            <p className="mt-1 text-sm text-[#1F2430cc]">
              This order is past self-serve cancellation. Approve to cancel and trigger a refund, or decline if it's
              already too far along.
            </p>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Note to attach (visible internally)"
              className="mt-2 w-full rounded-lg border border-[#1F243025] p-2 text-sm"
              rows={2}
            />
            <div className="mt-2 flex gap-2">
              <button
                onClick={() => onResolveCancellation(true, note)}
                className="rounded-lg bg-[#B84830] px-3 py-1.5 text-xs font-medium text-white"
              >
                Approve cancellation
              </button>
              <button
                onClick={() => onResolveCancellation(false, note)}
                className="rounded-lg border border-[#1F243025] px-3 py-1.5 text-xs font-medium"
              >
                Decline
              </button>
            </div>
          </div>
        )}

        <div className="mt-5">
          <h3 className="text-xs font-medium uppercase tracking-wide text-[#1F243070]">Status history</h3>
          <ol className="mt-2 space-y-3">
            {request.statusHistory.map((h, i) => (
              <li key={i} className="flex gap-3 text-sm">
                <div className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-[#1B8C82]" />
                <div>
                  <div className="font-medium">{STATUS_COPY[h.status].label}</div>
                  <div className="text-xs text-[#1F243070]">
                    {new Date(h.at).toLocaleString()} · {h.actor}
                    {h.note ? ` — ${h.note}` : ''}
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </div>

        {!request.cancellationRequested && next && (
          <div className="mt-5 border-t border-[#1F243015] pt-5">
            <h3 className="text-xs font-medium uppercase tracking-wide text-[#1F243070]">Advance</h3>

            {request.status === 'Quality check' ? (
              <div className="mt-2 flex flex-col gap-2">
                <button
                  onClick={() => onAdvance('Passed inspection')}
                  className="rounded-lg bg-[#1B8C82] px-3 py-2 text-sm font-medium text-white"
                >
                  Pass — move to Packaging
                </button>
                <button
                  onClick={() => onFailQualityCheck(note || 'Failed inspection')}
                  className="rounded-lg border border-[#B84830] px-3 py-2 text-sm font-medium text-[#B84830]"
                >
                  Fail — hold and flag
                </button>
              </div>
            ) : request.status === 'Packaging' ? (
              <div className="mt-2">
                <label className="text-xs text-[#1F243070]">Tracking number</label>
                <div className="mt-1 flex gap-2">
                  <input
                    value={tracking}
                    onChange={(e) => setTrackingInput(e.target.value)}
                    placeholder="e.g. LK1234567"
                    className="flex-1 rounded-lg border border-[#1F243025] px-2 py-1.5 text-sm"
                  />
                  <button
                    onClick={() => {
                      onSetTracking(tracking)
                      onAdvance()
                    }}
                    className="rounded-lg bg-[#1B8C82] px-3 py-1.5 text-sm font-medium text-white"
                  >
                    Ship
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => onAdvance()}
                className="mt-2 rounded-lg bg-[#1B8C82] px-3 py-2 text-sm font-medium text-white"
              >
                Move to {STATUS_COPY[next].label}
              </button>
            )}
          </div>
        )}

        <div className="mt-5 border-t border-[#1F243015] pt-5">
          <h3 className="text-xs font-medium uppercase tracking-wide text-[#1F243070]">Delay flag</h3>
          {request.delayed ? (
            <div className="mt-2 flex items-center justify-between rounded-lg bg-[#C99A2812] p-3 text-sm">
              <span>{request.delayReason}</span>
              <button onClick={onClearDelay} className="text-xs font-medium text-[#8A6A1B] hover:underline">
                Clear
              </button>
            </div>
          ) : (
            <div className="mt-2 flex gap-2">
              <input
                value={delayReason}
                onChange={(e) => setDelayReason(e.target.value)}
                placeholder="Reason shown to customer"
                className="flex-1 rounded-lg border border-[#1F243025] px-2 py-1.5 text-sm"
              />
              <button
                onClick={() => onMarkDelayed(delayReason || 'Running behind schedule')}
                className="rounded-lg border border-[#1F243025] px-3 py-1.5 text-sm font-medium hover:border-[#C99A28]"
              >
                Flag delay
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}