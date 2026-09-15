// lib/store-providers/shopify-plus.ts
//
// Handles Shopify stores whose PUBLIC domain (e.g. westside.com) is a
// headless frontend (Hydrogen/Oxygen, or a custom Next.js/Remix app) that
// talks to Shopify only through the Storefront GraphQL API — NOT through
// the classic Liquid Online Store. On these stores:
//
//   - {domain}/products.json, /collections/*.json, /products/{handle}.js
//     all come back empty/404, because nothing is published to the
//     Online Store sales channel — shopify.ts's REST provider is a dead
//     end here.
//   - The real backend lives at a DIFFERENT domain: {something}.myshopify.com
//     (e.g. westside.com -> my-westside.myshopify.com). This is NOT
//     derivable from the public domain by any naming convention — it has
//     to be discovered.
//   - All product/collection data flows through
//     {myshopifyDomain}/api/{version}/graphql.json, authenticated with a
//     PUBLIC (client-side, by design) Storefront API access token sent as
//     the `X-Shopify-Storefront-Access-Token` header.
//
// This module owns: (1) discovering {myshopifyDomain, token} for a given
// public domain via a headless render + network interception, with an
// in-memory cache so that discovery only happens once per domain, and
// (2) fetching products/collections/PDPs via GraphQL once discovered,
// normalised into the exact same StoreProduct shape shopify.ts produces —
// so callers (scrapeShopifyProduct in parsers.ts, the router added to
// shopify.ts) don't need to know or care which tier actually served a
// given store.

import type { StoreProduct, StoreProductOption, StoreProductVariant } from '@/lib/store.types';
import type { ProviderFetchParams, ProviderFetchResult } from './types';
import { applySort, detectGender, stripHtml } from './types';
import type { ShopifyCollectionSummary } from './shopify';
import { fetchRendered } from '@/lib/scrape/browser-fetch';

const DEFAULT_API_VERSION = '2026-04'; // keep in step with shopify.ts's REST version where practical
const DISCOVERY_TIMEOUT_MS = 20_000;
const GRAPHQL_TIMEOUT_MS = 15_000;
const CACHE_SECONDS = 60 * 60 * 24; // matches shopify.ts's revalidate window

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (compatible; StoreCatalog/1.0)',
  Accept: 'application/json',
};

export interface ShopifyPlusConfig {
  type: 'shopify-plus';
  /** The PUBLIC-facing storefront domain, e.g. "westside.com" — used to build product/collection URLs shown to users. */
  baseUrl: string;
  /** The real backend GraphQL is actually called at — usually "my-store.myshopify.com", but can be a merchant-proxied custom domain/CDN for stores that route their Storefront API through their own domain (see discoverViaHeadlessBrowser's onRequest handler). Named myshopifyDomain for historical reasons; treat it as "the resolved GraphQL origin", not a guarantee it ends in .myshopify.com. */
  myshopifyDomain: string;
  /** Public Storefront API access token, captured from the site's own outgoing requests. Safe to log/cache — it's client-side by design and read-scoped. */
  storefrontToken: string;
  apiVersion?: string;
  /** Merged on top of HEADERS, same escape hatch as ShopifyProviderConfig. */
  headers?: Record<string, string>;
}

// ---------------------------------------------------------------------
// Discovery cache
//
// Discovery requires a real headless browser render (see below), which
// is expensive relative to a plain fetch — so a resolved config is kept
// in-memory keyed by the public domain. This is intentionally a plain
// Map rather than Next's `fetch` cache: the discovery result isn't the
// body of any single HTTP response, it's a *derived* {domain, token}
// pair assembled from an intercepted request, so there's no natural
// `fetch()` call for revalidate:{} to attach to.
//
// Swap this for a shared KV/Redis-backed store if this runs across
// multiple server instances/cold starts — the interface below
// (getCachedConfig/setCachedConfig) is deliberately small so that swap
// doesn't touch any caller.
// ---------------------------------------------------------------------

interface CacheEntry {
  config: ShopifyPlusConfig;
  expiresAt: number;
}

