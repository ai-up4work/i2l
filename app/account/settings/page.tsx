// app/account/settings/page.tsx
'use client'

import { ChevronRight } from 'lucide-react'

function SettingsRow({
  label,
  badge,
  children,
  action,
}: {
  label: string
  badge?: string
  children: React.ReactNode
  action: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-4 border-b border-ink/10 py-6 last:border-0 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <div className="flex items-center gap-2 font-body text-base font-bold text-ink">
          {label}
          {badge && (
            <span className="rounded-full bg-rose-500/90 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">
              +{badge}
            </span>
          )}
        </div>
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
      className="rounded-lg border border-ink/25 bg-parchment px-6 py-2.5 font-body text-sm font-bold text-ink transition-colors hover:border-ink hover:bg-ink/5"
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
      className="rounded-lg bg-ink px-6 py-2.5 font-body text-sm font-bold text-parchment transition-colors hover:bg-ink/85"
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

// TODO: wire these up to real auth/user state once available — email
// masking, phone presence, etc. are placeholders matching the screenshot.
export default function SettingsPage() {
  const maskedEmail = 's*******0@cse.mrt.ac.lk'

  return (
    <div className="mx-auto max-w-4xl px-6 py-10 lg:px-10">
      <h1 className="font-display text-3xl font-bold uppercase tracking-wide text-ink">
        Manage My Account
      </h1>

      <div className="mt-8 rounded-2xl border border-ink/10 bg-white px-6 sm:px-8">
        <SettingsRow label="Email" badge="100 Points" action={
          <div className="flex gap-3">
            <OutlineButton onClick={() => {/* open change-email flow */}}>
              Change
            </OutlineButton>
            <SolidButton onClick={() => {/* start verification */}}>
              Verify Now
            </SolidButton>
          </div>
        }>
          {maskedEmail}
        </SettingsRow>

        <SettingsRow
          label="Phone Number"
          action={<OutlineButton onClick={() => {/* open add-phone flow */}}>Add</OutlineButton>}
        >
          After entering and verifying the phone number, you can log in directly with your phone number
        </SettingsRow>

        <SettingsRow
          label="Change Password"
          action={<OutlineButton onClick={() => {/* open change-password flow */}}>Change</OutlineButton>}
        >
          ********
        </SettingsRow>

        <LinkRow
          label="Delete Account"
          description="NOTE: Account will NOT BE RECOVERABLE once deleted."
          onClick={() => {/* navigate to delete-account confirmation */}}
        />

        <LinkRow
          label="Download Your Information"
          description="To request a copy of your personal data, please complete the form below. To maintain the security of your data, we will verify your identity based on the information you provide below and the information in our systems. If we need further information for verification purposes, we will contact you."
          onClick={() => {/* navigate to data-export request */}}
        />
      </div>
    </div>
  )
}