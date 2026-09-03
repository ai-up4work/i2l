// lib/store-providers/jsonapi.ts
import type { StoreProduct, StoreProductOption, StoreProductVariant } from '@/lib/store.types';
import type { JsonApiProviderConfig } from '@/lib/store-config';
import type { ProviderFetchParams, ProviderFetchResult } from './types';
import { applySort, stripHtml } from './types';

const CACHE_SECONDS = 60 * 10; // 10 min
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (compatible; StoreCatalog/1.0)',
  Accept: 'application/json',
};

/**
 * These backends were never designed as a public catalog API — they're
 * whatever ad-hoc shape a small store's own frontend happens to call.
 * Treat every field as untyped and possibly missing; don't assume the
 * next product added to their catalog will look like the last one.
 */
type RawRecord = Record<string, unknown>;

const DEFAULT_OUT_OF_STOCK_VALUES = ['out of stock', 'outofstock', 'sold out', 'soldout', '0', 'false', 'no'];

const WEIGHT_TO_KG: Record<'kg' | 'g' | 'lb' | 'oz', number> = {
  kg: 1,
  g: 0.001,
  lb: 0.453592,
  oz: 0.0283495,
};

/**
 * Supports dot-path access ('price.amount', 'stock.quantity') for richer
 * backends that nest data, not just flat top-level keys — skyt-boutique
 * doesn't need this (everything's flat), but a more structured API will.
 */
function readField(raw: RawRecord, field: string | undefined): unknown {
  if (!field) return undefined;
  if (!field.includes('.')) return raw[field];
  return field.split('.').reduce<unknown>((acc, key) => {
    if (acc && typeof acc === 'object' && key in (acc as RawRecord)) {
      return (acc as RawRecord)[key];
    }
    return undefined;
  }, raw);
}

function readString(raw: RawRecord, field: string | undefined, fallback = ''): string {
  const v = readField(raw, field);
  return typeof v === 'string' ? v : fallback;
}

function readNumber(raw: RawRecord, field: string | undefined, fallback = 0): number {
  const v = readField(raw, field);
  if (typeof v === 'number') return v;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = parseFloat(v);
    if (!Number.isNaN(n)) return n;
  }
  return fallback;
}

function readStringArray(raw: RawRecord, field: string | undefined): string[] | undefined {
  const v = readField(raw, field);
  return Array.isArray(v) && v.every((x) => typeof x === 'string') ? (v as string[]) : undefined;
}

function readRawArray(raw: RawRecord, field: string | undefined): RawRecord[] | undefined {
  const v = readField(raw, field);
  return Array.isArray(v) ? (v as RawRecord[]) : undefined;
}

/**
 * Only converts when BOTH a field and its unit are configured — a field
 * name alone tells you nothing about what unit the raw number is in, and
 * a wrong guess here is worse than no data at all (it looks valid and
 * silently corrupts anything downstream that trusts weightKg, e.g.
 * shipping cost calculations). Matches store.types.ts's documented
 * contract: leave weightKg undefined rather than guess.
 */
function readWeightKg(raw: RawRecord, config: JsonApiProviderConfig): number | undefined {
  if (!config.weightField || !config.weightUnit) return undefined;
  const n = readNumber(raw, config.weightField, NaN);
  return Number.isFinite(n) ? n * WEIGHT_TO_KG[config.weightUnit] : undefined;
}

function applyPriceUnit(raw: number, config: JsonApiProviderConfig): number {
  return config.priceUnit === 'minor' ? raw / 100 : raw;
}

/**
 * Resolves price + compareAtPrice + onSale from whichever of priceField /
 * regularPriceField / salePriceField are configured. Mirrors the WooCommerce
 * adapter's on_sale logic: if a sale price is genuinely lower than a
 * regular price, that's the discount signal; a bare priceField with no
 * regular/sale distinction just becomes price with no sale data (which is
 * the honest state for a backend that has no sale-pricing concept at all,
 * like skyt-boutique).
 */
