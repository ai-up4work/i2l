import { getSellerAndConfig } from '@/lib/store-config-db';
import type { StoreProduct } from '@/lib/store.types';
import { fetchJsonApiProduct } from './jsonapi';
import { fetchMockProduct } from './mock';
import { fetchShopifyProduct, fetchShopifyProductRestOnly } from './shopify';
import { fetchWooCommerceProduct } from './woocommerce';

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

/**
 * Cheap, REST-only counterpart to fetchStoreProduct — used exclusively
 * by /api/product-lookup's affiliated-seller redirect check. Never
 * triggers Shopify Plus/headless discovery (see
 * fetchShopifyProductRestOnly's own doc comment). Other providers have
 * no comparably expensive fallback tier today, so they just delegate to
 * their normal fetch function as-is.
 */
export async function fetchStoreProductForRedirectCheck(platform: string, handle: string): Promise<StoreProduct | null> {
  const seller = await getSellerAndConfig(platform);
  if (!seller) return null;

  const config = seller.config;

  if (config.type === 'shopify') {
    return fetchShopifyProductRestOnly(platform, config, seller.name, handle);
  }
  if (config.type === 'woocommerce') {
    return fetchWooCommerceProduct(platform, config, handle);
  }
  if (config.type === 'jsonapi') {
    return fetchJsonApiProduct(platform, config, seller.name, handle);
  }
  return fetchMockProduct(platform, handle);
}