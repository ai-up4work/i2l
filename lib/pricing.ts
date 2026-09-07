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
  calculateEconomyCatalogQuote,
  calculateExpressCatalogQuote,
  type CatalogQuoteBreakdown,
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
// PDP / CART: Economy vs Express comparison block
// ============================================================
//
// Unlike getProductPricing (which always resolves through
// DISPLAY_DELIVERY_TYPE / Economy), this runs the same price + "was"
// price + discount% logic through BOTH delivery-locked catalog wrappers
// in lib/quote.ts, so the PDP/cart can show the shopper both methods —
// Economy as the storefront default, Express as a priced comparison —
// instead of only the single Economy price.
//
// PUBLIC PRICE BREAKDOWN: each DeliveryPriceOption carries the same
// four-row breakdown a shopper sees on the review panel, read straight
// off calculateCatalogQuote()'s public-safe fields (see lib/quote.ts):
//
//   Price          -> priceLKR          (item cost; already bundles the
//                                         INR->LKR conversion, freight/
//                                         postal, and handling — see
//                                         calculateCatalogQuote)
//   Service Charge -> serviceChargeLKR  (flat extra margin, both methods)
//   Delivery       -> deliveryFeeLKR    (flat delivery fee — 0 for Economy,
//                                         since Economy has no separate
//                                         flat delivery fee, only a
//                                         Postal Charges line baked into
//                                         Price)
//   Total          -> actualTotalLKR    (Price + Service Charge + Delivery
//                                         = calculateCatalogQuote's
//                                         actualTotalCost)
//
// This never exposes raw profit/freight/customs numbers — only the
// same fields calculateCatalogQuote already marks as public-safe.

export interface DeliveryPriceOption {
  /** "Price" row — item cost, INR->LKR conversion + freight/postal + handling all inclusive. */
  priceLKR: number;
  compareAtPriceLKR: number | null;
  discountPercent: number | null;
  formattedPrice: string;
  formattedCompareAtPrice: string | null;
  /** "Service Charge" row — flat extra margin, applies to both delivery methods. */
  serviceChargeLKR: number;
  formattedServiceCharge: string;
  /** "Delivery" row — flat delivery fee. Always 0 for Economy (no flat delivery fee in that mode). */
  deliveryFeeLKR: number;
  formattedDeliveryFee: string;
  /** "Total" row — Price + Service Charge + Delivery; what's actually charged for one unit. */
  actualTotalLKR: number;
  formattedActualTotal: string;
}

export interface DualDeliveryPricing {
  economy: DeliveryPriceOption;
  express: DeliveryPriceOption;
  /** Express priceLKR - Economy priceLKR. Null if the difference isn't positive. */
  expressPremiumLKR: number | null;
  formattedExpressPremium: string | null;
}

function toDeliveryPriceOption(quote: CatalogQuoteBreakdown, compareAtPriceLKR: number | null): DeliveryPriceOption {
  const priceLKR = quote.catalogPrice;
  const serviceChargeLKR = quote.extraMarginLKR;
  const deliveryFeeLKR = quote.deliveryFeeLKR;
  const actualTotalLKR = quote.actualTotalCost;

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
    serviceChargeLKR,
    formattedServiceCharge: formatLKR(serviceChargeLKR),
    deliveryFeeLKR,
    formattedDeliveryFee: formatLKR(deliveryFeeLKR),
    actualTotalLKR,
    formattedActualTotal: formatLKR(actualTotalLKR),
  };
}

function getDeliveryPriceOption(
  product: ProductPriceableItem,
  getCatalogQuote: (input: Omit<SimpleQuoteInput, "deliveryType">) => CatalogQuoteBreakdown
): DeliveryPriceOption {
  const base: Omit<SimpleQuoteInput, "deliveryType"> = {
    pcsPerUnit: 1,
    valueINR: product.price,
    currencyCode: product.currency,
    weightKg: product.weightKg ?? undefined,
  };

  const quote = getCatalogQuote(base);

  const showCompareAt = product.compareAtPrice != null && !!product.onSale;
  const compareAtPriceLKR = showCompareAt
    ? getCatalogQuote({ ...base, valueINR: product.compareAtPrice as number }).catalogPrice
    : null;

  return toDeliveryPriceOption(quote, compareAtPriceLKR);
}

/**
 * Economy AND Express pricing for one product, plus the Express price
 * premium over Economy — for the PDP's delivery-method comparison block
 * and the cart/checkout review panel's Price/Service Charge/Delivery/
 * Total breakdown.
 */
export function getDualDeliveryPricing(product: ProductPriceableItem): DualDeliveryPricing {
  const economy = getDeliveryPriceOption(product, calculateEconomyCatalogQuote);
  const express = getDeliveryPriceOption(product, calculateExpressCatalogQuote);

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

// ============================================================
// CHECKOUT TERMS & AGREEMENT
// ============================================================
//
// Lives here rather than in a standalone content/legal file because the
// agreement text a shopper accepts at checkout is directly about what
// the numbers on this page mean (estimated pricing, payment timing) —
// the same "what the price means" disclosure this file already owns via
// the public-safe breakdown above. If the underlying business terms
// change (e.g. when payment is actually collected), this is the one
// place to update, same rationale as DISPLAY_DELIVERY_TYPE above.
//
// TERMS_VERSION is a plain dated string, not wired to anything yet —
// once ItemRequest/dashboard gains a real field for shipping/checkout
// metadata (see the SHIPPING FORM STATE comment in the cart page), this
// is the value that should be stamped onto a confirmed order so it's
// always traceable which terms version a shopper actually agreed to.

/** Bump this whenever TERMS_SUMMARY or the linked terms document materially changes. */
export const TERMS_VERSION = "2026-09-01";

/** Where the full Terms and Conditions document lives. */
export const TERMS_URL = "/legal/terms";

/**
 * One-line summary shown next to the checkout checkbox — kept short and
 * accurate rather than trying to restate the whole document. Anything
 * here should be defensible on its own (it's the only terms text most
 * shoppers will actually read), so keep it limited to what's true today:
 * prices shown are estimates until the seller confirms availability, and
 * no payment is collected until then.
 */
export const TERMS_SUMMARY =
  "Prices shown are estimates until the seller confirms availability, and you will not be charged until then.";

/** Short label for the checkbox itself, paired with a link to TERMS_URL. */
export const TERMS_CHECKBOX_LABEL = "I have read and agree to the Terms and Conditions.";