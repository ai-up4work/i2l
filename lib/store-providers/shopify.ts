// lib/store-providers/shopify.ts
import type { StoreProduct } from '@/lib/store.types';
import type { ShopifyProviderConfig } from '@/lib/store-config';
import type { ProviderFetchParams, ProviderFetchResult } from './types';
import { applySort, detectGender, extractColors, extractSizes, stripHtml } from './types';
import {
  discoverShopifyPlusConfig,
  fetchShopifyPlusProduct,
  fetchShopifyPlusProducts,
  fetchShopifyPlusCollections,
  isKnownShopifyPlusStore,
} from './shopify-plus';

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
 * This is used ONLY for the single-product lookup (fetchShopifyProductRest),
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
export async function fetchShopifyShopCurrency(
  origin: string,
  headers: Record<string, string> = HEADERS
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
    // Shopify's public /products.json never exposes a real inventory
    // number — only per-variant `available` (used for inStock above).
    // null is the correct "unknown" value per StoreProduct's own doc
    // comment (null = unknown, not zero), not a placeholder to guess at.
    stockCount: null,
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
    // feeds the catalog listing/grid (fetchShopifyProductsRest), which never
    // renders raw HTML, so there's no need for an unstripped copy here —
    // contrast with normaliseShopifyJsProduct below, which does set it.
  };
}

/**
 * Normaliser for the `.js` product shape — used only by fetchShopifyProductRest.
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
    // Same as normaliseShopifyProduct above — .js exposes no inventory
    // count either, only `available` (used for inStock above).
    stockCount: null,
    category: normaliseProductType(p.type) ?? 'General',
    condition: 'New',
    description: stripHtml(p.description ?? ''),
    // Product DETAIL page (this function only — see fetchShopifyProductRest)
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
 * - Nothing published only through a headless/Storefront-API-only setup
 *   (no Online Store channel — see shopify-plus.ts) will ever show up
 *   here: this call will just come back with an empty `products` array,
 *   200 OK. That's exactly what the caller (fetchShopifyProducts below)
 *   uses as the trigger to try the GraphQL tier instead of treating an
 *   empty page as "this store has no products".
 *
 * Currency here still comes from config.currency (a configured/guessed
 * value), NOT fetchShopifyShopCurrency — that lookup is only wired into
 * the single-product path below. Worth doing here too eventually (see
 * note on fetchShopifyProductsRest), but a listing grid is more tolerant of
 * an occasionally-wrong currency label than a product detail page's
 * prominent price display is, and adding a /cart.js call to a
 * multi-page catalog listing flow is a bigger cost/risk trade-off than
 * adding one to a single-product lookup.
 */
