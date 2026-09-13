// app/api/admin/sellers/[platform]/create-login/route.ts
//
// Creates a real Supabase auth user for a seller, links it via
// sellers.owner_user_id, and returns a one-time temporary password for the
// admin to hand off. There's no self-registration or invite-email flow
// yet — this is the whole provisioning story for now: admin clicks
// "Create seller login", gets a password to share, done.
//
// Same caveat as the other admin routes: authenticated-only, no staff-role
// check yet.

import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceRoleClient } from '@/lib/supabase/server'

function generateTempPassword(): string {
  // Readable-ish, still high entropy: e.g. "wd-7f3k9d2q"
  return `wd-${Math.random().toString(36).slice(2, 6)}${Math.random().toString(36).slice(2, 6)}`
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ platform: string }> }) {
  const supabase = await createClient()
  const {
    data: { user: requester },
  } = await supabase.auth.getUser()
  if (!requester) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { platform } = await params
  const { email } = await req.json()
  if (!email) return NextResponse.json({ error: 'email is required' }, { status: 400 })

  const admin = createServiceRoleClient()

  const { data: seller, error: sellerError } = await admin
    .from('sellers')
    .select('id, owner_user_id, name')
    .eq('platform_slug', platform)
    .maybeSingle()
  if (sellerError) return NextResponse.json({ error: sellerError.message }, { status: 500 })
  if (!seller) return NextResponse.json({ error: 'Seller not found' }, { status: 404 })
  if (seller.owner_user_id) {
    return NextResponse.json({ error: 'This seller already has a login.' }, { status: 409 })
  }

  const tempPassword = generateTempPassword()
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password: tempPassword,
    email_confirm: true,
    user_metadata: { full_name: seller.name, seller_platform: platform },
  })
  if (createError) return NextResponse.json({ error: createError.message }, { status: 500 })

  const { error: linkError } = await admin
    .from('sellers')
    .update({ owner_user_id: created.user.id })
    .eq('id', seller.id)
  if (linkError) return NextResponse.json({ error: linkError.message }, { status: 500 })

  return NextResponse.json({ email, tempPassword })
}