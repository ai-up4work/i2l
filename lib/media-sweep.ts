// lib/media-sweep.ts
//
// Ghost-media cleanup. Deletes every uploaded file that nothing in the
// database points to any more:
//   • Supabase Storage buckets `uploads` and `chat-attachments`
//     (Mall photos, QC photos, avatars, chat attachments)
//   • Cloudinary, everything under the `wishdrop/` folder
//     (social-store photos and videos)
//
// That covers every way a file becomes unreachable — a photo replaced, an
// image removed from a product, a product / store / chat deleted, a row
// removed by a cascade — without each feature having to remember to
// delete its own files. A file shared by two places (a variant reusing a
// product photo) stays until the last link to it is gone.
//
// HOW IT DECIDES
//   1. media_referenced_urls() (data/wishdrop-media-sweep.sql) collects
//      every Supabase / Cloudinary link stored anywhere in the database.
//   2. Every file is listed from Storage and Cloudinary.
//   3. A file is unused if no link points to it AND it's older than the
//      grace period (24h), so a photo uploaded into a form that hasn't
//      been saved yet is never touched.
//
// SAFETY
//   • If no links are found at all, nothing is deleted (a broken query
//     must not look like "nothing is used").
//   • If more than half the files (of 20+) look unused, the run stops and
//     reports instead of deleting, unless a Super Admin confirms it.
//
// Server only — uses the service role and the Cloudinary API secret.

import { createServiceRoleClient } from '@/lib/supabase/server'
import { cloudinaryConfig } from '@/lib/cloudinary'

export const SWEEP_BUCKETS = ['uploads', 'chat-attachments'] as const
export const SWEEP_GRACE_HOURS = 24
const ABORT_RATIO = 0.5
const ABORT_MIN_FILES = 20
const SAMPLE_SIZE = 24

type Admin = ReturnType<typeof createServiceRoleClient>

export type SweepFile = {
  source: 'supabase' | 'cloudinary'
  /** Supabase: bucket name. Cloudinary: "image" | "video". */
  group: string
  /** Supabase: object path. Cloudinary: public_id. */
  id: string
  bytes: number
  createdAt: string
  url: string
}

