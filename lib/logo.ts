/**
 * Thin wrapper around Logo.dev's image API (https://www.logo.dev).
 *
 * Add your publishable token as NEXT_PUBLIC_LOGO_DEV_TOKEN in .env.local.
 * Logo.dev works without a token on low volume, but a token removes the
 * rate limit and lets you request retina sizes.
 */
type LogoOptions = {
  size?: number
  format?: 'png' | 'jpg' | 'webp'
  greyscale?: boolean
}

export function logoUrl(domain: string, options: LogoOptions = {}): string {
  const { size = 64, format, greyscale } = options
  const token = process.env.NEXT_PUBLIC_LOGO_DEV_TOKEN

  const params = new URLSearchParams()
  params.set('size', String(size))
  if (format) params.set('format', format)
  if (greyscale) params.set('greyscale', 'true')
  if (token) params.set('token', token)

  return `https://img.logo.dev/${domain}?${params.toString()}`
}
