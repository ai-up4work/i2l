// app/api/stores/[platform]/raw/[handle]/route.ts
//
// Passthrough endpoint — returns the upstream provider's response body
// completely unmodified (no normaliseShopifyProduct / normaliseV3 /
// normaliseStoreApi applied). Useful for inspecting exactly what a given
// storefront's own API returns, e.g. to check for fields (weight,
// long description, attribute names) that the normalized StoreProduct
// shape doesn't carry over.
//
// Response shape depends entirely on the platform's provider type:
//   - shopify      → Shopify's { product: {...} } from /products/{handle}.json
//   - woocommerce  → either wc/v3's raw product object (array, first match)
//                    or wc/store/v1's raw product object (array, first match),
//                    depending on which mode resolveApiMode() would pick
//   - mock         → the raw entry from mockProducts, untouched

import { NextRequest, NextResponse } from 'next/server';
import { affiliatedStores } from '@/components/dashboard/data';
import { mockProducts } from '@/components/dashboard/data';
import { getProviderConfig } from '@/lib/store-config';
import type { StoreApiError } from '@/lib/store.types';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (compatible; StoreCatalog/1.0)',
  Accept: 'application/json',
};

function hasWooCredentials(config: {
  consumerKeyEnv?: string;
  consumerSecretEnv?: string;
}): boolean {
  return !!(
    config.consumerKeyEnv &&
    config.consumerSecretEnv &&
    process.env[config.consumerKeyEnv] &&
    process.env[config.consumerSecretEnv]
  );
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ platform: string; handle: string }> }
): Promise<NextResponse> {
  try {
    const { platform, handle } = await params;

    const store = affiliatedStores.find((s) => s.platform === platform);
    if (!store) {
      return NextResponse.json({ error: 'Unknown store platform' } satisfies StoreApiError, { status: 404 });
    }

    const config = getProviderConfig(platform);

    // ── mock: no upstream, just hand back the raw local entry ──────────────
    if (config.type === 'mock') {
      const found = mockProducts.find((p) => p.storeSlug === platform && p.id === handle);
      if (!found) {
        return NextResponse.json({ error: 'Product not found' } satisfies StoreApiError, { status: 404 });
      }
      return NextResponse.json(found);
    }

    // ── shopify: raw /products/{handle}.json body, untouched ───────────────
    if (config.type === 'shopify') {
      const res = await fetch(`${config.baseUrl}/products/${encodeURIComponent(handle)}.json`, {
        headers: { ...HEADERS, ...config.headers },
        next: { revalidate: 0 }, // no caching for raw inspection
      });
      if (res.status === 404) {
        return NextResponse.json({ error: 'Product not found' } satisfies StoreApiError, { status: 404 });
      }
      if (!res.ok) {
        return NextResponse.json(
          { error: 'Upstream error', detail: `Shopify returned ${res.status}` } satisfies StoreApiError,
          { status: 502 }
        );
      }
      const raw = await res.json();
      return NextResponse.json(raw);
    }

    // ── woocommerce: raw wc/v3 or wc/store/v1 body, untouched ──────────────
    const mode =
      config.apiMode === 'wc_v3' || config.apiMode === 'store_v1'
        ? config.apiMode
        : hasWooCredentials(config)
        ? 'wc_v3'
        : 'store_v1';

    if (mode === 'wc_v3') {
      if (!hasWooCredentials(config)) {
        return NextResponse.json(
          { error: `apiMode 'wc_v3' set for ${platform} but credentials are missing` } satisfies StoreApiError,
          { status: 502 }
        );
      }
      const key = process.env[config.consumerKeyEnv!]!;
      const secret = process.env[config.consumerSecretEnv!]!;
      const auth = Buffer.from(`${key}:${secret}`).toString('base64');

      const qs = new URLSearchParams({ slug: handle });
      const res = await fetch(`${config.baseUrl}/wp-json/wc/v3/products?${qs}`, {
        headers: {
          Authorization: `Basic ${auth}`,
          Accept: 'application/json',
          ...config.headers,
        },
        next: { revalidate: 0 },
      });
      if (!res.ok) {
        return NextResponse.json(
          { error: 'Upstream error', detail: `WooCommerce (wc/v3) returned ${res.status}` } satisfies StoreApiError,
          { status: 502 }
        );
      }
      const raw = await res.json();
      const found = Array.isArray(raw) ? raw[0] : undefined;
      if (!found) {
        return NextResponse.json({ error: 'Product not found' } satisfies StoreApiError, { status: 404 });
      }
      return NextResponse.json(found);
    }

    // store_v1
    const qs = new URLSearchParams({ slug: handle });
    const res = await fetch(`${config.baseUrl}/wp-json/wc/store/v1/products?${qs}`, {
      headers: { Accept: 'application/json', ...config.headers },
      next: { revalidate: 0 },
    });
    if (!res.ok) {
      return NextResponse.json(
        { error: 'Upstream error', detail: `WooCommerce (store API) returned ${res.status}` } satisfies StoreApiError,
        { status: 502 }
      );
    }
    const raw = await res.json();
    const found = Array.isArray(raw) ? raw[0] : undefined;
    if (!found) {
      return NextResponse.json({ error: 'Product not found' } satisfies StoreApiError, { status: 404 });
    }
    return NextResponse.json(found);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.error('[store raw product API]', msg);
    return NextResponse.json(
      { error: 'Failed to load raw product', detail: msg } satisfies StoreApiError,
      { status: 502 }
    );
  }
}