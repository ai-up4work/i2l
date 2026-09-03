'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import {
  ChevronRight, ChevronLeft, ChevronDown, ShoppingBag, Heart,
  X, ArrowUpDown, Truck, ShieldCheck, AlertCircle, Search,
  Sparkles, PackageSearch,
} from 'lucide-react';
import type { AffiliatedStore } from '@/components/dashboard/data';
import { affiliatedStores } from '@/components/dashboard/data';
import type { StoreProduct, StoreApiResponse } from '@/lib/store.types';
import Image from 'next/image';
import { formatPrice } from '@/lib/currency';
import Flag from '@/components/ui/Flag';

type SortKey = 'newest' | 'price-asc' | 'price-desc' | 'sale';

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'newest',     label: 'Newest'          },
  { key: 'sale',       label: 'On sale first'   },
  { key: 'price-asc',  label: 'Price: low-high' },
  { key: 'price-desc', label: 'Price: high-low' },
];

const PER_PAGE = 24;

// Shown in place of a product/logo image whenever the real one fails to
// load (dead link, host hotlink-protection, temporary downtime, etc) so we
// never show Next's broken-image icon in a fixed-size box.
const FALLBACK_IMAGE = '/placeholder-product.png';

// ─── Helpers ──────────────────────────────────────────────────────────────────

type CartItem = StoreProduct & { qty: number };

function cartKey(platform: string) {
  return `store_cart_${platform}`;
}
function readCart(platform: string): CartItem[] {
  if (typeof window === 'undefined') return [];
  try { return JSON.parse(sessionStorage.getItem(cartKey(platform)) ?? '[]'); } catch { return []; }
}
function writeCart(platform: string, items: CartItem[]) {
  sessionStorage.setItem(cartKey(platform), JSON.stringify(items));
  window.dispatchEvent(new Event('store_cart_updated'));
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function ProductSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="aspect-square rounded-2xl bg-ink/10 mb-3" />
      <div className="h-2.5 w-20 rounded bg-ink/10 mb-1.5" />
      <div className="h-3.5 w-3/4 rounded bg-ink/10 mb-2" />
      <div className="h-3 w-1/3 rounded bg-ink/10" />
    </div>
  );
}

// ─── Product Card ─────────────────────────────────────────────────────────────

