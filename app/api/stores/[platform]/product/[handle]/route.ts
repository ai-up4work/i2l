// app/api/stores/[platform]/product/[handle]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { fetchStoreProduct } from '@/lib/store-providers/product';
import type { StoreProduct } from '@/lib/store.types';
import type { StoreApiError } from '@/lib/store.types';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ platform: string; handle: string }> }
): Promise<NextResponse<StoreProduct | StoreApiError>> {
  try {
    const { platform, handle } = await params;

    const product = await fetchStoreProduct(platform, handle);
    if (!product) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    }

    return NextResponse.json(product, {
      headers: {
        'Cache-Control': 's-maxage=60, stale-while-revalidate=30',
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.error('[store product API]', msg);
    return NextResponse.json({ error: 'Failed to load product', detail: msg }, { status: 502 });
  }
}