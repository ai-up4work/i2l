// app/api/media/sign/route.ts
//
// POST { kind: 'image' | 'video', sellerId?: string }
//   -> everything the browser needs to upload ONE file straight to
//      Cloudinary: { uploadUrl, apiKey, timestamp, folder, signature }.
//
// Who can call it:
//   - a logged-in seller: files go to <root>/sellers/<their own slug>.
//     `sellerId` is ignored, so a seller can never write into another
//     seller's folder.
//   - staff (Super Admin / Manager / Sales): must pass `sellerId` (the
//     seller they're adding a product for).
//
// The signature covers the folder and a timestamp, and Cloudinary rejects
// it after an hour, so it can't be reused to upload somewhere else.
// The API secret never leaves the server.

import { NextRequest, NextResponse } from 'next/server'
import { getCurrentSeller } from '@/lib/supabase/seller-auth'
import { requireStaffRole, SOURCING_ROLES } from '@/lib/supabase/admin-auth'
import { cloudinaryConfig, folderSegment, signUpload, MEDIA_LIMITS, type MediaKind } from '@/lib/cloudinary'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const config = cloudinaryConfig()
  if (!config) {
    return NextResponse.json(
      { error: 'Uploads are not set up yet. Add the Cloudinary keys (see CLOUDINARY_SETUP.md).' },
      { status: 503 },
    )
  }

  const body = (await req.json().catch(() => ({}))) as { kind?: string; sellerId?: string }
  const kind: MediaKind | null = body.kind === 'image' || body.kind === 'video' ? body.kind : null
  if (!kind) return NextResponse.json({ error: 'kind must be "image" or "video".' }, { status: 400 })

  let slug: string | null = null

  const seller = await getCurrentSeller()
  if (seller) {
    slug = seller.platform
  } else {
    const auth = await requireStaffRole(SOURCING_ROLES)
    if (!auth.ok) {
      return NextResponse.json({ error: 'Log in with a seller or staff account to upload.' }, { status: 401 })
    }
    if (!body.sellerId) return NextResponse.json({ error: 'Choose a seller first.' }, { status: 400 })
    const { data } = await auth.admin.from('sellers').select('platform_slug').eq('id', body.sellerId).maybeSingle()
    slug = (data as { platform_slug: string } | null)?.platform_slug ?? null
    if (!slug) return NextResponse.json({ error: 'Seller not found.' }, { status: 404 })
  }

  const folder = `${config.folder}/sellers/${folderSegment(slug)}`
  const timestamp = Math.floor(Date.now() / 1000)
  const signature = signUpload({ folder, timestamp }, config.apiSecret)

  return NextResponse.json(
    {
      uploadUrl: `https://api.cloudinary.com/v1_1/${config.cloudName}/${kind}/upload`,
      apiKey: config.apiKey,
      timestamp,
      folder,
      signature,
      maxBytes: MEDIA_LIMITS[kind].maxBytes,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
