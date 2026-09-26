// lib/store-providers/html-scrape.ts
//
// Implements the 'html-scrape' StoreProviderType — previously defined in
// store-config.ts and exposed in the seller onboarding form, but never
// actually wired into the fetch dispatchers (app/api/stores/[platform]/route.ts
// and lib/store-providers/product.ts both fell through to the mock
// provider for this type). That meant a seller configured as html-scrape
// silently showed FAKE mock products on their storefront page instead of
// their real catalog, or erroring — the worst of both, since nothing
// flagged it as broken. This file is the real implementation; product.ts
// and app/api/stores/[platform]/route.ts both need a case added for it
// (see those files) or this is still dead code.
//
// Two shapes are supported, both driven by the same config
// (see HtmlScrapeProviderConfig in store-config.ts):
//
// 1. Classic — one page per product. `selectors` (productCard/title/
//    price/image/link) parse the grid; `selectors.link` points to a real
//    single-product detail page, parsed the same way Shopify/WooCommerce
//    would be for a single product's PDP. Most sites with genuinely no
//    JSON API fall here.
// 2. Catalog-of-items — a listing card links to a page that itself lists
//    several purchasable items (e.g. a wholesale "catalog" page showing
//    several individually-priced designs). Set `detail` and the detail
//    page's repeating items become StoreProduct.variants on one
//    StoreProduct, rather than being treated as one flat product each.
//    Anishka Creation (anishkacreation.com) is the first real example of
//    this — see its seller config for concrete selector values.
//
// No JS rendering: every selector operates on the RAW fetched HTML via
// cheerio, same engine as lib/scrape/parsers.ts's site extractors. A site
// that needs client-side rendering to show its listing/detail content
// (check via lib/scrape/shared.ts's looksLikeJsRequiredShell) is not a
// fit for this provider — it would need fetchRendered (Playwright)
// wired in as a second tier, not attempted here since Anishka Creation
// (and every other site this was built against) doesn't need it.

import * as cheerio from 'cheerio';
import type { CheerioAPI, Cheerio } from 'cheerio';
import { cleanText, detectCurrencyAndClean, domainCurrency } from '@/lib/scrape/shared';
import type { StoreProduct, StoreProductVariant } from '@/lib/store.types';
import type { HtmlScrapeProviderConfig } from '@/lib/store-config';
import type { ProviderFetchParams, ProviderFetchResult } from './types';
import { applySort } from './types';

const DEFAULT_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (compatible; StoreCatalog/1.0)',
  Accept: 'text/html',
};

async function fetchHtml(url: string, headers?: Record<string, string>): Promise<CheerioAPI> {
  const res = await fetch(url, { headers: { ...DEFAULT_HEADERS, ...headers }, cache: 'no-store' });
  if (!res.ok) throw new Error(`html-scrape fetch failed: ${res.status} ${url}`);
  const html = await res.text();
  return cheerio.load(html);
}

/** Resolves a possibly-relative href to an absolute URL, or null if the card has none. */
function resolveHref(href: string | undefined, baseUrl: string): URL | null {
  if (!href) return null;
  try {
    return new URL(href, baseUrl);
  } catch {
    return null;
  }
}

/**
 * A product's `handle` needs to round-trip back to the real detail-page
 * URL with no extra config (no per-site URL template) — encoding the
 * resolved path+query is what lets fetchHtmlScrapeProduct reconstruct it
 * for ANY site's URL pattern, not just ones following a known convention
 * the way Shopify (/products/{handle}) or WooCommerce (/product/{slug}/)
 * do.
 */
function hrefToHandle(url: URL): string {
  return encodeURIComponent(url.pathname + url.search);
}

function handleToUrl(handle: string, baseUrl: string): URL {
  return new URL(decodeURIComponent(handle), baseUrl);
}

/** Public counterpart to hrefToHandle, for callers that only have a raw
 * pasted URL (e.g. the "test a specific product" admin tool) rather than
 * a cheerio-resolved card href. Same encoding, so a handle produced here
 * round-trips through fetchHtmlScrapeProduct identically. */
