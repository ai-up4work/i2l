'use client'

import { createContext, useCallback, useContext, useMemo, useRef, useState, type FormEvent } from 'react'
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
import { getOrCreateGeneralThread, sendChatMessage } from '@/lib/supabase/chat'
import type { OgMetadata } from '@/lib/og-lookup'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getDualDeliveryPricing, type ProductPriceableItem } from '@/lib/pricing'

const emptyDraft: Draft = {
  url: '',
  name: '',
  qty: 1,
  unitPrice: 0,
  currency: 'Rs.',
  image: productImage[0],
  isLiquid: null,
  hasBatteries: null,
  estimatedPriceLKR: null,
  sourcePrice: null,
  sourceCurrency: null,
  weightKg: null,
  deliveryChoice: 'economy',
}

const DRAFT_STORAGE_KEY = 'dashboard:pendingDraft'
const LOGIN_REDIRECT_PATH = '/auth/login'
const LOGIN_REDIRECT_DELAY_MS = 2000

// NEW — automated acknowledgement sent from the ops side immediately
// after the customer's own seed message in the Channel 3 (unpriced)
// branch of confirmRequest, so the thread never sits with only the
// customer's message in it before a human actually replies. Uses
// sender: 'ops' — the real chat_sender enum is ('customer', 'ops'), NOT
// 'admin' or 'staff' (see the ChatSender doc comment in
// lib/supabase/chat.ts) — anything else fails with "invalid input value
// for enum chat_sender" on every Channel 3 submission.
//
// Note: sendChatMessage treats any 'ops'-sent message as a reply — it
// sets requests.has_unreplied_message to false for this request (see
// sendChatMessage's isUnreplied logic) since that flag can't distinguish
// "a human answered" from "an automated message went out". If Sales &
// Purchase's queue should still treat this request as awaiting a real
// reply despite this auto-message, that flag will need its own signal
// (e.g. an `is_automated` column on chat_messages) rather than reusing
// has_unreplied_message as-is.
const AUTO_ACK_SENDER_NAME = 'Wishdrop Support'
const AUTO_ACK_MESSAGE =
  'Hi there! 👋 Thank you for reaching out to Wishdrop.\n\n' +
  'We have received your inquiry about our items and pricing. One of our customer care executives will review your request and get back to you with all the details shortly!\n\n' +
  'Thank you for your patience. Have a great day! ✨'

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
  source?: 'catalogue' | 'link'
  site?: string | null
  selectedOptions?: Record<string, string>
}

export type ConfirmResult = { ok: boolean; error?: string }

export type CheckoutRecipient = {
  fullName: string
  phone: string
  addressLine1: string
  addressLine2?: string
  city: string
  postalCode?: string
  country: string
  existingAddressId?: string | null
}

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
  startItemInfo: (event: FormEvent) => Promise<void>
  beginRequestForUrl: (url: string) => Promise<void>
  saveItemInfo: (event: FormEvent) => void
  confirmRequest: () => Promise<ConfirmResult>
  setDeliveryChoice: (choice: 'economy' | 'express') => void
  selectVariant: (url: string) => Promise<void>
  confirmCartOrder: (lines: CartOrderLine[], recipient: CheckoutRecipient) => Promise<ConfirmResult>
}

const DashboardContext = createContext<DashboardContextValue | null>(null)

function buildRequestNote(draft: Draft): string {
  const tag = draft.needsVariantConfirmation ? '[Confirm size/color with customer] ' : ''
  const estimate = draft.estimatedPriceLKR != null ? ` (customer's estimate: LKR ${draft.estimatedPriceLKR.toLocaleString('en-LK')})` : ''
  return `${tag}${draft.name}${estimate}`
}

