// app/api/admin/sellers/[platform]/live-count/route.ts
//
// Admin-only counterpart to app/api/stores/[platform]/route.ts. Same
// provider-fetch logic, but resolves the seller via
// getSellerAndConfigForAdmin instead of getSellerAndConfig — so a seller
// still sitting at pending_review or inactive (the normal state while
// it's being set up in the admin wizard) doesn't 404 here the way it
// correctly does on the public storefront route.
//
// Gated via requireStaffRole(SOURCING_ROLES) — see lib/supabase/admin-auth.ts.
import { NextRequest, NextResponse } from 'next/server';
import { requireStaffRole, SOURCING_ROLES } from '@/lib/supabase/admin-auth';
import { getSellerAndConfigForAdmin } from '@/lib/store-config-db';
import { fetchJsonApiProducts } from '@/lib/store-providers/jsonapi';
import { fetchMockProducts } from '@/lib/store-providers/mock';
import { fetchShopifyProducts } from '@/lib/store-providers/shopify';
import { fetchWooCommerceProducts } from '@/lib/store-providers/woocommerce';
import type { ProviderFetchParams } from '@/lib/store-providers/types';

const PER_PAGE_DEFAULT = 12;
const PER_PAGE_MAX = 48;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ platform: string }> }
) {
  const authCheck = await requireStaffRole(SOURCING_ROLES);
  if (!authCheck.ok) return authCheck.response;

  try {
    const { platform } = await params;

    const seller = await getSellerAndConfigForAdmin(platform);
    if (!seller) {
      return NextResponse.json({ error: 'Unknown store platform' }, { status: 404 });
    }

    const { searchParams } = new URL(req.url);
    const fetchParams: ProviderFetchParams = {
      page: Math.max(1, parseInt(searchParams.get('page') ?? '1', 10)),
      perPage: Math.min(PER_PAGE_MAX, parseInt(searchParams.get('per_page') ?? String(PER_PAGE_DEFAULT), 10)),
      category: '',
      search: '',
      sort: 'newest',
    };

    const config = seller.config;

    const result =
      config.type === 'shopify'
        ? await fetchShopifyProducts(platform, config, seller.name, fetchParams)
        : config.type === 'woocommerce'
        ? await fetchWooCommerceProducts(platform, config, fetchParams)
        : config.type === 'jsonapi'
        ? await fetchJsonApiProducts(platform, config, seller.name, fetchParams)
        : await fetchMockProducts(platform, fetchParams);

    // Admin live-count callers only need the totals, not the actual
    // product payload — but returning the same shape as the public route
    // means useLiveProductCount doesn't need any special-casing between
    // the two endpoints, just a different URL.
    return NextResponse.json(
      {
        total: result.total,
        totalPages: result.totalPages,
        totalIsExact: result.totalIsExact,
        fetchedAt: new Date().toISOString(),
      },
      {
        headers: {
          // Admin panel wants freshness over cacheability — no shared
          // cache here, unlike the public storefront route.
          'Cache-Control': 'no-store',
        },
      }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.error('[admin live-count API]', msg);
    return NextResponse.json({ error: 'Failed to load live count', detail: msg }, { status: 502 });
  }
}