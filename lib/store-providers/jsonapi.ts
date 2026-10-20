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
 * These backends range from ad-hoc shapes a small store's own frontend
 * happens to call, to documented partner feeds with auth and pagination.
 * Treat every field as untyped and possibly missing; don't assume the
 * next product added to their catalog will look like the last one.
 */
type RawRecord = Record<string, unknown>;

const DEFAULT_OUT_OF_STOCK_VALUES = ['out of stock', 'outofstock', 'sold out', 'soldout', '0', 'false', 'no'];

/** Keys checked (in order) when a response is an object and no listPath is configured. */
const COMMON_LIST_KEYS = ['products', 'items', 'data', 'results', 'records', 'docs', 'nodes', 'list'];

/** Env vars a config may read secrets from. Anything else is refused — see JsonApiAuthConfig. */
const SECRET_ENV_PREFIX = 'STORE_SECRET_';

const DEFAULT_MAX_PAGES = 20;
const DEFAULT_PAGE_SIZE = 100;

const WEIGHT_TO_KG: Record<'kg' | 'g' | 'lb' | 'oz', number> = {
  kg: 1,
  g: 0.001,
  lb: 0.453592,
  oz: 0.0283495,
};

// ── Field paths ──────────────────────────────────────────────────────────────

function readSinglePath(raw: unknown, path: string): unknown {
  if (!path.includes('.')) {
    return raw && typeof raw === 'object' ? (raw as RawRecord)[path] : undefined;
  }
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc == null || typeof acc !== 'object') return undefined;
    if (Array.isArray(acc)) {
      const idx = Number(key);
      return Number.isInteger(idx) ? acc[idx < 0 ? acc.length + idx : idx] : undefined;
    }
    return (acc as RawRecord)[key];
  }, raw);
}

/**
 * Reads a configured field path. Supports:
 *   'price'             flat key
 *   'price.amount'      nested object
 *   'images.0.src'      array index (negative counts from the end)
 *   'sale_price|price'  fallbacks, first non-empty wins
 */
export function readField(raw: unknown, field: string | undefined): unknown {
  if (!field) return undefined;
  const alternatives = field.split('|').map((f) => f.trim()).filter(Boolean);
  for (const alt of alternatives) {
    const v = readSinglePath(raw, alt);
    if (v !== undefined && v !== null && v !== '') return v;
  }
  return undefined;
}

function readString(raw: unknown, field: string | undefined, fallback = ''): string {
  const v = readField(raw, field);
  if (typeof v === 'string') return v;
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  return fallback;
}

function toNumber(v: unknown): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'string' && v.trim() !== '') {
    // Tolerate "1,100.00" and "Rs. 1100" style strings from hand-rolled feeds.
    const n = parseFloat(v.replace(/[^0-9.\-]/g, ''));
    if (!Number.isNaN(n)) return n;
  }
  return NaN;
}