async function fetchShopifyProductsRest(
  platform: string,
  config: ShopifyProviderConfig,
  storeName: string,
  params: ProviderFetchParams
): Promise<ProviderFetchResult> {
  const currency = config.currency ?? 'USD';
  const mergedHeaders = { ...HEADERS, ...config.headers };

  // Resolve params.category to a real collection handle. See the doc
  // comment above for the full precedence order.
  let collectionHandle: string | undefined;
  if (params.category) {
    // config.collectionMap is an explicit human override — check it first
    // so a seller who deliberately remapped a category name always wins,
    // even if params.category also happens to match a live handle exactly.
    if (config.collectionMap?.[params.category]) {
      collectionHandle = config.collectionMap[params.category];
    } else {
      const knownCollections = await fetchShopifyCollectionsRest(config.baseUrl, mergedHeaders);
      collectionHandle = knownCollections.find((c) => c.handle === params.category)?.handle;
    }
  }

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

  // Category given but no real collection resolved (neither collectionMap
  // nor a live handle matched) → fall back to loose product_type match,
  // same behavior as before this change.
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
 * Public entry point for catalog/collection listing. Tries the REST
 * /products.json tier first (fast, no auth, no render) and only falls
 * through to the Storefront GraphQL tier (shopify-plus.ts) when REST's
 * result looks like the headless signature: a 200 OK with zero products
 * on page 1 (mirrors the original westside.com investigation — REST
 * genuinely returns `{"products":[]}` on those stores, not an error), or
 * REST throws outright (some headless domains 403/404 the .json path at
 * a WAF layer instead of returning an empty array).
 *
 * A previously-confirmed headless store (isKnownShopifyPlusStore) skips
 * straight to GraphQL, skipping the doomed REST round-trip on every
 * subsequent call.
 */
export async function fetchShopifyProducts(
  platform: string,
  config: ShopifyProviderConfig,
  storeName: string,
  params: ProviderFetchParams
): Promise<ProviderFetchResult> {
  // Discovery is anchored to the actual page being requested (a
  // collection page when we can resolve one) rather than the bare
  // origin — a homepage frequently never fires a client-side Storefront
  // GraphQL call at all, while a real collection/listing page almost
  // always does. See shopify-plus.ts's discoverShopifyPlusConfig doc
  // comment for why this matters and what it falls back to.
  const discoveryTargetUrl = params.category
    ? `${config.baseUrl}/collections/${encodeURIComponent(params.category)}`
    : config.baseUrl;

  if (isKnownShopifyPlusStore(config.baseUrl)) {
    const plusConfig = await discoverShopifyPlusConfig(discoveryTargetUrl);
    if (plusConfig) {
      return fetchShopifyPlusProducts(platform, plusConfig, storeName, params, config.defaultGender);
    }
  }

  let restResult: ProviderFetchResult | null = null;
  try {
    restResult = await fetchShopifyProductsRest(platform, config, storeName, params);
  } catch {
    // fall through to GraphQL discovery below — some headless domains
    // block/404 .json at a WAF layer rather than returning an empty array
  }

  // Only page 1 with zero results is a trustworthy "this might be
  // headless" signal — an empty page 2+ just means we've paged past the
  // real end of a normal REST-backed catalog, which is expected and
  // should NOT trigger a discovery attempt on every deep-page request.
  if (restResult && (restResult.products.length > 0 || params.page > 1)) {
    return restResult;
  }

  const plusConfig = await discoverShopifyPlusConfig(discoveryTargetUrl);
  if (!plusConfig) {
    // Not a headless store after all — this is a legitimately empty
    // result (or we need to surface the original REST error).
    if (restResult) return restResult;
    return fetchShopifyProductsRest(platform, config, storeName, params);
  }

  return fetchShopifyPlusProducts(platform, plusConfig, storeName, params, config.defaultGender);
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
async function fetchShopifyProductRest(
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

/**
 * Public entry point for a single product detail page. Tries the REST
 * .js tier first; a REST 404 on a store that turns out to be
 * Storefront-API-only (see shopify-plus.ts) is exactly the situation
 * that motivated this — a REST 404 there does NOT mean "no such
 * product", it means "this product isn't published to the Online Store
 * channel", so we confirm via discovery before returning null.
 *
 * A previously-confirmed headless store skips REST entirely.
 */
export async function fetchShopifyProduct(
  platform: string,
  config: ShopifyProviderConfig,
  storeName: string,
  handle: string
): Promise<StoreProduct | null> {
  // Discovery is anchored to the ACTUAL product page, not the bare
  // origin — see shopify-plus.ts's discoverShopifyPlusConfig doc
  // comment. A PDP is by far the most likely page on a headless store
  // to fire a client-side Storefront GraphQL call (variant switching,
  // recommendations, reviews widgets), so this is deliberately the
  // product URL rather than config.baseUrl.
  const discoveryTargetUrl = `${config.baseUrl}/products/${encodeURIComponent(handle)}`;

  if (isKnownShopifyPlusStore(config.baseUrl)) {
    const plusConfig = await discoverShopifyPlusConfig(discoveryTargetUrl);
    if (plusConfig) {
      return fetchShopifyPlusProduct(platform, plusConfig, storeName, handle, config.defaultGender);
    }
  }

  let restResult: StoreProduct | null = null;
  let restThrew = false;
  try {
    restResult = await fetchShopifyProductRest(platform, config, storeName, handle);
  } catch {
    restThrew = true;
  }

  if (restResult) return restResult;

  // REST came back null/errored — check whether this is actually a
  // headless store before concluding "no such product".
  const plusConfig = await discoverShopifyPlusConfig(discoveryTargetUrl);
  if (!plusConfig) {
    // Confirmed not headless: a REST throw here is a real upstream
    // error worth surfacing, not a silent null.
    if (restThrew) return fetchShopifyProductRest(platform, config, storeName, handle);
    return null; // genuine 404
  }

  return fetchShopifyPlusProduct(platform, plusConfig, storeName, handle, config.defaultGender);
}

export interface ShopifyCollectionSummary {
  handle: string;
  title: string;
}

// lib/store-providers/shopify.ts

/**
 * /collections.json silently omits some published collections on certain
 * stores (confirmed on live data — collections fully linked in nav/theme
 * and returning real products were absent from the JSON feed entirely).
 * The sitemap is generated straight off what's actually published to the
 * Online Store channel, so it's the more complete source of TRUTH for
 * "what collections really exist" — it just doesn't give titles cheaply
 * (only handles + optional image alt text), so we still prefer JSON's
 * title where we have it and fall back to a humanized handle otherwise.
 */
async function fetchShopifyCollectionHandlesFromSitemap(
  baseUrl: string,
  headers: Record<string, string> = HEADERS
): Promise<{ handle: string; title?: string }[]> {
  try {
    const indexRes = await fetch(`${baseUrl}/sitemap.xml`, { headers, next: { revalidate: CACHE_SECONDS } });
    if (!indexRes.ok) return [];
    const indexXml = await indexRes.text();

    // Pull out the collections-sitemap URL(s) — handles the ?from=&to= id-range
    // pattern Shopify uses to shard large sitemaps.
    const sitemapUrls = [...indexXml.matchAll(/<loc>([^<]*sitemap_collections[^<]*)<\/loc>/g)].map((m) => m[1]);
    if (!sitemapUrls.length) return [];

    const results: { handle: string; title?: string }[] = [];
    for (const sitemapUrl of sitemapUrls) {
      const res = await fetch(sitemapUrl, { headers, next: { revalidate: CACHE_SECONDS } });
      if (!res.ok) continue;
      const xml = await res.text();

      // Split on <url>...</url> blocks so we can pair each loc with its own
      // optional <image:title> rather than just harvesting both arrays blind.
      const blocks = [...xml.matchAll(/<url>([\s\S]*?)<\/url>/g)];
      for (const [, block] of blocks) {
        const locMatch = block.match(/<loc>https?:\/\/[^/]+\/collections\/([^<?]+)/);
        if (!locMatch) continue;
        const handle = locMatch[1];
        const titleMatch = block.match(/<image:title>([^<]*)<\/image:title>/);
        results.push({ handle, title: titleMatch?.[1] });
      }
    }
    return results;
  } catch {
    return [];
  }
}

async function fetchShopifyCollectionsRest(
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
      res = await fetch(`${baseUrl}/collections.json?${qs}`, { headers, next: { revalidate: CACHE_SECONDS } });
    } catch {
      break;
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

  // Merge in anything the sitemap has that the JSON feed missed.
  const seenHandles = new Set(collections.map((c) => c.handle));
  const sitemapHandles = await fetchShopifyCollectionHandlesFromSitemap(baseUrl, headers);
  for (const { handle, title } of sitemapHandles) {
    if (seenHandles.has(handle)) continue;
    seenHandles.add(handle);
    collections.push({
      handle,
      // Humanize the handle as a last resort so the admin UI never shows
      // a bare slug — e.g. "premium-collections" -> "Premium Collections".
      title: title || handle.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
    });
  }

  return collections;
}

/**
 * Public entry point for the full collection list. REST's
 * /collections.json + sitemap merge runs first; an empty result (the
 * headless signature — same reasoning as fetchShopifyProducts above)
 * triggers a GraphQL discovery attempt before concluding the store
 * really has zero collections.
 */
export async function fetchShopifyCollections(
  baseUrl: string,
  headers: Record<string, string> = HEADERS
): Promise<ShopifyCollectionSummary[]> {
  if (isKnownShopifyPlusStore(baseUrl)) {
    const plusConfig = await discoverShopifyPlusConfig(baseUrl);
    if (plusConfig) return fetchShopifyPlusCollections(plusConfig);
  }

  const restCollections = await fetchShopifyCollectionsRest(baseUrl, headers);
  if (restCollections.length > 0) return restCollections;

  const plusConfig = await discoverShopifyPlusConfig(baseUrl);
  if (!plusConfig) return restCollections; // confirmed not headless — genuinely empty

  return fetchShopifyPlusCollections(plusConfig);
}