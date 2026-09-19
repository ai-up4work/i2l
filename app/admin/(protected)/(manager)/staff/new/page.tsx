// app/admin/(manager)/staff/new/page.tsx
"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft, ShoppingBag, Warehouse, Copy, Check } from "lucide-react"

import { useAdminData } from "@/contexts/AdminDataContext"
import type { Role } from "@/types/admin"
import { panelClass, inputClass } from "@/components/admin/seller/shared"

// Manager-only. Role selector deliberately only ever offers Sales &
// Purchase or Warehouse — Manager and Super Admin accounts are never
// creatable here, only at /super-admin/staff/new (see that page). Site
// is only asked for when Warehouse is selected and genuinely hidden
// (not just left blank) otherwise, since Sales & Purchase is
// functionally scoped, not site-scoped — same convention as
// StaffMember.siteId/CurrentUser.siteId throughout the rest of the app.

type CreatableRole = Extract<Role, "sales" | "warehouse">

export default function NewStaffPage() {
  const router = useRouter()
  const { currentUser, sites, createStaffAccount } = useAdminData()

  useEffect(() => {
    if (currentUser.role !== "manager") router.replace("/admin/dashboard")
  }, [currentUser.role, router])

  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [role, setRole] = useState<CreatableRole>("sales")
  const [siteId, setSiteId] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Set once the account is created — a wrapped, one-time invite link
  // always comes back now (see app/api/admin/staff route.ts). Previously
  // this page discarded that link entirely and navigated straight back
  // to the roster, so a Manager-created account had no way to actually
  // be handed to the person — real sign-in existed, but nothing on this
  // page surfaced it.
  const [createdInviteLink, setCreatedInviteLink] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  if (currentUser.role !== "manager") return null

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
    setCreatedInviteLink(result.inviteLink ?? null)
  }

  const handleCopyLink = async () => {
    if (!createdInviteLink) return
    try {
      await navigator.clipboard.writeText(createdInviteLink)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard API can be unavailable (non-HTTPS, some embedded
      // browsers) — the link is still selectable/visible in the input
      // below either way, so this isn't a dead end even if it fails.
    }
  }

  // Success state — the account already exists at this point; this is
  // purely "here's the link, go deliver it yourself."
  if (createdInviteLink) {
    return (
      <div className="h-full overflow-y-auto bg-parchment font-body text-ink">
        <div className="mx-auto max-w-2xl px-6 pb-24 pt-10 lg:px-10">
          <h1 className="font-display text-3xl text-ink">Staff account created</h1>
          <p className="mt-1.5 max-w-md text-sm leading-relaxed text-ink/60">
            Copy this link and send it to {name.trim() || "them"} yourself — WhatsApp, email, SMS, whatever's
            easiest. It's a one-time link that lets them set their own password and sign in.
          </p>

          <div className={`mt-8 flex flex-col gap-3 p-6 ${panelClass}`}>
            <label className="text-xs font-semibold text-ink/50">Invite link</label>
            <div className="flex gap-2">
              <input
                type="text"
                readOnly
                value={createdInviteLink}
                onFocus={(e) => e.currentTarget.select()}
                className={`flex-1 ${inputClass} select-all`}
              />
              <button
                type="button"
                onClick={handleCopyLink}
                className="flex flex-none items-center gap-1.5 rounded-xl bg-teal-deep px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-deep/90"
              >
                {copied ? <Check size={15} /> : <Copy size={15} />}
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
            <p className="text-xs text-ink/40">
              This link only works once and expires after a while — if it goes unused too long, use "Resend
              invite" from their staff page to get a fresh one.
            </p>

            <div className="mt-3 flex justify-end">
              <button
                type="button"
                onClick={() => router.push("/admin/staff")}
                className="rounded-xl bg-teal-deep px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-deep/90"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto bg-parchment font-body text-ink">
      <div className="mx-auto max-w-2xl px-6 pb-24 pt-10 lg:px-10">
        <button
          type="button"
          onClick={() => router.push("/admin/staff")}
          className="flex items-center gap-1.5 text-sm font-medium text-ink/50 hover:text-ink"
        >
          <ArrowLeft size={15} />
          Back to Staff
        </button>

        <h1 className="mt-4 font-display text-3xl text-ink">Add staff</h1>
        <p className="mt-1.5 max-w-md text-sm leading-relaxed text-ink/60">
          Creates the roster entry and a one-time invite link for this person to set their own password.
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
              placeholder="name@wishdrop.shop"
              className={`mt-1.5 w-full ${inputClass}`}
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-ink/50">Role</label>
            <div className="mt-1.5 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setRole("sales")}
                className={`flex items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-semibold transition-colors ${
                  role === "sales"
                    ? "border-teal-deep bg-teal-deep/10 text-teal-deep"
                    : "border-ink/15 bg-white text-ink/60 hover:border-ink/25"
                }`}
              >
                <ShoppingBag size={15} /> Sales & Purchase
              </button>
              <button
                type="button"
                onClick={() => setRole("warehouse")}
                className={`flex items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-semibold transition-colors ${
                  role === "warehouse"
                    ? "border-teal-deep bg-teal-deep/10 text-teal-deep"
                    : "border-ink/15 bg-white text-ink/60 hover:border-ink/25"
                }`}
              >
                <Warehouse size={15} /> Warehouse
              </button>
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
            No email is sent automatically — after creating the account, you'll get a one-time link to copy and
            send to them yourself (WhatsApp, email, SMS — anywhere works, since the link is safe to paste anywhere).
            They set their own password and sign in at <span className="font-semibold">/admin/login</span>.
          </p>

          {error && (
            <p className="rounded-lg bg-red-50 px-3.5 py-2.5 text-sm font-medium text-red-700 ring-1 ring-inset ring-red-200">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => router.push("/admin/staff")}
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
              {saving ? "Creating…" : "Create account"}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}