// app/stores/page.tsx
'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { ALL_STORES, FILTERS, ALPHABET, type Store, type FilterKey } from '@/data/stores/data';

// ─── Skeletons ────────────────────────────────────────────────────────────────

function CarouselCardSkeleton() {
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="w-full aspect-square rounded-2xl bg-ink/10 animate-pulse" />
      <div className="h-3.5 w-20 rounded bg-ink/10 animate-pulse" />
    </div>
  );
}

function RowSkeleton() {
  return (
    <div className="flex items-center gap-4 py-3.5 px-2">
      <div className="w-11 h-11 rounded-xl bg-ink/10 animate-pulse shrink-0" />
      <div className="flex-1 space-y-2">
        <div className="h-3.5 w-32 rounded bg-ink/10 animate-pulse" />
        <div className="h-3 w-16 rounded bg-ink/10 animate-pulse" />
      </div>
    </div>
  );
}

function PageSkeleton() {
  return (
    <div className="w-full mt-8 min-w-0 overflow-x-hidden px-4 sm:px-10 lg:px-40">
      <div className="max-w-7xl mx-auto py-2 sm:py-4 min-w-0">
        <div className="mb-5 flex items-center justify-between">
          <div className="h-7 w-36 rounded-lg bg-ink/10 animate-pulse" />
          <div className="flex gap-2">
            <div className="w-9 h-9 rounded-full bg-ink/10 animate-pulse" />
            <div className="w-9 h-9 rounded-full bg-ink/10 animate-pulse" />
          </div>
        </div>
        <div className="flex gap-3 mb-10 overflow-hidden">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="shrink-0 w-[28vw] sm:w-[18vw] lg:w-32">
              <CarouselCardSkeleton />
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between mb-5">
          <div className="h-7 w-28 rounded-lg bg-ink/10 animate-pulse" />
          <div className="h-10 w-48 sm:w-72 rounded-lg bg-ink/10 animate-pulse" />
        </div>
        {Array.from({ length: 5 }).map((_, i) => <RowSkeleton key={i} />)}
      </div>
    </div>
  );
}

// ─── New Stores Carousel ──────────────────────────────────────────────────────

