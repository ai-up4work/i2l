'use client'

// app/account/my-following/page.tsx
//
// Stores the shopper follows (public.store_follows), newest first. Was a
// page of made-up stores; now real. Unfollowing keeps the card on the page
// (with a Follow button) until the page is left, so a mis-tap is easy to
// undo.

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ChevronRight, Store } from 'lucide-react'
import FollowButton from '@/components/stores/social/FollowButton'
import { useAffiliatedStores } from '@/hooks/useAffiliatedStores'
import { useFollowedStores } from '@/hooks/useFollowedStores'
import { imageThumb } from '@/lib/media'
import type { AffiliatedStore } from '@/data/stores/data'

function since(iso: string | undefined): string | null {
  if (!iso) return null
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString('en-LK', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function FollowingPage() {
  const { stores, loading: storesLoading } = useAffiliatedStores()
  const { followedAt, loading, available } = useFollowedStores()

  // The slugs shown: everything followed when the page opened, plus
  // anything followed since. Unfollowed stores stay until the page is left.
  const [shown, setShown] = useState<string[]>([])
  useEffect(() => {
    setShown((cur) => {
      const add = [...followedAt.keys()].filter((s) => !cur.includes(s))
      return add.length ? [...add, ...cur] : cur
    })
  }, [followedAt])

  const bySlug = useMemo(() => new Map(stores.map((s) => [s.platform, s])), [stores])
  const items = shown.map((slug) => ({ slug, store: bySlug.get(slug) ?? null }))
  const ready = !loading && !storesLoading

  return (
    <div className="mx-auto max-w-7xl px-6 pb-16 lg:px-10">
      <div className="mt-6 text-center">
        <h1 className="font-display text-3xl text-ink sm:text-4xl">Stores I follow</h1>
        {ready && followedAt.size > 0 && (
          <p className="mt-1.5 text-sm text-ink/55">
            {followedAt.size} {followedAt.size === 1 ? 'store' : 'stores'}. They show first in Stores for you and the store list.
          </p>
        )}
      </div>

      {!ready ? (
        <div className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-56 animate-pulse rounded-2xl bg-ink/5" />
          ))}
        </div>
      ) : !available ? (
        <p className="mt-14 text-center text-sm text-ink/55">Following stores isn&rsquo;t available right now.</p>
      ) : items.length === 0 ? (
        <div className="mt-14 flex flex-col items-center text-center">
          <Store size={32} className="text-ink/25" />
          <p className="mt-3 text-sm font-semibold text-ink">You&apos;re not following any stores yet</p>
          <p className="mt-1 max-w-sm text-sm text-ink/50">Tap Follow on a store&rsquo;s page and it&rsquo;ll show here, and first in your store lists.</p>
          <Link
            href="/stores"
            className="mt-5 rounded-full bg-teal px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-teal-deep"
          >
            Browse stores
          </Link>
        </div>
      ) : (
        <div className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map(({ slug, store }) => (
            <FollowedStoreCard key={slug} slug={slug} store={store} followedOn={since(followedAt.get(slug))} />
          ))}
        </div>
      )}
    </div>
  )
}

function FollowedStoreCard({ slug, store, followedOn }: { slug: string; store: AffiliatedStore | null; followedOn: string | null }) {
  if (!store) {
    // Followed, but the store is hidden or gone.
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-dashed border-ink/15 bg-card p-4">
        <div className="grid h-12 w-12 flex-none place-items-center rounded-full bg-ink/5">
          <Store className="h-5 w-5 text-ink/30" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-ink/60">{slug}</p>
          <p className="text-xs text-ink/45">This store isn&rsquo;t open right now.</p>
        </div>
        <FollowButton slug={slug} />
      </div>
    )
  }

  const local = store.storeType === 'local'
  const href = local || !store.url ? `/stores/${store.platform}` : store.url
  const external = !local && Boolean(store.url)

  return (
    <div className="overflow-hidden rounded-2xl border border-ink/10 bg-card">
      <a href={href} {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})} className="block">
        <div className="relative h-24 bg-indigo">
          {store.cover ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={imageThumb(store.cover, 800)} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="h-full w-full bg-[radial-gradient(120%_140%_at_0%_0%,var(--color-teal)_0%,var(--color-indigo)_60%,var(--color-indigo-deep)_100%)]" />
          )}
        </div>
      </a>
      <div className="flex items-end gap-3 px-4">
        <span className="-mt-7 grid h-14 w-14 flex-none place-items-center overflow-hidden rounded-full border-4 border-card bg-white">
          {store.logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={imageThumb(store.logo, 120)} alt="" className="h-full w-full object-cover" />
          ) : (
            <Store className="h-5 w-5 text-teal-deep" />
          )}
        </span>
        <div className="ml-auto pt-2">
          <FollowButton slug={store.platform} />
        </div>
      </div>
      <a href={href} {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})} className="group block px-4 pb-4 pt-2">
        <p className="flex items-center gap-1 truncate font-semibold text-ink group-hover:text-teal-deep">
          {store.name} <ChevronRight size={14} className="flex-none text-ink/35" />
        </p>
        {(store.tagline || store.description) && <p className="mt-0.5 line-clamp-2 text-xs text-ink/55">{store.tagline || store.description}</p>}
        {followedOn && <p className="mt-2 text-[11px] text-ink/45">Following since {followedOn}</p>}
      </a>
    </div>
  )
}
