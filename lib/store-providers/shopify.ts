// lib/store-providers/shopify.ts
import type { StoreProduct } from '@/lib/store.types';
import type { ShopifyProviderConfig } from '@/lib/store-config';
import type { ProviderFetchParams, ProviderFetchResult } from './types';
import { applySort, detectGender, extractColors, extractSizes, stripHtml } from './types';

const CACHE_SECONDS = 60 * 60 * 24; // 24 hours
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (compatible; StoreCatalog/1.0)',
  Accept: 'application/json',
};

/**
 * Synonym map for option axes that functionally mean "size" or "color"
 * but aren't spelled that way on every storefront — e.g. perfectcollections.shop
 * uses "Measurements" (values like "S - 36") instead of "Size". This is
 * purely a *rename* applied to the raw options array before anything
 * downstream (extractSizes, extractColors, the product page's
 * optionAvailability) ever sees it. Those all still match on the literal
 * strings "Size"/"Color" — nothing about them changes here. For a store
 * that already names its option "Size" or "Color", the rename below is a
 * no-op, so existing working stores (e.g. Santhiya Fashions) are
 * unaffected.
 *
 * Extend this map as more synonyms turn up in the wild rather than
 * hardcoding a new exact-match branch somewhere else.
 */
const OPTION_NAME_ALIASES: Record<string, string> = {
  measurement: 'Size',
  measurements: 'Size',
  sizes: 'Size',
  colour: 'Color',
  colours: 'Color',
  shade: 'Color',
  shades: 'Color',
};

function normaliseOptionName(name: string): string {
  const canonical = OPTION_NAME_ALIASES[name.trim().toLowerCase()];
  return canonical ?? name;
}

/**
 * Shopify's CDN URLs frequently come back protocol-relative ("//cdn.shopify.com/...")
 * on the .js endpoint (and occasionally elsewhere). Browsers resolve that fine against
 * an https page, but we sometimes use these URLs server-side / in <img src> before
 * that resolution happens, so normalise explicitly rather than relying on context.
 */
function normaliseImageUrl(src: string): string {
  return src.startsWith('//') ? `https:${src}` : src;
}

interface ShopifyImage {
  id?: number;
  src: string;
}
interface ShopifyVariant {
  id: number;
  title: string;
  price: string;
  compare_at_price: string | null;
  available: boolean;
  option1: string | null;
  option2: string | null;
  option3: string | null;
  sku?: string;
  /** Weight in grams — Shopify's public feed is consistently grams regardless of the shop's display unit, so this converts safely. */
  grams?: number;
  /**
   * REST /products/{handle}.json doesn't embed the variant's photo inline —
   * it only gives an image_id that has to be cross-referenced against the
   * product's top-level `images` array. (Contrast with .js, which embeds
   * the full image object directly on the variant — see ShopifyJsVariant.)
   */
  image_id?: number | null;
}
interface ShopifyOption {
  name: string;
  values: string[];
}
interface ShopifyProduct {
  id: number;
  title: string;
  handle: string;
  body_html: string;
  product_type: string;
  vendor: string;
  tags: string[] | string;
  options: ShopifyOption[];
  variants: ShopifyVariant[];
  images: ShopifyImage[];
  image: ShopifyImage | null;
}
interface ShopifyProductsResponse {
  products: ShopifyProduct[];
}

/**
 * Shape of Shopify's public `/products/{handle}.js` endpoint (the Ajax
 * cart/product-JS endpoint), as opposed to `/products/{handle}.json`.
 *
 * This is used ONLY for the single-product lookup (fetchShopifyProduct),
 * not the listing endpoint. Reason: `.json` product objects on some
 * stores/themes simply omit `available` on each variant (it's not part of
 * that endpoint's guaranteed schema), which silently makes every variant
 * look unavailable downstream — every size/color renders crossed-out and
 * the whole product renders "Sold out" even when it's actually in stock.
 * `.js` reliably includes `available` at both the product and per-variant
 * level, so the product detail page (which needs real per-variant
 * availability for the size/color picker) uses this instead.
 *
 * It also conveniently embeds each variant's own photo directly
 * (`featured_image`), which we use to render real per-color swatch photos
 * — see normaliseShopifyJsProduct / the product page's ColorSwatch.
 *
 * Key schema differences from `.json` that the normaliser below accounts
 * for:
 * - price / compare_at_price are integer cents here, not decimal strings.
 * - images is an array of URL strings, not `{ src }` objects.
 * - featured_image is a URL string, not `{ src }`.
 * - body copy lives in `description`, not `body_html`.
 * - product category lives in `type`, not `product_type`.
 * - tags is always an array here (never a comma-joined string).
 * - image URLs frequently come back protocol-relative ("//cdn...").
 */
interface ShopifyJsVariant {
  id: number;
  title: string;
  option1: string | null;
  option2: string | null;
  option3: string | null;
  price: number; // cents
  compare_at_price: number | null; // cents
  available: boolean;
  sku?: string | null;
  grams?: number;
  featured_image?: { src: string } | null;
}
interface ShopifyJsOption {
  name: string;
  position: number;
  values: string[];
}
interface ShopifyJsProduct {
  id: number;
  title: string;
  handle: string;
  description: string;
  type: string;
  vendor: string;
  tags: string[];
  price: number; // cents
  compare_at_price: number | null; // cents
  available: boolean;
  options: ShopifyJsOption[];
  variants: ShopifyJsVariant[];
  images: string[];
  featured_image: string | null;
}

