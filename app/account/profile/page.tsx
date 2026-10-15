// app/account/profile/page.tsx
//
// My profile: who you are, how we reach you, security and notifications.
// Shares the account pages' look (components/account/AccountPageKit.tsx).
//
// Name/avatar are saved in two places on purpose: auth user_metadata (what
// AuthContext reads, so the header updates at once) and profiles.full_name
// / avatar_url (what the rest of the app queries).
'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import {
  Bell,
  Camera,
  Check,
  ChevronRight,
  Download,
  Gift,
  Heart,
  KeyRound,
  Mail,
  MapPin,
  MessageCircle,
  Package,
  Pencil,
  ShieldCheck,
  Store,
  Trash2,
  X,
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useWishlist } from '@/contexts/Wishlistcontext'
import { useOrders } from '@/contexts/Ordercontexts'
import { useFollowedStores } from '@/hooks/useFollowedStores'
import NotificationSettings from '@/components/pwa/NotificationSettings'
import WhatsAppVerification from '@/components/account/WhatsAppVerification'
import { createClient } from '@/lib/supabase/client'
import { useImageUpload } from '@/lib/upload/useImageUpload'
import { AccountCard, AccountPage, AccountPageHeader, btnPrimary, btnSecondary, fieldClass } from '@/components/account/AccountPageKit'

type IconComponent = React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>

function QuickLink({ href, icon: Icon, label, value }: { href: string; icon: IconComponent; label: string; value?: string | number }) {
  return (
    <Link
      href={href}
      className="group flex min-w-0 items-center gap-2.5 rounded-2xl bg-card p-3 ring-1 ring-ink/10 sm:gap-3 sm:p-3.5 transition-all hover:-translate-y-0.5 hover:ring-teal/30 hover:shadow-[0_10px_24px_-14px_rgba(14,140,156,0.45)]"
    >
      <span className="grid h-9 w-9 flex-none place-items-center rounded-xl bg-teal/10 text-teal-deep sm:h-10 sm:w-10">
        <Icon size={17} strokeWidth={1.9} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-ink">{label}</span>
        {value !== undefined && <span className="block truncate text-xs text-ink/50">{value}</span>}
      </span>
      <ChevronRight size={15} className="hidden flex-none text-ink/30 transition-transform group-hover:translate-x-0.5 group-hover:text-teal-deep sm:block" />
    </Link>
  )
}

function InfoRow({ icon: Icon, label, value, href }: { icon: IconComponent; label: string; value?: string; href?: string }) {
  const body = (
    <>
      <span className="grid h-9 w-9 flex-none place-items-center rounded-xl bg-parchment text-ink/45 ring-1 ring-ink/8">
        <Icon size={16} strokeWidth={1.8} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-semibold text-ink/45">{label}</span>
        <span className={`block truncate text-sm ${value ? 'text-ink' : 'text-ink/40'}`}>{value || 'Not added yet'}</span>
      </span>
      {href && <ChevronRight size={15} className="flex-none text-ink/30" />}
    </>
  )
  return href ? (
    <Link href={href} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0 hover:text-teal-deep">
      {body}
    </Link>
  ) : (
    <div className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">{body}</div>
  )
}

function QuietRow({ label, description, icon: Icon, onClick }: { label: string; description: string; icon: IconComponent; onClick?: () => void }) {
  return (
    <button type="button" onClick={onClick} className="group flex w-full items-start gap-3 py-3.5 text-left first:pt-0 last:pb-0">
      <Icon size={16} strokeWidth={1.8} className="mt-0.5 flex-none text-ink/35 transition-colors group-hover:text-ink/60" />
      <span className="flex flex-col gap-0.5">
        <span className="text-sm font-semibold text-ink/75 transition-colors group-hover:text-ink">{label}</span>
        <span className="text-xs text-ink/45">{description}</span>
      </span>
    </button>
  )
}

