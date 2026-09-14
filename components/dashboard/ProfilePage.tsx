// components/dashboard/ProfilePage.tsx
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
  AtSign,
  Gift,
  Copy,
  CheckCheck,
  Loader2,
} from 'lucide-react'
import Image from 'next/image'

// Same easing curve app/account/address-book/page.tsx uses for its
// entrance motion — kept as one constant so this page's fade-up reads as
// the same animation, not a similar-looking one-off.
const EASE_OUT_EXPO = [0.16, 1, 0.3, 1] as const

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
  /** Whether `phone` has been OTP-verified (see app/account/settings —
   *  the actual verify flow lives there, this just reflects its result). */
  phoneVerified?: boolean
  avatarUrl?: string
  address?: string
  /** profiles.chat_handle — the @handle shown in chat threads. Undefined
   *  means the account hasn't claimed one yet; the row still renders so
   *  they can set one, it just shows a muted placeholder instead of a
   *  value. */
  chatHandle?: string
  /** profiles.referral_code. Codes are issued server-side, so unlike
   *  name/handle this page can't mint one — when it's undefined the
   *  "Invite friends" card doesn't render at all rather than showing an
   *  empty state with nothing actionable in it. */
  referralCode?: string
  /** True while the route is still fetching phone/address/handle/referral
   *  data. Renders a skeleton instead of the contact-info card filling in
   *  row by row. */
  loading?: boolean
  /** True while a newly picked avatar file is mid-upload — shows a
   *  spinner over the avatar and disables the camera button so a second
   *  upload can't start before the first finishes. */
  avatarUploading?: boolean
  onUpdateName: (name: string) => void
  /** Resolves with an error message on failure (e.g. handle already
   *  taken) so the inline editor can surface it instead of silently
   *  reverting the field. Resolves with nothing on success. */
  onUpdateHandle?: (handle: string) => Promise<string | void>
  onManageAddresses?: () => void
  onManagePayments?: () => void
  /** Payment methods has no backing table in the schema yet — render the
   *  row disabled with a "Coming soon" pill instead of a button that
   *  looks live but silently does nothing when tapped. */
  paymentsComingSoon?: boolean
  onSecuritySettings?: () => void
  onNotificationSettings?: () => void
  onChangeAvatar?: () => void
  onSignOut: () => void
}

// One row in the "Settings" rail — icon, label, chevron. Same shape as
// HomePage's RailRow (Wishlist/Following/Recently Viewed) so profile-page
// navigation rows read as the same pattern as the rest of the dashboard.
// `comingSoon` swaps the whole row for a disabled, dashed-border variant
// with a pill instead of a chevron — used for settings that don't have a
// real destination yet, so it never pretends to be tappable.
function SettingsRow({
  label,
  icon: Icon,
  onClick,
  comingSoon,
}: {
  label: string
  icon: IconComponent
  onClick?: () => void
  comingSoon?: boolean
}) {
  if (comingSoon) {
    return (
      <div
        className="flex w-full cursor-not-allowed items-center justify-between rounded-2xl border border-dashed border-ink/15 bg-card/60 px-5 py-4 text-left"
        aria-disabled="true"
      >
        <span className="flex items-center gap-2.5 font-semibold text-ink/45">
          <Icon size={16} strokeWidth={1.8} className="text-ink/25" />
          {label}
        </span>
        <span className="rounded-full bg-ink/[0.06] px-2.5 py-1 text-[10px] font-semibold text-ink/40">
          Coming soon
        </span>
      </div>
    )
  }
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
  verified,
}: {
  icon: IconComponent
  value?: string
  /** Shows a small "Verified" pill next to the value — used for the
   *  WhatsApp number, which is confirmed via OTP in Settings, not just
   *  typed in. Omit for rows that don't have a verification concept. */
  verified?: boolean
}) {
  if (!value) return null
  return (
    <div className="flex items-center gap-3 py-2.5 text-sm text-ink/70">
      <Icon size={16} strokeWidth={1.8} className="shrink-0 text-ink/40" />
      <span className="truncate">{value}</span>
      {verified && (
        <span className="flex-none rounded-full bg-teal/12 px-2 py-0.5 text-[10px] font-semibold text-teal-deep">
          Verified
        </span>
      )}
    </div>
  )
}

