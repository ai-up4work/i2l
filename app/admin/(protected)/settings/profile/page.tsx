// app/admin/(protected)/settings/profile/page.tsx
//
// Real self-service settings, replacing the old one-line stub
// (`<div>Profile settings</div>`). Per the route spec: "Edit own
// details only — no access to any other account from here." This is
// exactly why it's built on useCurrentStaff() (the REAL signed-in
// person, via /api/admin/auth/me) rather than useAdminData()'s
// currentUser, which is the mock role-switcher's previewed identity —
// see that hook's own doc comment for what could go wrong otherwise.
'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Loader2, Bell } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useCurrentStaff } from '@/hooks/useCurrentStaff'
import { NOTIFICATION_TOGGLES, PROFILE_SHORTCUT_TOGGLE_IDS } from '@/lib/admin/notification-toggles'
import { ToggleSwitch } from '@/components/admin/Toggleswitch'

const ROLE_LABEL: Record<string, string> = {
  manager: 'Manager',
  sales: 'Sales & Purchase',
  warehouse: 'Warehouse',
  super_admin: 'Super Admin',
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

export default function ProfileSettingsPage() {
  const { staff, setStaff, loading: staffLoading, error: staffError } = useCurrentStaff()

  const [nameStep, setNameStep] = useState<'idle' | 'entering'>('idle')
  const [nameInput, setNameInput] = useState('')
  const [nameError, setNameError] = useState<string | null>(null)
  const [nameBusy, setNameBusy] = useState(false)

  const [passwordStep, setPasswordStep] = useState<'idle' | 'entering'>('idle')
  const [newPassword, setNewPassword] = useState('')
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [passwordSaved, setPasswordSaved] = useState(false)
  const [passwordBusy, setPasswordBusy] = useState(false)

  const [prefs, setPrefs] = useState<Record<string, boolean>>({})
  const [pendingToggleId, setPendingToggleId] = useState<string | null>(null)
  const [toggleError, setToggleError] = useState<string | null>(null)

  useEffect(() => {
    if (staff) {
      setNameInput(staff.name)
      setPrefs(staff.notification_prefs ?? {})
    }
  }, [staff])

  async function handleSaveName() {
    if (!staff || !nameInput.trim()) return
    setNameError(null)
    setNameBusy(true)
    try {
      const res = await fetch(`/api/admin/staff/${staff.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: nameInput.trim() }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error ?? 'Could not update your name.')
      setStaff(body.staff)
      setNameStep('idle')
    } catch (err) {
      setNameError(err instanceof Error ? err.message : 'Could not update your name.')
    } finally {
      setNameBusy(false)
    }
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

  const isOn = (id: string) => prefs[id] !== false

  async function handleToggle(id: string) {
    const nextEnabled = !isOn(id)
    const previous = prefs
    setToggleError(null)
    setPendingToggleId(id)
    setPrefs((p) => {
      const next = { ...p }
      if (nextEnabled) delete next[id]
      else next[id] = false
      return next
    })
    try {
      const res = await fetch('/api/admin/settings/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: id, enabled: nextEnabled }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error ?? 'Could not save that change.')
      setPrefs(body.prefs ?? {})
    } catch (err) {
      setPrefs(previous)
      setToggleError(err instanceof Error ? err.message : 'Could not save that change.')
    } finally {
      setPendingToggleId(null)
    }
  }

  const shortcutToggles = NOTIFICATION_TOGGLES.filter((t) => PROFILE_SHORTCUT_TOGGLE_IDS.includes(t.id))

  return (
    <div className="h-full overflow-y-auto bg-parchment font-body text-ink">
      <div className="mx-auto max-w-2xl px-6 pb-20 pt-10 lg:px-10">
        <Link href="/admin/settings" className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink/50 hover:text-ink">
          <ArrowLeft size={14} />
          Settings
        </Link>

        <h1 className="mt-3 font-display text-3xl text-ink">Profile</h1>
        <p className="mt-1.5 max-w-md text-sm leading-relaxed text-ink/60">
          Your own account details. Editing your role, site, or status happens elsewhere — ask a Manager
          or Super Admin.
        </p>

        {staffError && <p className="mt-6 text-sm font-semibold text-red-600">{staffError}</p>}

        {staffLoading ? (
          <div className="mt-8 flex items-center gap-2 rounded-2xl border border-ink/10 bg-card px-6 py-8 text-sm text-ink/45">
            <Loader2 size={15} className="animate-spin" />
            Loading your account…
          </div>
        ) : staff ? (
          <>
            <div className="mt-8 rounded-2xl border border-ink/10 bg-card px-6 sm:px-8">
              {/* Name */}
              <div className="flex flex-col gap-3 border-b border-ink/10 py-5 first:pt-6 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-ink">Name</p>
                  {nameStep === 'idle' ? (
                    <p className="mt-1 text-sm text-ink/60">{staff.name}</p>
                  ) : (
                    <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
                      <input
                        type="text"
                        value={nameInput}
                        onChange={(e) => setNameInput(e.target.value)}
                        className="rounded-xl border border-ink/15 bg-white px-3 py-2 text-sm text-ink outline-none focus:border-teal/60 focus:ring-2 focus:ring-teal/10"
                      />
                      <div className="flex gap-2">
                        <SolidButton onClick={handleSaveName} disabled={nameBusy || !nameInput.trim()}>
                          {nameBusy ? 'Saving…' : 'Save'}
                        </SolidButton>
                        <OutlineButton
                          onClick={() => {
                            setNameStep('idle')
                            setNameInput(staff.name)
                            setNameError(null)
                          }}
                        >
                          Cancel
                        </OutlineButton>
                      </div>
                    </div>
                  )}
                  {nameError && <p className="mt-2 text-xs font-semibold text-red-600">{nameError}</p>}
                </div>
                {nameStep === 'idle' && (
                  <OutlineButton onClick={() => setNameStep('entering')}>Edit</OutlineButton>
                )}
              </div>

              {/* Email — read-only here; changing a login email is a
                  verification flow of its own, not a plain text field,
                  so this deliberately isn't editable from this page. */}
              <div className="flex flex-col gap-1 border-b border-ink/10 py-5 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="font-semibold text-ink">Email</p>
                  <p className="mt-1 text-sm text-ink/60">{staff.email}</p>
                </div>
                <span className="rounded-full bg-teal/12 px-2.5 py-1 text-[11px] font-semibold text-teal-deep">
                  {ROLE_LABEL[staff.role] ?? staff.role}
                </span>
              </div>

              {/* Password */}
              <div className="flex flex-col gap-3 py-5 last:pb-6 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-ink">Password</p>
                  {passwordStep === 'idle' ? (
                    <p className="mt-1 text-sm text-ink/60">
                      {passwordSaved ? <span className="font-semibold text-teal-deep">Password updated.</span> : '••••••••'}
                    </p>
                  ) : (
                    <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
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
                </div>
                {passwordStep === 'idle' && (
                  <OutlineButton onClick={() => setPasswordStep('entering')}>Change</OutlineButton>
                )}
              </div>
            </div>

            {/* Notification preference shortcuts — the two most
                time-sensitive toggles, not the full list (see
                /admin/settings/notifications for everything). Per the
                route spec's "notification preference shortcuts" line. */}
            <div className="mt-6 flex items-center justify-between">
              <p className="text-xs font-semibold text-ink/45">Notification shortcuts</p>
              <Link href="/admin/settings/notifications" className="flex items-center gap-1 text-xs font-semibold text-teal-deep hover:underline">
                <Bell size={12} />
                All notification settings
              </Link>
            </div>
            {toggleError && <p className="mt-2 text-xs font-semibold text-red-600">{toggleError}</p>}
            <div className="mt-2 divide-y divide-ink/10 overflow-hidden rounded-2xl border border-ink/10 bg-card px-6 sm:px-8">
              {shortcutToggles.map((toggle) => (
                <div key={toggle.id} className="flex items-center justify-between gap-6 py-4 first:pt-5 last:pb-5">
                  <p className="text-sm font-semibold text-ink">{toggle.label}</p>
                  <ToggleSwitch
                    checked={isOn(toggle.id)}
                    onChange={() => handleToggle(toggle.id)}
                    disabled={pendingToggleId === toggle.id}
                    label={toggle.label}
                  />
                </div>
              ))}
            </div>
          </>
        ) : null}
      </div>
    </div>
  )
}