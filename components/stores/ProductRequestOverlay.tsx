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
    beginRequestForUrl,
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
      // Re-runs the whole lookup (retry-after-5s + OG fallback) for the
      // same URL — only shown once that chain already ran once and came
      // up completely empty (see UnreadableListingFallback).
      onRetry={() => {
        if (draft.url) beginRequestForUrl(draft.url)
      }}
    />
  )
}