// Full-page skeleton shown while the route is still fetching phone,
// default address, handle, and referral code. Mirrors AddressBookSkeleton's
// shape/spacing (same rounded-2xl blocks, same bg-ink/[0.06] pulse) so
// navigating between account pages doesn't feel like two different apps
// mid-load.
function ProfilePageSkeleton() {
  return (
    <div className="mx-auto max-w-3xl px-6 pb-8 lg:px-10" aria-hidden="true">
      <div className="mt-10 space-y-2">
        <div className="h-6 w-32 animate-pulse rounded bg-ink/[0.06]" />
        <div className="h-4 w-64 animate-pulse rounded bg-ink/[0.06]" />
      </div>

      <div className="mt-6 flex flex-col items-center gap-4 rounded-2xl border border-ink/10 bg-card p-8">
        <div className="size-24 animate-pulse rounded-full bg-ink/[0.06]" />
        <div className="h-6 w-40 animate-pulse rounded bg-ink/[0.06]" />
        <div className="h-4 w-24 animate-pulse rounded bg-ink/[0.06]" />
      </div>

      <div className="mt-4 rounded-2xl border border-ink/10 bg-card p-6">
        <div className="h-4 w-24 animate-pulse rounded bg-ink/[0.06]" />
        <div className="mt-4 space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-4 w-3/5 animate-pulse rounded bg-ink/[0.06]" />
          ))}
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-3">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-[52px] w-full animate-pulse rounded-2xl bg-ink/[0.04]" />
        ))}
      </div>
    </div>
  )
}

