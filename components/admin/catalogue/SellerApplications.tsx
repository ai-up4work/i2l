// components/admin/catalogue/SellerApplications.tsx
//
// "Sell on Wishdrop" applications (from /stores/apply), at the top of
// Admin → Social Stores. Staff message the seller on WhatsApp, then
// create their store straight from the application (pre-filled) or
// decline it.
'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ChevronDown, ExternalLink, MessageCircle } from 'lucide-react'
import { panelClass } from '@/components/admin/seller/shared'

type Application = {
  id: string
  store_name: string
  contact_name: string
  email: string
  whatsapp: string
  instagram: string | null
  facebook: string | null
  website: string | null
  category: string | null
  location: string | null
  product_count: string | null
  message: string | null
  status: 'new' | 'contacted' | 'approved' | 'declined'
  seller_id: string | null
  created_at: string
}

const TABS = [
  ['new', 'New'],
  ['contacted', 'Contacted'],
  ['approved', 'Store created'],
  ['declined', 'Declined'],
] as const

function socialHref(value: string, base: string): string {
  if (/^https?:\/\//i.test(value)) return value
  if (/\.(com|in|lk|net|org)/i.test(value)) return `https://${value.replace(/^\/+/, '')}`
  return `${base}${value.replace(/^@/, '')}`
}

export function newStoreHref(a: Application): string {
  const qs = new URLSearchParams({
    application: a.id,
    name: a.store_name,
    contactName: a.contact_name,
    email: a.email,
    phone: a.whatsapp,
    ...(a.instagram ? { instagram: a.instagram } : {}),
    ...(a.facebook ? { facebook: a.facebook } : {}),
    ...(a.location ? { location: a.location } : {}),
  })
  return `/admin/catalogues/stores/new?${qs.toString()}`
}

export default function SellerApplications() {
  const [apps, setApps] = useState<Application[] | null>(null)
  const [needsMigration, setNeedsMigration] = useState(false)
  const [tab, setTab] = useState<Application['status']>('new')
  const [open, setOpen] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    try {
      const res = await fetch('/api/admin/catalogues/applications')
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? 'Could not load applications')
      setApps(body.applications)
      setNeedsMigration(Boolean(body.needsMigration))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load applications')
      setApps([])
    }
  }
  useEffect(() => {
    void load()
  }, [])

  async function setStatus(id: string, status: Application['status']) {
    setApps((list) => list?.map((a) => (a.id === id ? { ...a, status } : a)) ?? null)
    const res = await fetch('/api/admin/catalogues/applications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status }),
    })
    if (!res.ok) {
      setError('Could not update the application.')
      void load()
    }
  }

  if (needsMigration) {
    return (
      <p className="mt-5 rounded-xl border border-gold/40 bg-gold/10 px-4 py-3 text-sm text-ink">
        Seller applications from the &ldquo;Sell on Wishdrop&rdquo; page are saved once you run{' '}
        <code className="font-mono text-xs">data/wishdrop-seller-applications.sql</code> in Supabase.
      </p>
    )
  }
  if (!apps || apps.length === 0) return null

  const counts = Object.fromEntries(TABS.map(([k]) => [k, apps.filter((a) => a.status === k).length])) as Record<string, number>
  const shown = apps.filter((a) => a.status === tab)

  return (
    <section className={`mt-5 p-5 ${panelClass}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold text-ink">Seller applications</h2>
          <p className="text-sm text-ink/55">From the Sell on Wishdrop page. Message them, then create their store from here.</p>
        </div>
        <div className="flex gap-1 rounded-xl border border-ink/10 bg-parchment/60 p-1 text-xs font-semibold">
          {TABS.map(([key, label]) => (
            <button key={key} onClick={() => setTab(key)} className={`rounded-lg px-3 py-1.5 ${tab === key ? 'bg-ink text-white' : 'text-ink/55 hover:text-ink'}`}>
              {label}
              {counts[key] > 0 && <span className={`ml-1.5 ${tab === key ? 'text-white/70' : key === 'new' ? 'text-red-600' : 'text-ink/40'}`}>{counts[key]}</span>}
            </button>
          ))}
        </div>
      </div>

      {shown.length === 0 ? (
        <p className="mt-4 text-sm text-ink/50">Nothing here.</p>
      ) : (
        <ul className="mt-4 divide-y divide-ink/10 rounded-xl border border-ink/10">
          {shown.map((a) => {
            const expanded = open === a.id
            const wa = a.whatsapp.replace(/\D/g, '')
            return (
              <li key={a.id} className="px-4 py-3">
                <div className="flex flex-wrap items-center gap-3">
                  <button onClick={() => setOpen(expanded ? null : a.id)} className="flex min-w-0 flex-1 items-center gap-2 text-left" aria-expanded={expanded}>
                    <ChevronDown size={15} className={`flex-none text-ink/40 transition-transform ${expanded ? 'rotate-180' : ''}`} />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-ink">{a.store_name}</span>
                      <span className="block truncate text-xs text-ink/50">
                        {a.contact_name}
                        {a.category ? `, ${a.category}` : ''} · {new Date(a.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                      </span>
                    </span>
                  </button>
                  {wa && (
                    <a
                      href={`https://wa.me/${wa}?text=${encodeURIComponent(`Hi ${a.contact_name.split(' ')[0]}, this is Wishdrop. Thanks for applying to sell ${a.store_name} on Wishdrop!`)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => a.status === 'new' && void setStatus(a.id, 'contacted')}
                      className="flex items-center gap-1.5 rounded-lg border border-ink/15 px-3 py-1.5 text-xs font-semibold text-ink/70 hover:text-ink"
                    >
                      <MessageCircle size={13} /> WhatsApp
                    </a>
                  )}
                  {a.status !== 'approved' && a.status !== 'declined' && (
                    <>
                      <Link href={newStoreHref(a)} className="rounded-lg bg-teal-deep px-3 py-1.5 text-xs font-semibold text-parchment hover:bg-teal">
                        Create store
                      </Link>
                      <button onClick={() => setStatus(a.id, 'declined')} className="rounded-lg px-2 py-1.5 text-xs font-semibold text-ink/45 hover:text-red-700">
                        Decline
                      </button>
                    </>
                  )}
                  {a.status === 'declined' && (
                    <button onClick={() => setStatus(a.id, 'new')} className="rounded-lg px-2 py-1.5 text-xs font-semibold text-ink/55 hover:text-ink">
                      Move back to new
                    </button>
                  )}
                </div>

                {expanded && (
                  <dl className="mt-3 grid gap-x-6 gap-y-2 pl-6 text-sm sm:grid-cols-2">
                    <Row term="Email" value={<a href={`mailto:${a.email}`} className="text-teal-deep underline">{a.email}</a>} />
                    <Row term="WhatsApp" value={a.whatsapp} />
                    {a.instagram && <Row term="Instagram" value={<ExtLink href={socialHref(a.instagram, 'https://instagram.com/')} text={a.instagram} />} />}
                    {a.facebook && <Row term="Facebook" value={<ExtLink href={socialHref(a.facebook, 'https://facebook.com/')} text={a.facebook} />} />}
                    {a.website && <Row term="Website" value={<ExtLink href={socialHref(a.website, 'https://')} text={a.website} />} />}
                    {a.location && <Row term="Based in" value={a.location} />}
                    {a.product_count && <Row term="Products" value={a.product_count} />}
                    {a.message && <Row term="Message" value={a.message} wide />}
                  </dl>
                )}
              </li>
            )
          })}
        </ul>
      )}
      {error && <p className="mt-3 text-sm font-semibold text-red-700">{error}</p>}
    </section>
  )
}

function Row({ term, value, wide }: { term: string; value: React.ReactNode; wide?: boolean }) {
  return (
    <div className={wide ? 'sm:col-span-2' : ''}>
      <dt className="text-xs font-semibold text-ink/45">{term}</dt>
      <dd className="whitespace-pre-line break-words text-ink/80">{value}</dd>
    </div>
  )
}

function ExtLink({ href, text }: { href: string; text: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-teal-deep underline">
      {text} <ExternalLink size={11} />
    </a>
  )
}
