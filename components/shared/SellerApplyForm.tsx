// components/shared/SellerApplyForm.tsx
//
// The "Sell on Wishdrop" application. Saves to seller_applications through
// /api/seller-applications (it used to show "received" without saving
// anything). Staff follow up from Admin → Social Stores.
'use client'

import { useState } from 'react'
import { CheckCircle2, Loader2 } from 'lucide-react'

const CATEGORIES = ['Sarees & ethnic wear', 'Clothing', 'Jewellery', 'Bags & accessories', 'Beauty & skincare', 'Home & decor', 'Kids', 'Something else']

const field =
  'w-full rounded-xl border border-ink/15 bg-white px-4 py-3 font-body text-base text-ink outline-none transition-colors placeholder:text-ink/35 focus:border-teal focus:ring-2 focus:ring-teal/20 sm:text-[15px]'
const label = 'mb-1.5 block font-body text-sm font-medium text-ink/75'

export default function SellerApplyForm() {
  const [form, setForm] = useState({
    storeName: '',
    contactName: '',
    email: '',
    whatsapp: '',
    instagram: '',
    facebook: '',
    website: '',
    category: '',
    location: '',
    productCount: '',
    message: '',
    company: '',
  })
  const [agree, setAgree] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }))

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!form.instagram.trim() && !form.facebook.trim() && !form.website.trim()) {
      return setError('Add your Instagram, Facebook page or website so we can see what you sell.')
    }
    setSending(true)
    try {
      const res = await fetch('/api/seller-applications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, agree }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error ?? 'We couldn’t send your application. Please try again.')
      setSent(true)
      window.scrollTo({ top: (document.getElementById('apply')?.offsetTop ?? 0) - 80, behavior: 'smooth' })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'We couldn’t send your application. Please try again.')
    } finally {
      setSending(false)
    }
  }

  if (sent) {
    return (
      <div className="flex flex-col items-start gap-4 py-6" role="status">
        <span className="grid h-14 w-14 place-items-center rounded-full bg-teal/10 text-teal-deep">
          <CheckCircle2 size={26} />
        </span>
        <h2 className="font-display text-3xl font-semibold tracking-tight text-ink">Thanks, {form.contactName.split(' ')[0] || 'we got it'}.</h2>
        <p className="max-w-md font-body text-[15px] leading-relaxed text-ink/65">
          We&rsquo;ve got your application for <span className="font-semibold text-ink">{form.storeName}</span>. Someone from our team will look at
          your page and message you on WhatsApp, usually within 3 working days.
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6" noValidate={false}>
      {/* Hidden from people; bots fill it in. */}
      <input type="text" name="company" value={form.company} onChange={set('company')} tabIndex={-1} autoComplete="off" className="hidden" aria-hidden="true" />

      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-3 font-display text-xl font-semibold text-ink">Your shop</legend>
        <label className="block sm:col-span-2">
          <span className={label}>Shop name</span>
          <input required value={form.storeName} onChange={set('storeName')} maxLength={100} placeholder="e.g. Meera Handlooms" className={field} />
        </label>
        <label className="block">
          <span className={label}>Instagram</span>
          <input value={form.instagram} onChange={set('instagram')} maxLength={200} placeholder="@yourshop" autoCapitalize="none" className={field} />
        </label>
        <label className="block">
          <span className={label}>Facebook page</span>
          <input value={form.facebook} onChange={set('facebook')} maxLength={200} placeholder="facebook.com/yourshop" autoCapitalize="none" className={field} />
        </label>
        <label className="block sm:col-span-2">
          <span className={label}>Website (if you have one)</span>
          <input value={form.website} onChange={set('website')} maxLength={300} placeholder="https://" autoCapitalize="none" className={field} />
        </label>
        <label className="block">
          <span className={label}>What do you sell?</span>
          <select required value={form.category} onChange={set('category')} className={field}>
            <option value="" disabled>
              Choose one
            </option>
            {CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className={label}>How many products, roughly?</span>
          <select value={form.productCount} onChange={set('productCount')} className={field}>
            <option value="">Not sure</option>
            <option>Under 20</option>
            <option>20 to 100</option>
            <option>100 to 500</option>
            <option>More than 500</option>
          </select>
        </label>
        <label className="block sm:col-span-2">
          <span className={label}>Where are you based?</span>
          <input value={form.location} onChange={set('location')} maxLength={100} placeholder="City, country" className={field} />
        </label>
      </fieldset>

      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-3 font-display text-xl font-semibold text-ink">You</legend>
        <label className="block">
          <span className={label}>Your name</span>
          <input required value={form.contactName} onChange={set('contactName')} maxLength={100} autoComplete="name" className={field} />
        </label>
        <label className="block">
          <span className={label}>WhatsApp number</span>
          <input required type="tel" value={form.whatsapp} onChange={set('whatsapp')} maxLength={30} autoComplete="tel" placeholder="+91 98765 43210" className={field} />
        </label>
        <label className="block sm:col-span-2">
          <span className={label}>Email</span>
          <input required type="email" value={form.email} onChange={set('email')} maxLength={200} autoComplete="email" placeholder="you@example.com" className={field} />
          <span className="mt-1 block font-body text-xs text-ink/45">Your seller login will be set up with this email.</span>
        </label>
        <label className="block sm:col-span-2">
          <span className={label}>Anything else? (optional)</span>
          <textarea value={form.message} onChange={set('message')} rows={3} maxLength={2000} placeholder="Questions, how you ship today, anything we should know." className={`${field} resize-none`} />
        </label>
      </fieldset>

      <label className="flex items-start gap-3 font-body text-sm text-ink/65">
        <input required type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-0.5 h-4 w-4 accent-teal" />
        <span>
          The details above are correct, and I agree to Wishdrop&rsquo;s{' '}
          <a href="/terms" className="font-medium text-teal-deep underline underline-offset-2">
            Terms of Use
          </a>
          .
        </span>
      </label>

      {error && (
        <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 font-body text-sm text-red-700">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={sending || !agree}
        className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-teal font-body text-[15px] font-semibold text-white transition-colors hover:bg-teal-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal disabled:opacity-50 sm:w-auto sm:px-10"
      >
        {sending && <Loader2 size={16} className="animate-spin" />}
        {sending ? 'Sending…' : 'Send my application'}
      </button>
    </form>
  )
}
