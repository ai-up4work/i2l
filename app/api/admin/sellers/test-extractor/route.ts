// app/api/admin/sellers/test-extractor/route.ts
//
// Backs the "Test simulation" column on /admin/sellers/[sellerId]. This is
// the thing that makes each checklist item trustworthy: it does not mock,
// stub, or hand-write any product data. It builds a throwaway provider
// config from whatever the admin currently has typed into the Method
// column (unsaved) and calls the SAME fetchShopifyProducts /
// fetchWooCommerceProducts / fetchJsonApiProducts functions the live
// storefront uses at app/api/stores/[platform]/route.ts. Every check on
// the client evaluates the literal response this route returns — nothing
// is faked except the staggered reveal timing, which lives client-side.
//
// If you want to verify this yourself: open the Network tab while running
// a simulation, inspect the POST body/response here directly, or click
// "Show raw sample data" in the UI, which dumps this exact payload.
//
// Detecting WHICH provider a store runs (Shopify vs WooCommerce vs
// neither) is a separate concern, handled by
// app/api/admin/sellers/detect-store/route.ts — that route owns the
// detectStoreProvider import from lib/store-detection. This file only
// ever tests a provider type the admin (or that other route) has already
// settled on.

import { NextRequest, NextResponse } from 'next/server';
import { fetchJsonApiProduct, fetchJsonApiProducts, fetchJsonApiCategories } from '@/lib/store-providers/jsonapi';
import { fetchShopifyProduct, fetchShopifyProducts, fetchShopifyCollections } from '@/lib/store-providers/shopify';
import { fetchWooCommerceProduct, fetchWooCommerceProducts, fetchWooCommerceCategories } from '@/lib/store-providers/woocommerce';
import type { ProviderFetchParams } from '@/lib/store-providers/types';
import type { StoreProduct } from '@/lib/store.types';
import type {
  ShopifyProviderConfig,
  WooCommerceProviderConfig,
  JsonApiProviderConfig,
} from '@/lib/store-config';


// Real HTTP calls, so keep the sample small — this is a diagnostics probe,
// not a full catalog sync. Large enough to give the checklist (especially
// fieldMapping/variants/stock/images) something meaningful to inspect.
const SAMPLE_PAGE_SIZE = 24;
const SAMPLE_PRODUCTS_RETURNED = 6;

/**
 * Picks up to `n` products from a fetched page, deliberately mixing ones
 * that have variant data with ones that don't (roughly half and half,
 * whatever's actually available) rather than just taking the first `n` in
 * feed order.
 *
 * Why this matters: the "Variants & options price correctly" checklist
 * item only ever looks at whatever ended up in the sample. If the feed's
 * first page happens to be all single-SKU items (jewelry, perfume,
 * anything without size/color choices), a naive first-N sample makes the
 * check report "no variant data" even on a perfectly healthy feed that
 * DOES have variant products elsewhere on the same page. Mixing the
 * sample means an empty variants-check result is much more likely to be
 * a real absence of variant data on this page, not a sampling accident —
 * and if the page genuinely has variant products, at least one should
 * show up here.
 *
 * Backfills from whichever group is larger if one group runs short (e.g.
 * a catalog that's almost entirely single-SKU), so the sample is still
 * `n` products long whenever the feed has at least that many.
 */
function pickRepresentativeSample<T extends { variants?: unknown[] }>(products: T[], n: number): T[] {
  const withVariants = products.filter((p) => p.variants && p.variants.length > 0);
  const withoutVariants = products.filter((p) => !p.variants || p.variants.length === 0);

  const half = Math.ceil(n / 2);
  const pickedWith = withVariants.slice(0, half);
  const pickedWithout = withoutVariants.slice(0, n - pickedWith.length);
  const picked = [...pickedWith, ...pickedWithout];

  if (picked.length < n) {
    // One group ran out entirely (e.g. no variant products on this page
    // at all) — backfill from whichever group still has more to give.
    const pickedSet = new Set(picked);
    const remaining = products.filter((p) => !pickedSet.has(p));
    picked.push(...remaining.slice(0, n - picked.length));
  }

  return picked;
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
  sampleProducts?: unknown[];
}

/** Result shape for mode: 'single' — one specific product fetched by URL/
 * handle, instead of a random sample from page 1 of the feed. */
interface TestExtractorProductResult {
  ok: boolean;
  error?: string;
  product?: StoreProduct;
}