function readNumber(raw: unknown, field: string | undefined, fallback = 0): number {
  const n = toNumber(readField(raw, field));
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Arrays of strings, or arrays of objects where each has an obvious
 * string (src/url/name/value/title) — e.g. images: [{ src: '...' }].
 */
function readStringArray(raw: unknown, field: string | undefined): string[] | undefined {
  const v = readField(raw, field);
  if (!Array.isArray(v)) return undefined;
  const out: string[] = [];
  for (const item of v) {
    if (typeof item === 'string') {
      if (item.trim()) out.push(item);
    } else if (typeof item === 'number') {
      out.push(String(item));
    } else if (item && typeof item === 'object') {
      const o = item as RawRecord;
      const s = ['src', 'url', 'href', 'name', 'value', 'title', 'label'].map((k) => o[k]).find((x) => typeof x === 'string');
      if (typeof s === 'string' && s.trim()) out.push(s);
    }
  }
  return out.length ? out : undefined;
}

function readRawArray(raw: unknown, field: string | undefined): RawRecord[] | undefined {
  const v = readField(raw, field);
  return Array.isArray(v) ? (v.filter((x) => x && typeof x === 'object') as RawRecord[]) : undefined;
}

/**
 * Finds the record array inside a response. Explicit path first; then a
 * bare array; then the common wrapper keys (one level, and one level
 * under `data`). Returns [] when nothing array-shaped is found.
 */
export function extractRecordList(data: unknown, path: string | undefined): RawRecord[] {
  if (path) {
    const v = readField(data, path);
    return Array.isArray(v) ? (v as RawRecord[]) : [];
  }
  if (Array.isArray(data)) return data as RawRecord[];
  if (!data || typeof data !== 'object') return [];
  const obj = data as RawRecord;
  for (const key of COMMON_LIST_KEYS) {
    if (Array.isArray(obj[key])) return obj[key] as RawRecord[];
  }
  if (obj.data && typeof obj.data === 'object' && !Array.isArray(obj.data)) {
    const inner = obj.data as RawRecord;
    for (const key of COMMON_LIST_KEYS) {
      if (Array.isArray(inner[key])) return inner[key] as RawRecord[];
    }
  }
  // Last resort: the only array-of-objects value at the top level.
  const arrays = Object.values(obj).filter((v) => Array.isArray(v) && v.length > 0 && typeof v[0] === 'object');
  return arrays.length === 1 ? (arrays[0] as RawRecord[]) : [];
}

// ── Requests ─────────────────────────────────────────────────────────────────

function resolveSecret(config: JsonApiProviderConfig): string | undefined {
  const auth = config.auth;
  if (!auth) return undefined;
  if (auth.valueEnv) {
    if (!auth.valueEnv.startsWith(SECRET_ENV_PREFIX)) {
      throw new Error(`Auth env var "${auth.valueEnv}" is not allowed — it must start with ${SECRET_ENV_PREFIX}.`);
    }
    const v = process.env[auth.valueEnv];
    if (v) return v;
    if (!auth.value) throw new Error(`Auth env var ${auth.valueEnv} is not set on the server.`);
  }
  return auth.value || undefined;
}

/** Builds a full request URL from an endpoint (path or absolute URL) plus config-level query params and auth. */
function buildUrl(config: JsonApiProviderConfig, endpoint: string, params?: Record<string, string | number | undefined>): URL {
  const url = /^https?:\/\//i.test(endpoint)
    ? new URL(endpoint)
    : new URL(`${config.baseUrl.replace(/\/+$/, '')}/${endpoint.replace(/^\/+/, '')}`);
  for (const [k, v] of Object.entries(config.queryParams ?? {})) url.searchParams.set(k, v);
  for (const [k, v] of Object.entries(params ?? {})) {
    if (v !== undefined && v !== '') url.searchParams.set(k, String(v));
  }
  const secret = resolveSecret(config);
  if (secret && config.auth?.type === 'query') {
    url.searchParams.set(config.auth.name || 'api_key', secret);
  }
  return url;
}

function buildHeaders(config: JsonApiProviderConfig): Record<string, string> {
  const headers: Record<string, string> = { ...HEADERS, ...config.headers };
  const secret = resolveSecret(config);
  if (secret && config.auth) {
    if (config.auth.type === 'header') headers[config.auth.name || 'x-api-key'] = secret;
    if (config.auth.type === 'bearer') headers.Authorization = `Bearer ${secret}`;
    if (config.auth.type === 'basic') headers.Authorization = `Basic ${Buffer.from(secret).toString('base64')}`;
  }
  return headers;
}

async function fetchJson(
  config: JsonApiProviderConfig,
  endpoint: string,
  params: Record<string, string | number | undefined> | undefined,
  label: string
): Promise<{ status: number; data: unknown }> {
  const url = buildUrl(config, endpoint, params);
  const res = await fetch(url.toString(), {
    headers: buildHeaders(config),
    next: { revalidate: CACHE_SECONDS },
  });
  if (res.status === 401 || res.status === 403) {
    throw new Error(`${label} returned ${res.status} — check the API key / auth settings.`);
  }
  if (res.status === 404) return { status: 404, data: null };
  if (!res.ok) throw new Error(`${label} returned ${res.status}`);
  try {
    return { status: res.status, data: (await res.json()) as unknown };
  } catch {
    throw new Error(`${label} did not return valid JSON.`);
  }
}

/** Page-size param name: default 'limit'; 'none' means the feed takes no page-size param. */
function resolveLimitParam(name: string | undefined): string | undefined {
  if (!name || !name.trim()) return 'limit';
  return name.trim().toLowerCase() === 'none' ? undefined : name.trim();
}

/**
 * Fetches every raw product record from listEndpoint, walking upstream
 * pagination when configured. `capped` is true when maxPages stopped the
 * walk before the feed said it was done.
 */
async function fetchAllRaw(
  platform: string,
  config: JsonApiProviderConfig,
  extraParams: Record<string, string | undefined> = {},
  endpoint = config.listEndpoint
): Promise<{ records: RawRecord[]; capped: boolean; upstreamTotal?: number }> {
  const label = `JSON API feed for ${platform}`;
  const pg = config.pagination;

  if (!pg) {
    const { data } = await fetchJson(config, endpoint, extraParams, label);
    return { records: extractRecordList(data, config.listPath), capped: false };
  }

  const pageSize = pg.pageSize && pg.pageSize > 0 ? pg.pageSize : DEFAULT_PAGE_SIZE;
  const maxPages = pg.maxPages && pg.maxPages > 0 ? pg.maxPages : DEFAULT_MAX_PAGES;
  const limitParam = resolveLimitParam(pg.limitParam);
  const pageParam = pg.pageParam || (pg.type === 'offset' ? 'offset' : pg.type === 'cursor' ? 'cursor' : 'page');
  const startPage = pg.startPage ?? 1;

  const records: RawRecord[] = [];
  const seenFirstIds = new Set<string>();
  let cursor: string | undefined;
  let upstreamTotal: number | undefined;

  for (let i = 0; i < maxPages; i++) {
    const params: Record<string, string | number | undefined> = { ...extraParams };
    if (limitParam) params[limitParam] = pageSize;
    if (pg.type === 'page') params[pageParam] = startPage + i;
    if (pg.type === 'offset') params[pageParam] = i * pageSize;
    if (pg.type === 'cursor' && cursor) params[pageParam] = cursor;

    const { data } = await fetchJson(config, endpoint, params, label);
    const page = extractRecordList(data, config.listPath);
    if (page.length === 0) return { records, capped: false, upstreamTotal };

    // Guard against a feed that ignores the page param and returns page 1 forever.
    const firstId = JSON.stringify(readField(page[0], config.idField) ?? page[0]);
    if (seenFirstIds.has(firstId)) return { records, capped: false, upstreamTotal };
    seenFirstIds.add(firstId);

    records.push(...page);

    const total = pg.totalPath ? toNumber(readField(data, pg.totalPath)) : NaN;
    if (Number.isFinite(total)) upstreamTotal = total;
    const totalPages = pg.totalPagesPath ? toNumber(readField(data, pg.totalPagesPath)) : NaN;
    const hasMore = pg.hasMorePath ? readField(data, pg.hasMorePath) : undefined;

    if (Number.isFinite(total) && records.length >= total) return { records, capped: false, upstreamTotal };
    if (Number.isFinite(totalPages) && i + 1 >= totalPages) return { records, capped: false, upstreamTotal };
    if (hasMore === false || hasMore === 'false') return { records, capped: false, upstreamTotal };
    if (pg.type === 'cursor') {
      const next = readField(data, pg.nextCursorPath || 'nextCursor');
      if (typeof next !== 'string' && typeof next !== 'number') return { records, capped: false, upstreamTotal };
      cursor = String(next);
    } else if (page.length < pageSize && !Number.isFinite(total) && !Number.isFinite(totalPages) && hasMore === undefined) {
      // A short page with no other signal means we just read the last one.
      return { records, capped: false, upstreamTotal };
    }
  }
  return { records, capped: true, upstreamTotal };
}

// ── Normalisation ────────────────────────────────────────────────────────────

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
 * regularPriceField / salePriceField / compareAtPriceField are configured.
 * Mirrors the WooCommerce adapter's on_sale logic: if a sale price is
 * genuinely lower than a regular price, that's the discount signal; a bare
 * priceField with no regular/sale distinction just becomes price with no
 * sale data (the honest state for a backend with no sale-pricing concept).
 */
function readPricing(
  raw: RawRecord,
  config: JsonApiProviderConfig
): { price: number; compareAtPrice?: number; onSale?: boolean } {
  const base = applyPriceUnit(readNumber(raw, config.priceField, 0), config);

  const regularRaw = config.regularPriceField ? readNumber(raw, config.regularPriceField, NaN) : NaN;
  const saleRaw = config.salePriceField ? readNumber(raw, config.salePriceField, NaN) : NaN;
  const compareRaw = config.compareAtPriceField ? readNumber(raw, config.compareAtPriceField, NaN) : NaN;
  const regular = Number.isFinite(regularRaw) ? applyPriceUnit(regularRaw, config) : undefined;
  const sale = Number.isFinite(saleRaw) && saleRaw > 0 ? applyPriceUnit(saleRaw, config) : undefined;
  const compareAt = Number.isFinite(compareRaw) ? applyPriceUnit(compareRaw, config) : undefined;

  if (regular != null && sale != null && sale < regular) {
    return { price: sale, compareAtPrice: regular, onSale: true };
  }
  const effective = base > 0 ? base : sale ?? regular ?? 0;
  const was = compareAt ?? regular;
  if (was != null && was > effective && effective > 0) {
    // priceField itself is already the effective (possibly discounted) price
    return { price: effective, compareAtPrice: was, onSale: true };
  }
  return { price: effective };
}

/**
 * Interprets a raw availability value. 'auto' (used for variants, where
 * there's no separate type setting) accepts booleans, quantities and
 * status text alike.
 */
function interpretStock(
  value: unknown,
  type: 'boolean' | 'quantity' | 'status' | 'auto',
  config: JsonApiProviderConfig,
  fallback: boolean
): boolean {
  if (value === undefined || value === null || value === '') return fallback;

  if (type === 'quantity') {
    const n = toNumber(value);
    return Number.isFinite(n) ? n > 0 : fallback;
  }

  const outValues = (config.outOfStockValues ?? DEFAULT_OUT_OF_STOCK_VALUES).map((v) => v.toLowerCase());

  if (type === 'status') {
    const s = String(value).trim().toLowerCase();
    return s ? !outValues.includes(s) : fallback;
  }

  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value > 0;
  if (typeof value === 'string') {
    const s = value.trim().toLowerCase();
    if (!s) return fallback;
    if (type === 'auto') {
      const n = Number(s);
      if (Number.isFinite(n)) return n > 0;
      return !outValues.includes(s);
    }
    return !['false', '0', 'no'].includes(s);
  }
  return fallback;
}

/**
 * Falls back to config.defaultInStock (or true) whenever stockField is
 * unset or its value can't be confidently read — never guesses "out of
 * stock" from ambiguous data, since a false negative (hiding a sellable
 * product) is worse than a false positive here.
 */
function readInStock(raw: RawRecord, config: JsonApiProviderConfig): boolean {
  const fallback = config.defaultInStock ?? true;
  if (!config.stockField) return fallback;
  return interpretStock(readField(raw, config.stockField), config.stockFieldType ?? 'boolean', config, fallback);
}

/**
 * Structured option axes (Size/Color/etc with independent values). Prefers
 * config.optionsField's raw [{name, values}] shape if present — values may
 * be strings or {value|name|label} objects; otherwise synthesizes an axis
 * list from the flat sizes/colors already extracted.
 */
function readOptions(raw: RawRecord, config: JsonApiProviderConfig, sizes?: string[], colors?: string[]): StoreProductOption[] | undefined {
  if (config.optionsField) {
    const rawOptions = readRawArray(raw, config.optionsField);
    if (rawOptions?.length) {
      const parsed = rawOptions
        .map((o) => {
          const name = readString(o, 'name|label|title');
          const values = readStringArray(o, 'values|options|items') ?? [];
          return { name, values };
        })
        .filter((o) => o.name && o.values.length);
      if (parsed.length) return parsed;
    }
  }
  const synthesized: StoreProductOption[] = [];
  if (sizes?.length) synthesized.push({ name: 'Size', values: sizes });
  if (colors?.length) synthesized.push({ name: 'Color', values: colors });
  return synthesized.length ? synthesized : undefined;
}

function resolveUrl(config: JsonApiProviderConfig, value: string): string {
  if (!value) return value;
  if (/^https?:\/\//i.test(value)) return value;
  if (value.startsWith('//')) return `https:${value}`;
  return `${config.baseUrl.replace(/\/+$/, '')}/${value.replace(/^\/+/, '')}`;
}

/**
 * Real per-variant data (own id/price/stock/option-values/image). Falls
 * back to the parent's price when a variant has no price of its own, and
 * to the joined option values for a title.
 */
function readVariants(raw: RawRecord, config: JsonApiProviderConfig, parentPrice: number): StoreProductVariant[] | undefined {
  if (!config.variantsField) return undefined;
  const rawVariants = readRawArray(raw, config.variantsField);
  if (!rawVariants?.length) return undefined;

  const variants = rawVariants.map((rv, idx) => {
    const id = (config.variantIdField && readString(rv, config.variantIdField)) || String(idx);
    const options = (config.variantOptionsField && readStringArray(rv, config.variantOptionsField)) || [];
    const title = (config.variantTitleField && readString(rv, config.variantTitleField)) || options.join(' / ') || id;
    const ownPrice = config.variantPriceField ? readNumber(rv, config.variantPriceField, NaN) : NaN;
    const price = Number.isFinite(ownPrice) ? applyPriceUnit(ownPrice, config) : parentPrice;
    const compareAtRaw = config.variantCompareAtPriceField ? readNumber(rv, config.variantCompareAtPriceField, NaN) : NaN;
    const compareAtPrice = Number.isFinite(compareAtRaw) && applyPriceUnit(compareAtRaw, config) > price
      ? applyPriceUnit(compareAtRaw, config)
      : undefined;
    const available = config.variantAvailableField
      ? interpretStock(readField(rv, config.variantAvailableField), 'auto', config, true)
      : true;
    const imageRaw = config.variantImageField ? readString(rv, config.variantImageField) : '';
    const variant: StoreProductVariant = { id, title, price, compareAtPrice, available, options };
    if (imageRaw) variant.image = resolveUrl(config, imageRaw);
    return variant;
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
  const handle = (config.handleField && readString(raw, config.handleField)) || id;

  // Images: prefer a real array field; fall back to wrapping a single
  // image string. Most small custom backends only ever give one, but
  // richer ones (a real product gallery) will have imagesField instead.
  const imagesFromArray = readStringArray(raw, config.imagesField);
  const singleImage = readString(raw, config.imageField);
  const images = (imagesFromArray?.length ? imagesFromArray : singleImage ? [singleImage] : []).map((u) => resolveUrl(config, u));
  const image = images[0] ?? '';

  const pricing = readPricing(raw, config);

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

  const rawUrl = config.urlField ? readString(raw, config.urlField) : '';
  const url = rawUrl
    ? resolveUrl(config, rawUrl)
    : config.productUrlPath
    ? `${config.baseUrl.replace(/\/+$/, '')}${config.productUrlPath.replace('{handle}', encodeURIComponent(handle)).replace('{id}', encodeURIComponent(id))}`
    : undefined;

  const genderRaw = config.genderField ? readString(raw, config.genderField).toLowerCase().trim() : '';
  const gender = genderRaw === 'men' || genderRaw === 'women' || genderRaw === 'unisex' ? genderRaw : undefined;

  const variants = readVariants(raw, config, pricing.price);

  // A parent with no usable price of its own (common on variant-first
  // feeds) shows its cheapest variant — what a shopper actually pays from.
  let { price, compareAtPrice, onSale } = pricing;
  if (price <= 0 && variants?.length) {
    const cheapest = variants.reduce((min, v) => (v.price > 0 && v.price < min.price ? v : min), variants[0]);
    price = cheapest.price;
    compareAtPrice = cheapest.compareAtPrice;
    onSale = cheapest.compareAtPrice != null ? true : undefined;
  }

  // No product-level stock signal but real variant data: in stock if any variant is.
  const inStock = !config.stockField && variants?.length && config.variantAvailableField
    ? variants.some((v) => v.available)
    : readInStock(raw, config);

  const currency = (config.currencyField && readString(raw, config.currencyField).trim().toUpperCase()) || config.currency || 'INR';

  return {
    id,
    handle,
    storeSlug: platform,
    name: readString(raw, config.nameField).trim(),
    image,
    images,
    price,
    stockCount: config.stockFieldType === 'quantity' && config.stockField
      ? readNumber(raw, config.stockField, 0)
      : 0,
    currency,
    compareAtPrice,
    onSale,
    inStock,
    category: category || 'General',
    condition: (config.conditionField && readString(raw, config.conditionField)) || 'New',
    description: stripHtml(readString(raw, config.descriptionField)),
    seller,
    url,
    vendor: config.vendorField ? readString(raw, config.vendorField) || undefined : undefined,
    productType: config.productTypeField ? readString(raw, config.productTypeField) || undefined : undefined,
    tags: tags.length ? tags : undefined,
    options: readOptions(raw, config, sizes, colors),
    variants,
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

// ── Categories endpoint (shared by listing + categories) ─────────────────────

interface EndpointCategory {
  id: string;
  name: string;
  count?: number;
  image?: string;
}

async function fetchEndpointCategories(config: JsonApiProviderConfig): Promise<EndpointCategory[]> {
  if (!config.categoriesEndpoint) return [];
  const { data } = await fetchJson(config, config.categoriesEndpoint, undefined, 'Categories endpoint');
  return extractRecordList(data, config.categoriesPath)
    .map((raw) => {
      const name = readString(raw, config.categoryNameField || 'name|title|label').replace(/\s+/g, ' ').trim();
      const id = readString(raw, config.categoryIdField || 'id|slug|handle') || name;
      const countRaw = config.categoryCountField ? readNumber(raw, config.categoryCountField, NaN) : NaN;
      const image = config.categoryImageField ? readString(raw, config.categoryImageField) : '';
      return {
        id,
        name,
        count: Number.isFinite(countRaw) ? countRaw : undefined,
        image: image ? resolveUrl(config, image) : undefined,
      };
    })
    .filter((c) => c.name);
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Uses server-side search/category endpoints when the config declares
 * them; falls back to fetching the full list (every page, when paginated)
 * and filtering client-side when it doesn't.
 */
export async function fetchJsonApiProducts(
  platform: string,
  config: JsonApiProviderConfig,
  storeName: string,
  params: ProviderFetchParams
): Promise<ProviderFetchResult> {
  let rawList: RawRecord[];
  let capped = false;

  if (params.search && config.searchEndpoint) {
    // A genuinely separate search route.
    const endpoint = config.searchEndpoint.replace('{q}', encodeURIComponent(params.search));
    ({ records: rawList, capped } = await fetchAllRaw(platform, config, {}, endpoint));
  } else {
    // Either no server-side search at all, or search is just a query
    // param on listEndpoint itself (the common case).
    const extra: Record<string, string | undefined> = {};
    if (params.search && config.searchQueryParam) extra[config.searchQueryParam] = params.search;
    if (params.category && config.categoryQueryParam) {
      let value = params.category;
      if (config.categoryQueryValue === 'id' && config.categoriesEndpoint) {
        const cats = await fetchEndpointCategories(config).catch(() => []);
        value = cats.find((c) => c.name.toLowerCase() === params.category.toLowerCase())?.id ?? value;
      }
      extra[config.categoryQueryParam] = value;
    }
    ({ records: rawList, capped } = await fetchAllRaw(platform, config, extra));
  }

  let products = rawList.map((raw) => normaliseJsonApiProduct(raw, platform, storeName, config));

  if (params.category && !config.categoryQueryParam) {
    // Exact match first — a substring match would put "Women" under "Men".
    // Substring is only the fallback, for messy free-text category values.
    const q = params.category.toLowerCase().trim();
    const exact = products.filter((p) => p.category.toLowerCase().trim() === q);
    products = exact.length ? exact : products.filter((p) => p.category.toLowerCase().includes(q));
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

  return { products: sliced, total, totalPages, totalIsExact: !capped };
}

/**
 * Single-product lookup. Tries config.detailEndpoint if set; otherwise
 * (or on any failure from that endpoint) falls back to the full list and
 * matches by id or handle.
 */
export async function fetchJsonApiProduct(
  platform: string,
  config: JsonApiProviderConfig,
  storeName: string,
  handle: string
): Promise<StoreProduct | null> {
  if (config.detailEndpoint) {
    const endpoint = config.detailEndpoint
      .replace('{id}', encodeURIComponent(handle))
      .replace('{handle}', encodeURIComponent(handle));
    try {
      const { status, data } = await fetchJson(config, endpoint, undefined, `JSON API detail for ${platform}`);
      if (status === 404) return null;
      const raw = config.detailPath ? readField(data, config.detailPath) : data;
      if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
        return normaliseJsonApiProduct(raw as RawRecord, platform, storeName, config);
      }
    } catch (err) {
      // Auth failures are real config problems — surface them. Anything
      // else (500, unexpected shape) falls through to the list lookup
      // rather than erroring on what's often a flaky host.
      if (err instanceof Error && /auth|API key/i.test(err.message)) throw err;
    }
  }

  const { records } = await fetchAllRaw(platform, config);
  const match = records.find(
    (raw) =>
      readString(raw, config.idField) === handle ||
      (config.handleField ? readString(raw, config.handleField) === handle : false)
  );
  return match ? normaliseJsonApiProduct(match, platform, storeName, config) : null;
}

// ── Category values ──────────────────────────────────────────────────────────

export interface JsonApiCategorySummary {
  value: string;
  count: number;
  /** Category id/slug from categoriesEndpoint, when one is configured. */
  id?: string;
  image?: string;
}

/**
 * Prefers a real categoriesEndpoint when configured. Otherwise — like
 * before — derives categories from the store's OWN product data: fetch
 * the full list and report the distinct categoryField values with counts.
 * With an endpoint but no count field, counts are filled from product
 * data when categoryField is mapped.
 *
 * Returns [] if there's nothing to derive or the fetch fails, rather
 * than throwing.
 */
export async function fetchJsonApiCategories(
  config: JsonApiProviderConfig
): Promise<JsonApiCategorySummary[]> {
  try {
    if (config.categoriesEndpoint) {
      const cats = await fetchEndpointCategories(config);
      let counted: Map<string, number> | undefined;
      if (cats.some((c) => c.count === undefined) && config.categoryField) {
        counted = await countCategoryValues(config);
      }
      return cats
        .map((c) => ({
          value: c.name,
          id: c.id,
          image: c.image,
          count: c.count ?? counted?.get(c.name) ?? 0,
        }))
        .sort((a, b) => b.count - a.count);
    }

    if (!config.categoryField) return [];
    const counts = await countCategoryValues(config);
    return Array.from(counts.entries())
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => b.count - a.count); // most common first — likely the more useful nav order
  } catch {
    return [];
  }
}

async function countCategoryValues(config: JsonApiProviderConfig): Promise<Map<string, number>> {
  const { records } = await fetchAllRaw('categories', config);
  const counts = new Map<string, number>();
  for (const raw of records) {
    const value = readString(raw, config.categoryField).replace(/\s+/g, ' ').trim();
    if (!value) continue;
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return counts;
}

/**
 * Admin-only diagnostic: fetches the first page of the raw list exactly
 * as the adapter would, returning the unmodified first record and where
 * the list was found. Backs the "Show raw first record" helper in the
 * seller form, so field paths can be written against real data.
 */
export async function fetchJsonApiRawSample(
  config: JsonApiProviderConfig
): Promise<{ first: RawRecord | null; count: number; topLevelKeys: string[] }> {
  const pg = config.pagination;
  const params: Record<string, string | number | undefined> = {};
  if (pg) {
    const limitParam = resolveLimitParam(pg.limitParam);
    if (limitParam) params[limitParam] = Math.min(pg.pageSize ?? DEFAULT_PAGE_SIZE, 5);
    if (pg.type === 'page') params[pg.pageParam || 'page'] = pg.startPage ?? 1;
  }
  const { data } = await fetchJson(config, config.listEndpoint, params, 'JSON API feed');
  const list = extractRecordList(data, config.listPath);
  const topLevelKeys = data && typeof data === 'object' && !Array.isArray(data) ? Object.keys(data as RawRecord) : [];
  return { first: list[0] ?? null, count: list.length, topLevelKeys };
}
