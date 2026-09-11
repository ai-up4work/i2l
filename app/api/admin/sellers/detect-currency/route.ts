// app/api/admin/sellers/detect-currency/route.ts
//
// Backs the Currency field in the "Catalogue feed" (Method) step. Whenever
// the admin has a live-feed provider (Shopify or WooCommerce) selected and
// a base URL typed in, this route resolves the store's REAL currency off
// its live cart endpoint — the same fetchShopifyShopCurrency (/cart.js)
// and fetchWooCommerceCurrency (/wp-json/wc/store/v1/cart) helpers that
// test-extractor/route.ts already uses for the full onboarding checklist.
//
// This is intentionally a separate, much cheaper endpoint rather than
// reusing test-extractor: the Method step needs to fire this on every
// base-URL blur / provider switch, well before the admin has necessarily
// reached "Test & verify" — running the full product-sample checklist
// just to read one currency code would be wasteful and slow.
//
// jsonapi and html-scrape are not handled here: jsonapi backends are
// ad-hoc with no generic currency source (see store-config.ts), and
// html-scrape has no live simulation wired up at all yet. Both keep
// relying on whatever the admin types in by hand.

import { NextResponse } from 'next/server'

import { fetchShopifyShopCurrency } from '@/lib/store-providers/shopify'
import { fetchWooCommerceCurrency } from '@/lib/store-providers/woocommerce'

interface RequestBody {
  providerType?: 'shopify' | 'woocommerce'
  baseUrl?: string
}

interface DetectCurrencyResult {
  ok: boolean
  error?: string
  currency?: string | null
  /** True only when a currency was actually read off the live feed.
   * false when the feed responded but had no discoverable currency —
   * the client must not treat that as a confirmed empty answer, just
   * "nothing to auto-fill, leave it to the admin". */
  currencyDetected?: boolean
}

function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, '')
}

export async function POST(request: Request) {
  let body: RequestBody
  try {
    body = await request.json()
  } catch {
    return NextResponse.json<DetectCurrencyResult>({ ok: false, error: 'Invalid request body.' }, { status: 400 })
  }

  const providerType = body.providerType
  const baseUrl = body.baseUrl ? stripTrailingSlash(body.baseUrl.trim()) : ''

  if (!baseUrl) {
    return NextResponse.json<DetectCurrencyResult>({ ok: false, error: 'A store base URL is required.' }, { status: 400 })
  }

  if (providerType !== 'shopify' && providerType !== 'woocommerce') {
    return NextResponse.json<DetectCurrencyResult>(
      { ok: false, error: `Currency auto-detection isn't available for provider type "${providerType}".` },
      { status: 400 }
    )
  }

  try {
    const currency =
      providerType === 'shopify' ? await fetchShopifyShopCurrency(baseUrl) : await fetchWooCommerceCurrency(baseUrl)

    return NextResponse.json<DetectCurrencyResult>({
      ok: true,
      currency: currency ?? null,
      currencyDetected: currency !== null,
    })
  } catch (e) {
    return NextResponse.json<DetectCurrencyResult>(
      { ok: false, error: e instanceof Error ? e.message : 'Currency detection failed.' },
      { status: 502 }
    )
  }
}