// app/admin/(protected)/layout.tsx
//
// This used to be app/admin/layout.tsx, which meant it wrapped EVERY
// route under /admin — including /admin/login. Since middleware.ts now
// gates every route in this (protected) group behind a real staff
// check, /admin/login is deliberately kept OUTSIDE it (see
// app/admin/layout.tsx, now just a passthrough) so someone who isn't
// signed in yet sees a plain login card instead of the full sidebar,
// notification badges, and the header search below — those all come
// from AdminDataProvider/AdminSidebarProvider below, which assume a
// real signed-in staff member and shouldn't render at all for a
// visitor who hasn't gotten past the login form.
//
// Header used to show CurrentStaffBadge (name + role) — removed
// entirely, not just swapped out, since it exactly duplicated the
// sidebar's own bottom profile row (same name, same role, both on
// screen at once). GlobalSearch replaces it with something the app
// didn't have anywhere else: jump straight to an order, request, or
// staff member by typing a few characters, ⌘K from anywhere.
import type { ReactNode } from "react";
import { AdminDataProvider } from "@/contexts/AdminDataContext";
import { AdminSidebarProvider } from "@/contexts/AdminSidebarContext";
import { GlobalSearch } from "@/components/admin/GlobalSearch";
import { AdminSidebar } from "@/components/admin/admin-sidebar";
import { AdminContentShell } from "@/components/admin/admin-content-shell";

// `main` used to be `overflow-y-auto` — fine for pages that are just a
// tall column of content, but wrong for pages like /admin/chat that
// manage their own internal scroll region (a fixed header, a scrolling
// message list, a fixed composer). With `main` also able to scroll,
// any sub-pixel mismatch between the two could pop a scrollbar on
// `main` itself, which reserves gutter space and shows up as a thin
// gap on the right edge even when the page inside looks otherwise
// correct.
//
// `main` is now `overflow-hidden` and a flex column, so it just hands
// its exact height down to `children` and gets out of the way. Pages
// that are a normal scrolling column of content (most of them) now
// need `overflow-y-auto` on their own root element instead of relying
// on `main` to provide it — e.g. wrap that page's content in
// `<div className="h-full overflow-y-auto">...</div>`. Pages like
// /admin/chat that already manage their own internal scroll region
// don't need to change anything.
export default function AdminProtectedLayout({ children }: { children: ReactNode }) {
  return (
    <AdminDataProvider>
      <AdminSidebarProvider>
        <div className="h-screen overflow-hidden bg-parchment">
          <AdminSidebar />
          <AdminContentShell>
            <header className="flex flex-none items-center justify-end border-b border-indigo-100 bg-white/60 px-6 py-3">              
                <GlobalSearch />
            </header>
            <main className="flex flex-1 flex-col overflow-hidden">{children}</main>
          </AdminContentShell>
        </div>
      </AdminSidebarProvider>
    </AdminDataProvider>
  );
}