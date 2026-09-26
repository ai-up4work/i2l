// app/seller/(dashboard)/products/page.tsx
//
// A custom seller's own product list. All reads/writes go through
// /api/seller/products (server-side, scoped to this seller) rather than
// straight to Supabase from the browser — that used to let a seller send
// any price they liked, and hid their own hidden products from them
// (RLS only lets the browser read active products). The seller enters
// their COST; Wishdrop's markup and the selling price are applied on the
// server. Products show on the seller's store page (/stores/<slug>) as
// soon as they're saved and active.
'use client'

import { useEffect, useState } from 'react'
import { Plus, Pencil, Trash2, Loader2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog'

type ProductRow = {
  id: string
  name: string
  description: string | null
  category: string | null
  cost_price: number | null
  margin_percent: number | null
  price: number
  currency: string
  stock_count: number | null
  images: string[]
  weight_kg: number | null
  active: boolean
}

const emptyForm = {
  name: '',
  description: '',
  category: '',
  costPrice: '',
  stockCount: '',
  weightKg: '',
  imageUrls: '',
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) } })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.error ?? 'Something went wrong')
  return body as T
}

export default function SellerProductsPage() {
  const [defaultMargin, setDefaultMargin] = useState(25)
  const [products, setProducts] = useState<ProductRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  useEffect(() => {
    api<{ products: ProductRow[]; defaultMarginPercent: number }>('/api/seller/products')
      .then((body) => {
        setProducts(body.products)
        setDefaultMargin(body.defaultMarginPercent)
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  function openAddDialog() {
    setEditingId(null)
    setForm(emptyForm)
    setFormError(null)
    setDialogOpen(true)
  }

  function openEditDialog(p: ProductRow) {
    setEditingId(p.id)
    setForm({
      name: p.name,
      description: p.description ?? '',
      category: p.category ?? '',
      costPrice: String(p.cost_price ?? ''),
      stockCount: p.stock_count != null ? String(p.stock_count) : '',
      weightKg: p.weight_kg != null ? String(p.weight_kg) : '',
      imageUrls: (p.images ?? []).join('\n'),
    })
    setFormError(null)
    setDialogOpen(true)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const cost = Number(form.costPrice)
    if (!form.name.trim()) return setFormError('Product name is required.')
    if (!Number.isFinite(cost) || cost <= 0) return setFormError('Enter a valid cost price.')

    setSaving(true)
    setFormError(null)
    try {
      // Only the seller's own fields — the server applies Wishdrop's
      // margin and works out the selling price.
      const payload = {
        name: form.name.trim(),
        description: form.description.trim() || null,
        category: form.category.trim() || null,
        costPrice: cost,
        stockCount: form.stockCount.trim() || null,
        weightKg: form.weightKg.trim() || null,
        images: form.imageUrls
          .split(/\s+/)
          .map((u) => u.trim())
          .filter(Boolean),
      }

      if (editingId) {
        const { product } = await api<{ product: ProductRow }>(`/api/seller/products/${editingId}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        })
        setProducts((prev) => prev.map((p) => (p.id === editingId ? product : p)))
      } else {
        const { product } = await api<{ product: ProductRow }>('/api/seller/products', {
          method: 'POST',
          body: JSON.stringify(payload),
        })
        setProducts((prev) => [product, ...prev])
      }
      setDialogOpen(false)
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(p: ProductRow) {
    if (!window.confirm(`Delete "${p.name}"? To stop selling it for now, click its status to hide it instead.`)) return
    const previous = products
    setProducts((prev) => prev.filter((row) => row.id !== p.id))
    try {
      await api(`/api/seller/products/${p.id}`, { method: 'DELETE' })
    } catch (err) {
      setProducts(previous)
      setError((err as Error).message)
    }
  }

  async function handleToggleActive(p: ProductRow) {
    const previous = products
    setProducts((prev) => prev.map((row) => (row.id === p.id ? { ...row, active: !row.active } : row)))
    try {
      await api(`/api/seller/products/${p.id}`, { method: 'PATCH', body: JSON.stringify({ active: !p.active }) })
    } catch (err) {
      setProducts(previous)
      setError((err as Error).message)
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center gap-2 py-20 text-ink/50">
        <Loader2 size={22} className="animate-spin" />
        <p className="text-sm">Loading your products…</p>
      </div>
    )
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl text-ink">My products</h2>
          <p className="mt-1 text-sm text-ink/55">
            Add your cost price — Wishdrop&rsquo;s {defaultMargin}% markup is applied automatically. No
            approval needed; active products show on your store page right away.
          </p>
        </div>
        <button
          type="button"
          onClick={openAddDialog}
          className="flex items-center gap-2 rounded-lg bg-ink px-5 py-2.5 text-sm font-semibold text-white hover:bg-ink/90"
        >
          <Plus size={16} /> Add product
        </button>
      </div>

      {error && <p className="mt-4 text-sm font-medium text-red-600">{error}</p>}

      {products.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-dashed border-ink/15 px-6 py-16 text-center text-sm text-ink/55">
          No products yet.{' '}
          <button onClick={openAddDialog} className="font-semibold text-teal-deep underline">
            Add your first one
          </button>
          .
        </div>
      ) : (
        <div className="mt-6 overflow-hidden rounded-2xl border border-ink/10 bg-card">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-ink/10 text-xs font-semibold uppercase tracking-wide text-ink/40">
              <tr>
                <th className="px-5 py-3">Product</th>
                <th className="px-5 py-3">Cost price</th>
                <th className="px-5 py-3">Selling price</th>
                <th className="px-5 py-3">Stock</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.id} className="border-b border-ink/5 last:border-0">
                  <td className="px-5 py-3 font-medium text-ink">{p.name}</td>
                  <td className="px-5 py-3 text-ink/70">
                    {p.currency} {p.cost_price?.toFixed(2)}
                  </td>
                  <td className="px-5 py-3 text-ink/70">
                    {p.currency} {p.price?.toFixed(2)}{' '}
                    <span className="text-xs text-ink/40">(+{p.margin_percent}%)</span>
                  </td>
                  <td className="px-5 py-3 text-ink/70">{p.stock_count ?? '—'}</td>
                  <td className="px-5 py-3">
                    <button
                      onClick={() => handleToggleActive(p)}
                      className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                        p.active ? 'bg-teal/10 text-teal-deep' : 'bg-ink/5 text-ink/40'
                      }`}
                    >
                      {p.active ? 'Active' : 'Hidden'}
                    </button>
                  </td>
                  <td className="px-5 py-3 text-right">
                    <button onClick={() => openEditDialog(p)} className="mr-3 text-ink/50 hover:text-teal-deep">
                      <Pencil size={15} />
                    </button>
                    <button onClick={() => handleDelete(p)} className="text-ink/50 hover:text-red-600">
                      <Trash2 size={15} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? 'Edit product' : 'Add a product'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <input
              required
              placeholder="Product name"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className="rounded-xl border border-ink/15 px-3.5 py-2.5 text-sm outline-none focus:border-teal"
            />
            <textarea
              placeholder="Description (optional)"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              rows={3}
              className="rounded-xl border border-ink/15 px-3.5 py-2.5 text-sm outline-none focus:border-teal"
            />
            <input
              placeholder="Category (optional)"
              value={form.category}
              onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
              className="rounded-xl border border-ink/15 px-3.5 py-2.5 text-sm outline-none focus:border-teal"
            />
            <div className="grid grid-cols-2 gap-3">
              <input
                required
                type="number"
                min="0"
                step="0.01"
                placeholder="Cost price"
                value={form.costPrice}
                onChange={(e) => setForm((f) => ({ ...f, costPrice: e.target.value }))}
                className="rounded-xl border border-ink/15 px-3.5 py-2.5 text-sm outline-none focus:border-teal"
              />
              <input
                type="number"
                min="0"
                placeholder="Stock count"
                value={form.stockCount}
                onChange={(e) => setForm((f) => ({ ...f, stockCount: e.target.value }))}
                className="rounded-xl border border-ink/15 px-3.5 py-2.5 text-sm outline-none focus:border-teal"
              />
            </div>
            <input
              type="number"
              min="0"
              step="0.01"
              placeholder="Weight in kg (e.g. 0.4) — used for shipping"
              value={form.weightKg}
              onChange={(e) => setForm((f) => ({ ...f, weightKg: e.target.value }))}
              className="rounded-xl border border-ink/15 px-3.5 py-2.5 text-sm outline-none focus:border-teal"
            />
            <textarea
              placeholder="Photo links, one per line (https://…) — first one is the main photo"
              value={form.imageUrls}
              onChange={(e) => setForm((f) => ({ ...f, imageUrls: e.target.value }))}
              rows={3}
              className="rounded-xl border border-ink/15 px-3.5 py-2.5 text-sm outline-none focus:border-teal"
            />

            {formError && <p className="text-sm font-medium text-red-600">{formError}</p>}

            <DialogFooter>
              <DialogClose asChild>
                <button type="button" className="rounded-xl px-4 py-2.5 text-sm font-semibold text-ink/60">
                  Cancel
                </button>
              </DialogClose>
              <button
                type="submit"
                disabled={saving}
                className="rounded-xl bg-teal px-4 py-2.5 text-sm font-bold text-white hover:bg-teal-deep disabled:opacity-60"
              >
                {saving ? 'Saving…' : editingId ? 'Save changes' : 'Add product'}
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}