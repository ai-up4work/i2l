// app/account/profile/page.tsx
'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import ProfilePage from '@/components/dashboard/ProfilePage'
import { useAuth } from '@/contexts/AuthContext'
import { createClient } from '@/lib/supabase/client'

export default function ProfileRoute() {
  const router = useRouter()
  const { user, logout } = useAuth()
  const supabase = createClient()

  const [phone, setPhone] = useState<string | undefined>(undefined)
  const [phoneVerified, setPhoneVerified] = useState(false)
  const [defaultAddress, setDefaultAddress] = useState<string | undefined>(undefined)

  useEffect(() => {
    if (!user) return
    let cancelled = false
    ;(async () => {
      const [{ data: profile }, { data: address }] = await Promise.all([
        supabase.from('profiles').select('phone, phone_verified').eq('id', user.id).maybeSingle(),
        supabase
          .from('addresses')
          .select('address_line1, city, country')
          .eq('user_id', user.id)
          .eq('is_default', true)
          .maybeSingle(),
      ])
      if (cancelled) return
      setPhone(profile?.phone ?? undefined)
      setPhoneVerified(Boolean(profile?.phone_verified))
      setDefaultAddress(address ? [address.address_line1, address.city, address.country].filter(Boolean).join(', ') : undefined)
    })()
    return () => {
      cancelled = true
    }
  }, [user]) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleUpdateName(name: string) {
    if (!user) return
    await Promise.all([
      supabase.from('profiles').update({ full_name: name }).eq('id', user.id),
      supabase.auth.updateUser({ data: { full_name: name } }),
    ])
  }

  return (
    <ProfilePage
      name={user?.name}
      email={user?.email}
      phone={phone}
      phoneVerified={phoneVerified}
      avatarUrl={user?.imageUrl}
      address={defaultAddress}
      onUpdateName={handleUpdateName}
      onManageAddresses={() => router.push('/account/address-book')}
      onSecuritySettings={() => router.push('/account/settings')}
      onNotificationSettings={() => router.push('/account/settings')}
      onSignOut={logout}
    />
  )
}
