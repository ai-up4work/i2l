'use client'

// components/store-modules/casecraft/realPreview.tsx
//
// "Real look": the shopper's design on an actual photo of the case, with its
// real camera, edges and lighting. Layers come from
// scripts/casecraft-real-mockups.py (public/phoneCases/real/):
//   photos/<phone>.jpg        photo of the blank white case (base)
//   photos/<phone>.shade.png  the back's lighting, multiplied over the design
//   masks/<template>.png      the template's printable area, fitted onto the
//                             photo (camera cut out) — smooth, exact edges
//   index.json                per template: its photo and the fit
// The design (compose.ts renderDesignCanvas — exactly the print file) is
// drawn with the same fit, so print area and photo line up.

import { useEffect, useRef, useState } from 'react'
import type { TemplateId } from '@/lib/store-modules/casecraft/catalog'
import { renderDesignCanvas, type Placement } from './compose'

type RealEntry = {
  /** Photo folder name (photos/<photo>.jpg, .shade.png). */
  photo: string
  w: number
  h: number
  /** Template size, and template px -> photo px: x' = ax*x + bx, y' = ay*y + by. */
  tw: number
  th: number
  ax: number
  bx: number
  ay: number
  by: number
}

const BASE = '/phoneCases/real'
let indexPromise: Promise<Record<string, RealEntry>> | null = null
function loadIndex() {
  indexPromise ??= fetch(`${BASE}/index.json`)
    .then((r) => (r.ok ? r.json() : {}))
    .catch(() => ({}))
  return indexPromise
}

/** The real-photo fit for a template file (catalog CaseModel.file), or null. */
export function useRealPhoto(templateFile: string | null | undefined): (RealEntry & { file: string }) | null {
  const [entry, setEntry] = useState<(RealEntry & { file: string }) | null>(null)
  useEffect(() => {
    let alive = true
    setEntry(null)
    if (!templateFile) return
    loadIndex().then((idx) => {
      const e = idx[templateFile]
      if (alive) setEntry(e ? { ...e, file: templateFile } : null)
    })
    return () => {
      alive = false
    }
  }, [templateFile])
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

export function RealPhotoPreview({
  entry,
  photoUrl,
  placement,
  template,
  className = '',
}: {
  entry: RealEntry & { file: string }
  photoUrl: string
  placement: Placement
  template: TemplateId
  className?: string
}) {
  const ref = useRef<HTMLCanvasElement>(null)
  const [busy, setBusy] = useState(true)
  const [failed, setFailed] = useState(false)
  const [aspect, setAspect] = useState<number | null>(null)

  useEffect(() => {
    let alive = true
    setBusy(true)
    // Wait for edits to settle (dragging, sliders) before redrawing.
    const t = window.setTimeout(async () => {
      try {
        const photoBase = `${BASE}/photos/${encodeURIComponent(entry.photo)}`
        const [photo, mask, shade, design] = await Promise.all([
          loadImage(`${photoBase}.jpg`),
          loadImage(`${BASE}/masks/${encodeURIComponent(entry.file)}`),
          loadImage(`${photoBase}.shade.png`),
          renderDesignCanvas({ photoUrl, placement, template, width: 720 }),
        ])
        if (!alive || !ref.current) return
        const W = entry.w
        const H = entry.h
        // The design canvas is 9:16 with the template drawn "contain" (as in
        // the print file). Canvas edges -> template px -> photo px.
        const s = Math.min(9 / entry.tw, 16 / entry.th)
        const ox = (9 - entry.tw * s) / 2
        const oy = (16 - entry.th * s) / 2
        const u0 = -ox / s
        const u1 = (9 - ox) / s
        const v0 = -oy / s
        const v1 = (16 - oy) / s
        const dx = entry.ax * u0 + entry.bx
        const dy = entry.ay * v0 + entry.by
        const dw = entry.ax * (u1 - u0)
        const dh = entry.ay * (v1 - v0)

        const layer = document.createElement('canvas')
        layer.width = W
        layer.height = H
        const lc = layer.getContext('2d')!
        lc.imageSmoothingQuality = 'high'
        lc.drawImage(design, dx, dy, dw, dh)
        // Real lighting, then keep only the printable back.
        lc.globalCompositeOperation = 'multiply'
        lc.drawImage(shade, 0, 0, W, H)
        // Multiply fills see-through parts too: cut back to the design's own shape.
        lc.globalCompositeOperation = 'destination-in'
        lc.drawImage(design, dx, dy, dw, dh)
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

        // Show just the case (the template's extent, plus a little air).
        const pad = 0.04 * entry.ax * entry.tw
        const cx = Math.max(0, Math.floor(entry.bx - pad))
        const cy = Math.max(0, Math.floor(entry.by - pad))
        const cw = Math.min(W, Math.ceil(entry.ax * entry.tw + entry.bx + pad)) - cx
        const ch = Math.min(H, Math.ceil(entry.ay * entry.th + entry.by + pad)) - cy
        const full = document.createElement('canvas')
        full.width = W
        full.height = H
        const fc = full.getContext('2d')!
        fc.drawImage(photo, 0, 0, W, H)
        fc.drawImage(layer, 0, 0)
        const out = ref.current
        out.width = cw
        out.height = ch
        out.getContext('2d')!.drawImage(full, cx, cy, cw, ch, 0, 0, cw, ch)
        setAspect(cw / ch)
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
  }, [entry, photoUrl, placement, template])

  return (
    <div className={`relative w-full ${className}`} style={{ aspectRatio: aspect ? `${aspect}` : '9 / 16' }}>
      {/* The photo's white backdrop multiplies away into the stage behind it. */}
      <canvas ref={ref} className="h-full w-full mix-blend-multiply" aria-label="Your design on the real case" role="img" />
      {busy && <span className="absolute right-2 top-2 h-2 w-2 animate-pulse rounded-full bg-teal" aria-hidden />}
      {failed && (
        <p className="absolute inset-0 grid place-items-center p-6 text-center font-body text-xs text-ink/50">The real-photo preview isn&rsquo;t available for this phone.</p>
      )}
    </div>
  )
}
