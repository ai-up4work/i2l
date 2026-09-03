// app/auth/login/page.tsx
'use client'

import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import BrandMark from '@/components/shared/BrandMark'

function LoginForm() {
  const router = useRouter()
  const params = useSearchParams()
  const redirect = params.get('redirect') || '/account'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      // TODO: replace with real auth call, e.g.:
      // const res = await fetch('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) })
      // if (!res.ok) throw new Error('Invalid email or password')
      router.push(redirect)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-parchment px-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex justify-center">
          <BrandMark />
        </div>

        <div className="rounded-2xl border border-ink/10 bg-card p-8 shadow-sm">
          <h1 className="font-display text-2xl font-bold text-ink">Log in</h1>
          <p className="mt-1 text-sm text-ink/55">
            {redirect.startsWith('/account/requests')
              ? 'Log in to continue your request.'
              : 'Welcome back.'}
          </p>

          <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
            <label className="flex flex-col gap-1.5 text-sm font-semibold text-ink">
              Email
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="rounded-xl border border-ink/15 bg-parchment px-3.5 py-2.5 text-sm font-normal text-ink outline-none transition-colors focus:border-teal"
              />
            </label>

            <label className="flex flex-col gap-1.5 text-sm font-semibold text-ink">
              Password
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="rounded-xl border border-ink/15 bg-parchment px-3.5 py-2.5 text-sm font-normal text-ink outline-none transition-colors focus:border-teal"
              />
            </label>

            {error && <p className="text-sm font-medium text-red-600">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="mt-2 rounded-xl bg-teal px-4 py-2.5 text-sm font-bold text-white transition-colors duration-200 hover:bg-teal-deep disabled:opacity-60"
            >
              {loading ? 'Logging in…' : 'Log in'}
            </button>
          </form>

          <div className="mt-5 flex items-center justify-between text-xs font-semibold">
            <Link href="/forgot-password" className="text-teal-deep hover:text-teal">
              Forgot password?
            </Link>
            <Link
              href={`/signup?redirect=${encodeURIComponent(redirect)}`}
              className="text-teal-deep hover:text-teal"
            >
              Create account
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  )
}