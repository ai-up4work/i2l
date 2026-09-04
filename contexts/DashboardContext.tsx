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
  // Full raw /api/product-lookup payload for the current draft.url — this
  // is what ItemInfoModal needs (as `scrapeResult`) to decide whether to
  // render the Amazon/Flipkart/etc. look-alike card instead of the plain
  // URL box, exactly like ScraperQaClient's own `result` state does.
  scrapeResult: ScrapeResult | null

  resetDraft: () => void
  startItemInfo: (event: React.FormEvent) => Promise<void>
  saveItemInfo: (event: React.FormEvent) => void
  confirmRequest: () => void
  // Re-scrapes a variant/size/color tile's own URL (clicked inside the
  // platform view) and re-fills the draft from that fresh result — the
  // same flow as ScraperQaClient's runLookup, just also updating `draft`.
  selectVariant: (url: string) => Promise<void>
}

const DashboardContext = createContext<DashboardContextValue | null>(null)

// Applies a fresh ScrapeResult onto the draft — shared by the initial
// paste (startItemInfo) and variant re-scrapes (selectVariant) so the
// two flows can't drift apart on field mapping.
//
// product.price is in the SOURCE currency (product.currencyCode, e.g.
// "INR" for Flipkart) — it must be converted to LKR here before landing
// in draft.unitPrice, since draft.currency is permanently fixed at 'Rs.'
// (the site only ever displays/quotes in LKR; see lib/currency.ts).
// Without this conversion, a ₹270 Flipkart item would show as if it were
// Rs. 270 LKR instead of the correct ~Rs. 972.
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
  const [draft, setDraft] = useState<Draft>(emptyDraft)
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
  }, [resetLookup])

  // Paste a link -> open the modal immediately -> scrape in the background
  // -> fill in whatever the store exposes (name/image/price), and expose
  // the full result so the modal can render the rich platform view.
  const startItemInfo = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault()
      const url = pastedLink.trim()
      if (!url) return

      setAutoFilled(false)
      setDraft({ ...emptyDraft, url })
      setModalOpen(true)

      const product = await lookup(url)
      if (!product || product.error) return

      setDraft((current) => applyScrapeResultToDraft(current, product))
      setAutoFilled(true)
    },
    [pastedLink, lookup],
  )

  // Clicking a variant/size/color tile inside the platform view re-runs
  // the scrape against that tile's own URL and re-fills the draft from
  // the fresh result, same as startItemInfo above.
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
      setModalOpen(false)
      router.push(pathForView('confirmRequest'))
    },
    [draft.name, router],
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