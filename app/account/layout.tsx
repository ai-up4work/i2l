'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useState } from 'react'
import ItemInfoModal from '@/components/dashboard/ItemInfoModal'
import Sidebar from '@/components/dashboard/Sidebar'
import MobileBottomNav from '@/components/dashboard/MobileBottomNav'
import AddRequestOverlay from '@/components/dashboard/AddRequestOverlay'
import WelcomeBanner from '@/components/dashboard/WelcomeBanner'
import { pathForView, viewForPath } from '@/components/dashboard/routes'
import type { View } from '@/components/dashboard/types'
import { DashboardProvider, useDashboard } from '@/contexts/DashboardContext'
import { useAuth } from '@/contexts/AuthContext'
import Header, { HEADER_BAR_HEIGHT_MOBILE, HEADER_BAR_HEIGHT_DESKTOP } from '@/components/shared/Header'
import ShopBottomSheet from '@/components/stores/ShopBottomSheet'
import { useElementHeight } from '@/hooks/useElementHeight'
import { useIsMobile } from '@/hooks/useIsMobile'
import { AdminDataProvider } from '@/contexts/AdminDataContext'

function AccountShell({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const view = viewForPath(pathname)
  const isMobile = useIsMobile()

  // FIX: destructure `logout` alongside `user` so Sidebar's Sign Out
  // button has something real to call — see onSignOut below.
  const { user, logout } = useAuth()
  const isPhoneVerified = !!user?.phoneVerified

  const {
    draft,
    setDraft,
    modalOpen,
    closeModal,
    confirmRequest,
    lookupLoading,
    lookupError,
    autoFilled,
    scrapeResult,
    selectVariant,
    resetDraft,
    pastedLink: link,
    setPastedLink: setLink,
    startItemInfo: submitRequest,
  } = useDashboard()
  const safeLink = link ?? ''

  // Header's rendered height differs by breakpoint — mobile shows the
  // full OUTER_H bar, desktop's content sits at INNER_H. Header.tsx
  // exports two constants (HEADER_BAR_HEIGHT_MOBILE / _DESKTOP) and we
  // pick between them with Tailwind's responsive classes on <main>
  // below (mobile-first: base value applies <1024px, lg: overrides it
  // >=1024px), since there's no SSR-safe "isMobile" check here without
  // a hydration flash.
  const { ref: bannerRef, height: bannerHeight } = useElementHeight<HTMLDivElement>()

  // Banner visibility depends on verification status, not just a
  // boolean toggle. `bannerDismissed` only matters if the user is still
  // unverified — dismissing has no effect once verified. This is plain
  // component state, so dismissing is session-only: reloading the page
  // while still unverified will show it again.
  const [bannerDismissed, setBannerDismissed] = useState(false)
  const bannerOpen = !isPhoneVerified && !bannerDismissed

  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [shopSheetOpen, setShopSheetOpen] = useState(false)
  const [addRequestOpen, setAddRequestOpen] = useState(false)

  // True whenever ItemInfoModal is covering the screen. While true:
  //  - Header is hidden outright (unmounted below).
  //  - WelcomeBanner is unmounted outright too (not repositioned, not
  //    collapsed — just not rendered). ItemInfoModal is now a true
  //    full-viewport overlay (top: 0, bottom: 0 — see that file), so
  //    there's no "gap above it" left for the banner to occupy or push
  //    into anymore.
  const overlayActive = modalOpen

  // main's top padding only needs to reserve space for Header (which
  // is unmounted, along with everything else, while the modal is
  // open) — there's no more banner-height compensation to do here
  // since the banner and modal are mutually exclusive now.
  const effectiveHeaderHeightMobile = overlayActive ? 0 : HEADER_BAR_HEIGHT_MOBILE
  const effectiveHeaderHeightDesktop = overlayActive ? 0 : HEADER_BAR_HEIGHT_DESKTOP

  // FIX: previously never passed to Header, so its (also previously
  // unwired) back button never rendered at all — there was no way to
  // reach handleBack from the UI. Shown whenever the current view isn't
  // the account home, mirroring handleBack's own logic below (which
  // special-cases 'preview' and otherwise falls back to 'home' — i.e.
  // there's always somewhere meaningful to go back to except from home
  // itself).
  const showBackButton = view !== 'home'

  function handleNavigate(nextView: View) {
    if (nextView === 'addRequest') resetDraft()
    router.push(pathForView(nextView))
  }

  function handleOpenAddRequest() {
    resetDraft()
    setAddRequestOpen(true)
  }

  function handleAddRequestSubmit(event: React.FormEvent) {
    event.preventDefault()
    submitRequest(event)
    setAddRequestOpen(false)
  }

  function handleBack() {
    if (view === 'preview') {
      router.push(pathForView('addRequest'))
      return
    }
    router.push(pathForView('home'))
  }

  // FIX: real sign-out. logout() (from AuthContext) already clears the
  // cached user, calls supabase.auth.signOut(), and redirects to '/' —
  // this just triggers it. Wrapped in `void` since Sidebar's onSignOut
  // prop type is `() => void`, not `() => Promise<void>`; we don't need
  // to await or catch here because logout() itself is best-effort and
  // already clears local state synchronously before the network call.
  function handleSignOut() {
    void logout()
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      {!overlayActive && (
        <Header
          variant="account"
          view={view}
          showBackButton={showBackButton}
          onBack={handleBack}
          onMenuClick={() => setSidebarOpen(true)}
        />
      )}

      <main
        className="flex min-h-0 flex-1 overflow-hidden bg-parchment pt-[var(--account-header-h-mobile)] lg:pt-[var(--account-header-h-desktop)]"
        style={{
          ['--account-header-h-mobile' as string]: `${effectiveHeaderHeightMobile}px`,
          ['--account-header-h-desktop' as string]: `${effectiveHeaderHeightDesktop}px`,
        }}
      >
        <Sidebar
          view={view}
          onNavigate={handleNavigate}
          onLogoClick={() => router.push(pathForView('home'))}
          onSignOut={handleSignOut}
          mobileOpen={sidebarOpen}
          onMobileClose={() => setSidebarOpen(false)}
        />

        {/* FIX: bottom padding for the mobile bottom-nav bar (72px) is
            now a Tailwind class instead of an inline `--account-bottom-
            nav-h` var, and is zeroed at `lg:` — MobileBottomNav itself
            unmounts/hides on desktop, so the reserved gap under the
            content column was previously left dangling there with
            nothing to fill it. */}
        <section
          className="content-scroll min-w-0 lg:mt-1 flex-1 overflow-y-auto pb-[72px] lg:pb-0"
        >
          {/* WelcomeBanner is only ever rendered while the modal is
              closed — no fixed/pushed positioning needed anymore, since
              it and ItemInfoModal are never on screen at the same time. */}
          {!overlayActive && (
            <div ref={bannerRef} className={bannerOpen ? 'relative mb-4' : 'relative mt-8 lg:mt-0'}>
              <WelcomeBanner
                open={bannerOpen}
                onDismiss={() => setBannerDismissed(true)}
                onDetails={() => router.push('/account/settings')}
                collapse={isMobile && !bannerOpen}
              />
            </div>
          )}

          {children}
        </section>

        <MobileBottomNav
          view={view}
          onNavigate={handleNavigate}
          onOpenShop={() => setShopSheetOpen(true)}
          onOpenAddRequest={handleOpenAddRequest}
          isAddRequestOpen={addRequestOpen}
        />
        <ShopBottomSheet open={shopSheetOpen} onClose={() => setShopSheetOpen(false)} />
        <AddRequestOverlay
          open={addRequestOpen}
          onClose={() => setAddRequestOpen(false)}
          link={safeLink}
          setLink={setLink}
          onSubmit={handleAddRequestSubmit}
        />

        {modalOpen && (
          <ItemInfoModal
            open={modalOpen}
            result={scrapeResult}
            qty={draft.qty}
            onQtyChange={(qty) => setDraft({ ...draft, qty })}
            onClose={closeModal}
            onSubmitRequest={confirmRequest}
            estimatedPriceLKR={draft.estimatedPriceLKR ?? null}
            loading={lookupLoading}
            onSelectVariant={(url) => {
              if (url) selectVariant(url)
            }}
          />
        )}

        <style>{`
          .content-scroll {
            scrollbar-width: thin;
            scrollbar-color: rgba(14, 140, 156, 0.25) transparent;
          }
          .content-scroll::-webkit-scrollbar {
            width: 8px;
          }
          .content-scroll::-webkit-scrollbar-track {
            background: transparent;
          }
          .content-scroll::-webkit-scrollbar-thumb {
            background-color: rgba(14, 140, 156, 0.18);
            border-radius: 999px;
            border: 2px solid transparent;
            background-clip: padding-box;
            transition: background-color 0.2s ease;
          }
          .content-scroll:hover::-webkit-scrollbar-thumb {
            background-color: rgba(14, 140, 156, 0.32);
          }
          .content-scroll::-webkit-scrollbar-thumb:hover {
            background-color: rgba(14, 140, 156, 0.5);
          }
        `}</style>
      </main>
    </div>
  )
}

export default function AccountLayout({ children }: { children: React.ReactNode }) {
  return (
    <DashboardProvider>
      <AdminDataProvider>
        <AccountShell>{children}</AccountShell>
      </AdminDataProvider>
    </DashboardProvider>
  )
}