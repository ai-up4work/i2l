// app/api/seller-applications/route.ts
//
// POST -> a "Sell on Wishdrop" application from /stores/apply. Public (no
// login), so it validates everything, ignores bots that fill the hidden
// "company" field, and limits each address to a few applications an hour.
// Saved with the service role into seller_applications
// (data/wishdrop-seller-applications.sql); staff see them in
// Admin → Social Stores.

import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'

const recent = new Map<string, number[]>()
const WINDOW_MS = 60 * 60 * 1000
const MAX_PER_WINDOW = 5

function tooMany(ip: string): boolean {
  const now = Date.now()
  const times = (recent.get(ip) ?? []).filter((t) => now - t < WINDOW_MS)
  times.push(now)
  recent.set(ip, times)
  return times.length > MAX_PER_WINDOW
}

const text = (v: unknown, max: number) => String(v ?? '').trim().slice(0, max)

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>

  // Honeypot: real people never see or fill this field.
  if (text(body.company, 200)) return NextResponse.json({ ok: true })

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  if (tooMany(ip)) {
    return NextResponse.json({ error: 'Too many applications from this connection. Please try again in an hour.' }, { status: 429 })
  }

  const application = {
    store_name: text(body.storeName, 100),
    contact_name: text(body.contactName, 100),
    email: text(body.email, 200).toLowerCase(),
    whatsapp: text(body.whatsapp, 30),
    instagram: text(body.instagram, 200) || null,
    facebook: text(body.facebook, 200) || null,
    website: text(body.website, 300) || null,
    category: text(body.category, 100) || null,
    location: text(body.location, 100) || null,
    product_count: text(body.productCount, 40) || null,
    message: text(body.message, 2000) || null,
  }

  if (!application.store_name) return NextResponse.json({ error: 'Add your shop’s name.' }, { status: 400 })
  if (!application.contact_name) return NextResponse.json({ error: 'Add your name.' }, { status: 400 })
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(application.email)) return NextResponse.json({ error: 'Check your email address.' }, { status: 400 })
  if (application.whatsapp.replace(/\D/g, '').length < 7) return NextResponse.json({ error: 'Check your WhatsApp number, including the country code.' }, { status: 400 })
  if (!application.instagram && !application.facebook && !application.website) {
    return NextResponse.json({ error: 'Add your Instagram, Facebook page or website so we can see what you sell.' }, { status: 400 })
  }
  if (body.agree !== true) return NextResponse.json({ error: 'Please agree to the terms to apply.' }, { status: 400 })

  const { error } = await createServiceRoleClient().from('seller_applications' as never).insert(application as never)
  if (error) {
    console.error('[seller-applications]', error)
    return NextResponse.json({ error: 'We couldn’t send your application just now. Please try again, or message us on WhatsApp.' }, { status: 500 })
  }
  return NextResponse.json({ ok: true }, { status: 201 })
}
