// lib/media.ts
//
// Browser-safe helpers for showing Cloudinary media. No env, no secrets,
// so it can be imported from client components and the storefront.
//
// Cloudinary builds variations of a file from its link: put a
// "transformation" after /upload/ and it serves that version. That gives
// us small thumbnails, phone-friendly video and a still frame (poster)
// for every video without storing anything extra.

const UPLOAD_MARKER = '/upload/'

export function isCloudinaryUrl(url: string): boolean {
  return /^https:\/\/res\.cloudinary\.com\//i.test(url) && url.includes(UPLOAD_MARKER)
}

export function isVideoUrl(url: string): boolean {
  if (/^https:\/\/res\.cloudinary\.com\/[^/]+\/video\/upload\//i.test(url)) return true
  return /\.(mp4|mov|webm|m4v)(\?|#|$)/i.test(url)
}

function withTransform(url: string, transform: string): string {
  if (!isCloudinaryUrl(url)) return url
  const i = url.indexOf(UPLOAD_MARKER) + UPLOAD_MARKER.length
  return url.slice(0, i) + transform + '/' + url.slice(i)
}

/** A resized photo (auto format + quality). Non-Cloudinary links are returned unchanged. */
export function imageThumb(url: string, width = 400): string {
  return withTransform(url, `f_auto,q_auto,c_limit,w_${width}`)
}

/** A still frame from a video, as a JPG — used as its thumbnail and poster. */
export function videoPoster(url: string, width = 800): string {
  if (!isCloudinaryUrl(url)) return ''
  return withTransform(url, `so_0,f_jpg,q_auto,c_limit,w_${width}`).replace(/\.[a-z0-9]+(\?.*)?$/i, '.jpg')
}

/** The video as MP4 (H.264) at a sensible size — plays on every phone,
 *  including .mov files recorded on an iPhone. */
export function videoPlayback(url: string, width = 1080): string {
  if (!isCloudinaryUrl(url)) return url
  return withTransform(url, `f_mp4,vc_h264,q_auto,c_limit,w_${width}`).replace(/\.[a-z0-9]+(\?.*)?$/i, '.mp4')
}
