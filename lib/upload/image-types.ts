// Image formats the upload API accepts. Browsers show these in the file
// picker via IMAGE_ACCEPT. Formats every browser can display are stored
// as-is (AVIF included); the rest (HEIC/HEIF from iPhones, TIFF, BMP) are
// converted to WebP on the server by /api/upload. SVG is deliberately not
// allowed (it can carry scripts).

export const IMAGE_ACCEPT =
  'image/jpeg,image/png,image/webp,image/gif,image/avif,image/heic,image/heif,image/tiff,image/bmp,.jpg,.jpeg,.png,.webp,.gif,.avif,.heic,.heif,.tif,.tiff,.bmp,.jfif'

/** extension -> canonical mime type (phones/OSes often send an empty or odd type) */
export const EXT_TO_MIME: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  jfif: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  avif: 'image/avif',
  heic: 'image/heic',
  heif: 'image/heif',
  tif: 'image/tiff',
  tiff: 'image/tiff',
  bmp: 'image/bmp',
}

/** Stored untouched. */
export const NATIVE_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
}

/** Accepted, but converted to WebP before storing. */
export const CONVERT_MIME = new Set(['image/heic', 'image/heif', 'image/tiff', 'image/bmp', 'image/x-ms-bmp'])

export function resolveImageMime(name: string, type: string): string | null {
  const t = (type || '').toLowerCase()
  if (t === 'image/jpg' || t === 'image/pjpeg') return 'image/jpeg'
  if (t in NATIVE_MIME || CONVERT_MIME.has(t)) return t
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  return EXT_TO_MIME[ext] ?? null
}
