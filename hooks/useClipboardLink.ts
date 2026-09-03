// useClipboardLink.ts
'use client'

import { useCallback, useEffect } from 'react'

// Very small check that the clipboard text is actually a URL, so we don't
// clobber the field with unrelated copied text (an address, a note, etc).
function looksLikeUrl(text: string) {
  try {
    const url = new URL(text.trim())
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

// Returns the hostname to compare against the allow-list, or null if the
// text isn't a valid URL at all.
function getHostname(text: string): string | null {
  try {
    return new URL(text.trim()).hostname.toLowerCase()
  } catch {
    return null
  }
}

// Matches "example.com" against both "example.com" and any subdomain of it
// ("www.example.com", "m.example.com"), but not "notexample.com".
function isAllowedDomain(hostname: string, allowedDomains: string[]) {
  return allowedDomains.some((domain) => {
    const normalized = domain.toLowerCase().replace(/^www\./, '')
    return hostname === normalized || hostname.endsWith(`.${normalized}`)
  })
}

type UseClipboardLinkOptions = {
  /** Only auto-fill when the field is currently empty. Default: true. */
  onlyWhenEmpty?: boolean
  /** Disable the hook entirely (e.g. once the user has interacted). */
  enabled?: boolean
  /**
   * Domains (e.g. ["amazon.com", "ebay.com"]) that are safe to act on
   * automatically. Subdomains of an allowed domain also match. Leave
   * empty/omitted to disable domain-gated behavior entirely.
   */
  allowedDomains?: string[]
  /**
   * Called any time the hook auto-fills the field from the clipboard,
   * regardless of domain.
   */
  onAutoFill?: (url: string) => void
  /**
   * Called only when the auto-filled URL's domain matches `allowedDomains`.
   * Use this to trigger a follow-on action, like auto-submitting a form,
   * for trusted/known stores only — never for arbitrary pasted links.
   */
  onAllowedDomain?: (url: string) => void
}

/**
 * Watches the clipboard and auto-fills `value` with clipboard content when
 * it looks like a URL. Attach this to any textarea/input that expects a
 * pasted link.
 *
 * There's no native "clipboard changed" browser event, so this checks:
 *  - once on mount (often silently fails without a prior user gesture —
 *    that's expected, not a bug)
 *  - whenever the window regains focus
 *  - whenever the tab becomes visible again
 * which together cover the common case of copying a link elsewhere and
 * switching back to the app.
 *
 * Usage:
 *   const [link, setLink] = useState('')
 *   useClipboardLink(link, setLink)
 *
 *   <textarea value={link} onChange={(e) => setLink(e.target.value)} />
 *
 * Domain-gated auto-submit — only trusted stores trigger the action, and
 * even then not silently: start a cancellable countdown instead of
 * submitting immediately, so an accidental copy or a false-positive
 * domain match can still be undone before anything is created:
 *   const formRef = useRef<HTMLFormElement>(null)
 *   const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
 *   useClipboardLink(link, setLink, {
 *     allowedDomains: ['amazon.com', 'ebay.com'],
 *     onAllowedDomain: () => {
 *       timerRef.current = setTimeout(() => formRef.current?.requestSubmit(), 5000)
 *     },
 *   })
 *   // show an "Undo" toast that calls clearTimeout(timerRef.current) and
 *   // resets the field if the user taps it before the countdown ends
 */
export function useClipboardLink(
  value: string,
  setValue: (value: string) => void,
  options: UseClipboardLinkOptions = {}
) {
  const {
    onlyWhenEmpty = true,
    enabled = true,
    allowedDomains = [],
    onAutoFill,
    onAllowedDomain,
  } = options

  const checkClipboard = useCallback(async () => {
    if (!enabled) return
    if (onlyWhenEmpty && value.trim()) return
    if (!navigator.clipboard?.readText) return

    try {
      const text = await navigator.clipboard.readText()
      const trimmed = text.trim()
      if (!text || !looksLikeUrl(trimmed) || trimmed === value) return

      setValue(trimmed)
      onAutoFill?.(trimmed)

      const hostname = getHostname(trimmed)
      if (hostname && allowedDomains.length > 0 && isAllowedDomain(hostname, allowedDomains)) {
        onAllowedDomain?.(trimmed)
      }
    } catch {
      // Permission denied / clipboard not readable — ignore silently.
    }
  }, [enabled, onlyWhenEmpty, value, setValue, allowedDomains, onAutoFill, onAllowedDomain])

  useEffect(() => {
    if (!enabled) return

    checkClipboard()

    const handleFocus = () => checkClipboard()
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') checkClipboard()
    }

    window.addEventListener('focus', handleFocus)
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      window.removeEventListener('focus', handleFocus)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [enabled, checkClipboard])
}