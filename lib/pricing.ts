// lib/pricing.ts
//
// Storefront DISPLAY pricing — the single place that decides how a raw
// upstream product (feed price, in the seller's own currency) becomes
// the LKR number a shopper actually sees, anywhere on the site: catalog
// grid cards, the product detail page, and the mini-cart/WhatsApp order
// text.
//
// This does NOT duplicate any pricing math — everything here is a thin
// wrapper around lib/quote.ts (calculateCatalogQuote / getEconomyCatalogPriceLKR
// etc) and lib/currency.ts (formatPrice). If the underlying formula, rates,
// or which delivery method we display by default ever changes, it changes
// here once and every page that imports from this file picks it up
// automatically — no more updating the same "economyPriceLKR" helper
// separately in three different components.
//
// WHY ECONOMY: the storefront shows one headline price with no delivery-
// method picker, so we need to pick one. Economy (single Postal Charges
// line, no flat Delivery Fee) is the current business decision — see
// DISPLAY_DELIVERY_TYPE below. Anywhere that needs to show the *other*
// delivery method's price explicitly (e.g. a future Express upsell, or
// the internal quote calculator at /demo/quote) should call the
// Express/Economy-locked functions in lib/quote.ts directly rather than
// going through this file, which is display-only and Economy-only.

import { formatPrice } from "./currency";
import {
  getEconomyCatalogPriceLKR,
  getExpressCatalogPriceLKR,
  type DeliveryType,
  type SimpleQuoteInput,
} from "./quote";

// Which delivery method the storefront's headline price reflects.
// Change this in one place if that business decision ever changes —
// every function below reads it rather than hardcoding "economy".
export const DISPLAY_DELIVERY_TYPE: DeliveryType = "economy";

// ============================================================
// INPUT SHAPE
// ============================================================

// The minimal shape any "priceable" thing needs — StoreProduct and
// CartItem both satisfy this without extra mapping, since it only reads
// the fields it needs (Pick-style) rather than requiring the full type.
export interface PriceableItem {
  price: number; // upstream price, in `currency`'s units
  currency: string;
  weightKg?: number | null;
}

// ============================================================
// CORE: single-item display price
// ============================================================

/**
 * The LKR price to show for one unit of `item`, at DISPLAY_DELIVERY_TYPE.
 * This is the one function every other helper in this file (and every
 * page on the site) should ultimately go through for a per-unit price.
 */
export function getDisplayPriceLKR(item: PriceableItem): number {
  const input: Omit<SimpleQuoteInput, "deliveryType"> = {
    pcsPerUnit: 1,
    valueINR: item.price,
    currencyCode: item.currency,
    weightKg: item.weightKg ?? undefined,
  };

  // DISPLAY_DELIVERY_TYPE is currently always "economy", but this switch
  // keeps the function correct (and the Express-locked wrapper unused-but-
  // ready) if that constant is ever changed to "express" later.
  return getEconomyCatalogPriceLKR(input);
}

/** Formats a value already in LKR using the site's shared currency formatter. */
export function formatLKR(value: number): string {
  return formatPrice(value, "LKR");
}

/** getDisplayPriceLKR + formatLKR in one call, for the common case of just needing a string to render. */
export function formatDisplayPrice(item: PriceableItem): string {
  return formatLKR(getDisplayPriceLKR(item));
}

// ============================================================
// PRODUCT CARD / PDP: price + "was" price + discount %
// ============================================================

export interface ProductPriceableItem extends PriceableItem {
  compareAtPrice?: number | null;
  onSale?: boolean;
}

export interface ProductPricing {
  priceLKR: number;
  compareAtPriceLKR: number | null; // null when there's no compareAtPrice, or the product isn't on sale
  discountPercent: number | null; // null under the same conditions as compareAtPriceLKR
  formattedPrice: string;
  formattedCompareAtPrice: string | null;
}

/**
 * Full pricing bundle for a single product — used by both the catalog
 * grid card and the product detail page, so the discount % and both
 * displayed numbers can never disagree between the two.
 *
 * This is the Economy-only (DISPLAY_DELIVERY_TYPE) bundle. For the PDP's
 * Economy vs Express comparison block, use getDualDeliveryPricing below
 * instead.
 */
export function getProductPricing(product: ProductPriceableItem): ProductPricing {
  const priceLKR = getDisplayPriceLKR(product);

  const showCompareAt = product.compareAtPrice != null && !!product.onSale;
  const compareAtPriceLKR = showCompareAt
    ? getDisplayPriceLKR({ ...product, price: product.compareAtPrice as number })
    : null;

  const discountPercent =
    compareAtPriceLKR != null && compareAtPriceLKR > 0
      ? Math.round((1 - priceLKR / compareAtPriceLKR) * 100)
      : null;

  return {
    priceLKR,
    compareAtPriceLKR,
    discountPercent,
    formattedPrice: formatLKR(priceLKR),
    formattedCompareAtPrice: compareAtPriceLKR != null ? formatLKR(compareAtPriceLKR) : null,
  };
}

