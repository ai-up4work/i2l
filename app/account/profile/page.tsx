// app/account/profile/page.tsx
'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { MessageCircle } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { createClient } from '@/lib/supabase/client'
import { useImageUpload } from '@/lib/upload/useImageUpload'
import ProfilePage from '@/components/dashboard/ProfilePage'

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
// MERGED: this page used to hand off to a separate /account/settings
// ("Manage My Account") page for WhatsApp verification, password
// change, and account deletion/export — two pages for what customers
// experience as one concept ("my account"), with an awkward jump
// between them for the "Security" row. That content now lives directly
// below the profile card on this same page; /account/settings is now
// just a redirect here for any old links (see that route's page.tsx).
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

// ---------- account-security section (formerly /account/settings) ----------
// Same card/border/spacing language as ProfilePage.tsx and
// app/account/address-book/page.tsx — kept as its own set of small
// components rather than folded into ProfilePage.tsx itself, since
// ProfilePage stays a fairly pure presentational component driven by
// props, and this section owns its own real Supabase/auth calls the
// same way the rest of this page wrapper does.

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
    <div className="flex flex-col gap-4 border-b border-ink/10 py-5 first:pt-0 last:border-0 last:pb-0 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <div className="flex items-center gap-2 font-semibold text-ink">{label}</div>
        <div className="mt-1 text-sm text-ink/60">{children}</div>
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
      className="rounded-xl bg-teal-deep px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-deep disabled:cursor-not-allowed disabled:opacity-50"
      {...props}
    >
      {children}
    </button>
  )
}

// Deliberately quiet — plain text rows with a hairline divider, no card
// border/background/chevron the way the actionable settings above do.
// Deleting your account or exporting your data are rare, high-stakes
// actions; giving them the same visual weight as "Change Password"
// (a bordered card, equally bold) made them compete for attention they
// shouldn't have. This reads as a low-key "by the way" footnote instead.
function QuietLinkRow({
  label,
  description,
  onClick,
}: {
  label: string
  description: string
  onClick?: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full flex-col gap-0.5 border-b border-ink/10 py-4 text-left transition-colors last:border-0 last:pb-0 hover:text-ink"
    >
      <span className="text-sm font-semibold text-ink/70">{label}</span>
      <span className="text-xs text-ink/45">{description}</span>
    </button>
  )
}

