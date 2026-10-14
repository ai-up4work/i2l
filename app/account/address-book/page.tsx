// app/account/address-book/page.tsx
'use client'

import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, MapPin, Pencil, Trash2, Star, Loader2, X } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { createClient } from '@/lib/supabase/client'
import { AccountEmpty, AccountPage, AccountPageHeader, btnPrimary, btnSecondary, fieldClass, labelClass } from '@/components/account/AccountPageKit'

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

const inputClass = fieldClass

// Common shipping destinations. Extend as your service area grows —
// keeping this an explicit list (rather than free text) avoids typos
// like "srilanka" / "Sri lanka" ending up in the DB.
const COUNTRIES = [
  'Sri Lanka',
  'India',
  'Maldives',
  'United Arab Emirates',
  'United Kingdom',
  'United States',
  'Australia',
  'Singapore',
]

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
  const [confirming, setConfirming] = useState(false)
  return (
    <div
      className={`relative flex flex-col rounded-3xl bg-card p-5 ring-1 transition-shadow hover:shadow-[0_10px_28px_-16px_rgba(32,36,43,0.3)] sm:p-6 ${
        address.isDefault ? 'ring-2 ring-teal/40' : 'ring-ink/10'
      }`}
    >
      <div className="flex items-start gap-3">
        <span className={`grid h-10 w-10 flex-none place-items-center rounded-xl ${address.isDefault ? 'bg-teal text-white' : 'bg-teal/10 text-teal-deep'}`}>
          <MapPin size={18} strokeWidth={1.9} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate font-display text-lg leading-tight text-ink">{address.fullName}</p>
            {address.isDefault && (
              <span className="inline-flex items-center gap-1 rounded-full bg-teal/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-teal-deep">
                <Star size={10} className="fill-current" /> Default
              </span>
            )}
          </div>
          <p className="mt-0.5 text-sm text-ink/55">{address.phone}</p>
        </div>
      </div>

      <p className="mt-4 flex-1 rounded-2xl bg-parchment/70 px-4 py-3 text-sm leading-relaxed text-ink/75 ring-1 ring-ink/5">{formatAddress(address)}</p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button type="button" onClick={onEdit} className={btnSecondary}>
          <Pencil size={14} strokeWidth={1.9} /> Edit
        </button>
        {!address.isDefault && onSetDefault && (
          <button type="button" onClick={onSetDefault} className={btnSecondary}>
            <Star size={14} strokeWidth={1.9} /> Make default
          </button>
        )}
        {confirming ? (
          <span className="ml-auto flex items-center gap-1.5">
            <button type="button" onClick={() => setConfirming(false)} className="rounded-full px-3 py-2 text-sm font-semibold text-ink/55 hover:text-ink">
              Keep
            </button>
            <button type="button" onClick={onDelete} className="rounded-full bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700">
              Delete
            </button>
          </span>
        ) : (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            aria-label="Delete address"
            className="ml-auto grid h-9 w-9 place-items-center rounded-full text-ink/45 ring-1 ring-ink/10 transition-colors hover:bg-red-50 hover:text-red-600"
          >
            <Trash2 size={15} strokeWidth={1.9} />
          </button>
        )}
      </div>
    </div>
  )
}

