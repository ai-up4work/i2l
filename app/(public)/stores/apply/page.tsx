import { ShieldCheck, TrendingUp, Users } from 'lucide-react'
import SellerApplyForm from '@/components/shared/SellerApplyForm'

export const metadata = {
  title: 'Sell on WishDrop',
  description: 'Apply to become an affiliated WishDrop seller and reach shoppers in Sri Lanka.',
}

const perks = [
  { icon: Users, title: 'Reach Sri Lankan shoppers', text: "Get discovered by customers who couldn't buy from you directly before." },
  { icon: ShieldCheck, title: 'Managed, trusted checkout', text: 'WishDrop handles payment, customs, and delivery — you just fulfil orders like normal.' },
  { icon: TrendingUp, title: 'New products, more visibility', text: 'Featured placement for new arrivals and seasonal promotions across the platform.' },
]

export default function StoresApplyPage() {
  return (
    <main className="mx-auto max-w-5xl px-6 py-16 lg:px-10 lg:py-24">
      <div className="max-w-2xl">
        <p className="font-body text-xs font-semibold uppercase tracking-[0.2em] text-gold-deep">
          Sell on WishDrop
        </p>
        <h1 className="mt-3 font-display text-4xl font-semibold tracking-tight text-ink sm:text-5xl">
          Open your store here
        </h1>
        <p className="mt-4 font-body text-base leading-relaxed text-ink/65">
          WishDrop gives your store a managed channel into the Sri Lankan market — we verify every
          seller before they go live, so applications take a little longer than an instant sign-up,
          but customers trust what they see.
        </p>
      </div>

      <div className="mt-10 grid gap-4 sm:grid-cols-3">
        {perks.map(({ icon: Icon, title, text }) => (
          <div key={title} className="rounded-2xl border border-ink/10 bg-card p-5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal/10 text-teal-deep">
              <Icon size={18} />
            </div>
            <h2 className="mt-3 font-display text-base font-semibold text-ink">{title}</h2>
            <p className="mt-1.5 font-body text-xs leading-relaxed text-ink/55">{text}</p>
          </div>
        ))}
      </div>

      <div className="mt-12 rounded-3xl border border-ink/10 bg-card p-6 sm:p-9">
        <SellerApplyForm />
      </div>

      <p className="mt-8 font-body text-xs text-ink/40">
        Already approved? <a href="/seller/login" className="text-teal-deep underline underline-offset-2">Log in to your seller account</a>.
      </p>
    </main>
  )
}
