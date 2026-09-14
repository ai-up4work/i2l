// app/account/address-book/page.tsx
'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Plus, MapPin, Pencil, Trash2, Star, Loader2 } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { createClient } from '@/lib/supabase/client'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog'

const EASE_OUT_EXPO = [0.16, 1, 0.3, 1] as const

export type Address = {
  id: string
  fullName: string
  phone: string
  line1: string
  line2?: string
  city: string
  region?: string
  postalCode?: string
  country: string
  isDefault?: boolean
}

type AddressRow = {
  id: string
  recipient_name: string
  phone: string
  address_line1: string
  address_line2: string | null
  city: string
  postal_code: string | null
  country: string
  is_default: boolean
}

function fromRow(row: AddressRow): Address {
  return {
    id: row.id,
    fullName: row.recipient_name,
    phone: row.phone,
    line1: row.address_line1,
    line2: row.address_line2 ?? undefined,
    city: row.city,
    postalCode: row.postal_code ?? undefined,
    country: row.country,
    isDefault: row.is_default,
  }
}

// Builds the single-line address string ("123 Main St, Apt 4, Colombo,
// Western Province, 10100, Sri Lanka") from whichever parts are present.
function formatAddress(address: Address): string {
  return [address.line1, address.line2, address.city, address.region, address.postalCode, address.country]
    .filter(Boolean)
    .join(', ')
}

const inputClass =
  'w-full rounded-xl border border-ink/15 bg-white px-3.5 py-2.5 text-sm text-ink placeholder:text-ink/35 transition-colors focus:border-teal-deep focus:outline-none focus:ring-2 focus:ring-teal/20'

function AddressCard({
  address,
  onEdit,
  onDelete,
  onSetDefault,
}: {
  address: Address
  onEdit: () => void
  onDelete: () => void
  onSetDefault?: () => void
}) {
  return (
    <div className="relative rounded-2xl border border-ink/10 bg-card p-5">
      {address.isDefault && (
        <span className="absolute right-5 top-5 rounded-full bg-teal/10 px-2.5 py-1 text-[11px] font-semibold text-teal-deep">
          Default
        </span>
      )}

      <div className="flex items-start gap-3 pr-20">
        <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-full bg-ink/[0.05] text-ink/45">
          <MapPin size={16} strokeWidth={1.8} />
        </span>
        <div className="min-w-0">
          <p className="font-semibold text-ink">{address.fullName}</p>
          <p className="mt-0.5 text-sm text-ink/55">{address.phone}</p>
          <p className="mt-2 text-sm leading-snug text-ink/70">{formatAddress(address)}</p>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-4 border-t border-ink/[0.06] pt-3.5 pl-12 text-sm font-semibold">
        <button
          type="button"
          onClick={onEdit}
          className="flex items-center gap-1.5 text-ink/60 transition-colors hover:text-teal-deep"
        >
          <Pencil size={14} strokeWidth={1.8} />
          Edit
        </button>
        {!address.isDefault && onSetDefault && (
          <button
            type="button"
            onClick={onSetDefault}
            className="flex items-center gap-1.5 text-ink/60 transition-colors hover:text-teal-deep"
          >
            <Star size={14} strokeWidth={1.8} />
            Set as default
          </button>
        )}
        <button
          type="button"
          onClick={onDelete}
          className="ml-auto flex items-center gap-1.5 text-ink/60 transition-colors hover:text-red-600"
        >
          <Trash2 size={14} strokeWidth={1.8} />
          Delete
        </button>
      </div>
    </div>
  )
}

function EmptyState({ onAddAddress }: { onAddAddress: () => void }) {
  return (
    <div className="mx-auto mt-6 flex max-w-2xl flex-col items-center gap-3 rounded-2xl border border-dashed border-ink/15 px-6 py-16 text-center">
      <span className="grid size-12 place-items-center rounded-full bg-teal/10 text-teal-deep/40">
        <MapPin size={20} strokeWidth={1.8} />
      </span>
      <p className="text-sm text-ink/55">You haven&apos;t saved any addresses yet.</p>
      <button
        type="button"
        onClick={onAddAddress}
        className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-teal-deep px-5 py-2.5 text-sm font-semibold text-white transition-all hover:opacity-90 active:scale-[0.98]"
      >
        <Plus size={14} strokeWidth={2} />
        Add your first address
      </button>
    </div>
  )
}

