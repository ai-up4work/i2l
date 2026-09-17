// app/admin/(protected)/settings/notifications/page.tsx
//
// Real toggle list, replacing the old one-line stub
// (`<div>Notification settings</div>`). Per-account only, per the route
// spec ("Per-account toggles only, not a platform-wide setting") — this
// reads and writes ONLY the current signed-in staff member's own row,
// via /api/admin/settings/notifications, which resolves "who this is"
// from the Supabase session server-side rather than trusting a staffId
// the client could pass. There is nowhere on this page to affect
// anyone else's preferences.
'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { useCurrentStaff } from '@/hooks/useCurrentStaff'
import { NOTIFICATION_TOGGLES } from '@/lib/admin/notification-toggles'
import { ToggleSwitch } from '@/components/admin/Toggleswitch'

export default function NotificationSettingsPage() {
  const { staff, loading: staffLoading, error: staffError } = useCurrentStaff()
  const [prefs, setPrefs] = useState<Record<string, boolean>>({})
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)

  useEffect(() => {
    if (staff) setPrefs(staff.notification_prefs ?? {})
  }, [staff])

  // Absent key = on. Only OFF exceptions are ever stored — see this
  // page's own doc comment and the migration's.
  const isOn = (id: string) => prefs[id] !== false

  async function handleToggle(id: string) {
    const nextEnabled = !isOn(id)
    const previous = prefs
    setSaveError(null)
    setPendingId(id)
    // Optimistic — flip immediately, roll back only if the save fails.
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
      setSaveError(err instanceof Error ? err.message : 'Could not save that change.')
    } finally {
      setPendingId(null)
    }
  }

  return (
    <div className="h-full overflow-y-auto bg-parchment font-body text-ink">
      <div className="mx-auto max-w-2xl px-6 pb-20 pt-10 lg:px-10">
        <Link href="/admin/settings" className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink/50 hover:text-ink">
          <ArrowLeft size={14} />
          Settings
        </Link>

        <h1 className="mt-3 font-display text-3xl text-ink">Notifications</h1>
        <p className="mt-1.5 max-w-md text-sm leading-relaxed text-ink/60">
          Choose what you get notified about. This only changes your own alerts — everyone on the team
          decides theirs separately.
        </p>

        {staffError && <p className="mt-6 text-sm font-semibold text-red-600">{staffError}</p>}
        {saveError && <p className="mt-6 text-sm font-semibold text-red-600">{saveError}</p>}

        <div className="mt-8 divide-y divide-ink/10 overflow-hidden rounded-2xl border border-ink/10 bg-card px-6 sm:px-8">
          {staffLoading ? (
            <div className="flex items-center gap-2 py-8 text-sm text-ink/45">
              <Loader2 size={15} className="animate-spin" />
              Loading your preferences…
            </div>
          ) : (
            NOTIFICATION_TOGGLES.map((toggle) => (
              <div key={toggle.id} className="flex items-start justify-between gap-6 py-5 first:pt-6 last:pb-6">
                <div className="min-w-0">
                  <p className="font-semibold text-ink">{toggle.label}</p>
                  <p className="mt-0.5 text-sm text-ink/55">{toggle.description}</p>
                </div>
                <ToggleSwitch
                  checked={isOn(toggle.id)}
                  onChange={() => handleToggle(toggle.id)}
                  disabled={pendingId === toggle.id || !staff}
                  label={toggle.label}
                />
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}