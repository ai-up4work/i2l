// lib/share.ts
//
// Sharing a page — works the same in the browser and in the installed app
// (PWA), where there's no address bar to copy from:
//   1. the phone's own share sheet (WhatsApp, Messenger, …) when available;
//   2. otherwise the link is copied to the clipboard;
//   3. as a last resort, a hidden text box + execCommand('copy').

export type ShareResult = 'shared' | 'copied' | 'cancelled' | 'failed'

/** An absolute link on this site for `path` (default: this page, without its query). */
export function shareUrl(path?: string): string {
  if (typeof window === 'undefined') return path ?? ''
  if (!path) return window.location.origin + window.location.pathname
  return new URL(path, window.location.origin).toString()
}

async function copy(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    /* fall through */
  }
  try {
    const box = document.createElement('textarea')
    box.value = text
    box.setAttribute('readonly', '')
    box.style.position = 'fixed'
    box.style.opacity = '0'
    document.body.appendChild(box)
    box.select()
    const ok = document.execCommand('copy')
    box.remove()
    return ok
  } catch {
    return false
  }
}

export async function shareLink({ title, text, url }: { title: string; text?: string; url?: string }): Promise<ShareResult> {
  const link = url ?? shareUrl()
  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      await navigator.share({ title, text, url: link })
      return 'shared'
    } catch (e) {
      // The shopper closed the sheet: nothing to do.
      if (e instanceof DOMException && e.name === 'AbortError') return 'cancelled'
      // Share not allowed here (e.g. some desktop browsers): copy instead.
    }
  }
  return (await copy(link)) ? 'copied' : 'failed'
}
