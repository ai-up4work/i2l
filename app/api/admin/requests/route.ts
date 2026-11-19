// app/api/admin/requests/route.ts
//
// POST — staff create a request ON BEHALF OF a customer.
//
// Why this exists: customers often send a product link straight to staff
// (website chat or WhatsApp) instead of using "Buy for me". Staff quote and
// take payment in the conversation, but with no `requests` row there is
// nothing to confirm into an order — so no order, and no tracking for the
// customer. This route creates that missing row, attached to the customer's
// own account and chat thread, so the normal flow takes over:
//
//   request (this route) → quote → record payment → Confirm → order + tracking
//
// It accepts everything the request page itself lets staff set, so a request
// can be created complete and only needs Confirm afterwards.
//
// Body (all optional unless marked):
//   userId *            the customer's auth user id (from CustomerPicker)
//   link *              the product link (http/https)
//   --- the item (same as "Product details" on the request page) ---
//   itemName            product title shown on the order
//   productImageUrl     https product photo
//   sellerName          seller / store name
//   quantity            default 1
//   variantOptions      [{ dimension, values[] }] — the choices for the customer
//   variant             the choice that was agreed, e.g. "Size: M, Colour: Black"
//   needsVariantConfirmation  true → the request is flagged until a variant is set
//   --- what the customer sent ---
//   note                the customer's note / anything agreed
//   screenshotUrl       the customer's own screenshot / photo
//   --- money ---
//   quote               total price in LKR. Sets the request to "quoted".
//   payment             { amount, method, reference? } — only with `quote`.
//                       method: bank_transfer | cash | card | other
//   --- handling ---
//   assignedStaffId     who works it (default: you). Must be an active staff member.
//   messageId           an existing chat message (the one carrying the link) to
//                       tag to the new request; must be this customer's own.
//   notifyCustomer      default true — posts a staff message in their chat,
//                       tagged to the request.
//   customerMessage     replaces the default message text when given.
//
// Manager, Sales and Super Admin — the roles that work the inbox and quote.
//
// `created_by_staff_id` / `created_via` (data/wishdrop-staff-created-requests.sql)
// mark these requests so reports can tell them from customer-made ones. The
// insert still works if that SQL hasn't been run yet (the markers are dropped).

import { NextRequest, NextResponse } from 'next/server'
import { requireStaffRole } from '@/lib/supabase/admin-auth'
import { staffName } from '@/lib/supabase/staff-name'
import { getOrCreateGeneralThread, sendChatMessage } from '@/lib/supabase/chat'
import { formatItemLabel, paymentConfirmedMessage, quoteMessage } from '@/lib/chat/customerMessageTemplates'
import { ensureMessageTemplates } from '@/lib/chat/messageTemplates-server'

export const runtime = 'nodejs'

const ROLES = ['manager', 'sales', 'super_admin'] as const
// Same keys the request page's payment form uses.
const PAYMENT_METHODS = ['bank_transfer', 'cash', 'card', 'other'] as const

type Body = {
  userId?: unknown
  link?: unknown
  itemName?: unknown
  productImageUrl?: unknown
  sellerName?: unknown
  quantity?: unknown
  variantOptions?: unknown
  variant?: unknown
  needsVariantConfirmation?: unknown
  note?: unknown
  screenshotUrl?: unknown
  quote?: unknown
  payment?: { amount?: unknown; method?: unknown; reference?: unknown } | null
  assignedStaffId?: unknown
  messageId?: unknown
  notifyCustomer?: unknown
  customerMessage?: unknown
}

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '')

function money(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v) : NaN
  return Number.isFinite(n) && n > 0 && n < 100_000_000 ? Math.round(n * 100) / 100 : null
}

function domainOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./i, '')
  } catch {
    return 'unknown'
  }
}

/** [{dimension, values[]}] from whatever came in; drops empty rows. */
function cleanVariantOptions(v: unknown): { dimension: string; values: string[] }[] {
  if (!Array.isArray(v)) return []
  const out: { dimension: string; values: string[] }[] = []
  for (const row of v.slice(0, 6)) {
    const dimension = str((row as { dimension?: unknown })?.dimension, 40)
    const rawValues = (row as { values?: unknown })?.values
    const values = (Array.isArray(rawValues) ? rawValues : [])
      .map((x) => str(x, 60))
      .filter(Boolean)
      .slice(0, 40)
    if (dimension && values.length) out.push({ dimension, values })
  }
  return out
}