/** Result shape for mode: 'variant-scan' — walks the WHOLE catalog (up to
 * a safety cap) tallying how many products actually have variant data,
 * instead of trusting a small sample. See scanForVariants below. */
interface VariantScanResult {
  ok: boolean;
  error?: string;
  totalScanned?: number;
  /** Total products the feed itself reports, when that count is exact —
   * lets the client show "scanned all 187" vs "scanned 300 of 640+". */
  totalKnown?: number;
  withVariantsCount?: number;
  withoutVariantsCount?: number;
  /** Set when the scan hit MAX_SCAN_PRODUCTS before reaching the real end
   * of the catalog — the counts above only cover what was actually seen. */
  cappedAt?: number;
  examplesWithVariants?: { name: string; url?: string; image?: string }[];
  examplesWithoutVariants?: { name: string; url?: string; image?: string }[];
}

interface JsonFieldsBody {
  listEndpoint: string;
  idField: string;
  nameField: string;
  priceField: string;
  imageField: string;
  categoryField?: string;
  sizesField?: string;
  colorField?: string;
}

interface RequestBody {
  providerType: 'shopify' | 'woocommerce' | 'jsonapi' | 'html-scrape' | 'mock';
  baseUrl?: string;
  currency?: string;
  jsonFields?: JsonFieldsBody;
  /** 'list' (default) runs the full onboarding checklist against a page-1
   * sample. 'single' fetches exactly one product by URL/handle instead —
   * for spot-checking a specific complex product rather than whatever
   * happened to land in the random sample. 'variant-scan' pages through
   * the whole catalog (up to a cap) tallying variant vs non-variant
   * products, for when the sample-based checklist isn't conclusive
   * enough. */
  mode?: 'list' | 'single' | 'variant-scan';
  /** Required when mode is 'single'. A full product URL copied from the
   * seller's site, or a bare handle/slug/id — see extractHandle below for
   * how each provider type's URL shape is parsed. */
  productInput?: string;
}

const DEFAULT_PARAMS: ProviderFetchParams = {
  page: 1,
  perPage: SAMPLE_PAGE_SIZE,
  category: '',
  search: '',
  sort: 'newest',
};

function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, '');
}

function fail(error: string, status = 200) {
  // status 200 on purpose for "the feed genuinely failed" — that's a valid,
  // informative result for the "reachable" check to render, not a route
  // error. Reserve non-200s for malformed requests (see below).
  return NextResponse.json<TestExtractorResult>({ ok: false, error }, { status });
}

/**
 * Pulls a bare product handle/slug/id out of whatever the admin pasted.
 * Accepts either a full URL copied straight from the seller's site, or a
 * raw handle typed by hand — no requirement to know the URL convention.
 *
 * - shopify:     .../products/{handle}          → take the segment after "products"
 * - woocommerce: .../product/{slug}/            → take the segment after "product"
 * - jsonapi:     no fixed convention at all (these are ad-hoc backends,
 *                see store-config.ts) — best effort is just the last path
 *                segment; most of the time the input will just be a bare
 *                id/UUID rather than a URL at all.
 *
 * Falls back to the trimmed raw input whenever nothing more specific can
 * be parsed out, rather than failing outright — an unusual URL shape
 * should still get a real attempt, not a client-side rejection.
 */
