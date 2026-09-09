// app/account/layout.tsx (or wherever this layout lives)
'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useState } from 'react'
import ItemInfoModal from '@/components/dashboard/ItemInfoModal'
import Sidebar from '@/components/dashboard/Sidebar'
import Topbar from '@/components/dashboard/Topbar'
import MobileBottomNav from '@/components/dashboard/MobileBottomNav'
import AddRequestOverlay from '@/components/dashboard/AddRequestOverlay'
import WelcomeBanner from '@/components/dashboard/WelcomeBanner'
import { pathForView, viewForPath } from '@/components/dashboard/routes'
import type { View } from '@/components/dashboard/types'
import { DashboardProvider, useDashboard } from '@/contexts/DashboardContext'
import { ChatProvider } from '@/contexts/ChatContext'
import Header from '@/components/shared/Header'
import ChatButton from '@/components/shared/ChatButton'
import ChatPanel from '@/components/shared/ChatPanel'
import ShopBottomSheet from '@/components/stores/ShopBottomSheet'
import { useElementHeight } from '@/hooks/useElementHeight'
import { useIsMobile } from '@/hooks/useIsMobile'

const MOBILE_BOTTOM_NAV_H = 72

function AccountShell({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const view = viewForPath(pathname)
  const isMobile = useIsMobile() // true below lg (1024px), matching this layout's other breakpoints

  const {
    draft,
    setDraft,
    modalOpen,
    closeModal,
    saveItemInfo,
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
  // TEMP GUARD: useDashboard doesn't actually export `link` under that
  // name (came through undefined), so AddRequestOverlay's
  // disabled={!link.trim()} was throwing. Remove this once the real
  // field names from DashboardContext are wired in above.
  const safeLink = link ?? ''

  // ChatButton and ChatPanel both call useChat() internally now (same
  // as PublicLayout), so this component no longer needs its own
  // isOpen/toggleChat/unreadCount — that was only required for the old
  // hand-rolled CircleHelp button, which is gone.

  // Desktop <Header> now lives here (moved down from the outer
  // AccountLayout component) so it can react to modalOpen — useDashboard
  // isn't reachable from a component that merely renders <DashboardProvider>,
  // only from one nested inside it.
  const { ref: headerRef, height: headerHeight } = useElementHeight<HTMLDivElement>()
  const { ref: topbarRef, height: topbarHeight } = useElementHeight<HTMLDivElement>()

  // Banner measured on its own now (previously merged into topbarHeight).
  // Needed in isolation because while ItemInfoModal is open, the banner
  // is the ONLY thing that should still show above the overlay — Header
  // and Topbar are hidden outright — so the overlay's top offset should
  // equal exactly the banner's height (or 0 once dismissed), not
  // banner+topbar, and not header height.
  const { ref: bannerRef, height: bannerHeight } = useElementHeight<HTMLDivElement>()

  const [bannerOpen, setBannerOpen] = useState(true)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [shopSheetOpen, setShopSheetOpen] = useState(false)
  // Mirrors shopSheetOpen's pattern above — the + button opens this
  // overlay in place instead of routing to a dedicated "addRequest" view,
  // so tapping it from Orders/Stores/etc. no longer loses that page.
  const [addRequestOpen, setAddRequestOpen] = useState(false)

  // True whenever ItemInfoModal is covering the screen. While true:
  //  - Header and Topbar are hidden outright (display:none via a class
  //    swap, NOT unmounted — see the className logic below — so their
  //    refs stay attached to the same node and useElementHeight keeps
  //    tracking them correctly once the modal closes again).
  //  - WelcomeBanner, if still open, is pulled OUT of normal flow into a
  //    fixed strip pinned to the very top of the viewport, above the
  //    modal (see bannerWrapperClass below) — it's meant to keep
  //    floating above the overlay, not disappear behind/under it.
  //  - ChatButton is hidden outright too (via its own `hidden` prop)
  //    since it would otherwise float on top of the modal's content.
  const overlayActive = modalOpen

  // --account-header-h drives ItemInfoModal's top offset via CSS var
  // (see .item-overlay-bounds in ItemInfoModal — which now respects this
  // var on desktop too, not just mobile; that was the actual bug before:
  // the modal forced top:0 at >=1024px regardless of this value, so the
  // banner and the modal never agreed on where the boundary was, and the
  // banner's real interactive box ended up landing on top of the modal's
  // own header/close-button row instead of cleanly above it).
  //  - Modal open: just the banner's live height if it's still open,
  //    else 0 — so the modal (and its backdrop) start exactly where the
  //    fixed banner strip ends, and expand to fill that space the
  //    instant the banner is dismissed.
  //  - Modal closed: unchanged from before — Topbar height on mobile,
  //    Header height on desktop.
  const effectiveHeaderHeight = overlayActive
    ? bannerOpen
      ? bannerHeight
      : 0
    : isMobile
      ? topbarHeight
      : headerHeight

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

  // Kept as plain conditionals (not template-string interpolation of
  // arbitrary values) so Tailwind's class scanner can see every literal
  // class name used here.
  const headerWrapperClass = overlayActive ? 'hidden' : 'hidden lg:block lg:mt-15'
  const topbarWrapperClass = overlayActive ? 'hidden' : 'sticky top-0 z-20 bg-parchment lg:static'
  // FIX: was `overlayActive ? 'relative z-40' : 'relative'`. Staying in
  // normal flow with a bumped z-index only controlled paint order, not
  // geometry — the banner's box still sat wherever `<section>`'s layout
  // put it, which (thanks to the old desktop top:0 override in the
  // modal, now fixed) didn't line up with where the modal actually left
  // room for it. Fixed positioning removes the banner from that flow
  // entirely and pins it to the true viewport top, at a z-index above
  // the modal (z-30) and its backdrop, so it visibly floats above the
  // overlay exactly as intended, with no ambiguity about where its box
  // lands. Once the modal closes, it drops back to `relative` and
  // resumes its normal spot above Topbar in the content column.
  //
  // FIX 2 (click-through after dismissing the banner mid-overlay): this
  // wrapper's box stayed the banner's full ~64px height and `z-50`
  // (above the modal's `z-30`) even after `bannerOpen` went false,
  // because WelcomeBanner was called with `collapse={isMobile}` — on
  // desktop that just fades its *inner* content to opacity-0 without
  // shrinking, so the wrapper kept reserving a full-height, invisible,
  // but still perfectly live hit-target sitting right on top of the
  // modal's own header row — exactly where the ✕ close button lives.
  // That's why closing the banner didn't make the overlay's close
  // button clickable again.
  //
  // Two-part fix: (a) below, WelcomeBanner is now always told to
  // collapse to zero height while the overlay is active, regardless of
  // isMobile, so it doesn't leave a reserved box behind on desktop
  // either; (b) as soon as bannerOpen is false, this wrapper also gets
  // `pointer-events-none` directly, so there's no dependency on the
  // collapse transition finishing before clicks pass through again.
  const bannerWrapperClass = overlayActive
    ? `fixed inset-x-0 top-0 z-50 ${bannerOpen ? '' : 'pointer-events-none'}`
    : 'relative'

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <div ref={headerRef} className={headerWrapperClass}>
        <Header variant="account" />
      </div>

      <main
        className="flex min-h-0 flex-1 overflow-hidden bg-parchment pt-0"
        style={{
          ['--account-header-h' as string]: `${effectiveHeaderHeight}px`,
          ['--account-bottom-nav-h' as string]: `${MOBILE_BOTTOM_NAV_H}px`,
          // Pushes BOTH flex children of <main> — Sidebar and the
          // scrollable <section> (i.e. every page's content, not just
          // this layout's own chrome) — down by --account-header-h.
          //
          // Desktop: always applied (unchanged from before). Header is
          // effectively out-of-flow at that size, so main's own padding
          // is what actually reserves its space, in both the normal and
          // overlay states.
          //
          // Mobile: applied ONLY while overlayActive. Normally on
          // mobile the banner and Topbar sit in-flow and push page
          // content down themselves — no extra padding needed, and
          // adding it unconditionally would double that spacing. But
          // once the overlay opens, bannerWrapperClass switches the
          // banner to `fixed`, pulling it out of flow — with nothing
          // else in flow above it (Topbar is hidden too), page content
          // was riding up to y:0 and landing directly under the
          // floating banner on every account page. Padding main by
          // --account-header-h in that state reclaims exactly the
          // space the banner used to occupy, matching what already
          // happened on desktop.
          paddingTop: !isMobile || overlayActive ? 'var(--account-header-h)' : undefined,
        }}
      >

        <Sidebar
          view={view}
          onNavigate={handleNavigate}
          onLogoClick={() => router.push(pathForView('home'))}
          onSignOut={() => {
            /* existing sign-out handling */
          }}
          mobileOpen={sidebarOpen}
          onMobileClose={() => setSidebarOpen(false)}
        />

        <section
          className="content-scroll min-w-0 lg:mt-1 flex-1 overflow-y-auto"
          style={{ paddingBottom: 'var(--account-bottom-nav-h)' }}
        >
          <div ref={bannerRef} className={bannerWrapperClass}>
            <WelcomeBanner
              open={bannerOpen}
              onDismiss={() => setBannerOpen(false)}
              collapse={isMobile || overlayActive}
            />
          </div>

          <div ref={topbarRef} className={topbarWrapperClass}>
            <Topbar view={view} onBack={handleBack} onMenuClick={() => setSidebarOpen(true)} />
          </div>

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
            onRequestItem={() => saveItemInfo({ preventDefault: () => {} } as React.FormEvent)}
            loading={lookupLoading}
            onSelectVariant={(url) => {
              if (url) selectVariant(url)
            }}
          />
        )}

        {/* Real ChatButton component now, same as PublicLayout — it's
            already `fixed` internally and takes positionClassName
            (not className/style, which don't exist on its props type).
            Includes right-6 here since positionClassName replaces
            ChatButton's own default ('bottom-6 right-6') entirely
            rather than merging with it — so right-6 has to be repeated.
            hidden mirrors overlayActive so it disappears while
            ItemInfoModal covers the screen, same as Header/Topbar do. */}
        <ChatButton
          positionClassName={`right-6 bottom-[calc(var(--account-bottom-nav-h)+1.5rem)] lg:bottom-6`}
          hidden={overlayActive}
        />

        {/* Panel is positioned to open just above the FAB, mirroring the
            FAB's own bottom offset (mobile bottom nav height + gap on
            mobile, flush 1.5rem on lg — same breakpoint the FAB uses via
            .support-fab's media query below). */}
        <ChatPanel positionClassName="right-6 bottom-[calc(var(--account-bottom-nav-h)+5.5rem)] lg:bottom-24" />

        <style jsx global>{`
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
    // ChatProvider wraps here, same as PublicLayout, so ChatButton and
    // ChatPanel below always have a provider ancestor — regardless of
    // whether the root app/layout.tsx also happens to wrap in one.
    <ChatProvider>
      <DashboardProvider>
        <AccountShell>{children}</AccountShell>
      </DashboardProvider>
    </ChatProvider>
  )
}