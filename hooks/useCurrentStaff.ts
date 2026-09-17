// hooks/useCurrentStaff.ts
'use client'
import { useEffect, useState } from 'react'

export type CurrentStaff = {
  id: string
  name: string
  email: string
  role: string
  site_id: string | null
  status: string
  notification_prefs: Record<string, boolean> | null
}

/**
 * The REAL logged-in staff member, via /api/admin/auth/me — deliberately
 * separate from useAdminData()'s `currentUser`, which is derived from
 * the mock role-switcher (MOCK_USERS[role], see AdminDataContext.tsx)
 * and represents "whichever role is being previewed," not "who is
 * actually signed in." The settings pages are self-service (edit your
 * own name, change your own password, your own notification
 * preferences) — using the previewed-role identity there would mean a
 * Manager previewing "Warehouse" could end up editing Amara Perera's
 * account details, or a change could silently save against the wrong
 * person. This hook is what every self-service settings page uses
 * instead.
 */
export function useCurrentStaff() {
  const [staff, setStaff] = useState<CurrentStaff | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch('/api/admin/auth/me')
      .then(async (res) => {
        const body = await res.json().catch(() => ({}))
        if (cancelled) return
        if (!res.ok) {
          setError(body.error ?? 'Could not load your account.')
          setLoading(false)
          return
        }
        setStaff(body.staff as CurrentStaff)
        setLoading(false)
      })
      .catch(() => {
        if (!cancelled) {
          setError('Could not load your account.')
          setLoading(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  return { staff, setStaff, loading, error }
}