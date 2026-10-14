'use client'

// app/account/my-following/page.tsx
//
// Stores the shopper follows (public.store_follows), newest first, each
// with a peek at its latest products, then a few stores they might like.
// Unfollowing keeps the card on the page (with a Follow button) until the
// page is left, so a mis-tap is easy to undo.

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowRight, Check, Store } from 'lucide-react'
import FollowButton from '@/components/stores/social/FollowButton'
import ShopperPrice from '@/components/shared/ShopperPrice'
import { useAffiliatedStores } from '@/hooks/useAffiliatedStores'
import { useFollowedStores } from '@/hooks/useFollowedStores'
import { imageThumb } from '@/lib/media'
import { hasStoreModule } from '@/lib/store-modules'
import type { AffiliatedStore } from '@/data/stores/data'
import type { StoreProduct } from '@/lib/store.types'

function since(iso: string | undefined): string | null {
  if (!iso) return null
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString('en-LK', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function FollowingPage() {
  const { stores, loading: storesLoading } = useAffiliatedStores()
  const { followedAt, loading, available } = useFollowedStores()

  // Everything followed when the page opened, plus anything followed since.
  const [shown, setShown] = useState<string[]>([])
  useEffect(() => {
    setShown((cur) => {
      const add = [...followedAt.keys()].filter((s) => !cur.includes(s))
      return add.length ? [...add, ...cur] : cur
    })
  }, [followedAt])

  const bySlug = useMemo(() => new Map(stores.map((s) => [s.platform, s])), [stores])
  const items = shown.map((slug) => ({ slug, store: bySlug.get(slug) ?? null }))
  const suggestions = useMemo(
    () => stores.filter((s) => s.storeType === 'local' && !shown.includes(s.platform)).slice(0, 8),
    [stores, shown],
  )
  const ready = !loading && !storesLoading

  return (
    <div className="mx-auto w-full max-w-5xl px-4 pb-16 pt-4 sm:px-6 lg:px-10 lg:pt-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-body text-xs font-semibold uppercase tracking-[0.14em] text-teal-deep">My favourites</p>
          <h1 className="mt-1 font-display text-3xl text-ink sm:text-4xl">Stores I follow</h1>
          <p className="mt-1.5 max-w-xl text-sm text-ink/55">
            {ready && followedAt.size > 0
              ? `${followedAt.size} ${followedAt.size === 1 ? 'store' : 'stores'}. They come first in Stores for you and the store list.`
              : 'Follow stores you love and they’ll come first wherever you browse.'}
          </p>
        </div>
        <Link href="/stores" className="inline-flex items-center gap-1.5 rounded-full border border-ink/15 bg-card px-4 py-2 text-sm font-semibold text-ink transition-colors hover:border-teal/40 hover:text-teal-deep">
          Browse stores <ArrowRight size={14} />
        </Link>
      </header>

      <div className="mt-6 flex flex-col gap-3">
        {!ready ? (
          Array.from({ length: 2 }).map((_, i) => <div key={i} className="h-44 animate-pulse rounded-3xl bg-ink/5" />)
        ) : !available ? (
          <p className="rounded-3xl bg-card py-12 text-center text-sm text-ink/55 ring-1 ring-ink/10">Following stores isn&rsquo;t available right now.</p>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center rounded-3xl border border-dashed border-ink/15 bg-card px-6 py-12 text-center">
            <span className="grid h-14 w-14 place-items-center rounded-2xl bg-teal/10">
              <Store className="h-6 w-6 text-teal-deep" />
            </span>
            <p className="mt-4 font-display text-xl text-ink">No stores yet</p>
            <p className="mt-1 max-w-sm text-sm text-ink/55">Tap Follow on any store&rsquo;s page, or pick a few below.</p>
          </div>
        ) : (
          items.map(({ slug, store }) => <FollowedStoreRow key={slug} slug={slug} store={store} followedOn={since(followedAt.get(slug))} />)
        )}
      </div>

      {ready && available && suggestions.length > 0 && (
        <section className="mt-12">
          <h2 className="font-display text-xl text-ink">Stores you might like</h2>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {suggestions.map((s) => (
              <div key={s.platform} className="flex flex-col items-center gap-2 rounded-2xl bg-card p-4 text-center ring-1 ring-ink/10">
                <Link href={`/stores/${s.platform}`} className="flex min-w-0 flex-col items-center gap-2">
                  <StoreLogo store={s} size="h-14 w-14" />
                  <span className="w-full truncate text-sm font-semibold text-ink">{s.name}</span>
                </Link>
                <FollowButton slug={s.platform} />
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

function StoreLogo({ store, size }: { store: AffiliatedStore; size: string }) {
  return (
    <span className={`grid ${size} flex-none place-items-center overflow-hidden rounded-2xl bg-white ring-1 ring-ink/10`} style={store.bannerStyle}>
      {store.logo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={imageThumb(store.logo, 160)} alt="" className="h-full w-full object-cover" />
      ) : (
        <Store className="h-5 w-5 text-teal-deep" />
      )}
    </span>
  )
}

/** Up to 4 latest products of a store, for the card's peek strip. */
function useStorePeek(slug: string | null) {
  const [products, setProducts] = useState<StoreProduct[] | null>(null)
  useEffect(() => {
    if (!slug || hasStoreModule(slug)) {
      setProducts([])
      return
    }
    let cancelled = false
    fetch(`/api/stores/${encodeURIComponent(slug)}?per_page=4`)
      .then((r) => (r.ok ? r.json() : { products: [] }))
      .then((d: { products?: StoreProduct[] }) => !cancelled && setProducts((d.products ?? []).slice(0, 4)))
      .catch(() => !cancelled && setProducts([]))
    return () => {
      cancelled = true
    }
  }, [slug])
  return products
}

function FollowedStoreRow({ slug, store, followedOn }: { slug: string; store: AffiliatedStore | null; followedOn: string | null }) {
  const products = useStorePeek(store ? store.platform : null)

  if (!store) {
    // Followed, but the store is hidden or gone.
    return (
      <div className="flex items-center gap-4 rounded-3xl border border-dashed border-ink/15 bg-card p-4 sm:p-5">
        <span className="grid h-14 w-14 flex-none place-items-center rounded-2xl bg-ink/5">
          <Store className="h-5 w-5 text-ink/30" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-ink/60">{slug}</p>
          <p className="text-xs text-ink/45">This store isn&rsquo;t open right now.</p>
        </div>
        <FollowButton slug={slug} />
      </div>
    )
  }

  const href = `/stores/${store.platform}`
  const blurb = store.tagline || store.description

  return (
    <article className="overflow-hidden rounded-3xl bg-card ring-1 ring-ink/10 transition-shadow hover:shadow-[0_10px_30px_-12px_rgba(32,36,43,0.18)]">
      <div className="grid gap-4 p-4 sm:p-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] md:items-center md:gap-6">
        <div className="flex min-w-0 items-start gap-4">
          <Link href={href} className="relative">
            <StoreLogo store={store} size="h-16 w-16" />
            <span className="absolute -bottom-1 -right-1 grid h-6 w-6 place-items-center rounded-full bg-teal text-white ring-2 ring-card" aria-label="You follow this store">
              <Check size={12} strokeWidth={3} />
            </span>
          </Link>
          <div className="min-w-0 flex-1">
            <Link href={href} className="block truncate font-display text-xl text-ink hover:text-teal-deep">
              {store.name}
            </Link>
            {blurb && <p className="mt-0.5 line-clamp-2 text-sm text-ink/55">{blurb}</p>}
            {followedOn && <p className="mt-1 text-xs text-ink/40">Following since {followedOn}</p>}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Link href={href} className="inline-flex items-center gap-1.5 rounded-full bg-indigo px-4 py-2 text-xs font-bold text-parchment transition-colors hover:bg-indigo-deep">
                Visit store <ArrowRight size={13} />
              </Link>
              <FollowButton slug={store.platform} />
            </div>
          </div>
        </div>

        {/* Latest products */}
        {products === null ? (
          <div className="grid grid-cols-4 gap-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="aspect-[3/4] animate-pulse rounded-xl bg-ink/5" />
            ))}
          </div>
        ) : products.length > 0 ? (
          <div className="grid grid-cols-4 gap-2">
            {products.map((p) => (
              <Link key={p.id} href={`${href}/product/${p.handle}`} className="group min-w-0">
                <span className="block aspect-[3/4] overflow-hidden rounded-xl bg-parchment ring-1 ring-ink/5">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={imageThumb(p.image, 300)} alt={p.name} loading="lazy" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" />
                </span>
                <ShopperPrice
                  price={p.price}
                  currency={p.currency}
                  site={store.platform}
                  origin={(p as { origin?: 'IN' | 'LK' }).origin ?? null}
                  marginIncluded={(p as { marginIncluded?: boolean }).marginIncluded}
                  className="mt-1 block truncate text-[11px] font-semibold text-ink/70"
                />
              </Link>
            ))}
          </div>
        ) : (
          <Link
            href={href}
            className="hidden items-center justify-center rounded-2xl bg-parchment/70 px-4 py-6 text-sm font-semibold text-teal-deep ring-1 ring-ink/5 hover:bg-teal/5 md:flex"
          >
            See what&rsquo;s new at {store.name} <ArrowRight size={14} className="ml-1" />
          </Link>
        )}
      </div>
    </article>
  )
}
