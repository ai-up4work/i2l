// lib/store-providers/sellers/guldasta-stories.ts
//
// Hardcoded extractor for guldastastories.com — same role as
// anishka-creation.ts, but there is NO HTML to scrape: the storefront is a
// client-rendered app on Supabase, so this reads the same public PostgREST
// endpoints the site's own frontend calls, e.g.
//
//   GET /rest/v1/products?select=*&status=in.(Active,Coming Soon)&order=created_at.desc
//
// Wired in by platform slug ('guldasta-stories') everywhere anishka-creation
// is: lib/store-listing-server.ts, lib/store-providers/product.ts,
// app/api/stores/[platform]/route.ts, the admin live-count + collections
// routes, and CUSTOM_EXTRACTOR_SLUGS in ./index.ts.
//
// ENV (public anon key — the same one the website sends from every
// visitor's browser; NEVER put a service_role key here):
//   GULDASTA_SUPABASE_URL       default: https://vavcgwrqejsmsaziveqd.supabase.co
//   GULDASTA_SUPABASE_ANON_KEY  DevTools -> any supabase request -> `apikey` header
//   GULDASTA_CURRENCY           optional, default 'INR' (used only when a row has no currency column)
//   GULDASTA_PRODUCT_PATH       optional, default '/product/' — the site's product-page path prefix
//
// CONFIRMED from the site's own requests: products.status values 'Active' and
// 'Coming Soon', products.created_at / slug / price / compare_at_price / stock
// / coming_soon_date, and categories.parent_id / display_order.
//
// Everything else (name vs title, how a product points at its category, image
// columns, …) is DETECTED at runtime from the first row the API returns — see
// detectSchema(). So a column rename on their side degrades gracefully rather
// than 400-ing every request on an unknown filter column.

import type { StoreIncludedItem, StoreProduct } from '@/lib/store.types';
import type { ProviderFetchParams, ProviderFetchResult } from '../types';
import { applySort } from '../types';

const BASE = (process.env.GULDASTA_SUPABASE_URL ?? 'https://vavcgwrqejsmsaziveqd.supabase.co').replace(/\/$/, '');
const REST = `${BASE}/rest/v1`;
export const GULDASTA_SITE_URL = 'https://guldastastories.com';
const PRODUCT_PATH = process.env.GULDASTA_PRODUCT_PATH ?? '/product/';
const DEFAULT_CURRENCY = process.env.GULDASTA_CURRENCY ?? 'INR'; // site prices in ₹ (confirmed)
const PAGE_SIZE = 24;
const CACHE_MS = 10 * 60_000;
const FETCH_TIMEOUT_MS = 12_000;

/** Exactly the filter the storefront itself sends (confirmed). */
const VISIBLE_STATUSES = ['Active', 'Coming Soon'];
const STATUS_FILTER = `in.(${VISIBLE_STATUSES.join(',')})`; // -> in.(Active,Coming Soon)

type Row = Record<string, any>;

// ---------- http ----------
function headers(extra: Record<string, string> = {}): Record<string, string> {
  const key = process.env.GULDASTA_SUPABASE_ANON_KEY;
  if (!key) throw new Error('GULDASTA_SUPABASE_ANON_KEY is not set');
  return { apikey: key, Authorization: `Bearer ${key}`, Accept: 'application/json', ...extra };
}

async function rest(path: string, extra: Record<string, string> = {}): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(`${REST}/${path}`, { headers: headers(extra), cache: 'no-store', signal: ctrl.signal });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`guldasta fetch failed: ${res.status} ${path} ${body.slice(0, 200)}`);
    }
    return res;
  } finally {
    clearTimeout(t);
  }
}

function totalFrom(res: Response, fallback: number): { total: number; exact: boolean } {
  const range = res.headers.get('content-range'); // "0-23/118" or "*/0"
  const m = range?.match(/\/(\d+)$/);
  return m ? { total: Number(m[1]), exact: true } : { total: fallback, exact: false };
}

