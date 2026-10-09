// app/seller/(dashboard)/SellerSideNav.tsx
//
// The desktop left rail of the seller portal: Overview, Products, Store
// profile, Add product, view/preview store, help and sign out. Phones get
// SellerTabBar.tsx instead.
'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ExternalLink, LogOut, MessageCircle, Plus } from 'lucide-react'
import { SELLER_NAV_ITEMS as items, isActiveNav as isActive } from './seller-nav-items'
import { useAuth } from '@/contexts/AuthContext'

const WHATSAPP = (process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || '').replace(/\D/g, '')

export default function SellerSideNav({ storeSlug, live }: { storeSlug: string; live: boolean }) {
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

