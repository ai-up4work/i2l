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
 * e.g. "USD") into the short display symbol used throughout the app
 * (e.g. "US$"). Falls back to the raw code for anything not in the
 * dropdown, so an unusual currency doesn't silently disappear.
 */
export function currencySymbolFor(code: string | null | undefined): string | null {
  if (!code) return null
  const upper = code.trim().toUpperCase()
  return CURRENCY_SYMBOLS[upper] ?? upper
}
