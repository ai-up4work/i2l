'use client'

// The /categories page body: two rows of category tiles (the same list as
// the header's Shop menu) and the stores in the chosen category.
// Filtering happens right here in the browser; the URL is kept in sync
// (?category=<slug>) so a filtered view can be shared or bookmarked.

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowUpRight, LayoutGrid, Store } from 'lucide-react'
import type { AffiliatedStore } from '@/data/stores/data'
import CategoryImage from '@/components/shared/CategoryImage'
import { STORE_CATEGORIES, findStoreCategory, storeHasCategory, type StoreCategory } from '@/lib/store-categories'

function storeHref(store: AffiliatedStore): { href: string; external: boolean } {
  const external = store.storeType !== 'local' && Boolean(store.url)
  return { href: external ? store.url! : `/stores/${store.platform}`, external }
}

function StoreCard({ store }: { store: AffiliatedStore }) {
  const { href, external } = storeHref(store)
  const categories = (store.categories ?? [])
    .map((c) => findStoreCategory(c)?.name)
    .filter((c): c is string => !!c)
  const about = store.tagline || store.description

  const body = (
    <>
      <span
        className="relative flex h-14 w-14 flex-none items-center justify-center overflow-hidden rounded-xl border border-ink/10 bg-card"
        style={store.storeType === 'local' ? store.bannerStyle : undefined}
      >
        {store.logo ? (
          // eslint-disable-next-line @next/next/no-img-element -- small fixed tile
          <img src={store.logo} alt="" className="h-full w-full object-cover" />
        ) : (
          <Store size={20} className="text-ink/30" aria-hidden />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate font-display text-base font-semibold text-indigo">{store.name}</span>
          {store.isNew && (
            <span className="flex-none rounded-full bg-gold/15 px-2 py-0.5 font-body text-[10px] font-bold uppercase tracking-wider text-gold-deep">
              New
            </span>
          )}
        </span>
        {about && <span className="mt-0.5 block truncate font-body text-xs text-ink/55">{about}</span>}
        {categories.length > 0 && (
          <span className="mt-2 flex flex-wrap gap-1">
            {categories.map((c) => (
              <span key={c} className="rounded-full bg-teal/[0.08] px-2 py-0.5 font-body text-[10.5px] font-medium text-teal-deep">
                {c}
              </span>
            ))}
          </span>
        )}
      </span>
      <ArrowUpRight size={16} className="mt-1 flex-none text-ink/20 transition-colors group-hover:text-teal-deep" aria-hidden />
    </>
  )

  const className =
    'group flex items-start gap-3.5 rounded-2xl bg-card p-3.5 ring-1 ring-ink/[0.08] transition-all hover:-translate-y-0.5 hover:ring-teal/30 hover:shadow-[0_18px_40px_-24px_rgba(8,39,79,0.35)]'

  return external ? (
    <a href={href} target="_blank" rel="noopener noreferrer" className={className}>
      {body}
    </a>
  ) : (
    <Link href={href} className={className}>
      {body}
    </Link>
  )
}

function CategoryTile({
  category,
  count,
  active,
  onSelect,
}: {
  category: StoreCategory
  count: number
  active: boolean
  onSelect: () => void
}) {
  // No stores yet: greyed out and not clickable (unless it's the one already
  // open from a link, so it can still be cleared).
  const empty = count === 0 && !active
  return (
    <button
      type="button"
      aria-pressed={active}
      disabled={empty}
      title={empty ? 'No stores in this category yet' : undefined}
      onClick={onSelect}
      className={`group flex items-center gap-3 rounded-2xl p-3 text-left ring-1 transition-all sm:p-3.5 ${
        active
          ? 'bg-indigo text-parchment ring-indigo'
          : empty
          ? 'cursor-not-allowed bg-card text-indigo opacity-50 grayscale ring-ink/[0.08]'
          : 'bg-card text-indigo ring-ink/[0.08] hover:-translate-y-0.5 hover:ring-teal/30'
      }`}
    >
      <span className={`relative h-12 w-12 flex-none overflow-hidden rounded-xl ${active ? 'ring-2 ring-gold' : ''}`}>
        <CategoryImage category={category} className="absolute inset-0 h-full w-full" iconClassName="h-[18px] w-[18px]" />
      </span>
      <span className="min-w-0">
        <span className="block font-body text-sm font-semibold leading-tight">{category.name}</span>
        <span className={`block font-body text-xs ${active ? 'text-parchment/65' : 'text-ink/45'}`}>
          {count === 0 ? 'Coming soon' : `${count} store${count === 1 ? '' : 's'}`}
        </span>
      </span>
    </button>
  )
}

export default function CategoryStoresClient({
  stores,
  initialCategory,
}: {
  stores: AffiliatedStore[]
  initialCategory: string | null
}) {
  const [selected, setSelected] = useState<string | null>(initialCategory)
  const category = findStoreCategory(selected)

  const counts = useMemo(() => {
    const out = new Map<string, number>()
    for (const c of STORE_CATEGORIES) out.set(c.slug, stores.filter((s) => storeHasCategory(s.categories, c)).length)
    return out
  }, [stores])

  const shown = useMemo(() => {
    const list = category ? stores.filter((s) => storeHasCategory(s.categories, category)) : stores
    return [...list].sort((a, b) => a.name.localeCompare(b.name))
  }, [stores, category])

  function choose(slug: string | null) {
    const next = slug === selected ? null : slug
    setSelected(next)
    try {
      const url = new URL(window.location.href)
      if (next) url.searchParams.set('category', next)
      else url.searchParams.delete('category')
      window.history.replaceState(window.history.state, '', url)
    } catch {
      // URL sync is a nicety only
    }
  }

  return (
    <div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {/* Only categories with at least one store — plus the selected one,
            so a direct link to an empty category (?category=…) still shows
            what's selected rather than nothing. */}
        {STORE_CATEGORIES.filter((c) => (counts.get(c.slug) ?? 0) > 0 || c.slug === category?.slug).map((c) => (
          <CategoryTile
            key={c.slug}
            category={c}
            count={counts.get(c.slug) ?? 0}
            active={c.slug === category?.slug}
            onSelect={() => choose(c.slug)}
          />
        ))}
      </div>

      <div className="mt-10 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-body text-[11px] font-semibold uppercase tracking-[0.2em] text-teal-deep">
            {category ? category.name : 'Every category'}
          </p>
          <h2 className="mt-1 font-display text-2xl font-semibold text-indigo">
            {shown.length} store{shown.length === 1 ? '' : 's'}
          </h2>
          {category && <p className="mt-1 font-body text-sm text-ink/55">{category.blurb}</p>}
        </div>
        {category && (
          <button
            type="button"
            onClick={() => choose(null)}
            className="inline-flex items-center gap-1.5 rounded-full bg-card px-3.5 py-2 font-body text-xs font-semibold text-ink/65 ring-1 ring-ink/[0.08] hover:text-ink"
          >
            <LayoutGrid size={13} aria-hidden /> Show all stores
          </button>
        )}
      </div>

      {shown.length > 0 ? (
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((s) => (
            <StoreCard key={s.platform} store={s} />
          ))}
        </div>
      ) : (
        <div className="mt-5 rounded-3xl bg-card px-6 py-12 text-center ring-1 ring-ink/[0.08]">
          <p className="font-display text-lg font-semibold text-indigo">No stores in {category?.name ?? 'this category'} yet</p>
          <p className="mx-auto mt-1 max-w-md font-body text-sm text-ink/55">
            We’re adding stores all the time. Meanwhile, paste a link to anything you want and we’ll get it for you.
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <Link href="/account" className="rounded-full bg-indigo px-5 py-2.5 font-body text-sm font-semibold text-parchment">
              Paste a link
            </Link>
            <button
              type="button"
              onClick={() => choose(null)}
              className="rounded-full bg-parchment px-5 py-2.5 font-body text-sm font-semibold text-ink ring-1 ring-ink/10"
            >
              See all stores
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
