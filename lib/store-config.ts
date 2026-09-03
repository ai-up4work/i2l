// lib/store-config.ts

import { userAgent } from "next/server";

export type StoreProviderType = 'mock' | 'shopify' | 'woocommerce' | 'jsonapi';

interface BaseProviderConfig {
  type: StoreProviderType;
  currency?: string;
  headers?: Record<string, string>;
}

export interface MockProviderConfig extends BaseProviderConfig {
  type: 'mock';
}

export interface ShopifyProviderConfig extends BaseProviderConfig {
  type: 'shopify';
  baseUrl: string;
  collectionMap?: Record<string, string>;
  defaultGender?: 'men' | 'women' | 'unisex';
}

export interface WooCommerceProviderConfig extends BaseProviderConfig {
  type: 'woocommerce';
  baseUrl: string;
  consumerKeyEnv?: string;
  consumerSecretEnv?: string;
  apiMode?: 'auto' | 'wc_v3' | 'store_v1';
  categoryMap?: Record<string, number | string>;
  /**
   * Always applied as the upstream category filter, regardless of which UI
   * category button is active — for a site that hosts multiple brands
   * (e.g. theparfumerie.lk) where this store's slug is really "this one
   * brand's slice of a bigger catalog," not the whole feed. A categoryMap
   * entry for the active UI category still wins over this when present;
   * this is just the floor/default scope so "All" doesn't mean "everything
   * on the site."
   */
  fixedCategoryValue?: number | string;
}

/**
 * For small custom-built stores (often a bespoke Next.js frontend) that
 * turn out to have a real, unauthenticated JSON backend once you dig past
 * the frontend — e.g. a FastAPI/Express service the site's own frontend
 * calls client-side. Not Next.js-specific despite how you'd usually
 * discover it (via the frontend's Network tab): the adapter only cares
 * that `listEndpoint` returns a flat JSON array of raw product objects.
 */