function readPricing(
  raw: RawRecord,
  config: JsonApiProviderConfig
): { price: number; compareAtPrice?: number; onSale?: boolean } {
  const base = applyPriceUnit(readNumber(raw, config.priceField, 0), config);

  const regularRaw = config.regularPriceField ? readNumber(raw, config.regularPriceField, NaN) : NaN;
  const saleRaw = config.salePriceField ? readNumber(raw, config.salePriceField, NaN) : NaN;
  const regular = Number.isFinite(regularRaw) ? applyPriceUnit(regularRaw, config) : undefined;
  const sale = Number.isFinite(saleRaw) ? applyPriceUnit(saleRaw, config) : undefined;

  if (regular != null && sale != null && sale < regular) {
    return { price: sale, compareAtPrice: regular, onSale: true };
  }
  if (regular != null && regular > base) {
    // priceField itself is already the effective (possibly discounted) price
    return { price: base, compareAtPrice: regular, onSale: true };
  }
  return { price: base };
}

/**
 * Interprets stockField per stockFieldType. Falls back to
 * config.defaultInStock (or true) whenever stockField is unset or its
 * value can't be confidently read — never guesses "out of stock" from
 * ambiguous data, since a false negative (hiding a sellable product)
 * is worse than a false positive here.
 */
function readInStock(raw: RawRecord, config: JsonApiProviderConfig): boolean {
  if (!config.stockField) return config.defaultInStock ?? true;
  const value = readField(raw, config.stockField);
  const type = config.stockFieldType ?? 'boolean';

  if (type === 'quantity') {
    const n = typeof value === 'number' ? value : parseFloat(String(value));
    return Number.isFinite(n) ? n > 0 : config.defaultInStock ?? true;
  }

  if (type === 'status') {
    if (value == null) return config.defaultInStock ?? true;
    const s = String(value).trim().toLowerCase();
    if (!s) return config.defaultInStock ?? true;
    const outValues = (config.outOfStockValues ?? DEFAULT_OUT_OF_STOCK_VALUES).map((v) => v.toLowerCase());
    return !outValues.includes(s);
  }

  // 'boolean' (default)
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') return !['false', '0', ''].includes(value.trim().toLowerCase());
  return config.defaultInStock ?? true;
}

/**
 * Structured option axes (Size/Color/etc with independent values), for
 * backends rich enough to model real variant selection. Prefers
 * config.optionsField's raw [{name, values}] shape if present; otherwise
 * synthesizes a best-effort axis list from the flat sizes/colors already
 * extracted (same idea as extractSizes/extractColors in types.ts, just
 * inverted — building options FROM flat fields rather than the reverse).
 */
function readOptions(raw: RawRecord, config: JsonApiProviderConfig, sizes?: string[], colors?: string[]): StoreProductOption[] | undefined {
  if (config.optionsField) {
    const rawOptions = readRawArray(raw, config.optionsField);
    if (rawOptions?.length) {
      const parsed = rawOptions
        .filter((o) => typeof o.name === 'string' && Array.isArray(o.values))
        .map((o) => ({ name: o.name as string, values: (o.values as unknown[]).filter((v) => typeof v === 'string') as string[] }));
      if (parsed.length) return parsed;
    }
  }
  const synthesized: StoreProductOption[] = [];
  if (sizes?.length) synthesized.push({ name: 'Size', values: sizes });
  if (colors?.length) synthesized.push({ name: 'Color', values: colors });
  return synthesized.length ? synthesized : undefined;
}

/**
 * Real per-variant data (own id/price/stock/option-values), for backends
 * that model products as parent+variants rather than one flat row per
 * listing. config.variantsField points at the raw array on the parent
 * product; the variant*Field configs map each entry's own fields. Falls
 * back to the parent's own price when a variant has no price field of its
 * own (some backends only vary stock/options per variant, not price).
 */
function readVariants(raw: RawRecord, config: JsonApiProviderConfig, parentPrice: number): StoreProductVariant[] | undefined {
  if (!config.variantsField) return undefined;
  const rawVariants = readRawArray(raw, config.variantsField);
  if (!rawVariants?.length) return undefined;

  const variants = rawVariants.map((rv, idx) => {
    const id = (config.variantIdField && readString(rv, config.variantIdField)) || String(idx);
    const title = (config.variantTitleField && readString(rv, config.variantTitleField)) || id;
    const price = config.variantPriceField ? applyPriceUnit(readNumber(rv, config.variantPriceField, parentPrice), config) : parentPrice;
    const compareAtRaw = config.variantCompareAtPriceField ? readNumber(rv, config.variantCompareAtPriceField, NaN) : NaN;
    const compareAtPrice = Number.isFinite(compareAtRaw) ? applyPriceUnit(compareAtRaw, config) : undefined;
    const available = config.variantAvailableField ? Boolean(readField(rv, config.variantAvailableField)) : true;
    const options = (config.variantOptionsField && readStringArray(rv, config.variantOptionsField)) || [];
    return { id, title, price, compareAtPrice, available, options };
  });

  return variants.length ? variants : undefined;
}

