// app/stores/page.tsx
'use client';

import { hasStoreModule } from '@/lib/store-modules';
import { useFollowedStores } from '@/hooks/useFollowedStores';
import { useState, useRef, useEffect, useMemo, type ReactNode } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowUpRight, Check, ChevronLeft, ChevronRight, Heart, Plus, Search, Sparkles, X } from 'lucide-react';
import {
  ALPHABET,
  marketplaceStores,
  type Store,
  type AffiliatedStore,
} from '@/data/stores/data';
import { PageHero } from '@/components/public/PageKit';
import { createClient } from '@/lib/supabase/client';
import SocialStoreTiles from '@/components/stores/social/SocialStoreTiles';
import { useSequentialLiveProductCounts, type LiveCountEntry } from '@/hooks/useSequentialLiveProductCounts';

// Same provider types the admin sellers page keys off of
// (provider_config.type on the `sellers` row). 'mock' stores have no real
// feed to check, so they just show their cached count.
type ProviderType = 'shopify' | 'woocommerce' | 'jsonapi' | 'html-scrape' | 'mock';

// Local extension of the legacy `Store` shape — carries the provider type
// through from the sellers row so this page can decide which stores are
// worth live-checking, same as /admin/sellers does. Not added to the
// shared `Store` type in data/stores/data.ts since that type is the
// back-compat shape other (non-admin) call sites also read.
type StoreWithProvider = Store & { providerType: ProviderType };

// Maps a raw `sellers` table row into the legacy `Store` shape this page
// already renders against (slug/category singular/type instead of
// platform/categories[]/buildType — see data/stores/data.ts's own comment
// on why ALL_STORES existed as a derived, back-compat view). Only
// store_kind='local' rows reach this page at all (filtered in the query).
//
// KNOWN GAP: `type` (custom vs template — drives this page's "Custom
// builds"/"Templates" filter pills) isn't stored as its own column yet.
// scripts/seed-sellers.mjs didn't carry the old buildType field through
// into provider_config.display, so every seeded row defaults to
// 'template' here. Add a real `build_type` column (or fold it into
// provider_config.display like the other merchandising fields) if that
// filter needs to be accurate rather than defaulted.
function mapRowToStore(row: Record<string, unknown>): StoreWithProvider {
  const providerConfig = (row.provider_config ?? {}) as Record<string, unknown>;
  const display = (providerConfig.display ?? {}) as Record<string, unknown>;
  const categories = (row.categories as string[]) ?? [];

  return {
    slug: row.platform_slug as string,
    name: row.name as string,
    type: (display.buildType as Store['type']) ?? 'template',
    isNew: display.isNew as boolean | undefined,
    logo: (row.logo_url as string) ?? '',
    bannerStyle: (display.bannerStyle as Store['bannerStyle']) ?? {},
    category: categories[0] ?? '',
    description: (row.description as string) ?? '',
    shipping: (display.shipping as string) ?? '',
    payment: (display.payment as string) ?? '',
    tags: (display.tags as string[]) ?? [],
    itemCount: (display.itemCount as number) ?? 0,
    providerType: (providerConfig.type as ProviderType) ?? 'mock',
  };
}

// ─── Shared bits ─────────────────────────────────────────────────────────────

/** Section heading used by every block on this page (matches PageKit's Section). */
function SectionHead({
  eyebrow,
  title,
  intro,
  right,
}: {
  eyebrow: string;
  title: string;
  intro?: string;
  right?: ReactNode;
}) {
  return (
    <div className="mb-5 flex items-end justify-between gap-4 sm:mb-7">
      <div className="min-w-0 max-w-2xl">
        <p className="font-body text-[11px] font-semibold uppercase tracking-[0.2em] text-teal-deep">{eyebrow}</p>
        <h2 className="mt-1.5 font-display text-2xl font-semibold leading-tight tracking-[-0.01em] text-indigo sm:text-[2rem]">
          {title}
        </h2>
        {intro && <p className="mt-2 font-body text-sm leading-relaxed text-ink/60 sm:text-[15px]">{intro}</p>}
      </div>
      {right && <div className="flex shrink-0 items-center gap-2">{right}</div>}
    </div>
  );
}

// ─── Skeletons ────────────────────────────────────────────────────────────────

