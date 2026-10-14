// app/seller/(dashboard)/seller-nav-items.ts
// The seller portal's main destinations, shared by the desktop rail
// (SellerSideNav) and the phone tab bar (SellerTabBar). The list comes
// from sellerNavFor() in lib/store-modules: the standard portal, or a
// custom store's own sections (e.g. Case Craft's print jobs).
import { House, Images, Package, Printer, ReceiptText, Store } from 'lucide-react'
import type { SellerNavItem } from '@/lib/store-modules'

export const SELLER_NAV_ICONS: Record<SellerNavItem['icon'], typeof House> = {
  overview: House,
  products: Package,
  profile: Store,
  orders: Printer,
  designs: Images,
  pricing: ReceiptText,
}

export function isActiveNav(pathname: string, href: string, exact?: boolean) {
  return exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`)
}
