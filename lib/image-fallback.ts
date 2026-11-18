// lib/image-fallback.ts
//
// A neutral "no photo" picture, and an onError handler that swaps it in when
// an image link is dead (a store removed the photo, the link expired, the
// scrape never found one). Without it the browser shows the broken-image icon
// and the alt text (e.g. "https://www.mee…" or "bag") inside the thumbnail.
//
// Usage:  <img src={url} alt="" onError={swapToNoPhoto} />

export const NO_PHOTO_SRC =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><rect width="200" height="200" fill="#e9e5da"/>` +
      `<g fill="none" stroke="#9a968b" stroke-width="6" stroke-linecap="round" stroke-linejoin="round">` +
      `<rect x="55" y="62" width="90" height="76" rx="10"/><circle cx="80" cy="88" r="8"/><path d="M60 128l26-26 20 20 14-14 26 26"/></g></svg>`,
  )

/** onError for an <img>: show the placeholder once (no retry loop if it fails too). */
export function swapToNoPhoto(e: { currentTarget: HTMLImageElement }) {
  const el = e.currentTarget
  if (el.dataset.noPhoto === '1') return
  el.dataset.noPhoto = '1'
  el.src = NO_PHOTO_SRC
}