export function urlToHandle(rawUrl: string, baseUrl: string): string | null {
  const url = resolveHref(rawUrl.trim(), baseUrl);
  return url ? hrefToHandle(url) : null;
}

function priceFromText(raw: string | null, domainHint: string | null, fallbackCurrency?: string) {
  const { amount, code } = detectCurrencyAndClean(raw, domainHint);
  return { price: amount ? Number(amount) : 0, currency: code ?? fallbackCurrency ?? 'INR' };
}

// Matches "Min 1595 - Max 1595 INR" / "Min 811-Max 811 INR" style ranges —
// first observed on Anishka Creation's category pages, where a card's
// price lives as free text alongside its title rather than in its own
// element. Generic enough to reuse anywhere else the same "Min X - Max Y
// CUR" convention shows up, not something special-cased to one seller.
const PRICE_RANGE_RE = /Min\s*([\d,.]+)\s*-\s*Max\s*([\d,.]+)\s*([A-Za-z]{3})?/i;

/** Range-aware price read: tries "Min X - Max Y CUR" first (using the
 * lower bound as the grid's representative "starting from" price), then
 * falls back to a normal single-amount parse. */
function priceFromRangeOrText(raw: string | null, domainHint: string | null) {
  if (raw) {
    const m = raw.match(PRICE_RANGE_RE);
    if (m) {
      const amount = m[1].replace(/,/g, '');
      return { price: Number(amount) || 0, currency: (m[3] ?? domainHint ?? 'INR').toUpperCase() };
    }
  }
  return priceFromText(raw, domainHint);
}

/** Strips a trailing "Min X - Max Y CUR" range (and everything from it
 * onward) back out of a title/price node's shared text, for the combined-
 * text-block case described on HtmlScrapeProviderConfig.selectors.price. */
function stripPriceRangeSuffix(text: string): string {
  return text.split(PRICE_RANGE_RE)[0].trim();
}

/** Prefers a lazy-load `data-src` over `src` — most sites only populate
 * `src` once a real browser's intersection observer fires, so a plain
 * server-side fetch (no JS) sees an empty/placeholder `src` and the real
 * URL sitting in `data-src` instead. Falls back to `src` for sites that
 * don't lazy-load at all. */
function imageSrc($el: Cheerio<any>): string | undefined {
  return $el.attr('data-src') || $el.attr('src') || undefined;
}

// Matches "Page 1 of 14, showing 12 record(s) out of 160 total" (and the
// looser "out of N total" substring alone) — a generic enough pagination-
// footer convention to detect on any listing page, not specific to one
// site. Falls back to counting this page's own cards when absent.
const TOTAL_COUNT_RE = /out of\s+([\d,]+)\s+total/i;

function buildListingUrl(baseListingUrl: string, pageParam: string | undefined, page: number): string {
  if (!pageParam || page <= 1) return baseListingUrl;
  const url = new URL(baseListingUrl);
  url.searchParams.set(pageParam, String(page));
  return url.toString();
}

/** Resolves which listing page a request actually targets \u2014 the
 * category-specific page from `categoryMap` when the shopper picked a
 * mapped category, otherwise the seller's default `listingUrl`. A
 * category with no entry in the map falls back to `listingUrl` too
 * (same "unmapped category shows everything" behavior WooCommerce's
 * adapter already has) rather than erroring. */
function resolveListingUrl(config: HtmlScrapeProviderConfig, category: string): string {
  const mapped = category ? config.categoryMap?.[category] : undefined;
  if (!mapped) return config.listingUrl;
  try {
    return new URL(mapped, config.baseUrl).toString();
  } catch {
    return config.listingUrl;
  }
}

