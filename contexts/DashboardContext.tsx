'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { initialRequests, productImage } from '@/components/dashboard/data'
import { pathForView } from '@/components/dashboard/routes'
import { REQUEST_STATUS_FLOW } from '@/components/dashboard/types'
import type { Draft, ItemRequest, RequestStatus } from '@/components/dashboard/types'
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

const DRAFT_STORAGE_KEY = 'dashboard:pendingDraft'
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
    // worst case the confirm screen falls back to emptyDraft.
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
  beginRequestForUrl: (url: string) => Promise<void>
  saveItemInfo: (event: React.FormEvent) => void
  confirmRequest: () => void
  selectVariant: (url: string) => Promise<void>
  confirmCartOrder: (lines: CartOrderLine[]) => void

  /** Moves a single request forward one step in REQUEST_STATUS_FLOW.
   * No-ops if the request is already at the last status or isn't found. */
  advanceRequestStatus: (id: string) => void
  /** Jumps a single request directly to `status`, regardless of flow order. */
  setRequestStatus: (id: string, status: RequestStatus) => void
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
      persistDraft(draft)
      setModalOpen(false)
      router.push(pathForView('confirmRequest'))
    },
    [draft, router],
  )

  // Starting status is 'Awaiting payment' — the first stage in
  // REQUEST_STATUS_FLOW. advanceRequestStatus/setRequestStatus are what
  // move a request through 'Requested' -> 'Processing' -> 'Shipped' ->
  // 'Delivered' from there.
  const confirmRequest = useCallback(() => {
    setRequests((current) => [
      {
        id: `P${Math.floor(100000000 + Math.random() * 899999999)}`,
        name: draft.name,
        url: draft.url,
        qty: draft.qty,
        unitPrice: draft.unitPrice,
        image: draft.image,
        status: 'Awaiting payment',
      },
      ...current,
    ])
    clearPersistedDraft()
    setActiveTab('Requested')
    router.push(pathForView('ordersHub'))
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
        status: 'Awaiting payment' as const,
      })),
      ...current,
    ])
    setActiveTab('Requested')
  }, [])

  const advanceRequestStatus = useCallback((id: string) => {
    setRequests((current) =>
      current.map((request) => {
        if (request.id !== id) return request
        const currentIndex = REQUEST_STATUS_FLOW.indexOf(request.status)
        const nextStatus = REQUEST_STATUS_FLOW[currentIndex + 1]
        // Already at the end of the flow, or status isn't in the known
        // sequence (shouldn't happen, but don't throw on stale data) —
        // leave it as-is.
        if (!nextStatus) return request
        return { ...request, status: nextStatus }
      }),
    )
  }, [])

  const setRequestStatus = useCallback((id: string, status: RequestStatus) => {
    setRequests((current) =>
      current.map((request) => (request.id === id ? { ...request, status } : request)),
    )
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
      advanceRequestStatus,
      setRequestStatus,
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
      advanceRequestStatus,
      setRequestStatus,
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