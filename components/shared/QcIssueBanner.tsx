'use client'

import { AlertTriangle, CheckCircle2, RotateCcw, Ticket, Truck } from 'lucide-react'
import type { CustomerVisibleQcIssue } from '@/lib/supabase/qc-issues'

const RESOLUTION_COPY: Record<string, { icon: typeof AlertTriangle; label: string; tone: string }> = {
  pending: { icon: AlertTriangle, label: "We're reviewing this — you'll hear from us on WhatsApp shortly.", tone: 'border-amber-200 bg-amber-50 text-amber-800' },
  retry_same: { icon: RotateCcw, label: "We're sourcing a fresh unit from the same seller. This may add a short delay.", tone: 'border-teal/25 bg-teal/[0.06] text-teal-deep' },
  coupon_issued: { icon: Ticket, label: 'A compensation coupon has been added to your account — check My Coupons.', tone: 'border-teal/25 bg-teal/[0.06] text-teal-deep' },
  shipped_as_is: { icon: Truck, label: "We couldn't get a refund or replacement from the seller, so this item is shipping as originally sourced.", tone: 'border-ink/15 bg-ink/[0.03] text-ink/70' },
}

/** Shown next to an order item that has a QC issue on file — customer-safe fields only (never the internal staff note). */
export default function QcIssueBanner({ issue }: { issue: CustomerVisibleQcIssue }) {
  const resolution = RESOLUTION_COPY[issue.resolution] ?? RESOLUTION_COPY.pending
  const Icon = resolution.icon

  return (
    <div className={`mt-2 flex items-start gap-2.5 rounded-xl border px-3.5 py-3 text-sm ${resolution.tone}`}>
      <Icon size={16} className="mt-0.5 flex-none" />
      <div>
        <p className="font-semibold">Quality check flagged this item</p>
        {issue.customerNote && <p className="mt-0.5 opacity-90">{issue.customerNote}</p>}
        <p className="mt-1 text-xs opacity-80">{resolution.label}</p>
        {issue.photoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={issue.photoUrl} alt="Quality check photo" className="mt-2 h-20 w-20 rounded-lg object-cover" />
        )}
      </div>
    </div>
  )
}
