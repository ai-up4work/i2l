'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Store, UserRoundPlus, UserRoundCheck } from 'lucide-react'

// ---------------------------------------------------------------------------
// Stub — swap for a real avatar/product <Image> once assets exist.
// ---------------------------------------------------------------------------

type FollowedStore = {
  id: string
  name: string
  followers: string
  newItems?: number
  previewCount: number
}

function StoreAvatar() {
  return (
    <div className="grid h-12 w-12 flex-none place-items-center rounded-full bg-gold/10">
      <Store className="h-5 w-5 text-teal-deep" />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Mock data — wire this up to your real followed-store list.
// ---------------------------------------------------------------------------

const initialStores: FollowedStore[] = [
  { id: '1', name: 'GRDR', followers: '128K followers', newItems: 6, previewCount: 4 },
  { id: '2', name: 'Manfinity KASUA', followers: '84K followers', newItems: 2, previewCount: 4 },
  { id: '3', name: 'Siren Gaze', followers: '41K followers', previewCount: 3 },
]

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function FollowingPage() {
  const router = useRouter()
  const [stores, setStores] = useState<FollowedStore[]>(initialStores)
  const [unfollowed, setUnfollowed] = useState<Set<string>>(new Set())

  const toggleFollow = (id: string) => {
    setUnfollowed((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div className="mx-auto max-w-7xl px-6 pb-16 lg:px-10">
      <div className="mt-6 text-center">
        <h1 className="font-display text-3xl text-ink sm:text-4xl">Following</h1>
        {stores.length > 0 && (
          <p className="mt-1.5 text-sm text-ink/55">
            {stores.length} {stores.length === 1 ? 'store' : 'stores'} you follow
          </p>
        )}
      </div>

      {stores.length === 0 ? (
        <div className="mt-14 flex flex-col items-center text-center">
          <Store size={32} className="text-ink/25" />
          <p className="mt-3 text-sm font-semibold text-ink">You&apos;re not following anyone yet</p>
          <p className="mt-1 max-w-sm text-sm text-ink/50">
            Follow stores to see their new arrivals here first.
          </p>
          <button
            type="button"
            onClick={() => router.push('/')}
            className="mt-5 rounded-none border border-ink px-10 py-3 text-sm font-bold tracking-wide text-ink transition-colors hover:bg-ink hover:text-white"
          >
            SHOP NOW
          </button>
        </div>
      ) : (
        <div className="mt-8 flex flex-col gap-3">
          {stores.map((store) => {
            const isFollowing = !unfollowed.has(store.id)
            return (
              <div
                key={store.id}
                className="flex flex-col gap-4 rounded-2xl border border-ink/10 bg-card p-4"
              >
                <div className="flex items-center gap-3">
                  <StoreAvatar />

                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-ink">{store.name}</p>
                    <p className="mt-0.5 text-xs text-ink/50">
                      {store.followers}
                      {!!store.newItems && (
                        <span className="ml-1.5 rounded-full bg-gold/15 px-1.5 py-0.5 text-[11px] font-semibold text-teal-deep">
                          {store.newItems} new
                        </span>
                      )}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => toggleFollow(store.id)}
                    className={`flex flex-none items-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-semibold transition-colors ${
                      isFollowing
                        ? 'border border-ink/15 text-ink/60 hover:border-ink/30 hover:text-ink'
                        : 'bg-ink text-white hover:opacity-90'
                    }`}
                  >
                    {isFollowing ? <UserRoundCheck size={15} /> : <UserRoundPlus size={15} />}
                    {isFollowing ? 'Following' : 'Follow'}
                  </button>
                </div>

                <div className="grid grid-cols-4 gap-2">
                  {Array.from({ length: store.previewCount }).map((_, index) => (
                    <div key={index} className="aspect-square rounded-lg bg-gold/10" />
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}