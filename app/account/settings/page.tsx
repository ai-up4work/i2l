// app/account/settings/page.tsx
'use client'

import { useState } from 'react'
import { ChevronRight, MessageCircle } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { createClient } from '@/lib/supabase/client'
import NotificationSettings from '@/components/pwa/NotificationSettings'

// Same card/border/spacing language as components/dashboard/ProfilePage.tsx
// and app/account/address-book/page.tsx — this page used to be a flat
// uppercase-heading list with square bg-white rows, which read as a
// different app entirely next to those two.

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
    <div className="flex flex-col gap-4 border-b border-ink/5 py-6 first:pt-0 last:border-0 last:pb-0 sm:flex-row sm:items-start sm:justify-between">
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
      className="rounded-xl border border-ink/15 bg-parchment px-4 py-2 text-sm font-semibold text-ink transition-colors hover:border-teal/40 hover:bg-teal/5 disabled:cursor-not-allowed disabled:opacity-50"
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

function LinkRow({
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
      className="flex w-full items-start justify-between gap-6 rounded-2xl border border-ink/10 bg-card p-5 text-left transition-colors hover:border-ink/20"
    >
      <div className="min-w-0">
        <div className="font-semibold text-ink">{label}</div>
        <p className="mt-1 max-w-2xl text-sm text-ink/60">{description}</p>
      </div>
      <ChevronRight className="mt-0.5 h-4 w-4 flex-none text-ink/40" />
    </button>
  )
}

function maskEmail(email: string): string {
  const [local, domain] = email.split('@')
  if (!domain) return email
  const visible = local.slice(0, 1)
  return `${visible}${'*'.repeat(Math.max(3, local.length - 1))}@${domain}`
}

export default function SettingsPage() {
  const { user, requestPhoneVerification, verifyPhone } = useAuth()
  const supabase = createClient()

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

  return (
    <div className="mx-auto max-w-3xl px-6 pb-8 pt-6 lg:px-10">
      <h1 className="font-display text-2xl text-ink">Manage My Account</h1>
      <p className="mt-1 text-sm text-ink/55">Your login, WhatsApp number, and account security.</p>

      <div className="mt-6 rounded-2xl border border-ink/10 bg-card px-6 sm:px-8">
        <SettingsCard label="Email">{user?.email ? maskEmail(user.email) : '—'}</SettingsCard>

        <SettingsCard
          label={
            <>
              <MessageCircle size={15} strokeWidth={1.8} className="text-ink/45" />
              WhatsApp Number
            </>
          }
          action={
            phoneStep === 'idle' ? (
              user?.phoneVerified ? (
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
            user?.phoneVerified ? (
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
      </div>

      <NotificationSettings />

      {/*
        Delete Account / Download Your Information are real GDPR-style
        requests that need an actual backend flow (cascading delete or a
        data-export job) — not built yet. Left as a support contact
        instead of a fake button that looks like it works but does
        nothing, or silently deletes data with no real implementation
        behind it.
      */}
      <div className="mt-4 flex flex-col gap-3">
        <LinkRow
          label="Delete Account"
          description="NOTE: Account will NOT BE RECOVERABLE once deleted. Contact support to request this."
          onClick={() => window.location.assign('mailto:support@Wishdrop.app?subject=Delete%20my%20account')}
        />
        <LinkRow
          label="Download Your Information"
          description="To request a copy of your personal data, contact support — we'll verify your identity and send it to you."
          onClick={() => window.location.assign('mailto:support@Wishdrop.app?subject=Data%20export%20request')}
        />
      </div>
    </div>
  )
}
