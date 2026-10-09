// app/admin/(protected)/super-admin/media-cleanup/page.tsx
//
// Super Admin → Media cleanup. The same cleanup runs every night on its
// own (vercel.json → /api/cron/media-sweep); this page shows what it did
// and lets a Super Admin check and clean up right now.
//
// "Check now" only lists unused files. Deleting is a second, explicit
// click. If more than half the files look unused, the nightly run stops
// by itself — here the admin can look at the list and confirm.
"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { AlertTriangle, CheckCircle2, Film, HardDrive, Loader2, Search, Trash2 } from "lucide-react"

import { useAdminData } from "@/contexts/AdminDataContext"

type SweepFile = {
  source: "supabase" | "cloudinary"
  group: string
  id: string
  bytes: number
  createdAt: string
  url: string
}

type Report = {
  dryRun: boolean
  status: "ok" | "aborted" | "error"
  message: string
  references: number
  scanned: { supabase: number; cloudinary: number }
  inUse: number
  tooNew: number
  orphans: number
  orphanBytes: number
  deleted: number
  bytesFreed: number
  failed: number
  cloudinaryConfigured: boolean
  sample: SweepFile[]
  errors: string[]
}

type Run = {
  id: string
  ran_at: string
  trigger: string
  dry_run: boolean
  status: string
  scanned: number
  orphans: number
  deleted: number
  bytes_freed: number
  message: string | null
}

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(0)} KB`
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`
  return `${(n / 1024 ** 3).toFixed(2)} GB`
}

function formatWhen(iso: string) {
  return new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
}

function sourceLabel(f: SweepFile) {
  return f.source === "cloudinary" ? `Cloudinary · ${f.group}` : f.group === "chat-attachments" ? "Chat attachment" : `Supabase · ${f.id.split("/")[0]}`
}

