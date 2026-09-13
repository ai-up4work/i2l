// lib/store-providers/product.ts
import { getSellerAndConfig } from '@/lib/store-config-db';
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
  const seller = await getSellerAndConfig(platform);
  if (!seller) return null;

  const config = seller.config;

  if (config.type === 'shopify') {
    return fetchShopifyProduct(platform, config, seller.name, handle);
  }
  if (config.type === 'woocommerce') {
    return fetchWooCommerceProduct(platform, config, handle);
  }
  if (config.type === 'jsonapi') {
    return fetchJsonApiProduct(platform, config, seller.name, handle);
  }
  return fetchMockProduct(platform, handle);
}