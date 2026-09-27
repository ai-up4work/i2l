// components/admin/wishdrop-mall/CategoriesPanel.tsx
//
// The "Categories" tab of the Wishdrop Mall page: create, rename,
// describe, give an image, reorder (storefront order), hide/show and
// delete categories, and choose exactly which products are in each one
// ("Manage products"). Deleting a category never deletes products — they
// become uncategorized.
'use client'

import { useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, Eye, EyeOff, FolderPlus, Loader2, Pencil, Search, Tags, Trash2 } from 'lucide-react'
import type { MallCategory, MallProductRow } from '@/lib/wishdrop-mall'
import { Dialog, ICON_BUTTON, INPUT, PRIMARY_BUTTON, SECONDARY_BUTTON, Thumb, mallApi } from './shared'

export default function CategoriesPanel({
  categories,
  products,
  onCategoriesChange,
  onProductsMoved,
  onToast,
}: {
  categories: MallCategory[]
  products: MallProductRow[]
  onCategoriesChange: (next: MallCategory[]) => void
  /** Products whose category changed: id -> new category id (null = none). */
  onProductsMoved: (changes: Map<string, string | null>) => void
  onToast: (msg: string) => void
}) {
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<MallCategory | null>(null)
  const [managing, setManaging] = useState<MallCategory | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const uncategorized = products.filter((p) => !p.mall_category_id).length

  const create = async () => {
    const name = newName.trim()
    if (!name) return
    setCreating(true)
    try {
      const { category } = await mallApi<{ category: MallCategory }>('/api/admin/wishdrop-mall/categories', {
        method: 'POST',
        body: JSON.stringify({ name }),
      })
      onCategoriesChange([...categories, category])
      setNewName('')
      onToast(`Created “${category.name}”. Use “Manage products” to add products to it.`)
    } catch (e) {
      onToast((e as Error).message)
    } finally {
      setCreating(false)
    }
  }

  const move = async (index: number, dir: -1 | 1) => {
    const j = index + dir
    if (j < 0 || j >= categories.length) return
    const next = [...categories]
    ;[next[index], next[j]] = [next[j], next[index]]
    onCategoriesChange(next)
    try {
      await mallApi('/api/admin/wishdrop-mall/categories/reorder', {
        method: 'POST',
        body: JSON.stringify({ ids: next.map((c) => c.id) }),
      })
    } catch (e) {
      onCategoriesChange(categories)
      onToast((e as Error).message)
    }
  }

  const toggleActive = async (c: MallCategory) => {
    setBusyId(c.id)
    try {
      const { category } = await mallApi<{ category: MallCategory }>(`/api/admin/wishdrop-mall/categories/${c.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ active: !c.active }),
      })
      onCategoriesChange(categories.map((x) => (x.id === c.id ? { ...x, ...category } : x)))
    } catch (e) {
      onToast((e as Error).message)
    } finally {
      setBusyId(null)
    }
  }

  const remove = async (c: MallCategory) => {
    const msg =
      c.product_count > 0
        ? `Delete “${c.name}”? Its ${c.product_count} product(s) will become uncategorized (they are not deleted).`
        : `Delete “${c.name}”?`
    if (!window.confirm(msg)) return
    setBusyId(c.id)
    try {
      await mallApi(`/api/admin/wishdrop-mall/categories/${c.id}`, { method: 'DELETE' })
      onCategoriesChange(categories.filter((x) => x.id !== c.id))
      const changes = new Map<string, string | null>()
      products.filter((p) => p.mall_category_id === c.id).forEach((p) => changes.set(p.id, null))
      if (changes.size) onProductsMoved(changes)
      onToast(`Deleted “${c.name}”.`)
    } catch (e) {
      onToast((e as Error).message)
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div>
      <div className="flex flex-col gap-3 rounded-2xl max-w-8xl border border-ink/10 bg-card p-5 sm:flex-row sm:items-end">
        <label className="block flex-1">
          <span className="text-xs font-semibold text-ink/60">New category</span>
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && create()}
            placeholder="e.g. Sarees, Home & Kitchen, Kids"
            className={`${INPUT} mt-1`}
          />
        </label>
        <button type="button" onClick={create} disabled={creating || !newName.trim()} className={PRIMARY_BUTTON}>
          {creating ? <Loader2 size={14} className="animate-spin" /> : <FolderPlus size={14} />}
          Create category
        </button>
      </div>

      <p className="mt-4 text-xs text-ink/50">
        Shoppers see categories in this order, and only ones with at least one visible product. {uncategorized} product(s)
        are uncategorized; they still show under &ldquo;All&rdquo;.
      </p>

      {categories.length === 0 ? (
        <div className="mt-4 rounded-2xl border border-dashed border-ink/15 px-6 py-14 text-center">
          <Tags size={22} className="mx-auto text-ink/25" />
          <p className="mt-3 text-sm font-semibold text-ink/70">No categories yet</p>
          <p className="mt-1 text-xs text-ink/50">Create one above, then add products to it.</p>
        </div>
      ) : (
        <div className="mt-3 overflow-hidden rounded-2xl border border-ink/10 bg-card">
          {categories.map((c, i) => (
            <div key={c.id} className="flex flex-wrap items-center gap-3 border-b border-ink/5 px-4 py-3 last:border-0">
              <div className="flex flex-col">
                <button type="button" className={ICON_BUTTON} onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up">
                  <ArrowUp size={13} />
                </button>
                <button type="button" className={ICON_BUTTON} onClick={() => move(i, 1)} disabled={i === categories.length - 1} aria-label="Move down">
                  <ArrowDown size={13} />
                </button>
              </div>
              <Thumb src={c.image_url} alt="" size={44} />
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 font-semibold text-ink">
                  {c.name}
                  {!c.active && <span className="rounded-full bg-ink/10 px-2 py-0.5 text-[10px] font-semibold text-ink/50">Hidden</span>}
                </p>
                <p className="text-xs text-ink/45">
                  {c.product_count} product(s) · {c.live_count} visible
                  {c.active && c.live_count === 0 && ' · not shown to shoppers until it has a visible product'}
                </p>
              </div>
              <button type="button" onClick={() => setManaging(c)} className={SECONDARY_BUTTON}>
                Manage products
              </button>
              <div className="flex gap-1">
                <button type="button" className={ICON_BUTTON} onClick={() => setEditing(c)} aria-label="Edit category" title="Rename / description / image">
                  <Pencil size={14} />
                </button>
                <button
                  type="button"
                  className={ICON_BUTTON}
                  onClick={() => toggleActive(c)}
                  disabled={busyId === c.id}
                  aria-label={c.active ? 'Hide category' : 'Show category'}
                  title={c.active ? 'Hide from shoppers' : 'Show to shoppers'}
                >
                  {c.active ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
                <button
                  type="button"
                  className={`${ICON_BUTTON} hover:text-rose-700`}
                  onClick={() => remove(c)}
                  disabled={busyId === c.id}
                  aria-label="Delete category"
                  title="Delete (products are kept)"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <EditCategoryDialog
          category={editing}
          onClose={() => setEditing(null)}
          onSaved={(c) => {
            onCategoriesChange(categories.map((x) => (x.id === c.id ? { ...x, ...c } : x)))
            setEditing(null)
            onToast('Category saved.')
          }}
        />
      )}
      {managing && (
        <ManageProductsDialog
          category={managing}
          categories={categories}
          products={products}
          onClose={() => setManaging(null)}
          onSaved={(changes) => {
            onProductsMoved(changes)
            setManaging(null)
            onToast(`Updated products in “${managing.name}”.`)
          }}
        />
      )}
    </div>
  )
}

function EditCategoryDialog({
  category,
  onClose,
  onSaved,
}: {
  category: MallCategory
  onClose: () => void
  onSaved: (c: MallCategory) => void
}) {
  const [name, setName] = useState(category.name)
  const [description, setDescription] = useState(category.description ?? '')
  const [imageUrl, setImageUrl] = useState(category.image_url ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const save = async () => {
    setSaving(true)
    setError(null)
    try {
      const { category: saved } = await mallApi<{ category: MallCategory }>(`/api/admin/wishdrop-mall/categories/${category.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ name, description, imageUrl }),
      })
      onSaved(saved)
    } catch (e) {
      setError((e as Error).message)
      setSaving(false)
    }
  }

  return (
    <Dialog
      title="Edit category"
      onClose={onClose}
      footer={
        <div className="flex items-center justify-between gap-3">
          {error ? <p className="text-sm font-semibold text-rose-700">{error}</p> : <span />}
          <div className="flex gap-2">
            <button type="button" className={SECONDARY_BUTTON} onClick={onClose}>
              Cancel
            </button>
            <button type="button" className={PRIMARY_BUTTON} onClick={save} disabled={saving || !name.trim()}>
              {saving && <Loader2 size={14} className="animate-spin" />}
              Save
            </button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        <label className="block">
          <span className="text-xs font-semibold text-ink/60">Name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} className={`${INPUT} mt-1`} />
        </label>
        <label className="block">
          <span className="text-xs font-semibold text-ink/60">Description (optional)</span>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} className={`${INPUT} mt-1 resize-none`} />
        </label>
        <label className="block">
          <span className="text-xs font-semibold text-ink/60">Image link (optional)</span>
          <div className="mt-1 flex items-center gap-2">
            <Thumb src={imageUrl || null} alt="" size={40} />
            <input value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="https://…" className={INPUT} />
          </div>
        </label>
        <p className="text-xs text-ink/45">Renaming updates every product in this category automatically.</p>
      </div>
    </Dialog>
  )
}