export function normaliseJsonApiProduct(
  raw: RawRecord,
  platform: string,
  seller: string,
  config: JsonApiProviderConfig
): StoreProduct {
  const id = readString(raw, config.idField) || readString(raw, 'id');

  // Images: prefer a real array field; fall back to wrapping a single
  // image string. Most small custom backends only ever give one, but
  // richer ones (a real product gallery) will have imagesField instead.
  const imagesFromArray = readStringArray(raw, config.imagesField);
  const singleImage = readString(raw, config.imageField);
  const images = imagesFromArray?.length ? imagesFromArray : singleImage ? [singleImage] : [];
  const image = images[0] ?? '';

  const { price, compareAtPrice, onSale } = readPricing(raw, config);

  // Trim/collapse: these free-text fields are hand-entered by shop owners
  // and inconsistent (trailing spaces, mixed casing) far more often than
  // a real e-commerce platform's structured category field would be.
  const category = config.categoryField ? readString(raw, config.categoryField).replace(/\s+/g, ' ').trim() : '';

  const colorsFromArray = readStringArray(raw, config.colorsField);
  const singleColor = config.colorField ? readString(raw, config.colorField).trim() : '';
  const colors = colorsFromArray?.length ? colorsFromArray : singleColor ? [singleColor] : undefined;

  const sizes = readStringArray(raw, config.sizesField);

  const tags = readStringArray(raw, config.tagsField) ?? [];
  if (config.featuredField && readField(raw, config.featuredField) === true) {
    tags.push('Featured');
  }

  const ratingRaw = config.averageRatingField ? readNumber(raw, config.averageRatingField, NaN) : NaN;
  const reviewCountRaw = config.reviewCountField ? readNumber(raw, config.reviewCountField, NaN) : NaN;

  const url = config.productUrlPath
    ? `${config.baseUrl}${config.productUrlPath.replace('{handle}', encodeURIComponent(id))}`
    : undefined;

  const genderRaw = config.genderField ? readString(raw, config.genderField).toLowerCase().trim() : '';
  const gender = genderRaw === 'men' || genderRaw === 'women' || genderRaw === 'unisex' ? genderRaw : undefined;

  return {
    id,
    handle: id, // no separate slug field on this kind of backend — id doubles as handle
    storeSlug: platform,
    name: readString(raw, config.nameField).trim(),
    image,
    images,
    price,
    currency: config.currency ?? 'INR',
    compareAtPrice,
    onSale,
    inStock: readInStock(raw, config),
    category: category || 'General',
    condition: (config.conditionField && readString(raw, config.conditionField)) || 'New',
    description: stripHtml(readString(raw, config.descriptionField)),
    seller,
    url,
    vendor: config.vendorField ? readString(raw, config.vendorField) || undefined : undefined,
    productType: config.productTypeField ? readString(raw, config.productTypeField) || undefined : undefined,
    tags: tags.length ? tags : undefined,
    options: readOptions(raw, config, sizes, colors),
    variants: readVariants(raw, config, price),
    sizes,
    colors,
    gender,
    sku: config.skuField ? readString(raw, config.skuField) || undefined : undefined,
    weightKg: readWeightKg(raw, config),
    fullDescription: config.fullDescriptionField ? stripHtml(readString(raw, config.fullDescriptionField)) || undefined : undefined,
    averageRating: Number.isFinite(ratingRaw) && ratingRaw > 0 ? ratingRaw : undefined,
    reviewCount: Number.isFinite(reviewCountRaw) ? reviewCountRaw : undefined,
  };
}