export interface JsonApiProviderConfig extends BaseProviderConfig {
  type: 'jsonapi';
  baseUrl: string;
  /** Path returning the full product array, e.g. '/products/'. */
  listEndpoint: string;
  /**
   * Path template for single-product lookup, with {id} substituted for
   * the product's raw id field, e.g. '/products/{id}'. Omit if no such
   * endpoint exists — fetchStoreProduct then falls back to filtering the
   * full list fetched from listEndpoint instead of a second request.
   */
  detailEndpoint?: string;
  /**
   * Path for a *separate* server-side search endpoint, with {q}
   * substituted for the search term, e.g. '/products/search?q={q}'.
   * Use this only if search lives at a genuinely different URL than
   * listEndpoint. If search is instead just a query param tacked onto
   * listEndpoint (e.g. '/products/?search=x'), use searchQueryParam
   * below instead — most small backends do it this way, not as a
   * separate route.
   */
  searchEndpoint?: string;
  /**
   * Query param name for server-side search on listEndpoint itself,
   * e.g. 'search' turns a request into '{listEndpoint}?search=term'.
   * Preferred over searchEndpoint when there's no dedicated search route.
   */
  searchQueryParam?: string;
  /**
   * Query param name for server-side category filtering on listEndpoint,
   * e.g. 'category' turns a request into '{listEndpoint}?category=X'.
   * Omit if the backend doesn't support this — falls back to filtering
   * client-side on whatever categoryField extracts.
   */
  categoryQueryParam?: string;
  /** Raw field name to map to StoreProduct.id / handle. */
  idField: string;
  nameField: string;
  priceField: string;
  /**
   * Whether priceField values are major units (750 = ₹750, matches
   * StoreProduct.price's contract) or minor units (75000 paise = ₹750).
   * Also applied to regularPriceField/salePriceField/variant price
   * fields below. Defaults to 'major'.
   */
  /**
   * If the backend distinguishes a full/regular price from a discounted
   * one (rather than priceField always being the current effective
   * price), set these to derive compareAtPrice/onSale — same logic as
   * WooCommerce's regular_price/sale_price. Omit both if the backend has
   * no sale-pricing concept at all (many small custom backends don't).
   */
  regularPriceField?: string;
  salePriceField?: string;
  imageField: string;
  /**
   * If the backend gives an actual array of image URLs, use this instead
   * of imageField — takes priority when both are set. imageField alone
   * (wrapped into a single-element array) is the fallback for backends
   * that only ever expose one image per product.
   */
  imagesField?: string;
  descriptionField?: string;
  /** Distinct long-form description, if the backend separates short vs long (most small custom backends don't — leave unset rather than duplicate descriptionField into it). */
  fullDescriptionField?: string;
  /** Raw field to derive `category` from — often messy free text (e.g. a
   * fabric/type string) rather than a real category, so treat it as a
   * best-effort label, not a clean taxonomy. */
  categoryField?: string;
  /** Raw category string BEFORE any mapping, kept distinct from `category` if the backend has both a raw type and a cleaner display category. */
  productTypeField?: string;
  sizesField?: string;
  /**
   * Single raw string field for color (e.g. "Blue"), wrapped into
   * StoreProduct.colors as a one-element array. Use colorsField instead
   * if the backend actually gives an array of color options on one
   * product.
   */
  colorField?: string;
  colorsField?: string;
  /**
   * Raw array field of {name, values} option axes, if the backend
   * models real selectable variant options (Size/Color/etc as
   * independent axes, not just flat sizesField/colorField strings). If
   * unset (or the field's empty/malformed), options are synthesized
   * from whatever sizesField/colorField/colorsField extracted instead.
   */
  optionsField?: string;
  /**
   * Raw array field of per-variant objects on the parent product, for
   * backends that model real parent+variant relationships (own price/
   * stock/options per purchasable combination) rather than one flat row
   * per listing. The variant*Field configs below map each entry's own
   * fields; any left unset falls back to a sane default (parent's price,
   * available: true, etc).
   */
  variantsField?: string;
  variantIdField?: string;
  variantTitleField?: string;
  variantPriceField?: string;
  variantCompareAtPriceField?: string;
  variantAvailableField?: string;
  /** Raw array field (per variant) of the option values that select it, e.g. ['M','Blue']. */
  variantOptionsField?: string;
  skuField?: string;
  vendorField?: string;
  /** Raw array field for tags, if the backend has one. */
  tagsField?: string;
  /**
   * Raw boolean field (e.g. "featured": true) some small backends use for
   * homepage curation. StoreProduct has no dedicated `featured` concept,
   * so when set, a true value is folded into `tags` as "Featured" rather
   * than silently dropped — callers that care can filter tags for it.
   */
  featuredField?: string;
  /** Defaults to 'New' if unset and the field is absent on a given product. */
  conditionField?: string;
  genderField?: string;
  averageRatingField?: string;
  reviewCountField?: string;
  /**
   * Raw field indicating stock/availability. Interpreted per
   * stockFieldType. Omit entirely if the backend has no stock signal at
   * all — inStock then always falls back to defaultInStock rather than
   * being guessed from unrelated data.
   */
  stockField?: string;
  /**
   * How to interpret stockField's raw value:
   * - 'boolean'  (default) — truthy value means in stock
   * - 'quantity' — a number > 0 means in stock (e.g. a raw stock count)
   * - 'status'   — a string compared case-insensitively against
   *                outOfStockValues; anything not in that list counts as
   *                in stock
   */
  stockFieldType?: 'boolean' | 'quantity' | 'status';
  /** Only used when stockFieldType is 'status'. Defaults to a common set ('out of stock', 'sold out', '0', 'false', etc) if unset. */
  outOfStockValues?: string[];
  /**
   * Path template for a product detail page on the seller's OWN site
   * (StoreProduct.url) — separate from this app's own /stores/[platform]/
   * product/[handle] route. {handle} is substituted. Omit entirely if the
   * store has no such page — many small custom sites (skyt-boutique
   * included) only ever show products inline on one gallery page with no
   * per-product route to link to.
   */
  productUrlPath?: string;
  /**
   * Raw field for item weight, if the backend exposes one. Requires
   * weightUnit to actually be used — a bare field name alone doesn't
   * tell you what unit the number's in, and guessing wrong silently
   * corrupts shipping calculations downstream. If you're not certain of
   * the unit, leave both unset rather than guess; StoreProduct.weightKg
   * stays undefined (its documented "unknown" state) instead of holding
   * a plausible-looking but wrong number.
   */
  weightField?: string;
  /** Unit the raw weightField value is actually in. Required alongside weightField. */
  weightUnit?: 'kg' | 'g' | 'lb' | 'oz';
  /**
   * Whether priceField values are major units (750 = ₹750, matches
   * StoreProduct.price's contract) or minor units (75000 paise = ₹750).
   * Defaults to 'major' — WooCommerce/Shopify's public feeds are always
   * major units, but a hand-rolled backend has no such guarantee, so
   * confirm this against a real response rather than assuming.
   */
  priceUnit?: 'major' | 'minor';
  /** This backend has no in-stock signal, so default availability when the field is absent. */
  defaultInStock?: boolean;
}

