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
    saveItemInfo,
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
      onRequestItem={() => saveItemInfo({ preventDefault: () => {} } as React.FormEvent)}
      loading={lookupLoading}
      onSelectVariant={(url) => {
        if (url) selectVariant(url)
      }}
    />
  )
}