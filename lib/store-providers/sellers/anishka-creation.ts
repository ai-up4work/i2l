// lib/store-providers/sellers/anishka-creation.ts
//
// Hardcoded, one-off extractor for anishkacreation.com — deliberately NOT
// routed through the generic 'html-scrape' provider (html-scrape.ts).
//
// Why hardcode instead of using the generic selector config: Anishka's
// detail-page markup reuses the exact same classes for different rows —
// the Design/Catalog/Price rows are all `.col-sm-3.pd1` (label) +
// `.col-sm-8.pd3` (value), and the "Product Details" header and its own
// content row are BOTH `.col-sm-12.text-center.pd4` — distinguished only
// by a sibling's TEXT ("Price" vs "Design" vs "Catalog", or a <b> tag
// on the header). A single CSS selector string can't express "the .pd3
// that's a sibling of the .pd1 whose text says Price" — that needs real
// code walking the DOM, not a config field. Same reasoning this project
// already uses to hardcode Myntra/eBay/AliExpress/etc. as
// `marketplaceStores` in data/stores/data.ts instead of forcing every
// marketplace through one generic shape.
//
// Wired in by PLATFORM SLUG ('anishka-creation'), not a new
// StoreProviderType — see the `platform === 'anishka-creation'` checks in
// lib/store-providers/product.ts and app/api/stores/[platform]/route.ts,
// both of which call straight into this file before ever looking at the
// seller's own provider_config. That config can stay a minimal/unused
// html-scrape stub in the sellers table; these functions never read it.
//
// Catalog-of-items model: a category page lists CATALOGS (e.g. "Catalog -
// 17432"); each catalog's own detail page (/p/{id}) lists several
// individually-priced, individually-photographed DESIGNS. Every design
// becomes a StoreProductVariant of one StoreProduct — not a separate
// product — since they're the same base garment in different prints/
// colors, exactly the "all the images and types are variants" model.

import * as cheerio from 'cheerio';
import type { CheerioAPI, Cheerio } from 'cheerio';
import { cleanText, detectCurrencyAndClean } from '@/lib/scrape/shared';
import type { StoreProduct, StoreProductVariant } from '@/lib/store.types';
import type { ProviderFetchParams, ProviderFetchResult } from '../types';
import { applySort } from '../types';

export const ANISHKA_BASE_URL = 'https://www.anishkacreation.com';

// Real category slugs, taken directly from the site's own navbar markup.
// Key is whatever WishDrop's storefront passes as params.category; value
// is the real path on anishkacreation.com. "MEN'S WEAR" keeps its literal
// apostrophe — that's the site's actual path, not a typo, and `new URL()`
// percent-encodes it correctly on its own.
export const ANISHKA_CATEGORY_PATHS: Record<string, string> = {
  'New In': '/category/new-arrival',
  'Salwar Suit': '/category/salwar-suit',
  Sarees: '/category/sarees',
  Lehengas: '/category/lehengas',
  Kurtis: '/category/kurtis',
  Gowns: '/category/gowns',
  "Men's Wear": "/category/MEN'S WEAR",
  Accessories: '/category/accessories',
  'Western Wear': '/category/western-wear',
};

const DEFAULT_CATEGORY = 'Salwar Suit'; // used whenever no category filter is active

const HEADERS = { 'User-Agent': 'Mozilla/5.0 (compatible; StoreCatalog/1.0)', Accept: 'text/html' };

async function fetchHtml(url: string): Promise<CheerioAPI> {
  const res = await fetch(url, { headers: HEADERS, cache: 'no-store' });
  if (!res.ok) throw new Error(`anishkacreation fetch failed: ${res.status} ${url}`);
  return cheerio.load(await res.text());
}

function hrefToHandle(url: URL): string {
  return encodeURIComponent(url.pathname + url.search);
}

function handleToUrl(handle: string): URL {
  return new URL(decodeURIComponent(handle), ANISHKA_BASE_URL);
}

// Matches "Min 1595 - Max 1595 INR" — the category grid's card puts a
// catalog's name and its price range in ONE text block (`.women .caf`),
// not two separate elements. See fetchAnishkaCreationProducts below.
const PRICE_RANGE_RE = /Min\s*([\d,.]+)\s*-\s*Max\s*([\d,.]+)\s*([A-Za-z]{3})?/i;

