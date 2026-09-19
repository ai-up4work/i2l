// app/api/admin/sellers/[platform]/route.ts
//
// GET    -> fetch one seller by platform slug (admin view)
// PATCH  -> update profile fields and/or provider_config; also used for
//           deactivate (PATCH { status: 'inactive' })
// DELETE -> hard-delete the seller outright — Manager (and Super Admin)
//           only, per the platform's delete policy. Sales & Purchase
//           gets deactivate (the PATCH above) but never this.
//
// Gated via requireStaffRole — GET/PATCH allow SOURCING_ROLES (Super
// Admin/Manager/Sales & Purchase), DELETE is further restricted to
// DELETE_ROLES (Manager/Super Admin only), matching the client-side
// permissions.canDelete check in SellerFormClient. See
// lib/supabase/admin-auth.ts.

import { NextRequest, NextResponse } from 'next/server'
import { requireStaffRole, SOURCING_ROLES, DELETE_ROLES } from '@/lib/supabase/admin-auth'
import type { Database } from '@/lib/supabase/types'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ platform: string }> }) {
  const authCheck = await requireStaffRole(SOURCING_ROLES)
  if (!authCheck.ok) return authCheck.response
  const { admin } = authCheck

  const { platform } = await params
  const { data, error } = await admin.from('sellers').select('*').eq('platform_slug', platform).maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Seller not found' }, { status: 404 })
  return NextResponse.json({ seller: data })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ platform: string }> }) {
  const authCheck = await requireStaffRole(SOURCING_ROLES)
  if (!authCheck.ok) return authCheck.response
  const { admin } = authCheck

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

  const patch: Database['public']['Tables']['sellers']['Update'] = {}
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

  const { data, error } = await admin
    .from('sellers')
    .update(patch)
    .eq('platform_slug', platform)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ seller: data })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ platform: string }> }) {
  const authCheck = await requireStaffRole(DELETE_ROLES)
  if (!authCheck.ok) return authCheck.response
  const { admin } = authCheck

  const { platform } = await params
  const { data: seller, error: findError } = await admin
    .from('sellers')
    .select('id')
    .eq('platform_slug', platform)
    .maybeSingle()
  if (findError) return NextResponse.json({ error: findError.message }, { status: 500 })
  if (!seller) return NextResponse.json({ error: 'Seller not found' }, { status: 404 })

  // Refuse to delete a seller that still has product listings — `products`
  // cascade-deletes on seller_id (see wishdrop-supabase-schema.sql), so an
  // unguarded delete would silently wipe out every one of this seller's
  // listings along with it. Deactivate the seller (or move/delete its
  // products first) if that's genuinely intended — this mirrors the same
  // "don't orphan/silently destroy in-flight work" rule already applied to
  // staff and warehouse-site deactivation elsewhere in this codebase.
  const { count: productCount, error: countError } = await admin
    .from('products')
    .select('id', { count: 'exact', head: true })
    .eq('seller_id', seller.id)
  if (countError) return NextResponse.json({ error: countError.message }, { status: 500 })
  if (productCount && productCount > 0) {
    return NextResponse.json(
      {
        error: `This seller still has ${productCount} product${productCount === 1 ? '' : 's'} listed. Deactivate the seller, or remove its products first, before deleting.`,
      },
      { status: 409 },
    )
  }

  const { error: deleteError } = await admin.from('sellers').delete().eq('id', seller.id)
  if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}