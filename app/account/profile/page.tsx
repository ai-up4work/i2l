// app/account/profile/page.tsx
'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
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
  Trash2,
  Download,
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import NotificationSettings from '@/components/pwa/NotificationSettings'
import WhatsAppVerification from '@/components/account/WhatsAppVerification'
import { createClient } from '@/lib/supabase/client'
import { useImageUpload } from '@/lib/upload/useImageUpload'

// This route existed as a dead file for a while — `pathForView('profile')`
// (see components/dashboard/routes.ts, wired to the header's "view
// profile" action in app/account/page.tsx) already pointed here, and
// components/dashboard/ProfilePage.tsx already existed fully built and
// ready to receive real data — this page is just the missing wrapper
// connecting the two to real auth/Storage/Supabase calls. It had, at one
// point, ended up as an exact duplicate of the admin QC detail page
// instead (a copy-paste mistake, not anything intentional) — that's been
// removed; this is the real page.
//
// MERGED (1): this page used to hand off to a separate /account/settings
// ("Manage My Account") page for WhatsApp verification, password
// change, and account deletion/export — two pages for what customers
// experience as one concept ("my account"), with an awkward jump
// between them for the "Security" row. That content now lives directly
// below the profile card on this same page; /account/settings is now
// just a redirect here for any old links (see that route's page.tsx).
//
// MERGED (2): components/dashboard/ProfilePage.tsx is now inlined below
// too (SectionLabel/ContactRow/SettingsRow + the avatar/name/contact/
// settings-rail/sign-out markup) instead of being imported as a prop-
// driven component. It had exactly one caller, so the props boundary
// wasn't buying anything — passing eight callbacks down for something
// that only ever ran on this one page. State and handlers that used to
// be props (editingName/nameDraft, handleSaveName/handleCancelEdit) are
// now local to this component. NOTE: the old prop list only ever passed
// `phoneVerified`, never `phone` itself, so the phone row has always
// rendered nothing (ContactRow bails out on an empty value) — carried
// over as-is rather than silently fixed here.
//
// Name/avatar are stored in TWO places, which sounds redundant but both
// matter: supabase.auth.updateUser({ data }) writes to auth.users'
// user_metadata, which is what AuthContext.toAuthUser() actually reads —
// updating only `profiles` would leave the header/AuthContext showing
// the old name until next full sign-in. `profiles.full_name`/`avatar_url`
// gets updated too since that's the column everything else in the app
// (admin chat, order listings, etc.) queries directly — see the earlier
// storage audit for why `profiles.avatar_url` existed as a real column
// with nothing ever writing to it. Both writes need to succeed for this
// to actually take effect everywhere consistently.
//
// VISUAL PASS 3 (postal motifs, no cards): a bordered white-card
// treatment was tried and then explicitly rejected — back to the flat,
// hairline-divider layout, but keeping the postal/travel motifs that
// prompted the card exploration in the first place: the postcard-style
// welcome band with its airmail edge, and a couple of faint postmark-
// stamp watermarks. Still no bordered "cards" anywhere outside that one
// welcome band — hairline dividers do the grouping work everywhere
// else. Handlers, state, and data flow are unchanged from before; only
// markup/classNames changed.
//
// VISUAL PASS 4: a few small aesthetic refinements on top of pass 3 —
// a touch more depth on the welcome band (a soft ring + shadow instead
// of a flat hairline border, so it reads as a raised surface rather
// than just a tinted rectangle), slightly larger avatar ring glow, and
// a tighter/more confident type scale on the name. None of this touches
// state or handlers, only markup/classNames.
//
// ADDRESS ROW FIX (this revision): the address row previously used the
// same `ContactRow` component as email/phone, which returns `null`
// whenever its `value` is falsy — correct for email/phone (nothing to
// show, so hide the row), but wrong for address, because it meant a
// user with no saved address (the common case for anyone who hasn't
// placed an order yet, or while the Supabase fetch is still in flight)
// saw NO address row at all: no icon, no pencil, no link to
// /account/address-book, nothing. `ContactRow` now takes an optional `onEdit` +
// `emptyLabel`: rows with `onEdit` set (address) always render, and
// fall back to `emptyLabel` ("Add an address") instead of vanishing
// when there's nothing saved yet — mirroring the always-visible
// name-edit control in the avatar section above. Rows without `onEdit`
// (email, phone) keep the exact old hide-when-empty behavior.
type IconComponent = React.ComponentType<{
  size?: number
  strokeWidth?: number
  className?: string
}>