/** Grid/listing fetch — builds the catalogue page. */
export async function fetchHtmlScrapeProducts(
  platform: string,
  config: HtmlScrapeProviderConfig,
  storeName: string,
  params: ProviderFetchParams
): Promise<ProviderFetchResult> {
  // With selectors.pageParam set, each Wishdrop page maps 1:1 to the
  // source site's own page N — params.perPage is then whatever that
  // source page returns, not a Wishdrop-side slice (see the total/
  // totalPages handling below, which prefers the source's own reported
  // count over counting cards on this one page). Without pageParam,
  // this fetches the listing page once and paginates client-side instead
  // (the previous, single-page-only behavior).
  const baseListingUrl = resolveListingUrl(config, params.category);
  const requestUrl = buildListingUrl(baseListingUrl, config.selectors.pageParam, params.page);
  const $ = await fetchHtml(requestUrl, config.headers);
  const domainHint = config.currency ?? domainCurrency(config.baseUrl);

  const products: StoreProduct[] = [];
  $(config.selectors.productCard).each((_, el) => {
    const $card = $(el);
    const titleRaw = cleanText($card.find(config.selectors.title).first());
    const image = imageSrc($card.find(config.selectors.image).first());
    const href = $card.find(config.selectors.link).first().attr('href')?.trim();
    const url = resolveHref(href, config.baseUrl);
    if (!titleRaw || !url) return; // no usable card without at least a name + a detail link

    const priceText = config.selectors.price ? cleanText($card.find(config.selectors.price).first()) : null;
    const { price, currency } = priceText
      ? priceFromRangeOrText(priceText, domainHint)
      : { price: 0, currency: domainHint ?? 'INR' };
    // Only strip the range suffix back out of the title when it's
    // actually present in this card's title text — true when title and
    // price point at the same combined-text node, a no-op otherwise.
    const title = PRICE_RANGE_RE.test(titleRaw) ? stripPriceRangeSuffix(titleRaw) : titleRaw;
    if (!title) return;

    const handle = hrefToHandle(url);
    products.push({
      id: handle,
      handle,
      storeSlug: platform,
      stockCount: null,
      name: title,
      image: image ?? '',
      images: image ? [image] : [],
      price,
      currency,
      // No price selector configured (or none found on this card) means
      // the source site itself never shows a price on the grid — true
      // for wholesale/reseller catalog sites like Anishka Creation,
      // where price only exists once you open a specific item. The UI
      // should treat price === 0 with no selector configured as "view
      // for price", not a real free item.
      inStock: true,
      category: params.category || 'General',
      condition: 'New',
      description: title,
      seller: storeName,
      url: url.toString(),
    });
  });

  let filtered = products;
  if (params.search) {
    const q = params.search.toLowerCase();
    filtered = filtered.filter((p) => p.name.toLowerCase().includes(q));
  }
  filtered = applySort(filtered, params.sort);

  if (config.selectors.pageParam) {
    // Source site already paginated this for us — trust its own
    // reported total when the footer text is there, rather than only
    // ever knowing about the cards on this one page.
    const bodyText = $.root().text();
    const totalMatch = bodyText.match(TOTAL_COUNT_RE);
    const total = totalMatch ? Number(totalMatch[1].replace(/,/g, '')) : filtered.length;
    const totalPages = totalMatch ? Math.max(1, Math.ceil(total / Math.max(1, filtered.length))) : 1;
    return { products: filtered, total, totalPages, totalIsExact: Boolean(totalMatch) };
  }

  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / params.perPage));
  const sliced = filtered.slice((params.page - 1) * params.perPage, params.page * params.perPage);

  return { products: sliced, total, totalPages, totalIsExact: true };
}

/** Single-product (or single-catalog-of-items) detail fetch. */
export async function fetchHtmlScrapeProduct(
  platform: string,
  config: HtmlScrapeProviderConfig,
  storeName: string,
  handle: string
): Promise<StoreProduct | null> {
  const url = handleToUrl(handle, config.baseUrl);
  const $ = await fetchHtml(url.toString(), config.headers);
  const domainHint = config.currency ?? domainCurrency(config.baseUrl);

  if (config.detail) {
    return parseCatalogOfItems($, url, platform, storeName, config.detail, domainHint);
  }
  return parseSingleProduct($, url, platform, storeName, config, domainHint);
}

