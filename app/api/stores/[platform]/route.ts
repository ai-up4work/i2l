// app/api/stores/[platform]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { affiliatedStores } from '@/components/dashboard/data';
import { getProviderConfig } from '@/lib/store-config';
import { fetchJsonApiProducts } from '@/lib/store-providers/jsonapi';
import { fetchMockProducts } from '@/lib/store-providers/mock';
import { fetchShopifyCollections, fetchShopifyProducts } from '@/lib/store-providers/shopify';
import { fetchWooCommerceProducts } from '@/lib/store-providers/woocommerce';
import type { ProviderFetchParams } from '@/lib/store-providers/types';
import type { StoreApiResponse, StoreApiError } from '@/lib/store.types';

const PER_PAGE_DEFAULT = 12;
const PER_PAGE_MAX = 48;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ platform: string }> }
): Promise<NextResponse<StoreApiResponse | StoreApiError | unknown>> {
  try {
    const { platform } = await params;

    const store = affiliatedStores.find((s) => s.platform === platform);
    if (!store) {
      return NextResponse.json({ error: 'Unknown store platform' }, { status: 404 });
    }

    const { searchParams } = new URL(req.url);

    // ── Collection introspection (?collections=1) ─────────────────────
    // Returns the store's REAL Shopify collections (title + handle),
    // fetched live from /collections.json — not the products list. Use
    // this to fill in collectionMap in store-config.ts and `categories`
    // in data/stores/data.ts from actual data instead of guessing, which
    // is how santhiya-fashions/old-money's category buttons ended up
    // pointing at collection names that don't exist on the real store.
    // Not wired into the normal product-fetch path at all — an entirely
    // separate response shape, gated behind this one query param so it
    // never interferes with the regular catalog request.
    if (searchParams.get('collections') === '1') {
      const config = getProviderConfig(platform);
      if (config.type !== 'shopify') {
        return NextResponse.json(
          { error: `${platform} is not a shopify-type store (got: ${config.type})` },
          { status: 400 }
        );
      }
      const headers = {
        'User-Agent': 'Mozilla/5.0 (compatible; StoreCatalog/1.0)',
        Accept: 'application/json',
        ...config.headers,
      };
      const collections = await fetchShopifyCollections(config.baseUrl, headers);
      return NextResponse.json({
        platform,
        baseUrl: config.baseUrl,
        count: collections.length,
        collections,
      });
    }

    const fetchParams: ProviderFetchParams = {
      page: Math.max(1, parseInt(searchParams.get('page') ?? '1', 10)),
      perPage: Math.min(PER_PAGE_MAX, parseInt(searchParams.get('per_page') ?? String(PER_PAGE_DEFAULT), 10)),
      category: searchParams.get('category') ?? '',
      search: (searchParams.get('search') ?? '').toLowerCase().trim(),
      sort: (searchParams.get('sort') as ProviderFetchParams['sort']) ?? 'newest',
    };

    const config = getProviderConfig(platform);

    const result =
      config.type === 'shopify'
        ? await fetchShopifyProducts(platform, config, store.name, fetchParams)
        : config.type === 'woocommerce'
        ? await fetchWooCommerceProducts(platform, config, fetchParams)
        : config.type === 'jsonapi'
        ? await fetchJsonApiProducts(platform, config, store.name, fetchParams)
        : await fetchMockProducts(platform, fetchParams);

    return NextResponse.json(
      {
        products: result.products,
        total: result.total,
        totalPages: result.totalPages,
        // Optional/additive: undefined for providers that haven't set it
        // (jsonapi, mock) — the hooks treat that the same as "exact",
        // matching their existing single-shot-fetch behavior.
        totalIsExact: result.totalIsExact,
        page: fetchParams.page,
        category: fetchParams.category || null,
        fetchedAt: new Date().toISOString(),
      },
      {
        headers: {
          // 24h edge cache, matching the provider-level fetch cache
          // (CACHE_SECONDS in shopify.ts etc.) — aligned so the CDN and the
          // Next.js Data Cache expire on roughly the same schedule instead
          // of one masking the other.
          'Cache-Control': 's-maxage=86400, stale-while-revalidate=3600',
        },
      }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.error('[store API]', msg);
    return NextResponse.json({ error: 'Failed to load store products', detail: msg }, { status: 502 });
  }
}