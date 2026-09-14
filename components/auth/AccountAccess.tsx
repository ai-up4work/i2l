'use client'

import { FormEvent, Suspense, useEffect, useState } from 'react'
import { ArrowRight, Eye, EyeOff, LockKeyhole, Mail, User as UserIcon } from 'lucide-react'
import { useRouter, useSearchParams } from 'next/navigation'
import BrandMark from '@/components/shared/BrandMark'
import { useAuth } from '@/contexts/AuthContext'

type Mode = 'login' | 'register'

function AccountAccessInner({ initialMode }: { initialMode?: Mode }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { isAuthenticated, signIn, signUp, resetPassword } = useAuth()

  const redirect = searchParams.get('redirect') || '/account'
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

  if (confirmationSent) {
    return (
      <main className="min-h-screen bg-paper px-5 py-6 lg:px-10">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <BrandMark />
          <a href="/" className="text-sm font-semibold text-ink/60 hover:text-rust">
            Back to home
          </a>
        </div>
        <section className="mx-auto flex max-w-md flex-col items-center gap-4 py-24 text-center">
          <Mail size={32} className="text-rust" />
          <h1 className="font-display text-3xl font-bold text-ink">Check your email</h1>
          <p className="text-sm leading-6 text-ink/65">
            We sent a confirmation link to <span className="font-semibold text-ink">{email}</span>.
            Confirm your address, then log in to continue.
          </p>
          <button
            onClick={() => {
              setConfirmationSent(false)
              setMode('login')
            }}
            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-rust px-6 py-3 text-sm font-bold text-paper hover:bg-rust-deep"
          >
            Go to log in <ArrowRight size={17} />
          </button>
        </section>
      </main>
    )
  }

  if (resetSent) {
    return (
      <main className="min-h-screen bg-paper px-5 py-6 lg:px-10">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <BrandMark />
          <a href="/" className="text-sm font-semibold text-ink/60 hover:text-rust">
            Back to home
          </a>
        </div>
        <section className="mx-auto flex max-w-md flex-col items-center gap-4 py-24 text-center">
          <Mail size={32} className="text-rust" />
          <h1 className="font-display text-3xl font-bold text-ink">Check your email</h1>
          <p className="text-sm leading-6 text-ink/65">
            If an account exists for <span className="font-semibold text-ink">{email}</span>, we
            sent a password reset link.
          </p>
          <button
            onClick={() => setResetSent(false)}
            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-rust px-6 py-3 text-sm font-bold text-paper hover:bg-rust-deep"
          >
            Back <ArrowRight size={17} />
          </button>
        </section>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-paper px-5 py-6 lg:px-10">
      <div className="mx-auto flex max-w-6xl items-center justify-between">
        <BrandMark />
        <a href="/" className="text-sm font-semibold text-ink/60 hover:text-rust">
          Back to home
        </a>
      </div>
      <section className="mx-auto flex max-w-5xl flex-col gap-12 py-12 lg:flex-row lg:items-center lg:py-20">
        <div className="flex-1">
          <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-rust">WishDrop account</p>
          <h1 className="mt-4 max-w-xl font-display text-5xl leading-[1.02] text-ink sm:text-7xl">
            Bring the world a little closer.
          </h1>
          <p className="mt-5 max-w-lg text-base leading-7 text-ink/65">
            Save addresses, follow requests, and turn your favourite overseas finds into doorstep
            deliveries.
          </p>
        </div>

        <div className="w-full max-w-md rounded-[28px] border border-ink/10 bg-card p-7 shadow-lift sm:p-9">
          <div className="mb-7 flex rounded-xl bg-paper p-1">
            <button
              type="button"
              onClick={() => setMode('login')}
              className={`flex-1 rounded-lg py-2.5 text-sm font-bold ${mode === 'login' ? 'bg-card text-ink shadow-sm' : 'text-ink/45'}`}
            >
              Log in
            </button>
            <button
              type="button"
              onClick={() => setMode('register')}
              className={`flex-1 rounded-lg py-2.5 text-sm font-bold ${mode === 'register' ? 'bg-card text-ink shadow-sm' : 'text-ink/45'}`}
            >
              Register
            </button>
          </div>

          <h2 className="font-display text-3xl text-ink">
            {mode === 'login' ? 'Welcome back' : 'Create your account'}
          </h2>
          <p className="mt-2 text-sm text-ink/55">
            {mode === 'login' ? 'Your delivery desk is waiting.' : 'Start with your free WishDrop account.'}
          </p>

          <form onSubmit={submit} className="mt-6 flex flex-col gap-4">
            {mode === 'register' && (
              <label className="flex items-center gap-3 rounded-xl border border-ink/10 bg-paper px-4 py-3">
                <UserIcon size={17} className="text-ink/45" />
                <input
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Full name"
                  className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none"
                />
              </label>
            )}

            <label className="flex items-center gap-3 rounded-xl border border-ink/10 bg-paper px-4 py-3">
              <Mail size={17} className="text-ink/45" />
              <input
                required
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email address"
                className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none"
              />
            </label>

            <label className="flex items-center gap-3 rounded-xl border border-ink/10 bg-paper px-4 py-3">
              <LockKeyhole size={17} className="text-ink/45" />
              <input
                required
                minLength={6}
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none"
              />
              <button
                type="button"
                aria-label="Toggle password visibility"
                onClick={() => setShowPassword((value) => !value)}
              >
                {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </label>

            {error && <p className="text-sm font-semibold text-rust">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="flex items-center justify-center gap-2 rounded-xl bg-rust py-3.5 text-sm font-bold text-paper hover:bg-rust-deep disabled:opacity-60"
            >
              {loading ? 'Please wait…' : mode === 'login' ? 'Log in' : 'Create account'}
              <ArrowRight size={17} />
            </button>

            {mode === 'login' && (
              <button
                type="button"
                onClick={handleForgotPassword}
                className="text-center text-xs font-semibold text-teal-deep hover:text-teal"
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