export type StoreProviderConfig =
  | MockProviderConfig
  | ShopifyProviderConfig
  | WooCommerceProviderConfig
  | JsonApiProviderConfig;

export const STORE_PROVIDERS: Record<string, StoreProviderConfig> = {
  ebay: { type: 'mock' },
  rakuten: { type: 'mock' },
  aliexpress: { type: 'mock' },
  amazon: { type: 'mock' },

  giva: {
    type: 'shopify',
    baseUrl: 'https://www.giva.lk',
    currency: 'LKR',
    collectionMap: {
      Rings: 'rings',
      Earrings: 'earrings',
      Pendants: 'pendants',
      Bracelets: 'bracelets',
      Chains: 'chains',
      Anklets: 'anklets',
    },
  },
//   https://perfectcollections.shop/
  'perfect-collections': {
    type: 'shopify',
    baseUrl: 'https://perfectcollections.shop/',
    currency: 'INR',
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; JDM-Store/1.0)',
    }
  },
  'otaku-clothing': {
    type: 'woocommerce',
    baseUrl: 'https://otakuclothingsl.store',
    currency: 'LKR',
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; JDM-Store/1.0)',
    },
  },

    'santhiya-fashions': {
        type: 'shopify',
        baseUrl: 'https://santhiyafashions.com/',
        currency: 'INR',
        headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; JDM-Store/1.0)',
        },
        collectionMap: {
        All: 'all',
        'New Arrivals': 'new-arrivals',
        'Premium Wears': 'premium-collections',
        'College & Office Wears': 'college-office-wear-kurtis-salwar-collections',
        'Co-ord Set': 'co-ord-set',
        'Clearance Sale': '10-discount-zone',
        'Western Wears': 'western-wears',
        'Bottom Wears': 'bottom-wears',
        Accessories: 'accessories',
        'Below 500 Range': 'below-500-range-kurtis-salwar-collections',
        'Below 1000 Range': 'below-1000-range-salwar-kurtis-for-women',
        'Salwar Set': 'salwar-set-3-piece-salwar-sets',
        'Shimmer Leggings': 'shimmer-leggings',
        'Scrunchies / Hair Bands': 'hair-scrunchies-hair-bands',
        'Dupatta/Shawl': 'shawl-dupatta',
        'Imitation Jewellery': 'imitation-jewellery',
        'Feeding / Maternity Wears': 'feeding-kurtis-maternity-wears',
        'Plus Size Collections': 'plus-size-collections',
        'Ethnic Wears': 'ethnic-wear-kurtis-salwar-collections',
        'Party Wears': 'ethnic-wear',
        'Kurti & Dupatta': 'kurti-duppatta-set',
        Maxi: 'maxi',
        },
    },
    // Live feed. Discovered via the site's own Network tab — the Next.js
    // frontend at skytboutique.in calls this FastAPI backend client-side.
    // No auth. Only `listEndpoint` is confirmed working; everything below
    // that's commented out is a documented *possibility* the jsonapi
    // adapter knows how to use — go confirm each one (curl it, or check
    // /docs since this backend is FastAPI) before uncommenting.
    'skyt-boutique': {
      type: 'jsonapi',
      baseUrl: 'https://skyt-boutique-backend.onrender.com',
      currency: 'INR',

      // ── Confirmed ──────────────────────────────────────────────────
      listEndpoint: '/products/', // returns the full catalog, no pagination

      // ── Endpoint options (all optional — uncomment once confirmed) ──
      detailEndpoint: '/products/{id}',
      //   CONFIRMED — GET /products/{id} returns 200 with a single
      //   product object.

      searchQueryParam: 'search',
      //   CONFIRMED — GET /products/?search=c returned 200. This is a
      //   query param on listEndpoint itself, not a separate route.

      // categoryQueryParam: 'category',
      //   STILL UNCONFIRMED. A `color` param was seen working
      //   (/products?color=Black+with+red → 307 redirect, same as the
      //   list endpoint's own trailing-slash behavior — meaning it was
      //   accepted, not rejected). But `color` is a different attribute
      //   than the `type`/category field this config maps to `category`.
      //   Don't assume `type` or `category` work as a param just because
      //   `color` does — test explicitly:
      //   curl "https://skyt-boutique-backend.onrender.com/products/?type=Cotton"
      //   curl "https://skyt-boutique-backend.onrender.com/products/?category=Cotton"
      //   Also worth fetching /products/filters — it likely documents
      //   every supported filter param and its valid values in one shot,
      //   which beats guessing param names one at a time.

      // searchEndpoint: '/products/search?q={q}',
      //   Server-side search. {q} is URL-encoded and substituted. Not
      //   seen fired from the site — it may not exist, or the frontend
      //   might not expose a search box at all. Without this, search
      //   filters the already-fetched full list client-side (fine at
      //   this catalog's size, ~80 items).

      // categoryQueryParam: 'category',
      //   Query param name for server-side category filtering on
      //   listEndpoint, e.g. '/products/?category=X'. Not confirmed —
      //   the frontend's category buttons might just filter the full
      //   array in the browser rather than calling the API again.
      //   Also: /products/filters exists on this backend and likely
      //   returns the valid category/type values — worth fetching that
      //   to see the real vocabulary before assuming a param name.

      // ── Field mapping (confirmed against the real /products/ response) ──
      idField: 'id',               // UUID; also doubles as `handle` (no separate slug)
      nameField: 'name',
      priceField: 'price',
      priceUnit: 'major',          // CONFIRMED — e.g. 750.0 means ₹750, not 75000 paise
      imageField: 'image',         // single string, not an array — every product has exactly one
      descriptionField: 'description',
      categoryField: 'type',       // free-text fabric/type, not a real category — messy, needs trim/normalize
      sizesField: 'sizes',
      colorField: 'color',         // single string per product, e.g. "Blue" — wrapped into colors: ['Blue']
      skuField: 'code',            // human SKU, e.g. "S2001" — NOT unique (saw duplicate "SkytS2005" in the response), so id (UUID) stays the real identifier, this is just display metadata
      featuredField: 'featured',   // boolean, folded into tags as "Featured" — no dedicated featured concept in StoreProduct

      // imagesField / colorsField: NOT SET — this backend only ever gives
      //   one image and one color per product (checked the full /products/
      //   dump), never arrays. If that ever changes upstream, prefer these
      //   over imageField/colorField rather than running both.

      // tagsField: NOT SET — no array-valued tag field exists upstream;
      //   `featuredField` above is the only tag-like data available, and
      //   it's handled separately since it's a boolean, not an array.

      // vendorField / fullDescriptionField / conditionField /
      // averageRatingField / reviewCountField / productUrlPath: NOT SET —
      //   none of these exist in the raw response, and skyt-boutique's
      //   frontend has no per-product page to link to at all (products
      //   only ever render inline on the one /gallery page), so
      //   productUrlPath in particular isn't just missing data, it's
      //   structurally inapplicable for this store.

      // weightField / weightUnit: NOT SET — deliberately, not forgotten.
      //   The raw response has no weight field at all for any product
      //   (checked the full /products/ dump). If a future field like
      //   `weight_grams` ever gets added upstream, set BOTH:
      //     weightField: 'weight_grams',
      //     weightUnit: 'g',
      //   Setting only one silently does nothing — readWeightKg requires
      //   both to be present before it'll populate weightKg at all.

      defaultInStock: true,        // no real inStock field on this backend — see note above about "sold out" being unreliable free text in `name`
    },
    
  // Live feed. Ported from app/api/bedapper/route.ts, which hit
  // bedapper.lk's public wc/store/v1 endpoint directly (no credentials).
  // Platform slug is 'be-dapper' (hyphenated) to match affiliatedStores,
  // even though the actual domain is bedapper.lk (no hyphen).
  'be-dapper': {
    type: 'woocommerce',
    baseUrl: 'https://bedapper.lk',
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; JDM-Store/1.0)',
    },
    categoryMap: {
      'T-Shirts': 't-shirts',
      Polos: 'polos',
      Shirts: 'shirts',
      Trousers: 'trousers',
      Shorts: 'shorts',
      Hoodies: 'hoodies',
      Sweatshirts: 'sweatshirts',
      Jackets: 'jackets',
      Accessories: 'accessories',
      Footwear: 'footwear',
      Clothing: 'clothing',
    },
  },

  // Live feed. Ported from app/api/buckley/route.ts. theparfumerie.lk hosts
  // multiple brands, so fixedCategoryValue keeps us scoped to just Buckley
  // London's products no matter what UI category is active.
  'buckley-london': {
    type: 'woocommerce',
    baseUrl: 'https://theparfumerie.lk',
    currency: 'LKR',
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; JDM-Store/1.0)',
    },
    fixedCategoryValue: 'buckley-london',
  },

  'old-money': {
    type: 'shopify',
    baseUrl: 'https://old-money.com',
    currency: 'USD',
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; JDM-Store/1.0)',
    },
    defaultGender: 'men',
    collectionMap: {
      All: 'all-products',
      Tops: 'tops',
      Bestsellers: 'bestsellers',
      Polos: 'old-money-polos',
      Cashmere: 'old-money-cashmere',
      Linen: 'linen',
      FW25: 'fw25',
      Shoes: 'old-money-shoes',
      Accessories: 'accessories',
      Women: 'women',
      'Women Shoes': 'women-shoes',
      Handbags: 'women-handbags',
      'Women Accessories': 'women-accessories',
    },
    },
        // Live feed. Ported from app/api/chickadee/route.ts — public, keyless
        // wc/store/v1 endpoint, no credentials.
        chickadee: {
        type: 'woocommerce',
        baseUrl: 'https://chickadee.lk',
        headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; JDM-Store/1.0)',
        },
        },

        // Live feed. Ported from app/api/enzayn/route.ts — public, keyless
        // wc/store/v1 endpoint, no credentials.
        'enzayn-ceylon': {
        type: 'woocommerce',
        baseUrl: 'https://enzaynceylon.com',
        headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; JDM-Store/1.0)',
        },
        },

        // Live feed. Ported from app/api/kor/route.ts — public, keyless
        // wc/store/v1 endpoint, no credentials.
        'kingdom-of-rings': {
        type: 'woocommerce',
        baseUrl: 'https://kingdomofrings.lk',
        headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; JDM-Store/1.0)',
        },
        },

        // Live feed. Ported from app/api/skye/route.ts — public, keyless
        // wc/store/v1 endpoint, no credentials.
        'skye-clothing': {
        type: 'woocommerce',
        baseUrl: 'https://skyeclothing.lk',
        headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; JDM-Store/1.0)',
        },
        },

        // Live feed. Ported from app/api/cherie/route.ts — Shopify public
        // /products.json, no auth. The old route supported an arbitrary
        // ?collection= handle passed straight through; the generic Shopify
        // provider instead needs a label -> handle collectionMap to do the same
        // from a UI category click. No collectionMap set here since the real
        // collection handles on cherielueur.com aren't confirmed yet — category
        // filtering will fall back to a product_type string match until then.
        'cherie-lueur': {
        type: 'shopify',
        baseUrl: 'https://cherielueur.com',
        headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; JDM-Store/1.0)',
        },
    },

  // Confirmed Shopify (footer: "Powered by Shopify", standard Shopify
  // meta tags — checked by fetching the homepage directly). Maternity
  // wear + antique-style jewellery, based in India (Chennai — "Poli"
  // couple brand). collectionMap handles were pulled from the site's own
  // rendered nav HTML, NOT confirmed against a live /products.json or
  // /collections/*.json response — verify each handle actually resolves
  // (e.g. curl https://poliskart.com/collections/maternity-wear.json)
  // before relying on it for real category filtering.
  poliskart: {
    type: 'shopify',
    baseUrl: 'https://poliskart.com',
    currency: 'INR',
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; JDM-Store/1.0)',
    },
    collectionMap: {
      'Maternity Wear': 'maternity-wear',
      'Antique Jewellery': 'jewellery',
      'Necklaces & Chain with Pendants': 'short-necklaces',
      'Harams & Long Chains': 'harrams-and-long-chains',
      'Antique Bangles': 'antique-bangles',
      'Antique Jhumkas & Earrings': 'antique-jhumka-and-earrings',
      Accessories: 'accessories',
      'Bridal & Combo Sets': 'bridal-and-combo-sets',
      'Rose Gold & Fashion Jewellery': 'earring-and-fashion-jewellery',
      'Anti Tarnish Jewellery': 'anti-tarnish-jewellery',
      'Kurta Sets & Tops': 'dresses',
      Sarees: 'sarees',
      'Hair Accessories': 'hair-accessoriesflowers-clips',
    },
    defaultGender: 'women',
  },
};