function ProductCard({
  product,
  platform,
  onAdd,
}: {
  product: StoreProduct;
  platform: string;
  onAdd: (p: StoreProduct) => void;
}) {
  const [wishlisted, setWishlisted] = useState(false);

  const discount = product.compareAtPrice && product.onSale
    ? Math.round((1 - product.price / product.compareAtPrice) * 100)
    : null;

  return (
    <div className="group flex flex-col">
      <Link
        href={`/stores/${platform}/product/${product.handle}`}
        className="relative overflow-hidden rounded-2xl bg-card border border-ink/10 mb-3 block"
      >
        <Image
          src={product.image}
          alt={product.name}
          className="w-full h-auto object-contain transition-all duration-700 group-hover:scale-105"
          loading="lazy"
          width={400}
          height={400}
          referrerPolicy="no-referrer"
          onError={(e) => { e.currentTarget.src = FALLBACK_IMAGE; }}
        />

        <div className="absolute top-3 left-3 flex flex-col gap-1">
          {discount && (
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-gold text-white">
              -{discount}%
            </span>
          )}
          {!product.inStock && (
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-ink text-parchment">
              Sold out
            </span>
          )}
        </div>

        <div className="absolute top-3 right-3">
          <span className="text-[8px] font-bold px-1.5 py-0.5 rounded-md bg-card/85 backdrop-blur-sm text-ink/70 whitespace-nowrap">
            {product.condition}
          </span>
        </div>

        <button
          type="button"
          onClick={(e) => { e.preventDefault(); setWishlisted((v) => !v); }}
          className="absolute bottom-3 right-3 w-8 h-8 rounded-full bg-card/85 backdrop-blur-sm
            flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-200
            hover:bg-card z-10"
        >
          <Heart size={14} className={wishlisted ? 'fill-gold-deep text-gold-deep' : 'text-ink'} />
        </button>

        <button
          type="button"
          onClick={(e) => { e.preventDefault(); onAdd(product); }}
          disabled={!product.inStock}
          className="absolute bottom-3 left-3 right-12 py-2 bg-card/90
            backdrop-blur-sm text-ink text-xs font-bold rounded-xl text-center
            translate-y-2 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 transition-all duration-200
            hover:bg-teal hover:text-white disabled:opacity-40 disabled:pointer-events-none"
        >
          {product.inStock ? 'Add to bag' : 'Sold out'}
        </button>
      </Link>

      <Link href={`/stores/${platform}/product/${product.handle}`} className="flex flex-col flex-1 hover:opacity-75 transition-opacity">
        <p className="text-[10px] text-ink/45 uppercase tracking-wider font-semibold mb-0.5">
          {product.category}
        </p>
        <p className="text-sm font-semibold text-ink leading-tight mb-1.5 line-clamp-2 font-body">
          {product.name}
        </p>
        <p className="text-[10px] text-ink/40 mb-1.5 font-body">Sold by {product.seller}</p>

        <div className="flex items-center justify-between mt-auto">
          <div className="flex items-baseline gap-1.5">
            <span className="text-sm font-bold text-teal-deep">{formatPrice(product.price, product.currency)}</span>
            {product.compareAtPrice && product.onSale && (
              <span className="text-[10px] text-ink/40 line-through">{formatPrice(product.compareAtPrice, product.currency)}</span>
            )}
          </div>
        </div>
      </Link>
    </div>
  );
}

// ─── Mini Cart ────────────────────────────────────────────────────────────────

