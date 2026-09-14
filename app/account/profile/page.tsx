// app/account/profile/page.tsx
'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import ProfilePage from '@/components/dashboard/ProfilePage'
import { useAuth } from '@/contexts/AuthContext'
import { useChat } from '@/contexts/ChatContext'
import { createClient } from '@/lib/supabase/client'
import { useImageUpload } from '@/lib/upload/useImageUpload'

// Postgres unique_violation — thrown when someone tries to save a
// chat_handle that's already taken (profiles.chat_handle has a UNIQUE
// constraint). Named instead of inlined so the check below reads as
// intent, not a magic string.
const UNIQUE_VIOLATION = '23505'

export default function ProfileRoute() {
  const router = useRouter()
  const { user, loading: authLoading, logout } = useAuth()
  const { refreshHandle } = useChat()
  const supabase = createClient()

  const [pageLoading, setPageLoading] = useState(true)
  const [phone, setPhone] = useState<string | undefined>(undefined)
  const [phoneVerified, setPhoneVerified] = useState(false)
  const [defaultAddress, setDefaultAddress] = useState<string | undefined>(undefined)
  const [chatHandle, setChatHandle] = useState<string | undefined>(undefined)
  const [referralCode, setReferralCode] = useState<string | undefined>(undefined)

  // Local override so the avatar updates immediately after a successful
  // upload without waiting on AuthContext to refresh `user.imageUrl` from
  // wherever it sources that value.
  const [avatarUrl, setAvatarUrl] = useState<string | undefined>(undefined)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Upload state (uploading flag + error message) lives in the shared
  // hook instead of being hand-rolled here — every other image upload in
  // the app (product photos, review photos, banners) uses the same hook,
  // so this page doesn't duplicate the storage/validation logic.
  const { uploading: avatarUploading, error: avatarError, upload: uploadImage } = useImageUpload()

  useEffect(() => {
    setAvatarUrl(user?.imageUrl)
  }, [user?.imageUrl])

  useEffect(() => {
    if (authLoading) return
    if (!user) {
      setPageLoading(false)
      return
    }
    let cancelled = false
    setPageLoading(true)
    ;(async () => {
      const [{ data: profile }, { data: address }] = await Promise.all([
        supabase
          .from('profiles')
          .select('phone, phone_verified, chat_handle, referral_code')
          .eq('id', user.id)
          .maybeSingle(),
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
      setChatHandle(profile?.chat_handle ?? undefined)
      setReferralCode(profile?.referral_code ?? undefined)
      setDefaultAddress(
        address
          ? [address.address_line1, address.city, address.country].filter(Boolean).join(', ')
          : undefined,
      )
      setPageLoading(false)
      // profiles.chat_handle is the single source of truth now — no more
      // auth-metadata self-heal needed here. ChatContext reads chat_handle
      // straight from profiles itself, so there's nothing to reconcile.
    })()
    return () => {
      cancelled = true
    }
    // Depend on the primitive id, not the `user` object — Supabase can
    // emit a new (but value-equal) user object on tab-focus/token-refresh
    // auth events, and depending on the object reference would re-run
    // this fetch (and the loading skeleton) every time the tab regains
    // focus even though nothing actually changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, authLoading])

  async function handleUpdateName(name: string) {
    if (!user) return
    await Promise.all([
      supabase.from('profiles').update({ full_name: name }).eq('id', user.id),
      supabase.auth.updateUser({ data: { full_name: name } }),
    ])
  }

  async function handleUpdateHandle(handle: string): Promise<string | void> {
    if (!user) return 'You need to be signed in to do that.'
    const { error } = await supabase.from('profiles').update({ chat_handle: handle }).eq('id', user.id)
    if (error) {
      if (error.code === UNIQUE_VIOLATION) {
        return 'That handle is already taken.'
      }
      return error.message
    }
    // profiles.chat_handle is the single source of truth now — tell
    // ChatContext to re-read it so the messages page picks up the change
    // immediately, without waiting for a remount or an auth event.
    await refreshHandle()
    setChatHandle(handle)
  }

  function handleChangeAvatar() {
    fileInputRef.current?.click()
  }

  async function handleAvatarFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-selecting the same file later
    if (!file || !user) return

    // Type/size validation, storage upload, and public URL resolution all
    // happen inside the shared hook now — this just calls it and reacts
    // to the result. avatarError is set by the hook itself on failure.
    const url = await uploadImage(file, 'avatars')
    if (!url) return

    const [{ error: profileError }, { error: authError }] = await Promise.all([
      supabase.from('profiles').update({ avatar_url: url }).eq('id', user.id),
      supabase.auth.updateUser({ data: { avatar_url: url } }),
    ])

    // auth.updateUser is what AuthContext's cached AuthUser actually reads
    // from (see toAuthUser() in contexts/AuthContext.tsx), so treat a
    // failure there as the real failure case.
    if (authError) {
      console.error('[avatar upload] auth sync failed', authError)
      return
    }
    // A profiles-table failure alone shouldn't block the visible update —
    // auth-level write already succeeded — but it's worth knowing about
    // since other code may read avatar_url from the profiles table
    // directly rather than from auth user_metadata.
    if (profileError) {
      console.error('[avatar upload] profiles sync failed', profileError)
    }

    setAvatarUrl(url)
  }

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleAvatarFileSelected}
      />
      <ProfilePage
        loading={pageLoading}
        name={user?.name}
        email={user?.email}
        phone={phone}
        phoneVerified={phoneVerified}
        avatarUrl={avatarUrl}
        avatarUploading={avatarUploading}
        address={defaultAddress}
        chatHandle={chatHandle}
        referralCode={referralCode}
        onUpdateName={handleUpdateName}
        onUpdateHandle={handleUpdateHandle}
        onManageAddresses={() => router.push('/account/address-book')}
        // No payment_methods table in the schema yet — the row renders
        // disabled instead of routing anywhere.
        paymentsComingSoon
        onSecuritySettings={() => router.push('/account/settings')}
        onNotificationSettings={() => router.push('/account/settings')}
        onChangeAvatar={handleChangeAvatar}
        onSignOut={logout}
      />
      {avatarError && (
        <p className="mx-auto max-w-3xl px-6 pb-4 text-center text-sm font-semibold text-red-600 lg:px-10">
          {avatarError}
        </p>
      )}
    </>
  )
}