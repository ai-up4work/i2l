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
import { sendChatMessage } from '@/lib/supabase/chat'
import type { OgMetadata } from '@/lib/og-lookup'
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
  /** 'catalogue' = added from an affiliated store listing (Channel 1); 'link' = added via a pasted product link that scraped successfully (Channel 2). Determines the resulting order's channel — see confirmCartOrder below. */
  source?: 'catalogue' | 'link'
  /** CartProduct.site — the affiliated store's slug for a catalogue item, or the scraper's SiteId (e.g. 'amazon', 'flipkart') for a link item. Written to order_items.seller_name so Purchases/QC/etc. show a real seller instead of "Unassigned seller". */
  site?: string | null
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

/**
 * CartProduct.site -> a real seller name for order_items.seller_name:
 * a domain ("flipkart.com") is shown as-is, a bare slug/platform id
 * ("flipkart", "fabindia-store") is title-cased. Same logic as the cart
 * page's own cleanSiteLabel (app/account/cart/page.tsx) — duplicated
 * rather than imported since that file also has page-specific JSX this
 * context shouldn't depend on; keep the two in sync if the format ever
 * changes.
 */
function cleanSiteLabel(site: string): string {
  const trimmed = site.trim().replace(/^www\./i, '')
  if (trimmed.includes('.')) return trimmed
  return trimmed
    .replace(/[-_]+/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((word) => word[0]?.toUpperCase() + word.slice(1))
    .join(' ')
}

/**
 * Client-side call to /api/og-lookup — the fallback used when a link
 * can't be priced (see confirmRequest's unpriced branch below), so a
 * Channel 3 request still gets a real product photo/title instead of a
 * blank card. Never throws; returns all-null metadata on any failure,
 * same as the API route itself.
 */
async function fetchOgMetadataClient(url: string): Promise<OgMetadata> {
  try {
    const res = await fetch(`/api/og-lookup?url=${encodeURIComponent(url)}`)
    if (!res.ok) return { title: null, image: null, description: null }
    return (await res.json()) as OgMetadata
  } catch {
    return { title: null, image: null, description: null }
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
  //     since there's nothing left to price. Lands on Orders Hub.
  //   - Unpriced: Channel 3 — the link couldn't be priced automatically
  //     (no extractor matched, or the site blocked scraping — Instagram
  //     posts and heavily bot-protected sites are the classic case). This
  //     creates a `requests` row for Sales & Purchase to quote by hand,
  //     its own dedicated `chat_threads` row, and an initial message
  //     seeding that thread with the link, an Open Graph-fetched photo/
  //     title (see fetchOgMetadataClient), and the customer's note —
  //     tagged to the request via chat_messages.request_id. Lands on
  //     /account/messages, where that thread is now the most recently
  //     active one and surfaces immediately (see
  //     getMostRecentOrGeneralThread in lib/supabase/chat.ts) — this is
  //     the "start a chat so the customer can continue" requirement.
  const confirmRequest = useCallback(async (): Promise<ConfirmResult> => {
    if (!user) return { ok: false, error: 'You need to be signed in to confirm a request.' }

    const supabase = createClient()
    try {
      if (draft.unitPrice > 0) {
        const domain = sourceDomainFor(draft.url)
        const snapshotId = await ensureProductSnapshot(supabase, {
          id: draft.url || draft.name,
          title: draft.name,
          image: draft.image,
          site: domain,
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
          seller_name: cleanSiteLabel(domain),
          seller_type: 'store',
          // Always a pasted link on this path (there's no catalogue
          // variant of confirmRequest) — request_link, not store_url. See
          // the cart-checkout item builder below for the split's purpose.
          request_link: draft.url || null,
        })
        if (itemError) throw itemError
      } else {
        // Channel 3 — couldn't be priced automatically (no extractor
        // matched, or the site blocked scraping outright — Instagram
        // posts and heavily bot-protected boutique sites are the classic
        // case). Try to at least get a real product photo/title via the
        // page's own Open Graph tags before handing this to a human, so
        // Sales & Purchase — and the customer's own chat — see an actual
        // picture of the item instead of a blank card.
        const hasRealImage = draft.image && draft.image !== productImage[0]
        const og = hasRealImage ? null : await fetchOgMetadataClient(draft.url)
        const screenshotUrl = hasRealImage ? draft.image : (og?.image ?? undefined)
        const displayTitle = draft.name.trim() || og?.title || draft.url

        const { data: thread, error: threadError } = await supabase
          .from('chat_threads')
          .insert({ user_id: user.id })
          .select('id')
          .single()
        if (threadError) throw threadError

        const { data: newRequest, error: requestError } = await supabase
          .from('requests')
          .insert({
            user_id: user.id,
            link: draft.url,
            note: draft.name,
            screenshot_url: screenshotUrl ?? null,
            source_domain: sourceDomainFor(draft.url),
            chat_thread_id: thread.id,
          })
          .select('id')
          .single()
        if (requestError) throw requestError

        // Links the thread back to the request (chat_threads.request_id)
        // — requests.chat_thread_id already points the other way; this
        // completes the pair so the admin thread list can show which
        // request a conversation belongs to.
        await supabase.from('chat_threads').update({ request_id: newRequest.id }).eq('id', thread.id)

        // Seeds the conversation with the link/photo/note as the first
        // message, tagged to this request, so both the customer's own
        // chat view and the admin's /admin/chat immediately show full
        // context instead of an empty thread — "start a chat so the
        // customer can continue" is this message existing at all.
        await sendChatMessage(supabase, {
          threadId: thread.id,
          sender: 'customer',
          senderName: user.name,
          text: `I'd like to order this: ${displayTitle}\n${draft.url}`,
          attachmentUrl: screenshotUrl ?? null,
          requestId: newRequest.id,
        })
      }

      clearPersistedDraft()
      setActiveTab('Requested')
      // Priced path made a real order — Orders Hub is where it lives.
      // Unpriced path made a request + chat thread, not an order yet —
      // send the customer straight to their chat, where the message just
      // seeded above (link, photo, note) is now the most recently active
      // thread and surfaces immediately (see getMostRecentOrGeneralThread
      // in lib/supabase/chat.ts).
      router.push(draft.unitPrice > 0 ? pathForView('ordersHub') : '/account/messages')
      return { ok: true }
    } catch (err) {
      console.error('[dashboard] failed to confirm request', err)
      return { ok: false, error: err instanceof Error ? err.message : 'Something went wrong. Please try again.' }
    }
  }, [draft, user, router])

  // See confirmRequest above for the general shape. Channel is derived
  // from where each line came from (CartOrderLine.source, set by the cart
  // page from CartProduct.source): an order made up ENTIRELY of catalogue
  // listings is Channel 1 (affiliated store); an order containing even
  // one pasted-link item is Channel 2 (scraped link) — mirrors the real
  // `orders.channel` column, which is per-order, not per-item, so a mixed
  // cart has to pick one. Every line here is always priced already (both
  // sources only reach the cart once a real price is known), so there's
  // no unpriced/Channel-3 branch on this path — Channel 3 only happens
  // via confirmRequest above, before anything reaches the cart.
  const confirmCartOrder = useCallback(
    async (lines: CartOrderLine[]): Promise<ConfirmResult> => {
      if (!lines.length) return { ok: false, error: 'Your cart is empty.' }
      if (!user) return { ok: false, error: 'You need to be signed in to confirm an order.' }

      const supabase = createClient()
      try {
        const total = lines.reduce((sum, line) => sum + line.qty * line.unitPriceLKR, 0)
        const channel: 1 | 2 = lines.every((line) => line.source === 'catalogue') ? 1 : 2
        const orderId = await createOrderWithRetry(supabase, {
          user_id: user.id,
          channel,
          currency: 'LKR',
          total_value: total,
        })

        const itemRows = await Promise.all(
          lines.map(async (line) => {
            const snapshotId = await ensureProductSnapshot(supabase, {
              id: line.url || line.name,
              title: line.name,
              image: line.image,
              site: line.site ?? null,
              price: null,
            })
            const sellerName = line.site ? cleanSiteLabel(line.site) : undefined
            const isCatalogue = line.source === 'catalogue'
            return {
              order_id: orderId,
              product_snapshot_id: snapshotId,
              title: line.name,
              quantity: line.qty,
              unit_price: line.unitPriceLKR,
              seller_name: sellerName ?? null,
              // Both catalogue and successfully-scraped-link items are
              // real storefronts, not an individual seller reached only
              // through manual chat — 'individual' is reserved for
              // Channel 3 (see confirmRequestReal in
              // lib/supabase/requests-admin.ts), which never goes
              // through this cart-checkout path at all.
              seller_type: 'store',
              // Split by origin, not just "the URL" — store_url is the
              // storefront a catalogue listing belongs to; request_link is
              // the specific link a customer pasted. This distinction is
              // what lets the admin Purchases page show the right source
              // per ITEM (Affiliated store vs Scraped link) even when one
              // cart/order mixes both — order.channel alone can't do that,
              // since it's a single value for the whole order. See
              // AdminDataContext's purchaseLines (itemSource) and
              // components/admin/purchases's per-item label.
              store_url: isCatalogue ? line.url || null : null,
              request_link: isCatalogue ? null : line.url || null,
            }
          }),
        )

        const { error: itemsError } = await supabase.from('order_items').insert(itemRows)
        if (itemsError) throw itemsError

        setActiveTab('Requested')
        return { ok: true }
      } catch (err) {
        console.error('[dashboard] failed to confirm cart order', err)
        return { ok: false, error: err instanceof Error ? err.message : 'Something went wrong. Please try again.' }
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