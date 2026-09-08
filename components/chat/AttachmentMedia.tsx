'use client'

import { useEffect, useState } from 'react'
import type { ChatAttachment } from '@/contexts/ChatContext'
import { getAttachmentBlob } from '@/lib/chat/attachmentDb'

export default function AttachmentMedia({
  attachment,
  className,
  refreshKey = 0,
}: {
  attachment: ChatAttachment
  className?: string
  refreshKey?: number
}) {
  // If the attachment already carries a usable url (e.g. a just-picked
  // file's object URL, still valid in this session), show it
  // immediately. Otherwise resolve the blob from IndexedDB.
  const [url, setUrl] = useState<string | null>(attachment.url || null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (attachment.url) {
      setUrl(attachment.url)
      return
    }
    let cancelled = false
    let objectUrl: string | null = null
    setFailed(false)
    getAttachmentBlob(attachment.id)
      .then((record) => {
        if (cancelled) return
        if (!record) {
          setFailed(true)
          return
        }
        objectUrl = URL.createObjectURL(record.blob)
        setUrl(objectUrl)
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })
    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
    // refreshKey is a deliberate cache-buster for the manual refresh button
  }, [attachment.id, attachment.url, refreshKey])

  if (failed) {
    return (
      <div className={`grid place-items-center bg-black/20 text-[11px] text-white/50 ${className ?? ''}`}>
        Attachment unavailable
      </div>
    )
  }

  if (!url) {
    return <div className={`animate-pulse bg-white/10 ${className ?? ''}`} />
  }

  return attachment.type === 'image' ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt={attachment.name} className={className} />
  ) : (
    <video src={url} controls className={className} />
  )
}