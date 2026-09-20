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

  // FIX: this used to be `if (!modalOpen) return null`, unmounting
  // ItemInfoModal the instant modalOpen went false — before its own
  // internal close transition (mounted/entered state, see that file)
  // ever got a chance to play. Same bug independently found and fixed
  // in app/account/layout.tsx's AccountShell and app/page.tsx's
  // HomeItemModal (see either's identical comment) — this is the third
  // of three separate copies of the same modal-mounting logic across
  // the app, so the fix had to be applied a third time here too. Stays
  // mounted at all times now, managing its own presence via the `open`
  // prop internally.
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