// ---------- profile section (formerly components/dashboard/ProfilePage.tsx) ----------

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <h2 className="text-sm font-semibold text-ink/45">{children}</h2>
}

// One row in the settings rail — icon, label, chevron — separated by
// hairline dividers (see the `divide-y` wrapper below) rather than
// grouped inside a bordered card.
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
      className="group flex w-full items-center justify-between gap-3 py-4 text-left first:pt-0"
    >
      <span className="flex items-center gap-3 font-semibold text-ink transition-colors duration-150 group-hover:text-teal-deep">
        <Icon size={17} strokeWidth={1.75} className="flex-none text-ink/40 transition-colors duration-150 group-hover:text-teal-deep" />
        {label}
      </span>
      <ChevronRight
        size={15}
        className="text-ink/30 transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-teal-deep"
      />
    </button>
  )
}

// Read-only contact line (email/phone/address) — icon, value text. Not
// a button by default: these aren't actions, just display rows. Pass
// `onEdit` (address does) to turn the row into a clickable affordance
// with a pencil that appears on hover, the same visual language as the
// name-edit control above it in the welcome band.
//
// `onEdit` rows are ALWAYS rendered, even with no value — an address
// row with nothing saved yet still needs to show up with a prompt to
// add one, rather than silently disappearing (which is what happened
// before this fix: this component bailed out on any falsy `value`, so
// a user with zero saved addresses saw no address row and no way to
// reach /account/address-book at all). Rows without `onEdit` (email, phone)
// keep the old behavior of hiding when there's nothing to show.
function ContactRow({
  icon: Icon,
  value,
  verified,
  onEdit,
  emptyLabel = 'Add',
}: {
  icon: IconComponent
  value?: string
  verified?: boolean
  onEdit?: () => void
  emptyLabel?: string
}) {
  if (!value && !onEdit) return null

  const content = (
    <>
      <Icon size={14} strokeWidth={1.8} className="flex-none text-ink/40" />
      <span className={`min-w-0 flex-1 truncate text-left ${!value ? 'text-ink/45' : ''}`}>
        {value ?? emptyLabel}
      </span>
      {verified && (
        <span className="flex-none rounded-full bg-teal/12 px-2 py-0.5 text-[10px] font-semibold text-teal-deep">Verified</span>
      )}
      {onEdit && (
        <Pencil
          size={13}
          className="flex-none text-ink/30 transition-colors duration-150 group-hover:text-teal-deep"
        />
      )}
    </>
  )

  if (onEdit) {
    return (
      <button
        type="button"
        onClick={onEdit}
        className="group flex w-full items-center gap-3 rounded-lg py-2.5 text-sm text-ink/70 transition-colors duration-150 first:pt-0 hover:text-ink"
      >
        {content}
      </button>
    )
  }

  return <div className="flex items-center gap-3 py-2.5 text-sm text-ink/70 first:pt-0">{content}</div>
}

// ---------- decorative: postmark stamp ----------
// A small recurring motif — a circular postmark with concentric rings
// and a plane glyph — the one thing on the page carrying the postal
// theme now that the card treatment is gone. Used sparingly (never more
// than one per section), non-interactive.
function PostmarkStamp({
  topText,
  bottomText,
  className = '',
}: {
  topText: string
  bottomText: string
  className?: string
}) {
  return (
    <svg
      viewBox="0 0 120 120"
      aria-hidden="true"
      className={`pointer-events-none select-none text-ink/20 ${className}`}
    >
      <circle cx="60" cy="60" r="53" fill="none" stroke="currentColor" strokeWidth="1.25" strokeDasharray="2.5 4.5" />
      <circle cx="60" cy="60" r="44" fill="none" stroke="currentColor" strokeWidth="1" />
      <text x="60" y="44" textAnchor="middle" fontSize="8.5" fill="currentColor" letterSpacing="2" fontFamily="serif">
        {topText}
      </text>
      <path d="M42 60 H78 M70 52 L78 60 L70 68" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <text x="60" y="84" textAnchor="middle" fontSize="7.5" fill="currentColor" letterSpacing="1.5" fontFamily="serif">
        {bottomText}
      </text>
    </svg>
  )
}

