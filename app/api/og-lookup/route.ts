import { NextResponse } from 'next/server'
import { fetchOgMetadata } from '@/lib/og-lookup'
import { isRateLimited } from '@/lib/rate-limit'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const url = searchParams.get('url')
  if (!url) {
    return NextResponse.json({ error: 'Missing required query param: url' }, { status: 400 })
  }
  if (await isRateLimited(request, 'og-lookup', 60, 10 * 60)) {
    return NextResponse.json(
      { error: 'You’re looking up links very quickly. Please wait a few minutes and try again.' },
      { status: 429, headers: { 'Retry-After': '600' } },
    )
  }

  // fetchOgMetadata itself refuses private/internal addresses (lib/url-safety).
  const metadata = await fetchOgMetadata(url)
  return NextResponse.json(metadata)
}