function applyScrapeResultToDraft(current: Draft, result: ScrapeResult): Draft {
  const price = result.price != null ? Number(result.price) : null
  const trustedPrice = price != null && Number.isFinite(price) && !!result.currencyCode && !result.ogOnly ? price : null
  const estimatedPriceLKR =
    price != null && Number.isFinite(price) && !!result.currencyCode
      ? Math.round(price * rateToLKR(result.currencyCode))
      : null
  return {
    ...current,
    url: result.url ?? current.url,
    name: result.title || current.name,
    image: result.images?.[0] || current.image,
    unitPrice: trustedPrice != null ? Math.round(trustedPrice * rateToLKR(result.currencyCode)) : current.unitPrice,
    needsVariantConfirmation: result.ogOnly === true,
    estimatedPriceLKR,
    sourcePrice: trustedPrice != null ? trustedPrice : current.sourcePrice ?? null,
    sourceCurrency: trustedPrice != null ? result.currencyCode ?? null : current.sourceCurrency ?? null,
    weightKg: (result as ScrapeResult & { weightKg?: number | null }).weightKg ?? current.weightKg ?? null,
  }
}

async function fetchDefaultSiteId(supabase: SupabaseClient): Promise<string | null> {
  const { data, error } = await supabase.from('sites').select('id').eq('is_default', true).maybeSingle()
  if (error) {
    console.error('[fetchDefaultSiteId]', error)
    return null
  }
  return data?.id ?? null
}

async function createOrderWithRetry(
  supabase: SupabaseClient,
  fields: {
    user_id: string
    channel: 1 | 2 | 3
    currency: string
    total_value: number
    recipient_address_id?: string | null
    chat_thread_id?: string | null
    site_id?: string | null
  },
): Promise<string> {
  const MAX_ATTEMPTS = 5
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const { data, error } = await supabase.from('orders').insert(fields).select('id').single()
    if (!error) return data.id as string
    const isDisplayIdCollision = error.code === '23505' && /display_id/i.test(error.message)
    if (!isDisplayIdCollision || attempt === MAX_ATTEMPTS - 1) throw error
  }
  throw new Error('Could not create order: ran out of retry attempts.')
}

function sourceDomainFor(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return 'unknown'
  }
}

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

async function fetchOgMetadataClient(url: string): Promise<OgMetadata> {
  try {
    const res = await fetch(`/api/og-lookup?url=${encodeURIComponent(url)}`)
    if (!res.ok) return { title: null, image: null, description: null }
    return (await res.json()) as OgMetadata
  } catch {
    return { title: null, image: null, description: null }
  }
}

