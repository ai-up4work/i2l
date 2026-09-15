// components/stores/ProductRequestOverlay.tsx
'use client'

import ItemInfoModal from '@/components/dashboard/ItemInfoModal'
import { useDashboard } from '@/contexts/DashboardContext'

export default function ProductRequestOverlay() {
  const {
    draft,
    setDraft,
    modalOpen,
    closeModal,
    confirmRequest,
    lookupLoading,
    scrapeResult,
    selectVariant,
  } = useDashboard()

  if (!modalOpen) return null

  return (
    <ItemInfoModal
      open={modalOpen}
      result={scrapeResult}
      qty={draft.qty}
      onQtyChange={(qty) => setDraft({ ...draft, qty })}
      onClose={closeModal}
      onSubmitRequest={confirmRequest}
      estimatedPriceLKR={draft.estimatedPriceLKR ?? null}
      loading={lookupLoading}
      onSelectVariant={(url) => {
        if (url) selectVariant(url)
      }}
    />
  )
}