export type SweepReport = {
  dryRun: boolean
  status: 'ok' | 'aborted' | 'error'
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

// ── References ──────────────────────────────────────────────────────

type ReferenceIndex = { supabase: Set<string>; cloudinary: Set<string>; total: number }

function safeDecode(s: string) {
  try {
    return decodeURIComponent(s)
  } catch {
    return s
  }
}

/** Every link stored in the database, reduced to file keys. */
async function collectReferences(admin: Admin): Promise<ReferenceIndex> {
  const { data, error } = await admin.rpc('media_referenced_urls' as never)
  if (error) {
    if (/media_referenced_urls|function/i.test(error.message)) {
      throw new Error('Run data/wishdrop-media-sweep.sql in Supabase first (media_referenced_urls is missing).')
    }
    throw new Error(`Couldn't read media links: ${error.message}`)
  }
  const urls = (data as unknown as string[] | null) ?? []
  const supabase = new Set<string>()
  const cloudinary = new Set<string>()

  for (const raw of urls) {
    const clean = raw.split(/[?#]/)[0]

    // …/storage/v1/object/public/<bucket>/<path>
    const sb = clean.match(/\/storage\/v1\/(?:object|render\/image)\/public\/([^/]+)\/(.+)$/)
    if (sb) {
      supabase.add(`${sb[1]}/${safeDecode(sb[2])}`)
      continue
    }

    // res.cloudinary.com/<cloud>/<image|video>/upload/<transforms…>/v123/<public_id>.<ext>
    // Rather than guessing which segments are transformations, add every
    // tail of the path as a possible public_id. A real file matches one
    // of them exactly; a transformation segment never forms a full id.
    const cl = clean.match(/res\.cloudinary\.com\/[^/]+\/(image|video)\/upload\/(.+)$/)
    if (cl) {
      const type = cl[1]
      const parts = cl[2].split('/').map(safeDecode).filter(Boolean)
      if (!parts.length) continue
      const last = parts.length - 1
      const withoutExt = parts[last].replace(/\.[a-z0-9]{2,5}$/i, '')
      for (let i = 0; i <= last; i++) {
        const head = parts.slice(i, last)
        cloudinary.add(`${type}:${[...head, withoutExt].join('/')}`)
        cloudinary.add(`${type}:${[...head, parts[last]].join('/')}`)
      }
    }
  }

  return { supabase, cloudinary, total: urls.length }
}

// ── Listing files ───────────────────────────────────────────────────

async function listSupabaseFiles(admin: Admin): Promise<SweepFile[]> {
  const { data, error } = await admin.rpc('media_storage_objects' as never, { bucket_ids: [...SWEEP_BUCKETS] } as never)
  if (error) throw new Error(`Couldn't list Storage files: ${error.message}`)
  const rows = (data as unknown as { bucket: string; name: string; created_at: string; size: number }[] | null) ?? []
  return rows.map((r) => ({
    source: 'supabase' as const,
    group: r.bucket,
    id: r.name,
    bytes: Number(r.size) || 0,
    createdAt: r.created_at,
    url: admin.storage.from(r.bucket).getPublicUrl(r.name).data.publicUrl,
  }))
}

type CloudinaryResource = {
  public_id: string
  resource_type: string
  bytes?: number
  created_at: string
  secure_url: string
}

async function cloudinaryFetch(path: string, init?: RequestInit) {
  const cfg = cloudinaryConfig()!
  const auth = Buffer.from(`${cfg.apiKey}:${cfg.apiSecret}`).toString('base64')
  const res = await fetch(`https://api.cloudinary.com/v1_1/${cfg.cloudName}${path}`, {
    ...init,
    headers: { Authorization: `Basic ${auth}`, ...(init?.headers ?? {}) },
    cache: 'no-store',
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body?.error?.message ?? `Cloudinary answered ${res.status}`)
  return body
}

async function listCloudinaryFiles(errors: string[]): Promise<SweepFile[]> {
  const cfg = cloudinaryConfig()
  if (!cfg) return []
  const found = new Map<string, CloudinaryResource>()

  // Fixed-folder accounts: the folder is part of the public_id.
  for (const type of ['image', 'video'] as const) {
    let cursor: string | undefined
    let pages = 0
    do {
      const qs = new URLSearchParams({ prefix: `${cfg.folder}/`, max_results: '500' })
      if (cursor) qs.set('next_cursor', cursor)
      const body = await cloudinaryFetch(`/resources/${type}/upload?${qs}`)
      for (const r of (body.resources ?? []) as CloudinaryResource[]) found.set(`${type}:${r.public_id}`, { ...r, resource_type: type })
      cursor = body.next_cursor
    } while (cursor && ++pages < 40)
  }

  // Dynamic-folder accounts: the folder may NOT be in the public_id, so
  // also search by the folder the file sits in.
  try {
    let cursor: string | undefined
    let pages = 0
    do {
      const body = await cloudinaryFetch('/resources/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          expression: `asset_folder="${cfg.folder}" OR asset_folder:${cfg.folder}/*`,
          max_results: 500,
          ...(cursor ? { next_cursor: cursor } : {}),
        }),
      })
      for (const r of (body.resources ?? []) as CloudinaryResource[]) {
        if (r.resource_type !== 'image' && r.resource_type !== 'video') continue
        found.set(`${r.resource_type}:${r.public_id}`, r)
      }
      cursor = body.next_cursor
    } while (cursor && ++pages < 40)
  } catch (e) {
    // Fine on fixed-folder accounts, where the listing above found everything.
    errors.push(`Cloudinary folder search skipped: ${(e as Error).message}`)
  }

  return [...found.values()].map((r) => ({
    source: 'cloudinary' as const,
    group: r.resource_type,
    id: r.public_id,
    bytes: r.bytes ?? 0,
    createdAt: r.created_at,
    url: r.secure_url,
  }))
}

// ── Deleting ────────────────────────────────────────────────────────

function chunks<T>(list: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size))
  return out
}

async function deleteSupabase(admin: Admin, files: SweepFile[], errors: string[]) {
  const deleted: SweepFile[] = []
  const byBucket = new Map<string, SweepFile[]>()
  for (const f of files) byBucket.set(f.group, [...(byBucket.get(f.group) ?? []), f])
  for (const [bucket, list] of byBucket) {
    for (const part of chunks(list, 100)) {
      const { data, error } = await admin.storage.from(bucket).remove(part.map((f) => f.id))
      if (error) {
        errors.push(`Storage ${bucket}: ${error.message}`)
        continue
      }
      const gone = new Set((data ?? []).map((o) => o.name))
      deleted.push(...part.filter((f) => gone.has(f.id)))
    }
  }
  return deleted
}

async function deleteCloudinary(files: SweepFile[], errors: string[]) {
  const deleted: SweepFile[] = []
  for (const type of ['image', 'video'] as const) {
    for (const part of chunks(files.filter((f) => f.group === type), 100)) {
      const qs = new URLSearchParams({ invalidate: 'true' })
      for (const f of part) qs.append('public_ids[]', f.id)
      try {
        const body = await cloudinaryFetch(`/resources/${type}/upload?${qs}`, { method: 'DELETE' })
        const result = (body.deleted ?? {}) as Record<string, string>
        deleted.push(...part.filter((f) => result[f.id] === 'deleted' || result[f.id] === 'not_found'))
      } catch (e) {
        errors.push(`Cloudinary ${type}: ${(e as Error).message}`)
      }
    }
  }
  return deleted
}

