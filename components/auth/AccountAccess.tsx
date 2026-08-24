'use client'

import { FormEvent, useEffect, useState } from 'react'
import { ArrowRight, Check, Eye, EyeOff, LockKeyhole, Mail, PackageCheck } from 'lucide-react'
import { useRouter, useSearchParams } from 'next/navigation'
import BrandMark from '@/components/shared/BrandMark'
import OnboardingExperience from './OnboardingExperience'

const AUTH_KEY = 'india2lanka-account'
type Mode = 'login' | 'register'
type Account = { name: string; email: string }

export default function AccountAccess() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [mode, setMode] = useState<Mode>(() => searchParams.get('mode') === 'register' ? 'register' : 'login')
  const [account, setAccount] = useState<Account | null>(null)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [showOnboarding, setShowOnboarding] = useState(false)

  useEffect(() => {
    const saved = window.localStorage.getItem(AUTH_KEY)
    if (saved) setAccount(JSON.parse(saved))
  }, [])

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    if (mode === 'register' && name.trim().length < 2) return setError('Please enter your full name.')
    if (password.length < 6) return setError('Use at least 6 characters for your password.')
    const next = { name: mode === 'register' ? name.trim() : 'Safnas Kaldeen', email }
    window.localStorage.setItem(AUTH_KEY, JSON.stringify(next))
    setAccount(next)
    setShowOnboarding(mode === 'register')
  }

  if (account && showOnboarding) return <OnboardingExperience />

  if (account) return (
    <main className="min-h-screen bg-paper">
      <header className="border-b border-ink/10 bg-card"><div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-5 lg:px-10"><BrandMark /><button onClick={() => router.push('/account')} className="text-sm font-semibold text-ink/70 hover:text-rust">Open account centre</button></div></header>
      <section className="mx-auto flex max-w-5xl flex-col gap-8 px-5 py-12 lg:flex-row lg:items-center lg:px-10 lg:py-20"><div className="flex-1"><p className="font-mono text-[11px] uppercase tracking-[0.22em] text-rust">Account ready</p><h1 className="mt-4 max-w-xl font-display text-5xl leading-[1.02] text-ink sm:text-6xl">Your world, packed and ready.</h1><p className="mt-5 max-w-lg text-base leading-7 text-ink/65">Welcome, {account.name}. Your India2Lanka account is ready for forwarding, shopping, and tracking.</p><button onClick={() => router.push('/account')} className="mt-8 inline-flex items-center gap-2 rounded-xl bg-rust px-6 py-3.5 text-sm font-bold text-paper shadow-lift hover:bg-rust-deep">Go to account <ArrowRight size={17} /></button></div><div className="w-full max-w-md rounded-[28px] border border-ink/10 bg-card p-6 shadow-lift"><div className="flex items-center gap-3 border-b border-ink/10 pb-5"><span className="grid h-12 w-12 place-items-center rounded-full bg-blue text-lg font-bold text-paper">{account.name[0]}</span><div><p className="font-display text-xl text-ink">{account.name}</p><p className="text-sm text-ink/55">{account.email}</p></div></div><div className="grid gap-3 pt-5 text-sm font-semibold text-ink/75"><div className="flex items-center gap-3 rounded-xl bg-paper p-4"><PackageCheck className="text-rust" size={19} /> Shipment workspace ready</div><div className="flex items-center gap-3 rounded-xl bg-paper p-4"><Check className="text-blue" size={19} /> First shipment discount unlocked</div></div></div></section>
    </main>
  )

  return <main className="min-h-screen bg-paper px-5 py-6 lg:px-10"><div className="mx-auto flex max-w-6xl items-center justify-between"><BrandMark /><a href="/" className="text-sm font-semibold text-ink/60 hover:text-rust">Back to home</a></div><section className="mx-auto flex max-w-5xl flex-col gap-12 py-12 lg:flex-row lg:items-center lg:py-20"><div className="flex-1"><p className="font-mono text-[11px] uppercase tracking-[0.22em] text-rust">India2Lanka account</p><h1 className="mt-4 max-w-xl font-display text-5xl leading-[1.02] text-ink sm:text-7xl">Bring the world a little closer.</h1><p className="mt-5 max-w-lg text-base leading-7 text-ink/65">Save addresses, follow shipments, and turn your favourite overseas finds into doorstep deliveries.</p></div><div className="w-full max-w-md rounded-[28px] border border-ink/10 bg-card p-7 shadow-lift sm:p-9"><div className="mb-7 flex rounded-xl bg-paper p-1"><button onClick={() => setMode('login')} className={`flex-1 rounded-lg py-2.5 text-sm font-bold ${mode === 'login' ? 'bg-card text-ink shadow-sm' : 'text-ink/45'}`}>Log in</button><button onClick={() => setMode('register')} className={`flex-1 rounded-lg py-2.5 text-sm font-bold ${mode === 'register' ? 'bg-card text-ink shadow-sm' : 'text-ink/45'}`}>Register</button></div><h2 className="font-display text-3xl text-ink">{mode === 'login' ? 'Welcome back' : 'Create your account'}</h2><p className="mt-2 text-sm text-ink/55">{mode === 'login' ? 'Your delivery desk is waiting.' : 'Start with your free India2Lanka account.'}</p><form onSubmit={submit} className="mt-6 flex flex-col gap-4">{mode === 'register' && <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" className="rounded-xl border border-ink/10 bg-paper px-4 py-3 text-sm text-ink outline-none" />}<label className="flex items-center gap-3 rounded-xl border border-ink/10 bg-paper px-4 py-3"><Mail size={17} className="text-ink/45" /><input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email address" className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none" /></label><label className="flex items-center gap-3 rounded-xl border border-ink/10 bg-paper px-4 py-3"><LockKeyhole size={17} className="text-ink/45" /><input required type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none" /><button type="button" aria-label="Toggle password visibility" onClick={() => setShowPassword((value) => !value)}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button></label>{error && <p className="text-sm font-semibold text-rust">{error}</p>}<button type="submit" className="flex items-center justify-center gap-2 rounded-xl bg-rust py-3.5 text-sm font-bold text-paper hover:bg-rust-deep">{mode === 'login' ? 'Log in' : 'Create account'} <ArrowRight size={17} /></button></form></div></section></main>
}
