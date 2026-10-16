// app/admin/(protected)/super-admin/audit-log/page.tsx
//
// Super Admin → Audit log. Every important change — orders, requests,
// payments, refunds, coupons, staff, stores, products, settings — with who
// did it, when, from which page, and exactly what changed (old → new; for
// deletions, the whole record as it was). Recorded by the database itself
// (data/wishdrop-audit-log.sql), so it can't be skipped or edited.
//
// Filters live in the URL, so a link like ?ref=WD-1000051 (the "Audit
// trail" link on an order) opens straight to that order's history.
"use client"

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import {
  AlertTriangle,
  ChevronDown,
  Download,
  FilePlus2,
  History,
  Loader2,
  PencilLine,
  Search,
  ShieldAlert,
  Trash2,
  X,
} from "lucide-react"

type AuditRow = {
  id: number
  at: string
  actor_user_id: string | null
  actor_name: string | null
  actor_role: string | null
  action: "created" | "updated" | "deleted"
  entity_type: string
  entity_id: string | null
  entity_label: string | null
  severity: "info" | "warning" | "critical"
  summary: string
  changes: Record<string, [unknown, unknown]> | null
  snapshot: Record<string, unknown> | null
  route: string | null
}

type StaffOption = { userId: string; name: string; role: string | null }

const FILTER_KEYS = ["q", "actor", "role", "entity", "action", "severity", "from", "to", "ref"] as const
type Filters = Partial<Record<(typeof FILTER_KEYS)[number], string>>

const ROLE_LABEL: Record<string, string> = {
  super_admin: "Super Admin",
  manager: "Manager",
  sales: "Sales",
  warehouse: "Warehouse",
  customer: "Customer",
  system: "System",
  pending: "Pending staff",
}

const AREA_LABEL: Record<string, string> = {
  order: "Order",
  "order item": "Order item",
  "order note": "Order note",
  request: "Request",
  purchase: "Purchase",
  checkout: "Checkout",
  payment: "Payment",
  refund: "Refund",
  coupon: "Coupon",
  "coupon holder": "Coupon holder",
  "coupon use": "Coupon use",
  referral: "Referral",
  "referral settings": "Referral settings",
  staff: "Staff account",
  store: "Store",
  product: "Product",
  "pricing settings": "Pricing settings",
  "chat message": "Chat message",
  customer: "Customer",
}

/** Quick views at the top. */
const PRESETS: { label: string; filters: Filters }[] = [
  { label: "Everything", filters: {} },
  { label: "Important", filters: { severity: "important" } },
  { label: "Deletions", filters: { action: "deleted" } },
  { label: "Payments & refunds", filters: { entity: "payment,refund,checkout" } },
  { label: "Orders", filters: { entity: "order" } },
  { label: "Staff accounts", filters: { entity: "staff" } },
  { label: "Coupons", filters: { entity: "coupon" } },
]

const FIELD =
  "h-10 w-full rounded-xl border border-ink/10 bg-card px-3 text-sm text-ink outline-none transition focus:border-teal/50 focus:ring-2 focus:ring-teal/15"