/**
 * For stores whose "platform" is really just a small custom backend
 * fronting a Next.js (or similar) site — discovered via the frontend's
 * own network requests rather than any documented API.
 *
 * Uses server-side search/category endpoints when the config declares
 * them; falls back to fetching the full list and filtering client-side
 * (same approach as the mock provider) when it doesn't.
 */
export async function fetchJsonApiProducts(
  platform: string,
  config: JsonApiProviderConfig,
  storeName: string,
  params: ProviderFetchParams
): Promise<ProviderFetchResult> {
  const fetchHeaders = { ...HEADERS, ...config.headers };
  const fetchOpts = { headers: fetchHeaders, next: { revalidate: CACHE_SECONDS } };

  let rawList: RawRecord[];

  if (params.search && config.searchEndpoint) {
    // A genuinely separate search route.
    const url = `${config.baseUrl}${config.searchEndpoint.replace('{q}', encodeURIComponent(params.search))}`;
    const res = await fetch(url, fetchOpts);
    if (!res.ok) throw new Error(`JSON API search for ${platform} returned ${res.status}`);
    const data = (await res.json()) as unknown;
    rawList = Array.isArray(data) ? (data as RawRecord[]) : [];
  } else {
    // Either no server-side search at all, or search is just a query
    // param on listEndpoint itself (the common case for small backends).
    const listUrl = new URL(`${config.baseUrl}${config.listEndpoint}`);
    if (params.search && config.searchQueryParam) {
      listUrl.searchParams.set(config.searchQueryParam, params.search);
    }
    if (params.category && config.categoryQueryParam) {
      listUrl.searchParams.set(config.categoryQueryParam, params.category);
    }
    const res = await fetch(listUrl.toString(), fetchOpts);
    if (!res.ok) throw new Error(`JSON API feed for ${platform} returned ${res.status}`);
    const data = (await res.json()) as unknown;
    rawList = Array.isArray(data) ? (data as RawRecord[]) : [];
  }

  let products = rawList.map((raw) => normaliseJsonApiProduct(raw, platform, storeName, config));

  if (params.category && !config.categoryQueryParam) {
    const q = params.category.toLowerCase();
    products = products.filter((p) => p.category.toLowerCase().includes(q));
  }

  if (params.search && !config.searchEndpoint && !config.searchQueryParam) {
    const q = params.search.toLowerCase();
    products = products.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q)
    );
  }

  products = applySort(products, params.sort);

  const total = products.length;
  const totalPages = Math.max(1, Math.ceil(total / params.perPage));
  const sliced = products.slice((params.page - 1) * params.perPage, params.page * params.perPage);

  return { products: sliced, total, totalPages };
}

/**
 * Single-product lookup. Tries config.detailEndpoint if set; otherwise
 * (or on any failure from that endpoint) falls back to fetching the full
 * list and filtering by id — safe here since these backends tend to be
 * small, unpaginated catalogs rather than large paginated ones.
 */
export async function fetchJsonApiProduct(
  platform: string,
  config: JsonApiProviderConfig,
  storeName: string,
  handle: string
): Promise<StoreProduct | null> {
  if (config.detailEndpoint) {
    const url = `${config.baseUrl}${config.detailEndpoint.replace('{id}', encodeURIComponent(handle))}`;
    const res = await fetch(url, { headers: { ...HEADERS, ...config.headers }, next: { revalidate: CACHE_SECONDS } });
    if (res.status === 404) return null;
    if (res.ok) {
      const raw = (await res.json()) as RawRecord;
      if (raw && typeof raw === 'object') {
        return normaliseJsonApiProduct(raw, platform, storeName, config);
      }
    }
    // Any other failure (500, unexpected shape) — fall through to list lookup
    // rather than surfacing an error for what's usually a flaky free-tier host.
  }

  const res = await fetch(`${config.baseUrl}${config.listEndpoint}`, {
    headers: { ...HEADERS, ...config.headers },
    next: { revalidate: CACHE_SECONDS },
  });
  if (!res.ok) throw new Error(`JSON API feed for ${platform} returned ${res.status}`);

  const data = (await res.json()) as unknown;
  const rawList: RawRecord[] = Array.isArray(data) ? (data as RawRecord[]) : [];
  const match = rawList.find((raw) => readString(raw, config.idField) === handle);
  return match ? normaliseJsonApiProduct(match, platform, storeName, config) : null;
}