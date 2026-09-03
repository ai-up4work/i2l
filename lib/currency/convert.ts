// lib/currency/convert.ts

export const SUPPORTED_CURRENCIES = [
  'INR', 'USD', 'GBP', 'EUR', 'CAD', 'AUD', 'SGD', 'JPY', 'HKD', 'LKR',
] as const

export type CurrencyCode = (typeof SUPPORTED_CURRENCIES)[number]

// Frankfurter (ECB-sourced) doesn't cover these — route them straight to
// the fallback provider instead of wasting a round trip on a guaranteed miss.
// https://github.com/lineofflight/frankfurter/issues/144
const FRANKFURTER_UNSUPPORTED = new Set(['LKR'])

type RatesCache = {
  provider: 'frankfurter' | 'exchangerate-api'
  base: string
  rates: Record<string, number>
  fetchedAt: number
}

let cache: RatesCache | null = null
const CACHE_TTL_MS = 60 * 60 * 1000 // 1 hour — exchange rates don't need to be second-fresh

function cacheValid(provider: RatesCache['provider'], base: string): boolean {
  return !!cache && cache.provider === provider && cache.base === base && Date.now() - cache.fetchedAt < CACHE_TTL_MS
}

async function fetchFrankfurterRates(base: string): Promise<Record<string, number>> {
  if (cacheValid('frankfurter', base)) return cache!.rates

  const res = await fetch(`https://api.frankfurter.dev/v1/latest?base=${base}`)
  if (!res.ok) throw new Error(`Frankfurter fetch failed: HTTP ${res.status}`)
  const data = await res.json()

  cache = { provider: 'frankfurter', base, rates: data.rates, fetchedAt: Date.now() }
  return data.rates
}

// Fallback provider — no API key required, but covers currencies (like LKR)
// that Frankfurter's ECB source doesn't. Used only when Frankfurter can't
// serve the requested pair.
async function fetchExchangeRateApiRates(base: string): Promise<Record<string, number>> {
  if (cacheValid('exchangerate-api', base)) return cache!.rates

  const res = await fetch(`https://open.er-api.com/v6/latest/${base}`)
  if (!res.ok) throw new Error(`ExchangeRate-API fetch failed: HTTP ${res.status}`)
  const data = await res.json()
  if (data.result !== 'success') {
    throw new Error(`ExchangeRate-API error: ${data['error-type'] ?? 'unknown'}`)
  }

  cache = { provider: 'exchangerate-api', base, rates: data.rates, fetchedAt: Date.now() }
  return data.rates
}

async function fetchRates(base: string, to: string): Promise<Record<string, number>> {
  const needsFallback = FRANKFURTER_UNSUPPORTED.has(base) || FRANKFURTER_UNSUPPORTED.has(to)
  if (needsFallback) {
    return fetchExchangeRateApiRates(base)
  }

  try {
    return await fetchFrankfurterRates(base)
  } catch {
    // Frankfurter down or otherwise failed — try the fallback before giving up.
    return fetchExchangeRateApiRates(base)
  }
}

export async function convertAmount(
  amount: number,
  from: string,
  to: string
): Promise<number> {
  if (from === to) return amount
  const rates = await fetchRates(from, to)
  const rate = rates[to]
  if (rate == null) {
    throw new Error(`No exchange rate available for ${from} -> ${to}`)
  }
  return amount * rate
}

// Guards against undefined/NaN amounts so callers can never render the
// literal string "NaN" — returns an em dash placeholder instead. This was
// the root cause of a "LKRNaN" render: Intl.NumberFormat.format(undefined)
// silently coerces to NaN rather than throwing, so the try/catch below
// never caught it.
export function formatMoney(amount: number, currency: string): string {
  if (typeof amount !== 'number' || Number.isNaN(amount)) {
    return '—'
  }
  try {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
    }).format(amount)
  } catch {
    return `${currency} ${amount.toFixed(2)}`
  }
}