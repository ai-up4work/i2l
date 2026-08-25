import { NextResponse } from 'next/server'
import { scrapeProduct } from '@/lib/scrape'

// Same-origin only — this endpoint fetches arbitrary third-party URLs
// server-side, so it should never be reachable as an open proxy.
export async function POST(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Expected a JSON body with a "url" field.' }, { status: 400 })
  }

  const url = (body as { url?: unknown })?.url
  if (typeof url !== 'string' || !url.trim()) {
    return NextResponse.json({ error: 'A product link is required.' }, { status: 400 })
  }

  let target: URL
  try {
    target = new URL(url.trim())
  } catch {
    return NextResponse.json({ error: "That doesn't look like a valid link." }, { status: 400 })
  }

  if (target.protocol !== 'http:' && target.protocol !== 'https:') {
    return NextResponse.json({ error: 'Only http and https links are supported.' }, { status: 400 })
  }

  if (isPrivateOrLocalHost(target.hostname)) {
    return NextResponse.json({ error: 'That link cannot be looked up.' }, { status: 400 })
  }

  try {
    const product = await scrapeProduct(target.toString())
    return NextResponse.json({ product })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not read that product page.'
    return NextResponse.json({ error: message }, { status: 502 })
  }
}

// Basic SSRF guard: reject localhost, loopback, link-local, and private
// IP ranges so this endpoint can't be used to probe internal services.
function isPrivateOrLocalHost(hostname: string): boolean {
  const host = hostname.toLowerCase()

  if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) return true

  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (ipv4) {
    const [a, b] = ipv4.slice(1).map(Number)
    if (a === 127 || a === 10 || a === 0) return true
    if (a === 172 && b >= 16 && b <= 31) return true
    if (a === 192 && b === 168) return true
    if (a === 169 && b === 254) return true
  }

  if (host === '::1' || host.startsWith('fe80:') || host.startsWith('fc') || host.startsWith('fd')) return true

  return false
}
