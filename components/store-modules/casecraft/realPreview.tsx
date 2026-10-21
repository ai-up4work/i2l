'use client'

// components/store-modules/casecraft/realPreview.tsx
//
// "Real look": the shopper's design on an actual photo of the case, with its
// real camera, edges and lighting. Layers come from
// scripts/casecraft-real-mockups.py (public/phoneCases/real/):
//   <model>.jpg        photo of the blank white case (base)
//   <model>.mask.png   the printable back (camera and rim left out)
//   <model>.shade.png  the back's lighting, multiplied over the design
//   index.json         each photo's case outline box
// The design (compose.ts renderDesignCanvas — exactly the print file) is
// lined up by matching the template's case outline to the photo's.

import { useEffect, useRef, useState } from 'react'
import type { TemplateId } from '@/lib/store-modules/casecraft/catalog'
import { renderDesignCanvas, type Placement } from './compose'

type RealEntry = { file: string; w: number; h: number; box: [number, number, number, number] }

const BASE = '/phoneCases/real'
let indexPromise: Promise<Record<string, RealEntry>> | null = null
function loadIndex() {
  indexPromise ??= fetch(`${BASE}/index.json`)
    .then((r) => (r.ok ? r.json() : {}))
    .catch(() => ({}))
  return indexPromise
}

/** The real-photo entry for a catalog model label, or null. */
export function useRealPhoto(label: string | null | undefined): RealEntry | null {
  const [entry, setEntry] = useState<RealEntry | null>(null)
  useEffect(() => {
    let alive = true
    setEntry(null)
    if (!label) return
    loadIndex().then((idx) => alive && setEntry(idx[label.toLowerCase()] ?? null))
    return () => {
      alive = false
    }
  }, [label])
  return entry
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(`Could not load ${src}`))
    img.src = src
  })
}

/** The template's case outline, as fractions of the 9:16 print canvas. */
const outlineCache = new Map<string, Promise<[number, number, number, number]>>()
function templateOutline(maskSrc: string) {
  let p = outlineCache.get(maskSrc)
  if (!p) {
    p = loadImage(maskSrc).then((img) => {
      const c = document.createElement('canvas')
      c.width = img.naturalWidth
      c.height = img.naturalHeight
      const ctx = c.getContext('2d', { willReadFrequently: true })!
      ctx.drawImage(img, 0, 0)
      const { data, width, height } = ctx.getImageData(0, 0, c.width, c.height)
      let x0 = width, y0 = height, x1 = 0, y1 = 0
      for (let y = 0; y < height; y++)
        for (let x = 0; x < width; x++)
          if (data[(y * width + x) * 4 + 3] > 128) {
            if (x < x0) x0 = x
            if (x > x1) x1 = x
            if (y < y0) y0 = y
            if (y > y1) y1 = y
          }
      // The mask is drawn "contain" in the 9:16 canvas (as in CasePreview).
      const s = Math.min(9 / width, 16 / height)
      const ox = (9 - width * s) / 2
      const oy = (16 - height * s) / 2
      return [(ox + x0 * s) / 9, (oy + y0 * s) / 16, (ox + (x1 + 1) * s) / 9, (oy + (y1 + 1) * s) / 16] as [number, number, number, number]
    })
    outlineCache.set(maskSrc, p)
  }
  return p
}

export function RealPhotoPreview({
  entry,
  maskSrc,
  photoUrl,
  placement,
  template,
  className = '',
}: {
  entry: RealEntry
  /** The template's clean mask (catalog.ts cleanTemplateSrc) — for lining up. */
  maskSrc: string
  photoUrl: string
  placement: Placement
  template: TemplateId
  className?: string
}) {
  const ref = useRef<HTMLCanvasElement>(null)
  const [busy, setBusy] = useState(true)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let alive = true
    setBusy(true)
    // Wait for edits to settle (dragging, sliders) before redrawing.
    const t = window.setTimeout(async () => {
      try {
        const base = `${BASE}/${encodeURIComponent(entry.file)}`
        const [photo, mask, shade, outline, design] = await Promise.all([
          loadImage(`${base}.jpg`),
          loadImage(`${base}.mask.png`),
          loadImage(`${base}.shade.png`),
          templateOutline(maskSrc),
          renderDesignCanvas({ photoUrl, placement, template, width: 720 }),
        ])
        if (!alive || !ref.current) return
        const W = entry.w
        const H = entry.h
        // Print canvas → photo: match the two case outlines.
        const [tx0, ty0, tx1, ty1] = outline
        const [px0, py0, px1, py1] = entry.box
        const sx = (px1 - px0) / (tx1 - tx0)
        const sy = (py1 - py0) / (ty1 - ty0)

        const layer = document.createElement('canvas')
        layer.width = W
        layer.height = H
        const lc = layer.getContext('2d')!
        lc.imageSmoothingQuality = 'high'
        lc.drawImage(design, px0 - tx0 * sx, py0 - ty0 * sy, sx, sy)
        // Real lighting, then keep only the printable back.
        lc.globalCompositeOperation = 'multiply'
        lc.drawImage(shade, 0, 0, W, H)
        // Multiply fills see-through parts too: cut back to the design's own shape.
        lc.globalCompositeOperation = 'destination-in'
        lc.drawImage(design, px0 - tx0 * sx, py0 - ty0 * sy, sx, sy)
        // The mask is greyscale: turn it into alpha first.
        const m = document.createElement('canvas')
        m.width = W
        m.height = H
        const mc = m.getContext('2d', { willReadFrequently: true })!
        mc.drawImage(mask, 0, 0, W, H)
        const md = mc.getImageData(0, 0, W, H)
        for (let i = 0; i < md.data.length; i += 4) {
          md.data[i + 3] = md.data[i]
        }
        mc.putImageData(md, 0, 0)
        lc.drawImage(m, 0, 0)

        const out = ref.current
        out.width = W
        out.height = H
        const ctx = out.getContext('2d')!
        ctx.drawImage(photo, 0, 0, W, H)
        ctx.drawImage(layer, 0, 0)
        setFailed(false)
      } catch {
        if (alive) setFailed(true)
      } finally {
        if (alive) setBusy(false)
      }
    }, 120)
    return () => {
      alive = false
      window.clearTimeout(t)
    }
  }, [entry, maskSrc, photoUrl, placement, template])

  return (
    <div className={`relative w-full overflow-hidden rounded-2xl bg-white ring-1 ring-ink/10 ${className}`} style={{ aspectRatio: `${entry.w} / ${entry.h}` }}>
      <canvas ref={ref} className="h-full w-full" aria-label="Your design on the real case" role="img" />
      {busy && <span className="absolute right-2 top-2 h-2 w-2 animate-pulse rounded-full bg-teal" aria-hidden />}
      {failed && (
        <p className="absolute inset-0 grid place-items-center p-6 text-center font-body text-xs text-ink/50">The real-photo preview isn&rsquo;t available for this phone.</p>
      )}
    </div>
  )
}