function httpsOrEmpty(v: unknown): string {
  const s = str(v, 2000)
  return s && /^https:\/\//i.test(s) ? s : ''
}

export async function POST(req: NextRequest) {
  const auth = await requireStaffRole(ROLES)
  if (!auth.ok) return auth.response
  const { admin, staffId } = auth

  let body: Body
  try {
    body = (await req.json()) as Body
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
  }

  // ── Validate input ────────────────────────────────────────────────
  const userId = str(body.userId, 64)
  if (!userId) return NextResponse.json({ error: 'Choose a customer.' }, { status: 400 })

  const link = str(body.link, 2000)
  let parsed: URL
  try {
    parsed = new URL(link)
  } catch {
    return NextResponse.json({ error: 'Enter a full product link starting with https://' }, { status: 400 })
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return NextResponse.json({ error: 'The link must start with http:// or https://' }, { status: 400 })
  }

  const itemName = str(body.itemName, 200)
  const sellerName = str(body.sellerName, 120)
  const note = str(body.note, 1000)
  const variant = str(body.variant, 200)
  const variantOptions = cleanVariantOptions(body.variantOptions)
  const needsVariantConfirmation = body.needsVariantConfirmation === true && !variant
  const quantityRaw = Number(body.quantity ?? 1)
  const quantity = Number.isInteger(quantityRaw) && quantityRaw >= 1 && quantityRaw <= 99 ? quantityRaw : 1

  const productImageUrl = httpsOrEmpty(body.productImageUrl)
  const screenshotUrl = httpsOrEmpty(body.screenshotUrl)
  if ((body.productImageUrl && !productImageUrl) || (body.screenshotUrl && !screenshotUrl)) {
    return NextResponse.json({ error: 'Photos must be https links (or uploaded here).' }, { status: 400 })
  }

  const hasQuoteInput = body.quote !== undefined && body.quote !== null && body.quote !== ''
  const quote = hasQuoteInput ? money(body.quote) : null
  if (hasQuoteInput && quote === null) {
    return NextResponse.json({ error: 'Enter the quote as a number above 0.' }, { status: 400 })
  }

  let payment: { amount: number; method: string; reference: string | null } | null = null
  if (body.payment) {
    if (quote === null) {
      return NextResponse.json({ error: 'Add the quoted price before recording a payment.' }, { status: 400 })
    }
    const amount = money(body.payment.amount)
    const method = str(body.payment.method, 40)
    if (amount === null || !(PAYMENT_METHODS as readonly string[]).includes(method)) {
      return NextResponse.json({ error: 'Enter the payment amount and how it was paid.' }, { status: 400 })
    }
    payment = { amount, method, reference: str(body.payment.reference, 120) || null }
  }

  // ── The customer must be a real, non-staff account ────────────────
  const { data: profile } = await admin.from('profiles').select('id, full_name').eq('id', userId).maybeSingle()
  if (!profile) return NextResponse.json({ error: 'That customer was not found.' }, { status: 404 })
  const { data: isStaff } = await admin.from('staff_accounts').select('id').eq('user_id', userId).maybeSingle()
  if (isStaff) return NextResponse.json({ error: 'That account belongs to a staff member, not a customer.' }, { status: 400 })

  // ── Who works it: default you; another person must be active staff ─
  let assignee = staffId
  const wanted = str(body.assignedStaffId, 64)
  if (wanted && wanted !== staffId) {
    const { data: member } = await admin
      .from('staff_accounts')
      .select('id, role, status')
      .eq('id', wanted)
      .maybeSingle()
    if (!member || member.status !== 'active' || !(ROLES as readonly string[]).includes(member.role as string)) {
      return NextResponse.json({ error: 'That staff member cannot be assigned requests.' }, { status: 400 })
    }
    assignee = member.id as string
  }

  // ── An optional chat message to tag must be this customer's own ───
  const messageId = str(body.messageId, 64)
  let messageThreadId: string | null = null
  if (messageId) {
    const { data: msg } = await admin.from('chat_messages').select('id, thread_id').eq('id', messageId).maybeSingle()
    const { data: thread } = msg
      ? await admin.from('chat_threads').select('id, user_id').eq('id', msg.thread_id).maybeSingle()
      : { data: null }
    if (!msg || !thread || thread.user_id !== userId) {
      return NextResponse.json({ error: 'That chat message does not belong to this customer.' }, { status: 400 })
    }
    messageThreadId = thread.id as string
  }

  // ── Create the request ────────────────────────────────────────────
  try {
    // Reuse the customer's existing conversation (the one the link was
    // sent in) so everything stays in one place for them and for staff.
    const threadId = messageThreadId ?? (await getOrCreateGeneralThread(admin, userId))
    const title = itemName || parsed.hostname.replace(/^www\./i, '')

    const fields: Record<string, unknown> = {
      user_id: userId,
      link,
      // The chosen variant is always kept in the note too, so it is never
      // lost if someone reads only the note.
      note: [variant ? `Variant: ${variant}` : '', note].filter(Boolean).join('\n') || null,
      item_name: itemName || null,
      product_image_url: productImageUrl || null,
      seller_name: sellerName || null,
      quantity,
      variant_options: variantOptions.length ? variantOptions : null,
      confirmed_variant: variant || null,
      needs_variant_confirmation: needsVariantConfirmation,
      screenshot_url: screenshotUrl || null,
      source_domain: domainOf(link),
      chat_thread_id: threadId,
      assigned_staff_id: assignee,
      status: quote !== null ? 'quoted' : 'sent_for_review',
      quote,
      // The customer will see this request, so a request staff created is
      // never in the "needs a reply from us" state straight away.
      has_unreplied_message: false,
    }
    if (payment) {
      fields.payment_amount = payment.amount
      fields.payment_method = payment.method
      fields.payment_reference = payment.reference
      fields.payment_confirmed_at = new Date().toISOString()
      fields.payment_confirmed_by = staffId
    }

    const markers = { created_by_staff_id: staffId, created_via: 'staff' }
    // Cast: the generated DB types don't know the optional markers or some
    // of the later columns, same as other routes that insert request rows.
    let { data: created, error } = await admin
      .from('requests')
      .insert({ ...fields, ...markers } as never)
      .select('id, display_id')
      .single()
    if (error && error.code === '42703' && /created_by_staff_id|created_via/.test(error.message)) {
      // Marker columns not added yet (SQL not run) — create without them.
      ;({ data: created, error } = await admin.from('requests').insert(fields as never).select('id, display_id').single())
    }
    if (error || !created) {
      console.error('[admin/requests] insert failed', error)
      return NextResponse.json({ error: error?.message ?? 'Could not create the request.' }, { status: 500 })
    }
    const request = created as { id: string; display_id: string }

    if (quote !== null) {
      const { error: historyError } = await admin
        .from('request_quote_history')
        .insert({ request_id: request.id, amount: quote, staff_id: staffId })
      if (historyError) console.error('[admin/requests] quote history failed', historyError.message)
    }

    // Tie the original message (carrying the link) to this request.
    if (messageId) {
      const { error: tagError } = await admin.from('chat_messages').update({ request_id: request.id }).eq('id', messageId)
      if (tagError) console.error('[admin/requests] tagging message failed', tagError.message)
      await admin.from('chat_threads').update({ last_request_id: request.id } as never).eq('id', threadId)
    }

    // Tell the customer, in the same conversation, so it's visibly theirs.
    // Uses the same wording as the request page's own quote / payment messages.
    if (body.notifyCustomer !== false) {
      await ensureMessageTemplates()
      const label = formatItemLabel(title, variant)
      const custom = str(body.customerMessage, 1500)
      const text =
        custom ||
        (payment
          ? paymentConfirmedMessage(request.display_id, label, payment.amount, payment.method)
          : quote !== null
            ? quoteMessage(request.display_id, label, quote, false)
            : `We've set up your request ${request.display_id} for "${label}". We're checking the price and will message you here.`)
      const name = (await staffName(admin, staffId)) ?? 'Wishdrop'
      try {
        await sendChatMessage(admin, {
          threadId,
          sender: 'ops',
          senderName: name,
          text,
          attachmentUrl: null,
          requestId: request.id,
        })
      } catch (e) {
        // The request exists; a failed courtesy message must not undo it.
        console.error('[admin/requests] customer message failed', e)
      }
    }

    return NextResponse.json({
      ok: true,
      request: { id: request.id, displayId: request.display_id, status: fields.status },
      customer: { id: profile.id, name: profile.full_name },
    })
  } catch (e) {
    console.error('[admin/requests] failed', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Could not create the request.' }, { status: 500 })
  }
}
