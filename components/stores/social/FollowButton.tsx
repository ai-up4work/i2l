// components/stores/social/FollowButton.tsx
//
// "Follow" a store (public.store_follows). Signed-out shoppers are sent
// to log in and brought back. Reads/writes go through the browser client:
// the table's own rule only lets a user see and change their own follows.
'use client'

import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { Check, Plus } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/contexts/AuthContext'

export default function FollowButton({ slug, className = '', dark = false }: { slug: string; className?: string; dark?: boolean }) {
  const { user } = useAuth()
  const router = useRouter()
  const pathname = usePathname()
  const [following, setFollowing] = useState(false)
  const [busy, setBusy] = useState(false)
  // Hidden if the follows table isn't available, rather than showing a
  // button that can't work.
  const [unavailable, setUnavailable] = useState(false)
  const userId = user?.id

  useEffect(() => {
    if (!userId) {
      setFollowing(false)
      return
    }
    let cancelled = false
    createClient()
      .from('store_follows')
      .select('id')
      .eq('user_id', userId)
      .eq('platform_slug', slug)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) setUnavailable(true)
        else setFollowing(Boolean(data))
      })
    return () => {
      cancelled = true
    }
  }, [userId, slug])

  async function toggle() {
    if (!userId) {
      router.push(`/auth/login?redirect=${encodeURIComponent(pathname)}`)
      return
    }
    if (busy) return
    setBusy(true)
    const next = !following
    setFollowing(next)
    const supabase = createClient()
    const { error } = next
      ? await supabase.from('store_follows').upsert({ user_id: userId, platform_slug: slug }, { onConflict: 'user_id,platform_slug' })
      : await supabase.from('store_follows').delete().eq('user_id', userId).eq('platform_slug', slug)
    if (error) setFollowing(!next)
    setBusy(false)
  }

  if (unavailable) return null

  const base = 'inline-flex items-center justify-center gap-1.5 rounded-full px-4 py-2 text-xs font-bold transition-colors'
  const look = following
    ? dark
      ? 'border border-white/40 text-white'
      : 'border border-ink/20 text-ink/70'
    : 'bg-teal text-white hover:bg-teal-deep'

  return (
    <button type="button" onClick={toggle} aria-pressed={following} className={`${base} ${look} ${className}`}>
      {following ? <Check size={13} /> : <Plus size={13} />}
      {following ? 'Following' : 'Follow'}
    </button>
  )
}
