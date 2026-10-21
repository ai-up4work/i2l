// components/store-modules/casecraft/compose.ts
//
// Builds the files for a custom-print order in the browser:
//   - print   the photo as the shopper placed it, no template, 1440×2560
//             (what gets printed) — a PNG with see-through edges when the
//             background is 'transparent', otherwise a JPEG;
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
  /** Turn, in degrees (clockwise). The photo still covers the print area
   *  at zoom 1 whatever the angle. */
  rotate?: number
  /** One line of text printed over the photo. */
  text?: CaseText | null
  /** What fills any part of the print area the photo doesn't reach
   *  (zoomed out, or dragged off an edge). Transparent (nothing printed)
   *  by default — blur / white / black only when the shopper picks them. */
  bg?: PlacementBackground
}

export type PlacementBackground = 'transparent' | 'blur' | 'white' | 'black'

export const PLACEMENT_BACKGROUNDS: { id: PlacementBackground; label: string }[] = [
  { id: 'transparent', label: 'Transparent (nothing printed)' },
  { id: 'blur', label: 'Blurred photo' },
  { id: 'white', label: 'White' },
  { id: 'black', label: 'Black' },
]

export type CaseTextFont = 'classic' | 'modern' | 'simple'

export type CaseText = {
  value: string
  font: CaseTextFont
  color: string
  /** Letter height as a fraction of the print area's width. */
  size: number
  /** Centre of the text, as a fraction of the print area (0–1). */
  x: number
  y: number
  /** Soft shadow behind the letters, so they read on busy photos. */
  shadow: boolean
}

export const TEXT_MAX_LENGTH = 40
export const TEXT_MIN_SIZE = 0.04
export const TEXT_MAX_SIZE = 0.2

export const TEXT_FONTS: { id: CaseTextFont; label: string; cssVar: string; fallback: string; weight: number; italic: boolean }[] = [
  { id: 'classic', label: 'Classic', cssVar: '--font-serif-display', fallback: 'Georgia, serif', weight: 600, italic: true },
  { id: 'modern', label: 'Modern', cssVar: '--font-sans-body', fallback: 'Arial, sans-serif', weight: 700, italic: false },
  { id: 'simple', label: 'Simple', cssVar: '', fallback: 'Arial, Helvetica, sans-serif', weight: 400, italic: false },
]

export const TEXT_COLORS: { id: string; label: string }[] = [
  { id: '#ffffff', label: 'White' },
  { id: '#111111', label: 'Black' },
  { id: '#f0a93a', label: 'Gold' },
  { id: '#e88aa0', label: 'Pink' },
  { id: '#08274f', label: 'Navy' },
]

export const DEFAULT_TEXT: CaseText = { value: '', font: 'classic', color: '#ffffff', size: 0.1, x: 0.5, y: 0.85, shadow: true }

export function textFont(id: CaseTextFont) {
  return TEXT_FONTS.find((f) => f.id === id) ?? TEXT_FONTS[0]
}

/** CSS font-family for the on-screen preview. */
export function textFontFamily(id: CaseTextFont): string {
  const f = textFont(id)
  return f.cssVar ? `var(${f.cssVar}), ${f.fallback}` : f.fallback
}

/** The text to draw, or null when there's none. */
export function activeText(p: Placement): CaseText | null {
  return p.text && p.text.value.trim() ? p.text : null
}

/**
 * How big the photo is drawn, in print-area units: the scale that makes a
 * photo of pw × ph (any units) — turned by `rotate` degrees — just cover an
 * area of aw × ah, times the zoom. Shared by the preview and the print.
 */
export function coverScale(pw: number, ph: number, aw: number, ah: number, zoom: number, rotate = 0): number {
  const rad = (rotate * Math.PI) / 180
  const c = Math.abs(Math.cos(rad))
  const s = Math.abs(Math.sin(rad))
  const bw = pw * c + ph * s
  const bh = pw * s + ph * c
  return Math.max(aw / bw, ah / bh) * zoom
}

