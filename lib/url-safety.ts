// lib/url-safety.ts
//
// SERVER-ONLY. Stops the public lookup endpoints (/api/scrape,
// /api/product-lookup, /api/og-lookup) from being used to make our
// server fetch private or internal addresses — localhost, the cloud
// metadata service (169.254.169.254), 10.x / 192.168.x networks and so
// on. Product links are always public websites, so nothing real is lost.

import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'

const BLOCKED_HOSTNAMES = /^(localhost|.*\.localhost|.*\.local|.*\.internal|.*\.home\.arpa|metadata\.google\.internal)$/i

function ipv4ToInt(ip: string): number {
  return ip.split('.').reduce((n, part) => (n << 8) + Number(part), 0) >>> 0
}

function inRange(ip: string, cidr: string): boolean {
  const [base, bits] = cidr.split('/')
  const mask = Number(bits) === 0 ? 0 : (~0 << (32 - Number(bits))) >>> 0
  return (ipv4ToInt(ip) & mask) === (ipv4ToInt(base) & mask)
}

const PRIVATE_V4 = [
  '0.0.0.0/8',
  '10.0.0.0/8',
  '100.64.0.0/10',
  '127.0.0.0/8',
  '169.254.0.0/16',
  '172.16.0.0/12',
  '192.0.0.0/24',
  '192.168.0.0/16',
  '198.18.0.0/15',
  '224.0.0.0/4',
  '240.0.0.0/4',
]

/** True for loopback, private, link-local, CGNAT, multicast and reserved addresses. */
export function isPrivateIp(ip: string): boolean {
  const version = isIP(ip)
  if (version === 4) return PRIVATE_V4.some((cidr) => inRange(ip, cidr))
  if (version === 6) {
    const v6 = ip.toLowerCase()
    if (v6 === '::' || v6 === '::1') return true
    const mapped = v6.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)
    if (mapped) return isPrivateIp(mapped[1])
    // IPv4-mapped in hex form, as URL() writes it: ::ffff:7f00:1 = 127.0.0.1
    const hex = v6.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/)
    if (hex) {
      const hi = parseInt(hex[1], 16)
      const lo = parseInt(hex[2], 16)
      return isPrivateIp(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`)
    }
    // NAT64 / 6to4 / IPv4-compatible forms can wrap private IPv4 too.
    if (/^(64:ff9b:|2002:|::[0-9a-f]{1,4}:[0-9a-f]{1,4}$)/.test(v6)) return true
    return /^(fc|fd|fe8|fe9|fea|feb|ff)/.test(v6)
  }
  return true
}

/**
 * True when `raw` is an http(s) URL whose host resolves only to public
 * addresses. Never throws.
 */
export async function isPublicHttpUrl(raw: string): Promise<boolean> {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return false
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false
  if (url.username || url.password) return false

  const host = url.hostname.replace(/^\[|\]$/g, '')
  if (!host || BLOCKED_HOSTNAMES.test(host)) return false
  if (isIP(host)) return !isPrivateIp(host)

  try {
    const addresses = await lookup(host, { all: true, verbatim: true })
    return addresses.length > 0 && addresses.every((a) => !isPrivateIp(a.address))
  } catch {
    return false
  }
}

/**
 * fetch() that follows redirects itself (up to `maxRedirects`) and checks
 * every hop with isPublicHttpUrl, so a public link can't bounce the
 * request to an internal address. Throws if a hop is blocked.
 */
export async function safeFetch(raw: string, init: RequestInit = {}, maxRedirects = 5): Promise<Response> {
  let current = raw
  for (let hop = 0; hop <= maxRedirects; hop++) {
    if (!(await isPublicHttpUrl(current))) throw new Error('Blocked URL')
    const res = await fetch(current, { ...init, redirect: 'manual' })
    const location = res.status >= 300 && res.status < 400 ? res.headers.get('location') : null
    if (!location) {
      // Response.url is read-only and empty for manual fetches in some
      // runtimes; expose the final URL for callers that need it.
      Object.defineProperty(res, 'url', { value: current, configurable: true })
      return res
    }
    res.body?.cancel().catch(() => {})
    current = new URL(location, current).toString()
  }
  throw new Error('Too many redirects')
}
