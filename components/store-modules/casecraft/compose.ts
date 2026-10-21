// components/store-modules/casecraft/compose.ts
//
// Builds the files for a custom-print order in the browser:
//   - print   the photo as the shopper placed it, no template, 1440×2560
//             JPEG (what gets printed);
//   - preview the same with the phone template on top, small JPEG (what
//             the seller and shopper see in lists).
// Then uploads them, and the original photo, straight to Supabase Storage
// through a signed URL (app/api/casecraft/upload-url).
//
// Placement is stored as fractions of the print area, so the on-screen
// preview (CasePreview) and these files line up at any size.

import { createClient } from '@/lib/supabase/client'
import type { TemplateId } from '@/lib/store-modules/casecraft/catalog'

export type Placement = {
  /** 1 = photo just covers the print area; below 1 leaves edges uncovered. */
  zoom: number
  /** Offset of the photo centre, as a fraction of the print area. */
  x: number
  y: number
  /** What fills any part of the print area the photo doesn't reach
   *  (zoomed out, or dragged off an edge). Blurred photo by default. */
  bg?: PlacementBackground
}

export type PlacementBackground = 'blur' | 'white' | 'black'

export const PLACEMENT_BACKGROUNDS: { id: PlacementBackground; label: string }[] = [
  { id: 'blur', label: 'Blurred photo' },
  { id: 'white', label: 'White' },
  { id: 'black', label: 'Black' },
]

/** Smallest zoom: the photo at half the size that just covers the case. */
export const MIN_ZOOM = 0.5
export const MAX_ZOOM = 3

export const DEFAULT_PLACEMENT: Placement = { zoom: 1, x: 0, y: 0, bg: 'blur' }

/** The print area inside the case, as fractions of the full 9:16 canvas. */
export function printArea(template: TemplateId): { left: number; top: number; width: number; height: number } {
  if (template === 'centered') return { left: 0.12, top: 0.12, width: 0.76, height: 0.76 }
  if (template === 'top') return { left: 0, top: 0, width: 1, height: 0.5 }
  return { left: 0, top: 0, width: 1, height: 1 }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(`Could not load ${src}`))
    img.src = src
  })
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not make the image'))), type, quality))
}

async function render(opts: {
  photoUrl: string
  placement: Placement
  template: TemplateId
  width: number
  overlaySrc?: string
}): Promise<HTMLCanvasElement> {
  const W = opts.width
  const H = Math.round((W * 16) / 9)
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, W, H)

  const photo = await loadImage(opts.photoUrl)
  const a = printArea(opts.template)
  const rx = a.left * W
  const ry = a.top * H
  const rw = a.width * W
  const rh = a.height * H
  const scale = Math.max(rw / photo.naturalWidth, rh / photo.naturalHeight) * opts.placement.zoom
  ctx.save()
  ctx.beginPath()
  ctx.rect(rx, ry, rw, rh)
  ctx.clip()

  // Background for any part of the print area the photo doesn't reach.
  const bg = opts.placement.bg ?? 'blur'
  if (bg === 'blur') {
    // Blur by drawing the photo tiny, then stretching it back up — works in
    // every browser (canvas `filter` isn't supported everywhere).
    const tiny = document.createElement('canvas')
    tiny.width = 14
    tiny.height = Math.max(1, Math.round((14 * rh) / rw))
    const tctx = tiny.getContext('2d')!
    const cover = Math.max(tiny.width / photo.naturalWidth, tiny.height / photo.naturalHeight)
    tctx.drawImage(
      photo,
      (tiny.width - photo.naturalWidth * cover) / 2,
      (tiny.height - photo.naturalHeight * cover) / 2,
      photo.naturalWidth * cover,
      photo.naturalHeight * cover,
    )
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(tiny, rx, ry, rw, rh)
  } else {
    ctx.fillStyle = bg === 'black' ? '#000000' : '#ffffff'
    ctx.fillRect(rx, ry, rw, rh)
  }

  ctx.translate(rx + rw / 2 + opts.placement.x * rw, ry + rh / 2 + opts.placement.y * rh)
  ctx.scale(scale, scale)
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(photo, -photo.naturalWidth / 2, -photo.naturalHeight / 2)
  ctx.restore()

  if (opts.overlaySrc) {
    const overlay = await loadImage(opts.overlaySrc)
    const s = Math.min(W / overlay.naturalWidth, H / overlay.naturalHeight)
    const ow = overlay.naturalWidth * s
    const oh = overlay.naturalHeight * s
    ctx.drawImage(overlay, (W - ow) / 2, (H - oh) / 2, ow, oh)
  }
  return canvas
}

export async function renderPrintFiles(opts: { photoUrl: string; placement: Placement; template: TemplateId; overlaySrc: string }) {
  const [print, preview] = await Promise.all([
    render({ ...opts, overlaySrc: undefined, width: 1440 }).then((c) => toBlob(c, 'image/jpeg', 0.95)),
    render({ ...opts, width: 540 }).then((c) => toBlob(c, 'image/jpeg', 0.85)),
  ])
  return { print, preview }
}

/** The original photo, re-encoded only when it's an odd type or huge. */
export async function prepareOriginal(file: File): Promise<Blob> {
  const ok = ['image/jpeg', 'image/png', 'image/webp'].includes(file.type)
  if (ok && file.size <= 15 * 1024 * 1024) return file
  const url = URL.createObjectURL(file)
  try {
    const img = await loadImage(url)
    const s = Math.min(1, 4000 / Math.max(img.naturalWidth, img.naturalHeight))
    const c = document.createElement('canvas')
    c.width = Math.round(img.naturalWidth * s)
    c.height = Math.round(img.naturalHeight * s)
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height)
    return await toBlob(c, 'image/jpeg', 0.92)
  } finally {
    URL.revokeObjectURL(url)
  }
}

/** Uploads one file for this shopper and returns its public link. */
export async function uploadOrderFile(blob: Blob, file: 'photo' | 'print' | 'preview'): Promise<string> {
  const contentType = blob.type || 'image/jpeg'
  const res = await fetch('/api/casecraft/upload-url', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ file, contentType }),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.error ?? 'Could not upload your photo.')
  const { error } = await createClient().storage.from(body.bucket).uploadToSignedUrl(body.path, body.token, blob, { contentType })
  if (error) throw new Error(error.message)
  return body.publicUrl as string
}
