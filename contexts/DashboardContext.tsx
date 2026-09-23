'use client'

import { createContext, useCallback, useContext, useMemo, useState, type FormEvent } from 'react'
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
  // NEW — raw scrape data + delivery choice, carried through from
  // ItemInfoModal so confirmRequest can rebuild the exact Economy/Express
  // breakdown the customer saw in the review step (see applyScrapeResultToDraft
  // and confirmRequest below). sourcePrice/sourceCurrency are the pre-LKR
  // numbers getDualDeliveryPricing actually needs — unitPrice alone (already
  // converted, and without service charge/delivery) isn't enough to rebuild it.
  sourcePrice: null,
  sourceCurrency: null,
  weightKg: null,
  deliveryChoice: 'economy',
}

const DRAFT_STORAGE_KEY = 'dashboard:pendingDraft'
const LOGIN_REDIRECT_PATH = '/auth/login'
const LOGIN_REDIRECT_DELAY_MS = 2000

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
  /**
   * CartProduct.selectedOptions carried through to checkout — the actual
   * size/color/design the customer picked, e.g. {"Color":"ACB1145","Size":"M(38\")"}.
   * Written into order_items.variant_label (a real column that already
   * existed but was never populated by this path — see confirmCartOrder
   * below) so purchasing staff can see exactly what was selected without
   * needing the item's own URL to encode it. Most affiliated stores'
   * product URLs don't carry variant info either (Anishka Creation is
   * the case this was built for, but the gap applied to every multi-
   * variant store equally, not just that one).
   */
  selectedOptions?: Record<string, string>
}

export type ConfirmResult = { ok: boolean; error?: string }

/**
 * The shipping recipient entered on the cart/checkout page
 * (app/account/cart/page.tsx). confirmCartOrder writes this into
 * `addresses` and points the new order's recipient_address_id at it —
 * previously this data was collected nowhere on checkout at all, so
 * orders.recipient_address_id stayed permanently null (see
 * "Known gaps" in WISHDROP_STATUS.md).
 *
 * `existingAddressId` — set when the checkout form was prefilled from
 * the customer's saved default address (Address Book) and they didn't
 * change it into a materially different address — lets confirmCartOrder
 * update that same row instead of creating a near-duplicate one on every
 * order. Leave it null/undefined for a fresh address.
 */
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
  /** Writes the current draft to a real order (price already known) or a
   * Channel 3 request (no price yet, needs a Sales & Purchase quote).
   * Navigates to /account/orders on success; returns ok:false and stays
   * put on failure so the customer can retry.
   *
   * When a price IS known, the order is charged the FINAL Economy/Express
   * total for whichever delivery mode the customer picked in the review
   * step (item price + service charge + delivery) — not the bare item
   * price. See setDeliveryChoice / draft.deliveryChoice below.
   *
   * If the customer isn't signed in, this returns ok:false immediately
   * and schedules a redirect to the login page after a short delay (see
   * LOGIN_REDIRECT_DELAY_MS) so they have time to read the error before
   * being bounced. */
  confirmRequest: () => Promise<ConfirmResult>
  /** Stashes the customer's Economy/Express choice from the review step
   * onto the draft, so confirmRequest can charge the matching final total.
   * Wired up to ItemInfoModal's onDeliveryChoiceChange prop. */
  setDeliveryChoice: (choice: 'economy' | 'express') => void
  selectVariant: (url: string) => Promise<void>
  /** Writes cart lines to a single real order. Does NOT navigate or clear
   * the cart itself — the caller (cart page) does that only once this
   * resolves with ok: true, so a failed write never silently loses the
   * cart's contents. */
  confirmCartOrder: (lines: CartOrderLine[], recipient: CheckoutRecipient) => Promise<ConfirmResult>
}

const DashboardContext = createContext<DashboardContextValue | null>(null)

// Combines the variant-confirmation tag and the customer-visible LKR
// estimate into requests.note — so ops sees BOTH while scanning the
// admin queue/request detail page, without having to open the chat
// thread first to find the estimate that was actually shown to the
// customer. The tag prefix is also what VariantConfirmPill on the
// admin requests list page matches against (see that file).
function buildRequestNote(draft: Draft): string {
  const tag = draft.needsVariantConfirmation ? '[Confirm size/color with customer] ' : ''
  const estimate = draft.estimatedPriceLKR != null ? ` (customer's estimate: LKR ${draft.estimatedPriceLKR.toLocaleString('en-LK')})` : ''
  return `${tag}${draft.name}${estimate}`
}

