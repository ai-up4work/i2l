/**
 * Quote calculation
 * ------------------------------------------------------------------
 * Pure functions only — no fetching, no React — so the same numbers
 * shown in RequestPreviewPage can be reused in RequestCard, emails,
 * admin tooling, tests, etc. without re-deriving the formula.
 *
 * Swap EXCHANGE_RATE / SERVICE_FEE_RATE / FLAT_LOCAL_SHIPPING_FEE for
 * a live FX-rate lookup and a rules engine once those exist; every
 * caller already goes through calculateQuote(), so nothing downstream
 * needs to change.
 */

export const EXCHANGE_RATE = 8.1416 // US$ -> LKR

const SERVICE_FEE_RATE = 0.0634
const FLAT_LOCAL_SHIPPING_FEE = 16

export type QuoteInput = {
  unitPrice: number
  qty: number
}

export type Quote = {
  subtotal: number
  localShippingFee: number
  serviceFee: number
  estimatedFeeUsd: number
  estimatedTotalLkr: number
}

export function calculateQuote({ unitPrice, qty }: QuoteInput): Quote {
  const safeUnitPrice = Number.isFinite(unitPrice) && unitPrice > 0 ? unitPrice : 0
  const safeQty = Number.isFinite(qty) && qty > 0 ? qty : 0

  const subtotal = round2(safeUnitPrice * safeQty)
  const localShippingFee = subtotal > 0 ? FLAT_LOCAL_SHIPPING_FEE : 0
  const serviceFee = round2(subtotal * SERVICE_FEE_RATE)
  const estimatedFeeUsd = round2(subtotal + localShippingFee + serviceFee)
  const estimatedTotalLkr = Math.round(estimatedFeeUsd * EXCHANGE_RATE)

  return { subtotal, localShippingFee, serviceFee, estimatedFeeUsd, estimatedTotalLkr }
}

function round2(value: number): number {
  return Number(value.toFixed(2))
}
