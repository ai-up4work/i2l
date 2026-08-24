'use client'

import { useRouter } from 'next/navigation'
import {
  Bell,
  ChevronRight,
  Globe,
  MapPin,
  MessageCircle,
  Pencil,
  Ticket,
  Sparkles,
} from 'lucide-react'
import GiftInviteIllustration from './illustrations/GiftInviteIllustration'
import { creditBalance, promoCodes } from './data'
import { pathForView } from './routes'
import type { View } from './types'

type MenuItem = { label: string; icon: typeof Pencil; view?: View }

const personalSettings: MenuItem[] = [
  { label: 'My profile', icon: Pencil },
  { label: 'Delivery addresses', icon: MapPin, view: 'warehouseAddresses' },
  { label: 'Notifications', icon: Bell },
  { label: 'Regions & languages', icon: Globe },
]

const helpItems: MenuItem[] = [{ label: 'Help centre', icon: MessageCircle }]

export default function AccountHubPage() {
  const router = useRouter()

  function go(view?: View) {
    if (view) router.push(pathForView(view))
  }

  return (
    <div className="mx-auto max-w-2xl px-6 pb-16 pt-8 lg:px-10">
      <h1 className="font-display text-4xl text-ink sm:text-5xl">Account</h1>

      <div className="mt-8 flex items-center gap-4">
        <span className="grid h-14 w-14 flex-none place-items-center rounded-full bg-blue text-xl font-bold text-paper">
          S
        </span>
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <p className="font-display text-xl text-ink">Safnas Kaldeen</p>
            <span className="rounded-full bg-rust/10 px-2.5 py-1 text-[11px] font-semibold text-rust">Unverified</span>
          </div>
          <button className="mt-1 flex items-center gap-1 text-sm text-muted transition-colors hover:text-ink">
            Edit personal info <ChevronRight size={14} />
          </button>
        </div>
      </div>

      <button className="mt-6 flex w-full items-center justify-between rounded-2xl border border-ink/10 bg-card px-5 py-4 text-left transition-colors hover:bg-ink/5">
        <span className="text-sm font-semibold text-ink">
          You&apos;ve unlocked <b className="text-rust">0</b> badge(s)
        </span>
        <span className="flex items-center gap-2">
          <span className="rounded-full bg-gold-soft px-3 py-1.5 text-xs font-semibold text-rust">View on app</span>
          <ChevronRight size={16} className="text-ink/30" />
        </span>
      </button>

      <div className="mt-4 grid grid-cols-2 gap-4">
        <button
          onClick={() => go('credits')}
          className="relative rounded-2xl border border-ink/10 bg-card p-5 text-left transition-colors hover:bg-ink/5"
        >
          <Sparkles size={16} className="absolute right-4 top-4 text-gold" />
          <p className="font-display text-2xl text-ink">{creditBalance}</p>
          <p className="mt-1 text-sm font-semibold text-ink/60">Credits</p>
        </button>
        <button
          onClick={() => go('promoCodes')}
          className="relative rounded-2xl border border-ink/10 bg-card p-5 text-left transition-colors hover:bg-ink/5"
        >
          <Ticket size={16} className="absolute right-4 top-4 text-gold" />
          <p className="font-display text-2xl text-ink">{promoCodes.length}</p>
          <p className="mt-1 text-sm font-semibold text-ink/60">Promo codes</p>
        </button>
      </div>

      <div className="mt-6 flex items-center justify-between gap-4 rounded-2xl bg-gold-soft/60 p-6">
        <div>
          <h2 className="font-display text-lg text-ink">Invite friends &amp; earn together</h2>
          <p className="mt-1 text-sm text-ink/70">Get 500 credits for each successful referral</p>
          <button
            onClick={() => go('referrals')}
            className="mt-4 rounded-xl bg-ink px-5 py-2.5 text-sm font-semibold text-paper transition-colors hover:bg-blue-deep"
          >
            Invite now
          </button>
        </div>
        <GiftInviteIllustration className="h-16 w-16 flex-none sm:h-20 sm:w-20" />
      </div>

      <h2 className="mt-9 font-display text-xl text-ink">Personal settings</h2>
      <div className="mt-4 overflow-hidden rounded-2xl border border-ink/10 bg-card">
        {personalSettings.map(({ label, icon: Icon, view }, index) => (
          <button
            key={label}
            onClick={() => go(view)}
            className={`flex w-full items-center gap-3 px-5 py-4 text-left transition-colors hover:bg-ink/5 ${
              index > 0 ? 'border-t border-ink/10' : ''
            }`}
          >
            <Icon size={18} className="flex-none text-ink/70" />
            <span className="flex-1 text-sm font-semibold text-ink">{label}</span>
            <ChevronRight size={16} className="text-ink/30" />
          </button>
        ))}
      </div>

      <h2 className="mt-8 font-display text-xl text-ink">Help</h2>
      <div className="mt-4 overflow-hidden rounded-2xl border border-ink/10 bg-card">
        {helpItems.map(({ label, icon: Icon }) => (
          <button
            key={label}
            className="flex w-full items-center gap-3 px-5 py-4 text-left transition-colors hover:bg-ink/5"
          >
            <Icon size={18} className="flex-none text-ink/70" />
            <span className="flex-1 text-sm font-semibold text-ink">{label}</span>
            <ChevronRight size={16} className="text-ink/30" />
          </button>
        ))}
      </div>

      <button className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl border border-ink/15 py-3.5 text-sm font-semibold text-ink transition-colors hover:bg-ink/5">
        Download App
      </button>

      <button className="mt-6 text-sm font-semibold text-ink underline decoration-ink/30 underline-offset-2 hover:decoration-ink">
        Log out
      </button>
    </div>
  )
}
