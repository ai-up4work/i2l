// app/api/casecraft/upload-url/route.ts
//
// POST { file: 'photo' | 'print' | 'preview', contentType }
//   -> a one-time signed upload URL in the 'uploads' bucket, so the
//      browser uploads the customer's photo and print files straight to
//      Supabase Storage (no 4.5 MB request limit on our server).
// Signed-in shoppers only. Files go to casecraft/<user id>/, and the
// order API only accepts links from the shopper's own folder.

import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceRoleClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

const BUCKET = 'uploads'
const TYPES: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Sign in to upload your photo.' }, { status: 401 })

  const body = (await req.json().catch(() => null)) as { file?: unknown; contentType?: unknown } | null
  const file = body?.file === 'photo' || body?.file === 'print' || body?.file === 'preview' ? body.file : null
  const ext = typeof body?.contentType === 'string' ? TYPES[body.contentType] : undefined
  if (!file || !ext) return NextResponse.json({ error: 'Only JPEG, PNG or WEBP images.' }, { status: 400 })

  const path = `casecraft/${user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 10)}-${file}.${ext}`
  const storage = createServiceRoleClient().storage.from(BUCKET)
  const { data, error } = await storage.createSignedUploadUrl(path)
  if (error || !data) return NextResponse.json({ error: error?.message ?? 'Could not start the upload.' }, { status: 500 })
  const { data: pub } = storage.getPublicUrl(path)
  return NextResponse.json({ bucket: BUCKET, path, token: data.token, publicUrl: pub.publicUrl })
}
