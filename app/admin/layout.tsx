// app/admin/layout.tsx
import type { ReactNode } from "react";
import { AdminDataProvider } from "@/contexts/AdminDataContext";
import { AdminSidebarProvider } from "@/contexts/AdminSidebarContext";
import { RoleSwitcher } from "@/components/admin/RoleSwitcher";
import { AdminSidebar } from "@/components/admin/admin-sidebar";
import { AdminContentShell } from "@/components/admin/admin-content-shell";

// app/admin/layout.tsx
//
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
export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <AdminDataProvider>
      <AdminSidebarProvider>
        <div className="h-screen overflow-hidden bg-parchment">
          <AdminSidebar />
          <AdminContentShell>
            <header className="flex flex-none items-center justify-end border-b border-indigo-100 bg-white/60 px-6 py-3">
              <RoleSwitcher />
            </header>
            <main className="flex flex-1 flex-col overflow-hidden">{children}</main>
          </AdminContentShell>
        </div>
      </AdminSidebarProvider>
    </AdminDataProvider>
  );
}