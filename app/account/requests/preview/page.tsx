'use client'

import { useRouter } from 'next/navigation'
import RequestPreviewPage from '@/components/dashboard/RequestPreviewPage'
import { pathForView } from '@/components/dashboard/routes'
import { useDashboard } from '@/contexts/DashboardContext'

export default function PreviewPage() {
  const router = useRouter()
  const { draft, promoCode, setPromoCode, confirmRequest } = useDashboard()

  return (
    <RequestPreviewPage
      draft={draft}
      promoCode={promoCode}
      setPromoCode={setPromoCode}
      onCancel={() => router.push(pathForView('addRequest'))}
      onNext={confirmRequest}
    />
  )
}
