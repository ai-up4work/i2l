'use client'

import { useRouter } from 'next/navigation'
import Image from 'next/image'
import {
  Award,
  Bell,
  Check,
  ChevronRight,
  Globe,
  MapPin,
  MessageCircle,
  Pencil,
  ShieldAlert,
  Ticket,
  Sparkles,
} from 'lucide-react'
import GiftInviteIllustration from './illustrations/GiftInviteIllustration'
import { creditBalance, promoCodes } from './data'
import { pathForView } from './routes'
import type { View } from './types'

type MenuItem = {
  label: string
  icon: typeof Pencil
  view?: View
  iconBg: string
  iconColor: string
}

// Real, incomplete-by-default checklist — a fresh account starts at 0%,
// same as credits/referrals elsewhere in the app. The ring below reflects
// exactly this array; nothing here is decorative.
const PROFILE_CHECKLIST = [
  { label: 'Verify your identity', done: false },
  { label: 'Add a profile photo', done: false },
]

const personalSettings: MenuItem[] = [
  { label: 'My profile', icon: Pencil, iconBg: 'bg-rose-500/12', iconColor: 'text-rose-500' },
  { label: 'Delivery addresses', icon: MapPin, view: 'warehouseAddresses', iconBg: 'bg-teal/12', iconColor: 'text-teal-deep' },
  { label: 'Notifications', icon: Bell, iconBg: 'bg-gold/15', iconColor: 'text-gold' },
  { label: 'Regions & languages', icon: Globe, iconBg: 'bg-blue/12', iconColor: 'text-blue-deep' },
]

const helpItems: MenuItem[] = [
  { label: 'Help centre', icon: MessageCircle, iconBg: 'bg-ink/5', iconColor: 'text-ink/60' },
]

// Thin ring drawn with currentColor so it inherits whatever text-* class
// wraps it — no hardcoded hex, stays in sync with the app's real palette.
function ProgressRing({ completion, size = 64 }: { completion: number; size?: number }) {
  const stroke = 3
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference * (1 - completion)

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="currentColor" strokeOpacity={0.1} strokeWidth={stroke} className="text-ink" />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth={stroke}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        className="text-teal-deep transition-[stroke-dashoffset] duration-700 ease-out"
      />
    </svg>
  )
}