function extractHandle(input: string, providerType: 'shopify' | 'woocommerce' | 'jsonapi'): string {
  const trimmed = input.trim();
  if (!trimmed) return trimmed;

  if (!/^https?:\/\//i.test(trimmed)) {
    // Not a URL — still strip a leading "/products/" or "/product/" in
    // case someone pasted a path fragment rather than a bare handle.
    const stripped = trimmed.replace(/^\/?(products|product)\//i, '').replace(/\/+$/, '');
    return stripped || trimmed;
  }

  try {
    const url = new URL(trimmed);
    const segments = url.pathname.split('/').filter(Boolean);
    if (providerType === 'jsonapi') {
      return segments[segments.length - 1] ? decodeURIComponent(segments[segments.length - 1]) : trimmed;
    }
    const marker = providerType === 'shopify' ? 'products' : 'product';
    const markerIdx = segments.findIndex((s) => s.toLowerCase() === marker);
    if (markerIdx !== -1 && segments[markerIdx + 1]) return decodeURIComponent(segments[markerIdx + 1]);
    return segments[segments.length - 1] ? decodeURIComponent(segments[segments.length - 1]) : trimmed;
  } catch {
    return trimmed;
  }
}

export async function POST(req: NextRequest) {
  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return NextResponse.json({ ok: false, error: 'Malformed request body.' }, { status: 400 });
  }

  const { providerType, jsonFields } = body;
  const baseUrl = body.baseUrl ? stripTrailingSlash(body.baseUrl.trim()) : '';
  const currency = body.currency?.trim() || 'USD';

  if (providerType !== 'shopify' && providerType !== 'woocommerce' && providerType !== 'jsonapi') {
    // mock/html-scrape are intentionally not testable here — the UI
    // already hides the "Run all checks" button for those, this is just
    // the server-side mirror of that same rule.
    return NextResponse.json(
      { ok: false, error: `No live test is available for provider type "${providerType}".` },
      { status: 400 }
    );
  }

  if (!baseUrl) {
    return NextResponse.json({ ok: false, error: 'A store base URL is required to run a test.' }, { status: 400 });
  }

  // ── mode: 'single' — one specific product, not a random sample ─────────
  if (body.mode === 'single') {
    const handle = extractHandle(body.productInput ?? '', providerType);
    if (!handle) {
      return NextResponse.json<TestExtractorProductResult>(
        { ok: false, error: 'Enter a product URL or handle to test.' },
        { status: 400 }
      );
    }

    try {
      if (providerType === 'shopify') {
        const config: ShopifyProviderConfig = { type: 'shopify', baseUrl, currency };
        const product = await fetchShopifyProduct('__test__', config, 'Test store', handle);
        if (!product) {
          return NextResponse.json<TestExtractorProductResult>({
            ok: false,
            error: `No product found at handle "${handle}". Check the URL is a real product page on this store.`,
          });
        }
        return NextResponse.json<TestExtractorProductResult>({ ok: true, product });
      }

      if (providerType === 'woocommerce') {
        const config: WooCommerceProviderConfig = { type: 'woocommerce', baseUrl, currency };
        const product = await fetchWooCommerceProduct('__test__', config, handle);
        if (!product) {
          return NextResponse.json<TestExtractorProductResult>({
            ok: false,
            error: `No product found at slug "${handle}". Check the URL is a real product page on this store.`,
          });
        }
        return NextResponse.json<TestExtractorProductResult>({ ok: true, product });
      }

      // providerType === 'jsonapi'
      if (!jsonFields || !jsonFields.idField || !jsonFields.nameField || !jsonFields.priceField || !jsonFields.imageField) {
        return NextResponse.json<TestExtractorProductResult>({
          ok: false,
          error: 'Id, name, price, and image fields must all be mapped before a single product can be tested.',
        });
      }
      const config: JsonApiProviderConfig = {
        type: 'jsonapi',
        baseUrl,
        currency,
        listEndpoint: jsonFields.listEndpoint || '/products/',
        idField: jsonFields.idField,
        nameField: jsonFields.nameField,
        priceField: jsonFields.priceField,
        imageField: jsonFields.imageField,
        categoryField: jsonFields.categoryField || undefined,
        sizesField: jsonFields.sizesField || undefined,
        colorField: jsonFields.colorField || undefined,
      };
      const product = await fetchJsonApiProduct('__test__', config, 'Test store', handle);
      if (!product) {
        return NextResponse.json<TestExtractorProductResult>({
          ok: false,
          error: `No product found with id "${handle}" on this feed.`,
        });
      }
      return NextResponse.json<TestExtractorProductResult>({ ok: true, product });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'The request failed.';
      return NextResponse.json<TestExtractorProductResult>({ ok: false, error: message });
    }
  }

  // ── mode: 'list' (default) — the full onboarding checklist ─────────────
  try {
    if (providerType === 'shopify') {
      const config: ShopifyProviderConfig = {
        type: 'shopify',
        baseUrl,
        currency,
      };

      const result = await fetchShopifyProducts('__test__', config, 'Test store', DEFAULT_PARAMS);

      let categories: TestExtractorCategory[] | undefined;
      let categoriesNote: string | undefined;
      try {
        const live = await fetchShopifyCollections(baseUrl);
        categories = live.map((c) => ({ handle: c.handle, title: c.title }));
      } catch {
        categoriesNote = "Couldn't fetch this store's collection list separately from the product feed.";
      }

      return NextResponse.json<TestExtractorResult>({
        ok: true,
        meta: { totalProducts: result.total, totalIsExact: result.totalIsExact, totalPages: result.totalPages },
        categories,
        categoriesNote,
        sampleProducts: pickRepresentativeSample(result.products, SAMPLE_PRODUCTS_RETURNED),
      });
    }

    if (providerType === 'woocommerce') {
      const config: WooCommerceProviderConfig = {
        type: 'woocommerce',
        baseUrl,
        currency,
        // No credential fields exist in the onboarding Method column yet,
        // so this always exercises the public store_v1 API — the same
        // path resolveApiMode() falls back to automatically when no
        // consumerKeyEnv/consumerSecretEnv are configured. If credential
        // fields get added to the form later, thread them through here.
      };

      const result = await fetchWooCommerceProducts('__test__', config, DEFAULT_PARAMS);

      let categories: TestExtractorCategory[] | undefined;
      let categoriesNote: string | undefined;
      try {
        const live = await fetchWooCommerceCategories(config);
        const populated = live.filter((c) => c.count > 0);
        if (populated.length > 0) {
          categories = populated.map((c) => ({ handle: c.slug, title: c.name }));
        } else {
          categoriesNote = 'This feed reported no populated categories.';
        }
      } catch {
        categoriesNote = "Couldn't fetch this store's category taxonomy separately from the product feed.";
      }

      return NextResponse.json<TestExtractorResult>({
        ok: true,
        meta: { totalProducts: result.total, totalIsExact: result.totalIsExact, totalPages: result.totalPages },
        categories,
        categoriesNote,
        sampleProducts: pickRepresentativeSample(result.products, SAMPLE_PRODUCTS_RETURNED),
      });
    }

    // providerType === 'jsonapi'
    if (!jsonFields || !jsonFields.idField || !jsonFields.nameField || !jsonFields.priceField || !jsonFields.imageField) {
      return fail('Id, name, price, and image fields must all be mapped before this feed can be tested.');
    }

    const config: JsonApiProviderConfig = {
      type: 'jsonapi',
      baseUrl,
      currency,
      listEndpoint: jsonFields.listEndpoint || '/products/',
      idField: jsonFields.idField,
      nameField: jsonFields.nameField,
      priceField: jsonFields.priceField,
      imageField: jsonFields.imageField,
      categoryField: jsonFields.categoryField || undefined,
      sizesField: jsonFields.sizesField || undefined,
      colorField: jsonFields.colorField || undefined,
    };

    const result = await fetchJsonApiProducts('__test__', config, 'Test store', DEFAULT_PARAMS);

    // fetchJsonApiCategories re-fetches listEndpoint and scans the FULL raw
    // list for distinct categoryField values (with counts) — more reliable
    // than deriving categories from just the 24-item sample page above,
    // since a category that only shows up later in the catalog wouldn't be
    // in that sample at all. This does mean a second request; jsonapi
    // backends are documented (see store-config.ts) as small/unpaginated,
    // so that's an acceptable cost for a one-off admin test.
    let categories: TestExtractorCategory[] | undefined;
    let categoriesNote: string | undefined;
    if (!jsonFields.categoryField) {
      categoriesNote = 'No category field mapped \u2014 nothing to check.';
    } else {
      try {
        const summaries = await fetchJsonApiCategories(config);
        if (summaries.length > 0) {
          categories = summaries.map((c) => ({
            handle: c.value.toLowerCase().trim().replace(/\s+/g, '-'),
            title: c.value,
          }));
        } else {
          categoriesNote = 'This feed reported no populated categories.';
        }
      } catch {
        categoriesNote = "Couldn't fetch this store's category values separately from the product feed.";
      }
    }

    return NextResponse.json<TestExtractorResult>({
      ok: true,
      meta: {
        totalProducts: result.total,
        // fetchJsonApiProducts has no upstream pagination to be uncertain
        // about — listEndpoint returns the FULL catalog in one response,
        // which is then sliced client-side into pages. `total` here is
        // therefore always an exact count, never a lower bound, even
        // though the underlying ProviderFetchResult doesn't set
        // totalIsExact itself (it comes back undefined/falsy, which would
        // otherwise make this check wrongly report "lower bound, could
        // not confirm the exact total").
        totalIsExact: true,
        totalPages: result.totalPages,
      },
      categories,
      categoriesNote,
      sampleProducts: pickRepresentativeSample(result.products, SAMPLE_PRODUCTS_RETURNED),
    });
  } catch (err) {
    // A thrown error here means the feed itself failed (bad URL, non-2xx
    // response, wrong shape, network error, etc) — surfaced as ok:false
    // so the "reachable" check fails honestly and every dependent check
    // renders "skipped: feed unreachable", exactly like a broken real feed.
    const message = err instanceof Error ? err.message : 'The request failed.';
    return fail(message);
  }
}