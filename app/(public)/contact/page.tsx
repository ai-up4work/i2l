import { Mail, MapPin, MessageCircle, Phone } from 'lucide-react'
import { Container, IconTile, PageHero } from '@/components/public/PageKit'
import ContactForm from '@/components/shared/ContactForm'
import { buildWhatsAppLink } from '@/lib/chat/waLink'
import { pageMetadata } from '@/lib/seo'

export const metadata = pageMetadata({
  path: '/contact',
  title: 'Contact Us | Wishdrop',
  description: 'Get in touch with Wishdrop support — WhatsApp, email, phone, or send a message directly.',
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
    href: buildWhatsAppLink(null, "Hi, I have a question about Wishdrop."),
  },
  {
    icon: Mail,
    title: 'Email',
    detail: "support@Wishdrop.shop — for anything that needs attachments or isn't urgent.",
    action: 'support@Wishdrop.shop',
    href: 'mailto:support@Wishdrop.shop',
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
    <main>
      <PageHero
        eyebrow="We’re here to help"
        title="Talk to a"
        accent="real person."
        intro="A question about a request, an order, or whether we can get something? Reach us however is easiest. For anything about a specific order, include your order number so we can answer faster."
      />

      <Container className="pb-20 lg:pb-24">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:gap-10">
          <div className="flex flex-col gap-3">
            {channels.map(({ icon, title, detail, action, href }) => (
              <a
                key={title}
                href={href}
                target={href.startsWith('http') ? '_blank' : undefined}
                rel={href.startsWith('http') ? 'noopener noreferrer' : undefined}
                className="group flex items-start gap-4 rounded-3xl bg-card p-5 ring-1 ring-ink/[0.08] transition-all hover:-translate-y-0.5 hover:ring-teal/30"
              >
                <IconTile icon={icon} />
                <div className="min-w-0">
                  <h2 className="font-display text-lg font-semibold text-indigo">{title}</h2>
                  <p className="mt-1 font-body text-sm leading-relaxed text-ink/60">{detail}</p>
                  <span className="mt-2 inline-block font-body text-sm font-semibold text-teal-deep group-hover:underline">{action}</span>
                </div>
              </a>
            ))}

            <div className="flex items-start gap-4 rounded-3xl bg-indigo p-5 text-parchment">
              <span className="grid h-11 w-11 flex-none place-items-center rounded-2xl bg-parchment/10 text-gold">
                <MapPin size={20} strokeWidth={1.9} />
              </span>
              <div>
                <h2 className="font-display text-lg font-semibold">Registered office</h2>
                <p className="mt-1 font-body text-sm leading-relaxed text-parchment/70">
                  Wishdrop Limited, Colombo, Sri Lanka. Support is handled remotely — this address is not a walk-in
                  service centre.
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-3xl bg-card p-6 ring-1 ring-ink/[0.08] sm:p-8">
            <ContactForm />
          </div>
        </div>
      </Container>
    </main>
  )
}
