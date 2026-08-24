import { Globe, Link2, QrCode, Smartphone, Star } from 'lucide-react'

const socialLinks = [
  { label: 'India2Lanka Sri Lanka', icon: Link2, href: '#' },
  { label: 'india2lanka.goodies', icon: Star, href: '#' },
]

const columns = [
  {
    heading: 'About India2Lanka',
    links: ['About us', 'Join us'],
  },
  {
    heading: 'Shipping supports',
    links: ['Overseas warehouses', 'Prohibited items', 'Tutorials'],
  },
  {
    heading: 'Help',
    links: ['Beginner tips', 'Contact us'],
  },
]

export default function Footer() {
  return (
    <footer id="help" className="border-t border-ink/10">
      <div className="mx-auto max-w-7xl px-6 pb-10 pt-16 lg:px-10">
        <div className="flex flex-col gap-12 pb-12 lg:flex-row lg:gap-14">
          <div className="lg:w-56 lg:flex-none">
            <p className="font-display text-2xl font-semibold text-ink">
              India<span className="text-rust">2</span>Lanka
            </p>
            <p className="mt-3 text-sm text-ink/60">Shop more. Wait less. Delivered home.</p>
          </div>

          <div className="lg:w-60 lg:flex-none">
            <h4 className="text-xs font-semibold uppercase tracking-widest text-muted">Follow us</h4>
            <div className="mt-3.5 flex flex-col gap-3">
              {socialLinks.map(({ label, icon: Icon, href }) => (
                <a key={label} href={href} className="flex items-center gap-2.5 text-sm font-medium text-ink/80 hover:text-ink">
                  <Icon size={17} /> {label}
                </a>
              ))}
            </div>

            <div className="mt-5 grid h-24 w-24 place-items-center rounded-xl border border-ink/15 bg-card text-ink/30">
              <QrCode size={64} strokeWidth={1.25} />
            </div>
            <p className="mt-2 text-[11px] text-muted">Scan to download the app</p>

            <div className="mt-4 flex flex-wrap gap-2">
              <span className="flex items-center gap-1.5 rounded-lg border border-ink/15 px-3 py-2 text-xs font-semibold text-ink/80">
                <Smartphone size={15} /> App Store
              </span>
              <span className="flex items-center gap-1.5 rounded-lg border border-ink/15 px-3 py-2 text-xs font-semibold text-ink/80">
                <Smartphone size={15} /> Google Play
              </span>
            </div>
          </div>

          <div className="grid flex-1 grid-cols-2 gap-8 sm:grid-cols-3">
            {columns.map((column) => (
              <div key={column.heading} className="flex flex-col gap-3.5">
                <h4 className="text-xs font-semibold uppercase tracking-widest text-muted">{column.heading}</h4>
                {column.links.map((link) => (
                  <a key={link} href="#" className="text-sm font-medium text-ink/70 hover:text-ink">
                    {link}
                  </a>
                ))}
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-ink/10 pt-6 text-xs text-muted">
          <span>&copy; 2026 India2Lanka Limited</span>
          <a href="#" className="hover:text-ink">Terms of Use</a>
          <a href="#" className="hover:text-ink">Privacy Policy</a>
          <span className="ml-auto flex items-center gap-1.5">
            <Globe size={14} /> Sri Lanka &ndash; English
          </span>
        </div>
      </div>
    </footer>
  )
}
