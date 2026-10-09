// app/seller/login/page.tsx
//
// Seller sign-in. The left side (desktop) / top band (phone) shows what
// selling on Wishdrop means for an Instagram or Facebook seller; the form
// is plain and quiet. Accounts are created by Wishdrop staff, so there's
// no sign-up here — new sellers are sent to /stores/apply.
'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Eye, EyeOff, Loader2 } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import AirmailStripe from '@/components/shared/AirmailStripe'
import PostToListing from '@/components/seller/PostToListing'

const WHATSAPP = (process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || '').replace(/\D/g, '')

export default function SellerLoginPage() {
  const router = useRouter()
  const { signIn } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const { error: signInError } = await signIn(email.trim(), password)
    if (signInError) {
      setLoading(false)
      setError(/invalid/i.test(signInError) ? 'That email and password don’t match. Check both and try again.' : signInError)
      return
    }
    // The (dashboard) layout checks server-side that this login belongs
    // to a seller, and sends anyone else back here.
    router.push('/seller')
    router.refresh()
  }

  const forgotHref = WHATSAPP
    ? `https://wa.me/${WHATSAPP}?text=${encodeURIComponent(`Hi Wishdrop, I need a new password for my seller account${email ? ` (${email.trim()})` : ''}.`)}`
    : null

  return (
    <div className="min-h-screen bg-parchment lg:grid lg:grid-cols-[minmax(0,1.1fr)_minmax(420px,1fr)]">
      {/* ── The pitch ── */}
      <section className="relative overflow-hidden bg-indigo text-parchment">
        <AirmailStripe />
        <div className="relative px-6 pb-10 pt-8 sm:px-10 lg:flex lg:min-h-[calc(100vh-6px)] lg:flex-col lg:justify-between lg:px-14 lg:py-12">
          <Link href="/" className="font-display text-xl font-semibold tracking-tight text-parchment">
            wishdrop
          </Link>

          <div className="mt-8 lg:mt-0">
            <h1 className="max-w-[16ch] font-display text-[2rem] font-semibold leading-[1.08] tracking-tight sm:text-5xl lg:text-[3.4rem]">
              Your Instagram shop, now delivering to Sri Lanka.
            </h1>
            {/* <p className="mt-4 max-w-md font-body text-[15px] leading-relaxed text-parchment/75">
              Post your products here the way you post them on Instagram. Shoppers in Sri Lanka order, pay in rupees and
              get it at their door. We buy from you at your price and handle the rest.
            </p> */}
          </div>

          <div className="mt-10 hidden sm:block lg:mt-0">
            <PostToListing />
          </div>

          <p className="mt-10 hidden font-body text-xs text-parchment/50 lg:mt-0 lg:block">
            Payments, customs, shipping and customer questions are all handled by Wishdrop.
          </p>
        </div>
      </section>

      {/* ── The form ── */}
      <section className="flex items-start justify-center px-6 py-10 sm:px-10 lg:items-center lg:py-12">
        <div className="w-full max-w-sm">
          <h2 className="font-display text-3xl font-semibold tracking-tight text-ink">Seller sign in</h2>
          <p className="mt-2 font-body text-sm text-ink/60">Use the email and password your Wishdrop contact sent you.</p>

          <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-4">
            <label className="block">
              <span className="mb-1.5 block font-body text-sm font-medium text-ink/75">Email</span>
              <input
                type="email"
                required
                autoComplete="email"
                inputMode="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-xl border border-ink/15 bg-white px-4 py-3 font-body text-base text-ink outline-none transition-colors focus:border-teal focus:ring-2 focus:ring-teal/20"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block font-body text-sm font-medium text-ink/75">Password</span>
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

            <button
              type="submit"
              disabled={loading}
              className="mt-1 flex h-12 items-center justify-center gap-2 rounded-xl bg-teal font-body text-[15px] font-semibold text-white transition-colors hover:bg-teal-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal disabled:opacity-60"
            >
              {loading && <Loader2 size={16} className="animate-spin" />}
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          <p className="mt-4 font-body text-sm text-ink/55">
            Forgot your password?{' '}
            {forgotHref ? (
              <a href={forgotHref} target="_blank" rel="noopener noreferrer" className="font-medium text-teal-deep underline underline-offset-2">
                Message us on WhatsApp
              </a>
            ) : (
              'Ask your Wishdrop contact for a new one.'
            )}
          </p>

          <div className="mt-10 border-t border-ink/10 pt-6">
            <p className="font-body text-sm text-ink/70">Not selling with us yet?</p>
            <Link
              href="/stores/apply"
              className="mt-3 flex h-12 items-center justify-center rounded-xl border border-ink/20 font-body text-[15px] font-semibold text-ink transition-colors hover:border-ink hover:bg-white"
            >
              Apply to sell on Wishdrop
            </Link>
          </div>
        </div>
      </section>
    </div>
  )
}
