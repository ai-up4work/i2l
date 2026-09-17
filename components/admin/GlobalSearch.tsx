// components/admin/GlobalSearch.tsx
//
// Replaces CurrentStaffBadge in the admin header — that badge duplicated
// the sidebar's own profile row exactly (same name, same role, both
// visible on screen at once). This is genuinely new: nothing else in
// the app lets you jump straight to an order, request, or staff member
// by typing a few characters, and on a page like Analytics — scanning
// across every site at once — that's real friction removed.
//
// Searches whatever the CURRENT viewer can actually reach, not
// everything that exists: orders/requests come from visibleOrders/
// requestLines (already role- and site-scoped by AdminDataContext —
// see its own comments on why, e.g. a Warehouse account only seeing its
// own site's orders), Warehouse gets no request results at all (mirrors
// the real page-level guard on /admin/requests), and staff results only
// include Manager/Super Admin accounts when the viewer actually is
// super_admin. A result you can't otherwise reach doesn't appear here
// either — this is a shortcut through the existing access boundaries,
// not a way around them.
"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Search, ClipboardList, MessageCircleQuestion, UserCog, X, CornerDownLeft } from "lucide-react"
import { useAdminData } from "@/contexts/AdminDataContext"

type ResultKind = "order" | "request" | "staff"

interface SearchResult {
  kind: ResultKind
  key: string
  title: string
  subtitle: string
  href: string
}

const KIND_LABEL: Record<ResultKind, string> = { order: "Orders", request: "Requests", staff: "Staff" }
const KIND_ICON: Record<ResultKind, React.ComponentType<{ size?: number; className?: string }>> = {
  order: ClipboardList,
  request: MessageCircleQuestion,
  staff: UserCog,
}

function norm(s: string) {
  return s.toLowerCase().trim()
}

