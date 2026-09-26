// app/admin/(protected)/(manager)/broadcasts/page.tsx
//
// Send one notification to all customers or a segment. Every broadcast
// lands in each recipient's in-app notification bell; customers who turned
// notifications on also get a push on their phone/computer.
//
// Manager and Super Admin only (enforced again by the API).
'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Loader2, Megaphone, Search, Send, X } from 'lucide-react'
import { useCurrentStaff } from '@/hooks/useCurrentStaff'
import { AUDIENCE_OPTIONS, BROADCAST_LIMITS, type Audience, type BroadcastKind } from '@/lib/push/audience'
import { PWA_ICONS, SITE_URL } from '@/lib/seo'

type AudienceType = Audience['type']

interface Customer {
  id: string
  name: string
  email: string
  phone: string | null
  handle?: string | null
  pushEnabled: boolean
}

interface BroadcastRow {
  id: string
  kind: BroadcastKind
  title: string
  body: string
  url: string
  audience_label: string
  created_by_name: string | null
  status: 'sending' | 'sent' | 'failed'
  recipient_count: number
  device_count: number
  push_sent: number
  push_failed: number
  error: string | null
  created_at: string
}

const KIND_COPY: Record<BroadcastKind, { label: string; hint: string }> = {
  announcement: {
    label: 'Announcement',
    hint: 'Service news — delays, closures, new stores. Goes to everyone in the audience.',
  },
  offer: {
    label: 'Offer',
    hint: 'Deals and discount codes. Skips customers who turned offers off.',
  },
}

