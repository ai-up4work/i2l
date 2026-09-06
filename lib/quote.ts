// lib/quote.ts
//
// Landed cost / quote calculation for WishDrop.
// All rates/constants below are hardcoded placeholders — replace with real
// values (freight rate, HS code duty schedule) as they change. They can
// also be overridden per-call (see the `*Override` fields on QuoteInput /
// SimpleQuoteInput) — the demo page's "Adjust rates & fees" panel uses
// this to let someone tweak values live without editing code.
//
// Currency conversion is NOT duplicated here — it defers to
// lib/currency-config.ts (the same table formatPrice() uses elsewhere in
// the app) so there is exactly one place exchange rates live. Update
// CURRENCY_RATES_TO_LKR there and every price on the site, including
// quotes, picks it up automatically.

import { rateToLKR } from "./currency-config";

// ============================================================
// HARDCODED CONFIG — edit these as real values become available
// ============================================================

// Freight rate used when freight isn't manually priced (LKR per kg).
export const FREIGHT_RATE_PER_KG_LKR = 1200;

// Default weight (kg) assumed when the seller/product doesn't specify one.
export const DEFAULT_WEIGHT_KG = 0.5;

// ---- Simple markup mode (separate from the customs cascade below) ----
// Flat profit margin applied to product cost.
export const SIMPLE_PROFIT_PERCENT = 30;

export const SIMPLE_FREIGHT_RATE_PER_KG = 2380;
export const SIMPLE_CUSTOMS_CLEARANCE_RATE_PER_KG = 3500;

// Freight & customs clearance are priced per 0.5kg "block" and scale
// proportionally with weight: e.g. 1kg pays double the 0.5kg rate,
// 0.25kg pays half. Weight defaults to SIMPLE_WEIGHT_BLOCK_KG (0.5kg)
// when not supplied.
export const SIMPLE_WEIGHT_BLOCK_KG = 0.5;
export const SIMPLE_FREIGHT_RATE_PER_BLOCK_LKR = SIMPLE_FREIGHT_RATE_PER_KG / 2;
export const SIMPLE_CUSTOMS_CLEARANCE_RATE_PER_BLOCK_LKR = SIMPLE_CUSTOMS_CLEARANCE_RATE_PER_KG / 2;

// Flat fees added on top, regardless of weight or value.
export const SIMPLE_DELIVERY_FLAT_LKR = 450;
export const SIMPLE_EXTRA_MARGIN_FLAT_LKR = 250;

// ---- Economy delivery (postal) variant of the simple markup mode ----
// Economy replaces Express's separate Freight Charges + Customs
// Clearance + flat Delivery Fee with a single "Postal Charges" line
// (weight x rate/kg), and has no flat delivery fee. The flat Extra
// Margin still applies on top, same as Express.
export const SIMPLE_ECONOMY_POSTAL_RATE_PER_KG_LKR = 1100;

// Which delivery method a Simple-markup quote uses. Express = the
// original freight + customs-clearance + delivery-fee model. Economy =
// a single postal-charges line and no flat delivery fee.
export type DeliveryType = "express" | "economy";

export interface QuoteRates {
  dutyPercent: number;       // Duty % only
  palPercent: number;        // PAL % only
  sscLPercent: number;       // SSCL % only
  cessPercent: number;       // Cess % only
  surchargePercent: number;  // Surcharge % only (on Duty)
  vatPercent: number;        // VAT % only
}

// HS Code -> duty rate schedule. Add real codes/rates here.
// "DEFAULT" is used as a fallback for any HS code not explicitly listed.
export const HS_CODE_RATES: Record<string, QuoteRates> = {
  DEFAULT: {
    dutyPercent: 15,
    palPercent: 10,
    sscLPercent: 2.5,
    cessPercent: 10,
    surchargePercent: 50,
    vatPercent: 18,
  },
  "6109.10": { // e.g. cotton t-shirts
    dutyPercent: 15,
    palPercent: 10,
    sscLPercent: 2.5,
    cessPercent: 0,
    surchargePercent: 50,
    vatPercent: 18,
  },
  "8517.13": { // e.g. smartphones
    dutyPercent: 0,
    palPercent: 10,
    sscLPercent: 2.5,
    cessPercent: 0,
    surchargePercent: 0,
    vatPercent: 18,
  },
  "9503.00": { // e.g. toys
    dutyPercent: 15,
    palPercent: 10,
    sscLPercent: 2.5,
    cessPercent: 15,
    surchargePercent: 50,
    vatPercent: 18,
  },
};

