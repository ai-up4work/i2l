import { CheckCircle2, Info } from 'lucide-react'
import { Card, CtaEnvelope, PageHero, Section, Steps } from '@/components/public/PageKit'

export interface MarketplaceGuideProps {
  name: string
  tagline: string
  description: string
  bestFor: string[]
  tips: string[]
  storeHref?: string
}

export default function MarketplaceGuide({
  name,
  tagline,
  description,
  bestFor,
  tips,
  storeHref,
}: MarketplaceGuideProps) {
  return (
    <main>
      <PageHero eyebrow="Store guide" title="Buying from" accent={`${name}.`} intro={<><span className="font-semibold text-ink/75">{tagline}</span> {description}</>} />

      <Section>
        <div className="grid gap-5 md:grid-cols-2">
          <Card>
            <h2 className="font-display text-xl font-semibold text-indigo">Good for</h2>
            <ul className="mt-4 flex flex-col gap-3">
              {bestFor.map((item) => (
                <li key={item} className="flex items-start gap-2.5 font-body text-sm leading-relaxed text-ink/65">
                  <CheckCircle2 size={17} className="mt-0.5 flex-none text-teal-deep" />
                  {item}
                </li>
              ))}
            </ul>
          </Card>
          <Card>
            <h2 className="font-display text-xl font-semibold text-indigo">Tips before you order</h2>
            <ul className="mt-4 flex flex-col gap-3">
              {tips.map((item) => (
                <li key={item} className="flex items-start gap-2.5 font-body text-sm leading-relaxed text-ink/65">
                  <Info size={17} className="mt-0.5 flex-none text-gold-deep" />
                  {item}
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </Section>

      <Section eyebrow="Step by step" title={`How to order from ${name}`}>
        <Steps
          steps={[
            { title: 'Copy the link', text: `Find the item on ${name} and copy its product page link.` },
            { title: 'Paste it in', text: 'Paste it into a new request and add any size, colour or quantity details.' },
            { title: 'Check your quote', text: 'See the product price, service fee, freight and customs — then confirm.' },
            { title: 'We do the rest', text: 'Wishdrop buys it, checks it at quality control, and delivers it to you.' },
          ]}
        />
      </Section>

      <CtaEnvelope
        title={`Found something on ${name}?`}
        primary={{ href: '/account/requests/new', label: 'Start a request' }}
        secondary={storeHref ? { href: storeHref, label: 'Browse stores' } : undefined}
      />
    </main>
  )
}
