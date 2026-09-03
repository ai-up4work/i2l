// lib/store-providers/product.ts
import { affiliatedStores } from '@/components/dashboard/data';
import { getProviderConfig } from '@/lib/store-config';
import type { StoreProduct } from '@/lib/store.types';
import { fetchJsonApiProduct } from './jsonapi';
import { fetchMockProduct } from './mock';
import { fetchShopifyProduct } from './shopify';
import { fetchWooCommerceProduct } from './woocommerce';

/**
 * Single-product counterpart to /api/stores/[platform] — same provider
 * branching, but fetches one product by handle instead of a page of
 * results. Used by the product detail page. Returns null (not a thrown
 * error) for "store exists but this handle doesn't" so callers can treat
 * that as a normal notFound() case.
 */
export async function fetchStoreProduct(platform: string, handle: string): Promise<StoreProduct | null> {
  const store = affiliatedStores.find((s) => s.platform === platform);
  if (!store) return null;

  const config = getProviderConfig(platform);

  if (config.type === 'shopify') {
    return fetchShopifyProduct(platform, config, store.name, handle);
  }
  if (config.type === 'woocommerce') {
    return fetchWooCommerceProduct(platform, config, handle);
  }
  if (config.type === 'jsonapi') {
    return fetchJsonApiProduct(platform, config, store.name, handle);
  }
  return fetchMockProduct(platform, handle);
}