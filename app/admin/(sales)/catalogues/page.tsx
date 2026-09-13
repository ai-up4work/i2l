// app/admin/(sales)/catalogues/page.tsx
//
// Rebuilt from scratch. The old version managed a seller-proposal /
// admin-approve-reject workflow entirely in a mock in-memory array. Per
// the actual decision made for this feature: sellers now log in and edit
// their own products directly (app/seller/(dashboard)/products) — no
// approval step. This page is now a read-mostly overview across every
// manual-mode seller's real catalogue, with the one thing that's still
// genuinely admin's call: the margin (see [catalogueId]/page.tsx).
'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Plus, Search } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { panelClass } from '@/components/admin/seller/shared'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog'

// Slugifies a store name into a platform slug — same logic as the seller
// wizard's own `slugify` (app/admin/(sales)/sellers/[sellerId]/SellerFormClient.tsx),
// duplicated locally rather than shared since that one's a component-local
// const, not an export.
function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

const emptyStoreForm = {
  storeName: '',
  contactName: '',
  contactEmail: '',
  contactPhone: '',
  notes: '',
}

type Row = {
  id: string
  name: string
  category: string | null
  cost_price: number | null
  margin_percent: number | null
  price: number
  currency: string
  stock_count: number | null
  active: boolean
  seller_id: string
  sellers: { name: string; platform_slug: string } | null
}

