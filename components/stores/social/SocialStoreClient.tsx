// components/stores/social/SocialStoreClient.tsx
//
// Store page for custom (Instagram / Facebook) sellers — used instead of
// StoreCatalogClient when store.isSocial is true (see
// app/(public)/stores/[platform]/page.tsx). Feed stores (Shopify,
// WooCommerce…) and Wishdrop Mall keep the standard page.
//
// Layout, top to bottom:
//   cover photo → logo, name, tagline, social links, Follow / Share
//   → what-to-expect strip → reels row (product videos)
//   → sticky category chips + search + sort → photo-first product grid.
//
// Products come from the same /api/stores/[platform] endpoint as the
// standard page; videos from /api/stores/[platform]/reels.
'use client'

import { Suspense, useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { ArrowUpDown, ChevronRight, PackageSearch, Search, Share2, ShieldCheck, Truck, MessageCircle, X } from 'lucide-react'
import { FaFacebookF, FaInstagram } from 'react-icons/fa'
import type { AffiliatedStore } from '@/data/stores/data'
import type { StoreApiResponse, StoreProduct } from '@/lib/store.types'
import { imageThumb } from '@/lib/media'
import SocialProductCard, { SocialProductCardSkeleton } from './SocialProductCard'
import ReelsRow from './ReelsRow'
import FollowButton from './FollowButton'
import { useHeaderOffset } from './useHeaderOffset'

type SortKey = 'newest' | 'price-asc' | 'price-desc' | 'sale'
const SORTS: { key: SortKey; label: string }[] = [
  { key: 'newest', label: 'Newest' },
  { key: 'price-asc', label: 'Price: low to high' },
  { key: 'price-desc', label: 'Price: high to low' },
  { key: 'sale', label: 'On sale' },
]
const PER_PAGE = 24

type Category = { handle: string; title: string }
type ShopCollection = { slug: string; name: string; description: string | null; image: string | null; count: number }

function isSortKey(v: string | null): v is SortKey {
  return SORTS.some((s) => s.key === v)
}

function Inner({ store }: { store: AffiliatedStore }) {
  const platform = store.platform
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const headerOffset = useHeaderOffset()

  const [category, setCategory] = useState(searchParams.get('category') ?? '')
  const [collection, setCollection] = useState(searchParams.get('collection') ?? '')
  const [sortBy, setSortBy] = useState<SortKey>(isSortKey(searchParams.get('sort')) ? (searchParams.get('sort') as SortKey) : 'newest')
  const [search, setSearch] = useState(searchParams.get('q') ?? '')
  const [searchInput, setSearchInput] = useState(searchParams.get('q') ?? '')
  const [searchOpen, setSearchOpen] = useState(Boolean(searchParams.get('q')))
  const [sortOpen, setSortOpen] = useState(false)

  const [products, setProducts] = useState<StoreProduct[]>([])
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [total, setTotal] = useState<number | null>(null)
  const [storeTotal, setStoreTotal] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [categories, setCategories] = useState<Category[]>([])
  const [reels, setReels] = useState<StoreProduct[]>([])
  const [collections, setCollections] = useState<ShopCollection[]>([])
  const requestId = useRef(0)
  const gridRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/stores/${platform}?collections=1`)
      .then((r) => (r.ok ? r.json() : { collections: [] }))
      .then((d: { collections?: Category[] }) => !cancelled && setCategories(d.collections ?? []))
      .catch(() => {})
    fetch(`/api/stores/${platform}/store-collections`)
      .then((r) => (r.ok ? r.json() : { collections: [] }))
      .then((d: { collections?: ShopCollection[] }) => !cancelled && setCollections(d.collections ?? []))
      .catch(() => {})
    fetch(`/api/stores/${platform}/reels`)
      .then((r) => (r.ok ? r.json() : { products: [] }))
      .then((d: { products?: StoreProduct[] }) => !cancelled && setReels(d.products ?? []))
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [platform])

  // Keep the filters in the URL so a refresh or a shared link shows the same view.
  useEffect(() => {
    const qs = new URLSearchParams()
    if (collection) qs.set('collection', collection)
    if (category) qs.set('category', category)
    if (search) qs.set('q', search)
    if (sortBy !== 'newest') qs.set('sort', sortBy)
    const query = qs.toString()
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collection, category, search, sortBy, pathname])

  const load = useCallback(
    async (pg: number, append: boolean) => {
      const id = ++requestId.current
      if (append) setLoadingMore(true)
      else setLoading(true)
      setError(null)
      try {
        const qs = new URLSearchParams({ page: String(pg), per_page: String(PER_PAGE), sort: sortBy })
        if (collection) qs.set('collection', collection)
        if (category) qs.set('category', category)
        if (search) qs.set('search', search)
        const res = await fetch(`/api/stores/${platform}?${qs.toString()}`)
        const data = (await res.json().catch(() => ({}))) as StoreApiResponse & { error?: string }
        if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`)
        if (requestId.current !== id) return
        setProducts((prev) => (append ? [...prev, ...data.products.filter((p) => !prev.some((x) => x.id === p.id))] : data.products))
        setPage(pg)
        setTotalPages(data.totalPages)
        setTotal(data.total)
        if (!category && !search && !collection) setStoreTotal(data.total)
      } catch (e) {
        if (requestId.current === id) setError((e as Error).message)
      } finally {
        if (requestId.current === id) {
          setLoading(false)
          setLoadingMore(false)
        }
      }
    },
    [platform, collection, category, search, sortBy],
  )

  useEffect(() => {
    void load(1, false)
  }, [load])

  function scrollToGrid() {
    const el = gridRef.current
    if (el && el.getBoundingClientRect().top < headerOffset + 40) return
    if (el) window.scrollTo({ top: window.scrollY + el.getBoundingClientRect().top - headerOffset - 64, behavior: 'smooth' })
  }

  function pickCollection(slug: string) {
    setCollection(slug)
    setCategory('')
    scrollToGrid()
  }

  function pickCategory(value: string) {
    setCategory(value)
    setCollection('')
    // Bring the grid back to the top of the screen when it's scrolled past.
    const el = gridRef.current
    if (el && el.getBoundingClientRect().top < headerOffset) {
      window.scrollTo({ top: window.scrollY + el.getBoundingClientRect().top - headerOffset - 64, behavior: 'smooth' })
    }
  }

  function share() {
    if (navigator.share) navigator.share({ title: store.name, url: window.location.href }).catch(() => {})
    else navigator.clipboard?.writeText(window.location.href).catch(() => {})
  }

  const about = store.description?.trim()
  const chips: Category[] = [{ handle: '', title: 'All' }, ...categories]

  return (
    <div className="min-h-screen bg-parchment">
      {/* ── Cover ── */}
      <div className="relative h-36 w-full overflow-hidden bg-indigo sm:h-56 lg:h-64">
        {store.cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageThumb(store.cover, 1600)} alt="" className="h-full w-full object-cover" />
        ) : (
          // No cover yet: a calm brand-coloured band rather than an empty box.
          <div className="h-full w-full bg-[radial-gradient(120%_140%_at_0%_0%,var(--color-teal)_0%,var(--color-indigo)_55%,var(--color-indigo-deep)_100%)]" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/35 to-transparent" />
        <nav className="absolute left-4 top-3 flex items-center gap-1.5 font-body text-[11px] font-medium text-white/85 sm:left-10">
          <Link href="/stores" className="hover:text-white">
            Stores
          </Link>
          <ChevronRight size={10} />
          <span className="truncate">{store.name}</span>
        </nav>
      </div>

      <div className="mx-auto w-full max-w-6xl px-4 sm:px-10">
        {/* ── Identity ── */}
        <div className="relative -mt-7 flex flex-col gap-4 sm:-mt-9 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex min-w-0 items-end gap-4">
            <span className="grid h-20 w-20 flex-none place-items-center overflow-hidden rounded-full border-4 border-parchment bg-card shadow-sm sm:h-24 sm:w-24">
              {store.logo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={imageThumb(store.logo, 240)} alt={`${store.name} logo`} className="h-full w-full object-cover" />
              ) : (
                <span className="font-display text-3xl font-bold text-teal-deep">{store.name.charAt(0).toUpperCase()}</span>
              )}
            </span>
            <div className="min-w-0 pb-1">
              <h1 className="truncate font-display text-2xl font-bold tracking-tight text-ink sm:text-3xl">{store.name}</h1>
              <p className="mt-0.5 font-body text-xs text-ink/55">
                {storeTotal != null && (
                  <>
                    <span className="font-semibold text-ink">{storeTotal}</span> item{storeTotal === 1 ? '' : 's'}
                  </>
                )}
                {storeTotal != null && reels.length > 0 && ' · '}
                {reels.length > 0 && (
                  <>
                    <span className="font-semibold text-ink">{reels.length}</span> video{reels.length === 1 ? '' : 's'}
                  </>
                )}
                {store.country && (
                  <>
                    {(storeTotal != null || reels.length > 0) && ' · '}
                    {store.country}
                  </>
                )}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:pb-1">
            <FollowButton slug={platform} className="flex-1 sm:flex-none" />
            {store.instagram && (
              <a
                href={store.instagram}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`${store.name} on Instagram`}
                className="grid h-9 w-9 place-items-center rounded-full border border-ink/15 bg-card text-ink/70 hover:text-ink"
              >
                <FaInstagram size={15} />
              </a>
            )}
            {store.facebook && (
              <a
                href={store.facebook}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`${store.name} on Facebook`}
                className="grid h-9 w-9 place-items-center rounded-full border border-ink/15 bg-card text-ink/70 hover:text-ink"
              >
                <FaFacebookF size={14} />
              </a>
            )}
            <button
              type="button"
              onClick={share}
              aria-label="Share this store"
              className="grid h-9 w-9 place-items-center rounded-full border border-ink/15 bg-card text-ink/70 hover:text-ink"
            >
              <Share2 size={14} />
            </button>
          </div>
        </div>

        {(store.tagline || about) && (
          <div className="mt-4 max-w-2xl">
            {store.tagline && <p className="font-body text-sm font-semibold text-ink">{store.tagline}</p>}
            {about && <p className="mt-1 line-clamp-3 font-body text-sm leading-relaxed text-ink/60">{about}</p>}
          </div>
        )}

        {/* ── What to expect ── */}
        <ul className="mt-5 flex flex-wrap gap-x-5 gap-y-2 border-y border-ink/10 py-3 font-body text-xs text-ink/65">
          <li className="flex items-center gap-1.5">
            <Truck size={14} className="text-teal-deep" /> Delivered to your door in Sri Lanka
          </li>
          <li className="flex items-center gap-1.5">
            <ShieldCheck size={14} className="text-teal-deep" /> We check every item before it ships
          </li>
          <li className="flex items-center gap-1.5">
            <MessageCircle size={14} className="text-teal-deep" /> One place for questions and tracking
          </li>
        </ul>

        {/* ── Shop by collection ── */}
        {collections.length > 0 && (
          <section className="mt-7" aria-label="Shop by collection">
            <h2 className="mb-3 font-display text-xl font-bold text-ink">Shop by collection</h2>
            <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden">
              {collections.map((c) => {
                const on = collection === c.slug
                return (
                  <button
                    key={c.slug}
                    type="button"
                    onClick={() => pickCollection(on ? '' : c.slug)}
                    aria-pressed={on}
                    className="group w-[36vw] max-w-[180px] flex-none snap-start text-left sm:w-40"
                  >
                    <span className={`relative block aspect-[4/5] overflow-hidden rounded-2xl bg-ink/5 ring-2 ${on ? 'ring-ink' : 'ring-transparent'}`}>
                      {c.image && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={imageThumb(c.image, 400)} alt="" loading="lazy" className="h-full w-full object-cover object-top transition-transform duration-700 group-hover:scale-105" />
                      )}
                      <span className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/0 to-transparent" />
                      <span className="absolute inset-x-2.5 bottom-2.5 text-white">
                        <span className="line-clamp-2 block font-body text-sm font-bold leading-snug">{c.name}</span>
                        <span className="block font-body text-[11px] text-white/80">{c.count} item{c.count === 1 ? '' : 's'}</span>
                      </span>
                    </span>
                  </button>
                )
              })}
            </div>
          </section>
        )}

        {/* ── Reels ── */}
        {reels.length > 0 && (
          <div className="mt-7">
            <ReelsRow products={reels} platform={platform} />
          </div>
        )}
      </div>

      {/* ── Sticky filters ── */}
      <div
        className="sticky z-20 mt-7 border-b border-ink/10 bg-parchment/95 backdrop-blur-md"
        style={{ top: headerOffset }}
      >
        <div className="mx-auto flex w-full max-w-6xl items-center gap-2 px-4 py-2.5 sm:px-10">
          <div className="flex min-w-0 flex-1 gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {chips.slice(0, 1).map((c) => {
              const value = c.handle || (c.title === 'All' ? '' : c.title)
              const on = value === '' ? category === '' && collection === '' : category === value
              return (
                <button
                  key={value || 'all'}
                  type="button"
                  onClick={() => pickCategory(value)}
                  aria-pressed={on}
                  className={`flex-none whitespace-nowrap rounded-full border px-3.5 py-1.5 font-body text-xs font-semibold transition-colors ${
                    on ? 'border-ink bg-ink text-white' : 'border-ink/15 bg-card text-ink/65 hover:text-ink'
                  }`}
                >
                  {c.title}
                </button>
              )
            })}
            {collections.map((c) => {
              const on = collection === c.slug
              return (
                <button
                  key={`col-${c.slug}`}
                  type="button"
                  onClick={() => pickCollection(on ? '' : c.slug)}
                  aria-pressed={on}
                  className={`flex-none whitespace-nowrap rounded-full border px-3.5 py-1.5 font-body text-xs font-semibold transition-colors ${
                    on ? 'border-teal-deep bg-teal-deep text-white' : 'border-teal/30 bg-teal/[0.06] text-teal-deep hover:border-teal'
                  }`}
                >
                  {c.name}
                </button>
              )
            })}
            {collections.length > 0 && chips.length > 1 && <span className="mx-0.5 w-px flex-none self-stretch bg-ink/15" aria-hidden="true" />}
            {chips.slice(1).map((c) => {
              const value = c.handle || (c.title === 'All' ? '' : c.title)
              const on = value === '' ? category === '' && collection === '' : category === value
              return (
                <button
                  key={value || 'all'}
                  type="button"
                  onClick={() => pickCategory(value)}
                  aria-pressed={on}
                  className={`flex-none whitespace-nowrap rounded-full border px-3.5 py-1.5 font-body text-xs font-semibold transition-colors ${
                    on ? 'border-ink bg-ink text-white' : 'border-ink/15 bg-card text-ink/65 hover:text-ink'
                  }`}
                >
                  {c.title}
                </button>
              )
            })}
          </div>

          <button
            type="button"
            onClick={() => setSearchOpen((v) => !v)}
            aria-label="Search this store"
            aria-expanded={searchOpen}
            className={`grid h-8 w-8 flex-none place-items-center rounded-full border ${
              searchOpen || search ? 'border-ink bg-ink text-white' : 'border-ink/15 bg-card text-ink/65'
            }`}
          >
            <Search size={14} />
          </button>

          <div className="relative flex-none">
            <button
              type="button"
              onClick={() => setSortOpen((v) => !v)}
              aria-label="Sort products"
              aria-expanded={sortOpen}
              className="flex h-8 items-center gap-1.5 rounded-full border border-ink/15 bg-card px-3 font-body text-xs font-semibold text-ink/65"
            >
              <ArrowUpDown size={13} />
              <span className="hidden sm:inline">{SORTS.find((s) => s.key === sortBy)?.label}</span>
            </button>
            {sortOpen && (
              <div className="absolute right-0 top-full z-30 mt-1.5 min-w-[180px] rounded-xl border border-ink/10 bg-card py-1 shadow-xl">
                {SORTS.map((s) => (
                  <button
                    key={s.key}
                    type="button"
                    onClick={() => {
                      setSortBy(s.key)
                      setSortOpen(false)
                    }}
                    className={`block w-full px-4 py-2.5 text-left font-body text-xs hover:bg-teal/10 ${
                      sortBy === s.key ? 'font-bold text-ink' : 'text-ink/60'
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {searchOpen && (
          <form
            className="mx-auto flex w-full max-w-6xl items-center gap-2 px-4 pb-2.5 sm:px-10"
            onSubmit={(e) => {
              e.preventDefault()
              setSearch(searchInput.trim())
            }}
          >
            <div className="relative flex-1">
              <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink/40" />
              <input
                autoFocus
                type="search"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder={`Search ${store.name}`}
                className="w-full rounded-full border border-ink/15 bg-card py-2 pl-9 pr-3 font-body text-sm outline-none focus:border-teal"
              />
            </div>
            <button type="submit" className="rounded-full bg-ink px-4 py-2 font-body text-xs font-bold text-white">
              Search
            </button>
            {search && (
              <button
                type="button"
                onClick={() => {
                  setSearch('')
                  setSearchInput('')
                }}
                aria-label="Clear search"
                className="grid h-8 w-8 place-items-center rounded-full text-ink/50 hover:text-ink"
              >
                <X size={15} />
              </button>
            )}
          </form>
        )}
      </div>

      {/* ── Grid ── */}
      <div ref={gridRef} className="mx-auto w-full max-w-6xl px-4 pb-16 pt-5 sm:px-10">
        {!loading && !error && total != null && (
          <p className="mb-3 font-body text-xs text-ink/50">
            {total} item{total === 1 ? '' : 's'}
            {collection && <> in {collections.find((c) => c.slug === collection)?.name ?? 'this collection'}</>}
            {search && (
              <>
                {' '}
                for &ldquo;{search}&rdquo;
              </>
            )}
          </p>
        )}

        {error ? (
          <div className="rounded-2xl border border-gold/40 bg-gold/10 p-5 text-center">
            <p className="font-body text-sm font-semibold text-ink">Could not load products</p>
            <button type="button" onClick={() => load(1, false)} className="mt-2 font-body text-xs font-semibold text-ink underline">
              Try again
            </button>
          </div>
        ) : loading ? (
          <div className="grid grid-cols-2 gap-x-3 gap-y-6 sm:grid-cols-3 sm:gap-x-4 lg:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <SocialProductCardSkeleton key={i} />
            ))}
          </div>
        ) : products.length === 0 ? (
          <div className="py-20 text-center text-ink/50">
            <PackageSearch size={40} className="mx-auto mb-4 text-ink/20" />
            <p className="font-body text-sm">{category || search || collection ? 'Nothing matches that.' : 'This store has no products yet.'}</p>
            {(category || search || collection) && (
              <button
                type="button"
                onClick={() => {
                  setCategory('')
                  setCollection('')
                  setSearch('')
                  setSearchInput('')
                }}
                className="mt-3 font-body text-xs font-semibold text-ink underline"
              >
                Show everything
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-x-3 gap-y-6 sm:grid-cols-3 sm:gap-x-4 lg:grid-cols-4">
              {products.map((p) => (
                <SocialProductCard key={p.id} product={p} platform={platform} />
              ))}
            </div>
            {page < totalPages && (
              <div className="mt-10 text-center">
                <button
                  type="button"
                  onClick={() => load(page + 1, true)}
                  disabled={loadingMore}
                  className="rounded-full border border-ink/20 bg-card px-8 py-3 font-body text-sm font-semibold text-ink hover:border-ink disabled:opacity-60"
                >
                  {loadingMore ? 'Loading…' : 'Show more'}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// useSearchParams() needs a <Suspense> boundary in the App Router.
export default function SocialStoreClient({ store }: { store: AffiliatedStore }) {
  return (
    <Suspense fallback={<div className="min-h-screen bg-parchment" />}>
      <Inner store={store} />
    </Suspense>
  )
}
