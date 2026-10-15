// components/admin/coupon-state.ts — the status pill shown for a coupon in
// Admin → Coupons (list and detail).

export function couponState(c: { status: 'active' | 'paused' | 'archived'; starts_at: string; ends_at: string | null }): {
  label: string
  className: string
} {
  const now = Date.now()
  if (c.status === 'archived') return { label: 'Archived', className: 'bg-ink/8 text-ink/50' }
  if (c.status === 'paused') return { label: 'Paused', className: 'bg-gold/20 text-gold-deep' }
  if (c.ends_at && new Date(c.ends_at).getTime() < now) return { label: 'Ended', className: 'bg-ink/8 text-ink/50' }
  if (new Date(c.starts_at).getTime() > now) return { label: 'Scheduled', className: 'bg-indigo/10 text-indigo' }
  return { label: 'Live', className: 'bg-teal/12 text-teal-deep' }
}
