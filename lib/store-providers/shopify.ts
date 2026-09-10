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
 * Some merchants leave Shopify's product_type field unset, which comes
 * back as the literal string "0" rather than an empty string — seen on
 * Old Money's feed. Treated the same as "no category info", everywhere
 * product_type/type is surfaced as productType, so a spec row or Details
 * tab never displays a bare "0" to the shopper.
 */
function normaliseProductType(type: string | undefined | null): string | undefined {
  const trimmed = type?.trim();
  return trimmed && trimmed !== '0' ? trimmed : undefined;
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
 * - NEITHER `.js` NOR `.json` includes a currency field anywhere — see
 *   fetchShopifyShopCurrency below for where that actually comes from.
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

/**
 * Ground truth for a Shopify store's currency. Neither the `.js` nor the
 * `.json` product endpoints ever include a currency field — the price
 * numbers they return are only meaningful in whatever currency the shop
 * itself is configured in, which those endpoints simply don't say.
 *
 * `/cart.js` is unauthenticated on every Shopify storefront and its
 * response always includes the shop's real, live currency code — this
 * is the standard trick for getting it without needing the Admin API or
 * any credentials.
 *
 * Returns null (rather than throwing) on any failure, so callers can
 * fall back to a heuristic (domainCurrency) or an explicitly configured
 * value without this becoming a hard failure for the whole product
 * fetch — a slow or blocked /cart.js shouldn't take down the entire
 * page render over something that has a reasonable fallback.
 */
async function fetchShopifyShopCurrency(
  origin: string,
  headers: Record<string, string>
): Promise<string | null> {
  try {
    const res = await fetch(`${origin}/cart.js`, {
      headers,
      next: { revalidate: CACHE_SECONDS },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { currency?: unknown };
    return typeof data.currency === 'string' && data.currency ? data.currency : null;
  } catch {
    return null;
  }
}

/**
 * Fetches just the product COUNT on a given page of Shopify's public
 * /products.json (or the collection-scoped variant), at the max page size.
 * Returns null on any failure so the search below can bail out cleanly
 * rather than throw mid-search.
 */
async function fetchShopifyPageCount(
  baseUrl: string,
  headers: Record<string, string>,
  collectionHandle: string | undefined,
  page: number,
  pageSize: number
): Promise<number | null> {
  const endpoint = collectionHandle
    ? `${baseUrl}/collections/${encodeURIComponent(collectionHandle)}/products.json`
    : `${baseUrl}/products.json`;
  const qs = new URLSearchParams({ limit: String(pageSize), page: String(page) });

  try {
    const res = await fetch(`${endpoint}?${qs}`, {
      headers,
      next: { revalidate: CACHE_SECONDS },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as ShopifyProductsResponse;
    return data.products?.length ?? 0;
  } catch {
    return null;
  }
}

/**
 * Finds the EXACT product total on a Shopify store (or one collection)
 * using only the public, unauthenticated /products.json endpoint — which
 * has no total-count field or header of its own.
 *
 * Rather than walking every page one by one (O(pages) requests), this
 * does an exponential search for the "boundary" page — the first page
 * that comes back with fewer than a full page of products — then a
 * binary search to pin down exactly where that boundary is. That's
 * O(log pages) requests: a 5,000-product store (20 pages at 250/page)
 * takes about 5–6 requests instead of 20.
 *
 * Once the boundary page is found, total = (confirmed full pages * pageSize)
 * + (product count on the boundary page).
 *
 * Returns null if the search can't complete within maxDoublings — treated
 * by the caller as "give up, show the honest lower-bound '+' instead of
 * guessing" rather than ever reporting a wrong exact number.
 */
async function countShopifyProductsExact(
  baseUrl: string,
  headers: Record<string, string>,
  collectionHandle: string | undefined,
  maxDoublings = 16 // covers up to ~2^16 * 250 products before giving up — far beyond any real store
): Promise<number | null> {
  const pageSize = 250; // Shopify's max per page on this endpoint

  // Page 1 check: if it's already not full, that's the whole catalog.
  const firstPageCount = await fetchShopifyPageCount(baseUrl, headers, collectionHandle, 1, pageSize);
  if (firstPageCount == null) return null;
  if (firstPageCount < pageSize) return firstPageCount;

  // Exponential search: double the page number until we find one that's
  // not full (or empty) — that's our upper boundary.
  let lastFullPage = 1;
  let boundaryPage: number | null = null;
  let boundaryCount = 0;
  let probe = 2;

  for (let i = 0; i < maxDoublings; i++) {
    const count = await fetchShopifyPageCount(baseUrl, headers, collectionHandle, probe, pageSize);
    if (count == null) return null;

    if (count < pageSize) {
      boundaryPage = probe;
      boundaryCount = count;
      break;
    }
    lastFullPage = probe;
    probe *= 2;
  }

  if (boundaryPage == null) return null; // catalog too large to bound — give up cleanly

  // Binary search between lastFullPage (confirmed full) and boundaryPage
  // (confirmed not full) to find the exact last page with any products.
  let lo = lastFullPage;
  let hi = boundaryPage;
  let hiCount = boundaryCount;

  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    const count = await fetchShopifyPageCount(baseUrl, headers, collectionHandle, mid, pageSize);
    if (count == null) return null;

    if (count < pageSize) {
      hi = mid;
      hiCount = count;
    } else {
      lo = mid;
    }
  }

  // `lo` is the last confirmed-full page, `hi` is the boundary page.
  return lo * pageSize + hiCount;
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
    category: normaliseProductType(p.product_type) ?? 'General',
    condition: 'New',
    description: stripHtml(p.body_html ?? ''),
    seller,
    url: `${config.baseUrl}/products/${p.handle}`,
    vendor: p.vendor || undefined,
    productType: normaliseProductType(p.product_type),
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
    // here rather than duplicating `description`. This normaliser only
    // feeds the catalog listing/grid (fetchShopifyProducts), which never
    // renders raw HTML, so there's no need for an unstripped copy here —
    // contrast with normaliseShopifyJsProduct below, which does set it.
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
    category: normaliseProductType(p.type) ?? 'General',
    condition: 'New',
    description: stripHtml(p.description ?? ''),
    // Product DETAIL page (this function only — see fetchShopifyProduct)
    // renders description as real HTML via dangerouslySetInnerHTML +
    // DOMPurify (ProductInfoTabs), so the raw markup needs to survive
    // somewhere. `description` above stays plain/stripped for anywhere
    // that expects plain text (search matching, list-view snippets, meta
    // tags, etc.) — this is the same field, left unstripped, purely for
    // that one HTML-aware render. ProductInfoTabs already prefers
    // fullDescription over description, so no other call site needs to
    // change to pick this up.
    fullDescription: p.description || undefined,
    seller,
    url: `${config.baseUrl}/products/${p.handle}`,
    vendor: p.vendor || undefined,
    productType: normaliseProductType(p.type),
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
 * - No total-count header or dedicated count endpoint anywhere on this
 *   API → "has more pages" is detected by requesting perPage + 1 items on
 *   the current page. When that happens, we run countShopifyProductsExact
 *   (an exponential + binary search over page numbers, see above) to find
 *   the real exact total in O(log pages) extra requests instead of just
 *   reporting "48+". If that search can't complete (huge or misbehaving
 *   catalog) it returns null and we fall back to the honest lower-bound
 *   behavior exactly as before.
 *
 * Currency here still comes from config.currency (a configured/guessed
 * value), NOT fetchShopifyShopCurrency — that lookup is only wired into
 * the single-product path below. Worth doing here too eventually (see
 * note on fetchShopifyProducts), but a listing grid is more tolerant of
 * an occasionally-wrong currency label than a product detail page's
 * prominent price display is, and adding a /cart.js call to a
 * multi-page catalog listing flow is a bigger cost/risk trade-off than
 * adding one to a single-product lookup.
 */
export async function fetchShopifyProducts(
  platform: string,
  config: ShopifyProviderConfig,
  storeName: string,
  params: ProviderFetchParams
): Promise<ProviderFetchResult> {
  const currency = config.currency ?? 'USD';
  const collectionHandle = params.category ? config.collectionMap?.[params.category] : undefined;
  const mergedHeaders = { ...HEADERS, ...config.headers };

  const isSearching = !!params.search;
  // IMPORTANT: limit must equal params.perPage (not perPage + 1) for
  // non-search requests. Shopify's /products.json computes the page
  // offset as (page - 1) * limit using THIS request's limit — so if
  // limit ever drifts from the app's fixed page size, consecutive page
  // fetches stop lining up and silently skip one product per page
  // transition (was happening here: limit=25 vs UI page size 24 meant
  // every page boundary dropped exactly 1 item — 159 counted vs 153
  // actually shown across 7 pages).
  const shopifyLimit = isSearching ? 250 : params.perPage;
  const shopifyPage = isSearching ? 1 : params.page;

  const endpoint = collectionHandle
    ? `${config.baseUrl}/collections/${encodeURIComponent(collectionHandle)}/products.json`
    : `${config.baseUrl}/products.json`;

  const qs = new URLSearchParams({ limit: String(shopifyLimit), page: String(shopifyPage) });

  const res = await fetch(`${endpoint}?${qs}`, {
    headers: mergedHeaders,
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
    return { products: sliced, total, totalPages, totalIsExact: true };
  }

  // No more over-fetch-by-1 trick: this request already returned exactly
  // one page's worth (or fewer, on the real last page). A full page
  // (length === perPage) means there COULD be more, but doesn't prove it
  // — so that's just the trigger to check the exact count.
  const sliced = products;
  const mightHaveMore = sliced.length === params.perPage;

  let exactTotal: number | null = null;
  if (mightHaveMore && !(params.category && !collectionHandle)) {
    exactTotal = await countShopifyProductsExact(config.baseUrl, mergedHeaders, collectionHandle);
  }

  const totalPages =
    exactTotal != null
      ? Math.max(1, Math.ceil(exactTotal / params.perPage))
      : mightHaveMore
        ? params.page + 1
        : params.page;

  // When we don't have an exact total, best lower-bound estimate of how
  // many items exist so far is (all full pages before this one) + what
  // this page actually returned.
  const fallbackTotal = (params.page - 1) * params.perPage + sliced.length;

  return {
    products: sliced,
    total: exactTotal ?? fallbackTotal,
    totalPages,
    totalIsExact: !mightHaveMore || exactTotal != null,
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
 *
 * CURRENCY: fetches the shop's real currency via /cart.js
 * (fetchShopifyShopCurrency) and prefers it over config.currency. This
 * matters specifically for the ad-hoc, single-URL scrape path
 * (scrapeShopifyProduct in parsers.ts), where config.currency is only
 * ever a domain-name guess (domainCurrency()) that defaults to 'USD'
 * when the domain gives no signal — e.g. a plain .com store on LKR
 * pricing was previously mislabeled as USD purely because nothing in
 * the pipeline ever asked Shopify what currency the store actually
 * uses. For configured (non-ad-hoc) stores where config.currency was
 * deliberately set and is already known-correct, this still prefers the
 * live value on the assumption that real shop data beats a config
 * value that could go stale if a store changes currency — if that's
 * ever undesirable for a specific store, gate this behind something
 * like `config.trustShopCurrency !== false`.
 */
export async function fetchShopifyProduct(
  platform: string,
  config: ShopifyProviderConfig,
  storeName: string,
  handle: string
): Promise<StoreProduct | null> {
  const mergedHeaders = { ...HEADERS, ...config.headers };

  const res = await fetch(`${config.baseUrl}/products/${encodeURIComponent(handle)}.js`, {
    headers: mergedHeaders,
    next: { revalidate: CACHE_SECONDS },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Shopify product fetch for ${platform}/${handle} returned ${res.status}`);

  // Unlike .json (which wraps the product in `{ product: {...} }`), .js
  // returns the product object directly at the top level.
  const product = (await res.json()) as ShopifyJsProduct;
  if (!product?.id) return null;

  const realCurrency = await fetchShopifyShopCurrency(config.baseUrl, mergedHeaders);
  const currency = realCurrency ?? config.currency ?? 'USD';

  return normaliseShopifyJsProduct(product, platform, currency, storeName, config);
}

export interface ShopifyCollectionSummary {
  handle: string;
  title: string;
}

export async function fetchShopifyCollections(
  baseUrl: string,
  headers: Record<string, string> = HEADERS
): Promise<ShopifyCollectionSummary[]> {
  const collections: ShopifyCollectionSummary[] = [];
  const pageSize = 250;
  let page = 1;

  while (true) {
    const qs = new URLSearchParams({ limit: String(pageSize), page: String(page) });
    let res: Response;
    try {
      res = await fetch(`${baseUrl}/collections.json?${qs}`, {
        headers,
        next: { revalidate: CACHE_SECONDS },
      });
    } catch {
      return collections;
    }
    if (!res.ok) break;

    const data = (await res.json()) as { collections?: { handle: string; title: string }[] };
    const batch = data.collections ?? [];
    for (const c of batch) {
      if (c.handle && c.title) collections.push({ handle: c.handle, title: c.title });
    }

    if (batch.length < pageSize) break;
    page += 1;
    if (page > 20) break;
  }

  return collections;
}