function finalUnitPriceLKRFor(draft: Draft): number {
  if (draft.sourcePrice == null || !draft.sourceCurrency) return draft.unitPrice

  const priceable: ProductPriceableItem = {
    price: draft.sourcePrice,
    currency: draft.sourceCurrency,
    weightKg: draft.weightKg ?? undefined,
  }
  const dual = getDualDeliveryPricing(priceable)
  const selected = draft.deliveryChoice === 'express' ? dual.express : dual.economy
  return Math.round(selected.actualTotalLKR)
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

  const [ogPreview, setOgPreview] = useState<{ url: string; title: string | null; image: string | null } | null>(
    null,
  )
  const latestUrlRef = useRef<string>('')

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

      latestUrlRef.current = url
      setAutoFilled(false)
      setDraft({ ...emptyDraft, url })
      setOgPreview(null)
      setModalOpen(true)

      fetchOgMetadataClient(url)
        .then((og) => {
          if (latestUrlRef.current !== url) return
          if (og.title || og.image) {
            setOgPreview({ url, title: og.title, image: og.image })
          }
        })
        .catch(() => {})

      const product = await lookup(url)
      if (!product || product.error) return

      setDraft((current) => applyScrapeResultToDraft(current, product))
      setAutoFilled(true)
    },
    [lookup],
  )

  const startItemInfo = useCallback(
    async (event: FormEvent) => {
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
    (event: FormEvent) => {
      event.preventDefault()
      if (!draft.name.trim()) return
      persistDraft(draft)
      setModalOpen(false)
      router.push(pathForView('confirmRequest'))
    },
    [draft, router],
  )

  const setDeliveryChoice = useCallback((choice: 'economy' | 'express') => {
    setDraft((current) => ({ ...current, deliveryChoice: choice }))
  }, [])

  const confirmRequest = useCallback(async (): Promise<ConfirmResult> => {
    if (!user) {
      setTimeout(() => {
        router.push(LOGIN_REDIRECT_PATH)
      }, LOGIN_REDIRECT_DELAY_MS)
      return { ok: false, error: 'You need to be signed in to confirm a request.' }
    }

    const supabase = createClient()
    try {
      if (draft.unitPrice > 0) {
        const finalUnitPriceLKR = finalUnitPriceLKRFor(draft)

        const domain = sourceDomainFor(draft.url)
        const snapshotId = await ensureProductSnapshot(supabase, {
          id: draft.url || draft.name,
          title: draft.name,
          image: draft.image,
          site: domain,
          price: null,
        })
        const defaultSiteId = await fetchDefaultSiteId(supabase)
        const threadId = await getOrCreateGeneralThread(supabase, user.id)
        const orderId = await createOrderWithRetry(supabase, {
          user_id: user.id,
          channel: 2,
          currency: 'LKR',
          total_value: finalUnitPriceLKR * draft.qty,
          chat_thread_id: threadId,
          site_id: defaultSiteId,
        })
        const { error: itemError } = await supabase.from('order_items').insert({
          order_id: orderId,
          product_snapshot_id: snapshotId,
          title: draft.name,
          quantity: draft.qty,
          unit_price: finalUnitPriceLKR,
          seller_name: cleanSiteLabel(domain),
          seller_type: 'store',
          request_link: draft.url || null,
        })
        if (itemError) throw itemError
      } else {
        // Channel 3 — couldn't be priced automatically (no extractor
        // matched, or the site blocked scraping outright).
        const hasRealImage = draft.image && draft.image !== productImage[0]
        const og = hasRealImage ? null : await fetchOgMetadataClient(draft.url)
        const screenshotUrl = hasRealImage ? draft.image : (og?.image ?? undefined)
        const displayTitle = draft.name.trim() || og?.title || draft.url

        const variantNote = draft.needsVariantConfirmation
          ? "\n\nNote: this item may come in different sizes/colors — please let us know which one you'd like when you get a chance."
          : ''
        const estimateNote =
          draft.estimatedPriceLKR != null
            ? `\n\nEstimated price: LKR ${draft.estimatedPriceLKR.toLocaleString('en-LK')} (we'll confirm the exact price once we check availability/variants).`
            : ''

        const threadId = await getOrCreateGeneralThread(supabase, user.id)

        const { data: newRequest, error: requestError } = await supabase
          .from('requests')
          .insert({
            user_id: user.id,
            link: draft.url,
            note: buildRequestNote(draft),
            item_name: draft.name,
            screenshot_url: screenshotUrl ?? null,
            source_domain: sourceDomainFor(draft.url),
            chat_thread_id: threadId,
            needs_variant_confirmation: draft.needsVariantConfirmation === true,
          })
          .select('id')
          .single()
        if (requestError) throw requestError

        // Seeds the conversation with the customer's own message first —
        // link, photo, note — tagged to this request.
        await sendChatMessage(supabase, {
          threadId,
          sender: 'customer',
          senderName: user.name,
          text: `I want the price of: ${displayTitle}\n${draft.url}${variantNote}${estimateNote}`,
          attachmentUrl: screenshotUrl ?? null,
          requestId: newRequest.id,
        })

        // NEW — automated ops-side acknowledgement, sent right after the
        // customer's own seed message above so the thread never sits with
        // just the customer's message and nothing else before a human
        // actually replies. sender must be 'ops' (the real chat_sender
        // enum), not 'admin'/'staff' — see AUTO_ACK_SENDER_NAME's doc
        // comment above. Tagged to the same requestId so admin/chat still
        // attributes it to this specific request.
        await sendChatMessage(supabase, {
          threadId,
          sender: 'ops',
          senderName: AUTO_ACK_SENDER_NAME,
          text: AUTO_ACK_MESSAGE,
          attachmentUrl: null,
          requestId: newRequest.id,
        })
      }

      clearPersistedDraft()
      setActiveTab('Requested')
      router.push(draft.unitPrice > 0 ? pathForView('ordersHub') : '/account/messages')
      return { ok: true }
    } catch (err) {
      console.error('[dashboard] failed to confirm request', err)
      return { ok: false, error: err instanceof Error ? err.message : 'Something went wrong. Please try again.' }
    }
  }, [draft, user, router])

  const confirmCartOrder = useCallback(
    async (lines: CartOrderLine[], recipient: CheckoutRecipient): Promise<ConfirmResult> => {
      if (!lines.length) return { ok: false, error: 'Your cart is empty.' }
      if (!user) {
        setTimeout(() => {
          router.push(LOGIN_REDIRECT_PATH)
        }, LOGIN_REDIRECT_DELAY_MS)
        return { ok: false, error: 'You need to be signed in to confirm an order.' }
      }
      if (!recipient.addressLine1.trim() || !recipient.city.trim() || !recipient.country.trim()) {
        return { ok: false, error: 'A shipping address is required to place an order.' }
      }

      const supabase = createClient()
      try {
        const addressPayload = {
          recipient_name: recipient.fullName,
          phone: recipient.phone,
          address_line1: recipient.addressLine1,
          address_line2: recipient.addressLine2?.trim() || null,
          city: recipient.city,
          postal_code: recipient.postalCode?.trim() || null,
          country: recipient.country,
        }
        let addressId = recipient.existingAddressId ?? null
        if (addressId) {
          const { error: addressError } = await supabase
            .from('addresses')
            .update(addressPayload)
            .eq('id', addressId)
          if (addressError) throw addressError
        } else {
          const { data: addressRow, error: addressError } = await supabase
            .from('addresses')
            .insert({ ...addressPayload, user_id: user.id, is_default: true })
            .select('id')
            .single()
          if (addressError) throw addressError
          addressId = addressRow.id as string
        }

        const threadId = await getOrCreateGeneralThread(supabase, user.id)

        const total = lines.reduce((sum, line) => sum + line.qty * line.unitPriceLKR, 0)
        const channel: 1 | 2 = lines.every((line) => line.source === 'catalogue') ? 1 : 2
        const defaultSiteId = await fetchDefaultSiteId(supabase)
        const orderId = await createOrderWithRetry(supabase, {
          user_id: user.id,
          channel,
          currency: 'LKR',
          total_value: total,
          recipient_address_id: addressId,
          chat_thread_id: threadId,
          site_id: defaultSiteId,
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
            const variantLabel = line.selectedOptions
              ? Object.keys(line.selectedOptions)
                  .sort()
                  .map((k) => `${k}: ${line.selectedOptions![k]}`)
                  .join(', ') || null
              : null
            return {
              order_id: orderId,
              product_snapshot_id: snapshotId,
              title: line.name,
              variant_label: variantLabel,
              quantity: line.qty,
              unit_price: line.unitPriceLKR,
              seller_name: sellerName ?? null,
              seller_type: 'store',
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
    [user, router],
  )

  const scrapeResultWithPreview = useMemo<ScrapeResult | null>(() => {
    if (scrapeResult) return scrapeResult
    if (ogPreview && (ogPreview.title || ogPreview.image)) {
      return {
        url: ogPreview.url,
        title: ogPreview.title ?? undefined,
        images: ogPreview.image ? [ogPreview.image] : [],
      } as ScrapeResult
    }
    return null
  }, [scrapeResult, ogPreview])

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
      scrapeResult: scrapeResultWithPreview,
      resetDraft,
      startItemInfo,
      beginRequestForUrl,
      saveItemInfo,
      confirmRequest,
      setDeliveryChoice,
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
      scrapeResultWithPreview,
      resetDraft,
      startItemInfo,
      beginRequestForUrl,
      saveItemInfo,
      confirmRequest,
      setDeliveryChoice,
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