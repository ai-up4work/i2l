'use client'

// components/admin/requests/CreateRequestDialog.tsx
//
// "Create request for customer" — for when a customer sends a product link
// straight to staff (website chat or WhatsApp) instead of using "Buy for me".
// Creates the request on the customer's own account so it can be quoted,
// paid, confirmed into an order and tracked like any other.
//
// Used from Admin → Requests (pick the customer) and from the chat inbox
// (customer, link and the message are pre-filled).
//
// Backed by POST /api/admin/requests.

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { CheckCircle2, Eye, Loader2, X } from 'lucide-react'
import CustomerPicker, { adminInputClass, type PickedCustomer } from '@/components/admin/CustomerPicker'

const PAYMENT_METHODS = ['Bank transfer', 'Card', 'Cash', 'WhatsApp payment', 'Other'] as const

type Created = { id: string; displayId: string; status: string; customerName: string; paid: boolean }

// What the product lookup (/api/product-lookup) gives back, trimmed to what
// staff need to recognise the item and pick the customer's variant.
type VariantOption = { label: string; price: string | null; image: string | null; selected: boolean; outOfStock?: boolean }
type Preview = {
  title: string | null
  brand: string | null
  price: string | null
  currencyCode: string | null
  image: string | null
  site: string | null
  availability: string | null
  variants: { dimension: string; options: VariantOption[] }[]
  /** The store only gave us a title/photo (no price or options). */
  partial: boolean
  /** The link is one of our own affiliated stores' products. */
  internalPath?: string
}

