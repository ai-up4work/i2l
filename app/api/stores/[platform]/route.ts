// app/api/stores/[platform]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getSellerAndConfig, getSellerAndConfigForAdmin, sellerPricingInfo } from '@/lib/store-config-db';
import { withStorePricing } from '@/lib/store-origin';
import { applyCategoryTiles } from '@/lib/category-tiles';
import { canPreviewStore, PREVIEW_CACHE_HEADERS } from '@/lib/store-preview';
import { fetchJsonApiProducts } from '@/lib/store-providers/jsonapi';
import { fetchMockProducts } from '@/lib/store-providers/mock';
import { fetchShopifyCollections, fetchShopifyProducts } from '@/lib/store-providers/shopify';
// WooCommerce list requests go through the CATALOG-CACHED function: it
// downloads the catalog once and filters category / search / sort locally.
// The plain fetchWooCommerceProducts only forwards a category when the slug
// is a key in config.categoryMap, so an unmapped handle such as
// "askeladd-vinland-saga" silently returned the full, unfiltered list.
import { fetchWooCommerceCategories, fetchWooCommerceProductsCached } from '@/lib/store-providers/woocommerce';
import { fetchHtmlScrapeProducts } from '@/lib/store-providers/html-scrape';
import { fetchCatalogueCategories, fetchCatalogueProducts } from '@/lib/store-providers/catalogue';
import { fetchAnishkaCreationProducts, ANISHKA_BASE_URL, ANISHKA_CATEGORY_PATHS } from '@/lib/store-providers/sellers/anishka-creation';
import type { ProviderFetchParams } from '@/lib/store-providers/types';
import type { StoreApiResponse, StoreApiError } from '@/lib/store.types';

const PER_PAGE_DEFAULT = 12;
const PER_PAGE_MAX = 48;

const SORTS: ProviderFetchParams['sort'][] = ['newest', 'price-asc', 'price-desc', 'sale'];

// Shape the client's LiveCollectionsResponse expects, regardless of which
// provider actually produced the data.
interface LiveCollection {
  handle: string;
  title: string;
  image?: string | null;
}