function MiniCart({
  items,
  storeName,
  onClose,
  onClear,
}: {
  items: CartItem[];
  storeName: string;
  onClose: () => void;
  onClear: () => void;
}) {
  const total = items.reduce((s, i) => s + i.price * i.qty, 0);
  const WA = (process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ?? '+94755354830').replace(/\D/g, '');

  const lines = items
    .map((i) => `\u2022 ${i.name} x${i.qty} \u2014 ${formatPrice(i.price * i.qty, i.currency)}`)
    .join('\n');

  const whatsappText = encodeURIComponent(
    `Hi! I'd like to order from ${storeName}\n\n${lines}\n\nTotal: ${formatPrice(total, items[0]?.currency ?? 'LKR')}\n\nPlease confirm availability and delivery. Thank you!`
  );

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-ink/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-parchment w-full max-w-sm h-full flex flex-col shadow-2xl">
        <div className="flex items-center justify-between p-5 border-b border-ink/10">
          <h3 className="text-sm font-bold text-ink font-display">
            Your bag <span className="text-ink/45 font-normal font-body">({items.reduce((s, i) => s + i.qty, 0)})</span>
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full hover:bg-teal/10 flex items-center justify-center transition-colors"
          >
            <X size={14} className="text-ink" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {items.length === 0 ? (
            <div className="text-center py-16">
              <PackageSearch size={32} className="mx-auto mb-3 text-ink/25" />
              <p className="text-sm text-ink/60 font-body">Your bag is empty</p>
              <p className="text-xs text-ink/40 mt-1 font-body">Add something you like</p>
            </div>
          ) : (
            items.map((item, idx) => (
              <div key={item.id + '-' + idx} className="flex items-center gap-3 p-3 rounded-xl border border-ink/10 bg-card">
                <Image
                  src={item.image}
                  alt={item.name}
                  className="w-14 h-14 rounded-lg object-cover shrink-0 bg-card"
                  width={56}
                  height={56}
                  referrerPolicy="no-referrer"
                  onError={(e) => { e.currentTarget.src = FALLBACK_IMAGE; }}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] text-ink/45 font-body">{item.category}</p>
                  <p className="text-xs font-semibold text-ink truncate font-body">{item.name}</p>
                  <p className="text-xs font-bold text-ink mt-0.5 font-body">
                    {formatPrice(item.price, item.currency)} x {item.qty}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>

        {items.length > 0 && (
          <div className="p-4 border-t border-ink/10 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-ink/60 font-body">Subtotal</span>
              <span className="text-sm font-bold text-ink font-body">{formatPrice(total, items[0]?.currency ?? 'LKR')}</span>
            </div>
            <a
              href={`https://wa.me/${WA}?text=${whatsappText}`}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full py-3.5 rounded-xl bg-[#25D366] text-white text-sm font-bold flex items-center justify-center gap-2 hover:bg-[#1ebe5d] transition-colors font-body"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
              </svg>
              Order via WhatsApp
            </a>
            <button
              type="button"
              onClick={onClear}
              className="w-full text-xs text-ink/45 hover:text-ink transition-colors font-body"
            >
              Clear bag
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Pagination ───────────────────────────────────────────────────────────────

function Pagination({
  page,
  totalPages,
  onPrev,
  onNext,
  onGoto,
}: {
  page: number;
  totalPages: number;
  onPrev: () => void;
  onNext: () => void;
  onGoto: (pg: number) => void;
}) {
  if (totalPages <= 1) return null;

  const hasMore = page < totalPages;
  const buttons: number[] = [];
  for (let i = Math.max(1, page - 2); i <= page; i++) buttons.push(i);
  if (hasMore) buttons.push(page + 1);

  return (
    <div className="flex items-center justify-center gap-2 mt-12">
      <button
        type="button"
        disabled={page <= 1}
        onClick={onPrev}
        className="p-2 rounded-xl border border-ink/10 hover:bg-teal/10 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        <ChevronLeft size={16} className="text-ink" />
      </button>

      <div className="flex items-center gap-1">
        {page > 3 && (
          <>
            <button
              type="button"
              onClick={() => onGoto(1)}
              className="w-9 h-9 rounded-xl text-sm font-medium text-ink/50 hover:bg-teal/10 transition-all font-body"
            >
              1
            </button>
            <span className="text-ink/40 text-sm px-1">&hellip;</span>
          </>
        )}
        {buttons.map((pg) => (
          <button
            key={pg}
            type="button"
            onClick={() => onGoto(pg)}
            className={
              'w-9 h-9 rounded-xl text-sm font-medium transition-all font-body ' +
              (page === pg ? 'bg-teal-deep text-white' : 'hover:bg-teal/10 text-ink/60')
            }
          >
            {pg}
          </button>
        ))}
        {hasMore && <span className="text-ink/40 text-sm px-1">&hellip;</span>}
      </div>

      <button
        type="button"
        disabled={!hasMore}
        onClick={onNext}
        className="p-2 rounded-xl border border-ink/10 hover:bg-teal/10 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        <ChevronRight size={16} className="text-ink" />
      </button>
    </div>
  );
}

// ─── Mobile category / store sheet ─────────────────────────────────────────
// Bottom-sheet overlay for small screens, mirroring the site's own
// MobileBottomNav → CategorySheet interaction (backdrop blur, slide up
// from the bottom, rounded top corners, drag handle) so this doesn't feel
// like a different pattern bolted onto the page. Desktop keeps the small
// dropdown next to the store name; this only renders/shows on mobile
// (`sm:hidden` on the outer wrapper — display:none there means it's fully
// inert on desktop, not just visually hidden). Lists this store's
// categories AND a row of other affiliated stores to jump to, since on
// mobile there's room to let people switch stores from right here instead
// of going back through the header nav.
function MobileCategorySheet({
  open,
  onClose,
  store,
  category,
  categoryFilters,
  onSelectCategory,
}: {
  open: boolean;
  onClose: () => void;
  store: AffiliatedStore;
  category: string;
  categoryFilters: string[];
  onSelectCategory: (c: string) => void;
}) {
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const [storeSearch, setStoreSearch] = useState('');

  useEffect(() => {
    if (open) {
      setMounted(true);
      const id = requestAnimationFrame(() =>
        requestAnimationFrame(() => setVisible(true))
      );
      return () => cancelAnimationFrame(id);
    } else {
      setVisible(false);
      const t = setTimeout(() => setMounted(false), 320);
      return () => clearTimeout(t);
    }
  }, [open]);

  useEffect(() => {
    if (!mounted) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [mounted]);

  // Reset the store search whenever the sheet closes, so it doesn't
  // reopen next time still filtered from a previous session.
  useEffect(() => {
    if (!open) setStoreSearch('');
  }, [open]);

  if (!mounted) return null;

  const otherStores = affiliatedStores.filter((s) => s.platform !== store.platform);
  const filteredStores = storeSearch.trim()
    ? otherStores.filter((s) => s.name.toLowerCase().includes(storeSearch.trim().toLowerCase()))
    : otherStores;

  return (
    <div className="sm:hidden">
      {/* Backdrop */}
      <div
        onClick={onClose}
        className="fixed inset-0 z-40 bg-ink/40 backdrop-blur-sm"
        style={{
          opacity: visible ? 1 : 0,
          pointerEvents: visible ? 'auto' : 'none',
          transition: 'opacity 0.32s cubic-bezier(0.4, 0, 0.2, 1)',
        }}
      />

      {/* Sheet */}
      <div
        className="fixed left-0 right-0 bottom-0 z-50 flex flex-col rounded-t-3xl overflow-hidden bg-parchment shadow-2xl"
        style={{
          maxHeight: '80dvh',
          transform: visible ? 'translateY(0)' : 'translateY(110%)',
          transition: visible
            ? 'transform 0.42s cubic-bezier(0.32, 0.72, 0, 1)'
            : 'transform 0.32s cubic-bezier(0.4, 0, 0.2, 1)',
          willChange: 'transform',
        }}
      >
        <div className="flex justify-center pt-2.5 pb-1 shrink-0">
          <div className="w-9 h-1 rounded-full bg-ink/15" />
        </div>

        <div className="flex items-center justify-between px-5 py-3 border-b border-ink/10 shrink-0">
          <span className="font-display text-sm font-bold text-ink">Categories</span>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full hover:bg-teal/10 flex items-center justify-center transition-colors"
          >
            <X size={14} className="text-ink" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain">
          <div className="px-2 py-2">
            {categoryFilters.map((c) => (
              <button
                key={c || 'all'}
                type="button"
                onClick={() => { onSelectCategory(c); onClose(); }}
                className={
                  'font-body w-full text-left px-4 py-3 rounded-xl text-sm transition-colors ' +
                  (category === c ? 'bg-ink text-parchment font-bold' : 'text-ink/70 hover:bg-teal/10')
                }
              >
                {c || 'All'}
              </button>
            ))}
          </div>

          {otherStores.length > 0 && (
            <>
              <div className="px-5 pt-3 pb-2 border-t border-ink/10">
                <p className="text-[10px] font-bold text-ink/45 uppercase tracking-wider font-body mb-2.5">Browse other stores</p>
                <div className="relative">
                  <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink/40 pointer-events-none" />
                  <input
                    type="text"
                    value={storeSearch}
                    onChange={(e) => setStoreSearch(e.target.value)}
                    placeholder="Search stores..."
                    className="font-body w-full pl-8 pr-3 py-2 text-xs rounded-xl border border-ink/10 bg-card
                      placeholder:text-ink/35 focus:outline-none focus:ring-2 focus:ring-teal/15 focus:border-teal/40 transition-all"
                  />
                </div>
              </div>

              <div className="px-3 pb-6 flex flex-col gap-2">
                {filteredStores.length === 0 ? (
                  <p className="text-xs text-ink/45 font-body text-center py-6">No stores match &ldquo;{storeSearch}&rdquo;</p>
                ) : (
                  filteredStores.map((s) => (
                    <Link
                      key={s.platform}
                      href={`/stores/${s.platform}`}
                      onClick={onClose}
                      className="flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-teal/10 transition-colors"
                    >
                      <span className="w-16 h-16 rounded-xl border border-ink/10 bg-card flex items-center justify-center overflow-hidden shrink-0">
                        <Image
                          src={s.logo}
                          alt={s.name}
                          className="w-full h-full object-contain"
                          width={64}
                          height={64}
                          referrerPolicy="no-referrer"
                          onError={(e) => { e.currentTarget.src = FALLBACK_IMAGE; }}
                        />
                      </span>
                      <span className="text-xs text-ink/70 font-body leading-tight">
                        {s.name}
                      </span>
                    </Link>
                  ))
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main client component ─────────────────────────────────────────────────────

export default function StoreCatalogClient({ store }: { store: AffiliatedStore }) {
  const platform = store.platform;

  const [category,    setCategory]    = useState('');
  const [sortBy,       setSortBy]      = useState<SortKey>('newest');
  const [page,         setPage]        = useState(1);
  const [search,       setSearch]      = useState('');
  const [searchInput,  setSearchInput] = useState('');

  const [products,    setProducts]    = useState<StoreProduct[]>([]);
  const [totalPages,  setTotalPages]  = useState(1);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState<string | null>(null);

  const [cart,        setCart]        = useState<CartItem[]>([]);
  const [cartOpen,    setCartOpen]    = useState(false);
  const [showSort,    setShowSort]    = useState(false);
  const [showCategoryMenu, setShowCategoryMenu] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef(0); // identifies the latest in-flight request; lets us ignore stale/aborted responses

  useEffect(() => {
    setCart(readCart(platform));
    const sync = () => setCart(readCart(platform));
    window.addEventListener('store_cart_updated', sync);
    return () => window.removeEventListener('store_cart_updated', sync);
  }, [platform]);

  const clearCart = () => { writeCart(platform, []); setCart([]); };

  const addToCart = (product: StoreProduct) => {
    const current = readCart(platform);
    const idx = current.findIndex((i) => i.id === product.id);
    const next =
      idx >= 0
        ? current.map((i, n) => (n === idx ? { ...i, qty: i.qty + 1 } : i))
        : [...current, { ...product, qty: 1 }];
    writeCart(platform, next);
    setCart(next);
    setCartOpen(true);
  };

  const fetchProducts = useCallback(
    async (cat: string, pg: number, q: string, sort: SortKey) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      // Every call gets a fresh id. Only the call whose id still matches
      // requestIdRef.current when it finishes is allowed to touch state —
      // this stops an aborted/superseded request from flipping `loading`
      // back to false (via `finally`) after a newer request has taken over.
      const requestId = ++requestIdRef.current;

      setLoading(true);
      setError(null);

      try {
        const qs = new URLSearchParams({ page: String(pg), per_page: String(PER_PAGE), sort });
        if (cat) qs.set('category', cat);
        if (q) qs.set('search', q);

        const res = await fetch(`/api/stores/${platform}?${qs.toString()}`, { signal: controller.signal });
        if (!res.ok) {
          const err = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(err.error ?? `HTTP ${res.status}`);
        }
        const data = (await res.json()) as StoreApiResponse;

        if (requestIdRef.current !== requestId) return; // a newer request has since started; drop this one

        setProducts(data.products);
        setTotalPages(data.totalPages);
      } catch (e) {
        if ((e as Error).name === 'AbortError') return;
        if (requestIdRef.current !== requestId) return;
        setError((e as Error).message);
      } finally {
        if (requestIdRef.current === requestId) {
          setLoading(false);
        }
      }
    },
    [platform]
  );

  useEffect(() => { fetchProducts(category, page, search, sortBy); }, [category, page, search, sortBy, fetchProducts]);

  const handleCategory = (c: string) => { setCategory(c); setPage(1); };
  const handleSearch = () => { setSearch(searchInput); setPage(1); };
  const goToPage = (pg: number) => { setPage(pg); window.scrollTo({ top: 0, behavior: 'smooth' }); };

  const cartQty = cart.reduce((s, i) => s + i.qty, 0);

  const categoryFilters = ['', ...store.categories];

  return (
    <div className="min-h-screen bg-parchment">

      {/* Breadcrumb — normal document flow, NOT sticky. Scrolls away
          naturally with the page instead of competing with the site's
          own sticky header. max-w-8xl here so the breadcrumb/bag row
          spans the same wider width as the category bar below it. */}
      <div className="bg-parchment border-b border-ink/[0.06] pt-3">
        <div className="max-w-8xl mx-auto flex items-center justify-between gap-4 px-4 sm:px-10 lg:px-40 pb-2.5">
          <div className="flex items-center gap-1.5 text-[11px] text-ink/40 shrink-0 font-body min-w-0">
            <Link href="/" className="hover:text-teal-deep transition-colors font-medium shrink-0">Home</Link>
            <ChevronRight size={10} className="shrink-0" />
            <Link href="/stores" className="hover:text-teal-deep transition-colors font-medium shrink-0">Stores</Link>
            <ChevronRight size={10} className="shrink-0" />
            <span className="text-ink/70 font-medium truncate">{store.name}</span>
          </div>

          <button
            type="button"
            onClick={() => setCartOpen(true)}
            className="relative flex items-center gap-1.5 pl-2.5 pr-3 py-1.5 rounded-full hover:bg-teal/10 transition-colors shrink-0"
          >
            <ShoppingBag size={13} className="text-ink/70" />
            <span className="text-xs font-semibold text-ink/70 font-body">Bag</span>
            {cartQty > 0 && (
              <span className="absolute -top-1 -right-0.5 w-4 h-4 rounded-full bg-teal-deep text-white text-[9px] font-bold flex items-center justify-center">
                {cartQty}
              </span>
            )}
          </button>
        </div>
      </div>

      <div className="w-full min-w-0 px-4 sm:px-10 lg:px-40">
        <div className="max-w-7xl mx-auto py-8 sm:py-12 min-w-0">

          {/* ── Hero ── */}
          <div className="mb-10 sm:mb-14">
            <div className="flex items-center justify-between gap-3 mb-5">
              <div className="flex items-center gap-3 min-w-0">
                <span className="w-10 h-10 rounded-xl border border-ink/10 bg-card flex items-center justify-center shrink-0 overflow-hidden">
                  <Image
                    src={store.logo}
                    alt={store.name}
                    className="w-full h-full object-contain"
                    width={40}
                    height={40}
                    referrerPolicy="no-referrer"
                    onError={(e) => { e.currentTarget.src = FALLBACK_IMAGE; }}
                  />
                </span>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h1 className="font-display text-lg font-black text-ink tracking-tight">{store.name.toUpperCase()}</h1>
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-teal/10 text-teal-deep uppercase tracking-wider font-body whitespace-nowrap">
                      Affiliated store
                    </span>
                  </div>
                  <p className="text-[10px] text-ink/45 font-body flex items-center gap-1.5">
                    <Flag flag={store.flag} /> {store.country}
                  </p>
                </div>
              </div>

              {/* Category picker — stays inline with the store name row at
                  every width. On mobile it collapses to an icon-only button
                  (just the chevron) and opens a full bottom-sheet overlay
                  (MobileCategorySheet, below) instead of the small dropdown
                  — same click handler drives both, CSS breakpoints decide
                  which one is actually visible/interactive. */}
              <div className="relative shrink-0">
                <button
                  type="button"
                  onClick={() => setShowCategoryMenu((v) => !v)}
                  aria-label="Filter by category"
                  className="font-body flex items-center gap-1.5 px-2.5 sm:px-3.5 py-2 rounded-xl border border-ink/10 bg-card text-xs font-semibold text-ink hover:bg-teal/10 transition-colors"
                >
                  <span className="hidden sm:inline whitespace-nowrap">{category || 'All categories'}</span>
                  <ChevronDown size={14} className={showCategoryMenu ? 'rotate-180 transition-transform' : 'transition-transform'} />
                </button>

                {/* Desktop dropdown — hidden entirely (display:none) below `sm`. */}
                {showCategoryMenu && (
                  <div className="hidden sm:block absolute right-0 top-full mt-1.5 bg-card border border-ink/10 rounded-xl shadow-xl z-20 py-1 min-w-[160px] max-h-64 overflow-y-auto">
                    {categoryFilters.map((c) => (
                      <button
                        key={c || 'all'}
                        type="button"
                        onClick={() => { handleCategory(c); setShowCategoryMenu(false); }}
                        className={
                          'font-body w-full text-left px-4 py-2.5 text-xs whitespace-nowrap transition-colors hover:bg-teal/10 ' +
                          (category === c ? 'font-bold text-ink' : 'text-ink/55')
                        }
                      >
                        {c || 'All'}
                      </button>
                    ))}
                  </div>
                )}

                {/* Mobile bottom sheet — only this renders/shows below `sm`. */}
                <MobileCategorySheet
                  open={showCategoryMenu}
                  onClose={() => setShowCategoryMenu(false)}
                  store={store}
                  category={category}
                  categoryFilters={categoryFilters}
                  onSelectCategory={handleCategory}
                />
              </div>
            </div>

            <p className="font-display text-3xl sm:text-4xl font-bold text-ink tracking-tight leading-tight mb-3 max-w-lg">
              Shop {store.name},<br />delivered to your door.
            </p>
            <p className="text-ink/60 text-sm max-w-md mb-6 font-body">{store.description}</p>

            <div className="flex items-center gap-6 flex-wrap">
              {[
                { icon: <Sparkles size={13} />,    label: 'Wide selection'      },
                { icon: <ShieldCheck size={13} />, label: 'We verify every item' },
                { icon: <Truck size={13} />,       label: 'International shipping' },
              ].map((b) => (
                <div key={b.label} className="flex items-center gap-1.5 text-xs text-ink/55 font-body">
                  <span className="text-teal-deep">{b.icon}</span>
                  {b.label}
                </div>
              ))}
            </div>
          </div>

          {/* ── Toolbar ── */}
          <div className="flex items-center justify-between gap-3 mb-6 flex-wrap">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <div className="relative flex-1 sm:flex-none sm:w-64">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink/40 pointer-events-none" />
                <input
                  type="text"
                  placeholder={`Search ${store.name}...`}
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                  className="font-body w-full pl-8 pr-3 py-2 text-xs rounded-xl border border-ink/10 bg-card
                    placeholder:text-ink/35 focus:outline-none focus:ring-2 focus:ring-teal/15 focus:border-teal/40 transition-all"
                />
              </div>
              <button
                type="button"
                onClick={handleSearch}
                className="font-body px-3 py-2 rounded-xl border border-ink/10 bg-card text-xs font-medium hover:bg-teal/10 transition-colors shrink-0"
              >
                Search
              </button>
              {search && (
                <button
                  type="button"
                  onClick={() => { setSearch(''); setSearchInput(''); }}
                  className="font-body flex items-center gap-1 text-xs text-ink/45 hover:text-ink transition-colors shrink-0"
                >
                  <X size={12} /> Clear
                </button>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <p className="font-body text-sm text-ink/50 hidden sm:block">
                <span className="text-ink font-semibold">{products.length}</span> items
              </p>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowSort((v) => !v)}
                  className="font-body flex items-center gap-1.5 px-3 py-2 rounded-xl border border-ink/10 bg-card text-xs font-medium hover:bg-teal/10 transition-colors"
                >
                  <ArrowUpDown size={12} />{SORT_OPTIONS.find((s) => s.key === sortBy)?.label}
                </button>
                {showSort && (
                  <div className="absolute right-0 top-full mt-1.5 bg-card border border-ink/10 rounded-xl shadow-xl z-20 py-1 min-w-[160px]">
                    {SORT_OPTIONS.map((s) => (
                      <button
                        key={s.key}
                        type="button"
                        onClick={() => { setSortBy(s.key); setShowSort(false); }}
                        className={
                          'font-body w-full text-left px-4 py-2.5 text-xs transition-colors hover:bg-teal/10 ' +
                          (sortBy === s.key ? 'font-bold text-ink' : 'text-ink/55')
                        }
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ── Error ── */}
          {error && (
            <div className="mb-8 flex items-start gap-3 p-4 rounded-2xl border border-gold/40 bg-gold/10">
              <AlertCircle size={16} className="text-gold-deep shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-ink mb-0.5 font-body">Could not load products</p>
                <p className="text-xs text-ink/55 font-body">{error}</p>
                <button
                  type="button"
                  onClick={() => fetchProducts(category, page, search, sortBy)}
                  className="mt-2 text-xs font-semibold text-ink underline hover:no-underline font-body"
                >
                  Try again
                </button>
              </div>
            </div>
          )}

          {/* ── Product grid ── */}
          {loading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-8">
              {Array.from({ length: 8 }).map((_, i) => <ProductSkeleton key={i} />)}
            </div>
          ) : products.length === 0 && !error ? (
            <div className="py-20 text-center text-ink/50">
              <PackageSearch size={40} className="mx-auto mb-4 text-ink/20" />
              <p className="text-sm font-body">No products found.</p>
              {(category || search) && (
                <button
                  type="button"
                  onClick={() => { handleCategory(''); setSearch(''); setSearchInput(''); }}
                  className="mt-3 text-xs font-semibold text-ink underline hover:no-underline font-body"
                >
                  Clear filters
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-8">
              {products.map((p) => (
                <ProductCard key={p.id} product={p} platform={platform} onAdd={addToCart} />
              ))}
            </div>
          )}

          {/* ── Pagination ── */}
          {!loading && !error && products.length > 0 && (
            <Pagination
              page={page}
              totalPages={totalPages}
              onPrev={() => goToPage(Math.max(1, page - 1))}
              onNext={() => goToPage(page + 1)}
              onGoto={goToPage}
            />
          )}

          {/* ── Footer ── */}
          <div className="mt-16 pt-8 border-t border-ink/10 grid grid-cols-1 sm:grid-cols-3 gap-8">
            {[
              { title: `About ${store.name}`, body: store.description },
              {
                title: 'How buying works',
                body: 'Browse here, add to bag, then order via WhatsApp. We confirm price and availability with the seller and ship it to you.',
              },
              {
                title: 'Shipping & payment',
                body: 'International shipping to our local warehouse network, then onward delivery. Cash on delivery available on most orders.',
              },
            ].map((s) => (
              <div key={s.title}>
                <p className="font-body text-xs font-bold text-ink uppercase tracking-wider mb-2">{s.title}</p>
                <p className="font-body text-xs text-ink/55 leading-relaxed">{s.body}</p>
              </div>
            ))}
          </div>

        </div>
      </div>

      {cartOpen && (
        <MiniCart items={cart} storeName={store.name} onClose={() => setCartOpen(false)} onClear={clearCart} />
      )}
    </div>
  );
}