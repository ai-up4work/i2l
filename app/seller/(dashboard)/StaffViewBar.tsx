// app/seller/(dashboard)/StaffViewBar.tsx
//
// Shown across the seller portal when a Super Admin / Manager opened a
// store's portal with their own login (lib/supabase/seller-auth.ts).
'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { ShieldCheck } from 'lucide-react'

export default function StaffViewBar({ storeName, staffName }: { storeName: string; staffName: string }) {
  const router = useRouter()
  const [leaving, setLeaving] = useState(false)

  async function leave() {
    setLeaving(true)
    await fetch('/api/seller/staff-view', { method: 'DELETE' }).catch(() => null)
    router.push('/admin')
  }

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-indigo/20 bg-indigo px-4 py-2 font-body text-xs text-parchment sm:px-8">
      <ShieldCheck size={14} className="flex-none text-gold" aria-hidden />
      <span className="min-w-0">
        <span className="font-semibold">Staff view</span> of {storeName} as {staffName}. Staff-only settings are shown.
      </span>
      <span className="ml-auto flex gap-3">
        <Link href="/seller/stores" className="font-semibold text-parchment/80 underline-offset-2 hover:underline">
          Switch store
        </Link>
        <button type="button" onClick={leave} disabled={leaving} className="font-semibold text-parchment/80 underline-offset-2 hover:underline">
          {leaving ? 'Leaving…' : 'Back to admin'}
        </button>
      </span>
    </div>
  )
}