// ============================================================
// INPUT / OUTPUT SHAPES
// ============================================================

export interface QuoteInput {
  pcsPerUnit: number;      // PCS / Unit — quantity being ordered
  valueINR: number;        // Value — product price per unit, in currencyCode's units
  currencyCode?: string;   // Upstream currency code (e.g. "INR", "USD"). Defaults to "INR".
  weightKg?: number;       // Weight (kg) — optional, falls back to defaultWeightKgOverride / DEFAULT_WEIGHT_KG
  hsCode: string;          // HS Code (select from dropdown) — determines duty rates
  freightLKR?: number;     // Optional manual freight override, in LKR. If omitted, calculated from weight.

  // ---- Live config overrides (all optional; fall back to the constants above) ----
  rateOverrides?: Partial<QuoteRates>;  // merged on top of the selected HS code's rates
  freightRatePerKgLKR?: number;         // overrides FREIGHT_RATE_PER_KG_LKR
  defaultWeightKgOverride?: number;     // overrides DEFAULT_WEIGHT_KG (used only when weightKg is omitted)
}

export interface QuoteBreakdown {
  // Inputs echoed back
  pcsPerUnit: number;
  hsCode: string;
  weightKg: number;
  valueINR: number;
  currencyCode: string;
  exchangeRateUsed: number; // rate from currency-config, currencyCode -> LKR

  // Per-unit basis
  productPriceLKR: number;          // Value (INR) converted to LKR, per unit
  freight: number;                  // Freight (LKR), per unit
  dutyPercent: number;
  palPercent: number;
  sscLPercent: number;
  cessPercent: number;
  surchargePercent: number;
  totalPerUnitChargesPercent: number; // sum of the % rates above
  vatPercent: number;
  cif: number;                      // CIF (LKR), per unit
  customsDuty: number;              // Customs Duty / CID (LKR), per unit
  pal: number;                      // PAL (LKR), per unit
  cess: number;                     // Cess (LKR), per unit
  surchargeOnDuty: number;          // Surcharge on Duty (LKR), per unit
  sscl: number;                     // SSCL (LKR), per unit
  dutyPalCessSurchargeSscl: number; // Duty+PAL+Cess+Surcharge+SSCL (LKR), per unit
  taxPerUnit: number;               // Tax per unit (LKR)
  vat: number;                      // VAT (LKR), per unit
  totalTax: number;                 // Total Tax (LKR), per unit
  totalLandedCost: number;          // Total Landed Cost (LKR), per unit
  priceToLandedCostPercent: number; // Price/Landed Cost (%), per unit

  // Order-level totals (per unit values x PCS/Unit)
  orderTotalLandedCost: number;
  orderTotalTax: number;
  orderProductPriceLKR: number;
  orderFreight: number;
}

// ============================================================
// CALCULATION
// ============================================================

/**
 * Calculates the full customs/duty/tax breakdown and landed cost
 * for a product being imported into Sri Lanka, given raw shopping inputs.
 *
 * Formula sequence (standard SL customs cascade), applied per unit:
 * 1. Product Price (LKR) = Value (INR) x exchange rate
 * 2. Freight = manual override, or Weight(kg) x freight rate per kg
 * 3. CIF = Product Price + Freight
 * 4. Customs Duty (CID) = CIF x Duty%
 * 5. PAL = (CIF + CID) x PAL%
 * 6. Cess = CIF x Cess%
 * 7. Surcharge on Duty = CID x Surcharge%
 * 8. SSCL = (CIF + CID + PAL + Cess + Surcharge) x SSCL%
 * 9. VAT = (CIF + CID + PAL + Cess + Surcharge + SSCL) x VAT%
 * 10. Total Tax = CID + PAL + Cess + Surcharge + SSCL + VAT
 * 11. Total Landed Cost = CIF + Total Tax
 * 12. Price/Landed Cost % = Product Price / Total Landed Cost x 100
 *
 * Order-level totals multiply the per-unit figures by PCS/Unit.
 *
 * All rates/fees can be overridden per-call via rateOverrides,
 * freightRatePerKgLKR and defaultWeightKgOverride — otherwise the module
 * constants (HS_CODE_RATES, FREIGHT_RATE_PER_KG_LKR, DEFAULT_WEIGHT_KG)
 * are used as before.
 */
