// app/account/profile/page.tsx
'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
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

export default function AccountProfilePage() {
  const router = useRouter()
  const { user, logout, loading } = useAuth()
  const { uploading, error: uploadError, upload } = useImageUpload()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [addressSummary, setAddressSummary] = useState<string | undefined>(undefined)
  const [saveError, setSaveError] = useState<string | null>(null)

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
        <div className="mx-auto mt-4 max-w-3xl px-6 lg:px-10">
          <p className="rounded-xl bg-red-50 px-4 py-2.5 text-sm font-medium text-red-700 ring-1 ring-inset ring-red-200">
            {saveError ?? uploadError}
          </p>
        </div>
      )}

      <ProfilePage
        name={user.name}
        email={user.email}
        phoneVerified={user.phoneVerified}
        avatarUrl={user.imageUrl}
        address={addressSummary}
        onUpdateName={handleUpdateName}
        onManageAddresses={() => router.push('/account/address-book')}
        onSecuritySettings={() => router.push('/account/settings')}
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
    </div>
  )
}