// ---------- helpers ----------
const pick = (r: Row, keys: string[]) => keys.find((k) => r[k] != null && r[k] !== '');
const firstKey = (r: Row, keys: string[]) => keys.find((k) => k in r);

/** Columns may hold an array, a JSON-encoded array, a comma list, or a single string. */
function toList(v: unknown): any[] {
  if (v == null || v === '') return [];
  if (Array.isArray(v)) return v;
  if (typeof v === 'string') {
    const s = v.trim();
    if (s.startsWith('[') || s.startsWith('{')) {
      try {
        const parsed = JSON.parse(s);
        return Array.isArray(parsed) ? parsed : [parsed];
      } catch { /* fall through */ }
    }
    return [s];
  }
  return [v];
}

function toUrl(x: any): string | null {
  // The store keeps media as {id, lg, md, thumb, archive} objects — sometimes
  // as a real JSON value, sometimes JSON-encoded inside a text column.
  if (typeof x === 'string' && x.trim().startsWith('{')) {
    try { x = JSON.parse(x); } catch { /* treat as a plain string */ }
  }
  const v = typeof x === 'string' ? x : x?.lg ?? x?.md ?? x?.url ?? x?.src ?? x?.archive ?? x?.thumb ?? x?.image_url ?? x?.secure_url ?? null;
  if (!v || typeof v !== 'string') return null;
  if (/^https?:\/\//i.test(v) || v.startsWith('//')) return v.startsWith('//') ? `https:${v}` : v;
  // A bare storage path -> public Supabase storage URL.
  return `${BASE}/storage/v1/object/public/${v.replace(/^\/+/, '')}`;
}

const dedupe = (xs: (string | null)[]) => [...new Set(xs.filter((x): x is string => !!x))];

function stripHtml(s: string): string {
  return s.replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();
}

const num = (v: unknown): number | null => {
  if (v == null || v === '') return null;
  const n = Number(String(v).replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) ? n : null;
};

// ---------- categories (cached) ----------
interface Cat { id: string; name: string; slug: string; parentId: string | null; image: string | null }

const HIDDEN_STATUS = /^(inactive|draft|hidden|archived|disabled|deleted|false)$/i;
const slugify = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

let categoryCache: { at: number; cats: Cat[]; columns: string[] } | null = null;

async function loadCategoryTable(): Promise<{ cats: Cat[]; columns: string[] }> {
  if (categoryCache && Date.now() - categoryCache.at < CACHE_MS) return categoryCache;
  let rows: Row[] = [];
  try {
    rows = await (await rest('categories?select=*&order=display_order.asc')).json();
  } catch {
    // No display_order column (or no table) — try once more without ordering.
    rows = await (await rest('categories?select=*')).json().catch(() => []);
  }
  const cats = rows
    // Status values on categories aren't confirmed — only drop rows that are clearly switched off.
    .filter((c) => !(c.status != null && HIDDEN_STATUS.test(String(c.status))) && c.is_active !== false && c.active !== false)
    .map((c) => ({
      id: String(c.id),
      name: String(c.name ?? c.title ?? c.slug ?? c.id),
      slug: String(c.slug ?? slugify(String(c.name ?? c.title ?? c.id))),
      parentId: c.parent_id != null && c.parent_id !== '' ? String(c.parent_id) : null,
      image: toUrl(c.thumbnail_url ?? c.thumbnail_asset ?? c.image ?? c.image_url ?? c.thumbnail ?? c.banner_url ?? c.banner ?? c.icon ?? null),
    }));
  categoryCache = { at: Date.now(), cats, columns: rows[0] ? Object.keys(rows[0]) : [] };
  return categoryCache;
}

// ---------- schema detection (cached) ----------
// How a product is linked to its category is NOT confirmed, so it's worked
// out from real data: every column of a sample of product rows is compared
// against the categories table (ids, slugs and names), and the column that
// matches most rows wins. If no column matches, a join table is tried.
type Link =
  | { kind: 'column'; key: string; mode: 'id' | 'text' | 'array' }
  | { kind: 'join'; table: string; productKey: string; categoryKey: string }
  | { kind: 'family'; table: string; familyKey: string; categoryKey: string }
  | null;

interface Schema {
  nameKey: string;
  searchKey: string | null;
  link: Link;
  hasCreatedAt: boolean;
  hasDeletedAt: boolean;
  productColumns: string[];
}

const NOT_CATEGORY_COLS = new Set([
  'id', 'slug', 'name', 'title', 'description', 'short_description', 'price', 'compare_at_price', 'sale_price',
  'stock', 'status', 'created_at', 'updated_at', 'coming_soon_date', 'images', 'image', 'image_url', 'sku',
  'media_assets', 'image_crops', 'active_version_id', 'deleted_at', 'barcode_value', 'supplier_sku',
]);
const JOIN_TABLES = [
  'product_categories', 'products_categories', 'category_products', 'product_category',
  'product_category_map', 'product_category_mappings', 'category_product_map', 'product_category_links',
];
/** Product rows carry family_id (confirmed); a family may be what points at the category. */
const FAMILY_TABLES = ['product_families', 'families', 'product_family'];

let schemaCache: { at: number; schema: Schema } | null = null;

function matcher(cats: Cat[]) {
  const ids = new Map(cats.map((c) => [c.id, c]));
  const text = new Map<string, Cat>();
  for (const c of cats) {
    text.set(c.name.toLowerCase(), c);
    text.set(c.slug.toLowerCase(), c);
  }
  return (v: unknown): { cat: Cat; by: 'id' | 'text' } | null => {
    if (v == null || typeof v === 'object') return null;
    const s = String(v);
    const byId = ids.get(s);
    if (byId) return { cat: byId, by: 'id' };
    const byText = text.get(s.toLowerCase().trim());
    return byText ? { cat: byText, by: 'text' } : null;
  };
}

async function detectSchema(): Promise<Schema> {
  if (schemaCache && Date.now() - schemaCache.at < CACHE_MS) return schemaCache.schema;
  const [rows, { cats }] = await Promise.all([
    rest(`products?select=*&status=${encodeURIComponent(STATUS_FILTER)}&limit=50`).then((r) => r.json() as Promise<Row[]>),
    loadCategoryTable().catch(() => ({ cats: [] as Cat[], columns: [] })),
  ]);
  const first = rows[0] ?? {};
  const productColumns = Object.keys(first);
  const nameKey = firstKey(first, ['name', 'title', 'product_name']) ?? 'name';

  let link: Link = null;
  if (cats.length && rows.length) {
    const match = matcher(cats);
    let best: { key: string; hits: number; idHits: number; isArray: boolean } | null = null;
    for (const key of productColumns) {
      if (NOT_CATEGORY_COLS.has(key)) continue;
      let hits = 0, idHits = 0, isArray = false;
      for (const r of rows) {
        const vals = Array.isArray(r[key]) ? ((isArray = true), r[key]) : toList(r[key]);
        const m = vals.map(match).find(Boolean);
        if (m) { hits++; if (m.by === 'id') idHits++; }
      }
      const better = !best || hits > best.hits || (hits === best.hits && /categ/i.test(key) && !/categ/i.test(best.key));
      if (hits > 0 && better) best = { key, hits, idHits, isArray };
    }
    if (best) {
      const isJsonText = typeof first[best.key] === 'string' && String(first[best.key]).trim().startsWith('[');
      link = {
        kind: 'column',
        key: best.key,
        mode: best.isArray || isJsonText ? 'array' : best.idHits >= best.hits / 2 ? 'id' : 'text',
      };
    } else {
      // No product column points at a category — look for a join table.
      for (const table of JOIN_TABLES) {
        try {
          const jr: Row[] = await (await rest(`${table}?select=*&limit=5`)).json();
          const keys = jr[0] ? Object.keys(jr[0]) : [];
          const productKey = keys.find((k) => /^product(_id)?$/i.test(k) || /product_?id/i.test(k));
          const categoryKey = keys.find((k) => /^categor(y|y_id|ies)$/i.test(k) || /categor(y|ies)_?id/i.test(k));
          if (productKey && categoryKey) { link = { kind: 'join', table, productKey, categoryKey }; break; }
        } catch { /* table doesn't exist — try the next name */ }
      }
      if (!link && 'family_id' in first) {
        for (const table of FAMILY_TABLES) {
          try {
            const fr: Row[] = await (await rest(`${table}?select=*&limit=5`)).json();
            const keys = fr[0] ? Object.keys(fr[0]) : [];
            const categoryKey = keys.find((k) => /^categor(y|y_id|ies|y_ids)$/i.test(k) || /categor(y|ies)_?id/i.test(k));
            if (categoryKey) { link = { kind: 'family', table, familyKey: 'family_id', categoryKey }; break; }
          } catch { /* try the next name */ }
        }
      }
    }
  }
  if (!link && rows.length) {
    // No categories table to match against: use a plain text category column, if there is one.
    const textKey = ['category', 'category_name', 'product_type', 'type'].find((k) => typeof first[k] === 'string');
    if (textKey) link = { kind: 'column', key: textKey, mode: 'text' };
  }

  const schema: Schema = {
    nameKey,
    searchKey: rows.length ? (firstKey(first, ['name', 'title', 'product_name']) ?? null) : null,
    link,
    hasCreatedAt: 'created_at' in first || !rows.length,
    hasDeletedAt: 'deleted_at' in first,
    productColumns,
  };
  if (rows.length) schemaCache = { at: Date.now(), schema }; // only cache what was learned from real rows
  return schema;
}

// ---------- catalogue index: categories + which products sit in each (cached) ----------
interface CatalogIndex {
  cats: Cat[];
  /** category id -> product ids, rolled up so a parent includes its sub-categories' products. */
  members: Map<string, Set<string>>;
  /** product id -> its first matched category */
  productCat: Map<string, Cat>;
}

let indexCache: { at: number; index: CatalogIndex } | null = null;
const INDEX_MS = 5 * 60_000;

async function fetchAllPages<T = Row>(path: string, max = 5000): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; from < max; from += 1000) {
    const res = await rest(path, { Range: `${from}-${from + 999}`, 'Range-Unit': 'items' });
    const rows: T[] = await res.json();
    out.push(...rows);
    if (rows.length < 1000) break;
  }
  return out;
}