const discoveryCache = new Map<string, CacheEntry>();

function cacheKey(domain: string): string {
  return domain.toLowerCase().replace(/^www\./, '');
}

function getCachedConfig(domain: string): ShopifyPlusConfig | null {
  const entry = discoveryCache.get(cacheKey(domain));
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    discoveryCache.delete(cacheKey(domain));
    return null;
  }
  return entry.config;
}

function setCachedConfig(domain: string, config: ShopifyPlusConfig, ttlSeconds = CACHE_SECONDS): void {
  discoveryCache.set(cacheKey(domain), { config, expiresAt: Date.now() + ttlSeconds * 1000 });
}

/** Exposed for admin/debug tooling — e.g. a "force re-discover this store" button. */
export function clearShopifyPlusCache(domain?: string): void {
  if (domain) discoveryCache.delete(cacheKey(domain));
  else discoveryCache.clear();
}

// ---------------------------------------------------------------------
// Discovery: public domain -> {myshopifyDomain, storefrontToken}
// ---------------------------------------------------------------------

const GRAPHQL_REQUEST_RE = /\/api\/[\d-]+\/graphql\.json$/i;
// No longer used to GATE a match — kept only as a hint for logging/
// debugging which real backend a resolved domain turned out to be.
// See discoverViaHeadlessBrowser's onRequest handler below for why
// requiring this pattern on the ORIGIN was too strict.
const MYSHOPIFY_ORIGIN_RE = /^https:\/\/([a-z0-9-]+\.myshopify\.com)/i;

/**
 * Cheap first attempt before paying for a headless render: some
 * Hydrogen/Oxygen builds inline the storefront token and/or the
 * myshopify domain into a server-rendered <script> data blob (Remix's
 * `window.__remixContext`, a Next.js `__NEXT_DATA__` payload, or a bare
 * `<meta name="shopify-storefront-token">` some themes add). Cheap to
 * check, and skips the render entirely when it hits.
 */