function NewStoresCarousel() {
  const trackRef = useRef<HTMLDivElement>(null);
  const [atStart, setAtStart] = useState(true);
  const [atEnd,   setAtEnd]   = useState(false);

  const newStores = ALL_STORES.filter(s => s.isNew);

  // Check bounds on mount so the Next button starts correctly disabled when
  // all cards are already visible (avoids the false-enabled bug from brands page)
  useEffect(() => {
    const t = trackRef.current;
    if (!t) return;
    setAtStart(t.scrollLeft <= 4);
    setAtEnd(t.scrollLeft + t.clientWidth >= t.scrollWidth - 4);
  }, []);

  const scroll = (dir: 'prev' | 'next') => {
    const t = trackRef.current; if (!t) return;
    const card = t.querySelector('a') as HTMLElement | null;
    const step = card ? card.offsetWidth + 12 : 160;
    t.scrollBy({ left: dir === 'next' ? step : -step, behavior: 'smooth' });
  };

  const onScroll = () => {
    const t = trackRef.current; if (!t) return;
    setAtStart(t.scrollLeft <= 4);
    setAtEnd(t.scrollLeft + t.clientWidth >= t.scrollWidth - 4);
  };

  return (
    <section className="mb-10 mt-8 sm:mb-16">
      <div className="flex items-center justify-between mb-5 sm:mb-8">
        <h2 className="font-display text-xl sm:text-2xl font-extrabold tracking-tight text-ink">
          New Stores
        </h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => scroll('prev')}
            disabled={atStart}
            className="p-2 rounded-full border border-ink/10 bg-card text-ink hover:bg-teal/10 hover:border-teal/30 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ChevronLeft size={18} />
          </button>
          <button
            onClick={() => scroll('next')}
            disabled={atEnd}
            className="p-2 rounded-full border border-ink/10 bg-card text-ink hover:bg-teal/10 hover:border-teal/30 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ChevronRight size={18} />
          </button>
        </div>
      </div>

      <div
        ref={trackRef}
        onScroll={onScroll}
        className="flex gap-3 overflow-x-auto snap-x snap-mandatory scrollbar-none px-4 sm:px-10 lg:mx-0 lg:px-0 pb-1"
      >
        {newStores.map(store => (
          <Link
            key={store.slug}
            href={`/stores/${store.slug}`}
            className="shrink-0 snap-start flex flex-col items-center gap-2.5 group w-[28vw] sm:w-[18vw] lg:w-32"
          >
            <div
              className="relative w-full aspect-square overflow-hidden rounded-2xl border border-ink/10 group-hover:border-teal transition-colors"
              style={store.bannerStyle}
            >
              <Image
                src={store.logo}
                alt={store.name}
                fill
                className="object-cover object-center group-hover:scale-105 transition-transform duration-500"
              />
            </div>
            <span className="font-body text-xs sm:text-sm font-medium text-ink text-center leading-snug line-clamp-2 px-1">
              {store.name}
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}

// ─── All Stores ───────────────────────────────────────────────────────────────

function AllStores({ activeFilter }: { activeFilter: FilterKey }) {
  const [search,       setSearch]       = useState('');
  const [activeLetter, setActiveLetter] = useState<string | null>(null);

  // Reset letter when filter changes
  useEffect(() => { setActiveLetter(null); }, [activeFilter]);

  // 1. Apply filter + search
  const preFiltered = ALL_STORES.filter(s => {
    const matchesFilter =
      activeFilter === 'all'      ? true :
      activeFilter === 'new'      ? !!s.isNew :
      s.type === activeFilter;

    const matchesSearch =
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.category.toLowerCase().includes(search.toLowerCase());

    return matchesFilter && matchesSearch;
  });

  // 2. Group by first letter
  const grouped: Record<string, Store[]> = {};
  preFiltered.forEach(s => {
    const first = s.name[0].toUpperCase();
    const key   = /[A-Z]/.test(first) ? first : '#';
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(s);
  });

  // Sort stores within each letter alphabetically
  Object.values(grouped).forEach(arr =>
    arr.sort((a, b) => a.name.localeCompare(b.name))
  );

  const availableLetters = Object.keys(grouped);

  // 3. If a letter is selected, only show that group
  const sortedLetters = activeLetter
    ? (grouped[activeLetter] ? [activeLetter] : [])
    : [...availableLetters].sort((a, b) => {
        if (a === '#') return -1;
        if (b === '#') return 1;
        return a.localeCompare(b);
      });

  return (
    <section className="mb-10 sm:mb-16">

      {/* Header row */}
      <div className="flex items-center justify-between gap-3 mb-5 sm:mb-8">
        <h2 className="font-display text-xl sm:text-2xl font-extrabold tracking-tight text-ink shrink-0">
          All Stores
        </h2>
        <div className="relative flex-1 sm:flex-none sm:w-72">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink/40" />
          <input
            type="text"
            placeholder="Search stores"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="font-body w-full pl-9 pr-4 py-2.5 rounded-lg border border-ink/10 bg-card text-ink text-sm placeholder:text-ink/40 focus:outline-none focus:border-teal transition-colors"
          />
        </div>
      </div>

      {/* Alphabet index */}
      <div className="flex items-center gap-0.5 mb-6 sm:mb-8 flex-wrap">
        {ALPHABET.map(letter => {
          const hasData = availableLetters.includes(letter);
          const isActive = activeLetter === letter;
          return (
            <button
              key={letter}
              type="button"
              onClick={() => hasData && setActiveLetter(l => l === letter ? null : letter)}
              className={`font-body w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center rounded-md text-xs sm:text-sm font-medium transition-colors
                ${isActive
                  ? 'bg-teal-deep text-white'
                  : hasData
                    ? 'text-ink hover:bg-teal/10 cursor-pointer'
                    : 'text-ink/25 cursor-default'
                }`}
            >
              {letter}
            </button>
          );
        })}
      </div>

      {/* Store list */}
      {sortedLetters.length === 0 ? (
        <div className="py-16 text-center text-ink/50 text-sm font-body">No stores found</div>
      ) : (
        <div className="space-y-6 sm:space-y-8">
          {sortedLetters.map(letter => (
            <div key={letter}>
              <h3 className="font-body text-sm sm:text-base font-semibold text-ink/50 mb-1 px-1">
                {letter}
              </h3>
              <div className="divide-y divide-ink/10">
                {grouped[letter].map(store => (
                  <Link
                    key={store.slug}
                    href={`/stores/${store.slug}`}
                    className="flex items-center gap-3 sm:gap-4 py-3 sm:py-3.5 group hover:bg-teal/5 rounded-xl px-2 -mx-2 transition-colors"
                  >
                    <div
                      className="relative w-10 h-10 sm:w-11 sm:h-11 rounded-xl overflow-hidden border border-ink/10 shrink-0"
                      style={store.bannerStyle}
                    >
                      <Image
                        src={store.logo}
                        alt={store.name}
                        fill
                        className="object-cover object-center"
                      />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <p className="font-body text-sm font-semibold text-ink group-hover:text-teal-deep transition-colors truncate">
                          {store.name}
                        </p>
                        {store.isNew && (
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-gold/15 text-gold-deep uppercase tracking-wider shrink-0">
                            New
                          </span>
                        )}
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wider shrink-0
                          ${store.type === 'custom'
                            ? 'bg-indigo/10 text-indigo'
                            : 'bg-teal/10 text-teal-deep'
                          }`}
                        >
                          {store.type === 'custom' ? 'Custom build' : 'Template'}
                        </span>
                      </div>
                      <p className="font-body text-xs text-ink/45 mt-0.5">
                        {store.category} · {store.itemCount} items · {store.shipping}
                      </p>
                    </div>

                    <ChevronRight size={15} className="text-ink/35 shrink-0" />
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Apply CTA row */}
      <Link
        href="/stores/apply"
        className="flex items-center gap-3 sm:gap-4 py-3 sm:py-3.5 group hover:bg-teal/5 rounded-xl px-2 -mx-2 transition-colors mt-0 border-t border-ink/10"
      >
        <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl border border-dashed border-ink/20 flex items-center justify-center shrink-0 text-ink/40 text-xl leading-none">
          +
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-body text-sm font-semibold text-ink group-hover:text-teal-deep transition-colors">
            Open your store here
          </p>
          <p className="font-body text-xs text-ink/45 mt-0.5">Apply for a spot — we verify every seller</p>
        </div>
        <ChevronRight size={15} className="text-ink/35 shrink-0" />
      </Link>

    </section>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function StoresPage() {
  const [activeFilter, setActiveFilter] = useState<FilterKey>('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 1000);
    return () => clearTimeout(t);
  }, []);

  if (loading) return <PageSkeleton />;

  return (
    <>
      {/* ── Page content ── */}
      <div className="w-full min-w-0 overflow-x-hidden px-4 sm:px-10 lg:px-40 bg-parchment">
        <div className="max-w-7xl mx-auto py-2 sm:py-4 min-w-0">

          {/* Mobile filter pills */}
          <div className="flex md:hidden items-center gap-1 overflow-x-auto scrollbar-none py-3 -mx-4 px-4 sm:-mx-10 sm:px-10 border-b border-ink/10 mb-6">
            {FILTERS.map(({ key, label }) => (
              <button
                key={key}
                type="button"
                onClick={() => setActiveFilter(key)}
                className={`font-body shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-all whitespace-nowrap border
                  ${activeFilter === key
                    ? 'bg-teal-deep text-white border-teal-deep'
                    : 'border-ink/10 text-ink/55 hover:text-ink hover:bg-teal/10'
                  }`}
              >
                {label}
              </button>
            ))}
          </div>

          <NewStoresCarousel />
          <AllStores activeFilter={activeFilter} />

        </div>
      </div>
    </>
  );
}