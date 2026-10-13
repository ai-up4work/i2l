// lib/store-providers/woocommerce.ts
import type { StoreProduct, StoreProductOption } from '@/lib/store.types';
import type { WooCommerceProviderConfig } from '@/lib/store-config';
import type { ProviderFetchParams, ProviderFetchResult } from './types';
import { extractColors, extractSizes, stripHtml } from './types';
// Hardened fetch (browser headers, retries, per-host throttling, optional relay).
// Shadows the global fetch so every request in this file goes through it.
import { storeFetch as fetch, hostUsesFirecrawl } from './http';

const CACHE_SECONDS = 60 * 10;

// Default headers merged into every request to a WooCommerce store, same
// pattern as shopify.ts's HEADERS constant. This is a genuine, full modern
// browser UA — deliberately NOT the "Mozilla/5.0 (compatible; X/1.0)"
// shape used previously. That "(compatible; X/1.0)" construction is
// exactly how real crawlers self-identify (Googlebot, bingbot, etc.), so
// hosting-level WAFs (Imunify360/CloudLinux being especially common)
// treat it as a bot signature and 403 it outright — confirmed against a
// real store where that exact string got blocked while curl's own default
// UA (and a real browser) both succeeded. config.headers is still spread
// on top of this in every call below, so a specific seller can override it
// if that store needs something even more particular.
const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  Accept: 'application/json',
};

// ── wc/v3 (authenticated) response shape ────────────────────────────────────
interface WooV3Attribute {
  name: string;
  options: string[];
}
interface WooV3Product {
  id: number;
  name: string;
  slug: string;
  sku?: string;
  short_description: string;
  description?: string;
  price: string;
  regular_price: string;
  sale_price: string;
  on_sale: boolean;
  stock_status: 'instock' | 'outofstock' | 'onbackorder';
  categories: { id: number; name: string }[];
  images: { src: string }[];
  attributes?: WooV3Attribute[];
  tags?: { name: string }[];
  type?: string; // 'simple' | 'variable' | ...
  /** String in the store's configured weight unit — wc/v3 doesn't say which in the product payload itself, so we don't assume kg. */
  weight?: string;
  average_rating?: string;
  rating_count?: number;
}

// ── Store API v1 (public) response shape ────────────────────────────────────
interface WooStoreApiAttribute {
  name: string;
  terms: { name: string }[];
}
interface WooStoreApiVariationAttribute {
  name: string;
  value: string; // slug-cased, e.g. "xl"
}
interface WooStoreApiVariationRef {
  id: number;
  attributes: WooStoreApiVariationAttribute[];
}
interface WooStoreApiProduct {
  id: number;
  name: string;
  slug: string;
  sku?: string;
  short_description: string;
  description?: string;
  on_sale: boolean;
  is_in_stock: boolean;
  categories: { id: number; name: string; slug: string }[];
  images: { src: string }[];
  attributes?: WooStoreApiAttribute[];
  variation?: boolean; // true if this product has variations
  type?: string; // 'simple' | 'variable' | ...
  /**
   * Only present on variable products. Each entry is one purchasable
   * variation with its own id and the attribute values that select it —
   * but NOT its own price/stock; the Store API requires a separate
   * request per variation for that, so we carry the id/options through
   * and fall back to the parent product's price/stock as a best effort.
   */
  variations?: WooStoreApiVariationRef[];
  average_rating?: string;
  review_count?: number;
  /** Already formatted by WooCommerce, e.g. "0.3 kg" — safest source for weight since it includes the unit. */
  formatted_weight?: string;
  prices: {
    price: string; // integer string in minor units, e.g. "250000"
    regular_price: string;
    sale_price: string;
    currency_minor_unit: number;
    currency_code: string;
  };
}

/**
 * Parses WooCommerce's `formatted_weight` ("0.3 kg", "1.2 lb") into a
 * kilogram figure. Returns undefined for lb (or anything not confidently
 * kg) rather than silently mis-converting — a wrong unit is worse than a
 * missing field.
 */
function parseWeightKg(formatted: string | undefined): number | undefined {
  if (!formatted) return undefined;
  const match = formatted.trim().match(/^([\d.]+)\s*kg$/i);
  if (!match) return undefined;
  const value = parseFloat(match[1]);
  return Number.isFinite(value) ? value : undefined;
}

function hasCredentials(config: WooCommerceProviderConfig) {
  return !!(
    config.consumerKeyEnv &&
    config.consumerSecretEnv &&
    process.env[config.consumerKeyEnv] &&
    process.env[config.consumerSecretEnv]
  );
}

/**
 * Resolves which WooCommerce API to hit for this config. Defaults to
 * auto-detection (credentials present → wc/v3, else the public Store API),
 * but an explicit apiMode always wins — e.g. to force store_v1 on a site
 * where wc/v3 technically works but returns worse data for some reason.
 */
function resolveApiMode(config: WooCommerceProviderConfig): 'wc_v3' | 'store_v1' {
  if (config.apiMode === 'wc_v3' || config.apiMode === 'store_v1') return config.apiMode;
  return hasCredentials(config) ? 'wc_v3' : 'store_v1';
}

function productUrl(baseUrl: string, slug: string): string {
  // WooCommerce's default product permalink structure. Sites with a custom
  // permalink structure will need a per-store override if this is ever
  // wrong — not worth a config option until a real site needs it.
  return `${baseUrl}/product/${slug}/`;
}

