'use client'

import VipPage from './VipPage'
import { useLoyalty } from '@/contexts/Loyaltycontext'
import { useAuth } from '@/contexts/AuthContext'

function VipPageSkeleton() {
  return (
    <div className="mx-auto max-w-5xl px-6 pb-8 lg:px-10">
      <div className="mt-6 h-56 animate-pulse rounded-2xl bg-ink/10" />
      <div className="mt-4 h-20 animate-pulse rounded-2xl bg-ink/5" />
      <div className="mt-4 h-64 animate-pulse rounded-2xl bg-ink/5" />
      <div className="mt-4 h-28 animate-pulse rounded-2xl bg-ink/5" />
      <div className="mt-4 h-40 animate-pulse rounded-2xl bg-ink/5" />
    </div>
  )
}

export default function WishdropVipPage() {
  const loyalty = useLoyalty()
  const { user } = useAuth()

  if (!loyalty.hydrated) {
    return <VipPageSkeleton />
  }

  return (
    <VipPage
      username={user?.name}
      currentTier={loyalty.tier}
      points={loyalty.points}
      progressToNext={loyalty.progressToNext}
      nextTierRequirements={loyalty.nextTierRequirements}
    />
  )
}