function normaliseTags(tags: string[] | string): string[] {
  if (Array.isArray(tags)) return tags;
  return tags ? tags.split(',').map((t) => t.trim()).filter(Boolean) : [];
}

export function normaliseShopifyProduct(
  p: ShopifyProduct,
  platform: string,
  currency: string,
  seller: string,
  config: ShopifyProviderConfig
): StoreProduct {
  const variant = p.variants?.[0];
  const price = variant ? parseFloat(variant.price) : 0;
  const compareAtPrice = variant?.compare_at_price ? parseFloat(variant.compare_at_price) : undefined;
  const images = (p.images ?? []).map((img) => img.src).filter(Boolean);
  const fallbackImage = p.image?.src ?? '';
  const tags = normaliseTags(p.tags);

  // Rename known synonyms (e.g. "Measurements" -> "Size") so extractSizes/
  // extractColors and the product page's optionAvailability — all of which
  // match on the literal "Size"/"Color" strings — pick this axis up
  // without needing to know every alias a storefront might use.
  const options = (p.options ?? []).map((o) => ({ name: normaliseOptionName(o.name), values: o.values }));

  // image_id -> src lookup, so per-variant photos (used for color swatches)
  // can be resolved even though .json only links them by id, not inline.
  const imagesById = new Map((p.images ?? []).filter((img) => img.id != null).map((img) => [img.id as number, img.src]));

  const variants =
    p.variants && p.variants.length > 1
      ? p.variants.map((v) => ({
          id: String(v.id),
          title: v.title,
          price: parseFloat(v.price),
          compareAtPrice: v.compare_at_price ? parseFloat(v.compare_at_price) : undefined,
          available: v.available,
          options: [v.option1, v.option2, v.option3],
          image: v.image_id != null ? imagesById.get(v.image_id) : undefined,
        }))
      : undefined;

  return {
    id: String(p.id),
    handle: p.handle,
    storeSlug: platform,
    name: p.title,
    image: images[0] ?? fallbackImage,
    images: images.length ? images : fallbackImage ? [fallbackImage] : [],
    price,
    currency,
    compareAtPrice,
    onSale: compareAtPrice != null && compareAtPrice > price,
    inStock: p.variants?.some((v) => v.available) ?? true,
    category: p.product_type || 'General',
    condition: 'New',
    description: stripHtml(p.body_html ?? ''),
    seller,
    url: `${config.baseUrl}/products/${p.handle}`,
    vendor: p.vendor || undefined,
    productType: p.product_type || undefined,
    tags: tags.length ? tags : undefined,
    options: options.length ? options : undefined,
    variants,
    sizes: extractSizes(options),
    colors: extractColors(options),
    gender: detectGender([p.product_type, p.title, tags.join(' ')], config.defaultGender),
    sku: variant?.sku || undefined,
    weightKg: variant?.grams ? variant.grams / 1000 : undefined,
    // Shopify's public /products.json exposes only one description field
    // (body_html) — no separate short/long split like WooCommerce's
    // short_description vs description — so fullDescription stays unset
    // here rather than duplicating `description`.
  };
}

/**
 * Normaliser for the `.js` product shape — used only by fetchShopifyProduct.
 * Mirrors normaliseShopifyProduct's output shape exactly, so the product
 * detail page doesn't need to know which endpoint the data came from.
 */
function normaliseShopifyJsProduct(
  p: ShopifyJsProduct,
  platform: string,
  currency: string,
  seller: string,
  config: ShopifyProviderConfig
): StoreProduct {
  const variant = p.variants?.[0];
  const price = variant ? variant.price / 100 : p.price / 100;
  const compareAtPrice = variant?.compare_at_price != null ? variant.compare_at_price / 100 : undefined;
  const images = (p.images ?? []).map(normaliseImageUrl).filter(Boolean);
  const fallbackImage = p.featured_image ? normaliseImageUrl(p.featured_image) : '';
  const tags = normaliseTags(p.tags);

  // Same synonym rename as the .json path — keep both endpoints behaving
  // identically for stores using non-standard option names.
  const options = (p.options ?? []).map((o) => ({ name: normaliseOptionName(o.name), values: o.values }));

  const variants =
    p.variants && p.variants.length > 1
      ? p.variants.map((v) => ({
          id: String(v.id),
          title: v.title,
          price: v.price / 100,
          compareAtPrice: v.compare_at_price != null ? v.compare_at_price / 100 : undefined,
          available: v.available,
          options: [v.option1, v.option2, v.option3],
          // .js embeds the variant's own photo directly — no id lookup
          // needed, unlike the .json path. This is what lets the product
          // page show a real photo per color instead of a guessed flat
          // color swatch.
          image: v.featured_image?.src ? normaliseImageUrl(v.featured_image.src) : undefined,
        }))
      : undefined;

  return {
    id: String(p.id),
    handle: p.handle,
    storeSlug: platform,
    name: p.title,
    image: images[0] ?? fallbackImage,
    images: images.length ? images : fallbackImage ? [fallbackImage] : [],
    price,
    currency,
    compareAtPrice,
    onSale: compareAtPrice != null && compareAtPrice > price,
    // Prefer real per-variant availability; fall back to the product-level
    // `available` flag only when there's no variant data at all to check.
    inStock: p.variants?.length ? p.variants.some((v) => v.available) : p.available,
    category: p.type || 'General',
    condition: 'New',
    description: stripHtml(p.description ?? ''),
    seller,
    url: `${config.baseUrl}/products/${p.handle}`,
    vendor: p.vendor || undefined,
    productType: p.type || undefined,
    tags: tags.length ? tags : undefined,
    options: options.length ? options : undefined,
    variants,
    sizes: extractSizes(options),
    colors: extractColors(options),
    gender: detectGender([p.type, p.title, tags.join(' ')], config.defaultGender),
    sku: variant?.sku || undefined,
    weightKg: variant?.grams ? variant.grams / 1000 : undefined,
  };
}

