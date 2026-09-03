// lib/store-providers/mock.ts
import { mockProducts } from '@/components/dashboard/data';
import type { StoreProduct } from '@/lib/store.types';
import type { ProviderFetchParams, ProviderFetchResult } from './types';
import { applySort } from './types';

export function normaliseMockProduct(p: (typeof mockProducts)[number]): StoreProduct {
  return {
    id: p.id,
    handle: p.id,
    storeSlug: p.storeSlug,
    name: p.name,
    image: p.image,
    images: [p.image],
    price: p.price,
    currency: p.currency,
    inStock: true,
    category: p.category,
    condition: p.condition,
    description: p.description,
    seller: p.seller,
  };
}

export async function fetchMockProducts(
  platform: string,
  params: ProviderFetchParams
): Promise<ProviderFetchResult> {
  let products = mockProducts.filter((p) => p.storeSlug === platform).map(normaliseMockProduct);

  if (params.category) {
    products = products.filter((p) => p.category === params.category);
  }

  if (params.search) {
    const q = params.search.toLowerCase();
    products = products.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q) ||
        p.seller.toLowerCase().includes(q)
    );
  }

  products = applySort(products, params.sort);

  const total = products.length;
  const totalPages = Math.max(1, Math.ceil(total / params.perPage));
  const sliced = products.slice((params.page - 1) * params.perPage, params.page * params.perPage);

  return { products: sliced, total, totalPages };
}

/** Single-product lookup for the product detail page. `handle` is the mock product's `id`. */
export async function fetchMockProduct(platform: string, handle: string): Promise<StoreProduct | null> {
  const found = mockProducts.find((p) => p.storeSlug === platform && p.id === handle);
  return found ? normaliseMockProduct(found) : null;
}