export default function AccountProfilePage() {
  const router = useRouter()
  const { user, logout, loading, requestPhoneVerification, verifyPhone } = useAuth()
  const { uploading, error: uploadError, upload } = useImageUpload()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const securityRef = useRef<HTMLDivElement>(null)

  const [addressSummary, setAddressSummary] = useState<string | undefined>(undefined)
  const [saveError, setSaveError] = useState<string | null>(null)

  // ---- account-security state (formerly /account/settings) ----
  const [phoneStep, setPhoneStep] = useState<'idle' | 'entering' | 'verifying'>('idle')
  const [phoneInput, setPhoneInput] = useState('')
  const [otpInput, setOtpInput] = useState('')
  const [phoneError, setPhoneError] = useState<string | null>(null)
  const [phoneBusy, setPhoneBusy] = useState(false)

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

  async function handleSendOtp() {
    setPhoneError(null)
    setPhoneBusy(true)
    const { error } = await requestPhoneVerification(phoneInput.trim())
    setPhoneBusy(false)
    if (error) {
      setPhoneError(error)
      return
    }
    setPhoneStep('verifying')
  }

  async function handleVerifyOtp() {
    setPhoneError(null)
    setPhoneBusy(true)
    const { error } = await verifyPhone(phoneInput.trim(), otpInput.trim())
    setPhoneBusy(false)
    if (error) {
      setPhoneError(error)
      return
    }
    setPhoneStep('idle')
    setOtpInput('')
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
      <div className="mx-auto max-w-3xl px-6 pb-8 pt-6 lg:px-10">
        <div className="mt-6 h-64 animate-pulse rounded-2xl border border-ink/10 bg-card/60" />
      </div>
    )
  }

  if (!user) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-16 text-center">
        <p className="text-sm text-ink/50">You need to be signed in to view your profile.</p>
      </div>
    )
  }

  return (
    <div>
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
        <div className="mx-auto mt-4 max-w-3xl px-6 lg:max-w-5xl lg:px-10">
          <p className="rounded-xl bg-red-50 px-4 py-2.5 text-sm font-medium text-red-700 ring-1 ring-inset ring-red-200">
            {saveError ?? uploadError}
          </p>
        </div>
      )}

      {/* Desktop: profile summary (left, fixed width) + account security
          (right, flexible) side by side, instead of one narrow column
          with a lot of empty margin either side on a wide viewport.
          Below `lg:` this is just a plain stack, same as before — each
          child keeps its own mobile-width styling. Right column is
          still capped (max-w-xl below) rather than left to stretch:
          SettingsCard's rows use justify-between to pin their action
          button to the right edge, so letting the row itself get very
          wide just stretches the empty gap between label and button. */}
      <div className="lg:grid lg:grid-cols-[420px_minmax(0,1fr)] lg:items-start lg:gap-12 lg:px-10">
        <ProfilePage
          name={user.name}
          email={user.email}
          phoneVerified={user.phoneVerified}
          avatarUrl={user.imageUrl}
          address={addressSummary}
          onUpdateName={handleUpdateName}
          onManageAddresses={() => router.push('/account/address-book')}
          // Scrolls down to the account-security section on this same
          // page instead of navigating to a separate route — see the
          // file-level doc comment on why these two pages were merged.
          // On the lg: two-column layout it's already alongside the
          // security section, so this mostly matters on mobile, where
          // the two are stacked.
          onSecuritySettings={() => securityRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
          // onManagePayments/onNotificationSettings deliberately left
          // unset — there's no payment-methods or notification-preferences
          // feature built yet (no payment gateway, no notification prefs
          // table), so routing those rows into Settings would just be
          // wrong. They still render (ProfilePage always shows all four
          // rows), they just don't navigate anywhere until those features
          // actually exist.
          onChangeAvatar={uploading ? undefined : () => fileInputRef.current?.click()}
          onSignOut={() => logout()}
        />

        {/* ---- Account security (formerly the standalone "Manage My
            Account" page at /account/settings) ---- */}
        <div ref={securityRef} className="mx-auto mt-8 max-w-3xl scroll-mt-6 px-6 pb-8 lg:mx-0 lg:mt-0 lg:max-w-md lg:px-0">
          <h2 className="font-display text-xl text-ink">Account security</h2>
          <p className="mt-1 text-sm text-ink/55">Your login, WhatsApp number, and account security.</p>

          <div className="mt-4 rounded-2xl border border-ink/10 bg-card px-6 sm:px-8">
          {/* Email dropped from here — it's already shown, unmasked, in
              the Contact info card next to it. Repeating it a second
              time in a different (masked) format read as two sources of
              truth for the same field rather than one page. */}
          <SettingsCard
            label={
              <>
                <span className="grid h-6 w-6 flex-none place-items-center rounded-full bg-teal/12 text-teal-deep">
                  <MessageCircle size={13} strokeWidth={2} />
                </span>
                WhatsApp Number
              </>
            }
            action={
              phoneStep === 'idle' ? (
                user.phoneVerified ? (
                  <span className="rounded-full bg-teal/12 px-2.5 py-1 text-[11px] font-semibold text-teal-deep">
                    Verified
                  </span>
                ) : (
                  <OutlineButton onClick={() => setPhoneStep('entering')}>Add</OutlineButton>
                )
              ) : undefined
            }
          >
            {phoneStep === 'idle' ? (
              user.phoneVerified ? (
                "We'll use this number to send order updates on WhatsApp and to verify it's really you in chat."
              ) : (
                "Add and verify your WhatsApp number so we can message you about your orders, and so our chat panel can confirm it's you."
              )
            ) : phoneStep === 'entering' ? (
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <input
                  type="tel"
                  placeholder="+94 7X XXX XXXX"
                  value={phoneInput}
                  onChange={(e) => setPhoneInput(e.target.value)}
                  className="rounded-xl border border-ink/15 bg-white px-3 py-2 text-sm text-ink outline-none focus:border-teal/60 focus:ring-2 focus:ring-teal/10"
                />
                <div className="flex gap-2">
                  <SolidButton onClick={handleSendOtp} disabled={phoneBusy || !phoneInput.trim()}>
                    {phoneBusy ? 'Sending…' : 'Send code'}
                  </SolidButton>
                  <OutlineButton onClick={() => setPhoneStep('idle')}>Cancel</OutlineButton>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <input
                  type="text"
                  placeholder="Enter the code we sent you"
                  value={otpInput}
                  onChange={(e) => setOtpInput(e.target.value)}
                  className="rounded-xl border border-ink/15 bg-white px-3 py-2 text-sm text-ink outline-none focus:border-teal/60 focus:ring-2 focus:ring-teal/10"
                />
                <div className="flex gap-2">
                  <SolidButton onClick={handleVerifyOtp} disabled={phoneBusy || !otpInput.trim()}>
                    {phoneBusy ? 'Verifying…' : 'Verify'}
                  </SolidButton>
                  <OutlineButton onClick={() => setPhoneStep('idle')}>Cancel</OutlineButton>
                </div>
              </div>
            )}
            {phoneError && <p className="mt-2 text-xs font-semibold text-red-600">{phoneError}</p>}
          </SettingsCard>

          <SettingsCard
            label="Change Password"
            action={
              passwordStep === 'idle' ? (
                <OutlineButton onClick={() => setPasswordStep('entering')}>Change</OutlineButton>
              ) : undefined
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

          {/*
            Delete Account / Download Your Information are real GDPR-style
            requests that need an actual backend flow (cascading delete or
            a data-export job) — not built yet. Left as a support contact
            instead of a fake button that looks like it works but does
            nothing, or silently deletes data with no real implementation
            behind it.

            Kept inside the same card as WhatsApp/Password rather than a
            separate floating block below it — that split left an
            unstyled patch of plain text sitting in open space beneath a
            bordered card, which read as unfinished rather than
            intentional. Still visually quieter than the rows above it
            (see QuietLinkRow) so a rare, high-stakes action doesn't
            compete with "Change Password" for attention — the quietness
            comes from type weight and color, not from being cut loose
            from the card.
          */}
          <QuietLinkRow
            label="Delete Account"
            description="NOTE: Account will NOT BE RECOVERABLE once deleted. Contact support to request this."
            onClick={() => window.location.assign('mailto:support@wishdrop.app?subject=Delete%20my%20account')}
          />
          <QuietLinkRow
            label="Download Your Information"
            description="To request a copy of your personal data, contact support — we'll verify your identity and send it to you."
            onClick={() => window.location.assign('mailto:support@wishdrop.app?subject=Data%20export%20request')}
          />
        </div>
      </div>
    </div>
    </div>
  )
}