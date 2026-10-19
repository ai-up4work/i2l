// components/platforms/pdp-styles.ts
//
// The shared frame every store view in the item screen uses, so all of
// them line up: same container, same grid, same title and label type.
// Each store keeps its own colours, buttons and rating style; only the
// structure and type scale come from here.

/** Page width and side padding. */
// No side padding on phones: the item screen already pads its content, and
// the extra 24px a side squeezed the buttons row off the screen on 360px
// phones. `w-full min-w-0` keeps it from growing past the screen.
export const PDP_CONTAINER = 'mx-auto w-full min-w-0 max-w-6xl sm:px-6 lg:px-10'

/**
 * Mobile: title → photos → price & options, one column.
 * Desktop: photos on the left spanning both rows; title top-right, price
 * & options right under it. `grid-rows-[auto_1fr]` keeps the title row
 * only as tall as the title, so the price sits right below it instead of
 * floating halfway down next to a tall photo.
 */
export const PDP_GRID =
  "grid grid-cols-[minmax(0,1fr)] gap-x-10 gap-y-6 [grid-template-areas:'info'_'gallery'_'rest'] sm:grid-cols-2 sm:grid-rows-[auto_1fr] sm:gap-y-5 sm:[grid-template-areas:'gallery_info'_'gallery_rest']"

/** Product title — the platform's display face, same size everywhere. */
export const PDP_TITLE = 'mt-2 font-display text-2xl font-extrabold leading-tight tracking-tight text-ink sm:text-3xl'

/** Brand / seller line above the title (Ajio, Nykaa, Myntra…). */
export const PDP_BRAND_LINE = 'mt-2 text-sm font-bold uppercase tracking-wide text-ink/55'

/** "COLOR", "SIZE" labels over option rows. */
export const PDP_LABEL = 'text-[10px] font-bold uppercase tracking-wide text-ink/45'

/**
 * Price, options, stock and buttons. On desktop this column is as tall as
 * the photos (minus the title row). Any spare height is split evenly above
 * the price and above the buttons, so the price & options sit in the
 * middle and the buttons line up with the bottom of the gallery. When the
 * content is taller than the photo it simply flows as normal (the buttons
 * keep a 24px gap above them).
 */
export const PDP_REST = 'min-w-0 [grid-area:rest] sm:flex sm:flex-col sm:[&>*:first-child]:mt-auto sm:[&>*:last-child]:mt-auto sm:[&>*:last-child]:pt-6'
