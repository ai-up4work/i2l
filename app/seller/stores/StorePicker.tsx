'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowRight, Search, ShieldCheck } from 'lucide-react'
import { imageThumb } from '@/lib/media'

export type PickerStore = { id: string; name: string; slug: string; logo: string | null; live: boolean; custom: boolean; social: boolean }

export default function StorePicker({ stores, staffName }: { stores: PickerStore[]; staffName: string }) {
  const router = useRouter()
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase()
    return t ? stores.filter((s) => s.name.toLowerCase().includes(t) || s.slug.includes(t)) : stores
  }, [stores, q])

  async function open(store: PickerStore) {
    setBusy(store.id)
    setError(null)
    const res = await fetch('/api/seller/staff-view', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sellerId: store.id }),
    })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) {
      setBusy(null)
      setError(body.error ?? 'Could not open that store.')
      return
    }
    router.push(body.home ?? '/seller')
    router.refresh()
  }

  return (
    <main className="min-h-screen bg-parchment px-4 py-10 sm:px-8">
      <div className="mx-auto max-w-2xl">
        <p className="flex items-center gap-2 font-body text-xs font-semibold uppercase tracking-wider text-teal-deep">
          <ShieldCheck size={14} aria-hidden /> Staff view
        </p>
        <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight text-ink">Open a seller portal</h1>
        <p className="mt-1 font-body text-sm text-ink/60">
          Signed in as {staffName}. You&rsquo;ll see the store&rsquo;s portal as the seller does, plus staff-only settings such as the margin.
        </p>

        <label className="mt-6 flex items-center gap-2 rounded-full border border-ink/10 bg-card px-4 py-2.5">
          <Search size={15} className="text-ink/40" aria-hidden />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search stores"
            className="w-full bg-transparent font-body text-sm text-ink outline-none placeholder:text-ink/40"
          />
        </label>

        {error && <p className="mt-4 rounded-xl bg-red-50 px-4 py-2.5 font-body text-sm text-red-700">{error}</p>}

        <ul className="mt-4 flex flex-col gap-2">
          {shown.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => open(s)}
                disabled={busy !== null}
                className="flex w-full items-center gap-3 rounded-2xl border border-ink/10 bg-card px-4 py-3 text-left transition-colors hover:border-teal/40 disabled:opacity-60"
              >
                <span className="grid h-10 w-10 flex-none place-items-center overflow-hidden rounded-full bg-parchment ring-1 ring-ink/10">
                  {s.logo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={imageThumb(s.logo, 120)} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <span className="font-display text-lg font-semibold text-indigo">{s.name.charAt(0)}</span>
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-body text-sm font-semibold text-ink">{s.name}</span>
                  <span className="block font-body text-xs text-ink/55">
                    {s.custom ? 'Custom store' : 'Social store'} · {s.live ? 'Live' : 'Hidden'}
                  </span>
                </span>
                <ArrowRight size={16} className="flex-none text-ink/40" aria-hidden />
              </button>
            </li>
          ))}
          {shown.length === 0 && <li className="py-10 text-center font-body text-sm text-ink/50">No stores match.</li>}
        </ul>

        <Link href="/admin" className="mt-8 inline-block font-body text-sm font-semibold text-teal-deep hover:underline">
          ← Back to admin
        </Link>
      </div>
    </main>
  )
}
