// app/admin/(protected)/super-admin/staff/new/page.tsx
//
// The ONLY place a new staff account of any role gets created now.
// Manager used to have its own version of this page (Sales & Purchase/
// Warehouse only) at /admin/staff/new — that page is now just a
// redirect (see its own comment) and staff onboarding is centralized
// here, offering all four roles including Manager and Super Admin,
// which Manager's version never could.
"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft, UserCog, ShoppingBag, Warehouse, Crown } from "lucide-react"

import { useAdminData } from "@/contexts/AdminDataContext"
import type { Role } from "@/types/admin"
import { panelClass, inputClass } from "@/components/admin/seller/shared"

const ROLE_OPTIONS: { role: Role; label: string; icon: React.ComponentType<{ size?: number }> }[] = [
  { role: "manager", label: "Manager", icon: UserCog },
  { role: "sales", label: "Sales & Purchase", icon: ShoppingBag },
  { role: "warehouse", label: "Warehouse", icon: Warehouse },
  { role: "super_admin", label: "Super Admin", icon: Crown },
]

export default function NewStaffPage() {
  const router = useRouter()
  const { role: effectiveRole, sites, createStaffAccount } = useAdminData()

  useEffect(() => {
    // Effective `role` (previewRole-aware) — same pattern as the
    // dashboards, so "Preview as Manager" correctly can't reach this
    // page either, the same as a real Manager can't.
    if (effectiveRole !== "super_admin") router.replace("/admin/dashboard")
  }, [effectiveRole, router])

  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [role, setRole] = useState<Role>("sales")
  const [siteId, setSiteId] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (effectiveRole !== "super_admin") return null

  const canSave = name.trim() && email.trim() && (role !== "warehouse" || siteId)

  const handleSave = async () => {
    if (!canSave) return
    setSaving(true)
    setError(null)
    const result = await createStaffAccount({
      name: name.trim(),
      email: email.trim(),
      role,
      siteId: role === "warehouse" ? siteId : undefined,
    })
    setSaving(false)
    if (!result.ok) {
      setError(result.error ?? "Failed to create staff account.")
      return
    }
    router.push("/admin/super-admin/staff")
  }

  return (
    <div className="h-full overflow-y-auto bg-parchment font-body text-ink">
      <div className="mx-auto max-w-2xl px-6 pb-24 pt-10 lg:px-10">
        <button
          type="button"
          onClick={() => router.push("/admin/super-admin/staff")}
          className="flex items-center gap-1.5 text-sm font-medium text-ink/50 hover:text-ink"
        >
          <ArrowLeft size={15} />
          Back to Staff
        </button>

        <h1 className="mt-4 font-display text-3xl text-ink">Add staff</h1>
        <p className="mt-1.5 max-w-md text-sm leading-relaxed text-ink/60">
          Creates the roster entry and sends a real invite email so this person can sign in themselves.
        </p>

        <div className={`mt-8 flex flex-col gap-5 p-6 ${panelClass}`}>
          <div>
            <label className="text-xs font-semibold text-ink/50">Full name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Priya Rathnayake"
              className={`mt-1.5 w-full ${inputClass}`}
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-ink/50">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@wishdrop.lk"
              className={`mt-1.5 w-full ${inputClass}`}
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-ink/50">Role</label>
            <div className="mt-1.5 grid grid-cols-2 gap-2">
              {ROLE_OPTIONS.map(({ role: r, label, icon: Icon }) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRole(r)}
                  className={`flex items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-semibold transition-colors ${
                    role === r
                      ? "border-teal-deep bg-teal-deep/10 text-teal-deep"
                      : "border-ink/15 bg-white text-ink/60 hover:border-ink/25"
                  }`}
                >
                  <Icon size={15} /> {label}
                </button>
              ))}
            </div>
          </div>

          {role === "warehouse" && (
            <div>
              <label className="text-xs font-semibold text-ink/50">Site</label>
              <select
                value={siteId}
                onChange={(e) => setSiteId(e.target.value)}
                className={`mt-1.5 w-full ${inputClass}`}
              >
                <option value="">Select a site…</option>
                {sites.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} — {s.location}
                  </option>
                ))}
              </select>
            </div>
          )}

          <p className="rounded-lg bg-gold/10 px-3.5 py-2.5 text-xs leading-relaxed text-ink/60">
            This sends a real invite email — they'll get a link to set their own password and sign in at{" "}
            <span className="font-semibold">/admin/login</span>. The roster entry and invite are created together;
            if the invite fails to send (e.g. this email already has any Supabase account, customer or otherwise),
            no roster entry is created either, so there's never a roster row with no way to actually sign in.
          </p>

          {error && (
            <p className="rounded-lg bg-red-50 px-3.5 py-2.5 text-sm font-medium text-red-700 ring-1 ring-inset ring-red-200">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => router.push("/admin/super-admin/staff")}
              className="rounded-xl border border-ink/15 bg-white px-4 py-2.5 text-sm font-semibold text-ink/70 hover:bg-parchment/60"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={!canSave || saving}
              className="rounded-xl bg-teal-deep px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-deep/90 disabled:cursor-not-allowed disabled:bg-ink/10 disabled:text-ink/35"
            >
              {saving ? "Sending invite…" : "Create account"}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}