/**
 * Shopify's public /products.json (and /collections/{handle}/products.json)
 * needs no auth and works on any Shopify storefront that hasn't disabled it.
 *
 * config.headers is merged on top of the defaults below — same escape hatch
 * as the WooCommerce provider, for any storefront that 403s bare requests
 * (unusual User-Agent rules, geo/CDN blocking, etc).
 *
 * Limitations, by design of the public endpoint:
 * - No server-side search → we over-fetch (up to 250) and filter client-side.
 * - No total-count header → "has more pages" is detected by requesting
 *   perPage + 1 items and checking whether the extra one came back.
 */
export async function fetchShopifyProducts(
  platform: string,
  config: ShopifyProviderConfig,
  storeName: string,
  params: ProviderFetchParams
): Promise<ProviderFetchResult> {
  const currency = config.currency ?? 'USD';
  const collectionHandle = params.category ? config.collectionMap?.[params.category] : undefined;

  const isSearching = !!params.search;
  const shopifyLimit = isSearching ? 250 : params.perPage + 1; // +1 to detect next page
  const shopifyPage = isSearching ? 1 : params.page;

  const endpoint = collectionHandle
    ? `${config.baseUrl}/collections/${encodeURIComponent(collectionHandle)}/products.json`
    : `${config.baseUrl}/products.json`;

  const qs = new URLSearchParams({ limit: String(shopifyLimit), page: String(shopifyPage) });

  const res = await fetch(`${endpoint}?${qs}`, {
    headers: { ...HEADERS, ...config.headers },
    next: { revalidate: CACHE_SECONDS },
  });
  if (!res.ok) throw new Error(`Shopify feed for ${platform} returned ${res.status}`);

  const data = (await res.json()) as ShopifyProductsResponse;
  let products = data.products.map((p) => normaliseShopifyProduct(p, platform, currency, storeName, config));

  // Category filter with no collection mapping → fall back to product_type match
  if (params.category && !collectionHandle) {
    products = products.filter((p) => p.category.toLowerCase() === params.category.toLowerCase());
  }

  if (isSearching) {
    const q = params.search.toLowerCase();
    products = products.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q)
    );
  }

  products = applySort(products, params.sort);

  if (isSearching) {
    const total = products.length;
    const totalPages = Math.max(1, Math.ceil(total / params.perPage));
    const sliced = products.slice((params.page - 1) * params.perPage, params.page * params.perPage);
    return { products: sliced, total, totalPages };
  }

  const hasMore = products.length > params.perPage;
  const sliced = hasMore ? products.slice(0, params.perPage) : products;
  return {
    products: sliced,
    total: sliced.length, // Shopify's public feed doesn't expose a real total
    totalPages: hasMore ? params.page + 1 : params.page,
  };
}

/**
 * Single-product lookup for the product detail page, via Shopify's public
 * /products/{handle}.js endpoint (NOT .json — see the ShopifyJsProduct
 * comment above for why: .json variants can silently omit `available`,
 * which made every size/color render as crossed-out/unavailable
 * regardless of real stock).
 *
 * Returns null (not an error) on a 404, since "this handle doesn't exist"
 * is a normal notFound() case, not a failure of the upstream site.
 */
export async function fetchShopifyProduct(
  platform: string,
  config: ShopifyProviderConfig,
  storeName: string,
  handle: string
): Promise<StoreProduct | null> {
  const currency = config.currency ?? 'USD';

  const res = await fetch(`${config.baseUrl}/products/${encodeURIComponent(handle)}.js`, {
    headers: { ...HEADERS, ...config.headers },
    next: { revalidate: CACHE_SECONDS },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Shopify product fetch for ${platform}/${handle} returned ${res.status}`);

  // Unlike .json (which wraps the product in `{ product: {...} }`), .js
  // returns the product object directly at the top level.
  const product = (await res.json()) as ShopifyJsProduct;
  if (!product?.id) return null;

  return normaliseShopifyJsProduct(product, platform, currency, storeName, config);
}