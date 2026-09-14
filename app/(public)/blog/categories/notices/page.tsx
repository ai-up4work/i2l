import Link from 'next/link'
import { AlertTriangle, CheckCircle2, Info } from 'lucide-react'

export const metadata = {
  title: 'Service Notices | WishDrop',
  description: 'Warehouse updates, delivery delays, and platform service alerts.',
}

type Notice = {
  date: string
  title: string
  text: string
  level: 'info' | 'warning' | 'resolved'
}

const notices: Notice[] = [
  {
    date: '10 Sep 2026',
    title: 'Customs processing running slightly longer than usual',
    text: 'Sri Lanka Customs is currently experiencing higher-than-normal clearance volumes. Shipments already in transit may take a few extra days beyond the estimate shown on your order. No action is needed on your part.',
    level: 'warning',
  },
  {
    date: '2 Sep 2026',
    title: 'WhatsApp order updates restored',
    text: 'A brief delay in WhatsApp order-status notifications earlier this week has been resolved. All order updates are now sending normally. If you\u2019re still missing notifications, check that your number is verified under Account settings.',
    level: 'resolved',
  },
  {
    date: '20 Aug 2026',
    title: 'New Express delivery option added',
    text: 'Express delivery is now available alongside Economy on eligible orders, with faster average transit time. You can choose your preferred speed at checkout on eligible requests.',
    level: 'info',
  },
]

const levelStyles: Record<Notice['level'], { icon: typeof Info; className: string }> = {
  info: { icon: Info, className: 'bg-teal/10 text-teal-deep' },
  warning: { icon: AlertTriangle, className: 'bg-gold/15 text-gold-deep' },
  resolved: { icon: CheckCircle2, className: 'bg-teal/10 text-teal-deep' },
}

export default function ServiceNoticesPage() {
  return (
    <main className="mx-auto max-w-4xl px-6 py-16 lg:px-10 lg:py-24">
      <p className="font-body text-xs font-semibold uppercase tracking-[0.2em] text-gold-deep">
        Service notices
      </p>
      <h1 className="mt-3 font-display text-4xl font-semibold tracking-tight text-ink sm:text-5xl">
        Warehouse updates & service alerts
      </h1>
      <p className="mt-4 max-w-2xl font-body text-base leading-relaxed text-ink/65">
        Anything that could affect your order timelines — facility updates, customs delays, or
        platform changes — is posted here first.
      </p>

      <div className="mt-12 flex flex-col gap-4">
        {notices.map((notice) => {
          const { icon: Icon, className } = levelStyles[notice.level]
          return (
            <div key={notice.title} className="flex gap-4 rounded-2xl border border-ink/10 bg-card p-6">
              <div className={`flex h-10 w-10 flex-none items-center justify-center rounded-xl ${className}`}>
                <Icon size={18} />
              </div>
              <div>
                <p className="font-body text-xs text-ink/40">{notice.date}</p>
                <h2 className="mt-1 font-display text-lg font-semibold text-ink">{notice.title}</h2>
                <p className="mt-1.5 font-body text-sm leading-relaxed text-ink/60">{notice.text}</p>
              </div>
            </div>
          )
        })}
      </div>

      <p className="mt-12 font-body text-sm text-ink/55">
        Don't see an update about your specific order? Check{' '}
        <Link href="/account/orders/track" className="text-teal-deep underline underline-offset-2">Track Order</Link>{' '}
        first, or <Link href="/contact" className="text-teal-deep underline underline-offset-2">contact support</Link>.
      </p>
    </main>
  )
}
