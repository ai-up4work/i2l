// app/admin/(sales)/catalogues/page.tsx
'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  BookOpen,
  Calendar,
  ChevronRight,
  Clock,
  Inbox,
  Plus,
  Search,
  SearchX,
} from 'lucide-react'

import {
  ADMIN_CATALOGUES,
  STATUS_LABEL,
  STATUS_DOT,
  STATUS_PILL,
  getSellerName,
  type CatalogueEntry,
  type CatalogueStatus,
} from '@/data/catalogues/data'
import { ADMIN_SELLERS } from '@/data/sellers/data'
import { panelClass } from '@/components/admin/seller/shared'

type StatusFilter = 'all' | CatalogueStatus | 'pending'

const COLUMNS = ['Product', 'Seller', 'Category', 'Price', 'Status', 'Added']

export default function CataloguesListPage() {
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [sellerFilter, setSellerFilter] = useState<string>('all')

  const pendingCount = ADMIN_CATALOGUES.filter((c) => c.pendingChange).length

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return ADMIN_CATALOGUES.filter((c) => {
      const matchesSearch =
        !q ||
        c.title.toLowerCase().includes(q) ||
        (c.category ?? '').toLowerCase().includes(q) ||
        getSellerName(c.sellerId).toLowerCase().includes(q)
      const matchesStatus =
        statusFilter === 'all' ? true : statusFilter === 'pending' ? !!c.pendingChange : c.status === statusFilter
      const matchesSeller = sellerFilter === 'all' || c.sellerId === sellerFilter
      return matchesSearch && matchesStatus && matchesSeller
    })
  }, [search, statusFilter, sellerFilter])

  const hasAnyFilter = search.trim().length > 0 || statusFilter !== 'all' || sellerFilter !== 'all'
  const clearFilters = () => {
    setSearch('')
    setStatusFilter('all')
    setSellerFilter('all')
  }

  return (
    <div className="min-h-screen bg-parchment font-body text-ink">
      <div className="mx-auto max-w-[1560px] px-6 pb-20 pt-10 lg:px-10">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-4">
            <div className="grid h-14 w-14 flex-none place-items-center rounded-2xl border border-ink/10 bg-card text-teal-deep shadow-[0_1px_2px_rgba(32,36,43,0.04),0_16px_40px_-24px_rgba(14,140,156,0.4)]">
              <BookOpen size={22} strokeWidth={1.75} />
            </div>
            <div>
              <h1 className="font-display text-3xl text-ink">Catalogues</h1>
              <p className="mt-1.5 max-w-md text-sm leading-relaxed text-ink/60">
                Products listed for sale in Sri Lanka. Sellers can propose cost/availability changes here —
                review and approve them before they go live.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => router.push('/admin/catalogues/new')}
            className="flex flex-none items-center gap-1.5 rounded-xl bg-teal-deep px-4 py-2.5 text-sm font-semibold text-parchment shadow-[0_10px_28px_-10px_rgba(11,114,128,0.55)] transition-all hover:bg-teal active:scale-[0.98]"
          >
            <Plus size={16} strokeWidth={2.5} />
            Add catalogue entry
          </button>
        </div>

        <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-1 rounded-full border border-ink/10 bg-card p-1">
            {(['all', 'pending', 'active', 'draft', 'hidden'] as StatusFilter[]).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setStatusFilter(f)}
                className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal ${
                  statusFilter === f
                    ? 'bg-teal-deep text-parchment shadow-[0_6px_18px_-8px_rgba(14,140,156,0.5)]'
                    : 'text-ink/55 hover:text-ink/80'
                }`}
              >
                {f === 'all' ? 'All' : f === 'pending' ? 'Needs review' : STATUS_LABEL[f]}
                {f === 'pending' && pendingCount > 0 && (
                  <span
                    className={`grid h-4 min-w-4 place-items-center rounded-full px-1 text-[10px] font-bold ${
                      statusFilter === 'pending' ? 'bg-white/25 text-white' : 'bg-gold-deep text-white'
                    }`}
                  >
                    {pendingCount}
                  </span>
                )}
              </button>
            ))}
          </div>

          <div className="flex w-full gap-2 sm:w-auto">
            <select
              value={sellerFilter}
              onChange={(e) => setSellerFilter(e.target.value)}
              className="rounded-full border border-ink/10 bg-card px-3.5 py-2.5 text-xs font-semibold text-ink/65 outline-none transition-colors focus:border-teal/50 focus:ring-2 focus:ring-teal/15"
            >
              <option value="all">All sellers</option>
              {ADMIN_SELLERS.map((s) => (
                <option key={s.platform} value={s.platform}>
                  {s.store.name}
                </option>
              ))}
            </select>

            <div className="relative w-full sm:w-64">
              <Search size={14} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink/35" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search product, category, seller..."
                className="w-full rounded-full border border-ink/10 bg-card py-2.5 pl-9 pr-4 text-sm text-ink placeholder:text-ink/35 outline-none transition-colors focus:border-teal/50 focus:ring-2 focus:ring-teal/15"
              />
            </div>
          </div>
        </div>

        <p className="mt-4 text-xs font-medium text-ink/40">
          {filtered.length === ADMIN_CATALOGUES.length
            ? `${ADMIN_CATALOGUES.length} entr${ADMIN_CATALOGUES.length === 1 ? 'y' : 'ies'}`
            : `${filtered.length} of ${ADMIN_CATALOGUES.length} entries`}
        </p>

        <div className={`mt-3 overflow-hidden ${panelClass}`}>
          <div className="sticky top-0 z-10 hidden grid-cols-[1.8fr_1fr_0.9fr_0.9fr_0.9fr_1fr] gap-2 border-b border-ink/10 bg-parchment/70 px-5 py-3 text-[11px] font-semibold tracking-wide text-ink/45 sm:grid">
            {COLUMNS.map((label) => (
              <span key={label}>{label}</span>
            ))}
          </div>

          {filtered.length === 0 ? (
            <EmptyState hasAnyFilter={hasAnyFilter} onClearFilters={clearFilters} />
          ) : (
            filtered.map((c) => (
              <CatalogueRow key={c.id} entry={c} onOpen={() => router.push(`/admin/catalogues/${c.id}`)} />
            ))
          )}
        </div>
      </div>
    </div>
  )
}

function EmptyState({ hasAnyFilter, onClearFilters }: { hasAnyFilter: boolean; onClearFilters: () => void }) {
  const router = useRouter()

  if (hasAnyFilter) {
    return (
      <div className="flex flex-col items-center gap-3 px-4 py-16 text-center">
        <SearchX size={22} className="text-ink/25" />
        <div>
          <p className="text-sm font-semibold text-ink/70">No entries match this filter</p>
          <p className="mt-1 text-xs text-ink/45">Try a different search term, status, or seller.</p>
        </div>
        <button
          type="button"
          onClick={onClearFilters}
          className="mt-1 text-xs font-semibold text-teal-deep underline decoration-dotted underline-offset-4 hover:text-teal"
        >
          Clear filters
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center gap-3 px-4 py-16 text-center">
      <Inbox size={22} className="text-ink/25" />
      <div>
        <p className="text-sm font-semibold text-ink/70">No catalogue entries yet</p>
        <p className="mt-1 max-w-xs text-xs text-ink/45">Add your first product for a Sri Lanka listing.</p>
      </div>
      <button
        type="button"
        onClick={() => router.push('/admin/catalogues/new')}
        className="mt-1 flex items-center gap-1.5 rounded-lg bg-teal-deep px-3 py-1.5 text-xs font-semibold text-parchment transition-colors hover:bg-teal"
      >
        <Plus size={13} strokeWidth={2.5} />
        Add catalogue entry
      </button>
    </div>
  )
}

function CatalogueRow({ entry, onOpen }: { entry: CatalogueEntry; onOpen: () => void }) {
  const thumb = entry.images[0]

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') onOpen()
      }}
      className={`group relative grid w-full cursor-pointer grid-cols-[auto_1fr_auto] items-center gap-3 border-b border-ink/[0.06] px-5 py-3.5 pl-6 text-left outline-none transition-colors before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:content-[''] last:border-b-0 hover:bg-parchment/50 focus-visible:bg-teal/[0.08] focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-teal/40 sm:grid-cols-[1.8fr_1fr_0.9fr_0.9fr_0.9fr_1fr_auto] ${
        entry.pendingChange
          ? 'before:bg-gold-deep'
          : entry.status === 'active'
          ? 'before:bg-teal-deep/70'
          : entry.status === 'draft'
          ? 'before:bg-gold-deep'
          : 'before:bg-transparent'
      }`}
    >
      <span className="col-span-2 flex min-w-0 items-center gap-3 sm:col-span-1">
        <span className="grid h-10 w-10 flex-none place-items-center overflow-hidden rounded-lg border border-dashed border-ink/15 bg-white">
          {thumb ? (
            // eslint-disable-next-line @next/next/no-img-element -- arbitrary source-store image URLs
            <img src={thumb} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
          ) : (
            <BookOpen size={14} className="text-ink/20" />
          )}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold text-ink">{entry.title}</span>
          {entry.pendingChange && (
            <span className="mt-0.5 flex items-center gap-1 text-xs font-semibold text-gold-deep">
              <Clock size={11} />
              Change proposed by {entry.pendingChange.submittedBy === 'seller' ? 'seller' : 'admin'}
            </span>
          )}
        </span>
      </span>

      <span className="hidden truncate text-sm text-ink/55 sm:block">{getSellerName(entry.sellerId)}</span>
      <span className="hidden truncate text-sm text-ink/55 sm:block">{entry.category ?? '—'}</span>

      <span className="hidden sm:block">
        <span className="text-sm font-bold text-teal-deep">
          {entry.currency} {entry.sellingPrice.toLocaleString()}
        </span>
      </span>

      <span className="hidden sm:block">
        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_PILL[entry.status]}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[entry.status]}`} />
          {STATUS_LABEL[entry.status]}
        </span>
      </span>

      <span className="hidden items-center gap-1.5 text-xs text-ink/40 sm:flex">
        <Calendar size={12} />
        {new Date(entry.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
      </span>

      <ChevronRight size={16} className="hidden flex-none text-ink/25 transition-colors group-hover:text-ink/50 sm:block" />

      <span className="col-span-3 flex items-center justify-between gap-2 pl-13 sm:hidden">
        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_PILL[entry.status]}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[entry.status]}`} />
          {STATUS_LABEL[entry.status]}
        </span>
        <span className="text-sm font-bold text-teal-deep">
          {entry.currency} {entry.sellingPrice.toLocaleString()}
        </span>
      </span>
    </div>
  )
}