import Link from 'next/link'
import { AlertTriangle, CheckCircle2, Info } from 'lucide-react'
import { PageHero, Section } from '@/components/public/PageKit'
import { pageMetadata } from '@/lib/seo'

export const metadata = pageMetadata({
  path: '/blog/categories/notices',
  title: 'Service Notices | Wishdrop',
  description: 'Warehouse updates, delivery delays, and platform service alerts.',
})

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
  info: { icon: Info, className: 'bg-indigo/[0.07] text-indigo' },
  warning: { icon: AlertTriangle, className: 'bg-gold/15 text-gold-deep' },
  resolved: { icon: CheckCircle2, className: 'bg-teal/10 text-teal-deep' },
}

const LEVEL_LABEL: Record<Notice['level'], string> = { info: 'Update', warning: 'Heads up', resolved: 'Resolved' }

export default function ServiceNoticesPage() {
  return (
    <main>
      <PageHero
        eyebrow="Service notices"
        title="Updates &"
        accent="service alerts."
        intro="Anything that could affect your order timeline — facility updates, customs delays or platform changes — is posted here first."
        width="narrow"
      />

      <Section width="narrow">
        <ol className="relative flex flex-col gap-4 border-l-2 border-dashed border-indigo/15 pl-6 sm:pl-8">
          {notices.map((notice) => {
            const { icon: Icon, className } = levelStyles[notice.level]
            return (
              <li key={notice.title} className="relative">
                <span className={`absolute -left-[2.45rem] top-6 grid h-9 w-9 place-items-center rounded-full ring-4 ring-parchment sm:-left-[2.95rem] ${className}`}>
                  <Icon size={16} />
                </span>
                <div className="rounded-3xl bg-card p-6 ring-1 ring-ink/[0.08]">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-2.5 py-0.5 font-body text-[11px] font-bold uppercase tracking-wide ${className}`}>
                      {LEVEL_LABEL[notice.level]}
                    </span>
                    <span className="font-body text-xs text-ink/45">{notice.date}</span>
                  </div>
                  <h2 className="mt-2 font-display text-xl font-semibold text-indigo">{notice.title}</h2>
                  <p className="mt-1.5 font-body text-sm leading-relaxed text-ink/60">{notice.text}</p>
                </div>
              </li>
            )
          })}
        </ol>

        <p className="mt-10 font-body text-sm text-ink/55">
          Don&apos;t see an update about your order? Check{' '}
          <Link href="/account/orders" className="font-semibold text-teal-deep underline underline-offset-2">
            My orders
          </Link>{' '}
          first, or{' '}
          <Link href="/contact" className="font-semibold text-teal-deep underline underline-offset-2">
            contact support
          </Link>
          .
        </p>
      </Section>
    </main>
  )
}
