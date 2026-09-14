import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server' // adjust if your server client lives elsewhere

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

  const { error: uploadError } = await supabase.storage
    .from(config.bucket)
    .upload(path, file, { upsert: true, cacheControl: '3600', contentType: file.type })

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 })
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from(config.bucket).getPublicUrl(path)

  return NextResponse.json({ url: publicUrl, path })
}