function priceFromRangeOrText(raw: string | null): { price: number; currency: string } {
  if (raw) {
    const m = raw.match(PRICE_RANGE_RE);
    if (m) return { price: Number(m[1].replace(/,/g, '')) || 0, currency: (m[3] ?? 'INR').toUpperCase() };
  }
  const { amount, code } = detectCurrencyAndClean(raw, 'INR');
  return { price: amount ? Number(amount) : 0, currency: code ?? 'INR' };
}

function stripPriceRangeSuffix(text: string): string {
  return text.split(PRICE_RANGE_RE)[0].trim();
}

/** Prefers a lazy-load `data-src` over `src` — the category grid lazy-
 * loads (only `data-src` is real pre-JS), the catalog detail page doesn't
 * (plain `src` is already the real URL) — this covers both without
 * needing to know which page it's on. */
function imageSrc($el: Cheerio<any>): string | undefined {
  return $el.attr('data-src') || $el.attr('src') || undefined;
}

/**
 * On the catalog detail page, each design's thumbnail (`<img src="…/image/300/ACB1145.jpg">`)
 * is wrapped in its own `<a href="…/ACB1145.jpg">` pointing at the real,
 * full-resolution original — the site's own "click to zoom" link, not a
 * navigation link. `/image/300/` (and the smaller `/image/100/` used for
 * the extra thumbnails elsewhere) are server-resized crops; the bare
 * filename with no `/image/NNN/` segment is the source file. Always
 * prefer that href over the thumbnail `src` for exactly this reason —
 * the low-res version is only ever meant for the grid, not for what a
 * shopper actually views.
 */
function highResImage($linkWrap: Cheerio<any>): string | undefined {
  const href = $linkWrap.attr('href');
  if (href) return href;
  // Falls back to the thumbnail only if the design has no wrapping link
  // at all (shouldn't happen on a real page, but better than no image).
  return imageSrc($linkWrap.find('img').first());
}

/**
 * Category grid — confirmed against a real /category/MEN'S%20WEAR page.
 * Card markup: `.product-tab-grid.simpleCart_shelfItem`, name+price range
 * combined in `.women .caf`, image in `.grid-arrival img` (lazy-loaded),
 * link in `.grid-arrival a`. Pagination via `?page=N`; total/total pages
 * read from the page's own "Page 1 of 14 ... out of 160 total" footer
 * when present, since a card-count-per-page guess would be wrong for any
 * page but the last.
 */
export async function fetchAnishkaCreationProducts(
  platform: string,
  storeName: string,
  params: ProviderFetchParams
): Promise<ProviderFetchResult> {
  const path = ANISHKA_CATEGORY_PATHS[params.category] ?? ANISHKA_CATEGORY_PATHS[DEFAULT_CATEGORY];
  const url = new URL(path, ANISHKA_BASE_URL);
  if (params.page > 1) url.searchParams.set('page', String(params.page));

  const $ = await fetchHtml(url.toString());
  const products: StoreProduct[] = [];

  $('.product-tab-grid.simpleCart_shelfItem').each((_, el) => {
    const $card = $(el);
    const titleRaw = cleanText($card.find('.women .caf').first());
    const href = $card.find('.grid-arrival a').first().attr('href')?.trim();
    if (!titleRaw || !href) return;

    const title = PRICE_RANGE_RE.test(titleRaw) ? stripPriceRangeSuffix(titleRaw) : titleRaw;
    if (!title) return;
    const { price, currency } = priceFromRangeOrText(titleRaw);
    const image = imageSrc($card.find('.grid-arrival img').first());

    let productUrl: URL;
    try {
      productUrl = new URL(href, ANISHKA_BASE_URL);
    } catch {
      return;
    }
    const handle = hrefToHandle(productUrl);

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
      inStock: true,
      category: params.category || DEFAULT_CATEGORY,
      condition: 'New',
      description: title,
      seller: storeName,
      url: productUrl.toString(),
    });
  });

  let filtered = products;
  if (params.search) {
    const q = params.search.toLowerCase();
    filtered = filtered.filter((p) => p.name.toLowerCase().includes(q));
  }
  filtered = applySort(filtered, params.sort);

  const bodyText = $.root().text();
  const totalMatch = bodyText.match(/out of\s+([\d,]+)\s+total/i);
  const total = totalMatch ? Number(totalMatch[1].replace(/,/g, '')) : filtered.length;
  const totalPages = totalMatch ? Math.max(1, Math.ceil(total / Math.max(1, filtered.length))) : 1;

  return { products: filtered, total, totalPages, totalIsExact: Boolean(totalMatch) };
}

