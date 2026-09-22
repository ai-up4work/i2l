// lib/store.types.ts

/** A single purchasable variant of a product (e.g. Size M / Red). */
export interface StoreProductVariant {
  id: string;
  title: string;
  /** Always in major currency units, matching StoreProduct.price. */
  price: number;
  compareAtPrice?: number;
  available: boolean;
  /** Positional option values for this variant, e.g. ['M', 'Red']. */
  options: (string | null)[];
  /**
   * This variant's own product photo, if the upstream feed ties one to it
   * (e.g. Shopify's per-variant featured_image). Populated only when the
   * feed actually distinguishes a photo per variant — most commonly used
   * to show a real product photo as a color swatch instead of a guessed
   * flat color. Absent, not defaulted, when the feed doesn't provide one.
   * Intentionally the LOWER-resolution image when a provider has both —
   * this is what the small swatch icon shows, and a thumbnail is exactly
   * right for something that size. See `fullImage` for the resolution a
   * shopper should actually view once this variant is selected.
   */
  image?: string;
  /**
   * The high-resolution version of `image`, when a provider can tell the
   * two apart (e.g. a thumbnail-in-a-listing vs. its own full-size
   * original). Optional and additive — most providers only ever have one
   * resolution, in which case this stays unset and callers should just
   * use `image` for everything. When both are present, a consumer should
   * show `image` immediately (fast, already the swatch photo) and swap to
   * `fullImage` once it's loaded, rather than blocking the initial
   * render on a full-size fetch.
   */
  fullImage?: string;
}

/** A selectable option axis, e.g. { name: 'Size', values: ['S','M','L'] }. */
export interface StoreProductOption {
  name: string;
  values: string[];
}

export type StoreProductGender = 'men' | 'women' | 'unisex';

export interface StoreProduct {
  id: string;
  handle: string; // used to build /stores/[platform]/product/[handle]
  storeSlug: string;
  stockCount: number | null; // null = unknown, not zero
  name: string;
  image: string;
  images: string[];
  price: number; // always major units (e.g. 89.00, not 8900)
  currency: string;
  compareAtPrice?: number;
  onSale?: boolean;
  inStock: boolean;
  category: string;
  condition: string;
  description: string;
  seller: string;

  // ─── Optional richer fields ────────────────────────────────────────────
  // Populated when the upstream feed has the data; absent (not defaulted)
  // otherwise, so UI can feature-detect with `if (product.sizes?.length)`
  // rather than trusting a fake empty array. Every field here is a "may be
  // present" — different stores, WooCommerce versions, and product types
  // (simple vs variable) legitimately omit different subsets, so treat
  // absence as "unknown", not "false"/"zero".

  /** Direct link to the product on the seller's own site, when known. */
  url?: string;
  vendor?: string;
  /** Raw upstream product type/category string, before our category mapping. */
  productType?: string;
  tags?: string[];
  /** Selectable option axes (Size, Color, etc), if the product has variants. */
  options?: StoreProductOption[];
  /** Individual purchasable variants, if the product has more than one. */
  variants?: StoreProductVariant[];
  /** Convenience extraction of an option named "Size"/"size", if present. */
  sizes?: string[];
  /** Convenience extraction of an option named "Color"/"Colour", if present. */
  colors?: string[];
  /**
   * Best-effort gender classification from tags/title/type. Left undefined
   * (never guessed) unless the feed's own data made it reasonably clear, or
   * a store config supplies a defaultGender fallback for an ambiguous case.
   */
  gender?: StoreProductGender;

  /** Seller-assigned stock keeping unit, if the feed exposes one. */
  sku?: string;
  /**
   * Item weight in kilograms, if the feed exposes one. Upstream feeds send
   * this as a string in inconsistent units (WooCommerce's store setting
   * decides kg vs lb) — normalizers should only populate this when the
   * unit is known to be kg, and leave it undefined otherwise rather than
   * guess.
   */
  weightKg?: number;
  /**
   * Full long-form description, distinct from the shorter `description`
   * field above (which upstream feeds often call "short_description" /
   * "summary"). Both are stripped of HTML. Populate this only when the
   * upstream feed actually distinguishes short vs. long description —
   * leave undefined rather than duplicating `description` into it.
   */
  fullDescription?: string;
  averageRating?: number;
  reviewCount?: number;
  /**
   * Overrides the "Colors" section heading in SizeAndColorPicker.tsx for
   * this product, when the color-shaped option (image-backed swatches,
   * matched by the literal option name 'color' internally — see
   * optionAvailability/colorImageMap/findMatchingVariant in
   * lib/product-options.ts) doesn't actually represent colors. E.g. a
   * wholesale catalog's individual print/pattern designs reuse the same
   * swatch-with-photo mechanism but shouldn't be labeled "Colors" to a
   * shopper. Leave unset for an actual color option — "Colors" remains
   * the default. The option's internal `name` must still be 'color' for
   * the swatch picker to find it at all; this only changes what's shown.
   */
  variantLabel?: string;
}

export interface StoreApiResponse {
  products: StoreProduct[];
  total: number;
  totalPages: number;
  page: number;
  category: string | null;
  fetchedAt: string;
  totalIsExact?: boolean;
}

export interface StoreApiError {
  error: string;
  detail?: string;
}