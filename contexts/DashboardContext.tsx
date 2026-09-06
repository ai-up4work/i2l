'use client'

import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { initialRequests, productImage } from '@/components/dashboard/data'
import { pathForView } from '@/components/dashboard/routes'
import type { Draft, ItemRequest } from '@/components/dashboard/types'
import type { ScrapeResult } from '@/lib/scrape/parsers'
import { useProductLookup } from '@/hooks/useProductLookup'
import { rateToLKR } from '@/lib/currency-config'

const emptyDraft: Draft = {
  url: '',
  name: '',
  qty: 1,
  unitPrice: 0,
  currency: 'Rs.',
  image: productImage[0],
  isLiquid: null,
  hasBatteries: null,
}

// Any page can mount its own <DashboardProvider> — the account layout has
// one, and standalone flows (e.g. the marketplace product detail page)
// mount a separate instance so "Get Quote" can open the modal in place
// without needing to be inside /account. That means a plain client-state
// `draft` doesn't survive router.push() from one provider instance into a
// route tree backed by a DIFFERENT provider instance — the new instance
// mounts with emptyDraft and whatever was collected is lost.
//
// sessionStorage does survive that navigation (same tab, same session), so
// saveItemInfo below persists the draft just before navigating to the
// confirm screen, and any DashboardProvider that mounts afterwards
// rehydrates from it lazily. Cleared once consumed (resetDraft /
// confirmRequest) so a stale draft doesn't leak into an unrelated later
// request.
const DRAFT_STORAGE_KEY = 'dashboard:pendingDraft'

function loadPersistedDraft(): Draft {
  if (typeof window === 'undefined') return emptyDraft
  try {
    const raw = sessionStorage.getItem(DRAFT_STORAGE_KEY)
    if (!raw) return emptyDraft
    const parsed = JSON.parse(raw) as Partial<Draft>
    return { ...emptyDraft, ...parsed }
  } catch {
    return emptyDraft
  }
}

function persistDraft(draft: Draft) {
  if (typeof window === 'undefined') return
  try {
    sessionStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft))
  } catch {
    // sessionStorage can throw in private-browsing/quota-exceeded cases —
    // worst case the confirm screen falls back to emptyDraft, same as
    // before this persistence existed.
  }
}

function clearPersistedDraft() {
  if (typeof window === 'undefined') return
  try {
    sessionStorage.removeItem(DRAFT_STORAGE_KEY)
  } catch {
    // ignore
  }
}

type DashboardContextValue = {
  requests: ItemRequest[]
  draft: Draft
  setDraft: (draft: Draft) => void
  pastedLink: string
  setPastedLink: (value: string) => void
  promoCode: string
  setPromoCode: (value: string) => void
  activeTab: string
  setActiveTab: (tab: string) => void

  modalOpen: boolean
  closeModal: () => void
  lookupLoading: boolean
  lookupError: string | null
  autoFilled: boolean
  scrapeResult: ScrapeResult | null

  resetDraft: () => void
  startItemInfo: (event: React.FormEvent) => Promise<void>
  // Same as startItemInfo, but takes a raw URL directly instead of reading
  // it off a form-submit event. Used by startItemInfo itself, by the
  // landing-page redirect handoff (see app/account/page.tsx), and by the
  // marketplace product detail page's "Get Quote" button, none of which
  // have a form event to prevent-default — they just have a URL.
  beginRequestForUrl: (url: string) => Promise<void>
  saveItemInfo: (event: React.FormEvent) => void
  confirmRequest: () => void
  selectVariant: (url: string) => Promise<void>
}

const DashboardContext = createContext<DashboardContextValue | null>(null)

function applyScrapeResultToDraft(current: Draft, result: ScrapeResult): Draft {
  const price = result.price != null ? Number(result.price) : null
  return {
    ...current,
    url: result.url ?? current.url,
    name: result.title || current.name,
    image: result.images?.[0] || current.image,
    unitPrice:
      price != null && Number.isFinite(price)
        ? Math.round(price * rateToLKR(result.currencyCode ?? null))
        : current.unitPrice,
  }
}

