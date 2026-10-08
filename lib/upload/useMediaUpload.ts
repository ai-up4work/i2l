// lib/upload/useMediaUpload.ts
'use client'

// Uploads ONE photo or video straight from the browser to Cloudinary.
// 1) asks /api/media/sign for a signature, 2) posts the file to Cloudinary
// with progress, 3) returns the file's https link.
//
// Staff pass `sellerId` (whose folder to use); a logged-in seller doesn't —
// the server always uses their own folder.

export type MediaKind = 'image' | 'video'

// Mirrors MEDIA_LIMITS in lib/cloudinary.ts (that file imports node's
// crypto, so it can't be imported into the browser).
export const CLIENT_MEDIA_LIMITS = {
  image: { maxBytes: 10 * 1024 * 1024, maxCount: 10, label: 'Photos', accept: 'image/jpeg,image/png,image/webp,image/heic,image/heif,image/gif' },
  video: { maxBytes: 100 * 1024 * 1024, maxCount: 3, label: 'Videos', accept: 'video/mp4,video/quicktime,video/webm,video/x-m4v' },
} as const

export function kindOfFile(file: File): MediaKind | null {
  if (file.type.startsWith('image/')) return 'image'
  if (file.type.startsWith('video/')) return 'video'
  // Some phones hand over files with an empty type — fall back to the name.
  if (/\.(jpe?g|png|webp|heic|heif|gif)$/i.test(file.name)) return 'image'
  if (/\.(mp4|mov|webm|m4v)$/i.test(file.name)) return 'video'
  return null
}

export function formatBytes(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${Math.round(bytes / (1024 * 1024))} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`
}

type Signed = { uploadUrl: string; apiKey: string; timestamp: number; folder: string; signature: string; maxBytes: number }

export async function uploadMedia(
  file: File,
  kind: MediaKind,
  opts: { sellerId?: string; onProgress?: (percent: number) => void; signal?: AbortSignal } = {},
): Promise<string> {
  const limit = CLIENT_MEDIA_LIMITS[kind]
  if (file.size > limit.maxBytes) {
    throw new Error(`${kind === 'video' ? 'Video' : 'Photo'} is too large (${formatBytes(file.size)}). The limit is ${formatBytes(limit.maxBytes)}.`)
  }

  const signRes = await fetch('/api/media/sign', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ kind, sellerId: opts.sellerId }),
  })
  const signed = (await signRes.json().catch(() => ({}))) as Partial<Signed> & { error?: string }
  if (!signRes.ok || !signed.uploadUrl) throw new Error(signed.error ?? 'Could not start the upload.')

  const form = new FormData()
  form.append('file', file)
  form.append('api_key', signed.apiKey as string)
  form.append('timestamp', String(signed.timestamp))
  form.append('folder', signed.folder as string)
  form.append('signature', signed.signature as string)

  // XMLHttpRequest rather than fetch: fetch can't report upload progress,
  // and a 60 MB video with no progress bar looks frozen.
  return new Promise<string>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', signed.uploadUrl as string)
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) opts.onProgress?.(Math.round((e.loaded / e.total) * 100))
    }
    xhr.onload = () => {
      let body: { secure_url?: string; error?: { message?: string } } = {}
      try {
        body = JSON.parse(xhr.responseText)
      } catch {
        /* handled below */
      }
      if (xhr.status >= 200 && xhr.status < 300 && body.secure_url) resolve(body.secure_url)
      else reject(new Error(body.error?.message ?? 'Upload failed. Please try again.'))
    }
    xhr.onerror = () => reject(new Error('Upload failed. Check your connection and try again.'))
    xhr.onabort = () => reject(new Error('Upload cancelled.'))
    opts.signal?.addEventListener('abort', () => xhr.abort())
    xhr.send(form)
  })
}
