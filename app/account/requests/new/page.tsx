'use client'

import AddRequestPage from '@/components/dashboard/AddRequestPage'
import { useDashboard } from '@/contexts/DashboardContext'

export default function NewRequestPage() {
  const { pastedLink, setPastedLink, startItemInfo } = useDashboard()

  return <AddRequestPage link={pastedLink} setLink={setPastedLink} onSubmit={startItemInfo} />
}
