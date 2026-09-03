'use client'

import { useRouter } from 'next/navigation'
import RequestsPage from '@/components/dashboard/RequestsPage'
import { pathForView } from '@/components/dashboard/routes'
import { useDashboard } from '@/contexts/DashboardContext'

export default function BuyingRequestsPage() {
  const router = useRouter()
  const { requests, activeTab, setActiveTab, resetDraft } = useDashboard()

  return (
    <RequestsPage
      requests={requests}
      activeTab={activeTab}
      setActiveTab={setActiveTab}
      onRequest={() => {
        resetDraft()
        router.push(pathForView('addRequest'))
      }}
    />
  )
}
