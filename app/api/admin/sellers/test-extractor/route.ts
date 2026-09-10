// app/api/admin/sellers/test-extractor/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { fetchShopifyCollections, fetchShopifyProducts } from '@/lib/store-providers/shopify';
import { fetchWooCommerceCategories, fetchWooCommerceProducts } from '@/lib/store-providers/woocommerce';
import { fetchJsonApiProducts } from '@/lib/store-providers/jsonapi';
import type {
  ShopifyProviderConfig,
  WooCommerceProviderConfig,
  JsonApiProviderConfig,
  StoreProviderType,
} from '@/lib/store-config';
import type { ProviderFetchParams, ProviderFetchResult } from '@/lib/store-providers/types';
import type { StoreProduct } from '@/lib/store.types';

// ---------------------------------------------------------------------------
// POST /api/admin/sellers/test-extractor
//
// Runs the SAME provider-fetch functions app/api/stores/[platform]/route.ts
// uses for the real storefront — fetchShopifyProducts / fetchWooCommerceProducts
// / fetchJsonApiProducts, plus fetchShopifyCollections / fetchWooCommerceCategories
// — against the DRAFT config currently in the scrape-config form, before it's
// saved to STORE_PROVIDERS.
//
// Returns three things, all real, not summarized down to one product:
//   - meta: the store-wide total product count / total pages / whether that
//     count is exact — same totalIsExact contract the storefront uses.
//   - categories: the real category/collection list.
//   - sampleProducts: a handful of full StoreProduct objects AS NORMALISED —
//     variants, options, sizes, colors, description, sku, stock, everything
//     — so a bad field mapping or a variant-matching bug is visible here,
//     not just discovered later on the live product page.
//
// SAMPLE_SIZE products are fetched from a real page-1 request (not
// perPage: 1) specifically so variant/option data has something to show.
// Category count/list is fetched from a real taxonomy source for Shopify
// and WooCommerce (fetchShopifyCollections / fetchWooCommerceCategories —
// same ones the live "collections=1" storefront endpoint uses). jsonapi has
// no dedicated taxonomy endpoint, so its category list is derived from the
// sampled products themselves and flagged as best-effort/incomplete rather
// than presented as if it were a full taxonomy fetch — see
// JSONAPI_CATEGORY_SAMPLE_SIZE below for why that fetch is larger than the
// products actually shown.
//
// 'platform' passed into the fetch functions is a throwaway label only
// used for error-message text — this config hasn't been saved to
// STORE_PROVIDERS yet, so there's nothing real to look up by platform.
//
// html-scrape is still NOT wired here — see the note further down.
//
// No auth check here yet — this reaches out to an arbitrary admin-supplied
// URL server-side, the same trust boundary the rest of this admin tool
// already operates in. Gate this route the same way the rest of /admin is
// gated before this ships broadly, and consider a timeout/rate limit —
// each test click now does up to 2 real outbound fetches (products +
// categories) instead of 1.
// ---------------------------------------------------------------------------

const SAMPLE_SIZE = 5;
// jsonapi has no separate categories endpoint, so its category list comes
// from scanning sampled products' own `category` field. Many small custom
// backends (see skyt-boutique's config comments) return the WHOLE catalog
// from listEndpoint regardless of page/perPage — so asking for more here
// costs nothing extra on those, and on ones that DO paginate for real, a
// bigger sample just means a more complete (if still not exhaustive)
// category list. Only the first SAMPLE_SIZE products from this same
// fetch are actually shown to the admin as `sampleProducts`.
const JSONAPI_CATEGORY_SAMPLE_SIZE = 100;

interface TestExtractorBody {
  providerType: StoreProviderType;
  baseUrl: string;
  currency?: string;
  jsonFields?: {
    listEndpoint: string;
    idField: string;
    nameField: string;
    priceField: string;
    imageField: string;
    categoryField?: string;
    sizesField?: string;
    colorField?: string;
  };
}

interface TestExtractorMeta {
  totalProducts: number;
  totalIsExact: boolean;
  totalPages: number;
}

interface TestExtractorCategory {
  handle: string;
  title: string;
}

interface TestExtractorResult {
  ok: boolean;
  error?: string;
  meta?: TestExtractorMeta;
  categories?: TestExtractorCategory[];
  categoriesNote?: string;
  sampleProducts?: StoreProduct[];
}

function fail(error: string): NextResponse<TestExtractorResult> {
  return NextResponse.json({ ok: false, error });
}

function toMeta(result: ProviderFetchResult): TestExtractorMeta {
  return {
    totalProducts: result.total,
    totalIsExact: result.totalIsExact ?? true,
    totalPages: result.totalPages,
  };
}