const emptyForm = {
  fullName: '',
  phone: '',
  line1: '',
  line2: '',
  city: '',
  postalCode: '',
  country: 'Sri Lanka',
}

function AddressBookSkeleton() {
  return (
    <div className="mx-auto max-w-6xl px-6 pb-16 lg:px-10" aria-hidden="true">
      <div className="mt-10 flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-2">
          <div className="h-6 w-40 animate-pulse rounded bg-ink/[0.06]" />
          <div className="h-4 w-56 animate-pulse rounded bg-ink/[0.06]" />
        </div>
        <div className="h-11 w-40 animate-pulse rounded-full bg-ink/[0.06]" />
      </div>
      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        {[0, 1].map((i) => (
          <div key={i} className="h-[168px] w-full animate-pulse rounded-2xl bg-ink/[0.04]" />
        ))}
      </div>
    </div>
  )
}

export default function AddressBookPage() {
  const { user, loading: authLoading } = useAuth()
  const supabase = createClient()

  const [addresses, setAddresses] = useState<Address[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  useEffect(() => {
    if (authLoading) return
    if (!user) {
      setAddresses([])
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    supabase
      .from('addresses')
      .select('*')
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: false })
      .then(({ data, error: fetchError }) => {
        if (cancelled) return
        if (fetchError) {
          setError(fetchError.message)
        } else {
          setAddresses((data as AddressRow[]).map(fromRow))
          setError(null)
        }
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [user, authLoading]) // eslint-disable-line react-hooks/exhaustive-deps

  function openAddDialog() {
    setEditingId(null)
    setForm(emptyForm)
    setFormError(null)
    setDialogOpen(true)
  }

  function openEditDialog(address: Address) {
    setEditingId(address.id)
    setForm({
      fullName: address.fullName,
      phone: address.phone,
      line1: address.line1,
      line2: address.line2 ?? '',
      city: address.city,
      postalCode: address.postalCode ?? '',
      country: address.country,
    })
    setFormError(null)
    setDialogOpen(true)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!user) return
    if (!form.fullName.trim() || !form.phone.trim() || !form.line1.trim() || !form.city.trim()) {
      setFormError('Full name, phone, address line 1, and city are required.')
      return
    }

    setSaving(true)
    setFormError(null)
    try {
      const payload = {
        recipient_name: form.fullName.trim(),
        phone: form.phone.trim(),
        address_line1: form.line1.trim(),
        address_line2: form.line2.trim() || null,
        city: form.city.trim(),
        postal_code: form.postalCode.trim() || null,
        country: form.country.trim() || 'Sri Lanka',
      }

      if (editingId) {
        const { data, error: updateError } = await supabase
          .from('addresses')
          .update(payload)
          .eq('id', editingId)
          .select()
          .single()
        if (updateError) throw updateError
        setAddresses((prev) => prev.map((a) => (a.id === editingId ? fromRow(data as AddressRow) : a)))
      } else {
        const isFirst = addresses.length === 0
        const { data, error: insertError } = await supabase
          .from('addresses')
          .insert({ ...payload, user_id: user.id, is_default: isFirst })
          .select()
          .single()
        if (insertError) throw insertError
        setAddresses((prev) => [fromRow(data as AddressRow), ...prev])
      }
      setDialogOpen(false)
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    const previous = addresses
    setAddresses((prev) => prev.filter((a) => a.id !== id))
    const { error: deleteError } = await supabase.from('addresses').delete().eq('id', id)
    if (deleteError) {
      setAddresses(previous)
      setError(deleteError.message)
    }
  }

  async function handleSetDefault(id: string) {
    if (!user) return
    const previous = addresses
    setAddresses((prev) => prev.map((a) => ({ ...a, isDefault: a.id === id })))
    // No transaction across two statements from the browser client — clear
    // every other default first, then set the chosen one. Worst case on a
    // failure between the two is more than one non-default address, never
    // more than one default, so this fails safe.
    const { error: clearError } = await supabase
      .from('addresses')
      .update({ is_default: false })
      .eq('user_id', user.id)
      .neq('id', id)
    const { error: setError2 } = await supabase.from('addresses').update({ is_default: true }).eq('id', id)
    if (clearError || setError2) {
      setAddresses(previous)
      setError((clearError ?? setError2)?.message ?? 'Failed to set default address')
    }
  }

  const hasAddresses = addresses.length > 0

  if (loading) {
    return <AddressBookSkeleton />
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: EASE_OUT_EXPO }}
      className="mx-auto max-w-6xl px-6 pb-16 lg:px-10"
    >
      <div className="mt-10 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-xl text-ink sm:text-2xl">My Address Book</h1>
          <p className="mt-1 text-[13px] text-ink/40">
            Manage the addresses your orders ship to.
          </p>
        </div>
        <button
          type="button"
          onClick={openAddDialog}
          className="flex items-center gap-2 rounded-full bg-teal-deep px-5 py-2.5 text-sm font-semibold text-white transition-all hover:opacity-90 active:scale-[0.98]"
        >
          <Plus size={16} strokeWidth={2} />
          Add new address
        </button>
      </div>

      {error && <p className="mt-4 text-sm font-semibold text-red-600">{error}</p>}

      {hasAddresses ? (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.05, ease: EASE_OUT_EXPO }}
          className="mt-8 grid gap-4 sm:grid-cols-2"
        >
          {addresses.map((address) => (
            <AddressCard
              key={address.id}
              address={address}
              onEdit={() => openEditDialog(address)}
              onDelete={() => handleDelete(address.id)}
              onSetDefault={address.isDefault ? undefined : () => handleSetDefault(address.id)}
            />
          ))}
        </motion.div>
      ) : (
        <EmptyState onAddAddress={openAddDialog} />
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-display text-lg text-ink">
              {editingId ? 'Edit address' : 'Add a new address'}
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <input
              required
              placeholder="Full name"
              value={form.fullName}
              onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))}
              className={inputClass}
            />
            <input
              required
              placeholder="Phone"
              value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              className={inputClass}
            />
            <input
              required
              placeholder="Address line 1"
              value={form.line1}
              onChange={(e) => setForm((f) => ({ ...f, line1: e.target.value }))}
              className={inputClass}
            />
            <input
              placeholder="Address line 2 (optional)"
              value={form.line2}
              onChange={(e) => setForm((f) => ({ ...f, line2: e.target.value }))}
              className={inputClass}
            />
            <div className="grid grid-cols-2 gap-3">
              <input
                required
                placeholder="City"
                value={form.city}
                onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
                className={inputClass}
              />
              <input
                placeholder="Postal code"
                value={form.postalCode}
                onChange={(e) => setForm((f) => ({ ...f, postalCode: e.target.value }))}
                className={inputClass}
              />
            </div>
            <input
              placeholder="Country"
              value={form.country}
              onChange={(e) => setForm((f) => ({ ...f, country: e.target.value }))}
              className={inputClass}
            />

            {formError && <p className="text-sm font-semibold text-red-600">{formError}</p>}

            <DialogFooter>
              <DialogClose className="rounded-full px-4 py-2.5 text-sm font-semibold text-ink/50 transition-colors hover:bg-ink/[0.06] hover:text-ink">
                Cancel
              </DialogClose>
              <button
                type="submit"
                disabled={saving}
                className="rounded-full bg-teal-deep px-5 py-2.5 text-sm font-semibold text-white transition-all hover:opacity-90 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? 'Saving…' : editingId ? 'Save changes' : 'Add address'}
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </motion.div>
  )
}