async function catalogIndex(schema: Schema): Promise<CatalogIndex> {
  if (indexCache && Date.now() - indexCache.at < INDEX_MS) return indexCache.index;
  let { cats } = await loadCategoryTable().catch(() => ({ cats: [] as Cat[] }));
  const own = new Map<string, Set<string>>();
  const productCat = new Map<string, Cat>();
  const add = (cat: Cat, pid: string) => {
    if (!own.has(cat.id)) own.set(cat.id, new Set());
    own.get(cat.id)!.add(pid);
    if (!productCat.has(pid)) productCat.set(pid, cat);
  };
  const link = schema.link;
  const status = encodeURIComponent(STATUS_FILTER);

  if (link?.kind === 'column') {
    const rows = await fetchAllPages(`products?select=id,${link.key}&status=${status}${schema.hasDeletedAt ? '&deleted_at=is.null' : ''}&order=id.asc`);
    if (!cats.length) {
      // Derive categories from the products' own text values.
      const names = dedupe(rows.flatMap((r) => toList(r[link.key]).map((v) => (v == null ? null : String(v).trim()))));
      cats = names.map((n) => ({ id: n, name: n, slug: slugify(n), parentId: null, image: null }));
    }
    const match = matcher(cats);
    for (const r of rows) for (const v of toList(r[link.key])) { const m = match(v); if (m) add(m.cat, String(r.id)); }
  } else if (link?.kind === 'family') {
    const [visible, fams] = await Promise.all([
      fetchAllPages(`products?select=id,${link.familyKey}&status=${status}${schema.hasDeletedAt ? '&deleted_at=is.null' : ''}&order=id.asc`),
      fetchAllPages(`${link.table}?select=*`),
    ]);
    const match = matcher(cats);
    const famCats = new Map<string, Cat[]>(
      fams.map((f) => [String(f.id), toList(f[link.categoryKey]).map((v) => match(v)?.cat).filter((c): c is Cat => !!c)])
    );
    for (const r of visible) for (const c of famCats.get(String(r[link.familyKey])) ?? []) add(c, String(r.id));
  } else if (link?.kind === 'join') {
    const [visible, joins] = await Promise.all([
      fetchAllPages(`products?select=id&status=${status}${schema.hasDeletedAt ? '&deleted_at=is.null' : ''}&order=id.asc`),
      fetchAllPages(`${link.table}?select=${link.productKey},${link.categoryKey}`),
    ]);
    const visibleIds = new Set(visible.map((r) => String(r.id)));
    const match = matcher(cats);
    for (const j of joins) {
      const pid = String(j[link.productKey]);
      const m = visibleIds.has(pid) ? match(j[link.categoryKey]) : null;
      if (m) add(m.cat, pid);
    }
  }

  // Roll sub-category products up into every ancestor.
  const byId = new Map(cats.map((c) => [c.id, c]));
  const members = new Map<string, Set<string>>(cats.map((c) => [c.id, new Set(own.get(c.id) ?? [])]));
  for (const c of cats) {
    const pids = own.get(c.id);
    if (!pids) continue;
    const seen = new Set<string>([c.id]);
    let p = c.parentId ? byId.get(c.parentId) : undefined;
    while (p && !seen.has(p.id)) {
      seen.add(p.id);
      for (const id of pids) members.get(p.id)!.add(id);
      p = p.parentId ? byId.get(p.parentId) : undefined;
    }
  }

  const index = { cats, members, productCat };
  indexCache = { at: Date.now(), index };
  return index;
}

