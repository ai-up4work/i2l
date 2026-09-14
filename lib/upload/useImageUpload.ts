// lib/upload/useImageUpload.ts
'use client'

// IMPORTANT: this file must never import anything from lib/supabase/server.ts
// (or anything else that pulls in next/headers). It only talks to the
// server via fetch('/api/upload') — all Supabase/storage/auth logic lives
// in app/api/upload/route.ts, which runs server-side. Keeping this file
// free of server-only imports is what keeps it safe to use from any
// client component.

import { useState } from 'react'

// Keep in sync with FOLDER_CONFIG in app/api/upload/route.ts — this is
// just the client-side type, the route is the source of truth for which
// folders actually exist and how they're scoped.
export type UploadFolder = 'avatars' | 'reviews' | 'products' | 'banners'

export function useImageUpload() {
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function upload(file: File, folder: UploadFolder): Promise<string | null> {
    setError(null)
    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('folder', folder)

      const res = await fetch('/api/upload', { method: 'POST', body: formData })

      let data: { url?: string; error?: string }
      try {
        data = await res.json()
      } catch {
        setError('Upload failed — unexpected response from server.')
        return null
      }

      if (!res.ok) {
        setError(data.error ?? 'Upload failed.')
        return null
      }
      if (!data.url) {
        setError('Upload succeeded but no URL was returned.')
        return null
      }
      return data.url
    } catch {
      setError('Could not upload that image. Check your connection and try again.')
      return null
    } finally {
      setUploading(false)
    }
  }

  return { uploading, error, upload, reset: () => setError(null) }
}