function StoreCardSkeleton() {
  return (
    <div className="flex items-center gap-4 rounded-2xl p-3">
      <div className="h-14 w-14 shrink-0 animate-pulse rounded-2xl bg-ink/10" />
      <div className="flex-1 space-y-2">
        <div className="h-3.5 w-36 animate-pulse rounded bg-ink/10" />
        <div className="h-3 w-24 animate-pulse rounded bg-ink/10" />
      </div>
    </div>
  );
}

// Only covers the "All stores" block — the marketplaces carousel is
// static data and renders immediately.
function AllStoresSkeleton() {
  return (
    <section className="pb-16">
      <div className="mb-7 space-y-2">
        <div className="h-3 w-28 animate-pulse rounded bg-ink/10" />
        <div className="h-8 w-48 animate-pulse rounded-lg bg-ink/10" />
      </div>
      <div className="rounded-[28px] bg-card p-4 ring-1 ring-ink/[0.08] sm:p-6">
        <div className="h-11 w-full animate-pulse rounded-full bg-ink/[0.06] sm:w-80" />
        <div className="mt-5 h-8 w-full animate-pulse rounded-full bg-ink/[0.05]" />
        <div className="mt-6 grid gap-2 sm:grid-cols-2">
          {Array.from({ length: 6 }).map((_, i) => <StoreCardSkeleton key={i} />)}
        </div>
      </div>
    </section>
  );
}

// ─── Marketplaces Carousel ──────────────────────────────────────────────────
// affiliatedStores' storeType: 'marketplace' entries (Amazon, Flipkart, …).
// Static data, so this doesn't wait for the sellers fetch.