const isTopLevel = (c: Cat, cats: Cat[]) => c.parentId == null || !cats.some((p) => p.id === c.parentId);

async function findCategory(index: CatalogIndex, label: string): Promise<Cat | null> {
  const want = label.trim().toLowerCase();
  return index.cats.find((c) => c.slug.toLowerCase() === want || c.name.toLowerCase() === want || c.id === label) ?? null;
}

function descendants(cat: Cat, cats: Cat[]): Cat[] {
  const out = [cat];
  for (let i = 0; i < out.length; i++) for (const c of cats) if (c.parentId === out[i].id && !out.includes(c)) out.push(c);
  return out;
}

const pgValue = (v: string) => `"${v.replace(/["\\]/g, '\\$&')}"`;

/** PostgREST filter [column, value] restricting products to one category (and its sub-categories). */
function categoryFilter(schema: Schema, index: CatalogIndex, cat: Cat): [string, string] | null {
  const link = schema.link;
  if (!link) return null;
  const family = descendants(cat, index.cats);
  if (link.kind === 'join' || link.kind === 'family') {
    const ids = [...(index.members.get(cat.id) ?? [])];
    return ids.length ? ['id', `in.(${ids.map(pgValue).join(',')})`] : ['id', 'in.()'];
  }
  if (link.mode === 'id') return [link.key, `in.(${family.map((c) => pgValue(c.id)).join(',')})`];
  const vals = dedupe(family.flatMap((c) => [c.id, c.name, c.slug]));
  if (link.mode === 'text') return [link.key, `in.(${vals.map(pgValue).join(',')})`];
  // array / JSON-array column. A real Postgres array supports `ov`; a JSON
  // text column doesn't, so fall back to the pre-computed member ids.
  const ids = [...(index.members.get(cat.id) ?? [])];
  return ids.length ? ['id', `in.(${ids.map(pgValue).join(',')})`] : ['id', 'in.()'];
}

