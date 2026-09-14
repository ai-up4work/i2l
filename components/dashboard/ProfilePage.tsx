// ProfilePage.tsx
'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
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

const EASE_OUT_EXPO = [0.16, 1, 0.3, 1] as const

type IconComponent = React.ComponentType<{
  size?: number
  strokeWidth?: number
  className?: string
}>

type ProfilePageProps = {
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
      className="flex w-full items-center justify-between rounded-2xl border border-ink/10 bg-card px-5 py-4 text-left transition-colors hover:border-ink/20 hover:bg-ink/[0.02]"
    >
      <span className="flex items-center gap-2.5 text-sm font-semibold text-ink">
        <Icon size={16} strokeWidth={1.8} className="text-ink/45" />
        {label}
      </span>
      <ChevronRight size={14} className="text-ink/35" />
    </button>
  )
}

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
      <Icon size={15} strokeWidth={1.8} className="shrink-0 text-ink/35" />
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
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: EASE_OUT_EXPO }}
      className="mx-auto max-w-6xl px-6 pb-16 lg:px-10"
    >
      <div className="mt-10 flex items-end justify-between">
        <div>
          <h1 className="font-display text-xl text-ink sm:text-2xl">My Profile</h1>
          <p className="mt-1 text-[13px] text-ink/40">
            Manage your account details and preferences.
          </p>
        </div>
      </div>

      {/* Two columns on wide screens, same shape as the cart page: a
          narrower identity card on the left, everything else (contact +
          settings + sign out) filling the remaining width on the right,
          instead of one thin stack with huge gutters either side. */}
      <div className="mt-8 grid gap-6 lg:grid-cols-[320px_1fr] lg:items-start">
        {/* Avatar + name card */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.05, ease: EASE_OUT_EXPO }}
          className="flex flex-col items-center gap-4 rounded-2xl border border-ink/10 bg-card p-8 text-center lg:sticky lg:top-6"
        >
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
                className="absolute bottom-0 right-0 grid size-8 place-items-center rounded-full border border-ink/10 bg-teal-deep text-white shadow-sm transition-all hover:opacity-90 active:scale-[0.95]"
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
                className="w-full min-w-0 rounded-xl border border-ink/15 bg-white px-3.5 py-2 text-center font-display text-xl text-ink outline-none transition-colors focus:border-teal-deep focus:ring-2 focus:ring-teal/20"
              />
              <button
                type="button"
                onClick={handleSaveName}
                aria-label="Save name"
                className="grid size-9 flex-none place-items-center rounded-full text-teal-deep transition-colors hover:bg-teal/10"
              >
                <Check size={18} />
              </button>
              <button
                type="button"
                onClick={handleCancelEdit}
                aria-label="Cancel"
                className="grid size-9 flex-none place-items-center rounded-full text-ink/40 transition-colors hover:bg-ink/[0.06] hover:text-ink/60"
              >
                <X size={18} />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setEditingName(true)}
              className="group flex items-center gap-2 rounded-full px-2 py-1 transition-colors hover:bg-ink/[0.03]"
            >
              <h2 className="font-display text-2xl text-ink">{displayName}</h2>
              <Pencil size={14} className="text-ink/30 transition-colors group-hover:text-teal-deep" />
            </button>
          )}
        </motion.div>

        {/* Right column: contact info, settings rail, sign out */}
        <div className="flex flex-col gap-4">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.1, ease: EASE_OUT_EXPO }}
            className="rounded-2xl border border-ink/10 bg-card p-6"
          >
            <h2 className="font-display text-base text-ink">Contact info</h2>
            <div className="mt-1 divide-y divide-ink/[0.06]">
              <ContactRow icon={Mail} value={email} />
              <ContactRow icon={Phone} value={phone} />
              <ContactRow icon={MapPin} value={address} />
            </div>
          </motion.div>

          {/* Settings rail — 2-up on wider screens so it fills the row
              instead of stacking into a tall single column. */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.15, ease: EASE_OUT_EXPO }}
            className="grid grid-cols-1 gap-3 sm:grid-cols-2"
          >
            <SettingsRow label="Addresses" icon={MapPin} onClick={onManageAddresses} />
            <SettingsRow label="Payment methods" icon={CreditCard} onClick={onManagePayments} />
            <SettingsRow label="Security" icon={Shield} onClick={onSecuritySettings} />
            <SettingsRow label="Notifications" icon={Bell} onClick={onNotificationSettings} />
          </motion.div>

          <motion.button
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.2, ease: EASE_OUT_EXPO }}
            type="button"
            onClick={onSignOut}
            className="mt-2 flex w-full items-center justify-center gap-2 rounded-full border border-red-200 bg-red-50/50 py-3.5 text-sm font-semibold text-red-600 transition-all hover:bg-red-50 active:scale-[0.98]"
          >
            <LogOut size={16} strokeWidth={1.8} />
            Sign out
          </motion.button>
        </div>
      </div>
    </motion.div>
  )
}