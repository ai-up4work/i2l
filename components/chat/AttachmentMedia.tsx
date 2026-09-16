'use client'

// Attachments are real Supabase Storage URLs now (see lib/supabase/chat.ts),
// not IndexedDB blob pointers — this component used to resolve a blob by
// id before it could render anything; now it's just an <img>/<video> tag.
// Kept as its own component anyway since callers still branch on kind and
// this keeps that logic in one place, plus it's an easy seam if a signed
// URL / loading state is ever needed for a private bucket instead of a
// public one.
//
// Image lightbox: clicking an image morphs it into a full-screen view via
// framer-motion's shared layoutId animation (the thumbnail and the
// lightbox's full-size image share a layoutId, so framer-motion animates
// between their two positions/sizes automatically rather than a plain
// fade). This is the ONE component every chat surface (floating
// ChatPanel, /account/messages, admin /admin/chat) renders an attachment
// through, so this single change gives all three the lightbox — no
// changes needed in any of those three files.

import { useEffect, useId, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { X } from 'lucide-react'

export default function AttachmentMedia({
  url,
  kind,
  name,
  className,
}: {
  url: string
  kind: 'image' | 'video'
  name?: string
  className?: string
}) {
  const [open, setOpen] = useState(false)
  // Unique per component instance, not per url — two messages could in
  // principle carry the same image URL, and reusing the url itself as
  // the layoutId would make framer-motion treat both as "the same
  // element", producing a wrong/confusing morph if both are on screen.
  const instanceId = useId()

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  if (kind === 'video') {
    // eslint-disable-next-line jsx-a11y/media-has-caption
    return <video src={url} controls className={className} />
  }

  return (
    <>
      <motion.img
        layoutId={`attachment-${instanceId}`}
        src={url}
        alt={name ?? 'Attachment'}
        className={className}
        onClick={() => setOpen(true)}
        style={{ cursor: 'zoom-in' }}
      />
      <AnimatePresence>
        {open && (
          <motion.div
            className="fixed inset-0 z-[200] flex items-center justify-center bg-ink/85 p-4 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setOpen(false)}
            role="dialog"
            aria-modal="true"
            aria-label="Image preview"
          >
            <motion.img
              layoutId={`attachment-${instanceId}`}
              src={url}
              alt={name ?? 'Attachment'}
              className="max-h-[88vh] max-w-[92vw] rounded-xl object-contain shadow-2xl"
              onClick={(e) => e.stopPropagation()}
              transition={{ type: 'spring', damping: 28, stiffness: 320 }}
            />
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close image"
              className="absolute right-5 top-5 grid h-10 w-10 place-items-center rounded-full bg-black/40 text-white transition-colors hover:bg-black/60"
            >
              <X size={20} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}