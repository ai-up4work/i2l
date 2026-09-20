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
import ChatButton from '@/components/shared/ChatButton'
import ChatPanel from '@/components/shared/ChatPanel'
import { ChatProvider } from '@/contexts/ChatContext'
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

  // True whenever ItemInfoModal is covering the screen.
  //
  // FIX: Header is now ALWAYS mounted, including while the modal is
  // open — it used to be unmounted here (`{!overlayActive && <Header
  // .../>}`), which meant there was nothing left for the modal to
  // render behind. Header is `z-50` (see Header.tsx) and ItemInfoModal
  // is `z-30`, so as long as Header stays in the DOM, the browser's own
  // stacking order keeps it in front of the modal automatically — no
  // extra z-index changes needed on either side.
  //
  // WelcomeBanner still unmounts while the modal is open (unrelated to
  // the header/z-index issue): ItemInfoModal is a true full-viewport
  // overlay (top: 0, bottom: 0 — see that file), so there's no "gap
  // above it" left for the banner to occupy or push into.
  const overlayActive = modalOpen

  // main's top padding always reserves space for Header now that it's
  // permanently mounted (previously zeroed while the modal was open,
  // back when Header itself was removed from the DOM for that case).
  const effectiveHeaderHeightMobile = HEADER_BAR_HEIGHT_MOBILE
  const effectiveHeaderHeightDesktop = HEADER_BAR_HEIGHT_DESKTOP

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

  // FIX: the chat widget shouldn't float on top of the account's own
  // in-app messages screen — that page IS the messaging surface, so a
  // floating chat bubble/panel on top of it is redundant and visually
  // conflicts with it. Matched by path prefix (rather than `view ===
  // 'messages'`) so it also covers any nested routes under
  // /account/messages (e.g. /account/messages/[threadId]).
  const isMessagesRoute = pathname?.startsWith('/account/messages') ?? false

  // Chat widget is hidden here whenever something else is already
  // covering the screen — the full-viewport ItemInfoModal, the mobile
  // sidebar drawer, the shop bottom sheet, or the add-request overlay —
  // or whenever we're on the account messages route itself (see
  // isMessagesRoute above) — so it never floats on top of (or behind,
  // unpredictably) another full-screen surface, and never duplicates
  // the in-app messaging UI. It reappears once whatever's open closes
  // or the user navigates away from /account/messages.
  const chatWidgetHidden =
    overlayActive || sidebarOpen || shopSheetOpen || addRequestOpen || isMessagesRoute

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <Header
        variant="account"
        view={view}
        showBackButton={showBackButton}
        onBack={handleBack}
        onMenuClick={() => setSidebarOpen(true)}
      />

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
            nothing to fill it.

            FIX (messages composer): this section is now a flex column
            (`flex flex-col`) so a page can use `flex-1` on its root to
            fill whatever height is left under the banner. That is what
            lets /account/messages pin its composer to the bottom even
            when there are 0 or 1 messages. The section is still the
            one and only scroll container (`overflow-y-auto`). */}
        <section
          className="content-scroll flex min-w-0 flex-1 flex-col overflow-y-auto pb-[72px] lg:mt-1 lg:pb-0"
        >
          {/* WelcomeBanner is only ever rendered while the modal is
              closed — no fixed/pushed positioning needed anymore, since
              it and ItemInfoModal are never on screen at the same time.
              `shrink-0` keeps it at its natural height now that the
              section is a flex column. */}
          {!overlayActive && (
            <div ref={bannerRef} className={bannerOpen ? 'relative mb-4 shrink-0' : 'relative mt-8 shrink-0 lg:mt-0'}>
              <WelcomeBanner
                open={bannerOpen}
                onDismiss={() => setBannerDismissed(true)}
                onDetails={() => router.push('/account/profile')}
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

        {/* FIX: previously wrapped in `{modalOpen && (...)}`, which
            unmounted ItemInfoModal from the tree the INSTANT modalOpen
            went false — before its own internal close transition
            (mounted/entered state, see that file) ever got a chance to
            play. The modal now stays mounted at all times and manages
            its own presence via the `open` prop internally, unmounting
            itself only after its exit animation finishes. */}
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

        {/* Support chat — same widget as the public site (PublicLayout),
            just re-mounted here since the account area sits behind its
            own layout tree and never renders PublicLayout. `bottom-24`
            (96px) clears MobileBottomNav's 72px height on mobile with
            room to spare, so the bubble sits above the nav bar rather
            than behind or overlapping it. Hidden while anything else
            full-screen is already open, or on /account/messages (see
            chatWidgetHidden above). */}
        <ChatButton hidden={chatWidgetHidden} positionClassName="bottom-24 right-6 lg:bottom-8" />
        <ChatPanel hidden={chatWidgetHidden} positionClassName="bottom-24 right-6 lg:bottom-8" />

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
    // ChatProvider wraps the whole shell (same reasoning as PublicLayout):
    // ChatButton and ChatPanel are siblings inside AccountShell that both
    // call useChat(), so they need a shared provider ancestor above them.
    <ChatProvider>
      <DashboardProvider>
        <AccountShell>{children}</AccountShell>
      </DashboardProvider>
    </ChatProvider>
  )
}