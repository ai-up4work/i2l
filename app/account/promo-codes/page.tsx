// app/account/promo-codes/page.tsx
//
// Promo codes and coupons are one thing now (signed coupons,
// lib/coupons/server.ts). This page used to show four hardcoded sample
// codes to every customer; it now just forwards to My coupons.
import { redirect } from 'next/navigation'

export default function PromoCodesRoute() {
  redirect('/account/coupons')
}
