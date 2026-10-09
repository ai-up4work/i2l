// app/seller/(dashboard)/seller-nav-items.ts
// The seller portal's main destinations, shared by the desktop rail
// (SellerSideNav) and the phone tab bar (SellerTabBar).
import { House, Package, Store } from 'lucide-react'

export const SELLER_NAV_ITEMS = [
  { href: '/seller', label: 'Overview', icon: House, exact: true },
  { href: '/seller/products', label: 'Products', icon: Package, exact: false },
  { href: '/seller/account', label: 'Store profile', icon: Store, exact: false },
]

export function isActiveNav(pathname: string, href: string, exact?: boolean) {
  return exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`)
}
