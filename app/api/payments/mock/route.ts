// app/api/payments/mock/route.ts
//
// RETIRED. This was the test-card payment endpoint. Payment is now manual
// (WhatsApp; staff record it on the admin order page — see
// lib/payments/server.ts), so customers must never be able to mark an
// order paid themselves. Kept as a hard "gone" so an old deploy of the
// file can't linger and accept requests. Safe to delete this folder.

import { NextResponse } from 'next/server'

export async function POST() {
  return NextResponse.json(
    { error: 'Online payment isn’t available. We’ll send you payment details on WhatsApp.' },
    { status: 410 },
  )
}
