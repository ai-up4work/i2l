// lib/currency.ts
import { rateToLKR } from './currency-config'

const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: 'US$',
  HKD: 'HK$',
  LKR: 'LKR',
  GBP: '£',
  EUR: '€',
  INR: '₹',
  AUD: 'A$',
  CAD: 'C$',
  SGD: 'S$',
  JPY: '¥',
}

/**
 * Converts an ISO 4217 code (what scraped structured data gives us,
 * e.g. "USD") into the short display symbol for that SOURCE currency
 * (e.g. "US$"). Kept for backward compatibility with any code that still
 * needs to show the original store's currency symbol (e.g. a "listed at
 * US$89 on the seller's site" aside) — but formatPrice() below no longer
 * uses this for the actual price shown to the customer, since the site
 * displays LKR only. Falls back to the raw code for anything not in the
 * dropdown, so an unusual currency doesn't silently disappear.
 */
export function currencySymbolFor(code: string | null | undefined): string | null {
  if (!code) return null
  const upper = code.trim().toUpperCase()
  return CURRENCY_SYMBOLS[upper] ?? upper
}

/** Symbol shown in front of every price on the site, since all prices are LKR-only now. */
const LKR_SYMBOL = 'Rs.'

/**
 * Formats a major-unit price in ANY upstream currency (e.g. USD, INR, EUR)
 * as LKR, with the LKR symbol prefixed. The site only ever displays LKR —
 * this is the single place that conversion happens, so every caller
 * (catalog cards, product detail, compareAtPrice, etc.) gets it for free
 * just by calling formatPrice as before.
 *
 * To adjust rates, edit CURRENCY_RATES_TO_LKR in currency-config.ts.
 * To change the symbol shown, edit LKR_SYMBOL above.
 * Nothing else needs to change.
 */
export function formatPrice(amount: number, currencyCode: string | null | undefined): string {
  const amountInLKR = amount * rateToLKR(currencyCode)

  const formatted = amountInLKR.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })

  return `${LKR_SYMBOL} ${formatted}`
}