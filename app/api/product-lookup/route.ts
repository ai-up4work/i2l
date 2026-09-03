// app/api/product-lookup/route.ts
import { NextResponse } from 'next/server'
import { scrapeProduct } from '@/lib/scrape/parsers'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const url = searchParams.get('url')
  const needVariants = searchParams.get('needVariants') === 'true'

  if (!url) {
    return NextResponse.json({ error: 'Missing required query param: url' }, { status: 400 })
  }

  const result = await scrapeProduct(url, { needVariants })
  console.log('[product-lookup]', JSON.stringify(result, null, 2)) // TEMP — remove after debugging
  return NextResponse.json(result)
}