const dayFmt = new Intl.DateTimeFormat("en-LK", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Colombo" })
const timeFmt = new Intl.DateTimeFormat("en-LK", { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "Asia/Colombo" })

function prettyField(k: string): string {
  return k
    .replace(/_lkr$/, " (Rs.)")
    .replace(/_id$/, "")
    .replace(/_/g, " ")
    .replace(/^\w/, (c) => c.toUpperCase())
}

function prettyValue(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—"
  if (typeof v === "boolean") return v ? "Yes" : "No"
  if (typeof v === "number") return v.toLocaleString("en-LK")
  if (typeof v === "string") {
    if (/^\d{4}-\d{2}-\d{2}T/.test(v)) {
      const d = new Date(v)
      if (!Number.isNaN(d.getTime())) return d.toLocaleString("en-LK", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Colombo" })
    }
    if (/^[0-9a-f-]{36}$/i.test(v)) return `${v.slice(0, 8)}…`
    return v.length > 80 ? `${v.slice(0, 77)}…` : v.replace(/_/g, " ")
  }
  const s = JSON.stringify(v)
  return s.length > 80 ? `${s.slice(0, 77)}…` : s
}

/** The few fields worth showing at a glance for a new record. */
const HIGHLIGHT_FIELDS = [
  "amount_lkr", "method", "reason", "reference", "total_value", "total_lkr", "status", "role", "email",
  "discount_type", "discount_value", "title", "name", "quote",
]
function highlightsFor(snap: Record<string, unknown>): [string, unknown][] {
  return HIGHLIGHT_FIELDS.filter((k) => snap[k] !== undefined && snap[k] !== null && snap[k] !== "")
    .slice(0, 4)
    .map((k) => [k, snap[k]])
}

function initials(name: string | null): string {
  return (name ?? "?")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("")
}

function entityHref(r: AuditRow): string | null {
  if (r.action === "deleted") return null
  switch (r.entity_type) {
    case "order":
      return r.entity_label ? `/admin/orders/${encodeURIComponent(r.entity_label)}` : null
    case "request":
      return r.entity_id ? `/admin/requests/${r.entity_id}` : null
    case "coupon":
      return r.entity_id ? `/admin/coupons/${r.entity_id}` : null
    case "staff":
      return r.entity_id ? `/admin/super-admin/staff/${r.entity_id}` : null
    default:
      return null
  }
}

const ACTION_STYLE: Record<AuditRow["action"], { icon: typeof FilePlus2; cls: string; verb: string }> = {
  created: { icon: FilePlus2, cls: "bg-teal/10 text-teal-deep", verb: "created" },
  updated: { icon: PencilLine, cls: "bg-indigo/[0.07] text-indigo", verb: "changed" },
  deleted: { icon: Trash2, cls: "bg-rose-50 text-rose-700", verb: "deleted" },
}

const SEVERITY_DOT: Record<AuditRow["severity"], string> = {
  info: "bg-ink/20",
  warning: "bg-amber-500",
  critical: "bg-rose-600",
}

function AuditEntry({ row }: { row: AuditRow }) {
  const [open, setOpen] = useState(false)
  const style = ACTION_STYLE[row.action] ?? ACTION_STYLE.updated
  const Icon = style.icon
  const href = entityHref(row)
  const area = AREA_LABEL[row.entity_type] ?? prettyField(row.entity_type)
  const record = row.entity_label ?? (row.entity_id ? `${row.entity_id.slice(0, 8)}…` : "")
  const changes = row.changes ? Object.entries(row.changes) : []
  // Order / request numbers look like codes; titles and reasons don't.
  const codeLike = /^[A-Z]{2,5}-\d+$/.test(record) || record.endsWith("…")

  return (
    <li
      className={`relative rounded-2xl border bg-card p-4 transition-shadow hover:shadow-sm ${
        row.severity === "critical" ? "border-rose-200" : row.severity === "warning" ? "border-amber-200" : "border-ink/10"
      }`}
    >
      <div className="flex items-start gap-3">
        <span
          className={`grid h-9 w-9 flex-none place-items-center rounded-full text-xs font-bold ${
            row.actor_role === "system" ? "bg-ink/[0.06] text-ink/50" : row.actor_role === "customer" ? "bg-gold/15 text-gold-deep" : "bg-indigo text-gold"
          }`}
          title={row.actor_name ?? undefined}
        >
          {row.actor_role === "system" ? <History size={15} /> : initials(row.actor_name)}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
            <span className="font-semibold text-ink">{row.actor_name ?? "Unknown"}</span>
            <span className="rounded-full bg-ink/[0.05] px-2 py-0.5 text-[11px] font-semibold text-ink/55">
              {ROLE_LABEL[row.actor_role ?? ""] ?? row.actor_role ?? "—"}
            </span>
            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${style.cls}`}>
              <Icon size={11} /> {style.verb}
            </span>
            <span className="text-ink/60">{area}</span>
            {record &&
              (href ? (
                <Link href={href} className={`${codeLike ? "font-mono text-[13px]" : ""} font-semibold text-teal-deep hover:underline`}>
                  {record}
                </Link>
              ) : (
                <span className={`${codeLike ? "font-mono text-[13px]" : ""} font-semibold text-ink/80`}>{record}</span>
              ))}
          </div>

          {changes.length > 0 && (
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {changes.slice(0, open ? undefined : 4).map(([k, [from, to]]) => (
                <li key={k} className="inline-flex max-w-full items-center gap-1.5 rounded-lg bg-parchment px-2 py-1 text-xs ring-1 ring-ink/[0.06]">
                  <span className="font-semibold text-ink/70">{prettyField(k)}</span>
                  <span className="truncate text-ink/45 line-through decoration-ink/25">{prettyValue(from)}</span>
                  <span className="text-ink/30">→</span>
                  <span className="truncate font-semibold text-ink">{prettyValue(to)}</span>
                </li>
              ))}
              {!open && changes.length > 4 && <li className="self-center text-xs text-ink/45">+{changes.length - 4} more</li>}
            </ul>
          )}

          {row.action === "deleted" && row.snapshot && (
            <p className="mt-2 text-xs text-rose-700/80">The full record as it was is saved — open details to see it.</p>
          )}
          {row.action === "created" && row.snapshot && (
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {highlightsFor(row.snapshot).map(([k, v]) => (
                <li key={k} className="inline-flex items-center gap-1.5 rounded-lg bg-parchment px-2 py-1 text-xs ring-1 ring-ink/[0.06]">
                  <span className="font-semibold text-ink/70">{prettyField(k)}</span>
                  <span className="font-semibold text-ink">{prettyValue(v)}</span>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-ink/45">
            <span className="flex items-center gap-1.5">
              <span className={`h-1.5 w-1.5 rounded-full ${SEVERITY_DOT[row.severity]}`} />
              {row.severity === "critical" ? "Critical" : row.severity === "warning" ? "Worth a look" : "Routine"}
            </span>
            {row.route && <span>from {row.route}</span>}
            {(row.snapshot || changes.length > 4) && (
              <button type="button" onClick={() => setOpen((v) => !v)} className="inline-flex items-center gap-0.5 font-semibold text-teal-deep hover:underline">
                {open ? "Hide details" : "Details"} <ChevronDown size={11} className={open ? "rotate-180" : ""} />
              </button>
            )}
          </div>

          {open && row.snapshot && (
            <dl className="mt-3 grid gap-x-4 gap-y-1 rounded-xl bg-parchment p-3 text-xs sm:grid-cols-2">
              {Object.entries(row.snapshot).map(([k, v]) => (
                <div key={k} className="flex min-w-0 gap-2">
                  <dt className="flex-none font-semibold text-ink/55">{prettyField(k)}</dt>
                  <dd className="truncate text-ink/75" title={typeof v === "string" ? v : JSON.stringify(v)}>
                    {prettyValue(v)}
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </div>

        <time className="flex-none text-right text-xs tabular-nums text-ink/45" dateTime={row.at}>
          {timeFmt.format(new Date(row.at))}
        </time>
      </div>
    </li>
  )
}

function AuditLogInner() {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()

  const filters = useMemo<Filters>(() => {
    const f: Filters = {}
    for (const k of FILTER_KEYS) {
      const v = params.get(k)
      if (v) f[k] = v
    }
    return f
  }, [params])

  const [rows, setRows] = useState<AuditRow[] | null>(null)
  const [nextBefore, setNextBefore] = useState<number | null>(null)
  const [staff, setStaff] = useState<StaffOption[]>([])
  const [entities, setEntities] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)
  const [search, setSearch] = useState(filters.q ?? "")
  const [refInput, setRefInput] = useState(filters.ref ?? "")
  const reqId = useRef(0)

  const qs = useCallback(
    (extra: Record<string, string> = {}) => {
      const p = new URLSearchParams()
      for (const [k, v] of Object.entries(filters)) if (v) p.set(k, v)
      for (const [k, v] of Object.entries(extra)) p.set(k, v)
      return p.toString()
    },
    [filters],
  )

  const setFilters = (next: Filters) => {
    const p = new URLSearchParams()
    for (const [k, v] of Object.entries(next)) if (v) p.set(k, v)
    router.replace(p.toString() ? `${pathname}?${p}` : pathname, { scroll: false })
  }
  const patch = (k: keyof Filters, v: string) => setFilters({ ...filters, [k]: v || undefined })

  useEffect(() => {
    const id = ++reqId.current
    setRows(null)
    setError(null)
    fetch(`/api/admin/audit?${qs()}`)
      .then(async (r) => {
        const body = await r.json().catch(() => ({}))
        if (id !== reqId.current) return
        if (!r.ok) {
          setError(body.error ?? "Couldn’t load the audit log.")
          setRows([])
          return
        }
        setRows(body.rows ?? [])
        setNextBefore(body.nextBefore ?? null)
        if (body.staff) setStaff(body.staff)
        if (body.entities) setEntities(body.entities)
      })
      .catch(() => id === reqId.current && (setError("Couldn’t load the audit log."), setRows([])))
  }, [qs])

  // Debounced search box -> URL.
  useEffect(() => {
    const t = setTimeout(() => {
      if ((filters.q ?? "") !== search.trim()) patch("q", search.trim())
    }, 400)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search])

  const loadMore = async () => {
    if (!nextBefore) return
    setLoadingMore(true)
    const r = await fetch(`/api/admin/audit?${qs({ before: String(nextBefore) })}`)
    const body = await r.json().catch(() => ({}))
    setLoadingMore(false)
    if (r.ok) {
      setRows((prev) => [...(prev ?? []), ...(body.rows ?? [])])
      setNextBefore(body.nextBefore ?? null)
    }
  }

  const groups = useMemo(() => {
    const out: { day: string; rows: AuditRow[] }[] = []
    for (const r of rows ?? []) {
      const day = dayFmt.format(new Date(r.at))
      const g = out[out.length - 1]
      if (g && g.day === day) g.rows.push(r)
      else out.push({ day, rows: [r] })
    }
    return out
  }, [rows])

  const counts = useMemo(() => {
    const c = { critical: 0, warning: 0, total: rows?.length ?? 0 }
    for (const r of rows ?? []) if (r.severity === "critical") c.critical++
    else if (r.severity === "warning") c.warning++
    return c
  }, [rows])

  const active = Object.keys(filters).length > 0
  const presetActive = (f: Filters) => JSON.stringify(f) === JSON.stringify(filters)

  return (
    <div className="h-full overflow-y-auto bg-parchment font-body text-ink">
      <div className="mx-auto max-w-[1200px] px-6 pb-20 pt-10 lg:px-10">
        {/* Header */}
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex items-start gap-4">
            <div className="grid h-12 w-12 flex-none place-items-center rounded-xl bg-indigo text-gold">
              <ShieldAlert size={22} strokeWidth={1.75} />
            </div>
            <div>
              <h1 className="font-display text-3xl font-semibold leading-tight">Audit log</h1>
              <p className="mt-1 max-w-xl text-sm leading-relaxed text-ink/60">
                Every important change — who did it, when, from where, and exactly what changed. Recorded by the database
                itself, so it can’t be skipped or edited.
              </p>
            </div>
          </div>
          <dl className="flex divide-x divide-ink/10 overflow-hidden rounded-2xl border border-ink/10 bg-card">
            <div className="px-5 py-3">
              <dt className="whitespace-nowrap text-xs font-medium text-ink/45">Showing</dt>
              <dd className="mt-0.5 font-display text-xl text-ink">{rows ? `${counts.total}${nextBefore ? "+" : ""}` : "—"}</dd>
            </div>
            <div className="px-5 py-3">
              <dt className="whitespace-nowrap text-xs font-medium text-ink/45">Worth a look</dt>
              <dd className="mt-0.5 font-display text-xl text-amber-700">{rows ? counts.warning : "—"}</dd>
            </div>
            <div className="px-5 py-3">
              <dt className="whitespace-nowrap text-xs font-medium text-ink/45">Critical</dt>
              <dd className={`mt-0.5 font-display text-xl ${counts.critical ? "text-rose-700" : "text-ink"}`}>{rows ? counts.critical : "—"}</dd>
            </div>
          </dl>
        </div>

        {/* Quick views */}
        <div className="mt-8 flex flex-wrap gap-2">
          {PRESETS.map((pr) => (
            <button
              key={pr.label}
              type="button"
              onClick={() => {
                setSearch("")
                setRefInput("")
                setFilters(pr.filters)
              }}
              className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                presetActive(pr.filters) ? "bg-indigo text-parchment" : "bg-card text-ink/60 ring-1 ring-ink/10 hover:text-ink"
              }`}
            >
              {pr.label}
            </button>
          ))}
        </div>

        {/* Filters */}
        <div className="mt-4 grid gap-3 rounded-2xl border border-ink/10 bg-card p-4 sm:grid-cols-2 lg:grid-cols-4">
          <label className="relative sm:col-span-2">
            <span className="sr-only">Search</span>
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink/35" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search what happened, a name or a number…" className={`${FIELD} pl-9`} />
          </label>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              patch("ref", refInput.trim())
            }}
            className="sm:col-span-2"
          >
            <label className="relative block">
              <span className="sr-only">Order or request number</span>
              <input
                value={refInput}
                onChange={(e) => setRefInput(e.target.value)}
                onBlur={() => patch("ref", refInput.trim())}
                placeholder="Exact order / request number, e.g. WD-1000051"
                className={`${FIELD} font-mono`}
              />
            </label>
          </form>

          <select value={filters.actor ?? ""} onChange={(e) => patch("actor", e.target.value)} className={FIELD} aria-label="Person">
            <option value="">Anyone</option>
            <option value="system">System / SQL editor</option>
            {staff.map((s) => (
              <option key={s.userId} value={s.userId}>
                {s.name}
                {s.role ? ` · ${ROLE_LABEL[s.role] ?? s.role}` : ""}
              </option>
            ))}
          </select>
          <select value={filters.role ?? ""} onChange={(e) => patch("role", e.target.value)} className={FIELD} aria-label="Role">
            <option value="">Any role</option>
            {["super_admin", "manager", "sales", "warehouse", "customer", "system"].map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </select>
          <select value={filters.entity ?? ""} onChange={(e) => patch("entity", e.target.value)} className={FIELD} aria-label="Area">
            <option value="">Every area</option>
            <option value="payment,refund,checkout">Payments & refunds</option>
            {Array.from(new Set([...Object.keys(AREA_LABEL), ...entities])).map((e) => (
              <option key={e} value={e}>
                {AREA_LABEL[e] ?? prettyField(e)}
              </option>
            ))}
          </select>
          <div className="grid grid-cols-2 gap-3">
            <select value={filters.action ?? ""} onChange={(e) => patch("action", e.target.value)} className={FIELD} aria-label="Action">
              <option value="">Any action</option>
              <option value="created">Created</option>
              <option value="updated">Changed</option>
              <option value="deleted">Deleted</option>
            </select>
            <select value={filters.severity ?? ""} onChange={(e) => patch("severity", e.target.value)} className={FIELD} aria-label="Severity">
              <option value="">Any level</option>
              <option value="important">Important</option>
              <option value="critical">Critical</option>
              <option value="warning">Worth a look</option>
              <option value="info">Routine</option>
            </select>
          </div>
          <label className="text-xs font-medium text-ink/50">
            From
            <input type="date" value={filters.from ?? ""} onChange={(e) => patch("from", e.target.value)} className={`${FIELD} mt-1`} />
          </label>
          <label className="text-xs font-medium text-ink/50">
            To
            <input type="date" value={filters.to ?? ""} onChange={(e) => patch("to", e.target.value)} className={`${FIELD} mt-1`} />
          </label>
          <div className="flex items-end gap-2 sm:col-span-2">
            {active && (
              <button
                type="button"
                onClick={() => {
                  setSearch("")
                  setRefInput("")
                  setFilters({})
                }}
                className="inline-flex h-10 items-center gap-1.5 rounded-xl px-3 text-sm font-semibold text-ink/55 hover:bg-ink/[0.04] hover:text-ink"
              >
                <X size={14} /> Clear filters
              </button>
            )}
            <a
              href={`/api/admin/audit?${qs({ format: "csv" })}`}
              className="ml-auto inline-flex h-10 items-center gap-2 rounded-xl border border-ink/15 bg-white px-4 text-sm font-semibold text-ink/75 hover:bg-ink/[0.03]"
            >
              <Download size={14} /> Export CSV
            </a>
          </div>
        </div>

        {/* Results */}
        <div className="mt-8">
          {error ? (
            <p className="flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              <AlertTriangle size={16} className="mt-0.5 flex-none" /> {error}
            </p>
          ) : rows === null ? (
            <div className="flex justify-center py-16 text-ink/35">
              <Loader2 className="animate-spin" size={22} />
            </div>
          ) : rows.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-ink/15 px-6 py-16 text-center">
              <History size={24} className="mx-auto text-ink/25" />
              <p className="mt-3 text-sm font-semibold text-ink/70">Nothing matches these filters</p>
              <p className="mt-1 text-xs text-ink/45">Changes appear here the moment they happen.</p>
            </div>
          ) : (
            <div className="space-y-8">
              {groups.map((g) => (
                <section key={g.day}>
                  <h2 className="mb-3 flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.14em] text-ink/45">
                    {g.day}
                    <span className="h-px flex-1 bg-ink/10" />
                    <span className="normal-case tracking-normal text-ink/35">{g.rows.length}</span>
                  </h2>
                  <ul className="space-y-2.5">
                    {g.rows.map((r) => (
                      <AuditEntry key={r.id} row={r} />
                    ))}
                  </ul>
                </section>
              ))}
              {nextBefore && (
                <div className="flex justify-center">
                  <button
                    type="button"
                    onClick={loadMore}
                    disabled={loadingMore}
                    className="inline-flex h-11 items-center gap-2 rounded-xl bg-indigo px-5 text-sm font-semibold text-parchment hover:bg-indigo-deep disabled:opacity-50"
                  >
                    {loadingMore && <Loader2 size={15} className="animate-spin" />} Load older
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function AuditLogPage() {
  return (
    <Suspense fallback={null}>
      <AuditLogInner />
    </Suspense>
  )
}
