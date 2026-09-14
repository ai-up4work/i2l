'use client'

// Attachments are real Supabase Storage URLs now (see lib/supabase/chat.ts),
// not IndexedDB blob pointers — this component used to resolve a blob by
// id before it could render anything; now it's just an <img>/<video> tag.
// Kept as its own component anyway since callers still branch on kind and
// this keeps that logic in one place, plus it's an easy seam if a signed
// URL / loading state is ever needed for a private bucket instead of a
// public one.

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
  return kind === 'image' ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt={name ?? 'Attachment'} className={className} />
  ) : (
    <video src={url} controls className={className} />
  )
}