function MarketplacesCarousel({ stores }: { stores: AffiliatedStore[] }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(false);

  const measure = () => {
    const t = trackRef.current;
    if (!t) return;
    setAtStart(t.scrollLeft <= 4);
    setAtEnd(t.scrollLeft + t.clientWidth >= t.scrollWidth - 4);
  };
  useEffect(measure, []);

  const scroll = (dir: 'prev' | 'next') => {
    const t = trackRef.current;
    if (!t) return;
    t.scrollBy({ left: (dir === 'next' ? 1 : -1) * Math.max(160, t.clientWidth * 0.8), behavior: 'smooth' });
  };

  if (!stores.length) return null;

  const arrow =
    'grid h-9 w-9 place-items-center rounded-full bg-card text-ink ring-1 ring-ink/10 transition-colors hover:bg-teal/10 hover:ring-teal/30 disabled:cursor-not-allowed disabled:opacity-30';

  return (
    <section className="pb-12 sm:pb-16">
      <SectionHead
        eyebrow="Marketplaces"
        title="The big Indian marketplaces"
        intro="Paste a link from any of these and we’ll price it in rupees."
        right={
          <div className="hidden gap-2 sm:flex">
            <button type="button" aria-label="Scroll back" onClick={() => scroll('prev')} disabled={atStart} className={arrow}>
              <ChevronLeft size={17} />
            </button>
            <button type="button" aria-label="Scroll forward" onClick={() => scroll('next')} disabled={atEnd} className={arrow}>
              <ChevronRight size={17} />
            </button>
          </div>
        }
      />

      <div
        ref={trackRef}
        onScroll={measure}
        className="-mx-6 flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-px-6 px-6 pb-2 [scrollbar-width:none] sm:gap-4 lg:-mx-10 lg:scroll-px-10 lg:px-10 [&::-webkit-scrollbar]:hidden"
      >
        {stores.map((store) => (
          <Link
            key={store.platform}
            href={store.url ?? `/stores/${store.platform}`}
            target={store.url ? '_blank' : undefined}
            rel={store.url ? 'noopener noreferrer' : undefined}
            className="group flex w-[30vw] max-w-[150px] shrink-0 snap-start flex-col items-center gap-2.5 sm:w-36"
          >
            <div className="w-full rounded-[22px] bg-card p-1.5 ring-1 ring-ink/[0.08] transition-all duration-300 group-hover:-translate-y-0.5 group-hover:shadow-[0_12px_30px_-14px_rgba(20,24,40,0.35)] group-hover:ring-teal/30">
              <div className="relative aspect-square w-full overflow-hidden rounded-2xl" style={store.bannerStyle}>
                <Image
                  src={store.logo}
                  alt={store.name}
                  fill
                  sizes="150px"
                  className="object-cover object-center transition-transform duration-500 group-hover:scale-105"
                />
              </div>
            </div>
            <span className="line-clamp-2 px-1 text-center font-body text-xs font-semibold leading-snug text-ink/80 group-hover:text-teal-deep sm:text-sm">
              {store.name}
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}

// ─── Item count cell ─────────────────────────────────────────────────────────
// Mirrors /admin/sellers' ProductsCell: mock stores just show the cached
// display.itemCount (no feed to check). Real-feed stores show a dimmed
// skeleton until their turn comes up in the sequential live-count queue
// (see useSequentialLiveProductCounts), then swap to the confirmed live
// count. On error, falls back to the cached number.

function ItemCount({ store, live }: { store: StoreWithProvider; live?: LiveCountEntry }) {
  const cached = store.itemCount || null;

  // Custom stores with their own page (lib/store-modules) have no item count.
  if (hasStoreModule(store.slug)) return <>Made to order</>;

  if (store.providerType === 'mock' && store.slug !== 'anishka-creation') {
    return <>{cached ?? 0} items</>;
  }

  const status = live?.status ?? 'pending';

  if (status === 'pending' || status === 'loading') {
    return (
      <span
        className="inline-block h-3 w-14 align-middle rounded bg-ink/10 animate-pulse"
        title={status === 'loading' ? "Fetching this store's live count\u2026" : 'Queued \u2014 checking live counts one at a time'}
      />
    );
  }

  if (status === 'error') {
    return <>{cached ?? 0} items</>;
  }

  return (
    <>
      {live?.count}
      {live?.atLeast && '+'} items
    </>
  );
}

// ─── All Stores ───────────────────────────────────────────────────────────────

type ListFilter = 'all' | 'new' | 'following';

function StoreRow({
  store,
  following,
  live,
}: {
  store: StoreWithProvider;
  following: boolean;
  live?: LiveCountEntry;
}) {
  return (
    <Link
      href={`/stores/${store.slug}`}
      className={`group relative flex items-center gap-3.5 overflow-hidden rounded-2xl p-2.5 transition-all sm:gap-4 sm:p-3 ${
        following
          ? 'bg-teal/[0.07] ring-1 ring-teal/25 hover:bg-teal/[0.11]'
          : 'hover:bg-parchment hover:ring-1 hover:ring-ink/[0.07]'
      }`}
    >
      {following && <span aria-hidden className="absolute inset-y-3 left-0 w-1 rounded-r-full bg-teal" />}

      <div
        className={`relative h-14 w-14 shrink-0 overflow-hidden rounded-2xl sm:h-16 sm:w-16 ${
          following ? 'ring-2 ring-teal ring-offset-2 ring-offset-card' : 'ring-1 ring-ink/10'
        }`}
        style={store.bannerStyle}
      >
        <Image src={store.logo} alt="" fill sizes="64px" className="object-cover object-center" />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-1.5">
          <p className="truncate font-body text-[15px] font-semibold text-ink transition-colors group-hover:text-teal-deep">
            {store.name}
          </p>
          {store.isNew && (
            <span className="shrink-0 rounded-full bg-gold/20 px-1.5 py-0.5 font-body text-[9px] font-bold uppercase tracking-wider text-gold-deep">
              New
            </span>
          )}
        </div>
        <p className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-1.5 font-body text-xs text-ink/50">
          {store.category && (
            <>
              <span className="truncate">{store.category}</span>
              <span aria-hidden className="text-ink/25">•</span>
            </>
          )}
          <span className="whitespace-nowrap">
            <ItemCount store={store} live={live} />
          </span>
          {store.shipping && (
            <>
              <span aria-hidden className="text-ink/25">•</span>
              <span className="truncate">{store.shipping}</span>
            </>
          )}
        </p>
        {following && (
          <span className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-teal px-2 py-0.5 font-body text-[10px] font-bold text-white">
            <Check size={10} strokeWidth={3.5} /> Following
          </span>
        )}
      </div>

      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-ink/30 transition-all group-hover:bg-card group-hover:text-teal-deep group-hover:shadow-sm">
        <ChevronRight size={16} />
      </span>
    </Link>
  );
}

function AllStores({
  stores,
  liveCounts,
}: {
  stores: StoreWithProvider[];
  liveCounts: Record<string, LiveCountEntry>;
}) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<ListFilter>('all');
  const [activeLetter, setActiveLetter] = useState<string | null>(null);
  // Followed stores are highlighted in place (hooks/useFollowedStores.ts).
  const { followedAt } = useFollowedStores();

  const followingCount = stores.filter((s) => followedAt.has(s.slug)).length;
  const newCount = stores.filter((s) => s.isNew).length;

  useEffect(() => setActiveLetter(null), [filter]);
  // Nothing followed any more (e.g. signed out) — don't leave an empty view.
  useEffect(() => {
    if (filter === 'following' && followingCount === 0) setFilter('all');
  }, [filter, followingCount]);

  const q = search.trim().toLowerCase();
  const preFiltered = stores.filter((s) => {
    const matchesFilter = filter === 'all' ? true : filter === 'new' ? !!s.isNew : followedAt.has(s.slug);
    const matchesSearch = !q || s.name.toLowerCase().includes(q) || s.category.toLowerCase().includes(q);
    return matchesFilter && matchesSearch;
  });

  const grouped: Record<string, StoreWithProvider[]> = {};
  preFiltered.forEach((s) => {
    const first = s.name[0]?.toUpperCase() ?? '#';
    const key = /[A-Z]/.test(first) ? first : '#';
    (grouped[key] ??= []).push(s);
  });
  Object.values(grouped).forEach((arr) => arr.sort((a, b) => a.name.localeCompare(b.name)));

  const availableLetters = Object.keys(grouped);
  const sortedLetters = activeLetter
    ? grouped[activeLetter]
      ? [activeLetter]
      : []
    : [...availableLetters].sort((a, b) => (a === '#' ? -1 : b === '#' ? 1 : a.localeCompare(b)));

  const chips: { key: ListFilter; label: string; count: number; icon?: typeof Heart }[] = [
    { key: 'all', label: 'All', count: stores.length },
    ...(followingCount ? [{ key: 'following' as const, label: 'Following', count: followingCount, icon: Heart }] : []),
    ...(newCount ? [{ key: 'new' as const, label: 'New', count: newCount, icon: Sparkles }] : []),
  ];

  return (
    <section className="pb-16 sm:pb-24">
      <SectionHead
        eyebrow="Affiliated stores"
        title="All stores"
        intro="Boutiques and brands we buy from directly — browse their catalogues and add to your bag."
      />

      <div className="rounded-[28px] bg-card p-3 ring-1 ring-ink/[0.08] sm:p-6">
        {/* Search + filters */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <label className="relative flex min-w-0 items-center sm:w-80">
            <Search size={15} className="pointer-events-none absolute left-4 text-ink/40" />
            <input
              type="text"
              placeholder="Search stores or categories"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-full bg-parchment/80 py-2.5 pl-10 pr-10 font-body text-sm text-ink ring-1 ring-ink/[0.08] transition-shadow placeholder:text-ink/40 focus:outline-none focus:ring-2 focus:ring-teal/35"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                aria-label="Clear search"
                className="absolute right-2.5 grid h-6 w-6 place-items-center rounded-full text-ink/45 hover:bg-ink/[0.06] hover:text-ink"
              >
                <X size={13} />
              </button>
            )}
          </label>

          {chips.length > 1 && (
            <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {chips.map(({ key, label, count, icon: Icon }) => {
                const on = filter === key;
                return (
                  <button
                    key={key}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setFilter(key)}
                    className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 font-body text-xs font-semibold transition-colors ${
                      on ? 'bg-indigo text-parchment' : 'bg-parchment/80 text-ink/60 ring-1 ring-ink/[0.08] hover:text-ink'
                    }`}
                  >
                    {Icon && <Icon size={12} className={on ? '' : key === 'following' ? 'text-teal' : 'text-gold-deep'} />}
                    {label}
                    <span className={on ? 'text-parchment/60' : 'text-ink/35'}>{count}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* A–Z: one scrolling row on phones, full width on larger screens */}
        <div className="-mx-3 mt-4 border-y border-ink/[0.06] px-3 py-2 sm:mx-0 sm:mt-5 sm:rounded-full sm:border-0 sm:bg-parchment/60 sm:px-2 sm:py-1.5">
          <div className="flex gap-0.5 overflow-x-auto [scrollbar-width:none] sm:justify-between [&::-webkit-scrollbar]:hidden">
            {ALPHABET.map((letter) => {
              const hasData = availableLetters.includes(letter);
              const isActive = activeLetter === letter;
              return (
                <button
                  key={letter}
                  type="button"
                  disabled={!hasData}
                  aria-pressed={isActive}
                  onClick={() => setActiveLetter((l) => (l === letter ? null : letter))}
                  className={`grid h-8 min-w-8 shrink-0 place-items-center rounded-full font-body text-xs font-semibold transition-colors ${
                    isActive
                      ? 'bg-teal-deep text-white shadow-sm'
                      : hasData
                        ? 'text-ink hover:bg-card hover:text-teal-deep'
                        : 'cursor-default text-ink/20'
                  }`}
                >
                  {letter}
                </button>
              );
            })}
          </div>
        </div>

        {activeLetter && (
          <button
            type="button"
            onClick={() => setActiveLetter(null)}
            className="mt-3 inline-flex items-center gap-1 font-body text-xs font-semibold text-teal-deep hover:underline"
          >
            <X size={12} /> Show every letter
          </button>
        )}

        {/* Store list */}
        {sortedLetters.length === 0 ? (
          <div className="flex flex-col items-center px-4 py-16 text-center">
            <span className="grid h-12 w-12 place-items-center rounded-full bg-parchment text-ink/35">
              <Search size={20} />
            </span>
            <p className="mt-3 font-display text-lg font-semibold text-indigo">No stores found</p>
            <p className="mt-1 font-body text-sm text-ink/55">
              {q ? `Nothing matches “${search}”.` : 'Try another filter.'} You can always paste a product link instead.
            </p>
          </div>
        ) : (
          <div className="mt-4 space-y-5 sm:mt-6 md:columns-2 md:gap-8 md:space-y-0">
            {sortedLetters.map((letter) => (
              <div key={letter} className="break-inside-avoid md:pb-6">
                <div className="mb-2 flex items-center gap-3 px-1">
                  <span className="font-display text-2xl font-semibold leading-none text-gold-deep">{letter}</span>
                  <span className="h-px flex-1 bg-gradient-to-r from-ink/10 to-transparent" />
                  <span className="font-body text-[11px] text-ink/35">
                    {grouped[letter].length} {grouped[letter].length === 1 ? 'store' : 'stores'}
                  </span>
                </div>
                <div className="grid gap-1.5">
                  {grouped[letter].map((store) => (
                    <StoreRow
                      key={store.slug}
                      store={store}
                      following={followedAt.has(store.slug)}
                      live={liveCounts[store.slug]}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Apply */}
        <Link
          href="/stores/apply"
          className="group mt-6 flex items-center gap-4 rounded-2xl border border-dashed border-ink/15 p-3 transition-colors hover:border-teal/40 hover:bg-teal/[0.04] sm:mt-8 sm:p-4"
        >
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-parchment text-teal-deep ring-1 ring-ink/[0.06] transition-colors group-hover:bg-teal group-hover:text-white">
            <Plus size={20} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-body text-sm font-semibold text-ink group-hover:text-teal-deep">Sell on Wishdrop</span>
            <span className="block font-body text-xs text-ink/50">Open your store here — we verify every seller.</span>
          </span>
          <ArrowUpRight size={16} className="shrink-0 text-ink/35 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-teal-deep" />
        </Link>
      </div>
    </section>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function StoresPage() {
  const [stores, setStores] = useState<StoreWithProvider[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    supabase
      .from('sellers')
      .select('*')
      .eq('store_kind', 'local')
      .eq('status', 'active')
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          console.error('[stores page] failed to load sellers', error);
          setStores([]);
        } else {
          setStores((data ?? []).map(mapRowToStore));
        }
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  // Live item counts, checked one store at a time (same queue as
  // /admin/sellers) so this page doesn't hit every feed at once.
  // anishka-creation is 'mock' in config but has a real feed by slug.
  const liveFeedPlatforms = useMemo(
    () => stores.filter(s => s.providerType !== 'mock' || s.slug === 'anishka-creation').map(s => s.slug),
    [stores],
  );
  const { entries: liveCounts } = useSequentialLiveProductCounts(liveFeedPlatforms);

  return (
    <div className="w-full min-w-0 overflow-x-hidden bg-parchment">
      <PageHero
        eyebrow="Stores"
        title="Every store we"
        accent="shop from."
        intro="Indian marketplaces, boutiques and small sellers. Pick anything you like — we buy it, check it and deliver it to your door in Sri Lanka."
        width="wide"
      />

      <div className="mx-auto w-full max-w-7xl px-6 lg:px-10">
        {/* Static data — renders immediately regardless of the sellers fetch */}
        <MarketplacesCarousel stores={marketplaceStores} />

        {/* Instagram / Facebook shops — loads its own data; renders nothing if none. */}
        <SocialStoreTiles />

        {loading ? <AllStoresSkeleton /> : <AllStores stores={stores} liveCounts={liveCounts} />}
      </div>
    </div>
  );
}
