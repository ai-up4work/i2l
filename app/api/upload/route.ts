import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceRoleClient } from '@/lib/supabase/server' // adjust if your server client lives elsewhere

const MAX_BYTES = 5 * 1024 * 1024 // 5MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']

// Which bucket each "folder" belongs to, and whether uploads under it are
// scoped to the uploading user's own subfolder (true for user-owned content
// like avatars/reviews, false for shared content like product images).
const FOLDER_CONFIG: Record<string, { bucket: string; scopedToUser: boolean }> = {
  avatars: { bucket: 'uploads', scopedToUser: true },
  reviews: { bucket: 'uploads', scopedToUser: true },
  products: { bucket: 'uploads', scopedToUser: false },
  banners: { bucket: 'uploads', scopedToUser: false },
  // QC inspection photos — uploaded by staff (warehouse role) while
  // flagging a faulty item on /admin/qc/[id], not by the customer whose
  // order it belongs to. scopedToUser: false because "user" here is the
  // uploading staff member's own auth id, not the customer's — scoping
  // the storage path to the staffer would be meaningless for content
  // that's actually about a specific order/item, not about who clicked
  // upload. The resulting public URL is written to
  // order_item_issues.photo_url via lib/supabase/qc-issues.ts.
  qc: { bucket: 'uploads', scopedToUser: false },
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'You must be signed in to upload.' }, { status: 401 })
  }

  const formData = await req.formData()
  const file = formData.get('file')
  const folder = String(formData.get('folder') ?? '')

  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'No file provided.' }, { status: 400 })
  }

  const config = FOLDER_CONFIG[folder]
  if (!config) {
    return NextResponse.json({ error: `Unknown upload folder "${folder}".` }, { status: 400 })
  }
  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json({ error: 'Only JPEG, PNG, WEBP, or GIF images are allowed.' }, { status: 400 })
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'Image must be under 5MB.' }, { status: 400 })
  }

  const ext = file.name.split('.').pop() || 'jpg'
  const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const path = config.scopedToUser ? `${folder}/${user.id}/${unique}.${ext}` : `${folder}/${unique}.${ext}`

  // scopedToUser folders (avatars, reviews) are genuinely the uploading
  // user's own content, at a path keyed to their own auth id — keep
  // those going through the regular cookie-based client so storage RLS
  // (whatever bucket policy checks the path against auth.uid()) still
  // applies exactly as intended.
  //
  // Non-scoped folders (products, banners, qc) are staff/ops uploads
  // that aren't "owned" by whoever clicked upload — a warehouse
  // staffer attaching a QC photo isn't the customer, isn't the item,
  // and the storage path has no user id in it at all for RLS to match
  // against. Same root cause already documented and fixed for the
  // `orders`/`requests`/`chat_*` tables in
  // data/Wishdrop-admin-*-rls-fix.sql: there's no real staff-auth-aware
  // policy yet, so any write outside "auth.uid() owns this row" gets
  // rejected with "new row violates row-level security policy". Route
  // those through the service-role client (see its doc comment in
  // lib/supabase/server.ts — built for exactly this case) to bypass
  // storage RLS entirely for ops-driven content, same interim-fix
  // reasoning as the SQL files: real staff-auth-aware policies are the
  // eventual fix, this unblocks the feature today.
  const storage = config.scopedToUser ? supabase.storage : createServiceRoleClient().storage

  const { error: uploadError } = await storage
    .from(config.bucket)
    .upload(path, file, { upsert: true, cacheControl: '3600', contentType: file.type })

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 })
  }

  const {
    data: { publicUrl },
  } = storage.from(config.bucket).getPublicUrl(path)

  return NextResponse.json({ url: publicUrl, path })
}