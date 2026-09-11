'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Calendar, ChevronRight, Inbox, Layers, Plus, Search, SearchX } from 'lucide-react'

import { ADMIN_COLLECTIONS, STATUS_LABEL, type Collection, type CollectionStatus } from '@/data/collections/data'
import { panelClass, STATUS_DOT, STATUS_PILL, STATUS_EDGE, CollectionThumb } from '@/components/admin/collections/shared'

// ---------------------------------------------------------------------------
// /admin/collections — Sales & Purchase Executive
// View the list of merchandising collections; search/filter by status.
// Structurally identical to /admin/sellers: same header shape, same pill
// filter + search row, same sticky-header table panel, same status dot/
// pill/left-edge system, same two-flavour empty state. Reads
// ADMIN_COLLECTIONS directly (a flat constant) rather than through a
// getter, for the same reason ADMIN_SELLERS is read directly — the list
// page needs the whole set up front for search/filter.
// ---------------------------------------------------------------------------

type StatusFilter = 'all' | CollectionStatus

const COLUMNS = ['Collection', 'Items', 'Status', 'Updated']

export default function CollectionsListPage() {
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return ADMIN_COLLECTIONS.filter((c) => {
      const matchesSearch = !q || c.name.toLowerCase().includes(q)
      const matchesStatus = statusFilter === 'all' || c.status === statusFilter
      return matchesSearch && matchesStatus
    })
  }, [search, statusFilter])

  const hasAnyFilter = search.trim().length > 0 || statusFilter !== 'all'
  const clearFilters = () => {
    setSearch('')
    setStatusFilter('all')
  }

  return (
    <div className="min-h-screen bg-parchment font-body text-ink">
      <div className="mx-auto max-w-[1560px] px-6 pb-20 pt-10 lg:px-10">
        {/* ── Header ── */}
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-4">
            <div className="grid h-14 w-14 flex-none place-items-center rounded-2xl border border-ink/10 bg-card text-teal-deep shadow-[0_1px_2px_rgba(32,36,43,0.04),0_16px_40px_-24px_rgba(14,140,156,0.4)]">
              <Layers size={22} strokeWidth={1.75} />
            </div>
            <div>
              <h1 className="font-display text-3xl text-ink">Collections</h1>
              <p className="mt-1.5 max-w-md text-sm leading-relaxed text-ink/60">
                Curated, cross-seller shelves customers see on the storefront. Add a new one, or
                open an existing collection to edit its details or items.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => router.push('/admin/collections/new')}
            className="flex flex-none items-center gap-1.5 rounded-xl bg-teal-deep px-4 py-2.5 text-sm font-semibold text-parchment shadow-[0_10px_28px_-10px_rgba(11,114,128,0.55)] transition-all hover:bg-teal active:scale-[0.98]"
          >
            <Plus size={16} strokeWidth={2.5} />
            Add collection
          </button>
        </div>

        {/* ── Filters ── */}
        <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-1 rounded-full border border-ink/10 bg-card p-1">
            {(['all', 'published', 'draft'] as StatusFilter[]).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setStatusFilter(f)}
                className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal ${
                  statusFilter === f
                    ? 'bg-teal-deep text-parchment shadow-[0_6px_18px_-8px_rgba(14,140,156,0.5)]'
                    : 'text-ink/55 hover:text-ink/80'
                }`}
              >
                {f === 'all' ? 'All' : STATUS_LABEL[f]}
              </button>
            ))}
          </div>

          <div className="relative w-full sm:w-64">
            <Search size={14} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink/35" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search collections..."
              className="w-full rounded-full border border-ink/10 bg-card py-2.5 pl-9 pr-4 text-sm text-ink placeholder:text-ink/35 outline-none transition-colors focus:border-teal/50 focus:ring-2 focus:ring-teal/15"
            />
          </div>
        </div>

        {/* ── Result count ── */}
        <p className="mt-4 text-xs font-medium text-ink/40">
          {filtered.length === ADMIN_COLLECTIONS.length
            ? `${ADMIN_COLLECTIONS.length} collection${ADMIN_COLLECTIONS.length === 1 ? '' : 's'}`
            : `${filtered.length} of ${ADMIN_COLLECTIONS.length} collections`}
        </p>

        {/* ── Table ── */}
        <div className={`mt-3 overflow-hidden ${panelClass}`}>
          <div className="sticky top-0 z-10 hidden grid-cols-[1.8fr_0.8fr_0.9fr_1fr] gap-2 border-b border-ink/10 bg-parchment/70 px-5 py-3 text-[11px] font-semibold tracking-wide text-ink/45 sm:grid">
            {COLUMNS.map((label, i) => (
              <span key={label} className={i === 1 ? 'text-right' : ''}>
                {label}
              </span>
            ))}
          </div>

          {filtered.length === 0 ? (
            <EmptyState hasAnyFilter={hasAnyFilter} onClearFilters={clearFilters} />
          ) : (
            filtered.map((c) => (
              <CollectionRow key={c.id} collection={c} onOpen={() => router.push(`/admin/collections/${c.id}`)} />
            ))
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * Same split as the sellers list's EmptyState: "nothing matches your
 * search/filter" (recoverable, offer to clear) vs. "there are no
 * collections yet" (an onboarding moment, offer to create one).
 */
function EmptyState({ hasAnyFilter, onClearFilters }: { hasAnyFilter: boolean; onClearFilters: () => void }) {
  const router = useRouter()

  if (hasAnyFilter) {
    return (
      <div className="flex flex-col items-center gap-3 px-4 py-16 text-center">
        <SearchX size={22} className="text-ink/25" />
        <div>
          <p className="text-sm font-semibold text-ink/70">No collections match this filter</p>
          <p className="mt-1 text-xs text-ink/45">Try a different search term or status.</p>
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
        <p className="text-sm font-semibold text-ink/70">No collections yet</p>
        <p className="mt-1 max-w-xs text-xs text-ink/45">
          Create your first collection to start curating a shelf for customers.
        </p>
      </div>
      <button
        type="button"
        onClick={() => router.push('/admin/collections/new')}
        className="mt-1 flex items-center gap-1.5 rounded-lg bg-teal-deep px-3 py-1.5 text-xs font-semibold text-parchment transition-colors hover:bg-teal"
      >
        <Plus size={13} strokeWidth={2.5} />
        Add collection
      </button>
    </div>
  )
}

function CollectionRow({ collection, onOpen }: { collection: Collection; onOpen: () => void }) {
  const coverImage = collection.items[0]?.image

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') onOpen()
      }}
      className={`group relative grid w-full cursor-pointer grid-cols-[auto_1fr_auto] items-center gap-3 border-b border-ink/[0.06] px-5 py-3.5 pl-6 text-left outline-none transition-colors before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:content-[''] last:border-b-0 hover:bg-parchment/50 focus-visible:bg-teal/[0.08] focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-teal/40 sm:grid-cols-[1.8fr_0.8fr_0.9fr_1fr_auto] ${STATUS_EDGE[collection.status]}`}
    >
      <span className="col-span-2 flex min-w-0 items-center gap-3 sm:col-span-1">
        <CollectionThumb name={collection.name} image={coverImage} />
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold text-ink">{collection.name}</span>
          {collection.description && (
            <span className="block truncate text-xs text-ink/45">{collection.description}</span>
          )}
        </span>
      </span>

      <span className="hidden justify-self-end text-sm text-ink/55 sm:block">{collection.items.length}</span>

      <span className="hidden sm:block">
        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_PILL[collection.status]}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[collection.status]}`} />
          {STATUS_LABEL[collection.status]}
        </span>
      </span>

      <span className="hidden items-center gap-1.5 text-xs text-ink/40 sm:flex">
        <Calendar size={12} />
        {new Date(collection.updatedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
      </span>

      <ChevronRight size={16} className="hidden flex-none text-ink/25 transition-colors group-hover:text-ink/50 sm:block" />

      {/* mobile-only: item count + status chip since the grid above collapses */}
      <span className="col-span-3 flex items-center justify-between gap-2 pl-11 sm:hidden">
        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_PILL[collection.status]}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[collection.status]}`} />
          {STATUS_LABEL[collection.status]}
        </span>
        <span className="text-sm font-semibold text-ink/70">{collection.items.length} items</span>
      </span>
    </div>
  )
}