/** Reads the value cell of a Design/Catalog/Price row by the LABEL
 * cell's own text — these three rows share identical classes
 * (`.pd1` label + `.pd3` value, siblings under one wrapper `<div>`), so
 * this is the only reliable way to tell them apart. */
function readRowByLabel($item: Cheerio<any>, $: CheerioAPI, label: string): string | null {
  let value: string | null = null;
  $item.find('.pd1').each((_, labelEl) => {
    const labelText = cleanText($(labelEl))?.trim().toLowerCase();
    if (labelText === label.toLowerCase()) {
      value = cleanText($(labelEl).parent().find('.pd3').first());
    }
  });
  return value;
}

/** Reads the "Product Details" fabric text — its own header and content
 * row share the same classes too (`.col-sm-12.text-center.pd4`), told
 * apart only by the header having a `<b>` child. */
function readProductDetails($item: Cheerio<any>, $: CheerioAPI): string | undefined {
  let value: string | undefined;
  $item.find('.pd4').each((_, pd4El) => {
    if ($(pd4El).find('b').length) {
      value = cleanText($(pd4El).parent().next().find('.pd4').first()) ?? undefined;
    }
  });
  return value;
}

/**
 * Finds which column (if any) of the summary table is actually the Size
 * column, by reading the table's own `<thead>` — NOT a fixed position.
 * The table's column count varies per catalog: some have 4 columns
 * (Catalog Name / Full Catalog Price / Size / Buy Full Catalog), others
 * — made-to-order items with no fixed sizing — only have 3 (no Size
 * column at all, confirmed against a real page: catalog 17505). Assuming
 * Size always sits at a fixed index meant a 3-column catalog's "Buy Full
 * Catalog" cell (containing a "Book Now" button) got read as if it were
 * a size. Returns -1 when there's genuinely no Size column on this
 * catalog, which readCatalogSizes treats as "show no Sizes section at
 * all" rather than showing a broken one.
 */
function findSizeColumnIndex($: CheerioAPI): number {
  let index = -1;
  $('table.table-bordered thead tr').first().find('th').each((i, th) => {
    if (cleanText($(th))?.trim().toLowerCase() === 'size') index = i;
  });
  return index;
}

/**
 * Reads the catalog-level Size row — "Size: M(38"),L(40"),XL(42"),XXL(44")"
 * plus a "Size Chart" button, all inside one `<td>` with no class of its
 * own to key off; see findSizeColumnIndex for how its column position is
 * actually located. Shared across every design in the catalog — this is
 * one size list for the whole catalog, not per-design — hence a separate
 * top-level `options` entry rather than living on each variant the way
 * Design does.
 */
