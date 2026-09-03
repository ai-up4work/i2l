'use client'

import { Suspense, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import AddRequestPage from '@/components/dashboard/AddRequestPage'
import { useDashboard } from '@/contexts/DashboardContext'

// Split out because useSearchParams() requires a Suspense boundary above it
// during static prerendering — without one, `next build` fails with:
// "useSearchParams() should be wrapped in a suspense boundary".
function NewRequestPageInner() {
  const { pastedLink, setPastedLink, startItemInfo } = useDashboard()
  const searchParams = useSearchParams()

  const appliedQueryLink = useRef(false)
  const [autoSubmit, setAutoSubmit] = useState(false)

  // Pick up a link passed in via ?link=... (e.g. from the landing page's
  // LinkCTA, which can't reach DashboardContext directly since it renders
  // outside app/account/layout.tsx). Only apply it once so it doesn't
  // clobber edits the user makes afterward.
  useEffect(() => {
    if (appliedQueryLink.current) return
    const queryLink = searchParams.get('link')
    if (queryLink) {
      setPastedLink(queryLink)
      setAutoSubmit(true)
    }
    appliedQueryLink.current = true
  }, [searchParams, setPastedLink])

  return (
    <AddRequestPage
      link={pastedLink}
      setLink={setPastedLink}
      onSubmit={startItemInfo}
      autoSubmit={autoSubmit}
    />
  )
}

export default function NewRequestPage() {
  return (
    <Suspense fallback={null}>
      <NewRequestPageInner />
    </Suspense>
  )
}