export default function CreateRequestDialog({
  onClose,
  onCreated,
  customer,
  link: initialLink = '',
  messageId,
  autoPreview = false,
}: {
  onClose: () => void
  onCreated?: (r: { id: string; displayId: string }) => void
  /** Pre-selected customer (chat inbox). Locks the customer field. */
  customer?: PickedCustomer
  /** Pre-filled product link, e.g. taken from the chat message. */
  link?: string
  /** The chat message carrying the link — gets tagged to the new request. */
  messageId?: string
  /** Fetch the preview straight away (used when opened from a chat link). */
  autoPreview?: boolean
}) {
  const [picked, setPicked] = useState<PickedCustomer[]>(customer ? [customer] : [])
  const [link, setLink] = useState(initialLink)
  const [itemName, setItemName] = useState('')
  const [quantity, setQuantity] = useState('1')
  const [note, setNote] = useState('')
  const [imageUrl, setImageUrl] = useState('')
  const [quote, setQuote] = useState('')
  const [paid, setPaid] = useState(false)
  const [method, setMethod] = useState<string>(PAYMENT_METHODS[0])
  const [reference, setReference] = useState('')
  const [notify, setNotify] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [created, setCreated] = useState<Created | null>(null)
  const firstField = useRef<HTMLInputElement>(null)

  // Preview / variant picking
  const [preview, setPreview] = useState<Preview | null>(null)
  const [previewing, setPreviewing] = useState(false)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [chosen, setChosen] = useState<Record<string, string>>({})
  const previewSeq = useRef(0)

  async function fetchPreview(url = link) {
    const target = url.trim()
    if (!/^https?:\/\//i.test(target)) {
      setPreviewError('Paste the full product link first, starting with https://')
      return
    }
    const id = ++previewSeq.current
    setPreviewing(true)
    setPreviewError(null)
    setPreview(null)
    setChosen({})
    try {
      const res = await fetch(`/api/product-lookup?url=${encodeURIComponent(target)}&needVariants=true`)
      const data = await res.json().catch(() => ({}))
      if (id !== previewSeq.current) return // a newer lookup replaced this one
      if (!res.ok) {
        setPreviewError(data?.error ?? 'Could not read that link. You can still create the request by hand.')
        return
      }
      if (data?.internalRedirect) {
        setPreview({ title: null, brand: null, price: null, currencyCode: null, image: null, site: null, availability: null, variants: [], partial: true, internalPath: data.internalRedirect })
        return
      }
      const variants: Preview['variants'] = (Array.isArray(data.variants) ? data.variants : [])
        .map((v: { dimension?: string; options?: VariantOption[] }) => ({
          dimension: String(v.dimension ?? 'Option'),
          options: (v.options ?? []).filter((o) => o && o.label),
        }))
        .filter((v: { options: VariantOption[] }) => v.options.length > 0)
      const hasPrice = data.price != null && String(data.price).trim() !== ''
      const p: Preview = {
        title: data.title ?? null,
        brand: data.brand ?? null,
        price: hasPrice ? String(data.price) : null,
        currencyCode: data.currencyCode ?? null,
        image: Array.isArray(data.images) && data.images[0] ? data.images[0] : null,
        site: data.site ?? null,
        availability: data.availability ?? null,
        variants,
        partial: !!data.error || !hasPrice,
      }
      if (!p.title && !p.image && !hasPrice) {
        setPreviewError(data?.error ?? 'Nothing could be read from that page. You can still create the request by hand.')
        return
      }
      setPreview(p)
      // Pre-pick whatever the store itself had selected; staff change it to
      // match what the customer asked for.
      const initial: Record<string, string> = {}
      for (const v of variants) {
        const sel = v.options.find((o) => o.selected)
        if (sel) initial[v.dimension] = sel.label
      }
      setChosen(initial)
      // Fill the form from what was found, never over what staff typed.
      setItemName((cur) => cur || p.title || '')
      setImageUrl((cur) => cur || p.image || '')
    } catch {
      if (id === previewSeq.current) setPreviewError('Network problem while reading the link.')
    } finally {
      if (id === previewSeq.current) setPreviewing(false)
    }
  }

  useEffect(() => {
    if (autoPreview && initialLink) void fetchPreview(initialLink)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const variantText = Object.entries(chosen)
    .filter(([, label]) => label)
    .map(([dim, label]) => `${dim}: ${label}`)
    .join(', ')

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !busy && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [busy, onClose])

  useEffect(() => {
    if (customer) firstField.current?.focus()
  }, [customer])

  const customerChosen = picked[0]
  const quoteNum = Number(quote)
  const hasQuote = quote.trim() !== '' && Number.isFinite(quoteNum) && quoteNum > 0

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (busy) return
    setError(null)
    if (!customerChosen) return setError('Choose the customer this request is for.')
    if (!/^https?:\/\//i.test(link.trim())) return setError('Paste the full product link, starting with https://')
    if (quote.trim() !== '' && !hasQuote) return setError('Enter the price as a number above 0.')
    if (paid && !hasQuote) return setError('Enter the price before marking it as paid.')

    setBusy(true)
    try {
      const res = await fetch('/api/admin/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: customerChosen.id,
          link: link.trim(),
          itemName: itemName.trim() || undefined,
          quantity: Number(quantity) || 1,
          note: note.trim() || undefined,
          imageUrl: imageUrl.trim() || undefined,
          variant: variantText || undefined,
          quote: hasQuote ? quoteNum : undefined,
          payment: paid && hasQuote ? { amount: quoteNum, method, reference: reference.trim() || undefined } : undefined,
          messageId,
          notifyCustomer: notify,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data?.error ?? 'Could not create the request.')
        return
      }
      setCreated({
        id: data.request.id,
        displayId: data.request.displayId,
        status: data.request.status,
        customerName: data.customer?.name || customerChosen.name || customerChosen.email,
        paid: paid && hasQuote,
      })
      onCreated?.({ id: data.request.id, displayId: data.request.displayId })
    } catch {
      setError('Network problem. Nothing was created. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  const label = 'mb-1.5 block text-xs font-semibold text-ink/70'

  return (
    <div className="fixed inset-0 z-[120] flex items-end justify-center bg-ink/40 p-0 sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-labelledby="create-request-title">
      <div className="flex max-h-[94vh] w-full max-w-xl flex-col overflow-hidden rounded-t-3xl bg-card shadow-2xl sm:rounded-3xl">
        <div className="flex items-start justify-between gap-4 border-b border-ink/10 px-6 py-5">
          <div>
            <h2 id="create-request-title" className="font-display text-xl font-semibold text-ink">
              Create request for customer
            </h2>
            <p className="mt-1 text-sm text-ink/55">
              For links a customer sent you directly. It appears in their account, so it can be quoted, paid and tracked.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label="Close"
            className="flex-none rounded-full p-1.5 text-ink/50 hover:bg-ink/5 hover:text-ink disabled:opacity-40"
          >
            <X size={18} />
          </button>
        </div>

        {created ? (
          <div className="overflow-y-auto px-6 py-8 text-center">
            <CheckCircle2 size={44} className="mx-auto text-teal" strokeWidth={1.6} />
            <p className="mt-4 font-display text-xl text-ink">{created.displayId} created</p>
            <p className="mx-auto mt-2 max-w-sm text-sm text-ink/60">
              It is now on {created.customerName}&rsquo;s account.{' '}
              {created.paid
                ? 'Payment is recorded. Open the request and press Confirm to create the order, and tracking starts.'
                : created.status === 'quoted'
                  ? 'Record their payment on the request page, then Confirm to create the order.'
                  : 'Add the price on the request page, record the payment, then Confirm to create the order.'}
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-2">
              <Link
                href={`/admin/requests/${created.id}`}
                className="inline-flex items-center rounded-full bg-indigo px-5 py-2.5 text-sm font-semibold text-parchment transition-colors hover:bg-indigo-deep"
              >
                Open request
              </Link>
              <button
                type="button"
                onClick={onClose}
                className="rounded-full border border-ink/15 px-5 py-2.5 text-sm font-semibold text-ink/70 hover:bg-ink/5"
              >
                Done
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
            <div className="space-y-5 overflow-y-auto px-6 py-5">
              <div>
                <span className={label}>Customer</span>
                {customer ? (
                  <div className="rounded-xl border border-ink/10 bg-parchment/60 px-4 py-2.5 text-sm">
                    <span className="font-semibold">{customer.name || customer.email}</span>
                    {customer.handle && <span className="ml-1.5 text-ink/50">{customer.handle}</span>}
                    <div className="text-xs text-ink/55">{customer.email}</div>
                  </div>
                ) : (
                  <CustomerPicker picked={picked} onChange={(c) => setPicked(c.slice(-1))} />
                )}
              </div>

              <div>
                <label htmlFor="cr-link" className={label}>
                  Product link
                </label>
                <div className="flex gap-2">
                  <input
                    id="cr-link"
                    ref={firstField}
                    value={link}
                    onChange={(e) => {
                      setLink(e.target.value)
                      if (preview || previewError) {
                        previewSeq.current++
                        setPreview(null)
                        setPreviewError(null)
                        setChosen({})
                      }
                    }}
                    placeholder="https://…"
                    inputMode="url"
                    className={adminInputClass}
                  />
                  <button
                    type="button"
                    onClick={() => void fetchPreview()}
                    disabled={previewing || !link.trim()}
                    className="inline-flex flex-none items-center gap-1.5 rounded-xl border border-teal/40 bg-teal/5 px-3.5 text-sm font-semibold text-teal-deep transition-colors hover:bg-teal/10 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {previewing ? <Loader2 size={15} className="animate-spin" /> : <Eye size={15} />}
                    Preview
                  </button>
                </div>
                {previewing && <p className="mt-2 text-xs text-ink/55">Reading the page. Some stores take up to a minute. You can keep filling in the form.</p>}
                {previewError && <p className="mt-2 text-xs font-medium text-rose-700">{previewError}</p>}

                {preview?.internalPath && (
                  <p className="mt-2 rounded-xl bg-teal/5 px-3 py-2 text-xs text-teal-deep ring-1 ring-inset ring-teal/20">
                    This is one of our own stores&rsquo; products. It can be bought normally by the customer:{' '}
                    <Link href={preview.internalPath} target="_blank" className="font-semibold underline">
                      open it
                    </Link>
                    .
                  </p>
                )}

                {preview && !preview.internalPath && (
                  <div className="mt-3 rounded-2xl border border-ink/10 bg-parchment/50 p-3">
                    <div className="flex gap-3">
                      {preview.image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={preview.image} alt="" className="h-24 w-24 flex-none rounded-xl bg-white object-cover ring-1 ring-ink/10" />
                      ) : (
                        <div className="grid h-24 w-24 flex-none place-items-center rounded-xl bg-ink/5 text-[11px] text-ink/40">No photo</div>
                      )}
                      <div className="min-w-0 text-sm">
                        <p className="line-clamp-2 font-semibold text-ink">{preview.title ?? 'Title not found'}</p>
                        <p className="mt-0.5 text-xs text-ink/55">
                          {[preview.brand, preview.site].filter(Boolean).join(' · ')}
                        </p>
                        <p className="mt-1.5 text-sm text-ink">
                          {preview.price ? (
                            <>
                              <span className="font-semibold">
                                {preview.currencyCode ? `${preview.currencyCode} ` : ''}
                                {preview.price}
                              </span>{' '}
                              <span className="text-xs text-ink/50">store price</span>
                            </>
                          ) : (
                            <span className="text-xs text-ink/50">Price not found. Enter it below.</span>
                          )}
                        </p>
                        {preview.availability && <p className="mt-0.5 text-xs text-ink/55">{preview.availability}</p>}
                      </div>
                    </div>

                    {preview.variants.length > 0 && (
                      <div className="mt-3 space-y-3 border-t border-ink/10 pt-3">
                        <p className="text-xs font-semibold text-ink/70">Pick what the customer asked for</p>
                        {preview.variants.map((v) => (
                          <div key={v.dimension}>
                            <p className="mb-1.5 text-xs text-ink/55">{v.dimension}</p>
                            <div className="flex flex-wrap gap-1.5">
                              {v.options.map((o) => {
                                const active = chosen[v.dimension] === o.label
                                return (
                                  <button
                                    key={o.label}
                                    type="button"
                                    aria-pressed={active}
                                    onClick={() => setChosen((c) => ({ ...c, [v.dimension]: active ? '' : o.label }))}
                                    className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
                                      active ? 'border-indigo bg-indigo text-parchment' : 'border-ink/15 bg-card text-ink/75 hover:border-teal/50'
                                    } ${o.outOfStock ? 'line-through opacity-50' : ''}`}
                                    title={o.outOfStock ? 'Out of stock' : o.price ? `${o.price}` : undefined}
                                  >
                                    {o.label}
                                  </button>
                                )
                              })}
                            </div>
                          </div>
                        ))}
                        {variantText && <p className="text-xs text-teal-deep">Will be saved on the request: {variantText}</p>}
                      </div>
                    )}
                    {preview.partial && (
                      <p className="mt-3 text-xs text-ink/50">The store only gave part of the details. Check them before you quote.</p>
                    )}
                  </div>
                )}
              </div>

              <div className="grid gap-4 sm:grid-cols-[1fr_6rem]">
                <div>
                  <label htmlFor="cr-name" className={label}>
                    Item name <span className="font-normal text-ink/40">(shown on their order)</span>
                  </label>
                  <input id="cr-name" value={itemName} onChange={(e) => setItemName(e.target.value)} className={adminInputClass} placeholder="e.g. Nike Air Max 90, size 9" />
                </div>
                <div>
                  <label htmlFor="cr-qty" className={label}>
                    Quantity
                  </label>
                  <input id="cr-qty" value={quantity} onChange={(e) => setQuantity(e.target.value.replace(/\D/g, '').slice(0, 2))} inputMode="numeric" className={adminInputClass} />
                </div>
              </div>

              <div>
                <label htmlFor="cr-note" className={label}>
                  Note <span className="font-normal text-ink/40">(size, colour, anything agreed)</span>
                </label>
                <textarea id="cr-note" value={note} onChange={(e) => setNote(e.target.value)} rows={2} className={adminInputClass} />
              </div>

              <div>
                <label htmlFor="cr-img" className={label}>
                  Photo link <span className="font-normal text-ink/40">(optional, you can add one later)</span>
                </label>
                <input id="cr-img" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="https://…" className={adminInputClass} />
              </div>

              <div className="rounded-2xl border border-ink/10 bg-parchment/50 p-4">
                <label htmlFor="cr-quote" className={label}>
                  Price quoted to the customer, total in LKR <span className="font-normal text-ink/40">(optional)</span>
                </label>
                <input id="cr-quote" value={quote} onChange={(e) => setQuote(e.target.value.replace(/[^\d.]/g, ''))} inputMode="decimal" className={adminInputClass} placeholder="e.g. 18500" />

                <label className="mt-4 flex cursor-pointer items-start gap-2.5 text-sm text-ink">
                  <input type="checkbox" checked={paid} onChange={(e) => setPaid(e.target.checked)} className="mt-0.5 h-4 w-4 accent-teal" />
                  <span>
                    <span className="font-semibold">The customer has already paid</span>
                    <span className="block text-xs text-ink/55">Records the payment so you only need to press Confirm to create the order.</span>
                  </span>
                </label>

                {paid && (
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <div>
                      <label htmlFor="cr-method" className={label}>
                        Paid by
                      </label>
                      <select id="cr-method" value={method} onChange={(e) => setMethod(e.target.value)} className={adminInputClass}>
                        {PAYMENT_METHODS.map((m) => (
                          <option key={m}>{m}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label htmlFor="cr-ref" className={label}>
                        Reference <span className="font-normal text-ink/40">(optional)</span>
                      </label>
                      <input id="cr-ref" value={reference} onChange={(e) => setReference(e.target.value)} className={adminInputClass} placeholder="Slip or transaction no." />
                    </div>
                  </div>
                )}
              </div>

              <label className="flex cursor-pointer items-center gap-2.5 text-sm text-ink/80">
                <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} className="h-4 w-4 accent-teal" />
                Send the customer a message in their chat with the request number
              </label>

              {error && (
                <p role="alert" className="rounded-xl bg-rose-50 px-4 py-2.5 text-sm font-medium text-rose-700 ring-1 ring-inset ring-rose-200">
                  {error}
                </p>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-ink/10 bg-card px-6 py-4">
              <button
                type="button"
                onClick={onClose}
                disabled={busy}
                className="rounded-full px-4 py-2.5 text-sm font-semibold text-ink/60 hover:bg-ink/5 disabled:opacity-40"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={busy}
                className="inline-flex items-center gap-2 rounded-full bg-indigo px-5 py-2.5 text-sm font-semibold text-parchment transition-colors hover:bg-indigo-deep disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busy && <Loader2 size={15} className="animate-spin" />}
                Create request
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