function applyScrapeResultToDraft(current: Draft, result: ScrapeResult): Draft {
  const price = result.price != null ? Number(result.price) : null
  // A scraped price is only trustworthy enough to auto-price a real
  // Channel-2 order when we KNOW what currency it's actually in AND
  // the scrape had a real shot at knowing whether this item even has
  // variants. rateToLKR(null) deliberately falls back to treating the
  // amount as already-LKR (see its own doc comment) — a sensible
  // default for trusted internal callers, but silently wrong here: a
  // site with no dedicated extractor (Gymshark, or anything else only
  // covered by og-only.ts) that also doesn't expose
  // product:price:currency in its OG tags produces `currencyCode:
  // null`, and a real £30 item was getting priced at LKR 30 — roughly
  // 1/380th of its real value, auto-confirmed straight into a real
  // paid order with no human ever looking at it.
  //
  // Separately, and just as important: `result.ogOnly` means this data
  // came ENTIRELY from OG/JSON-LD meta tags (see og-only.ts's doc
  // comment) — a tier that structurally never inspects the page for a
  // size/color picker at all. A correct price and currency don't help
  // if the item is, say, a Gymshark top that comes in 7 colors x 7
  // sizes and nothing captured which one the customer meant — auto-
  // confirming that into a real order silently picks nothing, which
  // ops then can't fulfill correctly either. There's no reliable way to
  // tell "this product has no variants" from ogOnly data — it never
  // looks for them either way — so the only safe assumption is "can't
  // confirm, treat as if it might". Both this AND the currency check
  // gate the same outcome: unitPrice stays unset, which routes the
  // item to Channel 3 for a human to both price AND confirm the exact
  // variant with the customer — see confirmRequest's unpriced branch,
  // which reads needsVariantConfirmation (set below) to make that
  // explicit in the seeded chat message and the request note.
  const trustedPrice = price != null && Number.isFinite(price) && !!result.currencyCode && !result.ogOnly ? price : null
  // Same currency-known gate as trustedPrice above, but WITHOUT the
  // ogOnly exclusion — an ogOnly result's price can still be shown as a
  // rough estimate (see Draft.estimatedPriceLKR's doc comment), it's
  // only unsafe to silently charge against.
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
    // Reset on every scrape, not merged with the previous draft's value
    // — a fresh lookup (e.g. selectVariant re-scraping a different URL)
    // should reflect THIS result's own ogOnly status, not linger from
    // an earlier attempt.
    needsVariantConfirmation: result.ogOnly === true,
    estimatedPriceLKR,
    // NEW — raw (pre-LKR-conversion) price/currency + weight, kept
    // alongside the converted unitPrice above so confirmRequest can
    // rebuild the exact Economy/Express breakdown via
    // getDualDeliveryPricing (which needs the source price/currency,
    // not the already-converted LKR number). Only set when this
    // scrape actually produced a trustworthy price — same gate as
    // trustedPrice — otherwise carried over from the current draft so
    // an unrelated re-scrape (e.g. selectVariant) doesn't clobber a
    // previously-good value with nulls.
    sourcePrice: trustedPrice != null ? trustedPrice : current.sourcePrice ?? null,
    sourceCurrency: trustedPrice != null ? result.currencyCode ?? null : current.sourceCurrency ?? null,
    weightKg: (result as ScrapeResult & { weightKg?: number | null }).weightKg ?? current.weightKg ?? null,
  }
}

/**
 * Creates one `orders` row. display_id is not generated here — it used
 * to be a client-side random 5-digit number with a retry-on-collision
 * loop, since there was no DB-side way to produce one. Now
 * orders.display_id has a real DEFAULT backed by a Postgres sequence
 * (see data/wishdrop-order-display-id-sequence.sql), so leaving it out
 * of the insert lets the database assign a real, strictly increasing
 * order number.
 *
 * The retry loop below still exists, but for a different reason than
 * before: the sequence itself can never repeat a value, but this
 * project's `orders` table can still contain rows whose display_id came
 * from somewhere other than the sequence — every order created before
 * this migration used the old client-side random generator (both this
 * function's own prior version, and Channel 3's confirmRequestReal),
 * and both drew from the exact same range the sequence starts at
 * (10000+). The migration's own setval step is supposed to catch the
 * sequence up past every such existing row, but that's a one-time,
 * point-in-time calculation — if it's ever re-run against a database
 * that's had more legacy-format rows inserted since, or simply wasn't
 * re-run after a fresh batch of test data, the sequence can still hand
 * out a value that collides with one of those pre-existing rows. A
 * `23505` (unique_violation) on display_id specifically is exactly that
 * transitional collision, and it's real ("duplicate key value violates
 * unique constraint orders_display_id_key" in production) — not a
 * hypothetical edge case. Retrying is safe and sufficient: display_id is
 * still never set explicitly, so each retry re-evaluates the same
 * DEFAULT expression and gets a brand new value from the sequence,
 * which by definition can't repeat. A handful of attempts is more than
 * enough headroom even against a wide legacy range.
 */