export default function CataloguesPage() {
  const router = useRouter()
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  // ---- Add manual store ----
  // A shortcut into exactly one path of the full seller wizard
  // (app/admin/(sales)/sellers/[sellerId]): provider type "Mock", i.e. a
  // seller with no feed/link at all who logs in and adds their own
  // products by hand. No store URL field here on purpose — manual
  // sellers don't have one, and the full wizard only asks for it to
  // auto-detect a feed, which doesn't apply here.
  const [storeDialogOpen, setStoreDialogOpen] = useState(false)
  const [storeForm, setStoreForm] = useState(emptyStoreForm)
  const [creatingStore, setCreatingStore] = useState(false)
  const [storeFormError, setStoreFormError] = useState<string | null>(null)

  function openAddStoreDialog() {
    setStoreForm(emptyStoreForm)
    setStoreFormError(null)
    setStoreDialogOpen(true)
  }

  async function handleCreateStore(e: React.FormEvent) {
    e.preventDefault()
    if (!storeForm.storeName.trim()) return setStoreFormError('Store name is required.')
    if (!storeForm.contactEmail.trim()) return setStoreFormError('Contact email is required.')

    const platform = slugify(storeForm.storeName)
    if (!platform) return setStoreFormError('Store name needs at least one letter or number.')

    setCreatingStore(true)
    setStoreFormError(null)
    try {
      const res = await fetch('/api/admin/sellers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storeName: storeForm.storeName.trim(),
          platform,
          contactName: storeForm.contactName.trim() || undefined,
          contactEmail: storeForm.contactEmail.trim(),
          contactPhone: storeForm.contactPhone.trim() || undefined,
          notes: storeForm.notes.trim() || undefined,
          // No storeUrl — that's the whole point of this shortcut.
          providerConfig: { type: 'mock' },
          status: 'active', // mock has no feed to verify, so it's live right away
        }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? 'Failed to create store')
      // Land on the seller's own page next — that's where "Create seller
      // login" lives, which this admin will want to do immediately so the
      // seller can actually start adding products.
      router.push(`/admin/sellers/${platform}`)
    } catch (err) {
      setStoreFormError(err instanceof Error ? err.message : 'Failed to create store')
      setCreatingStore(false)
    }
  }

  useEffect(() => {
    const supabase = createClient()
    supabase
      .from('products')
      .select('id, name, category, cost_price, margin_percent, price, currency, stock_count, active, seller_id, sellers(name, platform_slug)')
      .order('created_at', { ascending: false })
      .then(({ data, error: fetchError }) => {
        if (fetchError) setError(fetchError.message)
        else setRows((data ?? []) as unknown as Row[])
        setLoading(false)
      })
  }, [])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return rows
    return rows.filter(
      (r) => r.name.toLowerCase().includes(q) || r.sellers?.name.toLowerCase().includes(q),
    )
  }, [rows, search])

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl text-ink">Catalogues</h1>
          <p className="mt-1 text-sm text-ink/55">
            Products from every manual-mode seller. Sellers add these directly from their own portal —
            open one here to adjust WishDrop's margin.
          </p>
        </div>
        <button
          type="button"
          onClick={openAddStoreDialog}
          className="flex flex-none items-center gap-1.5 rounded-xl bg-teal-deep px-4 py-2.5 text-sm font-semibold text-parchment shadow-[0_10px_28px_-10px_rgba(11,114,128,0.55)] transition-all hover:bg-teal active:scale-[0.98]"
        >
          <Plus size={16} strokeWidth={2.5} />
          Add manual store
        </button>
      </div>

      <div className="mt-5 flex items-center gap-2 rounded-xl border border-ink/10 bg-card px-3 py-2">
        <Search size={16} className="text-ink/35" />
        <input
          placeholder="Search product or seller…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full bg-transparent text-sm outline-none"
        />
      </div>

      <div className={`mt-4 overflow-hidden ${panelClass}`}>
        {loading ? (
          <div className="flex flex-col items-center gap-2 py-16 text-ink/50">
            <Loader2 size={20} className="animate-spin" />
            <p className="text-sm">Loading catalogue…</p>
          </div>
        ) : error ? (
          <p className="px-5 py-10 text-center text-sm font-semibold text-red-700">{error}</p>
        ) : filtered.length === 0 ? (
          <p className="px-5 py-16 text-center text-sm text-ink/50">
            {rows.length === 0 ? (
              <>
                No products yet — nothing shows up here until a manual-mode seller has a login and adds
                their own products.{' '}
                <button type="button" onClick={openAddStoreDialog} className="font-semibold text-teal-deep underline">
                  Add a manual store
                </button>{' '}
                to get one started.
              </>
            ) : (
              'No products match your search.'
            )}
          </p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="border-b border-ink/10 text-xs font-semibold uppercase tracking-wide text-ink/40">
              <tr>
                <th className="px-5 py-3">Product</th>
                <th className="px-5 py-3">Seller</th>
                <th className="px-5 py-3">Cost</th>
                <th className="px-5 py-3">Margin</th>
                <th className="px-5 py-3">Selling price</th>
                <th className="px-5 py-3">Stock</th>
                <th className="px-5 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr
                  key={r.id}
                  onClick={() => router.push(`/admin/catalogues/${r.id}`)}
                  className="cursor-pointer border-b border-ink/5 last:border-0 hover:bg-ink/[0.02]"
                >
                  <td className="px-5 py-3 font-medium text-ink">{r.name}</td>
                  <td className="px-5 py-3 text-ink/70">{r.sellers?.name ?? '—'}</td>
                  <td className="px-5 py-3 text-ink/70">
                    {r.currency} {r.cost_price?.toFixed(2) ?? '—'}
                  </td>
                  <td className="px-5 py-3 text-ink/70">{r.margin_percent ?? '—'}%</td>
                  <td className="px-5 py-3 font-semibold text-ink">
                    {r.currency} {r.price.toFixed(2)}
                  </td>
                  <td className="px-5 py-3 text-ink/70">{r.stock_count ?? '—'}</td>
                  <td className="px-5 py-3">
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                        r.active ? 'bg-teal/10 text-teal-deep' : 'bg-ink/5 text-ink/40'
                      }`}
                    >
                      {r.active ? 'Active' : 'Hidden'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Dialog open={storeDialogOpen} onOpenChange={setStoreDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add a manual store</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-ink/55">
            For a seller with no website or feed to pull from — they'll log in and add products by hand.
            No link needed.
          </p>
          <form onSubmit={handleCreateStore} className="flex flex-col gap-3">
            <input
              required
              placeholder="Store name"
              value={storeForm.storeName}
              onChange={(e) => setStoreForm((f) => ({ ...f, storeName: e.target.value }))}
              className="rounded-xl border border-ink/15 px-3.5 py-2.5 text-sm outline-none focus:border-teal"
            />
            <input
              required
              type="email"
              placeholder="Contact email"
              value={storeForm.contactEmail}
              onChange={(e) => setStoreForm((f) => ({ ...f, contactEmail: e.target.value }))}
              className="rounded-xl border border-ink/15 px-3.5 py-2.5 text-sm outline-none focus:border-teal"
            />
            <div className="grid grid-cols-2 gap-3">
              <input
                placeholder="Contact name (optional)"
                value={storeForm.contactName}
                onChange={(e) => setStoreForm((f) => ({ ...f, contactName: e.target.value }))}
                className="rounded-xl border border-ink/15 px-3.5 py-2.5 text-sm outline-none focus:border-teal"
              />
              <input
                placeholder="Contact phone (optional)"
                value={storeForm.contactPhone}
                onChange={(e) => setStoreForm((f) => ({ ...f, contactPhone: e.target.value }))}
                className="rounded-xl border border-ink/15 px-3.5 py-2.5 text-sm outline-none focus:border-teal"
              />
            </div>
            <textarea
              placeholder="Notes (optional)"
              value={storeForm.notes}
              onChange={(e) => setStoreForm((f) => ({ ...f, notes: e.target.value }))}
              rows={2}
              className="rounded-xl border border-ink/15 px-3.5 py-2.5 text-sm outline-none focus:border-teal"
            />

            {storeFormError && <p className="text-sm font-medium text-red-600">{storeFormError}</p>}

            <DialogFooter>
              <DialogClose asChild>
                <button type="button" className="rounded-xl px-4 py-2.5 text-sm font-semibold text-ink/60">
                  Cancel
                </button>
              </DialogClose>
              <button
                type="submit"
                disabled={creatingStore}
                className="rounded-xl bg-teal px-4 py-2.5 text-sm font-bold text-white hover:bg-teal-deep disabled:opacity-60"
              >
                {creatingStore ? 'Creating…' : 'Add store'}
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}