function ManageProductsDialog({
  category,
  categories,
  products,
  onClose,
  onSaved,
}: {
  category: MallCategory
  categories: MallCategory[]
  products: MallProductRow[]
  onClose: () => void
  onSaved: (changes: Map<string, string | null>) => void
}) {
  const initial = useMemo(() => new Set(products.filter((p) => p.mall_category_id === category.id).map((p) => p.id)), [products, category.id])
  const [checked, setChecked] = useState<Set<string>>(initial)
  const [search, setSearch] = useState('')
  const [show, setShow] = useState<'all' | 'in' | 'uncategorized'>('all')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const nameOf = useMemo(() => new Map(categories.map((c) => [c.id, c.name])), [categories])
  const list = products.filter((p) => {
    if (show === 'in' && !checked.has(p.id)) return false
    if (show === 'uncategorized' && p.mall_category_id) return false
    const q = search.trim().toLowerCase()
    return !q || p.name.toLowerCase().includes(q)
  })

  const toggle = (id: string) =>
    setChecked((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const save = async () => {
    setSaving(true)
    setError(null)
    try {
      const { inCategory, removed } = await mallApi<{ inCategory: string[]; removed: string[] }>(
        `/api/admin/wishdrop-mall/categories/${category.id}/products`,
        { method: 'PUT', body: JSON.stringify({ productIds: Array.from(checked) }) },
      )
      const changes = new Map<string, string | null>()
      inCategory.forEach((id) => changes.set(id, category.id))
      removed.forEach((id) => changes.set(id, null))
      onSaved(changes)
    } catch (e) {
      setError((e as Error).message)
      setSaving(false)
    }
  }

  return (
    <Dialog
      title={`Products in “${category.name}”`}
      subtitle="Tick products to put them in this category. A product can be in one category at a time."
      onClose={onClose}
      wide
      footer={
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-ink/60">{error ? <span className="font-semibold text-rose-700">{error}</span> : `${checked.size} selected`}</p>
          <div className="flex gap-2">
            <button type="button" className={SECONDARY_BUTTON} onClick={onClose}>
              Cancel
            </button>
            <button type="button" className={PRIMARY_BUTTON} onClick={save} disabled={saving}>
              {saving && <Loader2 size={14} className="animate-spin" />}
              Save
            </button>
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink/35" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search products" className={`${INPUT} pl-8`} />
        </div>
        <select value={show} onChange={(e) => setShow(e.target.value as typeof show)} className={`${INPUT} sm:w-48`} aria-label="Show">
          <option value="all">All products</option>
          <option value="in">Ticked only</option>
          <option value="uncategorized">Uncategorized only</option>
        </select>
      </div>
      <div className="mt-3 max-h-[50vh] divide-y divide-ink/5 overflow-y-auto rounded-xl border border-ink/10">
        {list.map((p) => {
          const current = p.mall_category_id && p.mall_category_id !== category.id ? nameOf.get(p.mall_category_id) : null
          return (
            <label key={p.id} className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-ink/[0.02]">
              <input type="checkbox" checked={checked.has(p.id)} onChange={() => toggle(p.id)} className="accent-teal-deep" />
              <Thumb src={p.images[0]} alt="" size={36} />
              <span className="min-w-0 flex-1">
                <span className="line-clamp-1 text-sm text-ink">{p.name}</span>
                {current && (
                  <span className="text-[11px] text-ink/45">
                    Now in {current}
                    {checked.has(p.id) ? ` → will move to ${category.name}` : ''}
                  </span>
                )}
              </span>
              {!p.active && <span className="text-[11px] text-ink/40">Hidden</span>}
            </label>
          )
        })}
        {list.length === 0 && <p className="px-3 py-8 text-center text-sm text-ink/50">No products match.</p>}
      </div>
    </Dialog>
  )
}
