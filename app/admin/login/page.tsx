// app/admin/login/page.tsx
//
// Staff sign-in for the Wishdrop console. Signs in with Supabase, then
// confirms via /api/admin/auth/me that the session belongs to an active
// staff_accounts row before letting them in — a valid password for a
// customer account isn't enough. On success, goes to ?redirect (set by
// middleware when a signed-out person opened a console page) or the
// dashboard.
//
// The left side shows the one thing every staff member works on: an
// order's journey from India to a door in Sri Lanka.
'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Eye, EyeOff, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import AirmailStripe from '@/components/shared/AirmailStripe'

const STAGES = ['Ordered', 'Bought', 'Quality check', 'Shipped', 'Delivered']

function OrderRoute() {
  return (
    <div aria-hidden="true" className="relative w-full max-w-md">
      <svg viewBox="0 0 400 210" className="w-full">
        {/* The route: India (left) to Sri Lanka (right) */}
        <path d="M30 160 C 110 20, 290 20, 370 150" fill="none" stroke="rgba(251,246,236,.25)" strokeWidth="2" strokeDasharray="5 7" strokeLinecap="round" />
        <path
          d="M30 160 C 110 20, 290 20, 370 150"
          fill="none"
          stroke="#f0a93a"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray="600"
          className="motion-safe:animate-[route-draw_2.4s_cubic-bezier(.16,1,.3,1)_both]"
        />
        {/* Stops along the way */}
        {[
          [30, 160],
          [105.6, 81.1],
          [200, 53.8],
          [294.4, 77],
          [370, 150],
        ].map(([x, y], i) => (
          <g key={i}>
            <circle cx={x} cy={y} r={i === 0 || i === 4 ? 7 : 5} fill={i === 4 ? '#f0a93a' : '#fbf6ec'} />
            <circle cx={x} cy={y} r={i === 0 || i === 4 ? 12 : 9} fill="none" stroke="rgba(251,246,236,.25)" />
          </g>
        ))}
        <text x="30" y="190" textAnchor="middle" fill="rgba(251,246,236,.7)" fontSize="12" fontFamily="var(--font-body)">India</text>
        <text x="370" y="180" textAnchor="middle" fill="rgba(251,246,236,.7)" fontSize="12" fontFamily="var(--font-body)">Sri Lanka</text>
      </svg>
      <ol className="mt-2 flex justify-between gap-2">
        {STAGES.map((s, i) => (
          <li key={s} className="flex-1 text-center font-body text-[11px] leading-tight text-parchment/60">
            <span className="block font-display text-base font-semibold text-parchment">{i + 1}</span>
            {s}
          </li>
        ))}
      </ol>
      <style>{`@keyframes route-draw{from{stroke-dashoffset:600}to{stroke-dashoffset:0}}`}</style>
    </div>
  )
}