export async function POST(req: NextRequest): Promise<NextResponse<TestExtractorResult>> {
  let body: TestExtractorBody;
  try {
    body = (await req.json()) as TestExtractorBody;
  } catch {
    return fail('Malformed request body.');
  }

  const baseUrl = body.baseUrl?.trim().replace(/\/+$/, '');
  if (!baseUrl) return fail('Store base URL is required.');
  if (!/^https?:\/\//i.test(baseUrl)) return fail('Store base URL must start with http:// or https://.');

  const currency = body.currency?.trim() || undefined;

  try {
    if (body.providerType === 'shopify') {
      const config: ShopifyProviderConfig = { type: 'shopify', baseUrl, currency };
      const sampleParams: ProviderFetchParams = { page: 1, perPage: SAMPLE_SIZE, category: '', search: '', sort: 'newest' };

      const [productsOutcome, collectionsOutcome] = await Promise.allSettled([
        fetchShopifyProducts('__test__', config, 'Test store', sampleParams),
        fetchShopifyCollections(baseUrl),
      ]);

      if (productsOutcome.status === 'rejected') {
        return fail(errorMessage(productsOutcome.reason));
      }
      const result = productsOutcome.value;
      if (result.products.length === 0) {
        return fail('Feed responded but returned no products \u2014 check the base URL.');
      }

      const categories =
        collectionsOutcome.status === 'fulfilled' ? collectionsOutcome.value.map((c) => ({ handle: c.handle, title: c.title })) : [];

      return NextResponse.json<TestExtractorResult>({
        ok: true,
        meta: toMeta(result),
        categories,
        categoriesNote:
          collectionsOutcome.status === 'rejected'
            ? 'Couldn\u2019t fetch /collections.json for this store \u2014 category list unavailable.'
            : undefined,
        sampleProducts: result.products,
      });
    }

    if (body.providerType === 'woocommerce') {
      // Always the public, unauthenticated path — see the note on this in
      // the original single-product version of this route. No
      // consumerKeyEnv/consumerSecretEnv wired through from the form.
      const config: WooCommerceProviderConfig = { type: 'woocommerce', baseUrl, currency };
      const sampleParams: ProviderFetchParams = { page: 1, perPage: SAMPLE_SIZE, category: '', search: '', sort: 'newest' };

      const [productsOutcome, categoriesOutcome] = await Promise.allSettled([
        fetchWooCommerceProducts('__test__', config, sampleParams),
        fetchWooCommerceCategories(config),
      ]);

      if (productsOutcome.status === 'rejected') {
        return fail(errorMessage(productsOutcome.reason));
      }
      const result = productsOutcome.value;
      if (result.products.length === 0) {
        return fail('Feed responded but returned no products \u2014 check the base URL.');
      }

      // fetchWooCommerceCategories never rejects (returns [] on failure),
      // but handle the outcome shape defensively anyway.
      const rawCategories = categoriesOutcome.status === 'fulfilled' ? categoriesOutcome.value : [];
      const categories = rawCategories.filter((c) => c.count > 0).map((c) => ({ handle: c.slug, title: c.name }));

      return NextResponse.json<TestExtractorResult>({
        ok: true,
        meta: toMeta(result),
        categories,
        categoriesNote: rawCategories.length === 0 ? 'This store reported no product categories.' : undefined,
        sampleProducts: result.products,
      });
    }

    if (body.providerType === 'jsonapi') {
      const f = body.jsonFields;
      if (!f?.listEndpoint || !f.idField || !f.nameField || !f.priceField || !f.imageField) {
        return fail('List endpoint, id, name, price, and image fields are all required before testing.');
      }
      const config: JsonApiProviderConfig = {
        type: 'jsonapi',
        baseUrl,
        currency,
        listEndpoint: f.listEndpoint,
        idField: f.idField,
        nameField: f.nameField,
        priceField: f.priceField,
        imageField: f.imageField,
        categoryField: f.categoryField || undefined,
        sizesField: f.sizesField || undefined,
        colorField: f.colorField || undefined,
      };
      const categorySampleParams: ProviderFetchParams = {
        page: 1,
        perPage: JSONAPI_CATEGORY_SAMPLE_SIZE,
        category: '',
        search: '',
        sort: 'newest',
      };

      let result: ProviderFetchResult;
      try {
        result = await fetchJsonApiProducts('__test__', config, 'Test store', categorySampleParams);
      } catch (e) {
        return fail(errorMessage(e));
      }
      if (result.products.length === 0) {
        return fail('Feed responded but returned no products \u2014 check the base URL and field mapping.');
      }

      const seen = new Map<string, string>();
      for (const p of result.products) {
        if (!p.category) continue;
        const slug = p.category.toLowerCase().trim().replace(/\s+/g, '-');
        if (!seen.has(slug)) seen.set(slug, p.category);
      }
      const categories = Array.from(seen, ([handle, title]) => ({ handle, title }));

      return NextResponse.json<TestExtractorResult>({
        ok: true,
        meta: toMeta(result),
        categories,
        categoriesNote:
          f.categoryField && categories.length > 0
            ? `Derived from ${result.products.length} sampled product${result.products.length === 1 ? '' : 's'} \u2014 this backend has no dedicated category endpoint, so this may not be the full list.`
            : !f.categoryField
            ? 'No category field mapped for this store.'
            : undefined,
        // Only the first SAMPLE_SIZE go to the admin as visible sample
        // products — the rest of `result.products` was fetched purely to
        // widen the category scan above.
        sampleProducts: result.products.slice(0, SAMPLE_SIZE),
      });
    }

    if (body.providerType === 'html-scrape') {
      return fail(
        'HTML-scrape testing isn\u2019t wired to a live extractor yet \u2014 this needs the real scraping engine behind app/api/scrape/route.ts (lib/scrape/parsers) plugged in here first.'
      );
    }

    return fail(`"${body.providerType}" has no live feed to test.`);
  } catch (err) {
    return fail(errorMessage(err));
  }
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Unknown error while testing this feed.';
}