/** parseInt that never returns NaN (NaN would break pagination maths downstream). */
function intParam(value: string | null, fallback: number): number {
  const n = parseInt(value ?? '', 10);
  return Number.isFinite(n) ? n : fallback;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ platform: string }> }
): Promise<NextResponse<StoreApiResponse | StoreApiError | unknown>> {
  try {
    const { platform } = await params;

    let seller = await getSellerAndConfig(platform);
    // A hidden store (not 'active') resolves to nothing for shoppers and
    // for its own seller. Staff who manage stores get a preview instead —
    // never cached, see lib/store-preview.ts.
    let preview = false;
    if (!seller && (await canPreviewStore(platform))) {
      seller = await getSellerAndConfigForAdmin(platform);
      preview = Boolean(seller);
    }
    if (!seller) {
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
      // Hardcoded one-off extractor — see
      // lib/store-providers/sellers/anishka-creation.ts's header comment
      // for why this platform is checked before the generic provider
      // dispatch below, same as the main products branch further down.
      if (platform === 'anishka-creation') {
        return NextResponse.json({
          platform,
          baseUrl: ANISHKA_BASE_URL,
          count: Object.keys(ANISHKA_CATEGORY_PATHS).length,
          collections: searchParams.get('raw') === '1'
            ? Object.keys(ANISHKA_CATEGORY_PATHS).map((title) => ({ handle: title, title, image: null, featured: false }))
            : applyCategoryTiles(Object.keys(ANISHKA_CATEGORY_PATHS).map((title) => ({ handle: title, title })), seller.config),
        });
      }

      const config = seller.config;
      let collections: LiveCollection[] = [];

      if (config.type === 'shopify') {
        const headers = {
          'User-Agent': 'Mozilla/5.0 (compatible; StoreCatalog/1.0)',
          Accept: 'application/json',
          ...config.headers,
        };
        const live = await fetchShopifyCollections(config.baseUrl, headers);
        collections = live.map((c) => ({ handle: c.handle, title: c.title, image: c.image ?? null }));
      } else if (config.type === 'woocommerce') {
        const live = await fetchWooCommerceCategories(config);
        // Only surface categories that actually have products in them —
        // an empty WooCommerce taxonomy term would otherwise render as a
        // dead-end filter button.
        collections = live
          .filter((c) => c.count > 0)
          .map((c) => ({ handle: c.slug, title: c.name, image: c.image }));
      } else if (config.type === 'jsonapi') {
        // No dedicated category endpoint on this provider — derive the
        // distinct set from a single large page of real products instead
        // of trusting a hand-typed list. Best-effort: a store with more
        // distinct categories than fit on one page may miss some: raise
        // perPage here if that turns out to matter for a real store.
        const result = await fetchJsonApiProducts(platform, config, seller.name, {
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
      } else if (config.type === 'catalogue') {
        // Our own DB-backed store (Wishdrop Mall) — distinct categories of
        // its live products.
        collections = await fetchCatalogueCategories(platform, { includeHidden: preview });
      } else if (config.type === 'html-scrape') {
        // Real category browsing now works when the seller's config has
        // a categoryMap (see HtmlScrapeProviderConfig in store-config.ts)
        // — each entry becomes a filter button, and fetchHtmlScrapeProducts
        // requests that category's own listing page instead of the
        // default one. No categoryMap configured still means a single
        // implicit "General" category, same as before.
        collections = config.categoryMap
          ? Object.keys(config.categoryMap).map((category) => ({ handle: category, title: category }))
          : [];
      } else {
        // mock stores have no "real" backing catalog to introspect.
        return NextResponse.json(
          { error: `${platform} is a mock store with no live categories to fetch` },
          { status: 400 }
        );
      }

      // Lay the saved category images (seller wizard, provider_config.
      // categoryTiles) over the live list, and mark which ones go in the
      // store page's "Shop by category" row. See lib/category-tiles.ts.
      // ?raw=1 (admin category-image lookup) wants the store's own images only.
      const withTiles = searchParams.get('raw') === '1'
        ? collections.map((c) => ({ ...c, image: c.image ?? null, featured: false }))
        : applyCategoryTiles(collections, config);

      return NextResponse.json({
        platform,
        baseUrl: 'baseUrl' in config ? config.baseUrl : null,
        count: withTiles.length,
        collections: withTiles,
      }, preview ? { headers: PREVIEW_CACHE_HEADERS } : undefined);
    }

    const sortRaw = searchParams.get('sort') as ProviderFetchParams['sort'] | null;
    const fetchParams: ProviderFetchParams = {
      page: Math.max(1, intParam(searchParams.get('page'), 1)),
      perPage: Math.min(PER_PAGE_MAX, Math.max(1, intParam(searchParams.get('per_page'), PER_PAGE_DEFAULT))),
      category: searchParams.get('category') ?? '',
      search: (searchParams.get('search') ?? '').toLowerCase().trim(),
      sort: sortRaw && SORTS.includes(sortRaw) ? sortRaw : 'newest',
    };

    const config = seller.config;

    const result =
      platform === 'anishka-creation'
        ? await fetchAnishkaCreationProducts(platform, seller.name, fetchParams)
        : config.type === 'shopify'
        ? await fetchShopifyProducts(platform, config, seller.name, fetchParams)
        : config.type === 'woocommerce'
        ? await fetchWooCommerceProductsCached(platform, config, fetchParams)
        : config.type === 'jsonapi'
        ? await fetchJsonApiProducts(platform, config, seller.name, fetchParams)
        : config.type === 'html-scrape'
        ? await fetchHtmlScrapeProducts(platform, config, seller.name, fetchParams)
        : config.type === 'catalogue'
        ? await fetchCatalogueProducts(platform, seller.name, fetchParams, { includeHidden: preview, collection: searchParams.get('collection') || undefined })
        : await fetchMockProducts(platform, fetchParams);

    return NextResponse.json(
      {
        products: result.products.map((p) => withStorePricing(p, sellerPricingInfo(seller))),
        total: result.total,
        totalPages: result.totalPages,
        totalIsExact: result.totalIsExact,
        page: fetchParams.page,
        category: fetchParams.category || null,
        fetchedAt: new Date().toISOString(),
      },
      {
        headers: preview ? PREVIEW_CACHE_HEADERS : {
          // Our own catalogue (Wishdrop Mall) changes whenever staff add a
          // product or edit a margin — a 24h CDN cache would hide those
          // edits for a day. Third-party feeds keep the long cache.
          'Cache-Control':
            config.type === 'catalogue'
              ? 's-maxage=60, stale-while-revalidate=60'
              : 's-maxage=86400, stale-while-revalidate=3600',
        },
      }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.error('[store API]', msg);
    return NextResponse.json({ error: 'Failed to load store products', detail: msg }, { status: 502 });
  }
}