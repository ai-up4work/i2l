// ProfilePage.tsx
'use client'

import { useState } from 'react'
import {
  ChevronRight,
  Camera,
  Mail,
  Phone,
  MapPin,
  Shield,
  CreditCard,
  Bell,
  LogOut,
  Pencil,
  X,
  Check,
} from 'lucide-react'
import Image from 'next/image'

type IconComponent = React.ComponentType<{
  size?: number
  strokeWidth?: number
  className?: string
}>

type ProfilePageProps = {
  // Optional rather than required: the auth context can hand this
  // component a signed-out/loading state (user === null) before the
  // parent page has a chance to gate on it, so every field here has to
  // survive being undefined without crashing the render.
  name?: string
  email?: string
  phone?: string
  avatarUrl?: string
  address?: string
  onUpdateName: (name: string) => void
  onManageAddresses?: () => void
  onManagePayments?: () => void
  onSecuritySettings?: () => void
  onNotificationSettings?: () => void
  onChangeAvatar?: () => void
  onSignOut: () => void
}

// One flat row — used for both read-only contact info (email/phone/address)
// and navigable settings (addresses/payments/security/notifications). The
// two are visually the same weight; what differs is whether there's a
// chevron. Putting both in one list, instead of two separate cards, is
// what creates contrast with the avatar/name hero above it, rather than
// stacking four cards of identical weight down the page.
function InfoRow({
  icon: Icon,
  label,
  value,
  onClick,
}: {
  icon: IconComponent
  label: string
  value?: string
  onClick?: () => void
}) {
  // Read-only contact rows are only rendered when there's a value to show;
  // navigable settings rows always render since the destination doesn't
  // depend on data being present yet.
  if (!onClick && !value) return null

  const content = (
    <>
      <span className="flex items-center gap-3 text-sm text-ink/80">
        <Icon size={16} strokeWidth={1.8} className="shrink-0 text-ink/40" />
        <span className="truncate">{value ?? label}</span>
      </span>
      {onClick && <ChevronRight size={14} className="shrink-0 text-ink/35" />}
    </>
  )

  if (!onClick) {
    return <div className="flex items-center justify-between px-1 py-3.5">{content}</div>
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-between px-1 py-3.5 text-left transition-colors duration-150 hover:bg-ink/[0.02]"
    >
      {content}
    </button>
  )
}

export default function ProfilePage({
  name,
  email,
  phone,
  avatarUrl,
  address,
  onUpdateName,
  onManageAddresses,
  onManagePayments,
  onSecuritySettings,
  onNotificationSettings,
  onChangeAvatar,
  onSignOut,
}: ProfilePageProps) {
  const displayName = name?.trim() || 'Guest'

  const [editingName, setEditingName] = useState(false)
  const [nameDraft, setNameDraft] = useState(displayName)

  function handleSaveName() {
    const trimmed = nameDraft.trim()
    if (trimmed) onUpdateName(trimmed)
    setEditingName(false)
  }

  function handleCancelEdit() {
    setNameDraft(displayName)
    setEditingName(false)
  }

  const hasContactInfo = Boolean(email || phone || address)
  const hasSettings = Boolean(
    onManageAddresses || onManagePayments || onSecuritySettings || onNotificationSettings
  )

  return (
    <div className="mx-auto max-w-3xl px-6 pb-8 lg:px-10">
      <style>{`
        @keyframes heroIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      {/* Hero: avatar + name. This is the one card on the page, and the
          only element that animates in — a single deliberate moment
          rather than a cascade down the page. */}
      <div className="mt-6 flex flex-col items-center gap-4 rounded-3xl border border-ink/10 bg-card px-8 py-10 text-center motion-safe:[animation:heroIn_0.3s_ease-out_both]">
        <div className="relative">
          <span className="grid size-24 place-items-center overflow-hidden rounded-full border border-ink/10 bg-parchment">
            {avatarUrl ? (
              <Image src={avatarUrl} alt="" width={96} height={96} className="h-full w-full object-cover" />
            ) : (
              <span className="font-display text-3xl text-ink/30">
                {displayName.charAt(0).toUpperCase()}
              </span>
            )}
          </span>
          {onChangeAvatar && (
            <button
              type="button"
              onClick={onChangeAvatar}
              aria-label="Change photo"
              className="absolute bottom-0 right-0 grid size-8 place-items-center rounded-full border border-ink/10 bg-teal-deep text-white shadow-sm transition-colors hover:bg-indigo-deep"
            >
              <Camera size={14} strokeWidth={1.8} />
            </button>
          )}
        </div>

        {editingName ? (
          <div className="flex items-center gap-2">
            <input
              autoFocus
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSaveName()
                if (e.key === 'Escape') handleCancelEdit()
              }}
              className="rounded-lg border border-ink/15 bg-parchment px-3 py-1.5 text-center font-display text-xl text-ink outline-none focus:border-gold/60 focus:ring-2 focus:ring-gold/50"
            />
            <button
              type="button"
              onClick={handleSaveName}
              aria-label="Save name"
              className="rounded-lg p-1.5 text-teal-deep hover:bg-teal/10"
            >
              <Check size={18} />
            </button>
            <button
              type="button"
              onClick={handleCancelEdit}
              aria-label="Cancel"
              className="rounded-lg p-1.5 text-ink/45 hover:bg-ink/5"
            >
              <X size={18} />
            </button>
          </div>
        ) : (
          <button type="button" onClick={() => setEditingName(true)} className="group flex items-center gap-2">
            <h1 className="font-display text-2xl text-ink">{displayName}</h1>
            <Pencil size={14} className="text-ink/30 transition-colors group-hover:text-teal-deep" />
          </button>
        )}
      </div>

      {/* Flat list: contact info and settings share one list with hairline
          dividers, rather than four stacked cards of equal visual weight.
          The hero above is the only card on the page. */}
      {(hasContactInfo || hasSettings) && (
        <div className="mt-4 divide-y divide-ink/8 rounded-2xl border border-ink/8">
          {hasContactInfo && (
            <div className="divide-y divide-ink/8 px-4">
              <InfoRow icon={Mail} label="Email" value={email} />
              <InfoRow icon={Phone} label="Phone" value={phone} />
              <InfoRow icon={MapPin} label="Address" value={address} />
            </div>
          )}
          {hasSettings && (
            <div className="divide-y divide-ink/8 px-4">
              {onManageAddresses && (
                <InfoRow icon={MapPin} label="Addresses" onClick={onManageAddresses} />
              )}
              {onManagePayments && (
                <InfoRow icon={CreditCard} label="Payment methods" onClick={onManagePayments} />
              )}
              {onSecuritySettings && (
                <InfoRow icon={Shield} label="Security" onClick={onSecuritySettings} />
              )}
              {onNotificationSettings && (
                <InfoRow icon={Bell} label="Notifications" onClick={onNotificationSettings} />
              )}
            </div>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={onSignOut}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl border border-red-200 bg-red-50/50 py-3.5 text-sm font-semibold text-red-600 transition-colors hover:bg-red-50"
      >
        <LogOut size={16} strokeWidth={1.8} />
        Sign out
      </button>
    </div>
  )
}