function AddTile({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-[200px] flex-col items-center justify-center gap-3 rounded-3xl border-2 border-dashed border-ink/15 p-6 text-center transition-colors hover:border-teal/50 hover:bg-teal/[0.03]"
    >
      <span className="grid h-12 w-12 place-items-center rounded-2xl bg-teal/10 text-teal-deep">
        <Plus size={22} strokeWidth={2} />
      </span>
      <span className="font-semibold text-ink">Add an address</span>
      <span className="text-xs text-ink/50">Home, work, or a friend&rsquo;s place</span>
    </button>
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

// Basic sanity check, not full E.164 validation — just enough to catch
// stray letters/typos before they hit the DB. Allows +, spaces, dashes.
function isLikelyPhone(value: string) {
  return /^[+\d][\d\s-]{6,}$/.test(value.trim())
}

function Modal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
}) {
  const panelRef = useRef<HTMLDivElement>(null)

  // Escape to close.
  useEffect(() => {
    if (!open) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  // Lock background scroll while open.
  useEffect(() => {
    if (!open) return
    const original = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = original
    }
  }, [open])

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[120] flex items-end justify-center sm:items-center sm:p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          {/* Backdrop — solid, opaque, no page content bleeding through */}
          <div
            className="absolute inset-0 bg-ink/50 backdrop-blur-sm"
            onClick={onClose}
            aria-hidden="true"
          />

          {/* Panel */}
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-title"
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 40 }}
            transition={{ duration: 0.18, ease: EASE_OUT_EXPO }}
            className="relative z-10 max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-parchment pb-[env(safe-area-inset-bottom)] shadow-2xl sm:rounded-3xl"
          >
            <div className="flex items-center justify-between px-6 pt-6">
              <h2 id="modal-title" className="font-display text-2xl text-ink">
                {title}
              </h2>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="rounded-full p-1.5 text-ink/40 transition-colors hover:bg-ink/[0.06] hover:text-ink"
              >
                <X size={18} strokeWidth={1.8} />
              </button>
            </div>
            <div className="px-6 pb-6 pt-4">{children}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function AddressBookSkeleton() {
  return (
    <AccountPage>
      <div className="h-10 w-56 animate-pulse rounded-xl bg-ink/5" aria-hidden="true" />
      <div className="mt-6 grid gap-4 sm:grid-cols-2" aria-hidden="true">
        {[0, 1].map((i) => (
          <div key={i} className="h-52 animate-pulse rounded-3xl bg-ink/5" />
        ))}
      </div>
    </AccountPage>
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
    if (!isLikelyPhone(form.phone)) {
      setFormError('Please enter a valid phone number.')
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
    <AccountPage>
      <AccountPageHeader
        eyebrow="My account"
        title="Address book"
        subtitle="Where your orders are delivered. The default address is picked first at checkout."
        actions={
          hasAddresses ? (
            <button type="button" onClick={openAddDialog} className={btnPrimary}>
              <Plus size={16} strokeWidth={2} /> Add address
            </button>
          ) : undefined
        }
      />

      {error && <p className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700 ring-1 ring-red-200">{error}</p>}

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: EASE_OUT_EXPO }} className="mt-6">
        {hasAddresses ? (
          <div className="grid gap-4 sm:grid-cols-2">
            {addresses.map((address) => (
              <AddressCard
                key={address.id}
                address={address}
                onEdit={() => openEditDialog(address)}
                onDelete={() => handleDelete(address.id)}
                onSetDefault={address.isDefault ? undefined : () => handleSetDefault(address.id)}
              />
            ))}
            <AddTile onClick={openAddDialog} />
          </div>
        ) : (
          <AccountEmpty
            icon={MapPin}
            title="No addresses yet"
            body="Save where you'd like your orders delivered, so checkout is quicker."
            action={
              <button type="button" onClick={openAddDialog} className={btnPrimary}>
                <Plus size={16} strokeWidth={2} /> Add your first address
              </button>
            }
          />
        )}
      </motion.div>

      <Modal
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        title={editingId ? 'Edit address' : 'Add a new address'}
      >
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <div>
              <label htmlFor="addr-fullName" className={labelClass}>
                Full name
              </label>
              <input
                id="addr-fullName"
                required
                autoFocus
                placeholder="e.g. Nimal Perera"
                value={form.fullName}
                onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))}
                className={inputClass}
              />
            </div>

            <div>
              <label htmlFor="addr-phone" className={labelClass}>
                Phone
              </label>
              <input
                id="addr-phone"
                required
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                placeholder="e.g. +94 77 123 4567"
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                className={inputClass}
              />
            </div>

            <div>
              <label htmlFor="addr-line1" className={labelClass}>
                Address line 1
              </label>
              <input
                id="addr-line1"
                required
                autoComplete="address-line1"
                placeholder="House number and street"
                value={form.line1}
                onChange={(e) => setForm((f) => ({ ...f, line1: e.target.value }))}
                className={inputClass}
              />
            </div>

            <div>
              <label htmlFor="addr-line2" className={labelClass}>
                Address line 2 <span className="font-normal text-ink/35">(optional)</span>
              </label>
              <input
                id="addr-line2"
                autoComplete="address-line2"
                placeholder="Apartment, suite, unit, etc."
                value={form.line2}
                onChange={(e) => setForm((f) => ({ ...f, line2: e.target.value }))}
                className={inputClass}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="addr-city" className={labelClass}>
                  City
                </label>
                <input
                  id="addr-city"
                  required
                  autoComplete="address-level2"
                  placeholder="e.g. Negombo"
                  value={form.city}
                  onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor="addr-postal" className={labelClass}>
                  Postal code <span className="font-normal text-ink/35">(optional)</span>
                </label>
                <input
                  id="addr-postal"
                  inputMode="numeric"
                  autoComplete="postal-code"
                  placeholder="e.g. 11500"
                  value={form.postalCode}
                  onChange={(e) => setForm((f) => ({ ...f, postalCode: e.target.value }))}
                  className={inputClass}
                />
              </div>
            </div>

            <div>
              <label htmlFor="addr-country" className={labelClass}>
                Country
              </label>
              <select
                id="addr-country"
                required
                autoComplete="country-name"
                value={form.country}
                onChange={(e) => setForm((f) => ({ ...f, country: e.target.value }))}
                className={`${inputClass} appearance-none bg-[url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="%23555"><path d="M5.25 7.5L10 12.25L14.75 7.5H5.25Z"/></svg>')] bg-[length:16px] bg-[right_0.75rem_center] bg-no-repeat pr-9`}
              >
                {COUNTRIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            {formError && <p className="text-sm font-semibold text-red-600">{formError}</p>}

            <div className="mt-2 flex items-center justify-end gap-3 border-t border-ink/[0.06] pt-4">
              <button
                type="button"
                onClick={() => setDialogOpen(false)}
                className="rounded-full px-4 py-2.5 text-sm font-semibold text-ink/50 transition-colors hover:bg-ink/[0.06] hover:text-ink"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className={btnPrimary}
              >
                {saving && <Loader2 size={14} className="animate-spin" />}
                {saving ? 'Saving…' : editingId ? 'Save changes' : 'Add address'}
              </button>
            </div>
          </form>
      </Modal>
    </AccountPage>
  )
}