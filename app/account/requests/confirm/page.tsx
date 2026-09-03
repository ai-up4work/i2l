// app/account/requests/confirm/page.tsx
'use client'

import { useRouter } from 'next/navigation'
import RequestConfirmPage from '@/components/dashboard/RequestConfirmPage'
import { pathForView } from '@/components/dashboard/routes'
import { useDashboard } from '@/contexts/DashboardContext'

export default function ConfirmPage() {
  const router = useRouter()
  const { draft } = useDashboard()

  return (
    <RequestConfirmPage
      draft={draft}
      onCancel={() => router.push(pathForView('addRequest'))}
      onNext={() => router.push(pathForView('preview'))}
    />
  )
}