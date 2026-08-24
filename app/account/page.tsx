'use client'

import { useRouter } from 'next/navigation'
import HomePage from '@/components/dashboard/HomePage'
import { pathForView } from '@/components/dashboard/routes'
import { useDashboard } from '@/contexts/DashboardContext'

export default function AccountHomePage() {
  const router = useRouter()
  const { resetDraft } = useDashboard()

  return (
    <HomePage
      onAddRequest={() => {
        resetDraft()
        router.push(pathForView('addRequest'))
      }}
      onAddShipment={() => router.push(pathForView('addShipment'))}
      onViewPromoCodes={() => router.push(pathForView('promoCodes'))}
      onViewCredits={() => router.push(pathForView('credits'))}
      onViewReferrals={() => router.push(pathForView('referrals'))}
    />
  )
}
