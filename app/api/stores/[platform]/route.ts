// app/api/stores/[platform]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { affiliatedStores } from '@/components/dashboard/data';
import { getProviderConfig } from '@/lib/store-config';
import { fetchJsonApiProducts } from '@/lib/store-providers/jsonapi';
import { fetchMockProducts } from '@/lib/store-providers/mock';
import { fetchShopifyCollections, fetchShopifyProducts } from '@/lib/store-providers/shopify';
import { fetchWooCommerceCategories, fetchWooCommerceProducts } from '@/lib/store-providers/woocommerce';
import type { ProviderFetchParams } from '@/lib/store-providers/types';
import type { StoreApiResponse, StoreApiError } from '@/lib/store.types';

const PER_PAGE_DEFAULT = 12;
const PER_PAGE_MAX = 48;

// Shape the client's LiveCollectionsResponse expects, regardless of which
// provider actually produced the data.
interface LiveCollection {
  handle: string;
  title: string;
}

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

    // ── Category/collection introspection (?collections=1) ────────────
    // Returns the store's REAL categories, fetched live from the
    // provider — not the products list, and not the hand-typed
    // `categories` array in data/stores/data.ts, which can silently
    // drift from what the store actually has (the santhiya-fashions /
    // old-money bug). Every provider type is handled here now: Shopify
    // via /collections.json, WooCommerce via its real product-category
    // taxonomy (wc/v3 or the public store_v1 endpoint), and jsonapi/mock
    // via a best-effort distinct-category scan over a page of products
    // (no dedicated taxonomy endpoint to call for those).
    if (searchParams.get('collections') === '1') {
      const config = getProviderConfig(platform);
      let collections: LiveCollection[] = [];

      if (config.type === 'shopify') {
        const headers = {
          'User-Agent': 'Mozilla/5.0 (compatible; StoreCatalog/1.0)',
          Accept: 'application/json',
          ...config.headers,
        };
        const live = await fetchShopifyCollections(config.baseUrl, headers);
        collections = live.map((c) => ({ handle: c.handle, title: c.title }));
      } else if (config.type === 'woocommerce') {
        const live = await fetchWooCommerceCategories(config);
        // Only surface categories that actually have products in them —
        // an empty WooCommerce taxonomy term would otherwise render as a
        // dead-end filter button.
        collections = live
          .filter((c) => c.count > 0)
          .map((c) => ({ handle: c.slug, title: c.name }));
      } else if (config.type === 'jsonapi') {
        // No dedicated category endpoint on this provider — derive the
        // distinct set from a single large page of real products instead
        // of trusting a hand-typed list. Best-effort: a store with more
        // distinct categories than fit on one page may miss some: raise
        // perPage here if that turns out to matter for a real store.
        const result = await fetchJsonApiProducts(platform, config, store.name, {
          page: 1,
          perPage: 250,
          category: '',
          search: '',
          sort: 'newest',
        });
        const seen = new Map<string, string>(); // slug -> display name
        for (const p of result.products) {
          if (!p.category) continue;
          const slug = p.category.toLowerCase().trim().replace(/\s+/g, '-');
          if (!seen.has(slug)) seen.set(slug, p.category);
        }
        collections = Array.from(seen, ([handle, title]) => ({ handle, title }));
      } else {
        // mock stores have no "real" backing catalog to introspect.
        return NextResponse.json(
          { error: `${platform} is a mock store with no live categories to fetch` },
          { status: 400 }
        );
      }

      return NextResponse.json({
        platform,
        baseUrl: 'baseUrl' in config ? config.baseUrl : null,
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
        totalIsExact: result.totalIsExact,
        page: fetchParams.page,
        category: fetchParams.category || null,
        fetchedAt: new Date().toISOString(),
      },
      {
        headers: {
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