export function normaliseV3(p: WooV3Product, platform: string, currency: string, baseUrl: string): StoreProduct {
  const price = parseFloat(p.price || p.regular_price || '0');
  const compareAtPrice = p.on_sale && p.regular_price ? parseFloat(p.regular_price) : undefined;
  const images = p.images?.map((i) => i.src) ?? [];
  const tags = (p.tags ?? []).map((t) => t.name);
  const options: StoreProductOption[] = (p.attributes ?? []).map((a) => ({ name: a.name, values: a.options }));
  const rating = p.average_rating ? parseFloat(p.average_rating) : undefined;

  return {
    id: String(p.id),
    handle: p.slug,
    storeSlug: platform,
    name: p.name,
    image: images[0] ?? '',
    images,
    price,
    currency,
    compareAtPrice,
    onSale: p.on_sale,
    stockCount: null, // wc/v3 doesn't give a count, only in-stock/out-of-stock
    inStock: p.stock_status === 'instock',
    category: p.categories?.[0]?.name ?? 'General',
    condition: 'New',
    description: stripHtml(p.short_description ?? ''),
    seller: platform,
    url: productUrl(baseUrl, p.slug),
    tags: tags.length ? tags : undefined,
    options: options.length ? options : undefined,
    // wc/v3 lists attribute *choices* but not per-variant price/stock without
    // a second request per product (GET /products/{id}/variations) — not
    // worth the extra round trip for a catalog listing, so `variants` stays
    // unset here even for variable products. sizes/colors still work since
    // they only need the attribute names/values, not per-variant data.
    sizes: extractSizes(options),
    colors: extractColors(options),
    sku: p.sku || undefined,
    // wc/v3's bare `weight` string has no unit attached in this payload, so
    // we deliberately don't populate weightKg from it — only the Store API's
    // formatted_weight (which does carry a unit) is trusted for that.
    fullDescription: p.description ? stripHtml(p.description) : undefined,
    averageRating: rating != null && Number.isFinite(rating) && rating > 0 ? rating : undefined,
    reviewCount: p.rating_count,
  };
}

export function normaliseStoreApi(p: WooStoreApiProduct, platform: string, baseUrl: string): StoreProduct {
  const minor = 10 ** (p.prices?.currency_minor_unit ?? 2);
  const price = Number(p.prices?.price ?? '0') / minor;
  const regular = Number(p.prices?.regular_price ?? '0') / minor;
  const images = p.images?.map((i) => i.src) ?? [];
  const options: StoreProductOption[] = (p.attributes ?? []).map((a) => ({
    name: a.name,
    values: a.terms.map((t) => t.name),
  }));
  const rating = p.average_rating ? parseFloat(p.average_rating) : undefined;

  // The Store API's `variations` array gives id + selecting attribute values
  // per variation, but not price/stock (that needs a separate per-variation
  // request WooCommerce doesn't batch). Rather than leave `variants` unset
  // for variable products, we carry the real variation ids/options through
  // and fall back to the parent product's price/stock — good enough to let
  // a detail page build "Add to cart" links per size, even without exact
  // per-size price/stock.
  const variants =
    p.variations && p.variations.length
      ? p.variations.map((v) => ({
          id: String(v.id),
          title: v.attributes.map((a) => a.value).join(' / '),
          price,
          compareAtPrice: p.on_sale && regular > price ? regular : undefined,
          available: p.is_in_stock,
          options: p.attributes
            ? p.attributes.map(
                (attr) => v.attributes.find((va) => va.name.toLowerCase() === attr.name.toLowerCase())?.value ?? null
              )
            : v.attributes.map((a) => a.value),
        }))
      : undefined;

  return {
    id: String(p.id),
    handle: p.slug,
    storeSlug: platform,
    name: p.name,
    image: images[0] ?? '',
    images,
    price,
    currency: p.prices?.currency_code ?? 'USD',
    compareAtPrice: p.on_sale && regular > price ? regular : undefined,
    onSale: p.on_sale,
    inStock: p.is_in_stock,
    category: p.categories?.[0]?.name ?? 'General',
    stockCount: null, // Store API doesn't give a count, only in-stock/out-of-stock
    condition: 'New',
    description: stripHtml(p.short_description ?? ''),
    seller: platform,
    url: productUrl(baseUrl, p.slug),
    options: options.length ? options : undefined,
    variants,
    sizes: extractSizes(options),
    colors: extractColors(options),
    sku: p.sku || undefined,
    weightKg: parseWeightKg(p.formatted_weight),
    fullDescription: p.description ? stripHtml(p.description) : undefined,
    averageRating: rating != null && Number.isFinite(rating) && rating > 0 ? rating : undefined,
    reviewCount: p.review_count,
  };
}

function sortToWooParams(sort: ProviderFetchParams['sort']): { orderby: string; order: string } {
  if (sort === 'price-asc') return { orderby: 'price', order: 'asc' };
  if (sort === 'price-desc') return { orderby: 'price', order: 'desc' };
  return { orderby: 'date', order: 'desc' }; // 'newest' and 'sale' (sale sorted client-side below)
}

