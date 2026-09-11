// components/admin/RoleSwitcher.tsx
"use client";

import { useRouter } from "next/navigation";
import { useAdminData } from "@/contexts/AdminDataContext";
import type { Role } from "@/types/admin";

const ROLE_LABELS: Record<Role, string> = {
  manager: "Manager",
  sales: "Sales & Purchase",
  warehouse: "Warehouse",
};

// Kept in sync with admin-sidebar.tsx's DASHBOARD_HREF — consider lifting
// both to a shared lib/admin-routes.ts now that two files depend on it.
const DASHBOARD_HREF: Record<Role, string> = {
  manager: "/admin/manager-dashboard",
  sales: "/admin/sales-dashboard",
  warehouse: "/admin/warehouse-dashboard",
};

export function RoleSwitcher() {
  const { role, setRole, currentUser } = useAdminData();
  const router = useRouter();

  const handleRoleChange = (next: Role) => {
    setRole(next);
    // Switching role while sitting on a route the new role can't see (or
    // that belongs to the old role's dashboard) would silently desync
    // the URL from the sidebar's active state, same as a real role
    // switch requiring a re-login/redirect in production. Send them to
    // the new role's home base instead of leaving them stranded.
    router.push(DASHBOARD_HREF[next]);
  };

  return (
    <div className="flex items-center gap-2 rounded-lg border border-gold/40 bg-gold/10 px-3 py-2 text-sm">
      <span className="font-medium text-indigo-900">Viewing as</span>
      <select
        value={role}
        onChange={(e) => handleRoleChange(e.target.value as Role)}
        className="rounded-md border border-indigo-200 bg-white px-2 py-1 text-sm text-indigo-900 focus:outline-none focus:ring-2 focus:ring-teal"
      >
        {(Object.keys(ROLE_LABELS) as Role[]).map((r) => (
          <option key={r} value={r}>
            {ROLE_LABELS[r]}
          </option>
        ))}
      </select>
      <span className="text-indigo-500">({currentUser.name})</span>
    </div>
  );
}