async function categoryNameFor(r: Row, schema: Schema): Promise<string> {
  if (r.category_name) return String(r.category_name);
  if (schema.link) {
    try {
      const index = await catalogIndex(schema);
      const hit = index.productCat.get(String(r.id));
      if (hit) return hit.name;
    } catch { /* fall through */ }
    if (schema.link.kind === 'column') {
      const v = toList(r[schema.link.key])[0];
      if (v != null && typeof v !== 'object') return String(v);
    }
  }
  return 'General';
}

// ---------- row -> StoreProduct ----------
function imagesOf(r: Row): string[] {
  // media_assets is where this store actually keeps product photos (confirmed); `images` is usually [].
  const listCols = ['media_assets', 'images', 'image_urls', 'gallery', 'gallery_images', 'photos', 'media'];
  const singleCols = ['image', 'image_url', 'main_image', 'featured_image', 'thumbnail', 'thumbnail_url', 'cover_image'];
  const fromLists = listCols.flatMap((k) => toList(r[k]));
  const fromSingles = singleCols.map((k) => r[k]);
  // Singles first: a dedicated main-image column is the better cover.
  return dedupe([...fromLists, ...fromSingles].map(toUrl)).filter((u) => !/\.(mp4|mov|webm)(\?|$)/i.test(u));
}