function SettingsRow({ label, icon: Icon, view, iconBg, iconColor, onClick, bordered }: MenuItem & { onClick: () => void; bordered: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-3.5 px-5 py-4 text-left transition-colors hover:bg-ink/[0.03] ${bordered ? 'border-t border-ink/10' : ''}`}
    >
      <span className={`grid size-9 flex-none place-items-center rounded-lg ${iconBg} ${iconColor}`} aria-hidden="true">
        <Icon size={16} strokeWidth={2} />
      </span>
      <span className="flex-1 text-sm font-semibold text-ink">{label}</span>
      <ChevronRight size={16} className="text-ink/30" />
    </button>
  )
}

export default function AccountHubPage() {
  const router = useRouter()
  const completion = PROFILE_CHECKLIST.filter((c) => c.done).length / PROFILE_CHECKLIST.length

  function go(view?: View) {
    if (view) router.push(pathForView(view))
  }

  return (
    <div className="mx-auto max-w-2xl px-6 pb-16 lg:px-10">
      <style>{`
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      {/* Quiet echo of the Home/Community hero — same masked illustration,
          scaled down so it sits behind the heading without competing with
          the profile ring right underneath it. */}
      <div className="relative -mt-4 flex min-h-[130px] items-end overflow-hidden pt-8 sm:min-h-[150px]">
        <div
          className="absolute inset-0 z-0 opacity-70"
          style={{
            maskImage: 'radial-gradient(ellipse 70% 80% at 65% 30%, black 45%, transparent 100%)',
            WebkitMaskImage: 'radial-gradient(ellipse 70% 80% at 65% 30%, black 45%, transparent 100%)',
          }}
        >
          <Image src="/Refs/top-main-bg.png" alt="" fill sizes="600px" className="object-cover object-top" />
        </div>
        <h1 className="relative z-10 font-display text-4xl text-ink sm:text-5xl motion-safe:[animation:fadeUp_0.35s_ease-out_both]">
          Account
        </h1>
      </div>

      {/* Profile — avatar wrapped in a completion ring, chips reflecting
          the exact checklist state. Empty ring is the honest state for a
          brand-new account, matching the 0 credits / 0 referrals pattern
          used everywhere else in the app. */}
      <div className="mt-6 flex items-center gap-5 motion-safe:[animation:fadeUp_0.4s_ease-out_both]" style={{ animationDelay: '40ms' }}>
        <div className="relative size-16 flex-none text-ink">
          <ProgressRing completion={completion} size={64} />
          <span className="absolute inset-[6px] grid place-items-center rounded-full bg-blue text-lg font-bold text-paper">
            S
          </span>
        </div>

        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <p className="font-display text-xl text-ink">Safnas Kaldeen</p>
            <span className="flex items-center gap-1 rounded-full bg-rust/10 px-2.5 py-1 text-[11px] font-semibold text-rust">
              <ShieldAlert size={11} /> Unverified
            </span>
          </div>
          <button className="mt-1 flex items-center gap-1 text-sm text-ink/55 transition-colors hover:text-ink">
            Edit personal info <ChevronRight size={14} />
          </button>

          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {PROFILE_CHECKLIST.map((item) => (
              <span
                key={item.label}
                className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                  item.done ? 'bg-teal/12 text-teal-deep' : 'border border-ink/15 text-ink/45'
                }`}
              >
                {item.done && <Check size={10} strokeWidth={3} />}
                {item.label}
              </span>
            ))}
          </div>
        </div>
      </div>

      <button
        className="mt-6 flex w-full items-center gap-4 rounded-2xl border border-ink/10 bg-card px-5 py-4 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-ink/20 hover:shadow-md hover:shadow-ink/5 motion-safe:[animation:fadeUp_0.4s_ease-out_both]"
        style={{ animationDelay: '80ms' }}
      >
        <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-gold/15 text-gold" aria-hidden="true">
          <Award size={20} strokeWidth={2} />
        </span>
        <span className="flex-1">
          <span className="block text-sm font-semibold text-ink">
            You&apos;ve unlocked <b className="text-rust">0</b> badge(s)
          </span>
          <span className="mt-0.5 block text-xs text-ink/45">
            Earn badges by shopping, reviewing, and inviting friends
          </span>
        </span>
        <ChevronRight size={16} className="flex-none text-ink/30" />
      </button>

      <div className="mt-4 grid grid-cols-2 gap-4">
        <button
          onClick={() => go('credits')}
          className="relative rounded-2xl border border-ink/10 bg-card p-5 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-ink/20 hover:shadow-md hover:shadow-ink/5 motion-safe:[animation:fadeUp_0.4s_ease-out_both]"
          style={{ animationDelay: '120ms' }}
        >
          <Sparkles size={16} className="absolute right-4 top-4 text-gold" />
          <p className="font-display text-2xl text-ink">{creditBalance}</p>
          <p className="mt-1 text-sm font-semibold text-ink/60">Credits</p>
        </button>
        <button
          onClick={() => go('promoCodes')}
          className="relative rounded-2xl border border-ink/10 bg-card p-5 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-ink/20 hover:shadow-md hover:shadow-ink/5 motion-safe:[animation:fadeUp_0.4s_ease-out_both]"
          style={{ animationDelay: '160ms' }}
        >
          <Ticket size={16} className="absolute right-4 top-4 text-gold" />
          <p className="font-display text-2xl text-ink">{promoCodes.length}</p>
          <p className="mt-1 text-sm font-semibold text-ink/60">Promo codes</p>
        </button>
      </div>

      <div
        className="mt-6 flex items-center justify-between gap-4 rounded-2xl bg-gold-soft/60 p-6 motion-safe:[animation:fadeUp_0.4s_ease-out_both]"
        style={{ animationDelay: '200ms' }}
      >
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

      <h2 className="mt-9 font-display text-xl text-ink motion-safe:[animation:fadeUp_0.4s_ease-out_both]" style={{ animationDelay: '240ms' }}>
        Personal settings
      </h2>
      <div
        className="mt-4 overflow-hidden rounded-2xl border border-ink/10 bg-card motion-safe:[animation:fadeUp_0.4s_ease-out_both]"
        style={{ animationDelay: '260ms' }}
      >
        {personalSettings.map((item, index) => (
          <SettingsRow key={item.label} {...item} bordered={index > 0} onClick={() => go(item.view)} />
        ))}
      </div>

      <h2 className="mt-8 font-display text-xl text-ink motion-safe:[animation:fadeUp_0.4s_ease-out_both]" style={{ animationDelay: '300ms' }}>
        Help
      </h2>
      <div
        className="mt-4 overflow-hidden rounded-2xl border border-ink/10 bg-card motion-safe:[animation:fadeUp_0.4s_ease-out_both]"
        style={{ animationDelay: '320ms' }}
      >
        {helpItems.map((item, index) => (
          <SettingsRow key={item.label} {...item} bordered={index > 0} onClick={() => go(item.view)} />
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