export function getProviderConfig(platform: string): StoreProviderConfig {
  return STORE_PROVIDERS[platform] ?? { type: 'mock' };
}

// ── Field-mapping introspection ──────────────────────────────────────────
// Generates the same "which raw field feeds which StoreProduct field"
// picture as a one-off hand-written doc would — but derived live from the
// config object, so it can never drift out of sync with what the adapter
// actually does. Every entry below is [config key, StoreProduct field(s)
// it feeds, note]; only keys that are actually set on the given config
// show up in the output.
const JSONAPI_FIELD_MAP_SPEC: readonly [
  keyof JsonApiProviderConfig,
  string,
  string
][] = [
  ['idField', 'id, handle', 'Doubles as handle unless the backend has a real slug — jsonapi.ts has no separate slug concept.'],
  ['nameField', 'name', 'Trimmed.'],
  ['priceField', 'price', 'Converted via priceUnit if set to "minor" (divides by 100); "major" (default) passes through as-is.'],
  ['imageField', 'image, images[0]', 'Fallback used only when imagesField is unset — wraps a single string into a one-element array.'],
  ['imagesField', 'image, images', 'Takes priority over imageField when both are set.'],
  ['descriptionField', 'description', 'HTML-stripped.'],
  ['fullDescriptionField', 'fullDescription', 'Only populated if the backend has a genuinely separate long-form field — never duplicated from descriptionField.'],
  ['categoryField', 'category', 'Whitespace-collapsed and trimmed; treated as a best-effort label, not a real taxonomy.'],
  ['sizesField', 'sizes', 'Expected to already be an array upstream — passed through as-is.'],
  ['colorField', 'colors', 'Single string wrapped into a one-element array — fallback when colorsField is unset.'],
  ['colorsField', 'colors', 'Takes priority over colorField when both are set.'],
  ['skuField', 'sku', 'No uniqueness guaranteed unless separately verified against the raw data.'],
  ['vendorField', 'vendor', ''],
  ['tagsField', 'tags', 'Expected to be an array upstream.'],
  ['featuredField', 'tags (+"Featured")', 'Boolean field folded into tags — StoreProduct has no dedicated featured concept.'],
  ['conditionField', 'condition', 'Defaults to "New" when unset or the field is absent on a given product.'],
  ['averageRatingField', 'averageRating', 'Only populated when the parsed value is finite and > 0.'],
  ['reviewCountField', 'reviewCount', ''],
  ['weightField', 'weightKg', 'Requires weightUnit to also be set — a field name alone doesn\'t establish the unit, so both must be present or neither takes effect.'],
  ['weightUnit', 'weightKg', 'Paired with weightField — see above.'],
  ['productUrlPath', 'url', 'Points to a page on the SELLER\'S OWN site, not this app\'s /stores/[platform]/product/[handle] route. Omit if the store has no per-product page at all.'],
];

