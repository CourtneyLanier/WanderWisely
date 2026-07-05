// Upload / fetch / open logic for files attached to trip documents.
// Bytes live in the private 'trip-documents' Storage bucket AND in a local
// IndexedDB cache (see docFileCache) so they open offline.

import { supabase } from '@/lib/supabase'
import type { TripDocument } from '@/types'
import {
  getCachedDocFile,
  putCachedDocFile,
  deleteCachedDocFile,
} from '@/lib/docFileCache'

const BUCKET = 'trip-documents'

export const MAX_DOC_FILE_BYTES = 25 * 1024 * 1024 // 25 MB (matches the bucket limit)
export const ACCEPTED_DOC_MIME = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
export const ACCEPTED_DOC_ACCEPT = 'application/pdf,image/jpeg,image/png,image/webp'

export interface UploadedDocFile {
  file_path: string
  file_name: string
  file_type: string
  file_size: number
}

/** Strip path separators / odd characters from a filename for use in a storage key. */
function safeName(name: string): string {
  return name.replace(/[^a-z0-9._-]+/gi, '_').replace(/^_+|_+$/g, '') || 'file'
}

/**
 * Upload a file for a document to Storage and cache it locally.
 * Throws on validation or upload failure.
 */
export async function uploadDocFile(docId: string, file: File): Promise<UploadedDocFile> {
  if (!ACCEPTED_DOC_MIME.includes(file.type)) {
    throw new Error('Unsupported file type. Please choose a PDF, JPG, PNG, or WEBP.')
  }
  if (file.size > MAX_DOC_FILE_BYTES) {
    throw new Error(`${(file.size / 1024 / 1024).toFixed(1)} MB — over the 25 MB limit.`)
  }

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not signed in — please log in again.')

  const path = `${user.id}/${docId}/${safeName(file.name)}`
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { contentType: file.type, upsert: true })
  if (error) throw error

  // Cache locally right away so it's immediately available offline.
  await putCachedDocFile(docId, { blob: file, name: file.name, type: file.type })

  return { file_path: path, file_name: file.name, file_type: file.type, file_size: file.size }
}

/**
 * Ensure a document's file is cached locally. Downloads from Storage if online
 * and not already cached. Returns true if the file is available offline after
 * the call. Safe to call repeatedly (used for background prefetch).
 */
export async function ensureDocFileCached(doc: TripDocument): Promise<boolean> {
  if (!doc.file_path) return false
  const cached = await getCachedDocFile(doc.id)
  if (cached) return true
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return false

  const { data, error } = await supabase.storage.from(BUCKET).download(doc.file_path)
  if (error || !data) return false
  await putCachedDocFile(doc.id, {
    blob: data,
    name: doc.file_name ?? 'file',
    type: doc.file_type ?? data.type ?? 'application/octet-stream',
  })
  return true
}

/**
 * Open a document's file in a new tab. Prefers the local cached copy (works
 * offline); falls back to downloading from Storage. Returns an error message,
 * or null on success.
 */
export async function openDocFile(doc: TripDocument): Promise<string | null> {
  if (!doc.file_path) return 'No file attached.'
  try {
    let cached = await getCachedDocFile(doc.id)
    if (!cached) {
      const ok = await ensureDocFileCached(doc)
      if (!ok) {
        return navigator.onLine === false
          ? "This file hasn't been saved for offline use yet. Open it once while online."
          : 'Could not load the file. Please try again.'
      }
      cached = await getCachedDocFile(doc.id)
    }
    if (!cached) return 'Could not load the file.'

    const url = URL.createObjectURL(cached.blob)
    const win = window.open(url, '_blank', 'noopener')
    if (!win) {
      // Popup blocked — fall back to a same-tab navigation via a temporary link.
      const a = document.createElement('a')
      a.href = url
      a.target = '_blank'
      a.rel = 'noopener'
      a.click()
    }
    // Revoke well after the new tab has had time to load.
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
    return null
  } catch (e) {
    return (e as Error).message ?? 'Could not open the file.'
  }
}

/** Delete a document's file from Storage and the local cache (best-effort). */
export async function removeDocFile(doc: TripDocument): Promise<void> {
  if (doc.file_path) {
    await supabase.storage.from(BUCKET).remove([doc.file_path]).catch(() => {})
  }
  await deleteCachedDocFile(doc.id).catch(() => {})
}

/** Human-readable file size. */
export function formatBytes(n: number | null): string {
  if (!n) return ''
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}
