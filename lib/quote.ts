// lib/quote.ts
//
// Landed cost / quote calculation for WishDrop.
// All rates/constants below are hardcoded placeholders — replace with real
// values (freight rate, HS code duty schedule) as they change.
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

const SIMPLE_FREIGHT_RATE_PER_KG = 2380;
const SIMPLE_CUSTOMS_CLEARANCE_RATE_PER_KG = 3500;

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
  weightKg?: number;       // Weight (kg) — optional, falls back to DEFAULT_WEIGHT_KG
  hsCode: string;          // HS Code (select from dropdown) — determines duty rates
  freightLKR?: number;     // Optional manual freight override, in LKR. If omitted, calculated from weight.
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
 */
export function calculateQuote(input: QuoteInput): QuoteBreakdown {
  const {
    pcsPerUnit,
    valueINR,
    hsCode,
    freightLKR: freightOverride,
  } = input;

  const currencyCode = input.currencyCode ?? "INR";
  const weightKg = input.weightKg ?? DEFAULT_WEIGHT_KG;
  const rates = HS_CODE_RATES[hsCode] ?? HS_CODE_RATES.DEFAULT;

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
    freightOverride ?? weightKg * FREIGHT_RATE_PER_KG_LKR;

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
// ============================================================

export interface SimpleQuoteInput {
  pcsPerUnit: number;     // PCS / Unit — quantity being ordered
  valueINR: number;       // Product cost per unit, in currencyCode's units
  currencyCode?: string;  // Upstream currency code (e.g. "INR"). Defaults to "INR".
  weightKg?: number;      // Weight (kg) — optional, falls back to SIMPLE_WEIGHT_BLOCK_KG (0.5)
}

export interface SimpleQuoteBreakdown {
  // Inputs echoed back
  pcsPerUnit: number;
  weightKg: number;
  valueINR: number;
  currencyCode: string;
  exchangeRateUsed: number;

  // Per-unit basis, in the order the formula applies
  productCostLKR: number;   // Step 1+2: product cost converted to LKR
  profitPercent: number;    // Step 3: profit % applied
  profitAmount: number;     // Step 3: profit amount (LKR)
  costWithProfit: number;   // product cost + profit
  freightCharges: number;   // Step 4: Freight Charges
  customsClearance: number; // Step 5: Customs Clearance
  subtotal: number;         // costWithProfit + freight + customs clearance
  deliveryFee: number;      // Step 6: flat delivery fee
  totalWithDelivery: number;
  extraMargin: number;      // Step 7: flat extra margin
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
 * 3. Freight Charges = (Weight / 0.5) x rate-per-0.5kg
 * 4. Customs Clearance = (Weight / 0.5) x rate-per-0.5kg
 * 5. Subtotal = Cost with profit + Freight Charges + Customs Clearance
 * 6. Total with delivery = Subtotal + flat delivery fee
 * 7. Total Cost = Total with delivery + flat extra margin
 *
 * Order-level totals multiply the per-unit Total Cost by PCS/Unit.
 */
export function calculateSimpleQuote(
  input: SimpleQuoteInput
): SimpleQuoteBreakdown {
  const { pcsPerUnit, valueINR } = input;
  const currencyCode = input.currencyCode ?? "INR";
  const weightKg = input.weightKg ?? SIMPLE_WEIGHT_BLOCK_KG;

  // 1. Convert to LKR via the shared currency table
  const exchangeRateUsed = rateToLKR(currencyCode);
  const productCostLKR = valueINR * exchangeRateUsed;

  // 2. Profit margin
  const profitAmount = productCostLKR * (SIMPLE_PROFIT_PERCENT / 100);
  const costWithProfit = productCostLKR + profitAmount;

  // 3 & 4. Freight and customs clearance, scaled by weight block
  const weightBlocks = weightKg / SIMPLE_WEIGHT_BLOCK_KG;
  const freightCharges = weightBlocks * SIMPLE_FREIGHT_RATE_PER_BLOCK_LKR;
  const customsClearance =
    weightBlocks * SIMPLE_CUSTOMS_CLEARANCE_RATE_PER_BLOCK_LKR;

  // 5. Subtotal
  const subtotal = costWithProfit + freightCharges + customsClearance;

  // 6. Flat delivery fee
  const deliveryFee = SIMPLE_DELIVERY_FLAT_LKR;
  const totalWithDelivery = subtotal + deliveryFee;

  // 7. Flat extra margin -> final total cost
  const extraMargin = SIMPLE_EXTRA_MARGIN_FLAT_LKR;
  const totalCost = totalWithDelivery + extraMargin;

  return {
    pcsPerUnit,
    weightKg,
    valueINR,
    currencyCode,
    exchangeRateUsed,

    productCostLKR: round2(productCostLKR),
    profitPercent: SIMPLE_PROFIT_PERCENT,
    profitAmount: round2(profitAmount),
    costWithProfit: round2(costWithProfit),
    freightCharges: round2(freightCharges),
    customsClearance: round2(customsClearance),
    subtotal: round2(subtotal),
    deliveryFee: round2(deliveryFee),
    totalWithDelivery: round2(totalWithDelivery),
    extraMargin: round2(extraMargin),
    totalCost: round2(totalCost),

    orderTotalCost: round2(totalCost * pcsPerUnit),
    orderProductCostLKR: round2(productCostLKR * pcsPerUnit),
  };
}

// ---- Example usage ----
// const example = calculateSimpleQuote({
//   pcsPerUnit: 2,
//   valueINR: 4500,
//   weightKg: 0.8,
// });
// console.log(example);