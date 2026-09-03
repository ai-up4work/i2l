import { Globe, Link2, Smartphone, Star } from 'lucide-react'
import Image from 'next/image'
import BrandMark from '@/components/shared/BrandMark'
import AirmailStripe from '../shared/AirmailStripe'

const socialLinks = [
  { label: 'WishDROP Sri Lanka', icon: Link2, href: '#' },
  { label: 'wishdrop.goodies', icon: Star, href: '#' },
]

const columns = [
  {
    heading: 'About WishDROP',
    links: [{label: 'About us', href: 'about'}, {label: 'Privacy policy', href: 'privacy'}, {label: 'Taxation', href: 'taxation'}],
  },
  {
    heading: 'Shipping supports',
    links: [{label: 'Overseas warehouses', href: '/warehouses'}, {label: 'Prohibited items', href: 'prohibited-items'}, {label: 'Tutorials', href: 'tutorials'}],
  },
  {
    heading: 'Help',
    links: [{label: 'Refund policy', href: 'refund-policy'}, {label: 'Contact us', href: 'contact'}],
  },
]

export default function Footer() {
  return (
    <footer id="help" className="border-t border-ink/10">
      <div className="mx-auto max-w-7xl px-6 pb-10 pt-16 lg:px-10">
        <div className="flex flex-col gap-12 pb-12 lg:flex-row lg:gap-14">
          <div className="lg:w-56 lg:flex-none">
            <BrandMark />
            <p className="mt-3 font-body text-sm text-ink/60">Shop more. Wait less. Delivered home.</p>
          </div>

          <div className="lg:w-60 lg:flex-none">
            <h4 className="font-body text-xs font-semibold uppercase tracking-widest text-ink/40">
              Follow us
            </h4>
            <div className="mt-3.5 flex flex-col gap-3">
              {socialLinks.map(({ label, icon: Icon, href }) => (
                <a
                  key={label}
                  href={href}
                  className="flex items-center gap-2.5 font-body text-sm font-medium text-ink/80 transition-colors hover:text-teal"
                >
                  <Icon size={17} /> {label}
                </a>
              ))}
            </div>

            <p className="mt-2 font-body text-[11px] text-ink/40">Scan to download the app</p>

            <div className="mt-4 flex flex-wrap gap-2">
              <span className="flex items-center gap-1.5 rounded-lg border border-ink/15 px-3 py-2 font-body text-xs font-semibold text-ink/80">
                <Smartphone size={15} /> App Store
              </span>
              <span className="flex items-center gap-1.5 rounded-lg border border-ink/15 px-3 py-2 font-body text-xs font-semibold text-ink/80">
                <Smartphone size={15} /> Google Play
              </span>
            </div>
          </div>

          <div className="grid flex-1 grid-cols-2 gap-8 sm:grid-cols-3">
            {columns.map((column) => (
              <div key={column.heading} className="flex flex-col gap-3.5">
                <h4 className="font-body text-xs font-semibold uppercase tracking-widest text-ink/40">
                  {column.heading}
                </h4>
                {column.links.map((link) => (
                  <a
                    key={link.label}
                    href={link.href}
                    className="font-body text-sm font-medium text-ink/70 transition-colors hover:text-ink"
                  >
                    {link.label}
                  </a>
                ))}
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-ink/10 pt-6 font-body text-xs text-ink/40">
          <span>&copy; 2026 WishDROP Limited</span>
          <a href="/terms" className="transition-colors hover:text-ink">
            Terms of Use
          </a>
          <span className="ml-auto flex items-center gap-1.5">
            <Globe size={14} /> Sri Lanka &ndash; English
          </span>
        </div>
      </div>
      <AirmailStripe />
    </footer>
  )
}