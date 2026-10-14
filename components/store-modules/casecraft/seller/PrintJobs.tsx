// components/store-modules/casecraft/seller/PrintJobs.tsx
//
// Case Craft seller portal → Print jobs. Every custom-print and
// ready-made order: download the customer's photo and the print file,
// call or WhatsApp the customer, move the order through its steps.
'use client'

import { useCallback, useEffect, useState } from 'react'
import { ChevronDown, Download, ImageIcon, Loader2, MessageCircle, Phone, RefreshCw } from 'lucide-react'
import { getTemplate } from '@/lib/store-modules/casecraft/catalog'
import { formatRs, ORDER_STATUSES, PAYMENT_LABELS, type DeliveryDetails, type OrderStatus, type PaymentMethod } from '@/lib/store-modules/casecraft/settings'
import { field, Notice, SellerPageTitle } from './ui'

type Job = {
  id: string
  ref: string
  kind: 'custom' | 'ready'
  case_label: string
  model_label: string
  template: string | null
  design_name: string | null
  photo_url: string | null
  print_url: string | null
  preview_url: string | null
  quantity: number
  seller_unit_lkr: number
  unit_price_lkr: number
  delivery_fee_lkr: number
  total_lkr: number
  customer: DeliveryDetails & { email?: string | null }
  payment_method: PaymentMethod
  status: OrderStatus
  seller_note: string | null
  tracking: string | null
  created_at: string
}

type FilterId = 'open' | OrderStatus | 'all'

const FILTERS: { id: FilterId; label: string }[] = [
  { id: 'open', label: 'To do' },
  { id: 'new', label: 'New' },
  { id: 'printing', label: 'Printing' },
  { id: 'dispatched', label: 'Dispatched' },
  { id: 'delivered', label: 'Delivered' },
  { id: 'cancelled', label: 'Cancelled' },
  { id: 'all', label: 'All' },
]

const STATUS_TONE: Record<OrderStatus, string> = {
  new: 'bg-gold/20 text-ink',
  confirmed: 'bg-teal/12 text-teal-deep',
  printing: 'bg-indigo/10 text-indigo',
  dispatched: 'bg-teal/12 text-teal-deep',
  delivered: 'bg-emerald-100 text-emerald-800',
  cancelled: 'bg-red-50 text-red-700',
}

function withDownload(url: string, name: string): string {
  // Supabase Storage sends the file as a download with ?download=<name>.
  return url.includes('/storage/v1/object/public/') ? `${url}${url.includes('?') ? '&' : '?'}download=${encodeURIComponent(name)}` : url
}

