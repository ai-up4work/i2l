// app/api/stores/[platform]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { affiliatedStores } from '@/components/dashboard/data';
import { getProviderConfig } from '@/lib/store-config';
import { fetchJsonApiProducts } from '@/lib/store-providers/jsonapi';
import { fetchMockProducts } from '@/lib/store-providers/mock';
import { fetchShopifyProducts } from '@/lib/store-providers/shopify';
import { fetchWooCommerceProducts } from '@/lib/store-providers/woocommerce';
import type { ProviderFetchParams } from '@/lib/store-providers/types';
import type { StoreApiResponse, StoreApiError } from '@/lib/store.types';

const PER_PAGE_DEFAULT = 12;
const PER_PAGE_MAX = 48;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ platform: string }> }
): Promise<NextResponse<StoreApiResponse | StoreApiError>> {
  try {
    const { platform } = await params;

    const store = affiliatedStores.find((s) => s.platform === platform);
    if (!store) {
      return NextResponse.json({ error: 'Unknown store platform' }, { status: 404 });
    }

    const { searchParams } = new URL(req.url);
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