// Thin diagonal red/blue stripe, echoing the airmail-envelope edge used
// elsewhere in the app chrome. A printed detail on the one welcome
// band, not a border applied everywhere.
function AirmailEdge({ className = '' }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={`h-[5px] w-full ${className}`}
      style={{
        backgroundImage:
          'repeating-linear-gradient(-45deg, rgba(196,64,58,0.6) 0px, rgba(196,64,58,0.6) 9px, transparent 9px 18px, rgba(38,58,120,0.6) 18px 27px, transparent 27px 36px)',
      }}
    />
  )
}

// ---------- account-security section (formerly /account/settings) ----------
// Full-width section stacked below everything else rather than a side
// column, so it isn't at the mercy of whatever width happens to be left
// over. Rows are still separated by hairline dividers only — no
// per-row backgrounds, borders, or shadows.

function SettingsCard({
  label,
  children,
  action,
}: {
  label: React.ReactNode
  children: React.ReactNode
  action?: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-4 border-b border-ink/10 py-6 first:pt-0 last:border-0 last:pb-0 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <div className="flex items-center gap-2.5 font-semibold text-ink">{label}</div>
        <div className="mt-1.5 text-sm leading-relaxed text-ink/60">{children}</div>
      </div>
      {action && <div className="flex-none">{action}</div>}
    </div>
  )
}

function OutlineButton({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className="rounded-xl border border-teal/30 bg-teal/[0.04] px-4 py-2 text-sm font-semibold text-teal-deep transition-colors hover:border-teal/50 hover:bg-teal/10 disabled:cursor-not-allowed disabled:opacity-50"
      {...props}
    >
      {children}
    </button>
  )
}

function SolidButton({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className="rounded-xl bg-teal-deep px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-teal-deep/20 transition-colors hover:bg-indigo-deep disabled:cursor-not-allowed disabled:opacity-50"
      {...props}
    >
      {children}
    </button>
  )
}

// Deliberately quiet — plain text rows with a hairline divider, no
// bold/chevron treatment the way the actionable settings above do.
// Deleting your account or exporting your data are rare, high-stakes
// actions; giving them the same visual weight as "Change Password" made
// them compete for attention they shouldn't have.
function QuietLinkRow({
  label,
  description,
  icon: Icon,
  onClick,
}: {
  label: string
  description: string
  icon: IconComponent
  onClick?: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex w-full items-start gap-3 border-b border-ink/10 py-4 text-left last:border-0 last:pb-0"
    >
      <Icon size={15} strokeWidth={1.8} className="mt-0.5 flex-none text-ink/30 transition-colors group-hover:text-ink/50" />
      <span className="flex flex-col gap-0.5">
        <span className="text-sm font-semibold text-ink/70 transition-colors group-hover:text-ink">{label}</span>
        <span className="text-xs text-ink/45">{description}</span>
      </span>
    </button>
  )
}

