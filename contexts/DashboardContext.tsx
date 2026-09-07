'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
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

// Requests, unlike the draft above, are meant to last well beyond a single
// session — they're the customer's actual order history. Persisted the
// same way CartContext persists its items (localStorage + hydration guard
// + cross-tab 'storage' listener), so a confirmed request survives a
// refresh instead of quietly reverting to the mock seed data. Different
// <DashboardProvider> instances (account layout vs. a standalone PDP) each
// read/write the same key, so a request confirmed from either place shows
// up in both.
const REQUESTS_STORAGE_KEY = 'wishdrop:requests'

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

// Falls back to the demo seed (initialRequests) only when NOTHING has ever
// been persisted (raw == null) — once anything has been saved, including
// an explicitly-cleared empty array, that persisted value wins. Otherwise
// a customer who clears/confirms every request would see the mock entry
// resurrect itself on the next refresh.
function loadInitialRequests(): ItemRequest[] {
  if (typeof window === 'undefined') return initialRequests
  try {
    const raw = window.localStorage.getItem(REQUESTS_STORAGE_KEY)
    if (raw == null) return initialRequests
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : initialRequests
  } catch {
    return initialRequests
  }
}

// A cart line reduced to what a request record needs. unitPriceLKR is
// expected to already be the converted display price (CartPage computes
// this via getDualDeliveryPricing before calling confirmCartOrder) —
// ItemRequest.unitPrice is always LKR, the same convention confirmRequest
// already uses for pasted-link requests, so both paths land in the same
// units without this context needing to know about currencies at all.
export type CartOrderLine = {
  name: string
  url: string
  qty: number
  unitPriceLKR: number
  image: string
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
  // Turns confirmed cart lines into ordinary requests — same status, same
  // list, same tracking page as a pasted-link request. Lets "Add to bag +
  // Checkout" and "Paste a link" converge on one place the customer checks
  // for everything they've asked WishDrop to get for them, instead of
  // cart-confirmed items disappearing into a separate, untracked bucket.
  confirmCartOrder: (lines: CartOrderLine[]) => void
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

  const [requests, setRequests] = useState<ItemRequest[]>(loadInitialRequests)
  const [requestsHydrated, setRequestsHydrated] = useState(false)
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

  // Mark hydrated after first render so we don't stomp localStorage with
  // whatever loadInitialRequests() fell back to during SSR, before the
  // real persisted value has loaded client-side. Same pattern as
  // CartContext/WishlistContext.
  useEffect(() => {
    setRequestsHydrated(true)
  }, [])

  useEffect(() => {
    if (!requestsHydrated) return
    try {
      window.localStorage.setItem(REQUESTS_STORAGE_KEY, JSON.stringify(requests))
    } catch {
      // Storage can fail (quota, private mode) — losing persistence isn't
      // worth crashing the requests list over.
    }
  }, [requests, requestsHydrated])

  // Keep multiple tabs/DashboardProvider instances in sync: if requests
  // change in another tab (or another provider instance elsewhere in this
  // tab writes to the same key), pick it up here.
  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key !== REQUESTS_STORAGE_KEY) return
      try {
        const parsed = e.newValue ? JSON.parse(e.newValue) : initialRequests
        setRequests(Array.isArray(parsed) ? parsed : initialRequests)
      } catch {
        // ignore malformed cross-tab payloads
      }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

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

  const confirmCartOrder = useCallback((lines: CartOrderLine[]) => {
    if (!lines.length) return
    setRequests((current) => [
      ...lines.map((line) => ({
        id: `P${Math.floor(100000000 + Math.random() * 899999999)}`,
        name: line.name,
        url: line.url,
        qty: line.qty,
        unitPrice: line.unitPriceLKR,
        image: line.image,
        status: 'Requested' as const,
      })),
      ...current,
    ])
    setActiveTab('Requested')
  }, [])

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
      confirmCartOrder,
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
      confirmCartOrder,
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