export async function fetchWooCommerceProducts(
  platform: string,
  config: WooCommerceProviderConfig,
  params: ProviderFetchParams
): Promise<ProviderFetchResult> {
  const currency = config.currency ?? 'USD';
  const categoryValue =
    (params.category ? config.categoryMap?.[params.category] : undefined) ?? config.fixedCategoryValue;
  const mode = resolveApiMode(config);

  if (mode === 'wc_v3') {
    if (!hasCredentials(config)) {
      throw new Error(`WooCommerce apiMode 'wc_v3' set for ${platform} but credentials are missing`);
    }
    const key = process.env[config.consumerKeyEnv!]!;
    const secret = process.env[config.consumerSecretEnv!]!;
    const auth = Buffer.from(`${key}:${secret}`).toString('base64');

    const { orderby, order } = sortToWooParams(params.sort);
    const qs = new URLSearchParams({
      page: String(params.page),
      per_page: String(params.perPage),
      orderby,
      order,
    });
    if (params.search) qs.set('search', params.search);
    if (categoryValue != null) qs.set('category', String(categoryValue));
    if (params.sort === 'sale') qs.set('on_sale', 'true');

    const res = await fetch(`${config.baseUrl}/wp-json/wc/v3/products?${qs}`, {
      headers: {
        ...HEADERS,
        Authorization: `Basic ${auth}`,
        ...config.headers,
      },
      next: { revalidate: CACHE_SECONDS },
    });
    if (!res.ok) throw new Error(`WooCommerce (wc/v3) for ${platform} returned ${res.status}`);

    const totalPages = Math.max(1, parseInt(res.headers.get('x-wp-totalpages') ?? '1', 10));
    const total = parseInt(res.headers.get('x-wp-total') ?? '0', 10);
    const data = (await res.json()) as WooV3Product[];

    return {
      products: data.map((p) => normaliseV3(p, platform, currency, config.baseUrl)),
      total: total || data.length,
      totalPages,
      // X-WP-Total is WooCommerce's real, exact product count — it's not
      // a per-page estimate, so this is trustworthy even when totalPages > 1.
      totalIsExact: true,
    };
  }

  // ── store_v1: public, keyless Store API ─────────────────────────────────
  const { orderby, order } = sortToWooParams(params.sort);
  const qs = new URLSearchParams({
    page: String(params.page),
    per_page: String(params.perPage),
    orderby,
    order,
  });
  if (params.search) qs.set('search', params.search);
  if (categoryValue != null) qs.set('category', String(categoryValue));

  const res = await fetch(`${config.baseUrl}/wp-json/wc/store/v1/products?${qs}`, {
    headers: {
      ...HEADERS,
      ...config.headers,
    },
    next: { revalidate: CACHE_SECONDS },
  });
  if (!res.ok) throw new Error(`WooCommerce (store API) for ${platform} returned ${res.status}`);

  const totalPages = Math.max(1, parseInt(res.headers.get('x-wp-totalpages') ?? '1', 10));
  const total = parseInt(res.headers.get('x-wp-total') ?? '0', 10);
  const data = (await res.json()) as WooStoreApiProduct[];

  let products = data.map((p) => normaliseStoreApi(p, platform, config.baseUrl));
  if (params.sort === 'sale') {
    products = [...products].sort((a, b) => Number(!!b.onSale) - Number(!!a.onSale));
  }

  return {
    products,
    total: total || products.length,
    totalPages,
    // Same as the wc/v3 branch above — X-WP-Total is exact.
    totalIsExact: true,
  };
}

// ── Per-variation detail (single-product page only) ─────────────────────────

interface WooV3VariationDetail {
  id: number;
  sku?: string;
  price: string;
  regular_price: string;
  sale_price: string;
  stock_status: 'instock' | 'outofstock' | 'onbackorder';
  attributes?: { name: string; option: string }[];
}

interface WooStoreApiVariationDetail {
  id: number;
  sku?: string;
  is_in_stock: boolean;
  attributes?: { name: string; value: string }[];
  prices: {
    price: string;
    regular_price: string;
    currency_minor_unit: number;
  };
}

/** Real per-variant price/stock, keyed by variation id (as string, matching StoreProductVariant.id).
 * Also carries each variation's raw attribute name/option pairs (`attributes`) — the caller needs
 * these to build a `.options` array aligned to the parent product's attribute order, the same way
 * normaliseStoreApi already does for the Store API path below. Previously this was left out and the
 * caller hardcoded `options: []` on every variant, which made buildStoreVariantDimensions (parsers.ts)
 * unable to match ANY variant to ANY size/color label — every tile silently rendered as out of stock. */
interface WooV3VariationDetailEntry {
  price: number;
  compareAtPrice?: number;
  available: boolean;
  title: string;
  attributes: { name: string; option: string }[];
}

async function fetchWooV3VariationDetails(
  config: WooCommerceProviderConfig,
  parentId: number
): Promise<Map<string, WooV3VariationDetailEntry>> {
  const key = process.env[config.consumerKeyEnv!]!;
  const secret = process.env[config.consumerSecretEnv!]!;
  const auth = Buffer.from(`${key}:${secret}`).toString('base64');

  const res = await fetch(`${config.baseUrl}/wp-json/wc/v3/products/${parentId}/variations?per_page=100`, {
    headers: { ...HEADERS, Authorization: `Basic ${auth}`, ...config.headers },
    next: { revalidate: CACHE_SECONDS },
  });
  if (!res.ok) return new Map();

  const data = (await res.json()) as WooV3VariationDetail[];
  const map = new Map<string, WooV3VariationDetailEntry>();
  for (const v of data) {
    const price = parseFloat(v.price || v.regular_price || '0');
    const compareAtPrice = v.sale_price && v.price !== v.regular_price ? parseFloat(v.regular_price) : undefined;
    const attributes = v.attributes ?? [];
    const title = attributes.map((a) => a.option).join(' / ') || String(v.id);
    map.set(String(v.id), { price, compareAtPrice, available: v.stock_status === 'instock', title, attributes });
  }
  return map;
}

