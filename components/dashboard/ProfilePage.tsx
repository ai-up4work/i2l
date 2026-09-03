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

// One row in the "Settings" rail — icon, label, chevron. Same shape as
// HomePage's RailRow (Wishlist/Following/Recently Viewed) so profile-page
// navigation rows read as the same pattern as the rest of the dashboard.
function SettingsRow({
  label,
  icon: Icon,
  onClick,
}: {
  label: string
  icon: IconComponent
  onClick?: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-between rounded-2xl border border-ink/10 bg-card px-5 py-4 text-left transition-colors duration-150 hover:border-ink/20"
    >
      <span className="flex items-center gap-2.5 font-semibold text-ink">
        <Icon size={16} strokeWidth={1.8} className="text-ink/45" />
        {label}
      </span>
      <ChevronRight size={14} className="text-ink/45" />
    </button>
  )
}

// Read-only contact line (email/phone/address) — label icon, value text.
// Not a button: these aren't actions, just display rows inside the
// contact-info card, edited via the name-edit affordance above instead.
function ContactRow({
  icon: Icon,
  value,
}: {
  icon: IconComponent
  value?: string
}) {
  if (!value) return null
  return (
    <div className="flex items-center gap-3 py-2.5 text-sm text-ink/70">
      <Icon size={16} strokeWidth={1.8} className="shrink-0 text-ink/40" />
      <span className="truncate">{value}</span>
    </div>
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

  return (
    <div className="mx-auto max-w-3xl px-6 pb-8 lg:px-10">
      <style>{`
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      {/* Avatar + name card */}
      <div className="mt-6 flex flex-col items-center gap-4 rounded-2xl border border-ink/10 bg-card p-8 text-center motion-safe:[animation:fadeUp_0.35s_ease-out_both]">
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

      {/* Contact info */}
      <div
        className="mt-4 rounded-2xl border border-ink/10 bg-card p-6 motion-safe:[animation:fadeUp_0.4s_ease-out_both]"
        style={{ animationDelay: '60ms' }}
      >
        <h2 className="font-display text-base text-ink">Contact info</h2>
        <div className="mt-1 divide-y divide-ink/5">
          <ContactRow icon={Mail} value={email} />
          <ContactRow icon={Phone} value={phone} />
          <ContactRow icon={MapPin} value={address} />
        </div>
      </div>

      {/* Settings rail */}
      <div
        className="mt-4 flex flex-col gap-3 motion-safe:[animation:fadeUp_0.4s_ease-out_both]"
        style={{ animationDelay: '120ms' }}
      >
        <SettingsRow label="Addresses" icon={MapPin} onClick={onManageAddresses} />
        <SettingsRow label="Payment methods" icon={CreditCard} onClick={onManagePayments} />
        <SettingsRow label="Security" icon={Shield} onClick={onSecuritySettings} />
        <SettingsRow label="Notifications" icon={Bell} onClick={onNotificationSettings} />
      </div>

      <button
        type="button"
        onClick={onSignOut}
        className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl border border-red-200 bg-red-50/50 py-3.5 text-sm font-semibold text-red-600 transition-colors hover:bg-red-50 motion-safe:[animation:fadeUp_0.4s_ease-out_both]"
        style={{ animationDelay: '160ms' }}
      >
        <LogOut size={16} strokeWidth={1.8} />
        Sign out
      </button>
    </div>
  )
}