export function DashboardProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter()

  const [requests, setRequests] = useState<ItemRequest[]>(initialRequests)
  const [draft, setDraft] = useState<Draft>(loadPersistedDraft)
  const [pastedLink, setPastedLink] = useState('')
  const [promoCode, setPromoCode] = useState('')
  const [activeTab, setActiveTab] = useState('Ready to Pay (1)')
  const [modalOpen, setModalOpen] = useState(false)
  const [autoFilled, setAutoFilled] = useState(false)

  const {
    loading: lookupLoading,
    error: lookupError,
    result: scrapeResult,
    lookup,
    reset: resetLookup,
  } = useProductLookup()

  const resetDraft = useCallback(() => {
    setDraft(emptyDraft)
    setPastedLink('')
    setAutoFilled(false)
    resetLookup()
    clearPersistedDraft()
  }, [resetLookup])

  // Core flow, independent of *how* the URL arrived (typed + submitted,
  // handed off via a query param from the landing page, or passed
  // directly from a product page's "Get Quote" button). Opens the modal
  // immediately, scrapes in the background, fills the draft when the
  // scrape resolves.
  const beginRequestForUrl = useCallback(
    async (rawUrl: string) => {
      const url = rawUrl.trim()
      if (!url) return

      setAutoFilled(false)
      setDraft({ ...emptyDraft, url })
      setModalOpen(true)

      const product = await lookup(url)
      if (!product || product.error) return

      setDraft((current) => applyScrapeResultToDraft(current, product))
      setAutoFilled(true)
    },
    [lookup],
  )

  // Form-submit wrapper around beginRequestForUrl — this is what the
  // "Buy for me" form on the account HomePage calls directly.
  const startItemInfo = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault()
      await beginRequestForUrl(pastedLink)
    },
    [pastedLink, beginRequestForUrl],
  )

  const selectVariant = useCallback(
    async (url: string) => {
      const product = await lookup(url)
      if (!product || product.error) return

      setDraft((current) => applyScrapeResultToDraft(current, product))
      setAutoFilled(true)
    },
    [lookup],
  )

  const saveItemInfo = useCallback(
    (event: React.FormEvent) => {
      event.preventDefault()
      if (!draft.name.trim()) return
      // Persist before navigating: pathForView('confirmRequest') may land
      // in a route tree backed by a different <DashboardProvider> instance
      // (see doc comment above DRAFT_STORAGE_KEY), so this is what lets
      // that instance pick the draft back up.
      persistDraft(draft)
      setModalOpen(false)
      router.push(pathForView('confirmRequest'))
    },
    [draft, router],
  )

  const confirmRequest = useCallback(() => {
    setRequests((current) => [
      {
        id: `P${Math.floor(100000000 + Math.random() * 899999999)}`,
        name: draft.name,
        url: draft.url,
        qty: draft.qty,
        unitPrice: draft.unitPrice,
        image: draft.image,
        status: 'Requested',
      },
      ...current,
    ])
    clearPersistedDraft()
    setActiveTab('Requested')
    router.push(pathForView('requests'))
  }, [draft, router])

  const value = useMemo<DashboardContextValue>(
    () => ({
      requests,
      draft,
      setDraft,
      pastedLink,
      setPastedLink,
      promoCode,
      setPromoCode,
      activeTab,
      setActiveTab,
      modalOpen,
      closeModal: () => setModalOpen(false),
      lookupLoading,
      lookupError,
      autoFilled,
      scrapeResult,
      resetDraft,
      startItemInfo,
      beginRequestForUrl,
      saveItemInfo,
      confirmRequest,
      selectVariant,
    }),
    [
      requests,
      draft,
      pastedLink,
      promoCode,
      activeTab,
      modalOpen,
      lookupLoading,
      lookupError,
      autoFilled,
      scrapeResult,
      resetDraft,
      startItemInfo,
      beginRequestForUrl,
      saveItemInfo,
      confirmRequest,
      selectVariant,
    ],
  )

  return <DashboardContext.Provider value={value}>{children}</DashboardContext.Provider>
}

export function useDashboard() {
  const context = useContext(DashboardContext)
  if (!context) {
    throw new Error('useDashboard must be called within <DashboardProvider> (see app/account/layout.tsx)')
  }
  return context
}