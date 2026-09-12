// components/admin/badges.tsx
//
// Shared badge vocabulary for the orders section. Keeping these in one
// place is what makes the color system mean something instead of being
// decoration: teal marks the customer-facing / primary-action thread,
// gold marks anything a human priced or wrote by hand (channel 3,
// internal notes), red is reserved for SLA risk, indigo is neutral
// structure. Reusing one component per meaning keeps that consistent
// as the admin app grows past just Orders.

import type { Channel, OrderStage } from "@/types/admin"

const CHANNEL_LABEL: Record<Channel, string> = {
  1: "Affiliated store",
  2: "Scraped link",
  3: "Manual request",
}

export function ChannelBadge({ channel }: { channel: Channel }) {
  if (channel === 3) {
    return (
      <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-gold bg-gold/15 px-2.5 py-1 text-xs font-medium text-amber-800">
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-600" />
        Ch. 3 · Manual quote
      </span>
    )
  }
  return (
    <span className="inline-flex items-center whitespace-nowrap rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-700">
      Ch. {channel} · {CHANNEL_LABEL[channel]}
    </span>
  )
}

export function StageBadge({ stage }: { stage: OrderStage }) {
  return (
    <span className="inline-flex items-center whitespace-nowrap rounded-full bg-teal/10 px-3 py-1 text-sm font-medium text-teal-700">
      {stage}
    </span>
  )
}

export function DelayedBadge({ compact = false }: { compact?: boolean }) {
  if (compact) {
    return (
      <span className="inline-flex items-center" title="Delayed">
        <span className="h-2.5 w-2.5 rounded-full bg-red-500" />
        <span className="sr-only">Delayed</span>
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700">
      <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
      Delayed
    </span>
  )
}