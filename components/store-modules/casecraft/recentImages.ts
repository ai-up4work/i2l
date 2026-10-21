// components/store-modules/casecraft/recentImages.ts
//
// Photos and logos the shopper has used before, kept in THIS browser's
// IndexedDB (never uploaded or stored on our side) so they can be reused in
// one tap — handy for printing the same picture for several phones.
// Every call is best-effort: private windows, blocked storage or old
// browsers just get an empty list and nothing breaks.

export type RecentImage = { id: string; name: string; type: string; size: number; lastModified: number; addedAt: number; blob: Blob }

const DB = 'casecraft'
const STORE = 'recent-images'
const LIMIT = 15

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('No IndexedDB'))
    const req = indexedDB.open(DB, 1)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' }).createIndex('addedAt', 'addedAt')
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  return open().then(
    (db) =>
      new Promise<T | undefined>((resolve, reject) => {
        const tx = db.transaction(STORE, mode)
        const req = fn(tx.objectStore(STORE))
        tx.oncomplete = () => {
          db.close()
          resolve(req ? req.result : undefined)
        }
        tx.onerror = () => {
          db.close()
          reject(tx.error)
        }
      }),
  )
}

/** Newest first. */
export async function listRecentImages(): Promise<RecentImage[]> {
  try {
    const all = ((await run<RecentImage[]>('readonly', (s) => s.getAll())) ?? []) as RecentImage[]
    return all.sort((a, b) => b.addedAt - a.addedAt)
  } catch {
    return []
  }
}

/** Saves (or bumps to the front) an image. A queue of the newest LIMIT:
 *  adding the 16th drops the oldest. */
export async function rememberImage(file: File | Blob, name = (file as File).name ?? 'photo'): Promise<void> {
  try {
    const lastModified = (file as File).lastModified ?? 0
    const id = `${name}|${file.size}|${lastModified}`
    const item: RecentImage = { id, name, type: file.type, size: file.size, lastModified, addedAt: Date.now(), blob: file }
    await run('readwrite', (s) => s.put(item))
    const all = await listRecentImages()
    const extra = all.slice(LIMIT)
    if (extra.length) await run('readwrite', (s) => extra.forEach((x) => s.delete(x.id)))
  } catch {
    /* storage unavailable: just don't remember */
  }
}

export async function forgetImage(id: string): Promise<void> {
  try {
    await run('readwrite', (s) => s.delete(id))
  } catch {
    /* ignore */
  }
}

/** A File again, so it goes through the same path as a fresh upload. */
export function recentToFile(r: RecentImage): File {
  return new File([r.blob], r.name, { type: r.type || r.blob.type, lastModified: r.lastModified ?? 0 })
}
