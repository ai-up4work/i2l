// AddressBookPage.tsx
'use client'

import { Plus, MapPin, Pencil, Trash2, Star } from 'lucide-react'

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

type AddressBookPageProps = {
  addresses?: Address[]
  onAddAddress?: () => void
  onEditAddress?: (id: string) => void
  onDeleteAddress?: (id: string) => void
  onSetDefault?: (id: string) => void
}

// Builds the single-line address string ("123 Main St, Apt 4, Colombo,
// Western Province, 10100, Sri Lanka") from whichever parts are present,
// since line2/region/postalCode are all optional depending on the
// country's address format.
function formatAddress(address: Address): string {
  return [
    address.line1,
    address.line2,
    address.city,
    address.region,
    address.postalCode,
    address.country,
  ]
    .filter(Boolean)
    .join(', ')
}

function AddressCard({
  address,
  onEdit,
  onDelete,
  onSetDefault,
}: {
  address: Address
  onEdit?: () => void
  onDelete?: () => void
  onSetDefault?: () => void
}) {
  return (
    <div className="relative rounded-2xl border border-ink/10 bg-card p-5">
      {address.isDefault && (
        <span className="absolute right-5 top-5 rounded-full bg-teal/12 px-2.5 py-1 text-[11px] font-semibold text-teal-deep">
          Default
        </span>
      )}

      <div className="flex items-start gap-3 pr-20">
        <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-full bg-ink/5 text-ink/45">
          <MapPin size={16} strokeWidth={1.8} />
        </span>
        <div className="min-w-0">
          <p className="font-semibold text-ink">{address.fullName}</p>
          <p className="mt-0.5 text-sm text-ink/55">{address.phone}</p>
          <p className="mt-2 text-sm leading-snug text-ink/70">{formatAddress(address)}</p>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-4 border-t border-ink/5 pt-3.5 pl-12 text-sm font-semibold">
        {onEdit && (
          <button
            type="button"
            onClick={onEdit}
            className="flex items-center gap-1.5 text-ink/60 transition-colors hover:text-teal-deep"
          >
            <Pencil size={14} strokeWidth={1.8} />
            Edit
          </button>
        )}
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
        {onDelete && (
          <button
            type="button"
            onClick={onDelete}
            className="ml-auto flex items-center gap-1.5 text-ink/60 transition-colors hover:text-red-600"
          >
            <Trash2 size={14} strokeWidth={1.8} />
            Delete
          </button>
        )}
      </div>
    </div>
  )
}

// Shown in place of the grid when the person hasn't saved an address yet —
// an invitation to act, not just a blank space (per the empty-state
// guidance: explain what's missing and give the one action that fixes it).
function EmptyState({ onAddAddress }: { onAddAddress?: () => void }) {
  return (
    <div className="mt-6 flex flex-col items-center gap-3 rounded-2xl border border-dashed border-ink/15 px-6 py-16 text-center">
      <span className="grid size-12 place-items-center rounded-full bg-ink/5 text-ink/35">
        <MapPin size={20} strokeWidth={1.8} />
      </span>
      <p className="text-sm text-ink/55">You haven&apos;t saved any addresses yet.</p>
      {onAddAddress && (
        <button
          type="button"
          onClick={onAddAddress}
          className="mt-1 text-sm font-semibold text-teal-deep underline underline-offset-2 hover:text-indigo-deep"
        >
          Add your first address
        </button>
      )}
    </div>
  )
}

export default function AddressBookPage({
  addresses = [],
  onAddAddress,
  onEditAddress,
  onDeleteAddress,
  onSetDefault,
}: AddressBookPageProps) {
  const hasAddresses = addresses.length > 0

  return (
    <div className="mx-auto max-w-5xl px-6 pb-8 lg:px-10">
      <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-display text-3xl text-ink">My Address Book</h1>
        {onAddAddress && (
          <button
            type="button"
            onClick={onAddAddress}
            className="flex items-center gap-2 rounded-lg bg-ink px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-ink/90"
          >
            <Plus size={16} strokeWidth={2} />
            Add new address
          </button>
        )}
      </div>

      {hasAddresses ? (
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {addresses.map((address) => (
            <AddressCard
              key={address.id}
              address={address}
              onEdit={onEditAddress ? () => onEditAddress(address.id) : undefined}
              onDelete={onDeleteAddress ? () => onDeleteAddress(address.id) : undefined}
              onSetDefault={onSetDefault ? () => onSetDefault(address.id) : undefined}
            />
          ))}
        </div>
      ) : (
        <EmptyState onAddAddress={onAddAddress} />
      )}
    </div>
  )
}