export default function MediaCleanupPage() {
  const router = useRouter()
  const { role } = useAdminData()
  const [runs, setRuns] = useState<Run[]>([])
  const [report, setReport] = useState<Report | null>(null)
  const [busy, setBusy] = useState<"check" | "delete" | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (role && role !== "super_admin") router.replace("/admin/dashboard")
  }, [role, router])

  useEffect(() => {
    fetch("/api/admin/media-sweep")
      .then((r) => r.json())
      .then((b) => setRuns(b.runs ?? []))
      .catch(() => {})
  }, [])

  async function run(dryRun: boolean, force = false) {
    setBusy(dryRun ? "check" : "delete")
    setError(null)
    try {
      const res = await fetch("/api/admin/media-sweep", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dryRun, force }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error ?? "The check didn't finish. Try again.")
      setReport(body.report)
      setRuns(body.runs ?? [])
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  function confirmDelete() {
    if (!report) return
    const big = report.status === "aborted"
    const ok = window.confirm(
      big
        ? `More than half of all files look unused (${report.orphans}). Only continue if you've checked the list below and these really are old files.\n\nDelete ${report.orphans} files permanently?`
        : `Delete ${report.orphans} unused ${report.orphans === 1 ? "file" : "files"} permanently? This can't be undone.`,
    )
    if (ok) run(false, big)
  }

  if (role && role !== "super_admin") return null

  const lastRun = runs.find((r) => !r.dry_run)
  const canDelete = report && report.dryRun && report.orphans > 0 && report.status !== "error" && report.references > 0

  return (
    <div className="h-full overflow-y-auto bg-parchment font-body text-ink">
      <div className="mx-auto max-w-[1200px] px-6 pb-20 pt-10 lg:px-10">
        {/* ── Header ── */}
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex items-start gap-4">
            <div className="grid h-12 w-12 flex-none place-items-center rounded-xl bg-teal-deep text-parchment">
              <HardDrive size={22} strokeWidth={1.75} />
            </div>
            <div>
              <h1 className="font-display text-3xl font-semibold leading-tight">Media cleanup</h1>
              <p className="mt-1 max-w-xl text-sm leading-relaxed text-ink/60">
                Photos and videos nothing links to any more — replaced, removed, or left behind by a deleted product, store or
                chat — are deleted every night at 3:00 AM. Files from the last 24 hours are never touched.
              </p>
            </div>
          </div>

          <dl className="flex divide-x divide-ink/10 overflow-hidden rounded-2xl border border-ink/10 bg-card">
            <div className="px-5 py-3">
              <dt className="whitespace-nowrap text-xs font-medium text-ink/45">Last cleanup</dt>
              <dd className="mt-0.5 font-display text-xl text-ink">{lastRun ? formatWhen(lastRun.ran_at) : "—"}</dd>
            </div>
            <div className="px-5 py-3">
              <dt className="whitespace-nowrap text-xs font-medium text-ink/45">Files deleted</dt>
              <dd className="mt-0.5 font-display text-xl text-ink">{lastRun ? lastRun.deleted : "—"}</dd>
            </div>
            <div className="px-5 py-3">
              <dt className="whitespace-nowrap text-xs font-medium text-ink/45">Space freed</dt>
              <dd className="mt-0.5 font-display text-xl text-ink">{lastRun ? formatBytes(lastRun.bytes_freed) : "—"}</dd>
            </div>
          </dl>
        </div>

        {/* ── Actions ── */}
        <div className="mt-9 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => run(true)}
            disabled={busy !== null}
            className="inline-flex h-11 items-center gap-2 rounded-xl bg-indigo px-5 text-sm font-semibold text-parchment transition-colors hover:bg-indigo-deep disabled:opacity-50"
          >
            {busy === "check" ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
            {busy === "check" ? "Checking every file…" : "Check now"}
          </button>
          {canDelete && (
            <button
              type="button"
              onClick={confirmDelete}
              disabled={busy !== null}
              className="inline-flex h-11 items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-5 text-sm font-semibold text-red-700 transition-colors hover:bg-red-100 disabled:opacity-50"
            >
              {busy === "delete" ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
              Delete {report!.orphans} unused {report!.orphans === 1 ? "file" : "files"} · {formatBytes(report!.orphanBytes)}
            </button>
          )}
          <p className="text-xs text-ink/45">Checking only lists files. Nothing is deleted until you confirm.</p>
        </div>

        {error && (
          <p role="alert" className="mt-5 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </p>
        )}

        {/* ── Result ── */}
        {report && (
          <section className="mt-6 rounded-2xl border border-ink/10 bg-card p-6">
            <div className="flex items-start gap-3">
              {report.status === "ok" ? (
                <CheckCircle2 size={20} className="mt-0.5 flex-none text-teal-deep" />
              ) : (
                <AlertTriangle size={20} className={`mt-0.5 flex-none ${report.status === "error" ? "text-red-600" : "text-gold-deep"}`} />
              )}
              <div>
                <p className="font-display text-lg font-semibold">{report.message}</p>
                {report.status === "aborted" && report.references > 0 && (
                  <p className="mt-1 text-sm text-ink/60">
                    Look through the files below. If they really are old, you can still delete them with the button above.
                  </p>
                )}
              </div>
            </div>

            <dl className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-5">
              {[
                ["Files checked", report.scanned.supabase + report.scanned.cloudinary],
                ["In use", report.inUse],
                ["Too new to touch", report.tooNew],
                ["Unused", report.orphans],
                [report.dryRun ? "Could free" : "Freed", formatBytes(report.dryRun ? report.orphanBytes : report.bytesFreed)],
              ].map(([k, v]) => (
                <div key={k as string} className="rounded-xl bg-parchment px-4 py-3">
                  <dt className="text-xs font-medium text-ink/45">{k}</dt>
                  <dd className="mt-0.5 font-display text-xl">{v}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-3 text-xs text-ink/45">
              Supabase {report.scanned.supabase} · Cloudinary{" "}
              {report.cloudinaryConfigured ? report.scanned.cloudinary : "not set up"} · {report.references} links found in the database
            </p>

            {report.sample.length > 0 && report.dryRun && (
              <>
                <h2 className="mt-7 text-sm font-semibold text-ink/70">
                  {report.orphans > report.sample.length ? `Largest ${report.sample.length} of ${report.orphans}` : "Unused files"}
                </h2>
                <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
                  {report.sample.map((f) => (
                    <li key={`${f.source}:${f.group}:${f.id}`} className="overflow-hidden rounded-xl border border-ink/10 bg-parchment">
                      <a href={f.url} target="_blank" rel="noreferrer" className="block aspect-square bg-ink/5">
                        {f.group === "video" || /\.(mp4|mov|webm|m4v)$/i.test(f.id) ? (
                          <span className="grid h-full place-items-center text-ink/40">
                            <Film size={26} />
                          </span>
                        ) : (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={f.url} alt="" loading="lazy" className="h-full w-full object-cover" />
                        )}
                      </a>
                      <div className="px-2.5 py-2">
                        <p className="truncate text-[11px] font-medium text-ink/70">{sourceLabel(f)}</p>
                        <p className="text-[11px] text-ink/45">
                          {formatBytes(f.bytes)} · {formatWhen(f.createdAt)}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              </>
            )}

            {report.errors.length > 0 && (
              <details className="mt-6 text-xs text-ink/50">
                <summary className="cursor-pointer">Notes ({report.errors.length})</summary>
                <ul className="mt-2 list-disc pl-5">
                  {report.errors.map((e, i) => (
                    <li key={i}>{e}</li>
                  ))}
                </ul>
              </details>
            )}
          </section>
        )}

        {/* ── History ── */}
        <section className="mt-10">
          <h2 className="font-display text-xl font-semibold">Recent cleanups</h2>
          {runs.length === 0 ? (
            <p className="mt-3 text-sm text-ink/55">No cleanups yet. The first one runs tonight, or press Check now.</p>
          ) : (
            <div className="mt-3 overflow-x-auto rounded-2xl border border-ink/10 bg-card">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="text-xs text-ink/45">
                  <tr className="border-b border-ink/10">
                    <th className="px-4 py-3 font-medium">When</th>
                    <th className="px-4 py-3 font-medium">How</th>
                    <th className="px-4 py-3 font-medium">Checked</th>
                    <th className="px-4 py-3 font-medium">Deleted</th>
                    <th className="px-4 py-3 font-medium">Freed</th>
                    <th className="px-4 py-3 font-medium">Result</th>
                  </tr>
                </thead>
                <tbody>
                  {runs.map((r) => (
                    <tr key={r.id} className="border-b border-ink/5 last:border-0">
                      <td className="whitespace-nowrap px-4 py-3">{formatWhen(r.ran_at)}</td>
                      <td className="px-4 py-3 text-ink/60">{r.trigger === "manual" ? "By hand" : "Nightly"}</td>
                      <td className="px-4 py-3">{r.scanned}</td>
                      <td className="px-4 py-3">{r.deleted}</td>
                      <td className="px-4 py-3">{formatBytes(r.bytes_freed)}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                            r.status === "ok" ? "bg-teal/10 text-teal-deep" : r.status === "aborted" ? "bg-gold/15 text-gold-deep" : "bg-red-50 text-red-700"
                          }`}
                          title={r.message ?? undefined}
                        >
                          {r.status === "ok" ? "Done" : r.status === "aborted" ? "Stopped" : "Failed"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