export default function AccountProfilePage() {
  const { user, loading } = useAuth()
  const { uploading, error: uploadError, upload } = useImageUpload()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [addressSummary, setAddressSummary] = useState<string | undefined>(undefined)
  const [saveError, setSaveError] = useState<string | null>(null)

  // ---- profile-card state (formerly local state inside ProfilePage) ----
  const displayName = user?.name?.trim() || 'Guest'
  const [editingName, setEditingName] = useState(false)
  const [nameDraft, setNameDraft] = useState(displayName)

  // ---- account-security state (formerly /account/settings) ----
  const [passwordStep, setPasswordStep] = useState<'idle' | 'entering'>('idle')
  const [newPassword, setNewPassword] = useState('')
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [passwordSaved, setPasswordSaved] = useState(false)
  const [passwordBusy, setPasswordBusy] = useState(false)

  useEffect(() => {
    if (!user) return
    const supabase = createClient()
    supabase
      .from('addresses')
      .select('label, city, country, is_default')
      .eq('user_id', user.id)
      .order('is_default', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setAddressSummary(`${data.label ? `${data.label} — ` : ''}${data.city}, ${data.country}`)
      })
  }, [user])

  const handleUpdateName = async (name: string) => {
    if (!user) return
    setSaveError(null)
    const supabase = createClient()
    const [{ error: authError }, { error: profileError }] = await Promise.all([
      supabase.auth.updateUser({ data: { full_name: name } }),
      supabase.from('profiles').update({ full_name: name }).eq('id', user.id),
    ])
    if (authError || profileError) {
      setSaveError((authError ?? profileError)?.message ?? 'Could not update your name. Please try again.')
    }
  }

  const handleAvatarFileSelected = async (file: File) => {
    if (!user) return
    setSaveError(null)
    const url = await upload(file, 'avatars')
    if (!url) return // useImageUpload's own error state already reflects why
    const supabase = createClient()
    const [{ error: authError }, { error: profileError }] = await Promise.all([
      supabase.auth.updateUser({ data: { avatar_url: url } }),
      supabase.from('profiles').update({ avatar_url: url }).eq('id', user.id),
    ])
    if (authError || profileError) {
      setSaveError((authError ?? profileError)?.message ?? 'Could not update your photo. Please try again.')
    }
  }

  function handleSaveName() {
    const trimmed = nameDraft.trim()
    if (trimmed) handleUpdateName(trimmed)
    setEditingName(false)
  }

  function handleCancelEdit() {
    setNameDraft(displayName)
    setEditingName(false)
  }

  async function handleChangePassword() {
    setPasswordError(null)
    if (newPassword.length < 6) {
      setPasswordError('Use at least 6 characters.')
      return
    }
    setPasswordBusy(true)
    const supabase = createClient()
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    setPasswordBusy(false)
    if (error) {
      setPasswordError(error.message)
      return
    }
    setPasswordSaved(true)
    setNewPassword('')
    setPasswordStep('idle')
    window.setTimeout(() => setPasswordSaved(false), 2500)
  }

  const { count: wishlistCount } = useWishlist()
  const { orders } = useOrders()
  const { followedAt } = useFollowedStores()

  if (loading) {
    return (
      <AccountPage>
        <div className="h-10 w-48 animate-pulse rounded-xl bg-ink/5" />
        <div className="mt-6 h-56 animate-pulse rounded-3xl bg-ink/5" />
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div className="h-48 animate-pulse rounded-3xl bg-ink/5" />
          <div className="h-48 animate-pulse rounded-3xl bg-ink/5" />
        </div>
      </AccountPage>
    )
  }

  if (!user) {
    return (
      <AccountPage>
        <p className="py-16 text-center text-sm text-ink/50">You need to be signed in to view your profile.</p>
      </AccountPage>
    )
  }

  return (
    <AccountPage>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          e.target.value = ''
          if (file) handleAvatarFileSelected(file)
        }}
      />

      <AccountPageHeader eyebrow="My account" title="Profile" subtitle="Your details, how we reach you, and how your account is kept safe." />

      {(saveError || uploadError) && (
        <p className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700 ring-1 ring-red-200">{saveError ?? uploadError}</p>
      )}

      {/* Identity */}
      <section className="relative mt-6 overflow-hidden rounded-3xl bg-card ring-1 ring-ink/10">
        <div className="relative h-24 bg-[radial-gradient(120%_160%_at_0%_0%,var(--color-teal)_0%,var(--color-indigo)_55%,var(--color-indigo-deep)_100%)] sm:h-28">
          <span className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-gold/70 to-transparent" aria-hidden />
        </div>
        <div className="flex flex-col gap-4 px-5 pb-5 sm:flex-row sm:items-end sm:gap-5 sm:px-6 sm:pb-6">
          <div className="relative -mt-12 w-fit flex-none">
            <span className="grid h-24 w-24 place-items-center overflow-hidden rounded-full border-4 border-card bg-parchment shadow-[0_8px_24px_-10px_rgba(8,39,79,0.45)]">
              {user.imageUrl ? (
                <Image src={user.imageUrl} alt="" width={96} height={96} className="h-full w-full object-cover" />
              ) : (
                <span className="font-display text-4xl text-indigo/40">{displayName.charAt(0).toUpperCase()}</span>
              )}
            </span>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              aria-label="Change photo"
              className="absolute bottom-0.5 right-0.5 grid h-8 w-8 place-items-center rounded-full border-2 border-card bg-teal text-white shadow-sm transition-colors hover:bg-teal-deep disabled:opacity-60"
            >
              <Camera size={14} strokeWidth={2} />
            </button>
          </div>

          <div className="min-w-0 flex-1">
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
                  className={`${fieldClass} max-w-xs font-display text-lg`}
                />
                <button type="button" onClick={handleSaveName} aria-label="Save name" className="grid h-9 w-9 place-items-center rounded-full bg-teal text-white">
                  <Check size={16} />
                </button>
                <button type="button" onClick={handleCancelEdit} aria-label="Cancel" className="grid h-9 w-9 place-items-center rounded-full text-ink/50 ring-1 ring-ink/15">
                  <X size={16} />
                </button>
              </div>
            ) : (
              <button type="button" onClick={() => setEditingName(true)} className="group flex max-w-full items-center gap-2 text-left">
                <span className="truncate font-display text-2xl text-ink sm:text-3xl">{displayName}</span>
                <Pencil size={15} className="flex-none text-ink/30 transition-colors group-hover:text-teal-deep" />
              </button>
            )}
            <p className="mt-0.5 truncate text-sm text-ink/55">{user.email}</p>
            {user.phoneVerified && (
              <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-teal/10 px-2.5 py-1 text-[11px] font-semibold text-teal-deep">
                <ShieldCheck size={12} /> WhatsApp verified
              </span>
            )}
          </div>
        </div>
      </section>

      {/* Shortcuts */}
      <div className="mt-4 grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-3">
        <QuickLink href="/account/orders" icon={Package} label="My orders" value={`${orders.length} ${orders.length === 1 ? 'order' : 'orders'}`} />
        <QuickLink href="/account/wishlist" icon={Heart} label="Wishlist" value={`${wishlistCount} saved`} />
        <QuickLink href="/account/my-following" icon={Store} label="Stores I follow" value={`${followedAt.size} ${followedAt.size === 1 ? 'store' : 'stores'}`} />
        <QuickLink href="/account/address-book" icon={MapPin} label="Address book" value={addressSummary ?? 'Add a delivery address'} />
        <QuickLink href="/account/referrals" icon={Gift} label="Refer a friend" value="Invite and earn rewards" />
        <QuickLink href="/account/messages" icon={MessageCircle} label="Messages" value="Chat with our team" />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <AccountCard icon={Mail} title="Contact" description="Where we send order updates.">
          <div className="divide-y divide-ink/8">
            <InfoRow icon={Mail} label="Email" value={user.email} />
            <InfoRow icon={MapPin} label="Default address" value={addressSummary} href="/account/address-book" />
          </div>
        </AccountCard>

        <AccountCard icon={KeyRound} title="Sign-in & security" description="Your password and WhatsApp number.">
          {/* WhatsAppVerification draws its own bottom rule. */}
          <div>
            <WhatsAppVerification />
            <div className="flex flex-col gap-3 py-5 first:pt-0 last:pb-0">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-ink">Password</p>
                  <p className="text-sm text-ink/55">{passwordSaved ? <span className="font-semibold text-teal-deep">Password updated.</span> : '••••••••'}</p>
                </div>
                {passwordStep === 'idle' && (
                  <button type="button" className={btnSecondary} onClick={() => setPasswordStep('entering')}>
                    Change
                  </button>
                )}
              </div>
              {passwordStep === 'entering' && (
                <div className="flex flex-col gap-2 sm:flex-row">
                  <input
                    type="password"
                    placeholder="New password (6+ characters)"
                    minLength={6}
                    autoComplete="new-password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className={fieldClass}
                  />
                  <div className="flex flex-none gap-2">
                    <button type="button" className={btnPrimary} onClick={handleChangePassword} disabled={passwordBusy}>
                      {passwordBusy ? 'Saving…' : 'Save'}
                    </button>
                    <button type="button" className={btnSecondary} onClick={() => setPasswordStep('idle')}>
                      Cancel
                    </button>
                  </div>
                </div>
              )}
              {passwordError && <p className="text-xs font-semibold text-red-600">{passwordError}</p>}
            </div>
          </div>
        </AccountCard>

        <AccountCard icon={Bell} title="Notifications" description="How we reach you about replies, orders and offers.">
          <NotificationSettings bare />
        </AccountCard>

        <AccountCard icon={ShieldCheck} title="Your data" description="Handled by our support team, after checking it's you.">
          <div className="divide-y divide-ink/8">
            <QuietRow
              label="Download your information"
              description="Ask for a copy of your personal data."
              icon={Download}
              onClick={() => window.location.assign('mailto:support@Wishdrop.shop?subject=Data%20export%20request')}
            />
            <QuietRow
              label="Delete account"
              description="Your account can't be recovered once deleted."
              icon={Trash2}
              onClick={() => window.location.assign('mailto:support@Wishdrop.shop?subject=Delete%20my%20account')}
            />
          </div>
        </AccountCard>
      </div>
    </AccountPage>
  )
}
