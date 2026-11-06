// app/api/admin/sellers/[platform]/test-custom-extractor/route.ts
//
// Test & verify for stores whose extractor is written in code (store type
// 'mock' + a slug in CUSTOM_EXTRACTOR_SLUGS — see lib/store-providers/sellers).
// The generic /api/admin/sellers/test-extractor route tests a feed CONFIG
// sent from the form; these stores have no config to send, so this runs the
// real built-in extractor for the saved seller instead and answers in the
// same TestExtractorResult shape, so the panel's checklist works unchanged.
//
//   GET                      -> one listing page + total + categories
//   GET ?product=<url|slug>  -> that single product (TestExtractorProductResult)
//
// Uses the admin seller lookup, so it works while the seller is Inactive /
// Pending review. Gated via requireStaffRole(SOURCING_ROLES).
import { NextRequest, NextResponse } from 'next/server'
import { requireStaffRole, SOURCING_ROLES } from '@/lib/supabase/admin-auth'
import { getSellerAndConfigForAdmin } from '@/lib/store-config-db'
import { listStoreProducts } from '@/lib/store-listing-server'
import { fetchStoreProduct } from '@/lib/store-providers/product'
import { hasCustomExtractor } from '@/lib/store-providers/sellers'
import { ANISHKA_CATEGORY_PATHS } from '@/lib/store-providers/sellers/anishka-creation'
import { describeGuldastaSchema, fetchGuldastaCollections } from '@/lib/store-providers/sellers/guldasta-stories'

const SAMPLE_PAGE_SIZE = 24
const SAMPLE_RETURNED = 6

/** A pasted product URL or a bare slug -> the handle the extractor expects. */
function toHandle(input: string): string {
  const s = input.trim()
  try {
    const u = new URL(s)
    const parts = u.pathname.split('/').filter(Boolean)
    return decodeURIComponent(parts[parts.length - 1] ?? '')
  } catch {
    return s.replace(/^\/+|\/+$/g, '')
  }
}

async function categoriesFor(platform: string): Promise<{ handle: string; title: string; image?: string | null }[]> {
  if (platform === 'anishka-creation') return Object.keys(ANISHKA_CATEGORY_PATHS).map((t) => ({ handle: t, title: t }))
  if (platform === 'guldasta-stories') return fetchGuldastaCollections()
  return []
}

async function noteFor(platform: string): Promise<string | undefined> {
  if (platform === 'guldasta-stories') return describeGuldastaSchema().catch((e) => `Schema check failed: ${e?.message ?? e}`)
  return undefined
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ platform: string }> }) {
  const authCheck = await requireStaffRole(SOURCING_ROLES)
  if (!authCheck.ok) return authCheck.response

  const { platform } = await params
  if (!hasCustomExtractor(platform)) {
    return NextResponse.json({ ok: false, error: 'This store has no built-in extractor.' }, { status: 400 })
  }
  const seller = await getSellerAndConfigForAdmin(platform)
  if (!seller) return NextResponse.json({ ok: false, error: 'Seller not found.' }, { status: 404 })

  const productInput = req.nextUrl.searchParams.get('product')
  if (productInput != null) {
    const handle = toHandle(productInput)
    if (!handle) return NextResponse.json({ ok: false, error: 'Enter a product URL or slug.' }, { status: 400 })
    try {
      const product = await fetchStoreProduct(platform, handle, { includeHidden: true })
      return NextResponse.json(
        product ? { ok: true, product } : { ok: false, error: `No product found for "${handle}".` },
        { headers: { 'Cache-Control': 'no-store' } },
      )
    } catch (e) {
      return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'Product fetch failed.' })
    }
  }

  try {
    const [listing, categories, note] = await Promise.all([
      listStoreProducts(platform, seller, { page: 1, perPage: SAMPLE_PAGE_SIZE, category: '', search: '', sort: 'newest' }, { includeHidden: true }),
      categoriesFor(platform).catch(() => []),
      noteFor(platform),
    ])
    if (!listing.products.length) {
      return NextResponse.json({
        ok: false,
        error: `The extractor ran but returned no products.${note ? ' ' + note : ''}`,
      })
    }
    // Spread the sample across the page so it isn't just the newest few.
    const step = Math.max(1, Math.floor(listing.products.length / SAMPLE_RETURNED))
    const sampleProducts = listing.products.filter((_, i) => i % step === 0).slice(0, SAMPLE_RETURNED)
    return NextResponse.json(
      {
        ok: true,
        meta: { totalProducts: listing.total, totalPages: listing.totalPages, totalIsExact: !!listing.totalIsExact },
        categories,
        ...(categories.length ? {} : { categoriesNote: note ?? 'No categories found.' }),
        diagnostics: note,
        sampleProducts,
      },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'The extractor failed.' })
  }
}