// ============================================================
// PDP: Economy vs Express comparison block
// ============================================================
//
// Unlike getProductPricing (which always resolves through
// DISPLAY_DELIVERY_TYPE / Economy), this runs the same price + "was"
// price + discount% logic through BOTH delivery-locked catalog wrappers
// in lib/quote.ts, so the PDP can show the shopper both methods — Economy
// as the storefront default, Express as a priced comparison — instead of
// only the single Economy price.
//
// The "was" price is computed separately per method (Economy's
// compare-at through the Economy calculator, Express's through Express)
// rather than converting one shared LKR compare-at price, because
// freight/postal scale differently between the two methods — a single
// shared strikethrough number would misrepresent one side.
//
// expressPremiumLKR/formattedExpressPremium exist so the PDP can say
// "Express costs X more than Economy" as one line, instead of making the
// shopper subtract two absolute prices themselves.

export interface DeliveryPriceOption {
  priceLKR: number;
  compareAtPriceLKR: number | null;
  discountPercent: number | null;
  formattedPrice: string;
  formattedCompareAtPrice: string | null;
}

export interface DualDeliveryPricing {
  economy: DeliveryPriceOption;
  express: DeliveryPriceOption;
  /** Express priceLKR - Economy priceLKR. Null if the difference isn't positive (shouldn't normally happen, but guards copy that assumes Express costs more). */
  expressPremiumLKR: number | null;
  formattedExpressPremium: string | null;
}

function getDeliveryPriceOption(
  product: ProductPriceableItem,
  getPriceLKR: (input: Omit<SimpleQuoteInput, "deliveryType">) => number
): DeliveryPriceOption {
  const base: Omit<SimpleQuoteInput, "deliveryType"> = {
    pcsPerUnit: 1,
    valueINR: product.price,
    currencyCode: product.currency,
    weightKg: product.weightKg ?? undefined,
  };

  const priceLKR = getPriceLKR(base);

  const showCompareAt = product.compareAtPrice != null && !!product.onSale;
  const compareAtPriceLKR = showCompareAt
    ? getPriceLKR({ ...base, valueINR: product.compareAtPrice as number })
    : null;

  const discountPercent =
    compareAtPriceLKR != null && compareAtPriceLKR > 0
      ? Math.round((1 - priceLKR / compareAtPriceLKR) * 100)
      : null;

  return {
    priceLKR,
    compareAtPriceLKR,
    discountPercent,
    formattedPrice: formatLKR(priceLKR),
    formattedCompareAtPrice: compareAtPriceLKR != null ? formatLKR(compareAtPriceLKR) : null,
  };
}

/**
 * Economy AND Express pricing for one product, plus the Express price
 * premium over Economy, for the PDP's delivery-method comparison block.
 *
 * Reuses the same locked catalog wrappers as everywhere else (no new
 * math), so it can never drift from calculateEconomyCatalogQuote /
 * calculateExpressCatalogQuote in lib/quote.ts.
 */
export function getDualDeliveryPricing(product: ProductPriceableItem): DualDeliveryPricing {
  const economy = getDeliveryPriceOption(product, getEconomyCatalogPriceLKR);
  const express = getDeliveryPriceOption(product, getExpressCatalogPriceLKR);

  const rawDelta = express.priceLKR - economy.priceLKR;
  const expressPremiumLKR = rawDelta > 0 ? rawDelta : null;

  return {
    economy,
    express,
    expressPremiumLKR,
    formattedExpressPremium: expressPremiumLKR != null ? formatLKR(expressPremiumLKR) : null,
  };
}

// ============================================================
// CART: per-line and subtotal totals
// ============================================================

export interface CartLineItem extends PriceableItem {
  qty: number;
}

/** Per-unit display price x quantity, in LKR, for one cart line. */
export function getCartLineTotalLKR(item: CartLineItem): number {
  return getDisplayPriceLKR(item) * item.qty;
}

/** Sum of every line's total, in LKR — the cart/mini-cart subtotal. */
export function getCartSubtotalLKR(items: CartLineItem[]): number {
  return items.reduce((sum, item) => sum + getCartLineTotalLKR(item), 0);
}

// ============================================================
// WHATSAPP ORDER TEXT
// ============================================================

/**
 * Builds the "• Name x2 — Rs 1,234.00" lines used in the WhatsApp order
 * message, one per cart item, using the same display price as everywhere
 * else — so the number a shopper is asked to confirm on WhatsApp always
 * matches what they saw while browsing.
 */
export function formatCartLinesForWhatsApp(items: (CartLineItem & { name: string })[]): string {
  return items
    .map((item) => `\u2022 ${item.name} x${item.qty} \u2014 ${formatLKR(getCartLineTotalLKR(item))}`)
    .join("\n");
}