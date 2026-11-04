// components/stores/ProductRequestOverlay.tsx
'use client'

import ItemInfoModal, { type ItemSandboxAction } from '@/components/dashboard/ItemInfoModal'
import { useDashboard } from '@/contexts/DashboardContext'

/**
 * The item screen for a pasted link. The scraper QA page (/demo/scraper-qa)
 * mounts this same component so what it tests is what customers get; it
 * only passes `sandbox` / `onSubmitRequestOverride` so a test run doesn't
 * fill the tester's real cart or create real requests.
 */
export default function ProductRequestOverlay({
  sandbox,
  onSubmitRequestOverride,
}: {
  sandbox?: (action: ItemSandboxAction, detail?: unknown) => void
  onSubmitRequestOverride?: (opts?: { itemName?: string; photoUrl?: string; chat?: boolean }) => Promise<{ ok: boolean; error?: string }>
} = {}) {
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
      onSubmitRequest={onSubmitRequestOverride ?? confirmRequest}
      sandbox={sandbox}
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