async function fetchStoreApiVariationDetails(
  config: WooCommerceProviderConfig,
  parentId: number
): Promise<Map<string, { price: number; compareAtPrice?: number; available: boolean }>> {
  const qs = new URLSearchParams({ type: 'variation', parent: String(parentId), per_page: '100' });
  const res = await fetch(`${config.baseUrl}/wp-json/wc/store/v1/products?${qs}`, {
    headers: { ...HEADERS, ...config.headers },
    next: { revalidate: CACHE_SECONDS },
  });
  if (!res.ok) return new Map();

  const data = (await res.json()) as WooStoreApiVariationDetail[];
  const map = new Map<string, { price: number; compareAtPrice?: number; available: boolean }>();
  for (const v of data) {
    const minor = 10 ** (v.prices?.currency_minor_unit ?? 2);
    const price = Number(v.prices?.price ?? '0') / minor;
    const regular = Number(v.prices?.regular_price ?? '0') / minor;
    map.set(String(v.id), {
      price,
      compareAtPrice: regular > price ? regular : undefined,
      available: v.is_in_stock,
    });
  }
  return map;
}


export async function fetchWooCommerceProduct(
  platform: string,
  config: WooCommerceProviderConfig,
  handle: string
): Promise<StoreProduct | null> {
  const currency = config.currency ?? 'USD';
  const mode = resolveApiMode(config);

  if (mode === 'wc_v3') {
    if (!hasCredentials(config)) {
      throw new Error(`WooCommerce apiMode 'wc_v3' set for ${platform} but credentials are missing`);
    }
    const key = process.env[config.consumerKeyEnv!]!;
    const secret = process.env[config.consumerSecretEnv!]!;
    const auth = Buffer.from(`${key}:${secret}`).toString('base64');

    const qs = new URLSearchParams({ slug: handle });
    const res = await fetch(`${config.baseUrl}/wp-json/wc/v3/products?${qs}`, {
      headers: {
        ...HEADERS,
        Authorization: `Basic ${auth}`,
        ...config.headers,
      },
      next: { revalidate: CACHE_SECONDS },
    });
    if (!res.ok) throw new Error(`WooCommerce (wc/v3) product fetch for ${platform}/${handle} returned ${res.status}`);

    const data = (await res.json()) as WooV3Product[];
    const found = data[0];
    if (!found) return null;

    const product = normaliseV3(found, platform, currency, config.baseUrl);

    if (found.type === 'variable') {
      const detailMap = await fetchWooV3VariationDetails(config, found.id);
      if (detailMap.size) {
        // Align each variation's own attribute values to product.options'
        // axis order (Size, Color, ...) — same approach normaliseStoreApi
        // uses for the Store API path. This is what lets
        // buildStoreVariantDimensions (parsers.ts) match a size/color
        // label back to the right variant; leaving this as `[]` (the
        // previous behavior) meant no variant could ever be matched, so
        // every tile rendered as out of stock regardless of real
        // availability.
        product.variants = Array.from(detailMap.entries()).map(([id, d]) => ({
          id,
          title: d.title,
          price: d.price,
          compareAtPrice: d.compareAtPrice,
          available: d.available,
          options: product.options
            ? product.options.map(
                (attr) =>
                  d.attributes.find((va) => va.name.toLowerCase() === attr.name.toLowerCase())?.option ?? null
              )
            : d.attributes.map((a) => a.option),
        }));
      }
    }

    return product;
  }

  const qs = new URLSearchParams({ slug: handle });
  const res = await fetch(`${config.baseUrl}/wp-json/wc/store/v1/products?${qs}`, {
    headers: {
      ...HEADERS,
      ...config.headers,
    },
    next: { revalidate: CACHE_SECONDS },
  });
  if (!res.ok) throw new Error(`WooCommerce (store API) product fetch for ${platform}/${handle} returned ${res.status}`);

  const data = (await res.json()) as WooStoreApiProduct[];
  const found = data[0];
  if (!found) return null;

  const product = normaliseStoreApi(found, platform, config.baseUrl);

  if (product.variants?.length) {
    const detailMap = await fetchStoreApiVariationDetails(config, found.id);
    if (detailMap.size) {
      product.variants = product.variants.map((v) => {
        const detail = detailMap.get(v.id);
        return detail
          ? { ...v, price: detail.price, compareAtPrice: detail.compareAtPrice, available: detail.available }
          : v;
      });
    }
  }

  return product;
}


// ── Real category taxonomy (for building categoryMap from live data) ────────

export interface WooCategorySummary {
  id: number;
  name: string;
  slug: string;
  count: number;
  /**
   * Category thumbnail URL, or null when the category has no image set.
   * Flattened from WooCommerce's image object: the Store API returns
   * { src, thumbnail, ... } (thumbnail is ~430px), wc/v3 returns
   * { src, ... } only. Thumbnail is preferred so we never ship a
   * 2000px+ original into a 28–36px avatar.
   */
  image: string | null;
}

/** Raw category row as returned by both wc/v3 and the Store API. */
interface WooRawCategory {
  id: number;
  name: string;
  slug: string;
  count: number;
  image?: { src?: string; thumbnail?: string } | null;
}

