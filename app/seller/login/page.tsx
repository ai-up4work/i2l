// app/seller/login/page.tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'

export default function SellerLoginPage() {
  const router = useRouter()
  const { signIn } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const { error: signInError } = await signIn(email, password)
    setLoading(false)
    if (signInError) {
      setError(signInError)
      return
    }
    // The (dashboard) layout checks owner_user_id server-side on the next
    // request and bounces back here if this login isn't actually linked to
    // a seller — router.refresh() forces that check to run immediately
    // instead of showing stale (logged-out) content for a beat.
    router.push('/seller/products')
    router.refresh()
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-parchment px-6">
      <div className="w-full max-w-sm rounded-2xl border border-ink/10 bg-card p-8 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink/40">WishDrop</p>
        <h1 className="mt-1 font-display text-2xl font-bold text-ink">Seller login</h1>
        <p className="mt-1 text-sm text-ink/55">
          Use the email and temporary password your WishDrop contact sent you.
        </p>

        <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-3">
          <input
            type="email"
            required
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="rounded-xl border border-ink/15 px-3.5 py-2.5 text-sm outline-none focus:border-teal"
          />
          <input
            type="password"
            required
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="rounded-xl border border-ink/15 px-3.5 py-2.5 text-sm outline-none focus:border-teal"
          />
          {error && <p className="text-sm font-medium text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="mt-2 rounded-xl bg-teal px-4 py-2.5 text-sm font-bold text-white hover:bg-teal-deep disabled:opacity-60"
          >
            {loading ? 'Logging in…' : 'Log in'}
          </button>
        </form>
      </div>
    </div>
  )
}