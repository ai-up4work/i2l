/**
 * components/dashboard/ItemImageStack.tsx
 *
 * Same external API as before (items / className / fitActive), now
 * implemented on top of the generic AccordionGallery component instead of
 * a hand-rolled flex-grow rail. OrdersHubPage.tsx doesn't need any
 * changes to its JSX for ItemImageStack — it still just renders
 * <ItemImageStack items={...} fitActive /> — but it DOES need its
 * wrapper divs to carry a real width now (see the note below).
 *
 * Behavior note: the old `fitActive` mode sized the active panel to its
 * *natural image aspect ratio* (so the stack's own width could grow/shrink
 * to avoid any cropping) and collapsed the rest to thin rails. Accordion-
 * style galleries work on percentage split instead — the row always fills
 * its container and the active panel takes a fixed share of it, cropping
 * via object-fit: cover. So `fitActive` here is mapped to a larger
 * expandRatio (a bigger, more "hero" active panel) rather than literal
 * aspect-fit; visually it reads the same way (one image clearly dominant,
 * the rest as a thin rail of alternatives), it just no longer guarantees
 * zero cropping on the active image.
 *
 * FIX (width collapse): this used to render `w-auto` on the wrapper when
 * `fitActive` was true — a leftover from the old aspect-ratio-sized
 * implementation, where the stack needed to size itself from its content.
 * But AccordionGallery's root is `width: 100%` (it always fills its
 * container now, per the note above). `width: auto` on this wrapper +
 * `width: 100%` on its only child is a circular reference — CSS resolves
 * a percentage width against an auto-width ancestor to 0, so the whole
 * gallery rendered at 0px wide regardless of fitActive. This wrapper is
 * now always `w-full`; sizing is controlled entirely by whatever *real*
 * width the caller's own wrapper div provides (see OrdersHubPage.tsx —
 * its `h-24`/`h-40` wrapper divs now also carry an explicit width, not
 * just `max-w-[...]`, for the same reason: `flex-none` alone doesn't
 * give a flex item a definite width when its content has none either).
 *
 * FIX (active rail too small on narrow wrappers): `railMinSize` was
 * hard-wired to `fitActive ? 32 : 24` with no way for a caller to
 * override it. On a wide wrapper (desktop's 380px) that's fine, but on
 * a narrow one (mobile's ~160px) that same 32px floor per inactive rail,
 * plus gaps, eats most of the container before the active panel gets
 * any space — so it never grows close to its aspect-fit size and just
 * sits near the same floor as the inactive rails. `railMinSize` is now
 * an optional prop so a narrow-wrapper caller can pass a smaller floor
 * (see OrdersHubPage.tsx's mobile call) without affecting callers that
 * have room to spare.
 *
 * ADD (overflow badge): when items.length > maxVisible, the "+N more"
 * text was only visible inside the last rail's subtitle — easy to miss
 * since it's small print competing with the rest of the label, and
 * invisible entirely if that rail isn't the active one (labels only
 * render at readable opacity on the active panel — see
 * AccordionGallery.tsx's .ag-panel__text opacity). A small absolutely-
 * positioned "+N" badge in the stack's top-right corner surfaces the
 * same count independent of which rail is active, without touching
 * AccordionGallery itself (it lives in this wrapper, on top of the
 * gallery). The per-rail subtitle text is left as-is — redundant once
 * you notice the badge, but harmless, and still useful context once
 * that particular rail is the active one.
 */
'use client'

import type { OrderItem } from '@/contexts/Ordercontexts'
import AccordionGallery from '@/components/reactBits/AccordionGallery'

// 5 rails plus a hero panel never fit legibly in a compact card (mobile's
// wrapper is ~160px wide) — 5 inactive rails there work out to roughly
// 13px each, which reads as a colored line rather than a photo. Desktop's
// wider wrapper (~288px+) can support more. Callers on a narrow layout
// should pass maxVisible explicitly (see OrdersHubPage.tsx's mobile vs.
// desktop calls) rather than relying on one number for every context.
const MAX_VISIBLE_DEFAULT = 4

export function ItemImageStack({
  items,
  className = '',
  fitActive = false,
  maxVisible = MAX_VISIBLE_DEFAULT,
  railMinSize,
}: {
  items: OrderItem[]
  className?: string
  fitActive?: boolean
  /** Cap on thumbnails shown before folding the rest into "+N more". Keep this low enough that every rail still clears AccordionGallery's railMinSize at the wrapper's real width. */
  maxVisible?: number
  /**
   * Overrides the inactive-rail floor AccordionGallery enforces (px).
   * Defaults to `fitActive ? 32 : 24` when omitted. Pass a smaller
   * value on a narrow wrapper (e.g. the mobile card's ~160px width) so
   * the active panel has real free space left over to grow toward its
   * aspect-fit size — otherwise every rail, including the "active" one,
   * gets squeezed down near the floor and nothing reads as dominant.
   */
  railMinSize?: number
}) {
  const visible = items.slice(0, maxVisible)
  const overflow = items.length - visible.length

  const galleryItems = visible.map((item, i) => ({
    image: item.image,
    label: item.name,
    // last visible tile also carries the "+N more" count in its subtitle
    // line so nothing is lost now that there's no separate badge overlay
    subtitle: i === visible.length - 1 && overflow > 0 ? `Qty ${item.qty} · +${overflow} more` : `Qty ${item.qty}`,
  }))

  return (
    // Always w-full — AccordionGallery fills whatever real width this
    // div has (see FIX note above). `fitActive` no longer changes width
    // mode, only expandRatio below. `relative` so the overflow badge
    // below can position itself against this wrapper rather than the
    // page.
    <div className={`relative h-full min-w-0 w-full max-w-full ${className}`}>
      <AccordionGallery
        items={galleryItems}
        defaultIndex={0}
        trigger="click"
        expandRatio={fitActive ? 0.62 : 0.45}
        accentColor="#ffffff"
        overlayColor="#000000"
        textColor="#ffffff"
        showLabels
        duration={0.55}
        ease="power3.out"
        parallax={0.3}
        tilt={4}
        stagger={0.04}
        height="100%"
        gap={6}
        radius={12}
        orientation="horizontal"
        className="h-full"
        railMinSize={railMinSize ?? (fitActive ? 32 : 24)}
      />

      {/* Overflow badge — count of items folded past maxVisible. Sits
          on top of the gallery (z-10) in the corner farthest from where
          labels render (bottom-left, see AccordionGallery's
          .ag-panel__label), so it never overlaps the active panel's
          text. pointer-events-none so it never intercepts the click
          that switches the active rail underneath it. */}
      {overflow > 0 && (
        <span
          className="pointer-events-none absolute right-1.5 top-1.5 z-10 rounded-full bg-ink/70 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white shadow-sm backdrop-blur-sm"
          aria-hidden="true"
        >
          +{overflow}
        </span>
      )}
    </div>
  )
}