function toCategorySummary(c: WooRawCategory): WooCategorySummary {
  return {
    id: c.id,
    name: c.name,
    slug: c.slug,
    count: c.count,
    image: c.image?.thumbnail || c.image?.src || null,
  };
}

/**
 * Fetches the store's REAL product categories — not guessed, not typed by
 * hand. Uses the public store_v1 endpoint (no credentials needed) by
 * default, matching the same unauthenticated pattern as
 * fetchWooCommerceProducts' store_v1 branch; falls back to wc_v3 only if
 * credentials are configured AND apiMode explicitly forces it, since the
 * public endpoint already returns everything needed (id/name/slug/count/
 * image) without requiring secrets.
 *
 * Use this output to build categoryMap in store-config.ts and `categories`
 * in data/stores/data.ts from real data, instead of hand-typing labels
 * that can silently drift from what the store actually has — the same
 * class of bug fixed for Shopify via fetchShopifyCollections.
 *
 * Returns [] on any failure rather than throwing, so callers can treat an
 * empty result as "couldn't confirm real categories" and fall back
 * gracefully.
 */
export async function fetchWooCommerceCategories(
  config: WooCommerceProviderConfig
): Promise<WooCategorySummary[]> {
  const mode = resolveApiMode(config);
  const categories: WooCategorySummary[] = [];
  const perPage = 100;
  let page = 1;

  try {
    if (mode === 'wc_v3' && hasCredentials(config)) {
      const key = process.env[config.consumerKeyEnv!]!;
      const secret = process.env[config.consumerSecretEnv!]!;
      const auth = Buffer.from(`${key}:${secret}`).toString('base64');

      while (true) {
        const qs = new URLSearchParams({ page: String(page), per_page: String(perPage) });
        const res = await fetch(`${config.baseUrl}/wp-json/wc/v3/products/categories?${qs}`, {
          headers: { ...HEADERS, Authorization: `Basic ${auth}`, ...config.headers },
          next: { revalidate: CACHE_SECONDS },
        });
        if (!res.ok) break;
        const batch = (await res.json()) as WooRawCategory[];
        categories.push(...batch.map(toCategorySummary));
        if (batch.length < perPage) break;
        page += 1;
        if (page > 20) break; // safety cap
      }
    } else {
      // Public store_v1 endpoint — no auth required, works on any
      // WooCommerce site with the Store API enabled (same requirement
      // fetchWooCommerceProducts' store_v1 branch already depends on).
      while (true) {
        const qs = new URLSearchParams({ page: String(page), per_page: String(perPage) });
        const res = await fetch(`${config.baseUrl}/wp-json/wc/store/v1/products/categories?${qs}`, {
          headers: { ...HEADERS, ...config.headers },
          next: { revalidate: CACHE_SECONDS },
        });
        if (!res.ok) break;
        const batch = (await res.json()) as WooRawCategory[];
        categories.push(...batch.map(toCategorySummary));
        if (batch.length < perPage) break;
        page += 1;
        if (page > 20) break;
      }
    }
  } catch {
    return categories; // return whatever we already collected on network failure
  }

  return categories;
}

/**
 * Ground truth for a WooCommerce store's currency, via the public Store
 * API's cart endpoint. Mirrors fetchShopifyShopCurrency's approach:
 * neither store_v1's product list nor wc/v3's product objects carry a
 * currency field on their own (store_v1 does put currency_code inside
 * each product's `prices` block, but wc/v3 has nothing at all — see
 * normaliseV3, which takes currency purely from config). /cart.js has no
 * WooCommerce equivalent, but /wp-json/wc/store/v1/cart is the same idea:
 * unauthenticated, present on any site with the Store API enabled, and
 * always reflects the shop's real configured currency.
 *
 * Returns null on any failure so callers can fall back to a configured/
 * typed value rather than this becoming a hard failure.
 */
