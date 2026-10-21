'use client'

// components/shared/PublicMobileNav.tsx
//
// The account area's phone bottom bar (MobileBottomNav), on every public
// page too, so a shopper can always paste a link (centre +), open the
// stores sheet, or reach their orders and account from a phone.
// Shown on product pages too; their "Add to bag" bar floats just above it
// (StickyBuyBar in components/stores/social/SocialProductExtras.tsx).

import { useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import MobileBottomNav from '@/components/dashboard/MobileBottomNav'
import AddRequestOverlay from '@/components/dashboard/AddRequestOverlay'
import ShopBottomSheet from '@/components/stores/ShopBottomSheet'
import Sidebar from '@/components/dashboard/Sidebar'
import { useAuth } from '@/contexts/AuthContext'
import { pathForView } from '@/components/dashboard/routes'
import type { View } from '@/components/dashboard/types'

/** Pages that own the bottom of the screen on phones (none right now —
 *  product pages stack their buy bar above this one instead). */
export function hidesPublicMobileNav(_pathname: string | null): boolean {
  return false
}

function viewForPublicPath(pathname: string | null): View {
  if (pathname === '/') return 'home'
  if (pathname === '/stores' || pathname?.startsWith('/stores/')) return 'affiliatedStores'
  // No tab is "current" on other public pages.
  return '__public' as View
}

export default function PublicMobileNav() {
  const pathname = usePathname()
  const router = useRouter()
  const [shopOpen, setShopOpen] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [link, setLink] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)
  const { logout } = useAuth()

  if (hidesPublicMobileNav(pathname)) return null

  function navigate(view: View) {
    if (view === 'home') return router.push('/')
    if (view === 'account') return router.push('/account')
    router.push(pathForView(view))
  }

  function submit(event: React.FormEvent) {
    event.preventDefault()
    const url = link.trim()
    if (!url) return
    setLink('')
    // The account home picks up ?link= and starts the request
    // (app/account/page.tsx); signed-out shoppers sign in first and come back.
    router.push(`/account?link=${encodeURIComponent(url)}`)
  }

  return (
    <>
      <MobileBottomNav
        view={viewForPublicPath(pathname)}
        onNavigate={navigate}
        onOpenShop={() => setShopOpen(true)}
        onOpenAddRequest={() => setAddOpen(true)}
        isAddRequestOpen={addOpen}
        onOpenMenu={() => setMenuOpen(true)}
        isMenuOpen={menuOpen}
      />
      {/* The account side menu as a phone drawer (desktop never shows it here). */}
      <div className="lg:hidden">
        <Sidebar
          view={viewForPublicPath(pathname)}
          onNavigate={(v) => {
            setMenuOpen(false)
            navigate(v)
          }}
          onLogoClick={() => {
            setMenuOpen(false)
            router.push('/')
          }}
          onSignOut={() => {
            setMenuOpen(false)
            void logout()
          }}
          mobileOpen={menuOpen}
          onMobileClose={() => setMenuOpen(false)}
        />
      </div>
      <ShopBottomSheet open={shopOpen} onClose={() => setShopOpen(false)} onAddRequest={() => setAddOpen(true)} />
      <AddRequestOverlay open={addOpen} onClose={() => setAddOpen(false)} link={link} setLink={setLink} onSubmit={submit} />
    </>
  )
}
