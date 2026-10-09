// app/seller/(dashboard)/SellerNav.tsx
//
// Seller portal navigation: a left rail on desktop, a bottom tab bar on
// phones (sellers mostly work from their phone), with "Add product" as
// the centre tab.
'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ExternalLink, House, LogOut, MessageCircle, Package, Plus, Store } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'

const WHATSAPP = (process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || '').replace(/\D/g, '')

const items = [
  { href: '/seller', label: 'Overview', icon: House, exact: true },
  { href: '/seller/products', label: 'Products', icon: Package },
  { href: '/seller/account', label: 'Store profile', icon: Store },
]

function isActive(pathname: string, href: string, exact?: boolean) {
  return exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`)
}

export function SellerSideNav({ storeSlug, live }: { storeSlug: string; live: boolean }) {
  const pathname = usePathname()
  const { logout } = useAuth()
  return (
    <nav className="flex flex-1 flex-col gap-1" aria-label="Seller portal">
      {items.map(({ href, label, icon: Icon, exact }) => {
        const on = isActive(pathname, href, exact)
        return (
          <Link
            key={href}
            href={href}
            aria-current={on ? 'page' : undefined}
            className={`flex items-center gap-3 rounded-xl px-3 py-2.5 font-body text-[15px] font-medium transition-colors ${
              on ? 'bg-parchment/12 text-parchment' : 'text-parchment/65 hover:bg-parchment/5 hover:text-parchment'
            }`}
          >
            <Icon size={18} strokeWidth={on ? 2.2 : 1.8} />
            {label}
          </Link>
        )
      })}
      <Link
        href="/seller/products?new=1"
        className="mt-3 flex items-center justify-center gap-2 rounded-xl bg-gold px-3 py-2.5 font-body text-sm font-semibold text-indigo transition-colors hover:bg-parchment"
      >
        <Plus size={16} /> Add product
      </Link>

      <div className="mt-auto flex flex-col gap-1 border-t border-parchment/10 pt-4">
        <a
          href={`/stores/${storeSlug}`}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-3 rounded-xl px-3 py-2 font-body text-sm text-parchment/65 hover:text-parchment"
        >
          <ExternalLink size={16} /> {live ? 'View my store' : 'Preview my store'}
        </a>
        {WHATSAPP && (
          <a
            href={`https://wa.me/${WHATSAPP}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 rounded-xl px-3 py-2 font-body text-sm text-parchment/65 hover:text-parchment"
          >
            <MessageCircle size={16} /> Message Wishdrop
          </a>
        )}
        <button
          type="button"
          onClick={logout}
          className="flex items-center gap-3 rounded-xl px-3 py-2 text-left font-body text-sm text-parchment/65 hover:text-parchment"
        >
          <LogOut size={16} /> Sign out
        </button>
      </div>
    </nav>
  )
}

export function SellerTabBar() {
  const pathname = usePathname()
  const [overview, products, profile] = items
  const tab = (item: (typeof items)[number]) => {
    const on = isActive(pathname, item.href, item.exact)
    const Icon = item.icon
    return (
      <Link
        key={item.href}
        href={item.href}
        aria-current={on ? 'page' : undefined}
        className={`flex flex-1 flex-col items-center gap-0.5 py-2 font-body text-[11px] font-medium ${on ? 'text-indigo' : 'text-ink/50'}`}
      >
        <Icon size={21} strokeWidth={on ? 2.3 : 1.8} />
        {item.label === 'Store profile' ? 'Profile' : item.label}
      </Link>
    )
  }
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 flex items-end border-t border-ink/10 bg-card/95 px-2 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden"
      aria-label="Seller portal"
    >
      {tab(overview)}
      {tab(products)}
      <Link href="/seller/products?new=1" aria-label="Add product" className="flex flex-1 flex-col items-center gap-0.5 pb-2 font-body text-[11px] font-medium text-ink/60">
        <span className="-mt-5 grid h-12 w-12 place-items-center rounded-full bg-indigo text-parchment shadow-lg ring-4 ring-card">
          <Plus size={22} />
        </span>
        Add
      </Link>
      {tab(profile)}
      <SignOutTab />
    </nav>
  )
}

function SignOutTab() {
  const { logout } = useAuth()
  return (
    <button type="button" onClick={logout} className="flex flex-1 flex-col items-center gap-0.5 py-2 font-body text-[11px] font-medium text-ink/50">
      <LogOut size={21} strokeWidth={1.8} />
      Sign out
    </button>
  )
}
