// app/account/settings/page.tsx
'use client'

import { useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { createClient } from '@/lib/supabase/client'

function SettingsRow({
  label,
  children,
  action,
}: {
  label: string
  children: React.ReactNode
  action: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-4 border-b border-ink/10 py-6 last:border-0 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <div className="flex items-center gap-2 font-body text-base font-bold text-ink">{label}</div>
        <div className="mt-1 font-body text-sm text-ink/60">{children}</div>
      </div>
      <div className="flex-none">{action}</div>
    </div>
  )
}

function OutlineButton({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className="rounded-lg border border-ink/25 bg-parchment px-6 py-2.5 font-body text-sm font-bold text-ink transition-colors hover:border-ink hover:bg-ink/5 disabled:cursor-not-allowed disabled:opacity-50"
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
      className="rounded-lg bg-ink px-6 py-2.5 font-body text-sm font-bold text-parchment transition-colors hover:bg-ink/85 disabled:cursor-not-allowed disabled:opacity-50"
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
      className="flex w-full items-start justify-between gap-6 border-b border-ink/10 py-6 text-left last:border-0"
    >
      <div>
        <div className="font-body text-base font-bold text-ink">{label}</div>
        <p className="mt-1 max-w-2xl font-body text-sm text-ink/60">{description}</p>
      </div>
      <ChevronRight className="mt-1 h-4 w-4 flex-none text-ink/40" />
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
    <div className="mx-auto max-w-4xl px-6 py-10 lg:px-10">
      <h1 className="font-display text-3xl font-bold uppercase tracking-wide text-ink">
        Manage My Account
      </h1>

      <div className="mt-8 rounded-2xl border border-ink/10 bg-white px-6 sm:px-8">
        <SettingsRow label="Email" action={undefined}>
          {user?.email ? maskEmail(user.email) : '—'}
        </SettingsRow>

        <SettingsRow
          label="Phone Number"
          action={
            phoneStep === 'idle' ? (
              user?.phoneVerified ? (
                <span className="text-xs font-semibold text-teal-deep">Verified</span>
              ) : (
                <OutlineButton onClick={() => setPhoneStep('entering')}>Add</OutlineButton>
              )
            ) : undefined
          }
        >
          {phoneStep === 'idle' ? (
            user?.phoneVerified
              ? 'Your phone number is verified.'
              : 'After entering and verifying the phone number, you can log in directly with your phone number'
          ) : phoneStep === 'entering' ? (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <input
                type="tel"
                placeholder="+94 7X XXX XXXX"
                value={phoneInput}
                onChange={(e) => setPhoneInput(e.target.value)}
                className="rounded-lg border border-ink/15 px-3 py-2 text-sm outline-none focus:border-teal"
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
                className="rounded-lg border border-ink/15 px-3 py-2 text-sm outline-none focus:border-teal"
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
        </SettingsRow>

        <SettingsRow
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
              '********'
            )
          ) : (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <input
                type="password"
                placeholder="New password"
                minLength={6}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="rounded-lg border border-ink/15 px-3 py-2 text-sm outline-none focus:border-teal"
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
        </SettingsRow>

        {/*
          Delete Account / Download Your Information are real GDPR-style
          requests that need an actual backend flow (cascading delete or a
          data-export job) — not built yet. Left as a support contact
          instead of a fake button that looks like it works but does
          nothing, or silently deletes data with no real implementation
          behind it.
        */}
        <LinkRow
          label="Delete Account"
          description="NOTE: Account will NOT BE RECOVERABLE once deleted. Contact support to request this."
          onClick={() => window.location.assign('mailto:support@wishdrop.app?subject=Delete%20my%20account')}
        />

        <LinkRow
          label="Download Your Information"
          description="To request a copy of your personal data, contact support — we'll verify your identity and send it to you."
          onClick={() => window.location.assign('mailto:support@wishdrop.app?subject=Data%20export%20request')}
        />
      </div>
    </div>
  )
}