export function GlobalSearch() {
  const router = useRouter()
  const { role, visibleOrders, requestLines, staffDirectory } = useAdminData()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  // ⌘K / Ctrl+K opens from anywhere; Escape closes. Global, not scoped
  // to the trigger button, so it works the same way it would in any
  // real command palette — you shouldn't need to click into the header
  // first for a shortcut whose whole point is not clicking around.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault()
        setOpen(true)
      } else if (e.key === "Escape") {
        setOpen(false)
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [])

  useEffect(() => {
    if (open) {
      setQuery("")
      setActiveIndex(0)
      // Wait a frame — the input isn't mounted yet on the same tick the
      // modal opens.
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [open])

  const results = useMemo<SearchResult[]>(() => {
    const q = norm(query)
    if (!q) return []

    const orderResults: SearchResult[] = visibleOrders
      .filter((o) => norm(o.id).includes(q) || norm(o.customerName).includes(q))
      .slice(0, 6)
      .map((o) => ({
        kind: "order",
        key: `order-${o.id}`,
        title: o.customerName,
        subtitle: `${o.id} · ${o.stage}`,
        href: `/admin/orders/${o.id}`,
      }))

    // Mirrors the real /admin/requests page-level guard — Warehouse
    // can't see Requests at all, so it shouldn't find them here either.
    const requestResults: SearchResult[] =
      role === "warehouse"
        ? []
        : requestLines
            .filter((r) => norm(r.id).includes(q) || norm(r.customerName).includes(q))
            .slice(0, 6)
            .map((r) => ({
              kind: "request",
              key: `request-${r.id}`,
              title: r.customerName,
              subtitle: `${r.id} · ${r.status}`,
              href: `/admin/requests/${r.id}`,
            }))

    const staffResults: SearchResult[] = staffDirectory
      // Same visibility rule as /admin/staff (Manager's own roster) —
      // a Manager searching here shouldn't be able to find their way to
      // a Manager or Super Admin account any more than they could by
      // browsing to it directly.
      .filter((s) => role === "super_admin" || (s.role !== "manager" && s.role !== "super_admin"))
      .filter((s) => norm(s.name).includes(q) || norm(s.email).includes(q))
      .slice(0, 6)
      .map((s) => ({
        kind: "staff",
        key: `staff-${s.id}`,
        title: s.name,
        subtitle: s.email,
        // Manager/Super Admin accounts don't have a real detail page
        // yet (app/admin/(protected)/super-admin/staff/[staffId]/ is
        // still a stub) — land on the roster list instead of a dead
        // end. Sales & Purchase/Warehouse accounts have a real one.
        href: s.role === "manager" || s.role === "super_admin" ? "/admin/super-admin/staff" : `/admin/staff/${s.id}`,
      }))

    return [...orderResults, ...requestResults, ...staffResults]
  }, [query, role, visibleOrders, requestLines, staffDirectory])

  useEffect(() => setActiveIndex(0), [query])

  function go(result: SearchResult) {
    setOpen(false)
    router.push(result.href)
  }

  function onInputKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault()
      setActiveIndex((i) => Math.min(i + 1, results.length - 1))
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setActiveIndex((i) => Math.max(i - 1, 0))
    } else if (e.key === "Enter" && results[activeIndex]) {
      go(results[activeIndex])
    }
  }

  let runningIndex = -1

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full max-w-sm items-center gap-2.5 rounded-xl border border-ink/10 bg-white/70 px-3.5 py-2 text-left text-sm text-ink/40 transition-colors hover:border-ink/20 hover:bg-white"
      >
        <Search size={15} className="flex-none text-ink/35" />
        <span className="flex-1">Jump to an order, request, or staff member…</span>
        <kbd className="flex-none rounded-md border border-ink/15 bg-ink/[0.03] px-1.5 py-0.5 text-[10px] font-semibold text-ink/40">
          ⌘K
        </kbd>
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-ink/40 px-4 pt-[12vh] backdrop-blur-[1px]" onClick={() => setOpen(false)}>
          <div
            className="w-full max-w-xl overflow-hidden rounded-2xl border border-ink/10 bg-card shadow-[0_24px_64px_-16px_rgba(32,36,43,0.35)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2.5 border-b border-ink/10 px-4 py-3.5">
              <Search size={16} className="flex-none text-ink/35" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onInputKeyDown}
                placeholder="Search orders, requests, staff…"
                className="flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-ink/35"
              />
              <button type="button" onClick={() => setOpen(false)} className="flex-none rounded-md p-1 text-ink/30 hover:bg-ink/5 hover:text-ink/60">
                <X size={15} />
              </button>
            </div>

            <div className="max-h-[60vh] overflow-y-auto py-2">
              {query.trim() === "" ? (
                <p className="px-4 py-8 text-center text-sm text-ink/40">Start typing a name, ID, or email.</p>
              ) : results.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-ink/40">No matches for "{query}".</p>
              ) : (
                (["order", "request", "staff"] as ResultKind[]).map((kind) => {
                  const group = results.filter((r) => r.kind === kind)
                  if (group.length === 0) return null
                  const Icon = KIND_ICON[kind]
                  return (
                    <div key={kind} className="px-2 py-1.5">
                      <p className="px-2.5 pb-1 text-[11px] font-semibold uppercase tracking-wide text-ink/35">{KIND_LABEL[kind]}</p>
                      {group.map((r) => {
                        runningIndex += 1
                        const isActive = runningIndex === activeIndex
                        return (
                          <button
                            key={r.key}
                            type="button"
                            onMouseEnter={() => setActiveIndex(runningIndex)}
                            onClick={() => go(r)}
                            className={`flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-colors ${
                              isActive ? "bg-teal/10" : "hover:bg-ink/[0.03]"
                            }`}
                          >
                            <Icon size={15} className="flex-none text-ink/40" />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-medium text-ink">{r.title}</span>
                              <span className="block truncate text-xs text-ink/45">{r.subtitle}</span>
                            </span>
                            {isActive && <CornerDownLeft size={13} className="flex-none text-teal-deep" />}
                          </button>
                        )
                      })}
                    </div>
                  )
                })
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}