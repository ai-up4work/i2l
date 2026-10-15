// components/admin/CustomerPicker.tsx
//
// Search customers (name, @handle, email, phone or order number) and pick
// one or more. Same search as Broadcasts (/api/admin/push/customers,
// Manager / Super Admin). Used by Admin → Coupons.
'use client'

import { useEffect, useRef, useState } from 'react'
import { Loader2, Search, X } from 'lucide-react'

export type PickedCustomer = {
  id: string
  name: string
  email: string
  phone: string | null
  handle?: string | null
}

export const adminInputClass =
  'w-full rounded-xl border border-ink/15 bg-card px-4 py-2.5 text-sm text-ink placeholder:text-ink/35 transition-colors focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal/20'

export default function CustomerPicker({
  picked,
  onChange,
}: {
  picked: PickedCustomer[]
  onChange: (c: PickedCustomer[]) => void
}) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<PickedCustomer[]>([])
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
    <div className="rounded-xl border border-ink/10 p-3">
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
          className={`${adminInputClass} pl-9`}
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
      {q.trim().length >= 2 && !loading && results.length === 0 && <p className="mt-2 text-xs text-ink/50">No customers match.</p>}
    </div>
  )
}