export function calculateQuote(input: QuoteInput): QuoteBreakdown {
  const {
    pcsPerUnit,
    valueINR,
    hsCode,
    freightLKR: freightOverride,
  } = input;

  const currencyCode = input.currencyCode ?? "INR";

  const freightRatePerKgLKR = input.freightRatePerKgLKR ?? FREIGHT_RATE_PER_KG_LKR;
  const defaultWeightKg = input.defaultWeightKgOverride ?? DEFAULT_WEIGHT_KG;
  const weightKg = input.weightKg ?? defaultWeightKg;

  const baseRates = HS_CODE_RATES[hsCode] ?? HS_CODE_RATES.DEFAULT;
  const rates: QuoteRates = { ...baseRates, ...(input.rateOverrides ?? {}) };

  const {
    dutyPercent,
    palPercent,
    sscLPercent,
    cessPercent,
    surchargePercent,
    vatPercent,
  } = rates;

  // 1. Convert product value to LKR using the shared currency table —
  // same source formatPrice() uses everywhere else, so quotes always
  // match the LKR prices shown on the storefront.
  const exchangeRateUsed = rateToLKR(currencyCode);
  const productPriceLKR = valueINR * exchangeRateUsed;

  // 2. Freight — manual override wins, otherwise derived from weight
  const freight =
    freightOverride ?? weightKg * freightRatePerKgLKR;

  // 3. CIF
  const cif = productPriceLKR + freight;

  // 4. Customs Duty
  const customsDuty = cif * (dutyPercent / 100);

  // 5. PAL (on CIF + Duty)
  const pal = (cif + customsDuty) * (palPercent / 100);

  // 6. Cess (on CIF)
  const cess = cif * (cessPercent / 100);

  // 7. Surcharge on Duty
  const surchargeOnDuty = customsDuty * (surchargePercent / 100);

  // 8. SSCL (on CIF + Duty + PAL + Cess + Surcharge)
  const sscl =
    (cif + customsDuty + pal + cess + surchargeOnDuty) * (sscLPercent / 100);

  const dutyPalCessSurchargeSscl =
    customsDuty + pal + cess + surchargeOnDuty + sscl;

  const taxPerUnit = dutyPalCessSurchargeSscl;

  // 9. VAT (on CIF + all duty-side charges)
  const vat = (cif + dutyPalCessSurchargeSscl) * (vatPercent / 100);

  // 10. Total Tax
  const totalTax = dutyPalCessSurchargeSscl + vat;

  // 11. Total Landed Cost
  const totalLandedCost = cif + totalTax;

  // 12. Price / Landed Cost %
  const priceToLandedCostPercent =
    totalLandedCost > 0 ? (productPriceLKR / totalLandedCost) * 100 : 0;

  const totalPerUnitChargesPercent =
    dutyPercent + palPercent + sscLPercent + cessPercent + surchargePercent;

  return {
    pcsPerUnit,
    hsCode,
    weightKg,
    valueINR,
    currencyCode,
    exchangeRateUsed,

    productPriceLKR: round2(productPriceLKR),
    freight: round2(freight),
    dutyPercent,
    palPercent,
    sscLPercent,
    cessPercent,
    surchargePercent,
    totalPerUnitChargesPercent,
    vatPercent,
    cif: round2(cif),
    customsDuty: round2(customsDuty),
    pal: round2(pal),
    cess: round2(cess),
    surchargeOnDuty: round2(surchargeOnDuty),
    sscl: round2(sscl),
    dutyPalCessSurchargeSscl: round2(dutyPalCessSurchargeSscl),
    taxPerUnit: round2(taxPerUnit),
    vat: round2(vat),
    totalTax: round2(totalTax),
    totalLandedCost: round2(totalLandedCost),
    priceToLandedCostPercent: round2(priceToLandedCostPercent),

    orderTotalLandedCost: round2(totalLandedCost * pcsPerUnit),
    orderTotalTax: round2(totalTax * pcsPerUnit),
    orderProductPriceLKR: round2(productPriceLKR * pcsPerUnit),
    orderFreight: round2(freight * pcsPerUnit),
  };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

// ============================================================
// SIMPLE MARKUP MODE — a second, independent quote calculation.
// Does not touch or replace calculateQuote() above; the two modes are
// meant to be selected between (e.g. via a UI toggle), not combined.
//
// Within this mode, `deliveryType` selects between two fee structures:
//   - "express" (default): Freight Charges + Customs Clearance (both
//      scaled per weight block) + a flat Delivery Fee.
//   - "economy": a single Postal Charges line (weight x rate/kg) and
//      no flat Delivery Fee.
// Both variants still apply the same Profit% and flat Extra Margin.
// ============================================================

export interface SimpleQuoteInput {
  pcsPerUnit: number;     // PCS / Unit — quantity being ordered
  valueINR: number;       // Product cost per unit, in currencyCode's units
  currencyCode?: string;  // Upstream currency code (e.g. "INR"). Defaults to "INR".
  weightKg?: number;      // Weight (kg) — optional, falls back to weightBlockKgOverride / SIMPLE_WEIGHT_BLOCK_KG
  deliveryType?: DeliveryType; // "express" (default) or "economy"

  // ---- Live config overrides (all optional; fall back to the constants above) ----
  profitPercentOverride?: number;
  freightRatePerBlockLKROverride?: number;         // express only
  customsClearanceRatePerBlockLKROverride?: number; // express only
  weightBlockKgOverride?: number;                   // express only (block-scaling basis)
  deliveryFeeLKROverride?: number;                  // express only
  postalRatePerKgLKROverride?: number;              // economy only
  extraMarginLKROverride?: number;                  // both modes
}

export interface SimpleQuoteBreakdown {
  // Inputs echoed back
  pcsPerUnit: number;
  deliveryType: DeliveryType;
  weightKg: number;
  valueINR: number;
  currencyCode: string;
  exchangeRateUsed: number;

  // Per-unit basis, in the order the formula applies
  productCostLKR: number;   // Step 1+2: product cost converted to LKR
  profitPercent: number;    // Step 3: profit % applied
  profitAmount: number;     // Step 3: profit amount (LKR)
  costWithProfit: number;   // product cost + profit
  freightCharges: number;   // Express only: Freight Charges (0 in economy)
  customsClearance: number; // Express only: Customs Clearance (0 in economy)
  postalCharges: number;    // Economy only: Postal Charges (0 in express)
  subtotal: number;         // costWithProfit + freight/customs (express) or + postal (economy)
  deliveryFee: number;      // Express only: flat delivery fee (0 in economy)
  totalWithDelivery: number;
  extraMargin: number;      // flat extra margin, both modes
  totalCost: number;        // Final per-unit total cost (what the customer pays)

  // Order-level totals (per unit values x PCS/Unit)
  orderTotalCost: number;
  orderProductCostLKR: number;
}

/**
 * Simple markup quote model (separate from the customs-duty cascade in
 * calculateQuote). Formula, applied per unit:
 *
 * 1. Product cost (LKR) = Value x exchange rate
 * 2. Cost with profit = Product cost x (1 + Profit%)
 *
 * Express delivery:
 * 3. Freight Charges = (Weight / weightBlockKg) x rate-per-block
 * 4. Customs Clearance = (Weight / weightBlockKg) x rate-per-block
 * 5. Subtotal = Cost with profit + Freight Charges + Customs Clearance
 * 6. Total with delivery = Subtotal + flat delivery fee
 * 7. Total Cost = Total with delivery + flat extra margin
 *
 * Economy delivery:
 * 3. Postal Charges = Weight (kg) x postal rate per kg
 * 4. Subtotal = Cost with profit + Postal Charges
 * 5. Total with delivery = Subtotal (no flat delivery fee in economy)
 * 6. Total Cost = Total with delivery + flat extra margin
 *
 * Order-level totals multiply the per-unit Total Cost by PCS/Unit.
 *
 * All rates/fees can be overridden per-call via the *Override fields —
 * otherwise the module constants (SIMPLE_PROFIT_PERCENT,
 * SIMPLE_FREIGHT_RATE_PER_BLOCK_LKR, SIMPLE_ECONOMY_POSTAL_RATE_PER_KG_LKR,
 * etc.) are used as before.
 */
export function calculateSimpleQuote(
  input: SimpleQuoteInput
): SimpleQuoteBreakdown {
  const { pcsPerUnit, valueINR } = input;
  const currencyCode = input.currencyCode ?? "INR";
  const deliveryType: DeliveryType = input.deliveryType ?? "express";

  const profitPercent = input.profitPercentOverride ?? SIMPLE_PROFIT_PERCENT;
  const weightBlockKg = input.weightBlockKgOverride ?? SIMPLE_WEIGHT_BLOCK_KG;
  const extraMargin = input.extraMarginLKROverride ?? SIMPLE_EXTRA_MARGIN_FLAT_LKR;

  const weightKg = input.weightKg ?? weightBlockKg;

  // 1. Convert to LKR via the shared currency table
  const exchangeRateUsed = rateToLKR(currencyCode);
  const productCostLKR = valueINR * exchangeRateUsed;

  // 2. Profit margin
  const profitAmount = productCostLKR * (profitPercent / 100);
  const costWithProfit = productCostLKR + profitAmount;

  let freightCharges = 0;
  let customsClearance = 0;
  let postalCharges = 0;
  let deliveryFee = 0;

  if (deliveryType === "express") {
    const freightRatePerBlockLKR =
      input.freightRatePerBlockLKROverride ?? SIMPLE_FREIGHT_RATE_PER_BLOCK_LKR;
    const customsClearanceRatePerBlockLKR =
      input.customsClearanceRatePerBlockLKROverride ??
      SIMPLE_CUSTOMS_CLEARANCE_RATE_PER_BLOCK_LKR;

    // 3 & 4. Freight and customs clearance, scaled by weight block
    const weightBlocks = weightKg / weightBlockKg;
    freightCharges = weightBlocks * freightRatePerBlockLKR;
    customsClearance = weightBlocks * customsClearanceRatePerBlockLKR;

    // 6. Flat delivery fee (express only)
    deliveryFee = input.deliveryFeeLKROverride ?? SIMPLE_DELIVERY_FLAT_LKR;
  } else {
    // Economy: single postal-charges line, no flat delivery fee
    const postalRatePerKgLKR =
      input.postalRatePerKgLKROverride ?? SIMPLE_ECONOMY_POSTAL_RATE_PER_KG_LKR;
    postalCharges = weightKg * postalRatePerKgLKR;
    deliveryFee = 0;
  }

  // 5. Subtotal
  const subtotal = costWithProfit + freightCharges + customsClearance + postalCharges;

  // Total with delivery (delivery fee is 0 for economy)
  const totalWithDelivery = subtotal + deliveryFee;

  // 7. Flat extra margin -> final total cost
  const totalCost = totalWithDelivery + extraMargin;

  return {
    pcsPerUnit,
    deliveryType,
    weightKg,
    valueINR,
    currencyCode,
    exchangeRateUsed,

    productCostLKR: round2(productCostLKR),
    profitPercent,
    profitAmount: round2(profitAmount),
    costWithProfit: round2(costWithProfit),
    freightCharges: round2(freightCharges),
    customsClearance: round2(customsClearance),
    postalCharges: round2(postalCharges),
    subtotal: round2(subtotal),
    deliveryFee: round2(deliveryFee),
    totalWithDelivery: round2(totalWithDelivery),
    extraMargin: round2(extraMargin),
    totalCost: round2(totalCost),

    orderTotalCost: round2(totalCost * pcsPerUnit),
    orderProductCostLKR: round2(productCostLKR * pcsPerUnit),
  };
}

// ============================================================
// REQUEST PREVIEW QUOTE — thin wrapper around calculateSimpleQuote for
// RequestPreviewPage.tsx, which works in terms of { unitPrice, qty } and
// wants figures back in the item's original currency (not LKR), plus one
// final LKR grand total.
//
// Mapping (per unit -> order level, LKR -> currencyCode via exchangeRateUsed):
//   subtotal        = costWithProfit (product cost + profit), NOT a raw
//                      conversion — profit is already baked in.
//   serviceFee       = Freight Charges + Customs Clearance (Express), or
//                      Postal Charges (Economy). This is the only piece
//                      that differs between the two delivery methods.
//   estimatedFeeUsd  = subtotal + serviceFee, in currencyCode's units.
//                      (Field name kept for backward compatibility with
//                      the existing UI destructuring; despite the name it
//                      follows currencyCode, not literal USD.)
//   estimatedTotalLkr = the real grand total, in LKR — includes the flat
//                      Delivery Fee (Express only) and Extra Margin that
//                      subtotal/serviceFee above deliberately exclude.
// ============================================================

export interface RequestPreviewQuoteInput {
  unitPrice: number;      // per-unit product price, in currencyCode's units
  qty: number;            // quantity being ordered
  currencyCode?: string;  // e.g. draft.currency. Defaults to "INR".
  weightKg?: number;      // optional; falls back to the weight-block default
  deliveryType?: DeliveryType; // "express" (default) or "economy"

  // Pass-through overrides (all optional) — same knobs as calculateSimpleQuote
  profitPercentOverride?: number;
  freightRatePerBlockLKROverride?: number;
  customsClearanceRatePerBlockLKROverride?: number;
  weightBlockKgOverride?: number;
  deliveryFeeLKROverride?: number;
  postalRatePerKgLKROverride?: number;
  extraMarginLKROverride?: number;
}

export interface RequestPreviewQuoteBreakdown {
  subtotal: number;         // order-level cost+profit, in currencyCode's units
  serviceFee: number;       // order-level Freight+Customs (Express) or Postal (Economy), in currencyCode's units
  estimatedFeeUsd: number;  // subtotal + serviceFee, in currencyCode's units
  estimatedTotalLkr: number; // full order total incl. delivery fee/extra margin, in LKR
  deliveryType: DeliveryType;
  currencyCode: string;
  exchangeRateUsed: number;
}

export function calculateRequestPreviewQuote(
  input: RequestPreviewQuoteInput
): RequestPreviewQuoteBreakdown {
  const { unitPrice, qty } = input;
  const currencyCode = input.currencyCode ?? "INR";

  const simple = calculateSimpleQuote({
    pcsPerUnit: qty,
    valueINR: unitPrice,
    currencyCode,
    weightKg: input.weightKg,
    deliveryType: input.deliveryType,
    profitPercentOverride: input.profitPercentOverride,
    freightRatePerBlockLKROverride: input.freightRatePerBlockLKROverride,
    customsClearanceRatePerBlockLKROverride: input.customsClearanceRatePerBlockLKROverride,
    weightBlockKgOverride: input.weightBlockKgOverride,
    deliveryFeeLKROverride: input.deliveryFeeLKROverride,
    postalRatePerKgLKROverride: input.postalRatePerKgLKROverride,
    extraMarginLKROverride: input.extraMarginLKROverride,
  });

  const { exchangeRateUsed } = simple;

  // Per-unit LKR "freight+customs" (Express) or "postal" (Economy) charge —
  // the one piece that differs between delivery methods.
  const serviceFeePerUnitLKR =
    simple.deliveryType === "express"
      ? simple.freightCharges + simple.customsClearance
      : simple.postalCharges;

  // Convert LKR per-unit figures back to currencyCode and scale to order level.
  const subtotal = round2((simple.costWithProfit / exchangeRateUsed) * qty);
  const serviceFee = round2((serviceFeePerUnitLKR / exchangeRateUsed) * qty);
  const estimatedFeeUsd = round2(subtotal + serviceFee);

  // The real grand total (LKR) — includes the flat Delivery Fee (Express
  // only) and Extra Margin, which subtotal/serviceFee deliberately exclude.
  const estimatedTotalLkr = simple.orderTotalCost;

  return {
    subtotal,
    serviceFee,
    estimatedFeeUsd,
    estimatedTotalLkr,
    deliveryType: simple.deliveryType,
    currencyCode,
    exchangeRateUsed,
  };
}
































// ============================================================
// CATALOG QUOTE — the price shown on the public catalog/product page.
//
// This is deliberately a *subset* of calculateSimpleQuote's math: it
// stops at `subtotal` (product cost + profit + Freight/Customs, or +
// Postal) and does NOT include the flat Delivery Fee or flat Extra
// Margin. Those two flat fees are still charged at checkout — they're
// just not shown as a line item on the catalog page. Instead they're
// surfaced here as `serviceFeeLKR` (and split into `deliveryFeeLKR` +
// `extraMarginLKR` if you want to break it apart), so the storefront can
// frame them to the shopper as a single "Service & Delivery" (Express)
// or "Service & Postal" (Economy) charge rather than exposing the raw
// margin structure.
//
//   catalogPrice     = subtotal                (what's shown publicly)
//   serviceFeeLKR    = deliveryFee + extraMargin (Express)
//                    = extraMargin              (Economy — no flat delivery fee)
//   actualTotalCost  = catalogPrice + serviceFeeLKR = totalCost (what's actually charged)
//
// Does not duplicate any math — it's a thin read of calculateSimpleQuote's
// output, so it always stays in sync with the work-desk calculator.
// ============================================================

export interface CatalogQuoteBreakdown {
  // Inputs echoed back
  pcsPerUnit: number;
  deliveryType: DeliveryType;
  weightKg: number;
  valueINR: number;
  currencyCode: string;
  exchangeRateUsed: number;

  // Per-unit basis, in the order the storefront would walk a shopper through
  productCostLKR: number;   // Value × exchange rate
  profitPercent: number;
  profitAmount: number;
  costWithProfit: number;
  freightCharges: number;   // Express only (0 in economy)
  customsClearance: number; // Express only (0 in economy)
  postalCharges: number;    // Economy only (0 in express)

  catalogPrice: number;     // = subtotal — the number shown on the catalog page
  deliveryFeeLKR: number;   // flat delivery fee, broken out (0 in economy)
  extraMarginLKR: number;   // flat extra margin, broken out
  serviceFeeLKR: number;    // = deliveryFeeLKR + extraMarginLKR — shown as "Service & Delivery/Postal" at checkout
  actualTotalCost: number;  // = catalogPrice + serviceFeeLKR — what's really charged

  // Order-level totals (per unit values x PCS/Unit)
  orderCatalogPrice: number;
  orderServiceFeeLKR: number;
  orderActualTotalCost: number;
}

/**
 * Catalog-page price breakdown. Wraps calculateSimpleQuote and exposes
 * the pre-flat-fee subtotal as the "sticker price" for the catalog/
 * product page, plus the flat fees bundled together as a single
 * service/delivery charge you can reveal at checkout.
 *
 * Accepts the exact same input shape as calculateSimpleQuote (same
 * overrides, same deliveryType switch) so it's a drop-in alternate view
 * of the same underlying numbers — nothing is recalculated separately,
 * so it can never drift out of sync with the work-desk calculator.
 *
 * Example (INR 1000, 0.5kg, default rates):
 *   Express: catalogPrice = 7490, serviceFeeLKR = 700 (450 delivery + 250 margin), actualTotalCost = 8190
 *   Economy: catalogPrice = 5100, serviceFeeLKR = 250 (margin only, no flat delivery fee), actualTotalCost = 5350
 */
export function calculateCatalogQuote(
  input: SimpleQuoteInput
): CatalogQuoteBreakdown {
  const simple = calculateSimpleQuote(input);

  const deliveryFeeLKR = simple.deliveryFee;
  const extraMarginLKR = simple.extraMargin;
  const serviceFeeLKR = round2(deliveryFeeLKR + extraMarginLKR);

  return {
    pcsPerUnit: simple.pcsPerUnit,
    deliveryType: simple.deliveryType,
    weightKg: simple.weightKg,
    valueINR: simple.valueINR,
    currencyCode: simple.currencyCode,
    exchangeRateUsed: simple.exchangeRateUsed,

    productCostLKR: simple.productCostLKR,
    profitPercent: simple.profitPercent,
    profitAmount: simple.profitAmount,
    costWithProfit: simple.costWithProfit,
    freightCharges: simple.freightCharges,
    customsClearance: simple.customsClearance,
    postalCharges: simple.postalCharges,

    catalogPrice: simple.subtotal,
    deliveryFeeLKR,
    extraMarginLKR,
    serviceFeeLKR,
    actualTotalCost: simple.totalCost,

    orderCatalogPrice: round2(simple.subtotal * simple.pcsPerUnit),
    orderServiceFeeLKR: round2(serviceFeeLKR * simple.pcsPerUnit),
    orderActualTotalCost: simple.orderTotalCost,
  };
}

/**
 * Convenience one-liner for catalog listing pages / product grids where
 * you just need the display number per unit, not the full breakdown
 * (e.g. rendering a price on many product cards without building a
 * full breakdown object for each one).
 *
 * NOTE: this follows whatever `deliveryType` is passed in (or "express"
 * if omitted, same default as calculateSimpleQuote) — it is NOT
 * Economy-only. If you specifically want one delivery method regardless
 * of what's in `input`, use calculateExpressCatalogQuote /
 * calculateEconomyCatalogQuote (or their *PriceLKR one-liners) below
 * instead, so the call site can't accidentally get the wrong method.
 */
export function getCatalogPriceLKR(input: SimpleQuoteInput): number {
  return calculateCatalogQuote(input).catalogPrice;
}

// ---- Delivery-type-locked catalog wrappers ----
// Same calculateCatalogQuote() math underneath — these just pin
// deliveryType so the caller can't accidentally get the other method's
// price by forgetting to set (or by overriding) deliveryType on the
// input. Prefer these on the storefront/catalog/PDP wherever the
// delivery method is a fixed business decision rather than something
// the shopper picks.

/** Same as calculateCatalogQuote, but always priced as Express (Freight Charges + Customs Clearance + flat Delivery Fee), regardless of any deliveryType passed in `input`. */
export function calculateExpressCatalogQuote(
  input: Omit<SimpleQuoteInput, "deliveryType">
): CatalogQuoteBreakdown {
  return calculateCatalogQuote({ ...input, deliveryType: "express" });
}

/** Same as calculateCatalogQuote, but always priced as Economy (single Postal Charges line, no flat Delivery Fee), regardless of any deliveryType passed in `input`. */
export function calculateEconomyCatalogQuote(
  input: Omit<SimpleQuoteInput, "deliveryType">
): CatalogQuoteBreakdown {
  return calculateCatalogQuote({ ...input, deliveryType: "economy" });
}

/** Convenience one-liner: Express catalogPrice only, for product cards/PDPs that always show the Express price. */
export function getExpressCatalogPriceLKR(
  input: Omit<SimpleQuoteInput, "deliveryType">
): number {
  return calculateExpressCatalogQuote(input).catalogPrice;
}

/** Convenience one-liner: Economy catalogPrice only, for product cards/PDPs that always show the Economy price. */
export function getEconomyCatalogPriceLKR(
  input: Omit<SimpleQuoteInput, "deliveryType">
): number {
  return calculateEconomyCatalogQuote(input).catalogPrice;
}

// ---- Example usage ----
// const expressExample = calculateSimpleQuote({
//   pcsPerUnit: 2,
//   valueINR: 4500,
//   weightKg: 0.8,
// });
// const economyExample = calculateSimpleQuote({
//   pcsPerUnit: 1,
//   valueINR: 1000,
//   deliveryType: "economy",
// });
// console.log(expressExample, economyExample);
//
// const previewExample = calculateRequestPreviewQuote({
//   unitPrice: 1000,
//   qty: 1,
//   currencyCode: "INR",
//   deliveryType: "economy",
// });
// console.log(previewExample);
//
// const expressCatalog = calculateCatalogQuote({
//   pcsPerUnit: 1,
//   valueINR: 1000,
//   weightKg: 0.5,
//   deliveryType: "express",
// });
// // expressCatalog.catalogPrice     -> 7490  (what shows on the catalog page)
// // expressCatalog.serviceFeeLKR    -> 700   (450 delivery + 250 extra margin)
// // expressCatalog.actualTotalCost  -> 8190  (what's actually charged at checkout)
//
// const economyCatalog = calculateCatalogQuote({
//   pcsPerUnit: 1,
//   valueINR: 1000,
//   weightKg: 0.5,
//   deliveryType: "economy",
// });
// // economyCatalog.catalogPrice     -> 5100
// // economyCatalog.serviceFeeLKR    -> 250   (extra margin only — no flat delivery fee in economy)
// // economyCatalog.actualTotalCost  -> 5350
//
// const expressPrice = getExpressCatalogPriceLKR({
//   pcsPerUnit: 1,
//   valueINR: 1000,
//   weightKg: 0.5,
// });
// // expressPrice -> 7490 — always Express, no deliveryType field needed/accepted
//
// const economyPrice = getEconomyCatalogPriceLKR({
//   pcsPerUnit: 1,
//   valueINR: 1000,
//   weightKg: 0.5,
// });
// // economyPrice -> 5100 — always Economy, no deliveryType field needed/accepted