function waLink(phone: string, text: string): string {
  let digits = phone.replace(/\D/g, '')
  if (digits.startsWith('0')) digits = `94${digits.slice(1)}`
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`
}

export default function PrintJobs({ storeName }: { storeName: string }) {
  const [filter, setFilter] = useState<FilterId>('open')
  const [jobs, setJobs] = useState<Job[] | null>(null)
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [needsMigration, setNeedsMigration] = useState(false)
  const [openId, setOpenId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setJobs(null)
    const res = await fetch(`/api/seller/casecraft/orders?status=${filter}`)
    const body = await res.json().catch(() => ({}))
    setJobs((body.orders ?? []) as Job[])
    setCounts(body.counts ?? {})
    setNeedsMigration(Boolean(body.needsMigration))
  }, [filter])

  useEffect(() => {
    load()
  }, [load])

  const countFor = (id: FilterId) =>
    id === 'all'
      ? Object.values(counts).reduce((a, b) => a + b, 0)
      : id === 'open'
        ? (counts.new ?? 0) + (counts.confirmed ?? 0) + (counts.printing ?? 0)
        : (counts[id] ?? 0)

  function patched(id: string, next: Partial<Job>) {
    setJobs((cur) => cur?.map((j) => (j.id === id ? { ...j, ...next } : j)) ?? cur)
  }

  return (
    <div className="flex flex-col gap-5">
      <SellerPageTitle
        title="Print jobs"
        body="Orders from your Case Craft page. Download the print file, confirm with the customer, and move each order along."
        actions={
          <button type="button" onClick={load} className="inline-flex items-center gap-1.5 rounded-full border border-ink/15 bg-card px-3.5 py-2 font-body text-sm font-semibold text-ink">
            <RefreshCw size={14} aria-hidden /> Refresh
          </button>
        }
      />

      {needsMigration && <Notice>The database needs an update first: ask Wishdrop to run data/wishdrop-casecraft.sql.</Notice>}

      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            className={`flex flex-none items-center gap-1.5 rounded-full px-3.5 py-1.5 font-body text-xs font-semibold transition-colors ${
              filter === f.id ? 'bg-indigo text-parchment' : 'bg-card text-ink/65 ring-1 ring-ink/10 hover:text-ink'
            }`}
          >
            {f.label}
            <span className={`rounded-full px-1.5 text-[10px] ${filter === f.id ? 'bg-parchment/20' : 'bg-ink/6'}`}>{countFor(f.id)}</span>
          </button>
        ))}
      </div>

      {jobs === null ? (
        <p className="flex items-center justify-center gap-2 py-16 font-body text-sm text-ink/50">
          <Loader2 size={16} className="animate-spin" aria-hidden /> Loading…
        </p>
      ) : jobs.length === 0 ? (
        <p className="rounded-2xl bg-card py-16 text-center font-body text-sm text-ink/55 ring-1 ring-ink/10">No orders here.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {jobs.map((j) => (
            <JobRow key={j.id} job={j} open={openId === j.id} onToggle={() => setOpenId(openId === j.id ? null : j.id)} onSaved={(n) => patched(j.id, n)} storeName={storeName} />
          ))}
        </ul>
      )}
    </div>
  )
}

function JobRow({ job, open, onToggle, onSaved, storeName }: { job: Job; open: boolean; onToggle: () => void; onSaved: (n: Partial<Job>) => void; storeName: string }) {
  const title = job.kind === 'custom' ? `Custom ${job.case_label}` : job.design_name ?? job.case_label
  const status = ORDER_STATUSES.find((s) => s.id === job.status)
  const thumb = job.preview_url ?? null
  const yourPrice = Number(job.seller_unit_lkr) * job.quantity

  return (
    <li className="overflow-hidden rounded-2xl bg-card ring-1 ring-ink/10">
      <button type="button" onClick={onToggle} aria-expanded={open} className="flex w-full items-center gap-3 p-3 text-left sm:p-4">
        {thumb ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumb} alt="" className="h-16 w-9 flex-none rounded-lg object-cover ring-1 ring-ink/10" />
        ) : (
          <span className="grid h-16 w-9 flex-none place-items-center rounded-lg bg-parchment ring-1 ring-ink/10">
            <ImageIcon size={14} className="text-ink/30" aria-hidden />
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="truncate font-body text-sm font-semibold text-ink">{title}</span>
            <span className={`rounded-full px-2 py-0.5 font-body text-[10px] font-bold ${STATUS_TONE[job.status]}`}>{status?.label ?? job.status}</span>
          </span>
          <span className="mt-0.5 block truncate font-body text-xs text-ink/55">
            {job.model_label} · {job.quantity} × · {job.customer.name}, {job.customer.district}
          </span>
          <span className="block font-body text-[11px] text-ink/45">
            {job.ref} · {new Date(job.created_at).toLocaleString('en-LK', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}
          </span>
        </span>
        <span className="hidden flex-none text-right sm:block">
          <span className="block font-body text-sm font-semibold text-ink">{formatRs(Number(job.total_lkr))}</span>
          <span className="block font-body text-[11px] text-ink/50">{PAYMENT_LABELS[job.payment_method]?.label}</span>
        </span>
        <ChevronDown size={16} className={`flex-none text-ink/40 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden />
      </button>

      {open && (
        <div className="grid grid-cols-1 gap-5 border-t border-ink/10 p-4 sm:p-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="flex flex-col gap-4">
            {job.kind === 'custom' ? (
              <div>
                <p className="mb-2 font-body text-xs font-semibold uppercase tracking-wider text-ink/50">Print files</p>
                <div className="flex gap-3">
                  {job.preview_url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={job.preview_url} alt="Preview on the case" className="h-40 w-[90px] flex-none rounded-xl object-cover ring-1 ring-ink/10" />
                  )}
                  <div className="flex min-w-0 flex-col gap-2">
                    {job.print_url && (
                      <a href={withDownload(job.print_url, `${job.ref}-print.jpg`)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-full bg-indigo px-3.5 py-2 font-body text-xs font-semibold text-parchment">
                        <Download size={13} aria-hidden /> Print file
                      </a>
                    )}
                    {job.photo_url && (
                      <a href={withDownload(job.photo_url, `${job.ref}-original`)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-full border border-ink/15 px-3.5 py-2 font-body text-xs font-semibold text-ink">
                        <Download size={13} aria-hidden /> Customer&rsquo;s photo
                      </a>
                    )}
                    {job.preview_url && (
                      <a href={withDownload(job.preview_url, `${job.ref}-preview.jpg`)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-full border border-ink/15 px-3.5 py-2 font-body text-xs font-semibold text-ink">
                        <Download size={13} aria-hidden /> Preview
                      </a>
                    )}
                    <p className="font-body text-xs text-ink/55">Style: {getTemplate(job.template).label}</p>
                  </div>
                </div>
              </div>
            ) : (
              <p className="font-body text-sm text-ink/70">
                Ready-made design <span className="font-semibold text-ink">{job.design_name}</span> on a {job.case_label}.
              </p>
            )}

            <dl className="grid grid-cols-2 gap-x-4 gap-y-1 rounded-xl bg-parchment/70 p-3 font-body text-sm ring-1 ring-ink/8">
              <dt className="text-ink/55">Phone</dt>
              <dd className="text-right font-semibold text-ink">{job.model_label}</dd>
              <dt className="text-ink/55">Quantity</dt>
              <dd className="text-right text-ink">{job.quantity}</dd>
              <dt className="text-ink/55">Your price</dt>
              <dd className="text-right text-ink">{formatRs(yourPrice)}</dd>
              <dt className="text-ink/55">Delivery</dt>
              <dd className="text-right text-ink">{formatRs(Number(job.delivery_fee_lkr))}</dd>
              <dt className="font-semibold text-ink">Customer pays</dt>
              <dd className="text-right font-semibold text-ink">{formatRs(Number(job.total_lkr))}</dd>
              <dt className="text-ink/55">Payment</dt>
              <dd className="text-right text-ink">{PAYMENT_LABELS[job.payment_method]?.label}</dd>
            </dl>
          </div>

          <div className="flex flex-col gap-4">
            <div>
              <p className="mb-1 font-body text-xs font-semibold uppercase tracking-wider text-ink/50">Deliver to</p>
              <p className="font-body text-sm font-semibold text-ink">{job.customer.name}</p>
              <p className="font-body text-sm text-ink/70">
                {job.customer.address}, {job.customer.city}, {job.customer.district}
                {job.customer.postalCode ? ` ${job.customer.postalCode}` : ''}
              </p>
              {job.customer.notes && <p className="mt-1 rounded-lg bg-gold/15 px-2.5 py-1.5 font-body text-xs text-ink">Note: {job.customer.notes}</p>}
              <div className="mt-2 flex flex-wrap gap-2">
                <a href={`tel:${job.customer.phone}`} className="inline-flex items-center gap-1.5 rounded-full border border-ink/15 px-3 py-1.5 font-body text-xs font-semibold text-ink">
                  <Phone size={13} aria-hidden /> {job.customer.phone}
                </a>
                <a
                  href={waLink(job.customer.phone, `Hi ${job.customer.name}, this is ${storeName} about your case order ${job.ref}.`)}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-full border border-ink/15 px-3 py-1.5 font-body text-xs font-semibold text-ink"
                >
                  <MessageCircle size={13} aria-hidden /> WhatsApp
                </a>
              </div>
            </div>
            <JobUpdate job={job} onSaved={onSaved} />
          </div>
        </div>
      )}
    </li>
  )
}

function JobUpdate({ job, onSaved }: { job: Job; onSaved: (n: Partial<Job>) => void }) {
  const [status, setStatus] = useState<OrderStatus>(job.status)
  const [tracking, setTracking] = useState(job.tracking ?? '')
  const [note, setNote] = useState(job.seller_note ?? '')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const dirty = status !== job.status || tracking !== (job.tracking ?? '') || note !== (job.seller_note ?? '')

  async function save() {
    setBusy(true)
    setMsg(null)
    const res = await fetch(`/api/seller/casecraft/orders/${job.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, tracking, sellerNote: note }),
    })
    const body = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok) return setMsg({ ok: false, text: body.error ?? 'Could not save.' })
    onSaved({ status: body.order.status, tracking: body.order.tracking, seller_note: body.order.seller_note })
    setMsg({ ok: true, text: 'Saved.' })
  }

  return (
    <div className="flex flex-col gap-2.5">
      <p className="font-body text-xs font-semibold uppercase tracking-wider text-ink/50">Status</p>
      <div className="flex flex-wrap gap-1.5">
        {ORDER_STATUSES.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setStatus(s.id)}
            className={`rounded-full px-3 py-1.5 font-body text-xs font-semibold transition-colors ${
              status === s.id ? 'bg-indigo text-parchment' : 'bg-parchment text-ink/65 ring-1 ring-ink/10 hover:text-ink'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>
      <input className={field} placeholder="Courier / tracking number (optional)" value={tracking} onChange={(e) => setTracking(e.target.value)} />
      <textarea className={`${field} min-h-[64px]`} placeholder="Private note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
      <div className="flex items-center gap-3">
        <button type="button" onClick={save} disabled={!dirty || busy} className="rounded-full bg-indigo px-4 py-2 font-body text-sm font-semibold text-parchment disabled:opacity-40">
          {busy ? 'Saving…' : 'Save'}
        </button>
        {msg && <span className={`font-body text-sm ${msg.ok ? 'text-teal-deep' : 'text-red-700'}`}>{msg.text}</span>}
      </div>
    </div>
  )
}