/**
 * Builds a live "raw field → StoreProduct field" mapping report for any
 * jsonapi-type store, straight from its current config — so this can
 * never go stale the way a hand-maintained doc file would. Returns null
 * for non-jsonapi platforms (Shopify/WooCommerce have their own fixed,
 * documented schemas and don't need this kind of introspection).
 *
 * Also reports which config-supportable fields are deliberately unset
 * (so it's clear at a glance what this store *could* expose but doesn't),
 * and which hardcoded defaults (currency, inStock, condition) apply
 * regardless of the raw data.
 */
export function getJsonApiFieldMapping(platform: string): {
  store: string;
  baseUrl: string;
  listEndpoint: string;
  mapped: Record<string, { rawField: string; storeProductField: string; notes: string }>;
  unset: string[];
  defaults: Record<string, string>;
} | null {
  const config = getProviderConfig(platform);
  if (config.type !== 'jsonapi') return null;

  const mapped: Record<string, { rawField: string; storeProductField: string; notes: string }> = {};
  const unset: string[] = [];

  for (const [key, target, notes] of JSONAPI_FIELD_MAP_SPEC) {
    const value = config[key];
    if (value !== undefined && value !== null && value !== '') {
      mapped[key] = { rawField: String(value), storeProductField: target, notes };
    } else {
      unset.push(key);
    }
  }

  return {
    store: platform,
    baseUrl: config.baseUrl,
    listEndpoint: config.listEndpoint,
    mapped,
    unset,
    defaults: {
      currency: config.currency ?? '(none set — StoreProduct.currency will be undefined-ish per adapter default)',
      inStock: String(config.defaultInStock ?? true),
      condition: config.conditionField ? '(from conditionField, not a fixed default)' : 'New',
    },
  };
}