export async function fetchWooCommerceCurrency(
  baseUrl: string,
  headers: Record<string, string> = {}
): Promise<string | null> {
  try {
    const res = await fetch(`${baseUrl}/wp-json/wc/store/v1/cart`, {
      headers: { ...HEADERS, ...headers },
      next: { revalidate: CACHE_SECONDS },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { totals?: { currency_code?: string } };
    const code = data.totals?.currency_code;
    return typeof code === 'string' && code.trim() ? code.trim() : null;
  } catch {
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Catalog cache ("fetch the whole catalog once, filter locally")
//
// Everything above this line is the original live-request behaviour.
// Everything below is only used if a caller switches to the *Cached functions:
//
//   fetchWooCommerceProducts  ->  fetchWooCommerceProductsCached
//   fetchWooCommerceProduct   ->  fetchWooCommerceProductCached
//
// Why: on a firewalled store every distinct URL is a separate paid Firecrawl
// call (each page / sort / search / category combination is its own cache
// key). This layer downloads the catalog once (per_page=100, so a 250-product
// store is 3 requests), keeps it in memory, and answers search, sort,
// category and pagination locally. A product page is then looked up in the
// catalog by slug instead of costing its own request; only the per-variation
// prices/stock still need one request, and that is memoised too.
//
// Safety nets: if the catalog can't be used (request failed, store too large,
// product not in the catalog yet) the functions fall back to the original
// live behaviour — EXCEPT when the store is behind Firecrawl. In that case a
// live fallback costs a credit per page and trips the rate limit, so the
// functions throw (or return null for an unknown slug) instead. See
// liveFallbackAllowed().
//
// Env (all optional):
//   WOO_CATALOG_TTL_SECONDS               fresh time in memory. Default 600.
//   WOO_CATALOG_STALE_SECONDS             serve an expired copy this long if the
//                                         refresh fails. Default 86400.
//   WOO_CATALOG_MAX_PAGES                 pages of 100 to download before giving
//                                         up and using live requests. Default 10.
//   WOO_CATALOG_FAILURE_COOLDOWN_SECONDS  after a failed load, don't retry the
//                                         catalog for this long. Default 30.
//   WOO_CATALOG_LOCAL_CATEGORY=false      send category-filtered lists to the live
//                                         path instead of filtering locally.
// ═══════════════════════════════════════════════════════════════════════════

type WooRawProduct = WooV3Product | WooStoreApiProduct;

type WooCatalog =
  | { mode: 'wc_v3'; raw: WooV3Product[]; products: StoreProduct[]; tooLarge: boolean }
  | { mode: 'store_v1'; raw: WooStoreApiProduct[]; products: StoreProduct[]; tooLarge: boolean };

const envNumber = (name: string, fallback: number): number => {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

const catalogTtlMs = () => envNumber('WOO_CATALOG_TTL_SECONDS', 600) * 1000;
const catalogStaleMs = () => envNumber('WOO_CATALOG_STALE_SECONDS', 86400) * 1000;

/**
 * Whether a per-page live request is an acceptable fallback when the catalog
 * is unavailable. When the store is behind Firecrawl it is NOT: every live
 * request is a paid credit and, during an outage, N visitors become N calls
 * that trip the rate limit. Better to fail visibly (or 404 an unknown slug).
 */
const liveFallbackAllowed = (config: WooCommerceProviderConfig): boolean => {
  try {
    return !hostUsesFirecrawl(new URL(config.baseUrl).hostname);
  } catch {
    return true;
  }
};

// ── tiny in-memory memo: in-flight dedupe + serve-stale-on-error ────────────
const memoStore = new Map<string, { value: unknown; at: number }>();
const memoInflight = new Map<string, Promise<unknown>>();
const MEMO_MAX_ENTRIES = 1000;

async function memoAsync<T>(key: string, ttlMs: number, staleMs: number, loader: () => Promise<T>): Promise<T> {
  const hit = memoStore.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.value as T;

  const running = memoInflight.get(key);
  if (running) return running as Promise<T>;

  const promise = (async () => {
    try {
      const value = await loader();
      if (memoStore.size >= MEMO_MAX_ENTRIES) {
        const oldest = memoStore.keys().next().value;
        if (oldest !== undefined) memoStore.delete(oldest);
      }
      memoStore.set(key, { value, at: Date.now() });
      return value;
    } catch (err) {
      if (hit && Date.now() - hit.at < staleMs) {
        console.warn('[woo catalog] refresh failed, serving stale copy:', (err as Error).message);
        return hit.value as T;
      }
      throw err;
    } finally {
      memoInflight.delete(key);
    }
  })();
  memoInflight.set(key, promise);
  return promise;
}

// ── catalog loading ─────────────────────────────────────────────────────────
async function loadWooCatalog(
  platform: string,
  config: WooCommerceProviderConfig,
  mode: 'wc_v3' | 'store_v1'
): Promise<WooCatalog> {
  const currency = config.currency ?? 'USD';
  const perPage = 100;
  const maxPages = Math.max(1, Math.floor(envNumber('WOO_CATALOG_MAX_PAGES', 10)));

  let headers: Record<string, string>;
  let path: string;
  if (mode === 'wc_v3') {
    const key = process.env[config.consumerKeyEnv!]!;
    const secret = process.env[config.consumerSecretEnv!]!;
    const auth = Buffer.from(`${key}:${secret}`).toString('base64');
    headers = { ...HEADERS, Authorization: `Basic ${auth}`, ...config.headers };
    path = '/wp-json/wc/v3/products';
  } else {
    headers = { ...HEADERS, ...config.headers };
    path = '/wp-json/wc/store/v1/products';
  }

  const rows: { id: number }[] = [];
  const seen = new Set<number>();
  let tooLarge = false;

  for (let page = 1; ; page += 1) {
    if (page > maxPages) {
      tooLarge = true;
      break;
    }
    // Same query as the live list (newest first), so catalog order == live 'newest' order.
    const qs = new URLSearchParams({ page: String(page), per_page: String(perPage), orderby: 'date', order: 'desc' });
    const res = await fetch(`${config.baseUrl}${path}?${qs}`, { headers, next: { revalidate: CACHE_SECONDS } });
    if (!res.ok) throw new Error(`WooCommerce catalog (${mode}) for ${platform} returned ${res.status}`);

    const batch = (await res.json()) as unknown;
    if (!Array.isArray(batch)) throw new Error(`WooCommerce catalog (${mode}) for ${platform} returned a non-list response`);
    for (const row of batch as { id: number }[]) {
      // A product published mid-download can shift pages and repeat a row.
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      rows.push(row);
    }

    if (batch.length < perPage) break; // short page = last page (the only signal Firecrawl responses give)
    const totalPages = parseInt(res.headers.get('x-wp-totalpages') ?? '', 10);
    if (Number.isFinite(totalPages) && totalPages > 0 && page >= totalPages) break;
  }

  if (mode === 'wc_v3') {
    const raw = tooLarge ? [] : (rows as WooV3Product[]);
    return {
      mode,
      raw,
      products: raw.map((p) => normaliseV3(p, platform, currency, config.baseUrl)),
      tooLarge,
    };
  }
  const raw = tooLarge ? [] : (rows as WooStoreApiProduct[]);
  return {
    mode,
    raw,
    products: raw.map((p) => normaliseStoreApi(p, platform, config.baseUrl)),
    tooLarge,
  };
}

const catalogCooldown = new Map<string, number>();

async function getWooCatalog(platform: string, config: WooCommerceProviderConfig): Promise<WooCatalog> {
  const mode = resolveApiMode(config);
  if (mode === 'wc_v3' && !hasCredentials(config)) {
    throw new Error(`WooCommerce apiMode 'wc_v3' set for ${platform} but credentials are missing`);
  }
  const key = `catalog|${config.baseUrl}|${mode}`;
  if ((catalogCooldown.get(key) ?? 0) > Date.now()) {
    throw new Error(`WooCommerce catalog for ${platform} is cooling down after a failed load`);
  }
  try {
    return await memoAsync(key, catalogTtlMs(), catalogStaleMs(), () => loadWooCatalog(platform, config, mode));
  } catch (err) {
    catalogCooldown.set(key, Date.now() + envNumber('WOO_CATALOG_FAILURE_COOLDOWN_SECONDS', 30) * 1000);
    throw err;
  }
}

/** Drops the cached catalog (and variation details) for one store, or everything when no baseUrl is given. */
export function invalidateWooCommerceCatalog(baseUrl?: string): void {
  for (const key of Array.from(memoStore.keys())) {
    if (!baseUrl || key.includes(`|${baseUrl}|`)) memoStore.delete(key);
  }
  for (const key of Array.from(catalogCooldown.keys())) {
    if (!baseUrl || key.includes(`|${baseUrl}|`)) catalogCooldown.delete(key);
  }
}

/** The whole catalog, normalised (newest first). Throws if it can't be loaded or is too large. */
export async function fetchWooCommerceCatalog(
  platform: string,
  config: WooCommerceProviderConfig
): Promise<StoreProduct[]> {
  const catalog = await getWooCatalog(platform, config);
  if (catalog.tooLarge) throw new Error(`WooCommerce catalog for ${platform} is too large to cache (WOO_CATALOG_MAX_PAGES)`);
  return catalog.products;
}

// ── local query: search / category / sort / pagination ──────────────────────
function rawCategories(p: WooRawProduct): { id: number; name: string; slug?: string }[] {
  return (p.categories ?? []) as { id: number; name: string; slug?: string }[];
}

const haystackCache = new WeakMap<object, string>();
function searchHaystack(p: WooRawProduct): string {
  const cached = haystackCache.get(p);
  if (cached !== undefined) return cached;
  const tags = ((p as WooV3Product).tags ?? []).map((t) => t.name);
  const text = [p.name, stripHtml(p.short_description ?? ''), p.sku ?? '', ...rawCategories(p).map((c) => c.name), ...tags]
    .join(' ')
    .toLowerCase();
  haystackCache.set(p, text);
  return text;
}

function queryWooCatalog(
  catalog: WooCatalog,
  config: WooCommerceProviderConfig,
  params: ProviderFetchParams
): ProviderFetchResult {
  const raws = catalog.raw as WooRawProduct[];

  // Which categories to keep. The client sends the REAL category handle
  // (slug) taken from the live category list, which is usually NOT a key in
  // config.categoryMap. Previously an unmapped handle resolved to
  // `undefined`, no filter was applied, and every category showed the full
  // catalog. Resolution order now:
  //   1. categoryMap[params.category]   (explicit mapping, may be "1,2,3")
  //   2. params.category itself         (real slug / id / name from the UI)
  //   3. config.fixedCategoryValue      (store-wide restriction, no UI choice)
  const mapped = params.category ? config.categoryMap?.[params.category] : undefined;
  let wantedCategories: string[];
  if (mapped != null) {
    wantedCategories = String(mapped).split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  } else if (params.category) {
    wantedCategories = [params.category.trim().toLowerCase()];
  } else if (config.fixedCategoryValue != null) {
    wantedCategories = String(config.fixedCategoryValue).split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  } else {
    wantedCategories = [];
  }
  const terms = (params.search ?? '').toLowerCase().split(/\s+/).filter(Boolean);

  let rows = catalog.products.map((product, i) => ({ product, raw: raws[i] }));

  if (wantedCategories.length) {
    rows = rows.filter(({ raw }) =>
      rawCategories(raw).some(
        (c) =>
          wantedCategories.includes(String(c.id)) ||
          (!!c.slug && wantedCategories.includes(c.slug.toLowerCase())) ||
          (!!c.name && wantedCategories.includes(c.name.trim().toLowerCase()))
      )
    );
  }
  if (terms.length) {
    rows = rows.filter(({ raw }) => {
      const haystack = searchHaystack(raw);
      return terms.every((t) => haystack.includes(t));
    });
  }

  if (params.sort === 'price-asc') {
    rows = [...rows].sort((a, b) => a.product.price - b.product.price);
  } else if (params.sort === 'price-desc') {
    rows = [...rows].sort((a, b) => b.product.price - a.product.price);
  } else if (params.sort === 'sale') {
    // Mirrors the live behaviour: wc/v3 filters to on-sale, the Store API only sorts on-sale first.
    rows =
      catalog.mode === 'wc_v3'
        ? rows.filter(({ product }) => !!product.onSale)
        : [...rows].sort((a, b) => Number(!!b.product.onSale) - Number(!!a.product.onSale));
  }
  // 'newest' (and anything else) keeps catalog order, which is already newest first.

  const perPage = Math.max(1, params.perPage);
  const page = Math.max(1, params.page);
  const total = rows.length;
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const start = (page - 1) * perPage;

  return {
    products: rows.slice(start, start + perPage).map((r) => r.product),
    total,
    totalPages,
    totalIsExact: true,
  };
}

/**
 * Drop-in for fetchWooCommerceProducts: same arguments, same result shape,
 * but answered from the cached catalog. Falls back to the live request when
 * the catalog is unavailable or too large — unless the store is behind
 * Firecrawl, where it throws instead (see liveFallbackAllowed).
 */
export async function fetchWooCommerceProductsCached(
  platform: string,
  config: WooCommerceProviderConfig,
  params: ProviderFetchParams
): Promise<ProviderFetchResult> {
  const categoryRequested =
    !!params.category ||
    ((params.category ? config.categoryMap?.[params.category] : undefined) ?? config.fixedCategoryValue) != null;
  if (categoryRequested && process.env.WOO_CATALOG_LOCAL_CATEGORY === 'false') {
    return fetchWooCommerceProducts(platform, config, params);
  }

  let catalog: WooCatalog;
  try {
    catalog = await getWooCatalog(platform, config);
  } catch (err) {
    if (!liveFallbackAllowed(config)) throw err;
    console.warn(`[woo catalog] ${platform}: catalog unavailable, using live request:`, (err as Error).message);
    return fetchWooCommerceProducts(platform, config, params);
  }
  if (catalog.tooLarge) {
    if (!liveFallbackAllowed(config)) {
      throw new Error(`WooCommerce catalog for ${platform} is too large to cache`);
    }
    return fetchWooCommerceProducts(platform, config, params);
  }

  return queryWooCatalog(catalog, config, params);
}

/**
 * Drop-in for fetchWooCommerceProduct: finds the product in the cached
 * catalog by slug (no request of its own), then loads its per-variation
 * price/stock (memoised). A slug that isn't in the catalog yet falls back to
 * the live lookup so products added after the last refresh still resolve —
 * except for Firecrawl-backed stores, where it returns null (404) so random
 * or bot-generated URLs can't cost credits.
 */
export async function fetchWooCommerceProductCached(
  platform: string,
  config: WooCommerceProviderConfig,
  handle: string
): Promise<StoreProduct | null> {
  let catalog: WooCatalog;
  try {
    catalog = await getWooCatalog(platform, config);
  } catch (err) {
    if (!liveFallbackAllowed(config)) throw err;
    console.warn(`[woo catalog] ${platform}: catalog unavailable, using live request:`, (err as Error).message);
    return fetchWooCommerceProduct(platform, config, handle);
  }
  if (catalog.tooLarge) {
    if (!liveFallbackAllowed(config)) {
      throw new Error(`WooCommerce catalog for ${platform} is too large to cache`);
    }
    return fetchWooCommerceProduct(platform, config, handle);
  }

  const currency = config.currency ?? 'USD';
  const ttl = catalogTtlMs();
  const stale = catalogStaleMs();

  // An empty variation result usually means that request failed (the helpers
  // return an empty Map on error) — don't keep it for the whole TTL.
  const memoVariations = async <T extends Map<string, unknown>>(key: string, loader: () => Promise<T>): Promise<T> => {
    const result = await memoAsync(key, ttl, stale, loader);
    if (result.size === 0) memoStore.delete(key);
    return result;
  };

  if (catalog.mode === 'wc_v3') {
    const found = catalog.raw.find((p) => p.slug === handle);
    if (!found) return liveFallbackAllowed(config) ? fetchWooCommerceProduct(platform, config, handle) : null;

    // Normalise fresh: the original code mutates `variants`, and the catalog's copy is shared.
    const product = normaliseV3(found, platform, currency, config.baseUrl);
    if (found.type === 'variable') {
      const detailMap = await memoVariations(`variations|${config.baseUrl}|wc_v3|${found.id}`, () =>
        fetchWooV3VariationDetails(config, found.id)
      );
      if (detailMap.size) {
        product.variants = Array.from(detailMap.entries()).map(([id, d]) => ({
          id,
          title: d.title,
          price: d.price,
          compareAtPrice: d.compareAtPrice,
          available: d.available,
          options: product.options
            ? product.options.map(
                (attr) =>
                  d.attributes.find((va) => va.name.toLowerCase() === attr.name.toLowerCase())?.option ?? null
              )
            : d.attributes.map((a) => a.option),
        }));
      }
    }
    return product;
  }

  const found = catalog.raw.find((p) => p.slug === handle);
  if (!found) return liveFallbackAllowed(config) ? fetchWooCommerceProduct(platform, config, handle) : null;

  const product = normaliseStoreApi(found, platform, config.baseUrl);
  if (product.variants?.length) {
    const detailMap = await memoVariations(`variations|${config.baseUrl}|store_v1|${found.id}`, () =>
      fetchStoreApiVariationDetails(config, found.id)
    );
    if (detailMap.size) {
      product.variants = product.variants.map((v) => {
        const detail = detailMap.get(v.id);
        return detail
          ? { ...v, price: detail.price, compareAtPrice: detail.compareAtPrice, available: detail.available }
          : v;
      });
    }
  }
  return product;
}