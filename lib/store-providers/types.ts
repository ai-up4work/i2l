// lib/store-providers/types.ts
import type { StoreProduct, StoreProductGender, StoreProductOption } from '@/lib/store.types';

export interface ProviderFetchParams {
  page: number;
  perPage: number;
  /** Display category label — adapters resolve this to their own id/handle/slug. */
  category: string;
  search: string;
  sort: 'newest' | 'price-asc' | 'price-desc' | 'sale';
}

export interface ProviderFetchResult {
  products: StoreProduct[];
  total: number;
  totalPages: number;
}

/** Strips HTML tags from a rich-text field (Shopify body_html, Woo short_description, etc). */
export function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n') // <br> carries no closing tag, so it'd otherwise vanish and fuse the surrounding text together
    .replace(/<\/(p|li|div|h[1-6])>/gi, '\n') // block-level closers become line breaks, not silent deletions
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&#8217;|&rsquo;/gi, '\u2019')
    .replace(/&#8216;|&lsquo;/gi, '\u2018')
    .replace(/&#8220;|&ldquo;/gi, '\u201c')
    .replace(/&#8221;|&rdquo;/gi, '\u201d')
    .replace(/&#8211;|&ndash;/gi, '\u2013')
    .replace(/&#8212;|&mdash;/gi, '\u2014')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s+/g, '\n')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

export function applySort<T extends { price: number; onSale?: boolean }>(
  items: T[],
  sort: ProviderFetchParams['sort']
): T[] {
  if (sort === 'price-asc') return [...items].sort((a, b) => a.price - b.price);
  if (sort === 'price-desc') return [...items].sort((a, b) => b.price - a.price);
  if (sort === 'sale') return [...items].sort((a, b) => Number(!!b.onSale) - Number(!!a.onSale));
  return items; // 'newest' — keep upstream order
}

/** Pulls a named option's values out of a generic option list, case-insensitively. */
function findOptionValues(options: StoreProductOption[], names: string[]): string[] | undefined {
  const match = options.find((o) => names.includes(o.name.toLowerCase()));
  return match?.values;
}

export function extractSizes(options: StoreProductOption[]): string[] | undefined {
  return findOptionValues(options, ['size']);
}

export function extractColors(options: StoreProductOption[]): string[] | undefined {
  return findOptionValues(options, ['color', 'colour']);
}

/**
 * Best-effort gender classification from free text (title, product type,
 * tags joined together). Returns undefined rather than guessing when
 * nothing matches — callers can supply `fallback` (e.g. a store config's
 * defaultGender) for stores that are near-exclusively one category, the
 * way a store-specific route previously hardcoded "men" for Old Money.
 */
export function detectGender(haystackParts: (string | undefined)[], fallback?: StoreProductGender): StoreProductGender | undefined {
  const text = haystackParts.filter(Boolean).join(' ').toLowerCase();
  if (!text) return fallback;

  const womenHit = /\b(women|woman|ladies|lady|female)\b/.test(text);
  const menHit = /\b(men|man|male)\b/.test(text);
  const unisexHit = /\bunisex\b/.test(text);

  if (unisexHit) return 'unisex';
  if (womenHit && !menHit) return 'women';
  if (menHit && !womenHit) return 'men';
  return fallback;
}