// ── The sweep ───────────────────────────────────────────────────────

export type SweepOptions = { dryRun?: boolean; force?: boolean; trigger?: 'schedule' | 'manual' }

export async function runMediaSweep({ dryRun = false, force = false, trigger = 'schedule' }: SweepOptions = {}): Promise<SweepReport> {
  const admin = createServiceRoleClient()
  const errors: string[] = []
  const report: SweepReport = {
    dryRun,
    status: 'ok',
    message: '',
    references: 0,
    scanned: { supabase: 0, cloudinary: 0 },
    inUse: 0,
    tooNew: 0,
    orphans: 0,
    orphanBytes: 0,
    deleted: 0,
    bytesFreed: 0,
    failed: 0,
    cloudinaryConfigured: Boolean(cloudinaryConfig()),
    sample: [],
    errors,
  }

  try {
    const refs = await collectReferences(admin)
    report.references = refs.total

    const [sbFiles, clFiles] = await Promise.all([listSupabaseFiles(admin), listCloudinaryFiles(errors)])
    report.scanned = { supabase: sbFiles.length, cloudinary: clFiles.length }

    const cutoff = Date.now() - SWEEP_GRACE_HOURS * 3600_000
    const orphans: SweepFile[] = []
    for (const f of [...sbFiles, ...clFiles]) {
      const used = f.source === 'supabase' ? refs.supabase.has(`${f.group}/${f.id}`) : refs.cloudinary.has(`${f.group}:${f.id}`)
      if (used) {
        report.inUse++
        continue
      }
      const created = Date.parse(f.createdAt)
      if (!Number.isFinite(created) || created > cutoff) {
        report.tooNew++
        continue
      }
      orphans.push(f)
    }
    orphans.sort((a, b) => b.bytes - a.bytes)
    report.orphans = orphans.length
    report.orphanBytes = orphans.reduce((n, f) => n + f.bytes, 0)
    report.sample = orphans.slice(0, SAMPLE_SIZE)

    const total = sbFiles.length + clFiles.length
    if (refs.total === 0 && total > 0) {
      report.status = 'aborted'
      report.message = 'No media links were found in the database, so nothing was deleted. This usually means the check itself failed.'
    } else if (!force && total >= ABORT_MIN_FILES && orphans.length / total > ABORT_RATIO) {
      report.status = 'aborted'
      report.message = `${orphans.length} of ${total} files look unused — more than half. Nothing was deleted. A Super Admin can review the list and confirm on Media cleanup.`
    } else if (!orphans.length) {
      report.message = 'No unused files. Everything uploaded is still in use.'
    } else if (dryRun) {
      report.message = `${orphans.length} unused ${orphans.length === 1 ? 'file' : 'files'} found. Nothing deleted yet.`
    } else {
      const removed = [
        ...(await deleteSupabase(admin, orphans.filter((f) => f.source === 'supabase'), errors)),
        ...(await deleteCloudinary(orphans.filter((f) => f.source === 'cloudinary'), errors)),
      ]
      report.deleted = removed.length
      report.bytesFreed = removed.reduce((n, f) => n + f.bytes, 0)
      report.failed = orphans.length - removed.length
      report.message = `Deleted ${removed.length} unused ${removed.length === 1 ? 'file' : 'files'}${report.failed ? `, ${report.failed} couldn't be deleted and will be tried again next run` : ''}.`
    }
  } catch (e) {
    report.status = 'error'
    report.message = (e as Error).message
  }

  // History is best-effort: a missing table must not fail the sweep.
  // Dry runs from the page aren't recorded; they're only a preview.
  if (!dryRun || trigger === 'schedule') {
    await admin
      .from('media_sweep_runs' as never)
      .insert({
        trigger,
        dry_run: dryRun,
        status: report.status,
        scanned: report.scanned.supabase + report.scanned.cloudinary,
        orphans: report.orphans,
        deleted: report.deleted,
        bytes_freed: report.bytesFreed,
        message: report.message,
        report: { ...report, sample: report.sample.slice(0, 8).map((f) => `${f.source}:${f.group}/${f.id}`) },
      } as never)
      .then(({ error }) => {
        if (error) console.error('[media-sweep] history not saved:', error.message)
      })
  }

  return report
}

export type SweepRun = {
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

export async function recentSweepRuns(limit = 10): Promise<SweepRun[]> {
  const { data, error } = await createServiceRoleClient()
    .from('media_sweep_runs' as never)
    .select('id, ran_at, trigger, dry_run, status, scanned, orphans, deleted, bytes_freed, message')
    .order('ran_at', { ascending: false })
    .limit(limit)
  if (error) return []
  return (data as unknown as SweepRun[]) ?? []
}
