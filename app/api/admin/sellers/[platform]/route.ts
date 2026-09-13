// app/api/admin/sellers/[platform]/route.ts
//
// GET   -> fetch one seller by platform slug (admin view)
// PATCH -> update profile fields and/or provider_config; also used for
//          deactivate (PATCH { status: 'inactive' })
//
// Same caveat as app/api/admin/sellers/route.ts: authenticated-only, not
// staff-role-gated yet.

import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceRoleClient } from '@/lib/supabase/server'

async function requireAuthedUser() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ platform: string }> }) {
  const user = await requireAuthedUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { platform } = await params
  const admin = createServiceRoleClient()
  const { data, error } = await admin.from('sellers').select('*').eq('platform_slug', platform).maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Seller not found' }, { status: 404 })
  return NextResponse.json({ seller: data })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ platform: string }> }) {
  const user = await requireAuthedUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { platform } = await params
  const body = await req.json()
  const {
    storeName,
    storeUrl,
    contactName,
    contactEmail,
    contactPhone,
    notes,
    status,
    providerConfig,
  } = body

  const patch: Record<string, unknown> = {}
  if (storeName !== undefined) patch.name = storeName
  if (storeUrl !== undefined) patch.outbound_url = storeUrl
  if (contactName !== undefined) patch.contact_name = contactName
  if (contactEmail !== undefined) patch.contact_email = contactEmail
  if (contactPhone !== undefined) patch.contact_phone = contactPhone
  if (notes !== undefined) patch.notes = notes
  if (status !== undefined) patch.status = status
  if (providerConfig !== undefined) {
    patch.provider_type = providerConfig.type
    patch.provider_config = providerConfig
    patch.type = providerConfig.type === 'mock' ? 'manual' : 'feed'
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
  }

  const admin = createServiceRoleClient()
  const { data, error } = await admin
    .from('sellers')
    .update(patch)
    .eq('platform_slug', platform)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ seller: data })
}