export default function AccountProfilePage() {
  const router = useRouter()
  const { user, logout, loading } = useAuth()
  const { uploading, error: uploadError, upload } = useImageUpload()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const securityRef = useRef<HTMLDivElement>(null)

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

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl px-6 pb-8 pt-6 lg:px-10">
        <div className="mt-6 h-64 animate-pulse rounded-[2rem] bg-ink/5" />
      </div>
    )
  }

  if (!user) {
    return (
      <div className="mx-auto max-w-4xl px-6 py-16 text-center">
        <p className="text-sm text-ink/50">You need to be signed in to view your profile.</p>
      </div>
    )
  }

  return (
    <div>
      <style>{`
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>

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

      {(saveError || uploadError) && (
        <div className="mx-auto mt-4 max-w-4xl px-6 lg:max-w-5xl lg:px-10">
          <p className="rounded-xl bg-red-50 px-4 py-2.5 text-sm font-medium text-red-700 ring-1 ring-inset ring-red-200">
            {saveError ?? uploadError}
          </p>
        </div>
      )}

      <div className="mx-auto max-w-8xl px-6 pb-8 pt-2 lg:px-10">
        {/* Welcome band: the one deliberately "designed" moment on the
            page — a postcard-style band with an airmail-stripe edge and
            a faint postmark, behind the avatar/name, so the page opens
            with an identity, not a bare list. Reads as a slightly raised
            surface (soft ring + shadow) rather than a flat tinted
            rectangle. Everything below it (settings rail, security
            section) stays flat and quiet by comparison, on purpose. */}
        <div className="relative overflow-hidden rounded-[2rem] bg-parchment/50 shadow-[0_1px_2px_rgba(28,28,28,0.04),0_12px_32px_-16px_rgba(28,28,28,0.12)] ring-1 ring-ink/[0.06]">
          <AirmailEdge />
          <div className="px-6 py-10 sm:px-10">
            <div className="grid gap-10 lg:grid-cols-2 lg:items-center lg:gap-16">
              {/* ---- Avatar + name (formerly the top of
                  components/dashboard/ProfilePage.tsx) ---- */}
              <div className="flex flex-col items-center gap-4 text-center motion-safe:[animation:fadeUp_0.35s_ease-out_both]">
                <div className="relative">
                  <span className="grid size-24 place-items-center overflow-hidden rounded-full border-2 border-white bg-parchment shadow-[0_0_0_4px_rgba(45,123,120,0.14),0_8px_20px_-8px_rgba(45,123,120,0.35)]">
                    {user.imageUrl ? (
                      <Image src={user.imageUrl} alt="" width={96} height={96} className="h-full w-full object-cover" />
                    ) : (
                      <span className="font-display text-3xl text-ink/30">{displayName.charAt(0).toUpperCase()}</span>
                    )}
                  </span>
                  {!uploading && (
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      aria-label="Change photo"
                      className="absolute bottom-0 right-0 grid size-8 place-items-center rounded-full border-2 border-white bg-teal-deep text-white shadow-sm transition-colors hover:bg-indigo-deep"
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
                      className="rounded-lg border border-ink/15 bg-white px-3 py-1.5 text-center font-display text-xl text-ink outline-none focus:border-gold/60 focus:ring-2 focus:ring-gold/50"
                    />
                    <button type="button" onClick={handleSaveName} aria-label="Save name" className="rounded-lg p-1.5 text-teal-deep hover:bg-teal/10">
                      <Check size={18} />
                    </button>
                    <button type="button" onClick={handleCancelEdit} aria-label="Cancel" className="rounded-lg p-1.5 text-ink/45 hover:bg-ink/5">
                      <X size={18} />
                    </button>
                  </div>
                ) : (
                  <button type="button" onClick={() => setEditingName(true)} className="group flex items-center gap-2">
                    <h1 className="font-display text-2xl tracking-tight text-ink">{displayName}</h1>
                    <Pencil size={14} className="text-ink/30 transition-colors group-hover:text-teal-deep" />
                  </button>
                )}
              </div>

              {/* ---- Contact info ---- */}
              <div className="motion-safe:[animation:fadeUp_0.4s_ease-out_both]" style={{ animationDelay: '60ms' }}>
                <SectionLabel>Contact info</SectionLabel>
                <div className="mt-2 divide-y divide-ink/5">
                  <ContactRow icon={Mail} value={user.email} />
                  {/* NOTE: only `phoneVerified` was ever plumbed through from
                      the old ProfilePage props — the phone number itself
                      isn't on `user` here, so this row has never actually
                      rendered anything (ContactRow returns null on an empty
                      value). Carried over unchanged; wire up a real phone
                      value if that was meant to show. */}
                  <ContactRow icon={Phone} value={undefined} verified={user.phoneVerified} />
                  {/* Address ALWAYS renders now (onEdit is set), even with
                      no address saved yet — falls back to "Add an address"
                      instead of vanishing, so there's always a visible,
                      working link to /account/address-book. See ContactRow's
                      comments above and the file-header note for why this
                      previously disappeared entirely. */}
                  <ContactRow
                    icon={MapPin}
                    value={addressSummary}
                    onEdit={() => router.push('/account/address-book')}
                    emptyLabel="Add an address"
                  />
                </div>
              </div>
            </div>
          </div>
          <PostmarkStamp
            topText="WISHDROP"
            bottomText="AIR MAIL"
            className="pointer-events-none absolute right-6 top-6 hidden h-20 w-20 sm:block"
          />
        </div>

        {/* Settings rail — split into two columns on `lg:`, mirroring the
            avatar/Contact info row above and the Account security section
            below, instead of one long single-column list. */}


       

        {/* ---- Account security (formerly the standalone "Manage My
            Account" page at /account/settings). A full-width section
            stacked below everything above, instead of a side column next
            to the profile card. */}
        <div ref={securityRef} className="relative mt-16 mb-8 scroll-mt-6 border-t border-ink/10 pt-8">          
          <PostmarkStamp
            topText="SAFE &amp;"
            bottomText="SECURE"
            className="pointer-events-none absolute right-0 top-6 hidden h-16 w-16 sm:block"
          />
          <h2 className="font-display text-xl text-ink">Account security</h2>
          <p className="mt-1 text-sm text-ink/55">Your login, WhatsApp number, and account security.</p>

          <div className="mt-12 lg:grid lg:grid-cols-2 lg:gap-x-16">
            {/* Email dropped from here — it's already shown, unmasked, in
                the Contact info section above. Repeating it a second
                time in a different (masked) format read as two sources of
                truth for the same field rather than one page. */}
            <div className="divide-y divide-ink/10">
              {/* Staff-reviewed verification via a WhatsApp message — see
                  components/account/WhatsAppVerification.tsx. Replaced the
                  Meta-template OTP flow. */}
              <WhatsAppVerification />

              <SettingsCard
                label="Change Password"
                action={
                  passwordStep === 'idle' ? <OutlineButton onClick={() => setPasswordStep('entering')}>Change</OutlineButton> : undefined
                }
              >
                {passwordStep === 'idle' ? (
                  passwordSaved ? (
                    <span className="font-semibold text-teal-deep">Password updated.</span>
                  ) : (
                    '••••••••'
                  )
                ) : (
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <input
                      type="password"
                      placeholder="New password"
                      minLength={6}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="rounded-xl border border-ink/15 bg-white px-3 py-2 text-sm text-ink outline-none focus:border-teal/60 focus:ring-2 focus:ring-teal/10"
                    />
                    <div className="flex gap-2">
                      <SolidButton onClick={handleChangePassword} disabled={passwordBusy}>
                        {passwordBusy ? 'Saving…' : 'Save'}
                      </SolidButton>
                      <OutlineButton onClick={() => setPasswordStep('idle')}>Cancel</OutlineButton>
                    </div>
                  </div>
                )}
                {passwordError && <p className="mt-2 text-xs font-semibold text-red-600">{passwordError}</p>}
              </SettingsCard>
            </div>

            {/*
              Delete Account / Download Your Information are real GDPR-style
              requests that need an actual backend flow (cascading delete or
              a data-export job) — not built yet. Left as a support contact
              instead of a fake button that looks like it works but does
              nothing, or silently deletes data with no real implementation
              behind it.

              Still visually quieter than the rows on the left (see
              QuietLinkRow) so a rare, high-stakes action doesn't compete
              with "Change Password" for attention — the quietness comes
              from type weight and color, not from being cut loose into a
              separate box. On `lg:` it sits in its own column with a
              left rule, mirroring the avatar/Contact info row above.
            */}
            <div className="mt-8 divide-y divide-ink/10 lg:mt-0 lg:border-l lg:border-ink/10 lg:pl-16">
              <QuietLinkRow
                label="Delete Account"
                description="Account will not be recoverable once deleted. Contact support to request this."
                icon={Trash2}
                onClick={() => window.location.assign('mailto:support@wishdrop.app?subject=Delete%20my%20account')}
              />
              <QuietLinkRow
                label="Download Your Information"
                description="To request a copy of your personal data, contact support — we'll verify your identity and send it to you."
                icon={Download}
                onClick={() => window.location.assign('mailto:support@wishdrop.app?subject=Data%20export%20request')}
              />
            </div>
          </div>
        </div>

        {/* ---- Notifications: push on this device + offers opt-out.
            See components/pwa/NotificationSettings.tsx. */}
        <NotificationSettings className="mt-8 mb-8" />

         {/* <button
          type="button"
          onClick={() => logout()}
          className="mt-6 flex w-full items-center gap-2.5 py-2 text-sm font-semibold text-red-600 transition-colors hover:text-red-700 motion-safe:[animation:fadeUp_0.4s_ease-out_both]"
          style={{ animationDelay: '160ms' }}
        >
          <LogOut size={16} strokeWidth={1.8} />
          Sign out
        </button> */}
      </div>
    </div>
  )
}