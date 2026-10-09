// app/seller/(dashboard)/SellerTabBar.tsx
//
// The phone bottom tab bar of the seller portal, with "Add product" as the
// centre tab. The desktop rail is SellerSideNav.tsx.
'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LogOut, Plus } from 'lucide-react'
import { SELLER_NAV_ITEMS as items } from './seller-nav-items'
import { isActiveNav as isActive } from './seller-nav-items'
import { useAuth } from '@/contexts/AuthContext'

export default function SellerTabBar() {
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
