'use client'

import { FormEvent, Suspense, useEffect, useState } from 'react'
import { ArrowRight, Eye, EyeOff, LockKeyhole, Mail, User as UserIcon } from 'lucide-react'
import { useRouter, useSearchParams } from 'next/navigation'
import Image from 'next/image'
import BrandMark from '@/components/shared/BrandMark'
import AirmailStripe from '@/components/shared/AirmailStripe'
import { useAuth } from '@/contexts/AuthContext'

type Mode = 'login' | 'register'

const DEFAULT_REDIRECT = '/account'

function AccountAccessInner({ initialMode }: { initialMode?: Mode }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { isAuthenticated, signIn, signUp, resetPassword } = useAuth()

  // FIX: a `redirect` param of '/' (the landing page) used to be
  // treated as a valid target and sent people there after logging in
  // — only a MISSING param fell back to '/account'. Now '/' is treated
  // the same as "no real redirect" too, so logging in from anywhere
  // without a specific destination always lands on the account page,
  // never back on the landing page.
  const rawRedirect = searchParams.get('redirect')
  const redirect = rawRedirect && rawRedirect !== '/' ? rawRedirect : DEFAULT_REDIRECT

  const [mode, setMode] = useState<Mode>(
    () => initialMode ?? (searchParams.get('mode') === 'register' ? 'register' : 'login'),
  )

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const [confirmationSent, setConfirmationSent] = useState(false) // Supabase requires email confirmation first
  const [resetSent, setResetSent] = useState(false)

  // Already logged in and landing on this page — send them straight to
  // where they were headed instead of showing the form.
  useEffect(() => {
    if (isAuthenticated) {
      router.replace(redirect)
    }
  }, [isAuthenticated, redirect, router])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')

    if (mode === 'register' && name.trim().length < 2) {
      return setError('Please enter your full name.')
    }
    if (password.length < 6) {
      return setError('Use at least 6 characters for your password.')
    }

    setLoading(true)
    try {
      if (mode === 'login') {
        const { error: signInError } = await signIn(email, password)
        if (signInError) throw new Error(signInError)
        // FIX: signInWithPassword() writes the session cookie
        // asynchronously via document.cookie. router.push() right after
        // can outrace that write, so the very next request (the /account
        // navigation) hits middleware/server components before the
        // cookie is actually readable — result: it looks like login
        // "didn't lead to the account page" even though the client-side
        // session is fine. router.refresh() BEFORE push forces this page
        // to re-fetch its own server data first, which reliably waits
        // out the cookie write; only then do we navigate.
        router.refresh()
        router.push(redirect)
      } else {
        const { error: signUpError, sessionCreated } = await signUp(email, password, name.trim())
        if (signUpError) throw new Error(signUpError)
        if (sessionCreated) {
          router.refresh()
          router.push(redirect)
        } else {
          setConfirmationSent(true)
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  async function handleForgotPassword() {
    setError('')
    if (!email) return setError('Enter your email above first, then tap "Forgot password?".')
    setLoading(true)
    try {
      const { error: resetError } = await resetPassword(email)
      if (resetError) throw new Error(resetError)
      setResetSent(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  // Full-bleed background image behind every state of this page. A
  // parchment tint sits on top of it (rather than the image running at
  // full strength) so body text and the auth card keep the same
  // contrast they'd have on the plain parchment background — the image
  // sets mood, it doesn't have to carry legibility. `sizes="100vw"`
  // keeps mobile from downloading the same asset the desktop layout needs.
  const pageBackground = (
    <div className="pointer-events-none fixed inset-0 -z-10">
      <Image src="/login-bg.png" alt="" fill priority sizes="100vw" className="object-cover object-center" />
      <div className="absolute inset-0 bg-parchment/50" />
    </div>
  )

  // Logo shown inside the auth card itself, centered above the
  // Log in / Register tabs. `pointer-events-none` + no link target keeps
  // it purely decorative here (the top bar's BrandMark stays the
  // clickable one), so we don't end up with two nested navigational
  // brand marks stacked on the page.
  const cardLogo = (
    <div className="mb-6 flex justify-center">
      <span className="pointer-events-none">
        <BrandMark />
      </span>
    </div>
  )

  if (confirmationSent) {
    return (
      <main className="relative min-h-screen min-h-dvh overflow-x-hidden">
        {pageBackground}
        <AirmailStripe />
        <section className="relative z-10 mx-auto flex max-w-md flex-col items-center gap-4 px-5 py-16 text-center sm:py-24">
          <span className="grid size-14 place-items-center rounded-2xl bg-gold/12 text-gold-deep">
            <Mail size={26} strokeWidth={1.8} />
          </span>
          <h1 className="font-display text-[28px] text-ink sm:text-3xl">Check your email</h1>
          <p className="text-sm leading-6 text-ink/60">
            We sent a confirmation link to <span className="font-semibold text-ink">{email}</span>.
            Confirm your address, then log in to continue.
          </p>
          <button
            onClick={() => {
              setConfirmationSent(false)
              setMode('login')
            }}
            className="mt-4 w-full rounded-xl bg-gold-deep px-6 py-3.5 text-sm font-bold text-white transition-colors hover:bg-gold sm:w-auto"
          >
            Go to log in
          </button>
        </section>
      </main>
    )
  }

  if (resetSent) {
    return (
      <main className="relative min-h-screen min-h-dvh overflow-x-hidden">
        {pageBackground}
        <AirmailStripe />
        <section className="relative z-10 mx-auto flex max-w-md flex-col items-center gap-4 px-5 py-16 text-center sm:py-24">
          <span className="grid size-14 place-items-center rounded-2xl bg-gold/12 text-gold-deep">
            <Mail size={26} strokeWidth={1.8} />
          </span>
          <h1 className="font-display text-[28px] text-ink sm:text-3xl">Check your email</h1>
          <p className="text-sm leading-6 text-ink/60">
            If an account exists for <span className="font-semibold text-ink">{email}</span>, we
            sent a password reset link.
          </p>
          <button
            onClick={() => setResetSent(false)}
            className="mt-4 w-full rounded-xl bg-gold-deep px-6 py-3.5 text-sm font-bold text-white transition-colors hover:bg-gold sm:w-auto"
          >
            Back
          </button>
        </section>
      </main>
    )
  }

  return (
    <main className="relative flex min-h-screen min-h-dvh flex-col overflow-x-hidden">
      {pageBackground}
      <AirmailStripe />
      <section className="relative z-10 mx-auto flex w-full max-w-7xl flex-1 flex-col items-center justify-center px-5 py-10 sm:py-14 lg:py-20 xl:px-10">
        {/* Auth card — same bg-card/border-ink/10 family as the rest of
            the app, with the thin gold top edge used on "My Orders" and
            "Buy for me" to mark it as the one card on this page that
            matters, instead of a generic drop shadow. Kept fully opaque
            (bg-card, not a translucent glass panel) so it stays legible
            over the background image at any scroll position. */}
        <div className="relative w-full max-w-md overflow-hidden rounded-[28px] border border-ink/10 bg-card p-6 shadow-sm shadow-ink/5 sm:p-9">
          <div className="absolute inset-x-0 top-0 h-[3px] bg-gold" aria-hidden="true" />

          {cardLogo}

          <div className="mb-7 mt-4 flex rounded-xl bg-parchment p-1">
            <button
              type="button"
              onClick={() => setMode('login')}
              className={`flex-1 rounded-lg py-2.5 text-sm font-bold transition-colors ${
                mode === 'login' ? 'bg-card text-ink shadow-sm' : 'text-ink/40'
              }`}
            >
              Log in
            </button>
            <button
              type="button"
              onClick={() => setMode('register')}
              className={`flex-1 rounded-lg py-2.5 text-sm font-bold transition-colors ${
                mode === 'register' ? 'bg-card text-ink shadow-sm' : 'text-ink/40'
              }`}
            >
              Register
            </button>
          </div>

          <h2 className="font-display text-[28px] text-ink sm:text-3xl">
            {mode === 'login' ? 'Welcome back' : 'Create your account'}
          </h2>
          <p className="mt-2 text-sm text-ink/55">
            {mode === 'login' ? 'Your delivery desk is waiting.' : 'Start with your free Wishdrop account.'}
          </p>

          <form onSubmit={submit} className="mt-6 flex flex-col gap-4">
            {mode === 'register' && (
              <label className="flex items-center gap-3 rounded-xl border border-ink/10 bg-parchment px-4 py-3.5 transition-colors focus-within:border-gold-deep/40 sm:py-3">
                <UserIcon size={17} className="shrink-0 text-ink/40" />
                <input
                  required
                  autoComplete="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Full name"
                  className="min-w-0 flex-1 bg-transparent text-base text-ink outline-none placeholder:text-ink/35 sm:text-sm"
                />
              </label>
            )}

            <label className="flex items-center gap-3 rounded-xl border border-ink/10 bg-parchment px-4 py-3.5 transition-colors focus-within:border-gold-deep/40 sm:py-3">
              <Mail size={17} className="shrink-0 text-ink/40" />
              <input
                required
                type="email"
                inputMode="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email address"
                className="min-w-0 flex-1 bg-transparent text-base text-ink outline-none placeholder:text-ink/35 sm:text-sm"
              />
            </label>

            <label className="flex items-center gap-3 rounded-xl border border-ink/10 bg-parchment px-4 py-3.5 transition-colors focus-within:border-gold-deep/40 sm:py-3">
              <LockKeyhole size={17} className="shrink-0 text-ink/40" />
              <input
                required
                minLength={6}
                type={showPassword ? 'text' : 'password'}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                className="min-w-0 flex-1 bg-transparent text-base text-ink outline-none placeholder:text-ink/35 sm:text-sm"
              />
              <button
                type="button"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                onClick={() => setShowPassword((value) => !value)}
                className="-mr-1.5 rounded-lg p-1.5 text-ink/40 transition-colors hover:text-ink/70"
              >
                {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </label>

            {error && <p className="text-sm font-semibold text-gold-deep">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="group flex items-center justify-center gap-2 rounded-xl bg-gold-deep py-3.5 text-sm font-bold text-white transition-colors hover:bg-gold disabled:opacity-60"
            >
              {loading ? 'Please wait…' : mode === 'login' ? 'Log in' : 'Create account'}
              <ArrowRight
                size={17}
                className="transition-transform duration-200 group-hover:translate-x-0.5"
              />
            </button>

            {mode === 'login' && (
              <button
                type="button"
                onClick={handleForgotPassword}
                className="rounded-lg py-2 text-center text-xs font-semibold text-teal-deep hover:text-teal"
              >
                Forgot password?
              </button>
            )}
          </form>
        </div>
      </section>
    </main>
  )
}

export default function AccountAccess({ initialMode }: { initialMode?: Mode } = {}) {
  return (
    <Suspense fallback={null}>
      <AccountAccessInner initialMode={initialMode} />
    </Suspense>
  )
}