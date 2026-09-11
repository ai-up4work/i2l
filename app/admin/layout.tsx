// app/admin/layout.tsx
import type { ReactNode } from "react";
import { AdminDataProvider } from "@/contexts/AdminDataContext";
import { AdminSidebarProvider } from "@/contexts/AdminSidebarContext";
import { RoleSwitcher } from "@/components/admin/RoleSwitcher";
import { AdminSidebar } from "@/components/admin/admin-sidebar";
import { AdminContentShell } from "@/components/admin/admin-content-shell";

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <AdminDataProvider>
      <AdminSidebarProvider>
        <div className="flex min-h-screen bg-parchment">
          <AdminSidebar />
          <AdminContentShell>
            <header className="flex items-center justify-end border-b border-indigo-100 bg-white/60 px-6 py-3">
              <RoleSwitcher />
            </header>
            <main className="flex-1 p-6">{children}</main>
          </AdminContentShell>
        </div>
      </AdminSidebarProvider>
    </AdminDataProvider>
  );
}