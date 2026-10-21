// app/api/og/product/route.tsx
//
// GET /api/og/product?store=<platform>&p=<handle>
//
// The link-preview picture for a product (WhatsApp, Facebook, Messenger,
// Telegram, X …): a 1200×630 card with the product photo, its name and the
// store. Sellers' own photos are often several MB, odd shapes or formats a
// preview bot can't read, so links used to show no picture; this card is
// always the right size and shape. Served as JPEG (small) when sharp is
// available, PNG otherwise; cached at the edge for a day.
//
// Never shows a price: affiliated stores' source prices must stay private,
// and the shopper price depends on settings — the page has it.

import { ImageResponse } from 'next/og'
import { fetchAffiliatedStore } from '@/lib/supabase/affiliated-stores'
import { fetchStoreProduct } from '@/lib/store-providers/product'
import { absoluteUrl, SITE } from '@/lib/seo'

export const runtime = 'nodejs'

const W = 1200
const H = 630
const C = { ink: '#20242b', parchment: '#fbf6ec', teal: '#0b7280', indigo: '#08274f', muted: '#6b6f76' }

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([p.catch(() => null), new Promise<null>((r) => setTimeout(() => r(null), ms))])
}

type Sharp = (input: Buffer) => {
  resize: (o: object) => ReturnType<Sharp>
  jpeg: (o: object) => ReturnType<Sharp>
  png: () => ReturnType<Sharp>
  toBuffer: () => Promise<Buffer>
}
let sharpPromise: Promise<Sharp | null> | null = null
function loadSharp() {
  // Optional: Next.js ships sharp on most hosts. Without it we still work,
  // just with PNG output and only PNG / JPEG / GIF photos.
  sharpPromise ??= import('sharp').then((m) => (m.default ?? m) as unknown as Sharp).catch(() => null)
  return sharpPromise
}

/** The photo as a data: URL the card renderer can always read, or null. */
async function photoData(url: string | undefined | null): Promise<string | null> {
  if (!url) return null
  try {
    const abs = url.startsWith('//') ? `https:${url}` : absoluteUrl(url)
    const res = await withTimeout(fetch(abs, { headers: { 'User-Agent': 'WishdropPreview/1.0' } }), 5000)
    if (!res || !res.ok) return null
    const type = (res.headers.get('content-type') ?? '').split(';')[0].trim()
    const buf = Buffer.from(await res.arrayBuffer())
    const sharp = await loadSharp()
    if (sharp) {
      const out = await sharp(buf).resize({ width: 900, height: 900, fit: 'inside', withoutEnlargement: true }).png().toBuffer()
      return `data:image/png;base64,${out.toString('base64')}`
    }
    if (!/^image\/(png|jpe?g|gif)$/.test(type)) return null
    return `data:${type};base64,${buf.toString('base64')}`
  } catch {
    return null
  }
}

function Card({ title, store, photo, logo }: { title: string; store: string; photo: string | null; logo: string | null }) {
  const size = title.length > 70 ? 46 : title.length > 40 ? 54 : 64
  return (
    <div style={{ width: W, height: H, display: 'flex', background: C.parchment, padding: 40, fontFamily: 'Geist' }}>
      <div
        style={{
          width: 550,
          height: 550,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#ffffff',
          borderRadius: 36,
          border: '1px solid rgba(32,36,43,0.08)',
          overflow: 'hidden',
        }}
      >
        {photo ? (
          // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
          <img src={photo} style={{ maxWidth: 500, maxHeight: 500, objectFit: 'contain' }} />
        ) : (
          <div style={{ display: 'flex', fontSize: 120, color: C.teal }}>{title.charAt(0).toUpperCase()}</div>
        )}
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '24px 8px 16px 52px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          {logo ? (
            // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
            <img src={logo} style={{ width: 56, height: 56, borderRadius: 28, objectFit: 'cover', border: '1px solid rgba(32,36,43,0.1)' }} />
          ) : null}
          <div style={{ display: 'flex', fontSize: 30, color: C.muted }}>{store}</div>
        </div>
        <div
          style={{
            display: '-webkit-box',
            WebkitLineClamp: 4,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
            fontSize: size,
            lineHeight: 1.12,
            color: C.ink,
            letterSpacing: -1,
          }}
        >
          {title}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', fontSize: 26, color: C.muted, whiteSpace: 'nowrap' }}>Delivered to Sri Lanka</div>
          <div style={{ display: 'flex', fontSize: 40, color: C.teal, letterSpacing: -1 }}>{SITE.name.toLowerCase()}</div>
        </div>
      </div>
    </div>
  )
}

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams
  const platform = q.get('store') ?? ''
  const handle = q.get('p') ?? ''

  // Live stores only, like the product page itself.
  const store = platform ? await withTimeout(fetchAffiliatedStore(platform), 4000) : null
  const product = store && handle ? await withTimeout(fetchStoreProduct(platform, handle, { includeHidden: false }), 6000) : null
  const title = product?.name ?? (store ? store.name : SITE.name)
  const [photo, logo] = await Promise.all([photoData(product?.image ?? product?.images?.[0] ?? store?.cover), store?.logo ? photoData(store.logo) : null])

  const png = new ImageResponse(<Card title={title} store={store?.name ?? SITE.name} photo={photo} logo={logo} />, { width: W, height: H })
  const buf = Buffer.from(await png.arrayBuffer())
  const sharp = await loadSharp()
  const body = sharp ? await sharp(buf).jpeg({ quality: 82, mozjpeg: true } as object).toBuffer() : buf
  // Cache found products for a day; a miss only briefly, so it fixes itself.
  const maxAge = product ? 86400 : 300
  return new Response(new Uint8Array(body), {
    headers: {
      'Content-Type': sharp ? 'image/jpeg' : 'image/png',
      'Cache-Control': `public, max-age=${maxAge}, s-maxage=${maxAge}, stale-while-revalidate=604800`,
    },
  })
}
