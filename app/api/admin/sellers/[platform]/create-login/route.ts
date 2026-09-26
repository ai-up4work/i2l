// app/api/admin/sellers/[platform]/create-login/route.ts
//
// Creates a real Supabase auth user for a seller, links it via
// sellers.owner_user_id, and returns a one-time temporary password for the
// admin to hand off. There's no self-registration or invite-email flow
// yet — this is the whole provisioning story for now: admin clicks
// "Create seller login", gets a password to share, done.
//
// { reset: true } on a seller that already has a login issues a NEW
// temporary password for that same account (seller forgot theirs). The
// seller can then change it themselves at /seller/account.
//
// Gated via requireStaffRole(SOURCING_ROLES) — see lib/supabase/admin-auth.ts.

import { randomInt } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { requireStaffRole, SOURCING_ROLES } from '@/lib/supabase/admin-auth'

// No look-alike characters (0/O, 1/l/I), so it can be read out or typed
// from a WhatsApp message without mistakes.
const PASSWORD_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'

function generateTempPassword(): string {
  // Cryptographically random (was Math.random, which isn't meant for
  // secrets). 12 chars from 31 symbols ≈ 59 bits, e.g. "wd-k7m2x9qp4tra".
  let out = ''
  for (let i = 0; i < 12; i++) out += PASSWORD_ALPHABET[randomInt(PASSWORD_ALPHABET.length)]
  return `wd-${out}`
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ platform: string }> }) {
  const authCheck = await requireStaffRole(SOURCING_ROLES)
  if (!authCheck.ok) return authCheck.response
  const { admin } = authCheck

  const { platform } = await params
  const { email, reset } = (await req.json().catch(() => ({}))) as { email?: string; reset?: boolean }

  const { data: seller, error: sellerError } = await admin
    .from('sellers')
    .select('id, owner_user_id, name')
    .eq('platform_slug', platform)
    .maybeSingle()
  if (sellerError) return NextResponse.json({ error: sellerError.message }, { status: 500 })
  if (!seller) return NextResponse.json({ error: 'Seller not found' }, { status: 404 })
  if (seller.owner_user_id) {
    if (!reset) return NextResponse.json({ error: 'This seller already has a login.' }, { status: 409 })

    const newPassword = generateTempPassword()
    const { data: updated, error: resetError } = await admin.auth.admin.updateUserById(seller.owner_user_id, {
      password: newPassword,
    })
    if (resetError) return NextResponse.json({ error: resetError.message }, { status: 500 })
    return NextResponse.json({ email: updated.user.email ?? '', tempPassword: newPassword, reset: true })
  }

  if (!email) return NextResponse.json({ error: 'email is required' }, { status: 400 })

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