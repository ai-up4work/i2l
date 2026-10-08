// lib/cloudinary.ts
//
// Cloudinary helpers shared by server and browser code. Nothing secret is
// in this file: the API secret is only ever read inside signUpload(),
// which is only called from app/api/media/sign/route.ts.
//
// HOW UPLOADS WORK
//   1. The browser asks /api/media/sign for a signature (seller or staff
//      login required; the server decides the folder).
//   2. The browser sends the file STRAIGHT to Cloudinary with that
//      signature. Files never pass through our server, so the ~4.5 MB
//      request limit on Vercel doesn't apply (videos are far bigger).
//   3. Cloudinary returns a link, which is saved on the product.
//
// ENV (see CLOUDINARY_SETUP.md)
//   CLOUDINARY_CLOUD_NAME   e.g. dxxxxxxx
//   CLOUDINARY_API_KEY
//   CLOUDINARY_API_SECRET   server only, never NEXT_PUBLIC_
//   CLOUDINARY_FOLDER       optional, defaults to "wishdrop"

import { createHash } from 'crypto'

export type MediaKind = 'image' | 'video'

export const MEDIA_LIMITS = {
  image: { maxBytes: 10 * 1024 * 1024, maxCount: 10, formats: ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif', 'gif'] },
  video: { maxBytes: 100 * 1024 * 1024, maxCount: 3, formats: ['mp4', 'mov', 'webm', 'm4v'] },
} as const

export function cloudinaryConfig() {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME
  const apiKey = process.env.CLOUDINARY_API_KEY
  const apiSecret = process.env.CLOUDINARY_API_SECRET
  if (!cloudName || !apiKey || !apiSecret) return null
  const folder = (process.env.CLOUDINARY_FOLDER || 'wishdrop').replace(/^\/+|\/+$/g, '')
  return { cloudName, apiKey, apiSecret, folder }
}

/** Cloudinary's signature: the params sorted by name, joined as
 *  key=value&key=value, with the API secret appended, SHA-1 hashed. */
export function signUpload(params: Record<string, string | number>, apiSecret: string): string {
  const toSign = Object.keys(params)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join('&')
  return createHash('sha1').update(toSign + apiSecret).digest('hex')
}

/** Folder-safe version of a store slug. */
export function folderSegment(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9-_]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'store'
}

/** True if `url` is a delivery link from OUR Cloudinary account. */
export function isOwnCloudinaryUrl(url: string, kind?: MediaKind): boolean {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME
  if (!cloudName) return false
  try {
    const u = new URL(url)
    if (u.protocol !== 'https:' || u.hostname !== 'res.cloudinary.com') return false
    const parts = u.pathname.split('/').filter(Boolean) // [cloud, image|video, upload, ...]
    if (parts[0] !== cloudName || parts[2] !== 'upload') return false
    return kind ? parts[1] === kind : parts[1] === 'image' || parts[1] === 'video'
  } catch {
    return false
  }
}
