'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ChevronDown, ChevronRight, Download, Globe, Menu, X } from 'lucide-react'
import BrandMark from '@/components/shared/BrandMark'
import AirmailStripe from '@/components/shared/AirmailStripe'

const navLinks = [
  { href: '#shipping', label: 'Shipping', hasMenu: true },
  { href: '#shopping', label: 'Shopping', hasMenu: true },
  { href: '#destinations', label: 'Discovery', hasMenu: true },
  { href: '#help', label: 'Support', hasMenu: false },
]



export default function Header() {
  const [open, setOpen] = useState(false)

  // The overlay covers the whole screen rather than pushing content down,
  // so lock background scroll while it's open.
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    return () => {
      document.body.style.overflow = ''
    }
  }, [open])

  return (
    <>
      <header className="sticky top-0 z-50 bg-paper/95 backdrop-blur">
        <AirmailStripe />

        <div className="mx-auto flex h-16 max-w-8xl items-center gap-4 px-6 lg:gap-6">
          <Link href="/" className="flex items-center gap-2 font-display text-2xl font-semibold tracking-tight text-ink">
            <BrandMark />
          </Link>

          <nav className="ml-auto hidden items-center gap-8 lg:flex">
            {navLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="group flex items-center gap-1 text-sm font-medium text-ink/80 transition-colors hover:text-ink"
              >
                {link.label}
                {link.hasMenu && (
                  <ChevronDown size={14} className="text-muted transition-colors group-hover:text-ink" />
                )}
              </a>
            ))}
          </nav>

          <div className="hidden items-center gap-4 lg:flex">
            <a
              href="#app"
              className="flex items-center gap-2 rounded-full border border-ink/15 px-4 py-2.5 text-sm font-semibold text-ink transition-colors hover:border-ink/30"
            >
              <Download size={15} /> Get the app
            </a>
            <a href="/account" className="text-sm font-semibold text-ink/80 hover:text-ink">
              Log in
            </a>
            <a
              href="/account"
              className="rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-paper transition-colors hover:bg-blue-deep"
            >
              Sign up
            </a>
          </div>

          {/* Mobile-only: sign-up pill + menu toggle */}
          <div className="ml-auto flex items-center gap-3 lg:hidden">
            <a
              href="/account"
              className="rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-paper transition-colors hover:bg-blue-deep"
            >
              Sign up now
            </a>
            <button
              aria-label={open ? 'Close menu' : 'Open menu'}
              aria-expanded={open}
              onClick={() => setOpen((value) => !value)}
              className="rounded-lg p-1 text-ink"
            >
              {open ? <X size={26} /> : <Menu size={26} />}
            </button>
          </div>
        </div>
      </header>

      {/* Full-viewport overlay, rendered as a sibling of <header> rather
          than nested inside it — sitting a fixed child under a sticky
          parent with a hardcoded pixel offset is fragile (stacking
          context and layout-timing issues); covering the whole screen
          and repainting its own top bar avoids that entirely. */}
      {open && (
        <div className="fixed inset-0 z-[100] flex h-dvh flex-col bg-paper lg:hidden">
          <AirmailStripe />

          <div className="flex h-20 flex-none items-center justify-between px-6">
            <span className="flex items-center gap-2 font-display text-2xl font-semibold tracking-tight text-ink">
              <BrandMark className="h-8 w-8" />
            </span>
            <div className="flex items-center gap-3">
              <a
                href="/account"
                onClick={() => setOpen(false)}
                className="rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-paper transition-colors hover:bg-blue-deep"
              >
                Sign up now
              </a>
              <button
                aria-label="Close menu"
                onClick={() => setOpen(false)}
                className="rounded-lg p-1 text-ink"
              >
                <X size={26} />
              </button>
            </div>
          </div>

          <nav className="min-h-0 flex-1 overflow-y-auto" aria-label="Mobile navigation">
            {navLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className="flex items-center justify-between border-b border-ink/10 px-6 py-5 text-base font-semibold text-ink"
              >
                {link.label}
                <ChevronRight size={18} className="text-ink/40" />
              </a>
            ))}
          </nav>

          <div className="flex-none space-y-3 px-6 pb-8 pt-4">
            <a
              href="/account"
              onClick={() => setOpen(false)}
              className="block rounded-xl border border-ink/25 py-3.5 text-center text-sm font-semibold text-ink transition-colors hover:bg-ink/5"
            >
              Login
            </a>
            <a
              href="#app"
              onClick={() => setOpen(false)}
              className="block rounded-xl bg-ink py-3.5 text-center text-sm font-semibold text-paper transition-colors hover:bg-blue-deep"
            >
              Download App
            </a>
            <div className="flex items-center justify-center gap-2 pt-1 text-sm font-medium text-ink/70">
              <Globe size={15} className="text-rust" /> Sri Lanka &ndash; English
            </div>
          </div>
        </div>
      )}
    </>
  )
}
