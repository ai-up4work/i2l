// app/api/seller/profile/route.ts
//
// GET   -> the logged-in seller's own store profile.
// PATCH -> update it: description, tagline, logo, cover photo, Instagram
//          and Facebook links. Nothing else on the seller row (name,
//          slug, margin, status…) can be changed from here — those stay
//          with staff.

import { NextRequest, NextResponse } from 'next/server'
import { requireSeller } from '@/lib/supabase/seller-auth'
import { isOwnCloudinaryUrl } from '@/lib/cloudinary'

const COLUMNS = 'id, name, platform_slug, description, logo_url, cover_url, tagline, instagram_url, facebook_url'
const MIGRATION_HINT = 'The database needs an update first: run data/wishdrop-social-stores.sql in Supabase.'

function socialLink(value: unknown, hosts: string[], base: string): string | null | 'invalid' {
  const raw = String(value ?? '').trim()
  if (!raw) return null
  // Accept a bare handle ("@myshop" / "myshop") as well as a full link.
  if (/^@?[a-z0-9._-]{1,60}$/i.test(raw)) return `${base}${raw.replace(/^@/, '')}`
  try {
    const u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`)
    const host = u.hostname.replace(/^www\.|^m\./, '').toLowerCase()
    if (!hosts.includes(host)) return 'invalid'
    u.protocol = 'https:'
    return u.toString().slice(0, 300)
  } catch {
    return 'invalid'
  }
}

export async function GET() {
  const auth = await requireSeller()
  if (!auth.ok) return auth.response
  const { data, error } = await auth.admin.from('sellers').select(COLUMNS).eq('id', auth.seller.id).maybeSingle()
  if (error) {
    return NextResponse.json({ error: error.code === '42703' ? MIGRATION_HINT : error.message }, { status: 500 })
  }
  return NextResponse.json({ profile: data }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function PATCH(req: NextRequest) {
  const auth = await requireSeller()
  if (!auth.ok) return auth.response
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const patch: Record<string, string | null> = {}

  if (body.description !== undefined) patch.description = String(body.description ?? '').trim().slice(0, 1000) || null
  if (body.tagline !== undefined) patch.tagline = String(body.tagline ?? '').trim().slice(0, 120) || null

  for (const [key, column] of [['logoUrl', 'logo_url'], ['coverUrl', 'cover_url']] as const) {
    if (body[key] === undefined) continue
    const url = String(body[key] ?? '').trim()
    if (url && !isOwnCloudinaryUrl(url, 'image')) {
      return NextResponse.json({ error: 'Please upload the image with the Upload button.' }, { status: 400 })
    }
    patch[column] = url || null
  }

  if (body.instagram !== undefined) {
    const v = socialLink(body.instagram, ['instagram.com'], 'https://instagram.com/')
    if (v === 'invalid') return NextResponse.json({ error: 'Enter your Instagram name or an instagram.com link.' }, { status: 400 })
    patch.instagram_url = v
  }
  if (body.facebook !== undefined) {
    const v = socialLink(body.facebook, ['facebook.com', 'fb.com'], 'https://facebook.com/')
    if (v === 'invalid') return NextResponse.json({ error: 'Enter your Facebook page name or a facebook.com link.' }, { status: 400 })
    patch.facebook_url = v
  }

  if (Object.keys(patch).length === 0) return NextResponse.json({ error: 'Nothing to update.' }, { status: 400 })

  const { data, error } = await auth.admin
    .from('sellers')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .update(patch as any)
    .eq('id', auth.seller.id)
    .select(COLUMNS)
    .single()
  if (error) {
    return NextResponse.json({ error: error.code === '42703' ? MIGRATION_HINT : error.message }, { status: 500 })
  }
  return NextResponse.json({ profile: data })
}
