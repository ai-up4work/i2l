// app/seller/(dashboard)/products/page.tsx
'use client'

import { useEffect, useState } from 'react'
import { Plus, Pencil, Trash2, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
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
  active: boolean
}

const emptyForm = {
  name: '',
  description: '',
  category: '',
  costPrice: '',
  stockCount: '',
  imageUrl: '',
}

export default function SellerProductsPage() {
  const supabase = createClient()

  const [sellerId, setSellerId] = useState<string | null>(null)
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
    let cancelled = false
    ;(async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return

      const { data: seller, error: sellerError } = await supabase
        .from('sellers')
        .select('id, default_margin_percent')
        .eq('owner_user_id', user.id)
        .maybeSingle()
      if (cancelled) return
      if (sellerError || !seller) {
        setError(sellerError?.message ?? 'No seller linked to this login.')
        setLoading(false)
        return
      }
      setSellerId(seller.id)
      setDefaultMargin(Number(seller.default_margin_percent ?? 25))

      const { data: rows, error: productsError } = await supabase
        .from('products')
        .select('*')
        .eq('seller_id', seller.id)
        .order('created_at', { ascending: false })
      if (cancelled) return
      if (productsError) {
        setError(productsError.message)
      } else {
        setProducts(rows as ProductRow[])
      }
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

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
      imageUrl: p.images?.[0] ?? '',
    })
    setFormError(null)
    setDialogOpen(true)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!sellerId) return

    const cost = Number(form.costPrice)
    if (!form.name.trim()) return setFormError('Product name is required.')
    if (!Number.isFinite(cost) || cost <= 0) return setFormError('Enter a valid cost price.')

    setSaving(true)
    setFormError(null)
    try {
      // margin_percent is WishDrop's own markup, not the seller's to set —
      // applied automatically from the seller's default. price is derived
      // here client-side for immediate display; it's recomputed the same
      // way anywhere else it's edited (e.g. admin Catalogues) so the two
      // never drift apart.
      const margin = defaultMargin
      const price = Math.round(cost * (1 + margin / 100) * 100) / 100

      const payload = {
        name: form.name.trim(),
        description: form.description.trim() || null,
        category: form.category.trim() || null,
        cost_price: cost,
        margin_percent: margin,
        price,
        stock_count: form.stockCount.trim() ? Number(form.stockCount) : null,
        images: form.imageUrl.trim() ? [form.imageUrl.trim()] : [],
      }

      if (editingId) {
        const { data, error: updateError } = await supabase
          .from('products')
          .update(payload)
          .eq('id', editingId)
          .select()
          .single()
        if (updateError) throw updateError
        setProducts((prev) => prev.map((p) => (p.id === editingId ? (data as ProductRow) : p)))
      } else {
        const handle = form.name
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/(^-|-$)/g, '')
        const { data, error: insertError } = await supabase
          .from('products')
          .insert({ ...payload, seller_id: sellerId, handle, currency: 'INR', active: true })
          .select()
          .single()
        if (insertError) throw insertError
        setProducts((prev) => [data as ProductRow, ...prev])
      }
      setDialogOpen(false)
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    const previous = products
    setProducts((prev) => prev.filter((p) => p.id !== id))
    const { error: deleteError } = await supabase.from('products').delete().eq('id', id)
    if (deleteError) {
      setProducts(previous)
      setError(deleteError.message)
    }
  }

  async function handleToggleActive(p: ProductRow) {
    const previous = products
    setProducts((prev) => prev.map((row) => (row.id === p.id ? { ...row, active: !row.active } : row)))
    const { error: updateError } = await supabase.from('products').update({ active: !p.active }).eq('id', p.id)
    if (updateError) {
      setProducts(previous)
      setError(updateError.message)
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
            Add your cost price — WishDrop's {defaultMargin}% markup is applied automatically. No
            approval needed; changes go live right away.
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
                    <button onClick={() => handleDelete(p.id)} className="text-ink/50 hover:text-red-600">
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
              placeholder="Image URL (optional)"
              value={form.imageUrl}
              onChange={(e) => setForm((f) => ({ ...f, imageUrl: e.target.value }))}
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