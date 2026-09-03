// lib/currency.ts
import { rateToLKR } from './currency-config'

/** Symbol shown in front of every price on the site, since all prices are LKR-only now. */
const LKR_SYMBOL = 'Rs.'

/**
 * Formats a major-unit price in ANY upstream currency (e.g. USD, INR, EUR)
 * as LKR, with the LKR symbol prefixed. The site only ever displays LKR —
 * this is the single place that conversion happens, so every caller
 * (catalog cards, product detail, compareAtPrice, etc.) gets it for free
 * just by calling formatPrice as before. To adjust rates, edit
 * CURRENCY_RATES_TO_LKR in currency-config.ts; to change the symbol shown,
 * edit LKR_SYMBOL above — nothing else needs to change.
 */
export function formatPrice(amount: number, currencyCode: string | null | undefined): string {
  const amountInLKR = amount * rateToLKR(currencyCode)

  const formatted = amountInLKR.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })

  return `${LKR_SYMBOL} ${formatted}`
}