const SITE_HOST = SITE_URL.replace(/^https?:\/\//, '')
const nf = new Intl.NumberFormat('en-LK')
const df = new Intl.DateTimeFormat('en-LK', { dateStyle: 'medium', timeStyle: 'short' })

const inputClass =
  'w-full rounded-xl border border-ink/15 bg-card px-4 py-2.5 text-sm text-ink placeholder:text-ink/35 transition-colors focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal/20'

export default function BroadcastsPage() {
  const { staff, loading: staffLoading } = useCurrentStaff()
  const allowed = staff?.role === 'manager' || staff?.role === 'super_admin'

  const [kind, setKind] = useState<BroadcastKind>('announcement')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [url, setUrl] = useState('/')
  const [audienceType, setAudienceType] = useState<AudienceType>('all')
  const [picked, setPicked] = useState<Customer[]>([])

  const [reach, setReach] = useState<{ recipients: number; withPush: number } | null>(null)
  const [reachLoading, setReachLoading] = useState(false)

  const [confirming, setConfirming] = useState(false)
  const [sending, setSending] = useState<'test' | 'send' | null>(null)
  const [notice, setNotice] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)

  const [history, setHistory] = useState<BroadcastRow[]>([])
  const [pushConfigured, setPushConfigured] = useState(true)

  const audience: Audience = useMemo(
    () =>
      audienceType === 'customers'
        ? { type: 'customers', userIds: picked.map((c) => c.id) }
        : ({ type: audienceType } as Audience),
    [audienceType, picked],
  )

  const loadHistory = useCallback(async () => {
    const res = await fetch('/api/admin/push/broadcast')
    if (!res.ok) return
    const data = await res.json()
    setHistory(data.broadcasts ?? [])
    setPushConfigured(Boolean(data.pushConfigured))
  }, [])

  useEffect(() => {
    if (allowed) loadHistory()
  }, [allowed, loadHistory])

  // Live audience count, debounced.
  useEffect(() => {
    if (!allowed) return
    if (audience.type === 'customers' && audience.userIds.length === 0) {
      setReach({ recipients: 0, withPush: 0 })
      return
    }
    setReachLoading(true)
    const t = setTimeout(async () => {
      try {
        const res = await fetch('/api/admin/push/broadcast', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mode: 'preview', kind, audience }),
        })
        const data = await res.json()
        setReach(res.ok ? { recipients: data.recipients, withPush: data.withPush } : null)
      } catch {
        setReach(null)
      } finally {
        setReachLoading(false)
      }
    }, 350)
    return () => clearTimeout(t)
  }, [allowed, kind, audience])

  // Any edit cancels a pending confirmation, so what's confirmed is what's sent.
  useEffect(() => setConfirming(false), [kind, title, body, url, audience])

  const draftError = !title.trim()
    ? 'Add a title.'
    : !body.trim()
      ? 'Add a message.'
      : !url.startsWith('/') || url.startsWith('//')
        ? 'The link must start with /'
        : audienceType === 'customers' && picked.length === 0
          ? 'Pick at least one customer.'
          : null

  async function submit(mode: 'test' | 'send') {
    setSending(mode)
    setNotice(null)
    try {
      const res = await fetch('/api/admin/push/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode, kind, title: title.trim(), body: body.trim(), url: url.trim() || '/', audience }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Something went wrong.')
      if (mode === 'test') {
        setNotice({
          tone: 'ok',
          text: `Test sent to ${data.sent} of your device${data.devices === 1 ? '' : 's'}. Check your phone or computer.`,
        })
      } else {
        setNotice({
          tone: 'ok',
          text: `Sent to ${nf.format(data.recipients)} customers. ${nf.format(data.sent)} push notification${data.sent === 1 ? '' : 's'} delivered${data.failed ? `, ${nf.format(data.failed)} failed` : ''}.`,
        })
        setTitle('')
        setBody('')
        setUrl('/')
        setPicked([])
        setConfirming(false)
        loadHistory()
      }
    } catch (err) {
      setNotice({ tone: 'error', text: err instanceof Error ? err.message : 'Something went wrong.' })
    } finally {
      setSending(null)
    }
  }

  if (staffLoading) {
    return (
      <div className="flex h-full items-center justify-center bg-parchment">
        <Loader2 className="animate-spin text-ink/30" />
      </div>
    )
  }

  if (!allowed) {
    return (
      <div className="h-full overflow-y-auto bg-parchment font-body text-ink">
        <div className="mx-auto max-w-2xl px-6 pt-16 lg:px-10">
          <h1 className="font-display text-3xl">Broadcasts</h1>
          <p className="mt-2 text-sm text-ink/60">Only managers can send broadcasts to customers.</p>
        </div>
      </div>
    )
  }

  const reachText = reachLoading
    ? 'Counting…'
    : reach
      ? `${nf.format(reach.recipients)} customer${reach.recipients === 1 ? '' : 's'} in the app, ${nf.format(reach.withPush)} also on their phone or computer`
      : 'Couldn’t count this audience.'

  return (
    <div className="h-full overflow-y-auto bg-parchment font-body text-ink">
      <div className="mx-auto max-w-8xl px-6 pb-24 pt-10 lg:px-10">
        <div className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-full bg-indigo text-parchment">
            <Megaphone size={18} />
          </span>
          <div>
            <h1 className="font-display text-3xl leading-tight">Broadcasts</h1>
            <p className="text-sm text-ink/60">
              One message to all customers or a group. It appears in their notification bell, and as a push on
              devices with notifications on.
            </p>
          </div>
        </div>

        {!pushConfigured && (
          <p className="mt-6 rounded-xl border border-gold/40 bg-gold/10 px-4 py-3 text-sm text-ink">
            Push isn&rsquo;t set up yet, so nothing can be sent. Add the VAPID keys on Vercel — see
            PUSH_NOTIFICATIONS.md.
          </p>
        )}

        <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
          {/* ── Compose ── */}
          <div className="space-y-6 rounded-2xl border border-ink/10 bg-card p-6 sm:p-8">
            <fieldset>
              <legend className="text-sm font-semibold">Type</legend>
              <div className="mt-2 inline-flex rounded-xl border border-ink/15 p-1">
                {(Object.keys(KIND_COPY) as BroadcastKind[]).map((k) => (
                  <button
                    key={k}
                    type="button"
                    aria-pressed={kind === k}
                    onClick={() => setKind(k)}
                    className={`rounded-lg px-4 py-1.5 text-sm font-semibold transition-colors ${
                      kind === k ? 'bg-indigo text-parchment' : 'text-ink/60 hover:text-ink'
                    }`}
                  >
                    {KIND_COPY[k].label}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-xs text-ink/55">{KIND_COPY[kind].hint}</p>
            </fieldset>

            <Field label="Title" count={title.length} max={BROADCAST_LIMITS.title}>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value.slice(0, BROADCAST_LIMITS.title))}
                placeholder="New stores just landed"
                className={inputClass}
              />
            </Field>

            <Field label="Message" count={body.length} max={BROADCAST_LIMITS.body}>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value.slice(0, BROADCAST_LIMITS.body))}
                rows={3}
                placeholder="Shop Nykaa and Ajio with delivery to Sri Lanka."
                className={`${inputClass} resize-none`}
              />
            </Field>

            <Field label="Opens" hint="The WishDrop page a tap opens, e.g. /deals or /stores/myntra">
              <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="/" className={inputClass} />
            </Field>

            <fieldset>
              <legend className="text-sm font-semibold">Send to</legend>
              <div className="mt-2 space-y-1.5">
                {AUDIENCE_OPTIONS.map((o) => (
                  <AudienceRadio
                    key={o.type}
                    checked={audienceType === o.type}
                    onSelect={() => setAudienceType(o.type)}
                    label={o.label}
                    hint={o.hint}
                  />
                ))}
                <AudienceRadio
                  checked={audienceType === 'customers'}
                  onSelect={() => setAudienceType('customers')}
                  label="Specific customers"
                  hint="Search by name, @handle, email, phone or order number"
                />
              </div>
              {audienceType === 'customers' && (
                <CustomerPicker picked={picked} onChange={setPicked} />
              )}
            </fieldset>

            <div className="rounded-xl bg-parchment px-4 py-3 text-sm">
              <span className="font-semibold">Reach: </span>
              <span className="text-ink/70">{reachText}</span>
            </div>

            {notice && (
              <p
                role="status"
                className={`rounded-xl px-4 py-3 text-sm font-semibold ${
                  notice.tone === 'ok' ? 'bg-teal/10 text-teal-deep' : 'bg-red-50 text-red-700'
                }`}
              >
                {notice.text}
              </p>
            )}

            {confirming ? (
              <div className="rounded-xl border border-indigo/30 bg-indigo/[0.04] p-4">
                <p className="text-sm">
                  Send <strong>&ldquo;{title.trim()}&rdquo;</strong> to{' '}
                  <strong>{reach ? nf.format(reach.recipients) : '—'} customers</strong>? This can&rsquo;t be undone.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => submit('send')}
                    disabled={sending !== null}
                    className="inline-flex items-center gap-2 rounded-xl bg-indigo px-5 py-2.5 text-sm font-semibold text-parchment transition-colors hover:bg-indigo-deep disabled:opacity-60"
                  >
                    {sending === 'send' ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
                    {sending === 'send' ? 'Sending…' : 'Send now'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirming(false)}
                    disabled={sending !== null}
                    className="rounded-xl px-4 py-2.5 text-sm font-semibold text-ink/60 hover:text-ink"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => setConfirming(true)}
                  disabled={Boolean(draftError) || !reach?.recipients || !pushConfigured}
                  className="rounded-xl bg-teal-deep px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-indigo-deep disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Review and send
                </button>
                <button
                  type="button"
                  onClick={() => submit('test')}
                  disabled={Boolean(draftError) || sending !== null || !pushConfigured}
                  className="rounded-xl border border-ink/15 px-4 py-2.5 text-sm font-semibold text-ink transition-colors hover:border-teal/40 hover:bg-teal/5 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {sending === 'test' ? 'Sending test…' : 'Send test to my devices'}
                </button>
                {draftError && <span className="text-xs text-ink/50">{draftError}</span>}
              </div>
            )}
          </div>

          {/* ── Preview ── */}
          <aside className="lg:sticky lg:top-6 lg:self-start">
            <p className="text-sm font-semibold">Preview</p>
            <div className="mt-3 rounded-[28px] bg-indigo-deep p-4 pb-10">
              <p className="pb-6 pt-2 text-center font-body text-4xl font-light tracking-tight text-parchment/90">
                9:41
              </p>
              <div className="rounded-2xl bg-parchment/90 p-3 shadow-sm backdrop-blur">
                <div className="flex items-start gap-2.5">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={PWA_ICONS.icon192} alt="" className="size-9 flex-none rounded-lg" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="truncate text-[13px] font-semibold text-ink">{title.trim() || 'Your title'}</p>
                      <span className="flex-none text-[11px] text-ink/45">now</span>
                    </div>
                    <p className="mt-0.5 line-clamp-4 text-[13px] leading-snug text-ink/75">
                      {body.trim() || 'Your message appears here.'}
                    </p>
                  </div>
                </div>
              </div>
            </div>
            <p className="mt-3 text-xs leading-relaxed text-ink/50">
              Phones cut long text short, so put the important part first. A tap opens{' '}
              <span className="font-semibold text-ink/70">{SITE_HOST}{url || '/'}</span>.
            </p>
          </aside>
        </div>

        {/* ── History ── */}
        <h2 className="mt-14 font-display text-2xl">Sent</h2>
        {history.length === 0 ? (
          <p className="mt-3 text-sm text-ink/55">Nothing sent yet. Broadcasts you send show up here.</p>
        ) : (
          <div className="mt-4 overflow-x-auto rounded-2xl border border-ink/10 bg-card">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="whitespace-nowrap border-b border-ink/10 text-xs text-ink/50">
                <tr>
                  <th className="px-5 py-3 font-semibold">Sent</th>
                  <th className="px-5 py-3 font-semibold">Message</th>
                  <th className="px-5 py-3 font-semibold">Audience</th>
                  <th className="px-5 py-3 text-right font-semibold">In app</th>
                  <th className="px-5 py-3 text-right font-semibold">Pushes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/5">
                {history.map((b) => (
                  <tr key={b.id} className="align-top">
                    <td className="whitespace-nowrap px-5 py-4 text-ink/60">
                      {df.format(new Date(b.created_at))}
                      {b.created_by_name && <div className="text-xs text-ink/45">{b.created_by_name}</div>}
                    </td>
                    <td className="px-5 py-4">
                      <div className="font-semibold">
                        {b.title}
                        {b.kind === 'offer' && (
                          <span className="ml-2 rounded-full bg-gold/15 px-2 py-0.5 text-[11px] font-semibold text-gold-deep">
                            Offer
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 line-clamp-2 max-w-md text-ink/60">{b.body}</div>
                      {b.status === 'failed' && (
                        <div className="mt-1 text-xs font-semibold text-red-600">Failed: {b.error}</div>
                      )}
                      {b.status === 'sending' && <div className="mt-1 text-xs text-ink/50">Sending…</div>}
                    </td>
                    <td className="px-5 py-4 text-ink/70">{b.audience_label}</td>
                    <td className="px-5 py-4 text-right tabular-nums">{nf.format(b.recipient_count)}</td>
                    <td className="px-5 py-4 text-right tabular-nums">
                      {nf.format(b.push_sent)}
                      {b.push_failed > 0 && <div className="text-xs text-ink/45">{nf.format(b.push_failed)} failed</div>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

function Field({
  label,
  hint,
  count,
  max,
  children,
}: {
  label: string
  hint?: string
  count?: number
  max?: number
  children: React.ReactNode
}) {
  return (
    <label className="block">
      <span className="flex items-baseline justify-between text-sm font-semibold">
        {label}
        {max !== undefined && (
          <span className={`text-xs font-medium tabular-nums ${count! >= max ? 'text-gold-deep' : 'text-ink/40'}`}>
            {count}/{max}
          </span>
        )}
      </span>
      <div className="mt-2">{children}</div>
      {hint && <span className="mt-1.5 block text-xs text-ink/50">{hint}</span>}
    </label>
  )
}

function AudienceRadio({
  checked,
  onSelect,
  label,
  hint,
}: {
  checked: boolean
  onSelect: () => void
  label: string
  hint: string
}) {
  return (
    <label
      className={`flex cursor-pointer items-start gap-3 rounded-xl border px-4 py-3 transition-colors ${
        checked ? 'border-teal bg-teal/[0.05]' : 'border-ink/10 hover:border-ink/25'
      }`}
    >
      <input type="radio" name="audience" checked={checked} onChange={onSelect} className="mt-1 accent-teal-deep" />
      <span>
        <span className="block text-sm font-semibold">{label}</span>
        <span className="block text-xs text-ink/55">{hint}</span>
      </span>
    </label>
  )
}

function CustomerPicker({ picked, onChange }: { picked: Customer[]; onChange: (c: Customer[]) => void }) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<Customer[]>([])
  const [loading, setLoading] = useState(false)
  const seq = useRef(0)

  useEffect(() => {
    const term = q.trim()
    if (term.length < 2) {
      setResults([])
      return
    }
    const id = ++seq.current
    setLoading(true)
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/admin/push/customers?q=${encodeURIComponent(term)}`)
        const data = await res.json()
        if (id === seq.current) setResults(res.ok ? data.customers : [])
      } finally {
        if (id === seq.current) setLoading(false)
      }
    }, 300)
    return () => clearTimeout(t)
  }, [q])

  const pickedIds = new Set(picked.map((c) => c.id))

  return (
    <div className="mt-3 rounded-xl border border-ink/10 p-3">
      {picked.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {picked.map((c) => (
            <span key={c.id} className="inline-flex items-center gap-1 rounded-full bg-indigo/[0.07] py-1 pl-3 pr-1 text-xs font-semibold">
              {c.name || c.email}
              <button
                type="button"
                aria-label={`Remove ${c.name || c.email}`}
                onClick={() => onChange(picked.filter((p) => p.id !== c.id))}
                className="rounded-full p-0.5 text-ink/45 hover:bg-ink/10 hover:text-ink"
              >
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="relative">
        <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink/35" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Name, @handle, email, phone or WD-10423"
          className={`${inputClass} pl-9`}
        />
        {loading && <Loader2 size={15} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-ink/35" />}
      </div>
      {results.length > 0 && (
        <ul className="mt-2 divide-y divide-ink/5">
          {results.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-3 py-2">
              <div className="min-w-0 text-sm">
                <div className="truncate font-semibold">
                  {c.name || '(no name)'}
                  {c.handle && <span className="ml-1.5 font-normal text-ink/50">{c.handle}</span>}
                </div>
                <div className="truncate text-xs text-ink/55">
                  {c.email}
                  {c.phone ? `, ${c.phone}` : ''}
                  {c.pushEnabled ? '' : ' (in-app only)'}
                </div>
              </div>
              <button
                type="button"
                disabled={pickedIds.has(c.id)}
                onClick={() => onChange([...picked, c])}
                className="flex-none rounded-lg border border-ink/15 px-3 py-1 text-xs font-semibold transition-colors hover:border-teal/40 hover:bg-teal/5 disabled:opacity-40"
              >
                {pickedIds.has(c.id) ? 'Added' : 'Add'}
              </button>
            </li>
          ))}
        </ul>
      )}
      {q.trim().length >= 2 && !loading && results.length === 0 && (
        <p className="mt-2 text-xs text-ink/50">No customers match.</p>
      )}
    </div>
  )
}
