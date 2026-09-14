import { NextResponse } from 'next/server'
import { fetchOgMetadata } from '@/lib/og-lookup'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const url = searchParams.get('url')
  if (!url) {
    return NextResponse.json({ error: 'Missing required query param: url' }, { status: 400 })
  }
  const metadata = await fetchOgMetadata(url)
  return NextResponse.json(metadata)
}
