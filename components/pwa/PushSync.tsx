'use client'

// components/pwa/PushSync.tsx
//
// When a customer signs in on a device that already has notification
// permission, re-links the device to them (see syncDeviceForSignedInUser).
// Never shows a permission prompt. Renders nothing.

import { useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { syncDeviceForSignedInUser } from '@/lib/pwa/push'

export default function PushSync() {
  const { user } = useAuth()
  const userId = user?.id

  useEffect(() => {
    if (!userId) return
    syncDeviceForSignedInUser().catch((err) => console.warn('[push] device sync failed', err))
  }, [userId])

  return null
}