function parseSingleProduct(
  $: CheerioAPI,
  url: URL,
  platform: string,
  storeName: string,
  config: HtmlScrapeProviderConfig,
  domainHint: string | null
): StoreProduct | null {
  const title = cleanText($(config.selectors.title).first());
  if (!title) return null;
  const image = imageSrc($(config.selectors.image).first()) ?? '';
  const priceText = config.selectors.price ? cleanText($(config.selectors.price).first()) : null;
  const { price, currency } = priceText ? priceFromText(priceText, domainHint) : { price: 0, currency: domainHint ?? 'INR' };
  const handle = hrefToHandle(url);

  return {
    id: handle,
    handle,
    storeSlug: platform,
    stockCount: null,
    name: title,
    image,
    images: image ? [image] : [],
    price,
    currency,
    inStock: true,
    category: 'General',
    condition: 'New',
    description: title,
    seller: storeName,
    url: url.toString(),
  };
}

/**
 * A "catalog" detail page listing several purchasable items — each
 * becomes a StoreProductVariant on one parent StoreProduct (the catalog
 * itself), not a separate product. The parent's own name/image come from
 * the page's first item as a reasonable representative, since the source
 * site (unlike a real single-product PDP) has no single catalog-level
 * title/photo of its own beyond that.
 */
function parseCatalogOfItems(
  $: CheerioAPI,
  url: URL,
  platform: string,
  storeName: string,
  detail: NonNullable<HtmlScrapeProviderConfig['detail']>,
  domainHint: string | null
): StoreProduct | null {
  const variants: StoreProductVariant[] = [];
  let firstImage: string | undefined;
  let firstDescription: string | undefined;

  $(detail.item).each((i, el) => {
    const $item = $(el);
    const label = cleanText($item.find(detail.itemLabel).first());
    if (!label) return;
    const priceText = cleanText($item.find(detail.price).first());
    const { price } = priceFromText(priceText, domainHint);
    const image = imageSrc($item.find(detail.image).first());
    const availabilityText = detail.availability ? cleanText($item.find(detail.availability).first()) : null;
    const available = !availabilityText || !/out of stock|sold ?out|unavailable/i.test(availabilityText);

    if (i === 0) {
      firstImage = image ?? undefined;
      firstDescription = detail.description ? (cleanText($item.find(detail.description).first()) ?? undefined) : undefined;
    }

    variants.push({
      id: `${hrefToHandle(url)}::${label}`,
      title: label,
      price,
      available,
      options: [label],
      image: image ?? undefined,
    });
  });

  if (!variants.length) return null;

  const handle = hrefToHandle(url);
  const currency = domainHint ?? 'INR';
  const lowestPrice = Math.min(...variants.map((v) => v.price));
  // No catalog-level title exists on this kind of page by definition —
  // fall back to the page's own <title>, cleaned of a common " - Site
  // Name" suffix, rather than the handle (which is a URL-encoded path,
  // not something a shopper should ever see). Still weaker than the
  // grid card's own title text (already shown once when they clicked
  // through) — if StoreProduct gains a way to pass that through from the
  // detail route later, prefer it over this.
  const pageTitle = cleanText($('title').first())?.split(/\s[-|]\s/)[0]?.trim();

  return {
    id: handle,
    handle,
    storeSlug: platform,
    stockCount: null,
    name: pageTitle || `Catalog ${handle}`,
    image: firstImage ?? '',
    images: firstImage ? [firstImage] : [],
    price: lowestPrice,
    currency,
    inStock: variants.some((v) => v.available),
    category: 'General',
    condition: 'New',
    description: firstDescription ?? '',
    seller: storeName,
    url: url.toString(),
    options: [{ name: 'Design', values: variants.map((v) => v.title) }],
    variants,
  };
}