function tryStaticDiscovery(html: string): { myshopifyDomain: string; storefrontToken: string } | null {
  const tokenMatch = html.match(/["']?(?:storefrontAccessToken|storefront_access_token)["']?\s*[:=]\s*["']([a-f0-9]{32,40})["']/i);
  const domainMatch = html.match(/([a-z0-9-]+\.myshopify\.com)/i);
  if (tokenMatch && domainMatch) {
    return { myshopifyDomain: domainMatch[1], storefrontToken: tokenMatch[1] };
  }
  return null;
}

/**
 * Full discovery via a real headless browser: load the public domain,
 * let it hydrate, and capture the FIRST outgoing request that matches
 * Shopify's Storefront GraphQL path. That request's origin is the real
 * myshopifyDomain, and its `x-shopify-storefront-access-token` header is
 * the token — exactly the two values that showed up in your captured
 * Network panel entry for my-westside.myshopify.com.
 *
 * Goes through browser-fetch.ts's fetchRendered() (via its onRequest
 * hook) rather than launching a standalone Playwright instance — this
 * is deliberate: fetchRendered already owns the full launch pipeline
 * (Browserless remote CDP, sparticuz on serverless, Windows
 * chrome/msedge channel fallback, stealth patches) and reimplementing
 * any of that here would both duplicate it and skip all of it, which is
 * exactly what caused the "browser executable not found" error — a bare
 * `playwright.chromium.launch()` has none of those fallbacks and
 * expects a locally-downloaded binary that may not exist on this
 * machine/deploy target.
 *
 * fetchRendered's own html/waitForSelector machinery still runs (harmless
 * — we just don't use the returned html), so this piggybacks on the
 * exact same render path every other scraper in this codebase uses.
 */
async function discoverViaHeadlessBrowser(
  originUrl: string,
  timeoutMs: number
): Promise<{ myshopifyDomain: string; storefrontToken: string } | null> {
  let resolved: { myshopifyDomain: string; storefrontToken: string } | null = null;

  await fetchRendered(originUrl, {
    timeoutMs,
    // A single Storefront GraphQL call usually fires within the first
    // couple seconds of hydration on a PDP/collection page — no need to
    // wait for a specific selector, just give hydration a moment. Kept
    // shorter than the default settleMs isn't needed either way since
    // onRequest fires as soon as the request goes out, independent of
    // when fetchRendered eventually returns.
    // PDPs on Hydrogen often hydrate several independent widgets
    // (reviews, recommendations, recently-viewed) each firing their own
    // Storefront API call at slightly different times — 1.5s cut this
    // too close on some stores. Any ONE of those calls is enough to
    // resolve discovery, so err toward giving them room rather than
    // re-attempting.
    settleMs: 3000,
    onRequest: (req) => {
      if (resolved) return;
      const url = req.url();
      let origin: string;
      let pathname: string;
      try {
        const parsed = new URL(url);
        origin = parsed.origin;
        pathname = parsed.pathname;
      } catch {
        return;
      }
      if (!GRAPHQL_REQUEST_RE.test(pathname)) return;
      // Request.headers() is Playwright's synchronous, lowercased
      // header map — matches how the original manual Network-panel
      // capture showed `x-shopify-storefront-access-token`.
      const token = req.headers()['x-shopify-storefront-access-token'];
      if (!token) return;
      // Match on PATH SHAPE + a real Storefront token, not on the
      // origin being *.myshopify.com specifically. An enterprise
      // merchant can proxy this same call through their own domain or
      // CDN (for branding, caching, or WAF reasons) while still being
      // genuinely headless underneath — requiring the literal
      // myshopify.com host here would make that setup invisible to
      // discovery even though the token + GraphQL path prove it's the
      // real thing. Whatever origin this request actually went to IS
      // the right one to send future GraphQL calls to, myshopify.com or
      // not — a non-myshopify.com match just means this store proxies.
      resolved = { myshopifyDomain: origin.replace(/^https?:\/\//, ''), storefrontToken: token };
      if (!MYSHOPIFY_ORIGIN_RE.test(url)) {
        console.log(`[shopify-plus] Resolved via a proxied/custom domain (${origin}), not *.myshopify.com directly — this store routes its Storefront API through its own domain.`);
      }
    },
  });

  return resolved;
}

/**
 * Resolves a public storefront domain into a usable ShopifyPlusConfig.
 * Checks the in-memory cache first (keyed by ORIGIN — see cacheKey — so
 * repeat calls for different pages on the same store hit the cache
 * regardless of which specific page originally triggered discovery),
 * then tries the cheap static-HTML check, then falls back to a full
 * headless render with network interception.
 *
 * `targetUrl` should be the ACTUAL page you need data from — a PDP URL
 * when discovering on behalf of a product fetch, a collection URL for a
 * listing fetch — not just the bare origin. This matters: a Hydrogen
 * homepage frequently renders without firing any client-side
 * Storefront GraphQL call at all (its data can be fully embedded via
 * SSR), while the specific page you actually want data from is far more
 * likely to fire ONE eventually — even a below-the-fold "related
 * products" widget's fetch is enough, since we only need to observe any
 * successful call to *.myshopify.com/api/.../graphql.json with the
 * token header, not that specific page's own primary query.
 *
 * Falls back to the bare origin as a SECOND attempt if the target page
 * itself yields nothing within its budget — some stores only fire
 * GraphQL calls from within browse/nav interactions the homepage
 * happens to trigger (e.g. a mega-menu prefetching collection data) and
 * genuinely never do so from certain page types.
 *
 * Returns null if this genuinely isn't a headless-Shopify store (no
 * GraphQL call to a *.myshopify.com origin was ever observed across
 * BOTH attempts) — callers should treat that as "not this provider,"
 * not as an error. It's also possible for a real headless store to
 * fail discovery here if it never triggers a client GraphQL call within
 * the time budget (fully SSR'd, no client-side fetch at all) — see
 * debugDiscoverShopifyPlus() below for a way to check that case
 * directly before assuming "not headless."
 */
export async function discoverShopifyPlusConfig(
  targetUrl: string,
  opts: { apiVersion?: string; timeoutMs?: number } = {}
): Promise<ShopifyPlusConfig | null> {
  const origin = new URL(targetUrl).origin;
  const cached = getCachedConfig(origin);
  if (cached) return cached;

  const apiVersion = opts.apiVersion ?? DEFAULT_API_VERSION;
  const timeoutMs = opts.timeoutMs ?? DISCOVERY_TIMEOUT_MS;

  let resolved: { myshopifyDomain: string; storefrontToken: string } | null = null;

  try {
    const res = await fetch(targetUrl, { headers: HEADERS, cache: 'no-store' });
    if (res.ok) {
      const html = await res.text();
      resolved = tryStaticDiscovery(html);
    }
  } catch {
    // fall through to headless discovery regardless of why the static fetch failed
  }

  if (!resolved) {
    resolved = await discoverViaHeadlessBrowser(targetUrl, timeoutMs);
  }

  // Second attempt against the bare origin, only if the target page
  // wasn't already the origin (avoid a pointless duplicate render).
  if (!resolved && targetUrl !== origin && `${targetUrl}/` !== origin) {
    resolved = await discoverViaHeadlessBrowser(origin, timeoutMs);
  }

  if (!resolved) return null;

  const config: ShopifyPlusConfig = {
    type: 'shopify-plus',
    baseUrl: origin,
    myshopifyDomain: resolved.myshopifyDomain,
    storefrontToken: resolved.storefrontToken,
    apiVersion,
    headers: {},
  };

  setCachedConfig(origin, config);
  return config;
}

/**
 * Standalone debug helper — runs discovery against a single URL and
 * returns a human-readable trace of what happened, WITHOUT touching the
 * cache either way (so repeated debug runs always do a real fresh
 * attempt). Intended to be called from a one-off script or an admin/QA
 * route when a store you know is headless (like westside.com) is coming
 * back as "not headless" from the normal pipeline, so you can see
 * directly whether the render captured a GraphQL call at all rather
 * than inferring it from a downstream 404.
 *
 * Example (ad-hoc script):
 *   import { debugDiscoverShopifyPlus } from '@/lib/store-providers/shopify-plus';
 *   const result = await debugDiscoverShopifyPlus('https://westside.com/products/some-handle');
 *   console.log(result);
 */
export async function debugDiscoverShopifyPlus(
  targetUrl: string,
  opts: { apiVersion?: string; timeoutMs?: number } = {}
): Promise<{ resolved: ShopifyPlusConfig | null; attemptedTargetUrl: boolean; attemptedOrigin: boolean }> {
  const origin = new URL(targetUrl).origin;
  const timeoutMs = opts.timeoutMs ?? DISCOVERY_TIMEOUT_MS;
  const apiVersion = opts.apiVersion ?? DEFAULT_API_VERSION;

  let raw = await discoverViaHeadlessBrowser(targetUrl, timeoutMs);
  let attemptedOrigin = false;

  if (!raw && targetUrl !== origin && `${targetUrl}/` !== origin) {
    attemptedOrigin = true;
    raw = await discoverViaHeadlessBrowser(origin, timeoutMs);
  }

  return {
    resolved: raw
      ? {
          type: 'shopify-plus',
          baseUrl: origin,
          myshopifyDomain: raw.myshopifyDomain,
          storefrontToken: raw.storefrontToken,
          apiVersion,
          headers: {},
        }
      : null,
    attemptedTargetUrl: true,
    attemptedOrigin,
  };
}

// ---------------------------------------------------------------------
// GraphQL client
// ---------------------------------------------------------------------

interface GraphQLResponse<T> {
  data?: T;
  errors?: { message: string }[];
}

async function graphqlRequest<T>(
  config: ShopifyPlusConfig,
  query: string,
  variables: Record<string, unknown>
): Promise<T> {
  const endpoint = `https://${config.myshopifyDomain}/api/${config.apiVersion ?? DEFAULT_API_VERSION}/graphql.json`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GRAPHQL_TIMEOUT_MS);

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        ...HEADERS,
        ...config.headers,
        'Content-Type': 'application/json',
        'X-Shopify-Storefront-Access-Token': config.storefrontToken,
      },
      body: JSON.stringify({ query, variables }),
      signal: controller.signal,
      next: { revalidate: CACHE_SECONDS },
    });

    if (!res.ok) {
      // A 401/403 here almost always means the cached token has been
      // rotated (Shopify Plus merchants do this periodically) — clear
      // the cache so the NEXT call re-discovers rather than repeatedly
      // failing with a stale token.
      if (res.status === 401 || res.status === 403) clearShopifyPlusCache(config.baseUrl);
      throw new Error(`Shopify Storefront API returned ${res.status}`);
    }

    const json = (await res.json()) as GraphQLResponse<T>;

    // Shopify's Storefront API returns BOTH `data` and `errors` together
    // for field-level access-scope problems — e.g. a token without the
    // optional `unauthenticated_read_product_inventory` scope gets a
    // full, otherwise-valid response with totalInventory/quantityAvailable
    // simply null'd out, plus an `errors` entry per denied field. That's
    // categorically different from a real query failure (bad syntax, bad
    // handle, auth rejected outright) where `data` comes back null/absent
    // — only THAT case should actually throw. A field-permission error
    // alongside usable data is a degraded-but-successful result, not a
    // failure: logging it once (not per-field, which floods logs on a
    // multi-variant product) and returning data as normalised lets the
    // caller quietly fall back to `stockCount: null`, the same "unknown"
    // value the REST provider always returns anyway.
    if (json.errors?.length) {
      if (!json.data) {
        throw new Error(`Shopify Storefront API GraphQL error: ${json.errors.map((e) => e.message).join('; ')}`);
      }
      const uniqueMessages = [...new Set(json.errors.map((e) => e.message))];
      console.warn(
        `[shopify-plus] GraphQL request to ${config.myshopifyDomain} returned partial field-level errors (data still present, continuing): ${uniqueMessages.join(' | ')}`
      );
    }
    if (!json.data) throw new Error('Shopify Storefront API returned no data');
    return json.data;
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------
// GraphQL query documents
// ---------------------------------------------------------------------

const MONEY_FRAGMENT = `amount currencyCode`;

const PRODUCT_FRAGMENT = `
  id
  handle
  title
  description
  descriptionHtml
  productType
  vendor
  tags
  options { name values }
  images(first: 20) { edges { node { url altText } } }
  variants(first: 100) {
    edges {
      node {
        id
        title
        availableForSale
        sku
        weight
        weightUnit
        price { ${MONEY_FRAGMENT} }
        compareAtPrice { ${MONEY_FRAGMENT} }
        selectedOptions { name value }
        image { url }
      }
    }
  }
`;

const GET_SINGLE_PRODUCT_QUERY = `
  query GetSingleProduct($handle: String!) {
    product(handle: $handle) { ${PRODUCT_FRAGMENT} }
  }
`;

const GET_COLLECTION_PRODUCTS_QUERY = `
  query GetCollectionProducts($handle: String!, $first: Int!, $after: String, $sortKey: ProductCollectionSortKeys, $reverse: Boolean) {
    collection(handle: $handle) {
      title
      products(first: $first, after: $after, sortKey: $sortKey, reverse: $reverse) {
        pageInfo { hasNextPage endCursor }
        edges { node { ${PRODUCT_FRAGMENT} } }
      }
    }
  }
`;

const GET_ALL_PRODUCTS_QUERY = `
  query GetAllProducts($first: Int!, $after: String, $sortKey: ProductSortKeys, $reverse: Boolean, $query: String) {
    products(first: $first, after: $after, sortKey: $sortKey, reverse: $reverse, query: $query) {
      pageInfo { hasNextPage endCursor }
      edges { node { ${PRODUCT_FRAGMENT} } }
    }
  }
`;

const GET_COLLECTIONS_QUERY = `
  query GetCollections($first: Int!, $after: String) {
    collections(first: $first, after: $after) {
      pageInfo { hasNextPage endCursor }
      edges { node { handle title } }
    }
  }
`;

// ---------------------------------------------------------------------
// Response shapes (subset of fields we actually read)
// ---------------------------------------------------------------------

interface GqlMoney {
  amount: string;
  currencyCode: string;
}
interface GqlImage {
  url: string;
  altText: string | null;
}
interface GqlVariant {
  id: string;
  title: string;
  availableForSale: boolean;
  sku: string | null;
  weight: number | null;
  weightUnit: 'GRAMS' | 'KILOGRAMS' | 'OUNCES' | 'POUNDS' | null;
  price: GqlMoney;
  compareAtPrice: GqlMoney | null;
  selectedOptions: { name: string; value: string }[];
  image: { url: string } | null;
}
interface GqlProduct {
  id: string;
  handle: string;
  title: string;
  description: string;
  descriptionHtml: string;
  productType: string | null;
  vendor: string | null;
  tags: string[];
  options: { name: string; values: string[] }[];
  images: { edges: { node: GqlImage }[] };
  variants: { edges: { node: GqlVariant }[] };
}

interface GetSingleProductData {
  product: GqlProduct | null;
}
interface GetCollectionProductsData {
  collection: { title: string; products: { pageInfo: PageInfo; edges: { node: GqlProduct }[] } } | null;
}
interface GetAllProductsData {
  products: { pageInfo: PageInfo; edges: { node: GqlProduct }[] };
}
interface GetCollectionsData {
  collections: { pageInfo: PageInfo; edges: { node: { handle: string; title: string } }[] };
}
interface PageInfo {
  hasNextPage: boolean;
  endCursor: string | null;
}

// ---------------------------------------------------------------------
// Normaliser: GqlProduct -> StoreProduct
//
// Mirrors normaliseShopifyProduct/normaliseShopifyJsProduct in
// shopify.ts field-for-field, so callers get an identical shape
// regardless of which tier actually served a given store.
// ---------------------------------------------------------------------

function weightToKg(weight: number | null, unit: GqlVariant['weightUnit']): number | undefined {
  if (weight == null || !unit) return undefined;
  switch (unit) {
    case 'GRAMS':
      return weight / 1000;
    case 'KILOGRAMS':
      return weight;
    case 'OUNCES':
      return weight * 0.0283495;
    case 'POUNDS':
      return weight * 0.453592;
    default:
      return undefined;
  }
}

function normaliseGqlProduct(
  p: GqlProduct,
  platform: string,
  seller: string,
  config: ShopifyPlusConfig,
  defaultGender?: string
): StoreProduct {
  const images = p.images.edges.map((e) => e.node.url).filter(Boolean);
  const variantNodes = p.variants.edges.map((e) => e.node);
  const firstVariant = variantNodes[0];

  const price = firstVariant ? Number(firstVariant.price.amount) : 0;
  const currency = firstVariant?.price.currencyCode ?? 'USD';
  const compareAtPrice = firstVariant?.compareAtPrice ? Number(firstVariant.compareAtPrice.amount) : undefined;

  const options: StoreProductOption[] = (p.options ?? []).map((o) => ({ name: o.name, values: o.values }));

  const variants: StoreProductVariant[] | undefined =
    variantNodes.length > 1
      ? variantNodes.map((v) => ({
          id: v.id,
          title: v.title,
          price: Number(v.price.amount),
          compareAtPrice: v.compareAtPrice ? Number(v.compareAtPrice.amount) : undefined,
          available: v.availableForSale,
          options: p.options.map((opt) => v.selectedOptions.find((so) => so.name === opt.name)?.value ?? ''),
          image: v.image?.url,
        }))
      : undefined;

  const tags = p.tags ?? [];
  const productType = p.productType && p.productType.trim() && p.productType.trim() !== '0' ? p.productType.trim() : undefined;

  return {
    id: p.id,
    handle: p.handle,
    storeSlug: platform,
    name: p.title,
    image: images[0] ?? '',
    images,
    price,
    currency,
    compareAtPrice,
    onSale: compareAtPrice != null && compareAtPrice > price,
    inStock: variantNodes.length ? variantNodes.some((v) => v.availableForSale) : true,
    // Storefront API's real-time inventory fields (totalInventory,
    // variant.quantityAvailable) require the optional
    // `unauthenticated_read_product_inventory` scope, which most public
    // Storefront tokens don't have granted — deliberately not requested
    // in PRODUCT_FRAGMENT at all (see graphqlRequest's doc comment for
    // what happens if they ARE requested without the scope). null is
    // the same "unknown" value the REST provider always returns here
    // too, so this isn't a regression relative to shopify.ts.
    stockCount: null,
    category: productType ?? 'General',
    condition: 'New',
    description: stripHtml(p.description ?? ''),
    fullDescription: p.descriptionHtml || undefined,
    seller,
    url: `${config.baseUrl}/products/${p.handle}`,
    vendor: p.vendor || undefined,
    productType,
    tags: tags.length ? tags : undefined,
    options: options.length ? options : undefined,
    variants,
    sizes: options.find((o) => o.name === 'Size')?.values,
    colors: options.find((o) => o.name === 'Color')?.values,
    gender: detectGender(
      [p.productType ?? '', p.title, tags.join(' ')],
      defaultGender as 'men' | 'women' | 'unisex' | undefined
    ),
    sku: firstVariant?.sku || undefined,
    weightKg: weightToKg(firstVariant?.weight ?? null, firstVariant?.weightUnit ?? null),
  };
}

// ---------------------------------------------------------------------
// Public fetch functions — same signatures/shapes as shopify.ts
// ---------------------------------------------------------------------

/**
 * Single-product (PDP) lookup, keyed by handle — the GraphQL equivalent
 * of shopify.ts's fetchShopifyProduct. Returns null on a genuine
 * not-found (mirrors the REST provider's 404 -> null behavior) rather
 * than throwing, so callers can treat it as a normal notFound() case.
 */
export async function fetchShopifyPlusProduct(
  platform: string,
  config: ShopifyPlusConfig,
  storeName: string,
  handle: string,
  defaultGender?: string
): Promise<StoreProduct | null> {
  const data = await graphqlRequest<GetSingleProductData>(config, GET_SINGLE_PRODUCT_QUERY, { handle });
  if (!data.product) return null;
  return normaliseGqlProduct(data.product, platform, storeName, config, defaultGender);
}

/**
 * Listing fetch — collection-scoped when params.category resolves to a
 * real collection handle, catalog-wide otherwise. Mirrors
 * fetchShopifyProducts' ProviderFetchResult shape, including honest
 * pagination: Storefront API's Relay-style cursor pagination doesn't
 * expose a total count any more than REST's /products.json does, so
 * totalPages/total here follow the same "walk pages, report an exact
 * total once we've seen the actual last page, otherwise a lower bound"
 * approach — just walking a GraphQL cursor forward instead of REST's
 * page,limit + exponential/binary search.
 *
 * NOTE: server-side search IS available here (the `query` param on
 * `products`), unlike REST — so unlike shopify.ts, a search request
 * does not need to over-fetch 250 and filter client-side. Full-text
 * `query` syntax is Shopify's own search-query DSL; simple free-text is
 * passed straight through and matches title/description/tags/vendor
 * reasonably well without extra massaging.
 */
export async function fetchShopifyPlusProducts(
  platform: string,
  config: ShopifyPlusConfig,
  storeName: string,
  params: ProviderFetchParams,
  defaultGender?: string
): Promise<ProviderFetchResult> {
  const perPage = params.perPage;
  const sortKeyMap: Record<string, string> = {
    price_asc: 'PRICE',
    price_desc: 'PRICE',
    newest: 'CREATED',
    title: 'TITLE',
  };
  const sortKey = params.sort ? sortKeyMap[params.sort] : undefined;
  const reverse = params.sort === 'price-desc' || params.sort === 'newest';

  // Walk cursors forward from page 1 to reach params.page — GraphQL
  // cursor pagination has no direct "jump to page N" the way REST's
  // ?page= does. Cheap in practice: catalog browsing rarely jumps deep
  // pages without visiting the ones before it, and each hop is one
  // lightweight GraphQL call.
  let after: string | undefined;
  let pageInfo: PageInfo = { hasNextPage: true, endCursor: null };
  let nodes: GqlProduct[] = [];
  let collectionExists = true;

  for (let page = 1; page <= params.page; page++) {
    if (params.category) {
      const data = await graphqlRequest<GetCollectionProductsData>(config, GET_COLLECTION_PRODUCTS_QUERY, {
        handle: params.category,
        first: perPage,
        after,
        sortKey,
        reverse,
      });
      if (!data.collection) {
        collectionExists = false;
        nodes = [];
        pageInfo = { hasNextPage: false, endCursor: null };
        break;
      }
      nodes = data.collection.products.edges.map((e) => e.node);
      pageInfo = data.collection.products.pageInfo;
    } else {
      const data = await graphqlRequest<GetAllProductsData>(config, GET_ALL_PRODUCTS_QUERY, {
        first: perPage,
        after,
        sortKey,
        reverse,
        query: params.search || undefined,
      });
      nodes = data.products.edges.map((e) => e.node);
      pageInfo = data.products.pageInfo;
    }
    if (page < params.page) {
      if (!pageInfo.hasNextPage) {
        // Requested page is past the end — return an empty page rather
        // than erroring, matching how shopify.ts's REST provider
        // silently returns [] for an out-of-range ?page=.
        nodes = [];
        break;
      }
      after = pageInfo.endCursor ?? undefined;
    }
  }

  // Category was requested but no such collection exists — fall back to
  // loose product_type matching against the unscoped catalog, same
  // fallback shopify.ts applies when collectionMap/live-handle lookup
  // both miss.
  if (params.category && !collectionExists) {
    const data = await graphqlRequest<GetAllProductsData>(config, GET_ALL_PRODUCTS_QUERY, {
      first: 250,
      after: undefined,
      sortKey,
      reverse,
      query: undefined,
    });
    nodes = data.products.edges
      .map((e) => e.node)
      .filter((p) => (p.productType ?? '').toLowerCase() === params.category!.toLowerCase());
    pageInfo = { hasNextPage: false, endCursor: null };
  }

  let products = nodes.map((p) => normaliseGqlProduct(p, platform, storeName, config, defaultGender));
  products = applySort(products, params.sort);

  const fallbackTotal = (params.page - 1) * perPage + products.length;
  const totalIsExact = !pageInfo.hasNextPage;
  const totalPages = totalIsExact ? params.page : params.page + 1;

  return {
    products,
    total: fallbackTotal,
    totalPages,
    totalIsExact,
  };
}

/**
 * Full collection list (handle + title) — GraphQL equivalent of
 * shopify.ts's fetchShopifyCollections. No sitemap-merge step here: the
 * REST provider needs that because /collections.json is known to
 * silently omit some published collections on certain stores, but the
 * Storefront API's `collections` connection is the SAME data the
 * storefront itself renders its own nav from, so there's no analogous
 * blind spot to patch around.
 */
export async function fetchShopifyPlusCollections(config: ShopifyPlusConfig): Promise<ShopifyCollectionSummary[]> {
  const collections: ShopifyCollectionSummary[] = [];
  let after: string | undefined;

  while (true) {
    const data = await graphqlRequest<GetCollectionsData>(config, GET_COLLECTIONS_QUERY, { first: 250, after });
    for (const edge of data.collections.edges) {
      collections.push({ handle: edge.node.handle, title: edge.node.title });
    }
    if (!data.collections.pageInfo.hasNextPage) break;
    after = data.collections.pageInfo.endCursor ?? undefined;
  }

  return collections;
}

/**
 * True if this origin has ALREADY been confirmed as a headless-Shopify
 * store (cache hit only — never triggers discovery). Cheap synchronous
 * check for a router that wants to skip straight to the GraphQL tier on
 * a repeat request without awaiting discoverShopifyPlusConfig again.
 */
export function isKnownShopifyPlusStore(originUrl: string): boolean {
  return getCachedConfig(new URL(originUrl).origin) != null;
}