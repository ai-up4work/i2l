import { NextResponse } from 'next/server'
import { scrapeProduct } from '@/lib/scrape/parsers'

// Must be >= the ScraperAPI TOTAL_BUDGET_MS (5 min) or the platform
// will kill the function before scrapeProduct() gets a chance to
// finish and return — silently reintroducing the exact "server
// finished but nobody was listening" problem this whole fix is for.
export const maxDuration = 300 // seconds

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const url = searchParams.get('url')
  const needVariants = searchParams.get('needVariants') === 'true'

  if (!url) {
    return NextResponse.json({ error: 'Missing required query param: url' }, { status: 400 })
  }

  // request.signal fires if the client disconnects — threading it down
  // means an abandoned request actually stops the upstream ScraperAPI
  // call instead of running to completion (and billing) with nobody
  // there to receive the result.
  const result = await scrapeProduct(url, { needVariants, signal: request.signal })
  return NextResponse.json(result)
}