function readCatalogSizes($: CheerioAPI): string[] {
  const sizeColumnIndex = findSizeColumnIndex($);
  if (sizeColumnIndex < 0) return []; // this catalog has no Size column — nothing to show, not a fallback guess
  const $sizeCell = $('table.table-bordered tbody tr').first().find('td').eq(sizeColumnIndex);
  if (!$sizeCell.length) return [];
  // Strip the "Size Chart" button before reading text, or its own label
  // would get appended onto the size list ("M(38"),...,XXL(44")Size Chart").
  const raw = $sizeCell.clone().find('button').remove().end().text();
  const withoutLabel = raw.replace(/^\s*Size:?\s*/i, '').trim();
  if (!withoutLabel) return [];
  return withoutLabel
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Catalog detail page — confirmed against a real /p/17432 page. Each
 * repeating `.product_wrap` block is one "design" (a color/print variant
 * of the same base garment): code in `.promotion .new-product`,
 * availability in `.promotion .discount`, two image resolutions off the
 * `<a>` wrapping `#links img` — the thumbnail `<img src>` for the small
 * swatch icon, the `<a>`'s own href for the full-resolution main photo
 * (see highResImage's own comment) — (duplicate `id="links"` across the
 * page, but `.find()` scoped to one `.product_wrap` only ever sees its
 * own), price/fabric via the label-text lookups above. All designs
 * become variants of one StoreProduct.
 */
export async function fetchAnishkaCreationProduct(
  platform: string,
  storeName: string,
  handle: string
): Promise<StoreProduct | null> {
  const url = handleToUrl(handle);
  const $ = await fetchHtml(url.toString());

  const variants: StoreProductVariant[] = [];
  let firstImage: string | undefined;
  let firstDescription: string | undefined;

  $('.product_wrap').each((i, el) => {
    const $item = $(el);
    const label = cleanText($item.find('.promotion .new-product').first());
    if (!label) return;

    const priceText = readRowByLabel($item, $, 'Price');
    const { price } = priceFromRangeOrText(priceText);
    const availabilityText = cleanText($item.find('.promotion .discount').first());
    const available = !availabilityText || !/out of stock|sold ?out|unavailable/i.test(availabilityText);
    // Two different resolutions, two different uses: the small swatch
    // icon in the picker (~36px) only ever needs the thumbnail — loading
    // the full-resolution original there is wasted bandwidth for
    // something that small, especially with 6+ swatches on one page.
    // The MAIN product photo (what a shopper actually looks at) still
    // wants the real high-res version — see highResImage's own comment.
    const $link = $item.find('#links a').first();
    const thumbImage = imageSrc($link.find('img').first());
    const fullImage = highResImage($link) ?? thumbImage;
    const description = readProductDetails($item, $);

    if (i === 0) {
      firstImage = fullImage;
      firstDescription = description;
    }

    variants.push({
      id: `${hrefToHandle(url)}::${label}`,
      title: label,
      price,
      available,
      options: [label],
      image: thumbImage,
      fullImage: fullImage !== thumbImage ? fullImage : undefined,
    });
  });

  if (!variants.length) return null;

  const handleOut = hrefToHandle(url);
  const lowestPrice = Math.min(...variants.map((v) => v.price));
  const pageTitle = cleanText($('title').first())?.split(/\s[-|]\s/)[0]?.trim();
  const sizes = readCatalogSizes($);

  return {
    id: handleOut,
    handle: handleOut,
    storeSlug: platform,
    stockCount: null,
    name: pageTitle || `Catalog ${handleOut}`,
    image: firstImage ?? '',
    images: firstImage ? [firstImage] : [],
    price: lowestPrice,
    currency: 'INR',
    inStock: variants.some((v) => v.available),
    category: 'General',
    condition: 'New',
    description: firstDescription ?? '',
    seller: storeName,
    url: url.toString(),
    // Named 'Color' (not 'Design') on purpose — SizeAndColorPicker.tsx
    // only ever renders a swatch picker for an option literally named
    // 'size' or 'color' (case-insensitive); anything else silently shows
    // nothing. Each design IS effectively a color/print variant of the
    // same garment, so this isn't a stretch — and it's what actually
    // gets these 6 designs to render as clickable, photo-backed swatches
    // at all, via the SAME colorImageMap() lookup that already exists
    // for any other seller's real color variants.
    //
    // 'Size' is deliberately NOT in this options array. The source site
    // has no per-size stock signal — its size list is one shared note
    // for the whole catalog, not a real purchasable dimension — and
    // optionAvailability() (lib/product-options.ts) locks every value of
    // any option it can't find a matching variant for. Leaving Size out
    // of `options` means there's nothing for it to fail to match against,
    // so the picker correctly defaults every size to available instead of
    // showing all four as locked. `sizes` below still populates the
    // picker itself — this only controls the (non-existent) per-size
    // availability check.
    options: [{ name: 'Color', values: variants.map((v) => v.title) }],
    colors: variants.map((v) => v.title),
    variantLabel: 'Variants',
    sizes: sizes.length ? sizes : undefined,
    variants,
  };
}