/**
 * The one site a new order gets when nothing else determines a site —
 * see Site.isDefault's own doc comment in types/admin.ts and
 * AdminDataContext's defaultSiteId (the admin-side equivalent of this
 * same lookup). Needed here too because Channel 1/2 checkout — unlike
 * Channel 3's confirmRequestReal — creates the real `orders` row
 * directly from this customer-facing context, not from an admin action
 * that already has `sites` loaded. `sites` has no RLS restricting
 * reads (it's non-sensitive hub metadata), so the regular authenticated
 * client can query it directly rather than needing a server route.
 * Returns null (rather than throwing) if nothing is marked default yet
 * or the query fails — callers treat that the same as "no site" rather
 * than blocking checkout entirely over it, since an order with no site
 * is a worse outcome to force here than one that's merely un-scoped
 * until ops sets a default.
 */
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
  // Unreachable — the loop above always either returns or throws — but
  // keeps TypeScript satisfied that every path returns a string.
  throw new Error('Could not create order: ran out of retry attempts.')
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

/**
 * Rebuilds the same Economy/Express breakdown ReviewPricingBlock showed
 * in ItemInfoModal, and returns the FINAL per-unit LKR total (item price
 * + service charge + delivery) for whichever mode is in
 * draft.deliveryChoice. Falls back to draft.unitPrice (the bare,
 * pre-breakdown converted price) when there isn't enough raw data to
 * rebuild the breakdown — e.g. an older persisted draft from before
 * sourcePrice/sourceCurrency existed, or a hand-entered price with no
 * scrape behind it at all. This mirrors canBuildBreakdown/toPriceableItem
 * in ItemInfoModal.tsx; keep the two in sync if either changes.
 */
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

  // Fired by ItemInfoModal's onDeliveryChoiceChange whenever the
  // customer's Economy/Express toggle changes in the review step (and
  // once, immediately, on entering that step for a priced listing — see
  // that prop's own doc comment in ItemInfoModal.tsx). Just stashes the
  // choice on draft; confirmRequest is what actually turns it into a
  // final price via finalUnitPriceLKRFor.
  const setDeliveryChoice = useCallback((choice: 'economy' | 'express') => {
    setDraft((current) => ({ ...current, deliveryChoice: choice }))
  }, [])

  // Writes the confirmed draft to Supabase. Two paths, split on whether a
  // price is already known:
  //   - Priced (scraped successfully, or hand-entered in ItemInfoModal):
  //     Channel 2 — goes straight to a real order, no admin quote needed,
  //     since there's nothing left to price. The amount actually charged
  //     is the FINAL Economy/Express total for draft.deliveryChoice (item
  //     price + service charge + delivery — see finalUnitPriceLKRFor),
  //     the same number ReviewPricingBlock showed the customer, not the
  //     bare item price. Lands on Orders Hub.
  //   - Unpriced: Channel 3 — the link couldn't be priced automatically
  //     (no extractor matched, or the site blocked scraping — Instagram
  //     posts and heavily bot-protected sites are the classic case). This
  //     creates a `requests` row for Sales & Purchase to quote by hand,
  //     re-using the customer's single existing `chat_threads` row (one
  //     thread per customer, not one per request — see
  //     getOrCreateGeneralThread in lib/supabase/chat.ts), and an initial
  //     message seeding that thread with the link, an Open Graph-fetched
  //     photo/title (see fetchOgMetadataClient), and the customer's note
  //     — tagged to this specific request via chat_messages.request_id
  //     so admin/chat can still show which message belongs to which
  //     request even though several requests can now share one thread.
  //     Lands on /account/messages, where that thread (now bumped to the
  //     top by last_activity — see getMostRecentOrGeneralThread in
  //     lib/supabase/chat.ts) surfaces immediately — this is the "start a
  //     chat so the customer can continue" requirement.
  //
  // If the customer isn't signed in, no writes happen at all — this
  // returns ok:false right away and schedules a redirect to the login
  // page after LOGIN_REDIRECT_DELAY_MS so the error message is visible
  // for a moment before the user is bounced there.
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
        // Final per-unit LKR total for whichever delivery mode the
        // customer picked (item price + service charge + delivery) —
        // NOT the bare draft.unitPrice, which is only the item's price
        // with no delivery-mode charges applied. See finalUnitPriceLKRFor.
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
        const orderId = await createOrderWithRetry(supabase, {
          user_id: user.id,
          channel: 2,
          currency: 'LKR',
          total_value: finalUnitPriceLKR * draft.qty,
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

        // See Draft.needsVariantConfirmation's doc comment — true means
        // whatever scrape produced this draft's price/title (or lack
        // thereof) came from ogOnly data, which never checks for a
        // size/color picker at all. Surfaced in BOTH the customer's own
        // first message (so they think to specify size/color right away
        // instead of a back-and-forth) and the admin-facing request note
        // (so ops sees it while scanning the queue, without having to
        // open the thread first).
        const variantNote = draft.needsVariantConfirmation
          ? "\n\nNote: this item may come in different sizes/colors — please let us know which one you'd like when you get a chance."
          : ''
        const estimateNote =
          draft.estimatedPriceLKR != null
            ? `\n\nEstimated price: LKR ${draft.estimatedPriceLKR.toLocaleString('en-LK')} (we'll confirm the exact price once we check availability/variants).`
            : ''

        // One thread per customer, period — find it (or create it on a
        // customer's very first contact) instead of insert-ing a new row
        // every time a request comes in. Previously this always did a
        // bare `.insert({ user_id })`, which meant every Channel 3
        // request spawned its own `chat_threads` row: the admin inbox
        // showed the same customer several times over, and the
        // customer's own chat view would "lose" earlier history whenever
        // a newer per-request thread became the most-recently-active one.
        const threadId = await getOrCreateGeneralThread(supabase, user.id)

        const { data: newRequest, error: requestError } = await supabase
          .from('requests')
          .insert({
            user_id: user.id,
            link: draft.url,
            note: buildRequestNote(draft),
            // Clean, customer-facing name only — no internal tag, no
            // price estimate. This (not note) is what confirmRequestReal
            // uses for the new order's order_items.title, so the
            // "[Confirm size/color with customer]" tag never ends up
            // somewhere the customer can actually see it (their own
            // Orders page, or any auto-sent chat message that mentions
            // the item by name).
            item_name: draft.name,
            screenshot_url: screenshotUrl ?? null,
            source_domain: sourceDomainFor(draft.url),
            chat_thread_id: threadId,
            // Same signal as the old tag-in-note, now a real column the
            // admin request detail page can act on directly instead of
            // parsing it back out of note — see setRequestVariantReal in
            // lib/supabase/requests-admin.ts.
            needs_variant_confirmation: draft.needsVariantConfirmation === true,
          })
          .select('id')
          .single()
        if (requestError) throw requestError

        // Not setting chat_threads.request_id here anymore: that column
        // assumed one request per thread, which no longer holds now that
        // a single thread can carry many requests over time. Per-request
        // context still lives on chat_messages.request_id below, which is
        // what /admin/chat actually uses to tag individual messages to a
        // request.

        // Seeds the conversation with the link/photo/note as the first
        // message, tagged to this request, so both the customer's own
        // chat view and the admin's /admin/chat immediately show full
        // context instead of an empty thread — "start a chat so the
        // customer can continue" is this message existing at all.
        await sendChatMessage(supabase, {
          threadId,
          sender: 'customer',
          senderName: user.name,
          text: `I'd like to order this: ${displayTitle}\n${draft.url}${variantNote}${estimateNote}`,
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
  // sources only reach the cart once a real price is known — the cart
  // page's own PriceBreakdownOverlay/getDualDeliveryPricing already
  // resolved each line's delivery mode into CartOrderLine.unitPriceLKR
  // before this is ever called), so there's no unpriced/Channel-3 branch
  // on this path — Channel 3 only happens via confirmRequest above,
  // before anything reaches the cart.
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
        // Save the shipping address before the order itself, so
        // orders.recipient_address_id is always set on a real address
        // instead of staying null — see CheckoutRecipient's doc comment.
        // Updates the existing default address in place when checkout was
        // prefilled from one (keeps Address Book from silently gaining a
        // near-duplicate row every time someone re-orders with the same
        // details); inserts a fresh one otherwise, marked default since a
        // customer placing their first order has no default to compete
        // with yet.
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

        // One thread per customer, same as Channel 3's confirmRequest —
        // find it (or create it on this customer's very first contact)
        // rather than leaving the order with no thread at all. Channel
        // 1/2 orders never got this: createOrderWithRetry never set
        // chat_thread_id, so every downstream "review before send"
        // customer message (QC flagged, replacement passed, purchase
        // failed, arrived in Sri Lanka, delivered — see
        // lib/chat/customerMessageTemplates.ts and every page that
        // imports it) silently skipped both the SendMessageModal AND the
        // send itself for these orders, since each of those call sites
        // gates on `line.chatThreadId` being truthy. Nothing about that
        // gating was wrong — it's the right behavior when there's
        // genuinely no thread — the bug was that Channel 1/2 orders
        // never got one in the first place.
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
            // "Color: ACB1145, Size: M(38")" — stable key order (sorted)
            // so the same selection always renders identically regardless
            // of which order the option chips happened to be clicked in.
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
    [user, router],
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
      scrapeResult,
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