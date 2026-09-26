'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Plus, Minus, X, LogOut } from 'lucide-react'
import BrandMark from '../shared/BrandMark'
import { sidebarGroups } from './sidebar-data'
import InstallAppButton from '../pwa/InstallAppButton'

import type { View } from './types'

type SidebarProps = {
  view: View
  onNavigate: (view: View) => void
  onLogoClick: () => void
  onSignOut: () => void
  /** Mobile drawer open state — ignored on desktop (`lg:`), where the
   *  sidebar is always visible and sticky as before. */
  mobileOpen: boolean
  onMobileClose: () => void
}

export default function Sidebar({
  view,
  onNavigate,
  onLogoClick,
  onSignOut,
  mobileOpen,
  onMobileClose,
}: SidebarProps) {
  const pathname = usePathname()

  const groupKeyForActiveView = useMemo(() => {
    const match = sidebarGroups.find((group) =>
      group.items.some((item) => item.type !== 'link' && item.view === view)
    )
    return match?.key
  }, [view])

  const isPersonalCenterActive = view === 'home'

  const [openGroups, setOpenGroups] = useState<Set<string>>(() => {
    const initial = new Set<string>()
    sidebarGroups.forEach((group) => {
      if (group.defaultOpen) initial.add(group.key)
    })
    if (groupKeyForActiveView) initial.add(groupKeyForActiveView)
    return initial
  })

  const toggleGroup = (key: string) => {
    setOpenGroups((prev) => {
      const next = new Set(prev)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
  }

  // Navigating (mobile) should also close the drawer, same as tapping a
  // link would in any off-canvas menu.
  const handleNavigate = (nextView: View) => {
    onNavigate(nextView)
    onMobileClose()
  }

  const personalCenterClasses = `block w-full text-left font-display text-xl transition-colors duration-150 ${
    isPersonalCenterActive ? 'font-bold text-ink' : 'text-ink/65 hover:text-ink'
  }`

  return (
    <>
      {/* Mobile backdrop — only exists while the drawer is open; tapping
          it closes the drawer, same interaction as the header's own
          mobile nav overlay. */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-[105] bg-ink/40 transition-opacity duration-300 lg:hidden"
          onClick={onMobileClose}
          aria-hidden="true"
        />
      )}

      {/* FIX: desktop height was a flat `lg:h-screen` (100vh). AccountShell's
          <Header> is `position: fixed` (out of flow), so `main` gets the
          full 100vh from its own flex parent and then eats into that box
          with `padding-top: var(--account-header-h-desktop)` to visually
          push content below the header — leaving main's real available
          content height as `100vh - headerHeight`, not 100vh. A flat
          `h-screen` aside inside that box was therefore always taller than
          the space it had, overflowed the bottom of `main` (which is
          `overflow-hidden`), and got clipped — cutting the "Download App"
          footer off by exactly the header's height. Any reflow (banner
          collapsing, a modal toggling, a resize) could momentarily
          reveal/re-clip that overflow, which read as the sidebar "jumping
          down by the header amount and coming back". Sizing against the
          same `--account-header-h-desktop` custom property main already
          sets (inherited here since aside is main's descendant) makes the
          aside exactly fit its real available space, so Download App stays
          pinned at the true bottom with no clipping. */}
      <aside
        className={`fixed inset-y-0 left-0 z-[110] flex w-[300px] flex-none flex-col overflow-hidden border-r border-ink/10 bg-parchment transition-transform duration-300 ease-out lg:sticky lg:top-0 lg:z-auto lg:h-[calc(100vh-var(--account-header-h-desktop,0px))] lg:translate-x-0 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Logo — mobile-only. On desktop the shared marketing Header
            (rendered above this whole layout, see account/layout.tsx)
            already shows the Wishdrop logo, so repeating it here just
            duplicated it and pushed "Personal Center" down for no
            reason. On mobile, Header isn't rendered at all for account
            pages, so this drawer needs its own logo + close (X) button. */}
        <div className="relative z-10 flex h-16 flex-none items-center justify-between px-6 lg:hidden">
          <BrandMark />
          <button
            type="button"
            aria-label="Close menu"
            onClick={onMobileClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-ink/60 transition-colors duration-200 hover:bg-teal/10 hover:text-teal-deep"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Desktop-only: "Personal Center" pinned OUTSIDE the scrollable
            <nav> below, as its own flex-none block. Previously this
            heading was the first item *inside* the scrolling nav, so once
            the nav's content (groups + Sign Out + Download App) exceeded
            the sidebar's height, scrolling the nav would scroll "Personal
            Center" out of view along with everything else — easy to lose
            track of since nothing marked it as a fixed page title. Pinning
            it here means it's always visible on desktop regardless of how
            far the nav below is scrolled. pt-10 gives it breathing room
            under the shared marketing Header rendered above this aside
            (see account/layout.tsx), which sits directly on top of it on
            desktop since the mobile logo row above is hidden here. */}
        <div className="relative z-10 hidden flex-none px-6 pb-2 pt-8 lg:block">
          <button
            type="button"
            onClick={() => handleNavigate('home')}
            aria-current={isPersonalCenterActive ? 'page' : undefined}
            className={personalCenterClasses}
          >
            Personal Center
          </button>
        </div>

        <nav
          className="nav-scroll scrollbar-none relative z-10 flex-1 overflow-auto px-6 pb-2 pt-2"
          aria-label="Member navigation"
        >
          {/* Mobile-only: "Personal Center" stays inside the scroll area
              here, right under the drawer's own logo row above — same
              spot it's always been on mobile. Desktop renders its own
              pinned copy above instead (see the block just above <nav>),
              so this one is hidden at lg: to avoid showing it twice. */}
          <button
            type="button"
            onClick={() => handleNavigate('home')}
            aria-current={isPersonalCenterActive ? 'page' : undefined}
            className={`mb-4 lg:hidden ${personalCenterClasses}`}
          >
            Personal Center
          </button>

          <div className="flex flex-col">
            {sidebarGroups.map((group) => {
              const isOpen = openGroups.has(group.key)

              return (
                <div key={group.key} className="border-b border-ink/10 py-4 last:border-0">
                  <button
                    type="button"
                    onClick={() => toggleGroup(group.key)}
                    aria-expanded={isOpen}
                    className="flex w-full items-center justify-between text-left font-body text-[15px] font-bold text-ink"
                  >
                    {group.label}
                    {isOpen ? (
                      <Minus size={15} strokeWidth={2} className="text-ink/50" />
                    ) : (
                      <Plus size={15} strokeWidth={2} className="text-ink/50" />
                    )}
                  </button>

                  {isOpen && (
                    <div className="mt-3 flex flex-col gap-3 pl-1">
                      {group.items.map((item) => {
                        // Narrow on 'link' first. In the else branch TS knows
                        // item is 'view' | 'badge', both of which carry `view`
                        // and (optionally/always) `badge`.
                        if (item.type === 'link') {
                          const isActive = pathname === item.href
                          return (
                            <Link
                              key={item.label}
                              href={item.href}
                              onClick={onMobileClose}
                              aria-current={isActive ? 'page' : undefined}
                              className={`flex items-center gap-2 text-left font-body text-sm transition-colors duration-150 ${
                                isActive ? 'font-bold text-ink' : 'text-ink/65 hover:text-ink'
                              }`}
                            >
                              {item.label}
                            </Link>
                          )
                        }

                        const isActive = view === item.view
                        const badgeLabel = item.badge

                        return (
                          <button
                            key={item.label}
                            type="button"
                            onClick={() => handleNavigate(item.view)}
                            aria-current={isActive ? 'page' : undefined}
                            className={`flex items-center gap-2 text-left font-body text-sm transition-colors duration-150 ${
                              isActive ? 'font-bold text-ink' : 'text-ink/65 hover:text-ink'
                            }`}
                          >
                            {item.label}
                            {badgeLabel && (
                              <span className="rounded-full bg-rose-500/90 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">
                                +{badgeLabel}
                              </span>
                            )}
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* Sign Out */}
          <button
            type="button"
            onClick={onSignOut}
            className="mt-4 w-full py-3 text-left font-body text-[15px] font-bold text-ink transition-colors hover:text-rose-500"
          >
            <span className="flex items-center gap-2">
              <LogOut size={16} strokeWidth={1.8} />
              Sign Out
            </span>
          </button>
        </nav>

        {/* Install app — opens the native install dialog where the browser
            allows it, otherwise per-browser instructions. See
            components/pwa/InstallAppButton.tsx. */}
        <div className="relative z-10 border-t border-ink/10 px-6 py-5">
          <InstallAppButton />
        </div>
      </aside>
    </>
  )
}