function videosOf(r: Row): string[] | undefined {
  const vids = dedupe(
    ['videos', 'video_urls', 'video', 'video_url', 'media_assets', 'images', 'media']
      .flatMap((k) => toList(r[k]))
      .map(toUrl)
  ).filter((u) => /\.(mp4|mov|webm)(\?|$)|\/video\/upload\//i.test(u));
  return vids.length ? vids : undefined;
}

function stringList(v: unknown): string[] | undefined {
  const xs = toList(v)
    .flatMap((x) => (typeof x === 'string' ? x.split(',') : [x?.name ?? x?.value ?? x?.label]))
    .map((x) => (x == null ? '' : String(x).trim()))
    .filter(Boolean);
  return xs.length ? [...new Set(xs)] : undefined;
}

async function mapRow(r: Row, schema: Schema, platform: string, storeName: string): Promise<StoreProduct> {
  const images = imagesOf(r);
  const price = num(r.sale_price) && num(r.sale_price)! > 0 && num(r.price) && num(r.sale_price)! < num(r.price)!
    ? num(r.sale_price)!
    : num(r.price) ?? 0;
  const compareRaw = num(r.compare_at_price) ?? (r.sale_price != null ? num(r.price) : null);
  const compareAt = compareRaw != null && compareRaw > price ? compareRaw : undefined;
  const stock = num(r.stock ?? r.stock_quantity ?? r.quantity);
  const comingSoon =
    String(r.status ?? '').toLowerCase() === 'coming soon' ||
    (!!r.coming_soon_date && new Date(r.coming_soon_date) > new Date());
  const handle = String(r.slug ?? r.id);
  const name = String(r[schema.nameKey] ?? r.name ?? r.title ?? handle);
  const descKey = pick(r, ['description', 'long_description', 'details', 'short_description']);
  const description = descKey ? stripHtml(String(r[descKey])) : '';
  const sizes = stringList(r.sizes ?? r.size_options);
  const colors = stringList(r.colors ?? r.colours ?? r.color_options);
  const tags = stringList(r.tags);
  const videos = videosOf(r);

  return {
    id: handle,
    handle,
    storeSlug: platform,
    stockCount: stock,
    name,
    image: images[0] ?? '',
    images,
    ...(videos ? { videos } : {}),
    price,
    compareAtPrice: compareAt,
    onSale: compareAt != null,
    currency: String(r.currency ?? DEFAULT_CURRENCY).toUpperCase(),
    inStock: !comingSoon && (stock == null || stock > 0),
    category: await categoryNameFor(r, schema),
    condition: 'New',
    description,
    // Keep the formatted version too — the PDP's Description tab renders HTML (headings, bullet lists).
    ...(descKey && /<[a-z]/i.test(String(r[descKey])) ? { fullDescription: String(r[descKey]) } : {}),
    seller: storeName,
    url: `${GULDASTA_SITE_URL}${PRODUCT_PATH}${encodeURIComponent(handle)}`,
    vendor: storeName,
    ...(r.sku ? { sku: String(r.sku) } : {}),
    ...(tags ? { tags } : {}),
    ...(sizes ? { sizes } : {}),
    ...(colors ? { colors } : {}),
  } as StoreProduct;
}

// ---------- list ----------
function baseQuery(schema: Schema, sort: ProviderFetchParams['sort']): URLSearchParams {
  const order =
    sort === 'price-asc' ? 'price.asc' : sort === 'price-desc' ? 'price.desc' : schema.hasCreatedAt ? 'created_at.desc' : 'id.desc';
  const q = new URLSearchParams({ select: '*', status: STATUS_FILTER, order });
  if (schema.hasDeletedAt) q.set('deleted_at', 'is.null'); // soft-deleted rows (column confirmed)
  return q;
}

export async function fetchGuldastaProducts(
  platform: string,
  storeName: string,
  params: ProviderFetchParams
): Promise<ProviderFetchResult> {
  const schema = await detectSchema();
  const size = Math.min(100, params.perPage || PAGE_SIZE);
  const from = (Math.max(1, params.page) - 1) * size;
  const q = baseQuery(schema, params.sort);

  if (params.category) {
    const index = await catalogIndex(schema);
    const cat = await findCategory(index, params.category);
    const f = cat ? categoryFilter(schema, index, cat) : null;
    // Unknown category -> no products, rather than silently showing everything.
    if (!f || f[1] === 'in.()') return { products: [], total: 0, totalPages: 1, totalIsExact: true };
    q.set(f[0], f[1]);
  }
  if (params.search?.trim() && schema.searchKey) {
    q.set(schema.searchKey, `ilike.*${params.search.trim().replace(/[*,()"\\]/g, ' ')}*`);
  }

  // `Prefer: count=exact` makes PostgREST report the true total in Content-Range.
  const res = await rest(`products?${q}`, {
    Prefer: 'count=exact',
    Range: `${from}-${from + size - 1}`,
    'Range-Unit': 'items',
  });
  const rows: Row[] = await res.json();
  const { total, exact } = totalFrom(res, from + rows.length);

  const products = applySort(await Promise.all(rows.map((r) => mapRow(r, schema, platform, storeName))), params.sort);
  return { products, total, totalPages: Math.max(1, Math.ceil(total / size)), totalIsExact: exact };
}

// ---------- detail ----------
export async function fetchGuldastaProduct(
  platform: string,
  storeName: string,
  handle: string
): Promise<StoreProduct | null> {
  const schema = await detectSchema();
  const h = decodeURIComponent(handle);
  // Same filter shape the site itself uses: products?select=*&slug=eq.<slug>
  let rows: Row[] = await (
    await rest(`products?select=*&slug=eq.${encodeURIComponent(h)}&status=${encodeURIComponent(STATUS_FILTER)}&limit=1`)
  ).json();
  // Products without a slug are keyed by id (see mapRow's handle fallback).
  if (!rows.length && /^[\w-]+$/.test(h)) {
    rows = await (
      await rest(`products?select=*&id=eq.${encodeURIComponent(h)}&status=${encodeURIComponent(STATUS_FILTER)}&limit=1`)
    ).json().catch(() => []);
  }
  if (!rows.length) return null;
  const [product, includedItems] = await Promise.all([
    mapRow(rows[0], schema, platform, storeName),
    fetchBasketItems(String(rows[0].id)),
  ]);
  return includedItems.length ? { ...product, includedItems } : product;
}

// ---------- basket / hamper contents ("What's included") ----------
// Same request the site's own product page makes (confirmed):
//   basket_items?select=*&basket_id=eq.<product id>&order=display_order.asc
// Returns [] for ordinary products, or if the table can't be read.
async function fetchBasketItems(productId: string): Promise<StoreIncludedItem[]> {
  try {
    const rows: Row[] = await (
      await rest(`basket_items?select=*&basket_id=eq.${encodeURIComponent(productId)}&order=display_order.asc`)
    ).json();
    return rows
      .map((b): StoreIncludedItem | null => {
        const name = String(b.name ?? b.title ?? '').trim();
        if (!name) return null;
        const image = dedupe([...toList(b.images), b.image].map(toUrl))[0];
        const description = b.description ? stripHtml(String(b.description)) : '';
        const quantity = num(b.quantity);
        const sizes = stringList(b.has_sizes ? b.sizes : undefined);
        return {
          name,
          ...(description ? { description } : {}),
          ...(image ? { image } : {}),
          ...(quantity && quantity > 1 ? { quantity } : {}),
          ...(sizes ? { sizes } : {}),
        };
      })
      .filter((x): x is StoreIncludedItem => x != null);
  } catch {
    return [];
  }
}

// ---------- cheap totals (admin live-count + collection counts) ----------
// Asks for ONE row and reads the real total off Content-Range, so counting a
// catalogue never downloads it.
async function countWhere(filter?: [string, string]): Promise<number> {
  const q = new URLSearchParams({ select: 'id', status: STATUS_FILTER });
  if ((await detectSchema()).hasDeletedAt) q.set('deleted_at', 'is.null');
  if (filter) q.set(filter[0], filter[1]);
  const res = await rest(`products?${q}`, { Prefer: 'count=exact', Range: '0-0', 'Range-Unit': 'items' });
  return totalFrom(res, 0).total;
}

export async function fetchGuldastaTotal(): Promise<number> {
  return countWhere();
}

// ---------- collections with live counts (admin collections route) ----------
export interface GuldastaCollectionRow {
  id: string;
  name: string;
  productCount: number;
  image: string | null;
}

export async function fetchGuldastaCollectionsWithCounts(): Promise<GuldastaCollectionRow[]> {
  const schema = await detectSchema();
  const index = await catalogIndex(schema);
  if (!schema.link) {
    throw new Error(
      `Found ${index.cats.length} categories but couldn't tell how products link to them. ` +
        `Product columns: ${schema.productColumns.join(', ') || '(no products returned)'}.`
    );
  }
  return index.cats
    .filter((c) => isTopLevel(c, index.cats))
    .map((c) => ({ id: c.slug, name: c.name, productCount: index.members.get(c.id)?.size ?? 0, image: c.image }))
    .filter((c) => c.productCount > 0);
}

// ---------- category list for the public route's `?collections=1&raw=1` ----------
// Shape expected by app/api/admin/sellers/[platform]/category-images/route.ts:
//   { handle, title, image } — handle comes back later as `?category=<handle>`,
// which findCategory() resolves (by slug, name or id).
export interface GuldastaLiveCollection {
  handle: string;
  title: string;
  image: string | null;
}

export async function fetchGuldastaCollections(): Promise<GuldastaLiveCollection[]> {
  const schema = await detectSchema();
  const index = await catalogIndex(schema);
  const top = index.cats.filter((c) => isTopLevel(c, index.cats));
  // Prefer categories that actually have products; if linking failed, still show the table's top level.
  const withProducts = top.filter((c) => (index.members.get(c.id)?.size ?? 0) > 0);
  return (withProducts.length ? withProducts : top).map((c) => ({ handle: c.slug, title: c.name, image: c.image }));
}

// ---------- diagnostics for the admin Test & verify panel ----------
export async function describeGuldastaSchema(): Promise<string> {
  const schema = await detectSchema();
  const { columns } = await loadCategoryTable().catch(() => ({ columns: [] as string[] }));
  const index = await catalogIndex(schema).catch(() => null);
  const link = schema.link;
  const how = !link
    ? 'NOT FOUND'
    : link.kind === 'join'
      ? `join table ${link.table}(${link.productKey} -> ${link.categoryKey})`
      : link.kind === 'family'
      ? `products.family_id -> ${link.table}.${link.categoryKey}`
      : `products.${link.key} (${link.mode})`;
  return [
    `Category link: ${how}.`,
    `Categories: ${index?.cats.length ?? 0} (${index?.cats.filter((c) => isTopLevel(c, index.cats)).length ?? 0} top-level); ` +
      `${index?.productCat.size ?? 0} products matched to one.`,
    `Product columns: ${schema.productColumns.join(', ') || '—'}.`,
    `Category columns: ${columns.join(', ') || '—'}.`,
  ].join(' ');
}
