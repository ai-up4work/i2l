'use client'

import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { productImage } from '@/components/dashboard/data'
import { pathForView } from '@/components/dashboard/routes'
import type { Draft } from '@/components/dashboard/types'
import type { ScrapeResult } from '@/lib/scrape/parsers'
import { useProductLookup } from '@/hooks/useProductLookup'
import { rateToLKR } from '@/lib/currency-config'
import { useAuth } from './AuthContext'
import { createClient } from '@/lib/supabase/client'
import { ensureProductSnapshot } from '@/lib/supabase/product-snapshots'
import type { SupabaseClient } from '@supabase/supabase-js'

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

export type CartOrderLine = {
  name: string
  url: string
  qty: number
  unitPriceLKR: number
  image: string
}

export type ConfirmResult = { ok: boolean; error?: string }

type DashboardContextValue = {
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
  /** Writes the current draft to a real order (price already known) or a
   * Channel 3 request (no price yet, needs a Sales & Purchase quote).
   * Navigates to /account/orders on success; returns ok:false and stays
   * put on failure so the customer can retry. */
  confirmRequest: () => Promise<ConfirmResult>
  selectVariant: (url: string) => Promise<void>
  /** Writes cart lines to a single real order. Does NOT navigate or clear
   * the cart itself — the caller (cart page) does that only once this
   * resolves with ok: true, so a failed write never silently loses the
   * cart's contents. */
  confirmCartOrder: (lines: CartOrderLine[]) => Promise<ConfirmResult>
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

/**
 * Creates one `orders` row with a random human-readable display_id,
 * retrying on a (rare) unique-constraint collision. There's no DB
 * sequence/function exposed for this, so a client-generated random id is
 * the pragmatic option — it's purely a display number, never used as a
 * foreign key, so a retry-on-collision loop is safe and simple.
 */
async function createOrderWithRetry(
  supabase: SupabaseClient,
  fields: { user_id: string; channel: 1 | 2 | 3; currency: string; total_value: number },
): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const displayId = `WD-${Math.floor(10000 + Math.random() * 89999)}`
    const { data, error } = await supabase
      .from('orders')
      .insert({ display_id: displayId, ...fields })
      .select('id')
      .single()
    if (!error) return data.id as string
    if (error.code !== '23505') throw error
    // 23505 = unique_violation on display_id — loop and try a new one.
  }
  throw new Error('Could not generate a unique order number. Please try again.')
}

function sourceDomainFor(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return 'unknown'
  }
}

export function DashboardProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const { user } = useAuth()

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

  // Writes the confirmed draft to Supabase. Two paths, split on whether a
  // price is already known:
  //   - Priced (scraped successfully, or hand-entered in ItemInfoModal):
  //     Channel 2 — goes straight to a real order, no admin quote needed,
  //     since there's nothing left to price.
  //   - Unpriced: Channel 3 — the link couldn't be priced automatically,
  //     so this becomes a `requests` row for Sales & Purchase to quote by
  //     hand (plus the chat_thread it's required to reference).
  //
  // KNOWN GAP: a Channel 3 request has nowhere good to land yet — there's
  // no "my pending requests" list page, so this still routes to
  // /account/orders like the priced path, where it simply won't appear
  // (it isn't an order yet). Surfacing pending requests needs either a
  // small new page or extending Order's status union in Ordercontexts.tsx
  // — flagged, not solved here.
  const confirmRequest = useCallback(async (): Promise<ConfirmResult> => {
    if (!user) return { ok: false, error: 'You need to be signed in to confirm a request.' }

    const supabase = createClient()
    try {
      if (draft.unitPrice > 0) {
        const snapshotId = await ensureProductSnapshot(supabase, {
          id: draft.url || draft.name,
          title: draft.name,
          image: draft.image,
          site: null,
          price: null,
        })
        const orderId = await createOrderWithRetry(supabase, {
          user_id: user.id,
          channel: 2,
          currency: 'LKR',
          total_value: draft.unitPrice * draft.qty,
        })
        const { error: itemError } = await supabase.from('order_items').insert({
          order_id: orderId,
          product_snapshot_id: snapshotId,
          title: draft.name,
          quantity: draft.qty,
          unit_price: draft.unitPrice,
        })
        if (itemError) throw itemError
      } else {
        const { data: thread, error: threadError } = await supabase
          .from('chat_threads')
          .insert({ user_id: user.id })
          .select('id')
          .single()
        if (threadError) throw threadError

        const { error: requestError } = await supabase.from('requests').insert({
          user_id: user.id,
          link: draft.url,
          note: draft.name,
          source_domain: sourceDomainFor(draft.url),
          chat_thread_id: thread.id,
        })
        if (requestError) throw requestError
      }

      clearPersistedDraft()
      setActiveTab('Requested')
      router.push(pathForView('ordersHub'))
      return { ok: true }
    } catch (err) {
      console.error('[dashboard] failed to confirm request', err)
      return { ok: false, error: err instanceof Error ? err.message : 'Something went wrong. Please try again.' }
    }
  }, [draft, user, router])

  // See confirmRequest above for the general shape. Cart checkout is
  // always priced (every line came from a real listing already shown at
  // a price), so this is always Channel 2 — no unpriced branch needed.
  const confirmCartOrder = useCallback(
    async (lines: CartOrderLine[]): Promise<ConfirmResult> => {
      if (!lines.length) return { ok: false, error: 'Your cart is empty.' }
      if (!user) return { ok: false, error: 'You need to be signed in to confirm an order.' }

      const supabase = createClient()
      try {
        const total = lines.reduce((sum, line) => sum + line.qty * line.unitPriceLKR, 0)
        const orderId = await createOrderWithRetry(supabase, {
          user_id: user.id,
          channel: 2,
          currency: 'LKR',
          total_value: total,
        })

        const itemRows = await Promise.all(
          lines.map(async (line) => {
            const snapshotId = await ensureProductSnapshot(supabase, {
              id: line.url || line.name,
              title: line.name,
              image: line.image,
              site: null,
              price: null,
            })
            return {
              order_id: orderId,
              product_snapshot_id: snapshotId,
              title: line.name,
              quantity: line.qty,
              unit_price: line.unitPriceLKR,
            }
          }),
        )

        const { error: itemsError } = await supabase.from('order_items').insert(itemRows)
        if (itemsError) throw itemsError

        setActiveTab('Requested')
        return { ok: true }
        } catch (err) {
          const supaErr = err as { message?: string; code?: string; details?: string; hint?: string }
          console.error('[dashboard] failed to confirm cart order', {
            message: supaErr?.message,
            code: supaErr?.code,
            details: supaErr?.details,
            hint: supaErr?.hint,
          })
          return {
            ok: false,
            error: supaErr?.message || 'Something went wrong. Please try again.',
          }
        }
    },
    [user],
  )

  const value = useMemo<DashboardContextValue>(
    () => ({
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
