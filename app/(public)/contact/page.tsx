import { Mail, MapPin, MessageCircle, Phone } from 'lucide-react'
import ContactForm from '@/components/shared/ContactForm'
import { buildWhatsAppLink } from '@/lib/chat/waLink'
import { pageMetadata } from '@/lib/seo'

export const metadata = pageMetadata({
  path: '/contact',
  title: 'Contact Us | WishDrop',
  description: 'Get in touch with WishDrop support — WhatsApp, email, phone, or send a message directly.',
})

// Sri Lankan mobile number 0770774828 in the +CC-no-leading-zero shape
// wa.me/tel: links need, kept in one place so the WhatsApp and Phone
// channels below can never drift apart the way the display text and
// the (previously nonexistent) link would have otherwise.
const PHONE_LOCAL = '0770774828'
const PHONE_INTL = '+94770774828'

const channels = [
  {
    icon: MessageCircle,
    title: 'WhatsApp & in-app chat',
    detail: "Fastest for order-specific questions — we can see your request or order history.",
    action: 'Open WhatsApp',
    // Same buildWhatsAppLink() the floating chat widget's "Continue on
    // WhatsApp" button already uses (contexts/ChatContext.tsx) — one
    // shared number (NEXT_PUBLIC_WHATSAPP_NUMBER), not a second
    // hardcoded copy that could quietly go stale here while that one
    // gets updated.
    href: buildWhatsAppLink(null, "Hi, I have a question about WishDrop."),
  },
  {
    icon: Mail,
    title: 'Email',
    detail: "support@wishdrop.shop — for anything that needs attachments or isn't urgent.",
    action: 'support@wishdrop.shop',
    href: 'mailto:support@wishdrop.shop',
  },
  {
    icon: Phone,
    title: 'Phone',
    detail: 'Available during business hours for account and delivery issues.',
    action: PHONE_LOCAL,
    href: `tel:${PHONE_INTL}`,
  },
]

export default function ContactPage() {
  return (
    <main className="mx-auto max-w-6xl px-6 py-16 lg:px-10 lg:py-24">
      <div className="max-w-2xl">
        <p className="font-body text-xs font-semibold uppercase tracking-[0.2em] text-gold-deep">
          We're here to help
        </p>
        <h1 className="mt-3 font-display text-4xl font-semibold tracking-tight text-ink sm:text-5xl">
          Contact us
        </h1>
        <p className="mt-4 font-body text-base leading-relaxed text-ink/65">
          Have a question about a request, an order, or WishDrop in general? Reach us however is
          easiest — for anything tied to a specific order, signing in first helps us answer faster.
        </p>
      </div>

      <div className="mt-12 grid gap-10 lg:grid-cols-[1fr_1.1fr] lg:gap-16">
        <div className="flex flex-col gap-4">
          {channels.map(({ icon: Icon, title, detail, action, href }) => (
            <div key={title} className="flex gap-4 rounded-2xl border border-ink/10 bg-card p-5">
              <div className="flex h-11 w-11 flex-none items-center justify-center rounded-xl bg-teal/10 text-teal-deep">
                <Icon size={20} />
              </div>
              <div>
                <h2 className="font-display text-base font-semibold text-ink">{title}</h2>
                <p className="mt-1 font-body text-sm leading-relaxed text-ink/60">{detail}</p>
                <a
                  href={href}
                  target={href.startsWith('http') ? '_blank' : undefined}
                  rel={href.startsWith('http') ? 'noopener noreferrer' : undefined}
                  className="mt-2 inline-block font-body text-sm font-semibold text-teal-deep transition-colors hover:text-teal-deep/80 hover:underline"
                >
                  {action}
                </a>
              </div>
            </div>
          ))}

          <div className="flex gap-4 rounded-2xl border border-ink/10 bg-card p-5">
            <div className="flex h-11 w-11 flex-none items-center justify-center rounded-xl bg-teal/10 text-teal-deep">
              <MapPin size={20} />
            </div>
            <div>
              <h2 className="font-display text-base font-semibold text-ink">Registered office</h2>
              <p className="mt-1 font-body text-sm leading-relaxed text-ink/60">
                WishDrop Limited, Colombo, Sri Lanka. Support is handled remotely — this address is
                not a walk-in service centre.
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-3xl border border-ink/10 bg-card p-6 sm:p-8">
          <ContactForm />
        </div>
      </div>
    </main>
  )
}