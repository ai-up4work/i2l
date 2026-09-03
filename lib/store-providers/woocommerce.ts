// lib/store-providers/woocommerce.ts
import type { StoreProduct, StoreProductOption } from '@/lib/store.types';
import type { WooCommerceProviderConfig } from '@/lib/store-config';
import type { ProviderFetchParams, ProviderFetchResult } from './types';
import { extractColors, extractSizes, stripHtml } from './types';

const CACHE_SECONDS = 60 * 10;

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
        Authorization: `Basic ${auth}`,
        Accept: 'application/json',
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
      Accept: 'application/json',
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

  return { products, total: total || products.length, totalPages };
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
async function fetchWooV3VariationDetails(
  config: WooCommerceProviderConfig,
  parentId: number
): Promise<
  Map<
    string,
    {
      price: number
      compareAtPrice?: number
      available: boolean
      title: string
      attributes: { name: string; option: string }[]
    }
  >
> {
  const key = process.env[config.consumerKeyEnv!]!;
  const secret = process.env[config.consumerSecretEnv!]!;
  const auth = Buffer.from(`${key}:${secret}`).toString('base64');

  const res = await fetch(`${config.baseUrl}/wp-json/wc/v3/products/${parentId}/variations?per_page=100`, {
    headers: { Authorization: `Basic ${auth}`, Accept: 'application/json', ...config.headers },
    next: { revalidate: CACHE_SECONDS },
  });
  if (!res.ok) return new Map();

  const data = (await res.json()) as WooV3VariationDetail[];
  const map = new Map<
    string,
    {
      price: number
      compareAtPrice?: number
      available: boolean
      title: string
      attributes: { name: string; option: string }[]
    }
  >();
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
    headers: { Accept: 'application/json', ...config.headers },
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
        Authorization: `Basic ${auth}`,
        Accept: 'application/json',
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
      Accept: 'application/json',
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