export default function ProfilePage({
  name,
  email,
  phone,
  phoneVerified,
  avatarUrl,
  address,
  chatHandle,
  referralCode,
  loading,
  avatarUploading,
  onUpdateName,
  onUpdateHandle,
  onManageAddresses,
  onManagePayments,
  paymentsComingSoon,
  onSecuritySettings,
  onNotificationSettings,
  onChangeAvatar,
  onSignOut,
}: ProfilePageProps) {
  const displayName = name?.trim() || 'Guest'

  const [editingName, setEditingName] = useState(false)
  const [nameDraft, setNameDraft] = useState(displayName)

  const [editingHandle, setEditingHandle] = useState(false)
  const [handleDraft, setHandleDraft] = useState(chatHandle ?? '')
  const [handleError, setHandleError] = useState<string | null>(null)
  const [savingHandle, setSavingHandle] = useState(false)

  const [copied, setCopied] = useState(false)

  function handleSaveName() {
    const trimmed = nameDraft.trim()
    if (trimmed) onUpdateName(trimmed)
    setEditingName(false)
  }

  function handleCancelEdit() {
    setNameDraft(displayName)
    setEditingName(false)
  }

  function openHandleEditor() {
    setHandleDraft(chatHandle ?? '')
    setHandleError(null)
    setEditingHandle(true)
  }

  async function handleSaveHandle() {
    if (!onUpdateHandle) return
    // Strip a leading @ and stray whitespace — people will type either
    // "priya" or "@priya", both should resolve to the same stored value.
    const cleaned = handleDraft.trim().replace(/^@/, '')
    if (!cleaned) {
      setHandleError('Handle can\u2019t be empty.')
      return
    }
    if (!/^[a-zA-Z0-9_.]{3,20}$/.test(cleaned)) {
      setHandleError('3\u201320 characters: letters, numbers, underscores, or dots.')
      return
    }
    setSavingHandle(true)
    setHandleError(null)
    const error = await onUpdateHandle(cleaned)
    setSavingHandle(false)
    if (error) {
      setHandleError(error)
      return
    }
    setEditingHandle(false)
  }

  function handleCancelHandle() {
    setHandleDraft(chatHandle ?? '')
    setHandleError(null)
    setEditingHandle(false)
  }

  async function handleCopyReferral() {
    if (!referralCode) return
    try {
      await navigator.clipboard.writeText(referralCode)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    } catch {
      // Clipboard API can fail (permissions, insecure context) — the code
      // is still visible and selectable on the page, so this is a soft
      // failure, not worth surfacing an error for.
    }
  }

  if (loading) {
    return <ProfilePageSkeleton />
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: EASE_OUT_EXPO }}
      className="mx-auto max-w-3xl px-6 pb-8 lg:px-10"
    >
      {/* Page header — same heading/subtitle language as
          app/account/settings/page.tsx, which this page is the sibling
          of in the account nav. */}
      <div className="mt-10">
        <h1 className="font-display text-2xl text-ink">My Profile</h1>
        <p className="mt-1 text-sm text-ink/55">Your details, addresses, and account settings.</p>
      </div>

      {/* Avatar + name card */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.05, ease: EASE_OUT_EXPO }}
        className="mt-6 flex flex-col items-center gap-4 rounded-2xl border border-ink/10 bg-card p-8 text-center"
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
          {avatarUploading && (
            <span className="absolute inset-0 grid place-items-center rounded-full bg-ink/40">
              <Loader2 size={20} className="animate-spin text-white" />
            </span>
          )}
          {onChangeAvatar && (
            <button
              type="button"
              onClick={onChangeAvatar}
              disabled={avatarUploading}
              aria-label="Change photo"
              className="absolute bottom-0 right-0 grid size-8 place-items-center rounded-full border border-ink/10 bg-teal-deep text-white shadow-sm transition-colors hover:bg-indigo-deep disabled:cursor-not-allowed disabled:opacity-60"
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

        {/* @handle — only rendered when the route wires up onUpdateHandle,
            so this page still works standalone (e.g. tests/storybook)
            without a chat_handle write path plugged in. */}
        {onUpdateHandle &&
          (editingHandle ? (
            <div className="flex flex-col items-center gap-1.5">
              <div className="flex items-center gap-2">
                <span className="flex items-center gap-1 rounded-lg border border-ink/15 bg-parchment px-3 py-1.5 text-sm text-ink">
                  <AtSign size={13} className="text-ink/40" />
                  <input
                    autoFocus
                    value={handleDraft}
                    onChange={(e) => setHandleDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSaveHandle()
                      if (e.key === 'Escape') handleCancelHandle()
                    }}
                    placeholder="yourhandle"
                    className="w-32 bg-transparent outline-none placeholder:text-ink/30"
                  />
                </span>
                <button
                  type="button"
                  onClick={handleSaveHandle}
                  disabled={savingHandle}
                  aria-label="Save handle"
                  className="rounded-lg p-1.5 text-teal-deep hover:bg-teal/10 disabled:opacity-50"
                >
                  {savingHandle ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                </button>
                <button
                  type="button"
                  onClick={handleCancelHandle}
                  aria-label="Cancel"
                  className="rounded-lg p-1.5 text-ink/45 hover:bg-ink/5"
                >
                  <X size={16} />
                </button>
              </div>
              {handleError && <p className="text-xs font-semibold text-red-600">{handleError}</p>}
            </div>
          ) : (
            <button type="button" onClick={openHandleEditor} className="group -mt-2 flex items-center gap-1.5">
              <span className={`text-sm ${chatHandle ? 'text-ink/55' : 'text-ink/35'}`}>
                {chatHandle ? `@${chatHandle}` : 'Set a chat handle'}
              </span>
              <Pencil size={12} className="text-ink/25 transition-colors group-hover:text-teal-deep" />
            </button>
          ))}
      </motion.div>

      {/* Contact info */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.1, ease: EASE_OUT_EXPO }}
        className="mt-4 rounded-2xl border border-ink/10 bg-card p-6"
      >
        <h2 className="font-display text-base text-ink">Contact info</h2>
        <div className="mt-1 divide-y divide-ink/5">
          <ContactRow icon={Mail} value={email} />
          <ContactRow icon={Phone} value={phone} verified={phoneVerified} />
          <ContactRow icon={MapPin} value={address} />
        </div>
      </motion.div>

      {/* Invite friends — only shown once the account actually has a
          referral_code, since codes are issued server-side and this page
          has no way to mint one if it's missing. */}
      {referralCode && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.14, ease: EASE_OUT_EXPO }}
          className="mt-4 rounded-2xl border border-ink/10 bg-card p-6"
        >
          <div className="flex items-center gap-2">
            <Gift size={16} strokeWidth={1.8} className="text-teal-deep" />
            <h2 className="font-display text-base text-ink">Invite friends</h2>
          </div>
          <p className="mt-1 text-sm text-ink/60">Share your code — friends who use it help you both earn rewards.</p>
          <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-dashed border-ink/15 bg-parchment px-4 py-3">
            <span className="font-display text-lg tracking-wide text-ink">{referralCode}</span>
            <button
              type="button"
              onClick={handleCopyReferral}
              className="flex flex-none items-center gap-1.5 rounded-lg border border-ink/15 bg-card px-3 py-1.5 text-xs font-semibold text-ink transition-colors hover:border-teal/40 hover:bg-teal/5"
            >
              {copied ? (
                <>
                  <CheckCheck size={13} className="text-teal-deep" />
                  Copied
                </>
              ) : (
                <>
                  <Copy size={13} />
                  Copy
                </>
              )}
            </button>
          </div>
        </motion.div>
      )}

      {/* Settings rail */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.18, ease: EASE_OUT_EXPO }}
        className="mt-4 flex flex-col gap-3"
      >
        <SettingsRow label="Addresses" icon={MapPin} onClick={onManageAddresses} />
        <SettingsRow
          label="Payment methods"
          icon={CreditCard}
          onClick={onManagePayments}
          comingSoon={paymentsComingSoon}
        />
        <SettingsRow label="Security" icon={Shield} onClick={onSecuritySettings} />
        <SettingsRow label="Notifications" icon={Bell} onClick={onNotificationSettings} />
      </motion.div>

      <motion.button
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.22, ease: EASE_OUT_EXPO }}
        type="button"
        onClick={onSignOut}
        className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl border border-red-200 bg-red-50/50 py-3.5 text-sm font-semibold text-red-600 transition-colors hover:bg-red-50"
      >
        <LogOut size={16} strokeWidth={1.8} />
        Sign out
      </motion.button>
    </motion.div>
  )
}