/** Smallest zoom: small enough for a logo or badge in the middle of the case. */
export const MIN_ZOOM = 0.2
export const MAX_ZOOM = 3

export const DEFAULT_PLACEMENT: Placement = { zoom: 1, x: 0, y: 0, rotate: 0, bg: 'transparent', text: null }

/** The background in effect (older saved placements have none → transparent). */
export function placementBg(p: Placement): PlacementBackground {
  return p.bg ?? 'transparent'
}

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
  /** Leave unfilled pixels see-through (print file, transparent background). */
  keepAlpha?: boolean
}): Promise<HTMLCanvasElement> {
  const W = opts.width
  const H = Math.round((W * 16) / 9)
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')!
  if (!opts.keepAlpha) {
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, W, H)
  }

  const photo = await loadImage(opts.photoUrl)
  const a = printArea(opts.template)
  const rx = a.left * W
  const ry = a.top * H
  const rw = a.width * W
  const rh = a.height * H
  const rotate = opts.placement.rotate ?? 0
  const scale = coverScale(photo.naturalWidth, photo.naturalHeight, rw, rh, opts.placement.zoom, rotate)
  ctx.save()
  ctx.beginPath()
  ctx.rect(rx, ry, rw, rh)
  ctx.clip()

  // Background for any part of the print area the photo doesn't reach.
  const bg = placementBg(opts.placement)
  if (bg === 'transparent') {
    // Nothing: the edges stay unprinted.
  } else if (bg === 'blur') {
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
  ctx.rotate((rotate * Math.PI) / 180)
  ctx.scale(scale, scale)
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(photo, -photo.naturalWidth / 2, -photo.naturalHeight / 2)
  ctx.restore()

  const text = activeText(opts.placement)
  if (text) await drawText(ctx, text, rx, ry, rw, rh)

  if (opts.overlaySrc) {
    const overlay = await loadImage(opts.overlaySrc)
    const s = Math.min(W / overlay.naturalWidth, H / overlay.naturalHeight)
    const ow = overlay.naturalWidth * s
    const oh = overlay.naturalHeight * s
    ctx.drawImage(overlay, (W - ow) / 2, (H - oh) / 2, ow, oh)
  }
  return canvas
}

async function drawText(ctx: CanvasRenderingContext2D, text: CaseText, rx: number, ry: number, rw: number, rh: number) {
  const f = textFont(text.font)
  // next/font gives the fonts generated names; read them from the page.
  const loaded = f.cssVar ? getComputedStyle(document.body).getPropertyValue(f.cssVar).trim() : ''
  const family = loaded ? `${loaded}, ${f.fallback}` : f.fallback
  const px = Math.round(text.size * rw)
  const font = `${f.italic ? 'italic ' : ''}${f.weight} ${px}px ${family}`
  try {
    await document.fonts.load(font, text.value)
  } catch {
    /* draw with whatever is available */
  }
  ctx.save()
  ctx.beginPath()
  ctx.rect(rx, ry, rw, rh)
  ctx.clip()
  ctx.font = font
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = text.color
  if (text.shadow) {
    ctx.shadowColor = 'rgba(0,0,0,0.45)'
    ctx.shadowBlur = px * 0.18
    ctx.shadowOffsetY = px * 0.04
  }
  ctx.fillText(text.value, rx + text.x * rw, ry + text.y * rh)
  ctx.restore()
}

export async function renderPrintFiles(opts: { photoUrl: string; placement: Placement; template: TemplateId; overlaySrc: string }) {
  const transparent = placementBg(opts.placement) === 'transparent'
  const [print, preview] = await Promise.all([
    render({ ...opts, overlaySrc: undefined, width: 1440, keepAlpha: transparent }).then((c) =>
      transparent ? toBlob(c, 'image/png', 1) : toBlob(c, 'image/jpeg', 0.95),
    ),
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