export default function AdminLoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [sendingReset, setSendingReset] = useState(false)

  // Safety net: an invite/recovery link should land on /admin/set-password,
  // but comes here instead if that page isn't in Supabase's Redirect URLs
  // allow-list. Forward the one-time token rather than losing it.
  useEffect(() => {
    const hasAuthRedirect =
      window.location.hash.includes('access_token=') ||
      window.location.hash.includes('error=') ||
      new URLSearchParams(window.location.search).has('code')
    if (hasAuthRedirect) {
      router.replace(`/admin/set-password${window.location.search}${window.location.hash}`)
    }
  }, [router])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim() || !password) return
    setSubmitting(true)
    setError(null)
    setNotice(null)

    const supabase = createClient()
    const { error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    if (signInError) {
      setSubmitting(false)
      setError('That email and password don’t match. Check both and try again.')
      return
    }

    // A valid login isn't the same as a staff login. Sign straight back
    // out if this account isn't an active staff member.
    const res = await fetch('/api/admin/auth/me')
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      await supabase.auth.signOut()
      setSubmitting(false)
      setError(body.error ?? 'This account doesn’t have access to the Wishdrop console.')
      return
    }

    const redirect = new URLSearchParams(window.location.search).get('redirect')
    router.push(redirect && redirect.startsWith('/admin') ? redirect : '/admin/dashboard')
    router.refresh()
  }

  async function sendReset() {
    setError(null)
    setNotice(null)
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('Enter your staff email above first, then choose “Forgot password?”.')
      return
    }
    setSendingReset(true)
    const { error: resetError } = await createClient().auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/admin/set-password`,
    })
    setSendingReset(false)
    // Same message either way, so this can't be used to check which
    // emails have accounts.
    if (resetError && !/rate|limit/i.test(resetError.message)) console.error('[admin reset]', resetError.message)
    setNotice(
      resetError && /rate|limit/i.test(resetError.message)
        ? 'Too many requests. Wait a minute, then try again.'
        : `If ${email.trim()} is a staff account, a link to set a new password is on its way. Check your inbox.`,
    )
  }

  return (
    <div className="min-h-screen bg-parchment lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(440px,0.9fr)]">
      {/* ── The desk ── */}
      <section className="relative overflow-hidden bg-indigo-deep text-parchment">
        <AirmailStripe />
        <div className="flex flex-col gap-8 px-6 py-8 sm:px-10 lg:min-h-[calc(100vh-6px)] lg:justify-between lg:px-14 lg:py-12">
          <p className="font-display text-xl font-semibold tracking-tight">
            wishdrop <span className="font-body text-xs font-medium text-parchment/50">console</span>
          </p>

          <div>
            <h1 className="max-w-[14ch] font-display text-[2rem] font-semibold leading-[1.08] tracking-tight sm:text-5xl">
              Every order, from the shop to the door.
            </h1>
            <p className="mt-4 hidden max-w-md font-body text-[15px] leading-relaxed text-parchment/70 sm:block">
              Requests, purchases, quality checks, shipments and customer chats, for every team, in one place.
            </p>
          </div>

          <div className="hidden sm:block">
            <OrderRoute />
          </div>

          <p className="hidden font-body text-xs text-parchment/45 lg:block">For Wishdrop staff only. Activity in the console is logged.</p>
        </div>
      </section>

      {/* ── Sign in ── */}
      <section className="flex items-start justify-center px-6 py-10 sm:px-10 lg:items-center lg:py-12">
        <div className="w-full max-w-sm">
          <h2 className="font-display text-3xl font-semibold tracking-tight text-ink">Staff sign in</h2>
          <p className="mt-2 font-body text-sm text-ink/60">Use your Wishdrop staff email.</p>

          <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-4">
            <label className="block">
              <span className="mb-1.5 block font-body text-sm font-medium text-ink/75">Email</span>
              <input
                type="email"
                required
                autoComplete="username"
                inputMode="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@wishdrop.shop"
                className="w-full rounded-xl border border-ink/15 bg-white px-4 py-3 font-body text-base text-ink outline-none transition-colors placeholder:text-ink/30 focus:border-teal focus:ring-2 focus:ring-teal/20"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 flex items-baseline justify-between font-body text-sm font-medium text-ink/75">
                Password
                <button type="button" onClick={sendReset} disabled={sendingReset} className="font-body text-xs font-semibold text-teal-deep hover:underline disabled:opacity-50">
                  {sendingReset ? 'Sending…' : 'Forgot password?'}
                </button>
              </span>
              <span className="relative block">
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-xl border border-ink/15 bg-white py-3 pl-4 pr-12 font-body text-base text-ink outline-none transition-colors focus:border-teal focus:ring-2 focus:ring-teal/20"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-2 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-lg text-ink/45 hover:text-ink focus-visible:outline-2 focus-visible:outline-teal"
                >
                  {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </span>
            </label>

            {error && (
              <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 font-body text-sm text-red-700">
                {error}
              </p>
            )}
            {notice && (
              <p role="status" className="rounded-xl bg-teal/10 px-4 py-3 font-body text-sm text-teal-deep">
                {notice}
              </p>
            )}

            <button
              type="submit"
              disabled={submitting || !email.trim() || !password}
              className="mt-1 flex h-12 items-center justify-center gap-2 rounded-xl bg-indigo font-body text-[15px] font-semibold text-parchment transition-colors hover:bg-indigo-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal disabled:opacity-50"
            >
              {submitting && <Loader2 size={16} className="animate-spin" />}
              {submitting ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          <div className="mt-10 border-t border-ink/10 pt-6 font-body text-sm text-ink/60">
            New to the team?{' '}
            <button type="button" onClick={() => router.push('/admin/register')} className="font-semibold text-teal-deep underline underline-offset-2">
              Request an account
            </button>
            <p className="mt-3 text-ink/45">
              Looking for your shop?{' '}
              <a href="/seller/login" className="underline underline-offset-2 hover:text-ink">
                Seller sign in
              </a>
            </p>
          </div>
        </div>
      </section>
    </div>
  )
}
