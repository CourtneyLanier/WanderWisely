// Upload / fetch / open logic for files attached to trip documents.
// Bytes live in the private 'trip-documents' Storage bucket AND in a local
// IndexedDB cache (see docFileCache) so they open offline.

import { supabase } from '@/lib/supabase'
import type { TripDocument } from '@/types'
import {
  getCachedDocFile,
  putCachedDocFile,
  deleteCachedDocFile,
  type CachedDocFile,
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
 * Get a document's file blob for in-app viewing. Prefers the local cached copy
 * (works offline); falls back to downloading from Storage. Throws with a
 * user-facing message on failure.
 *
 * Note: we deliberately do NOT window.open() blob URLs — popup blockers kill
 * that after async work, and it does nothing at all in the installed
 * (standalone) PWA on iOS. Files are shown in the in-app DocFileViewer instead.
 */
export async function getDocFileBlob(doc: TripDocument): Promise<CachedDocFile> {
  if (!doc.file_path) throw new Error('No file attached.')
  let cached = await getCachedDocFile(doc.id)
  if (!cached) {
    const ok = await ensureDocFileCached(doc)
    if (!ok) {
      throw new Error(
        navigator.onLine === false
          ? "This file hasn't been saved for offline use yet. Open it once while online."
          : 'Could not load the file. Please try again.'
      )
    }
    cached = await getCachedDocFile(doc.id)
  }
  if (!cached) throw new Error('Could not load the file.')
  return cached
}

/**
 * Hand an already-loaded file to the user: native share sheet on phones
 * (Save to Files, AirDrop, Mail, …), otherwise a plain download. Returns an
 * error message, or null on success / user-cancelled share.
 */
export async function shareOrDownloadFile(file: CachedDocFile): Promise<string | null> {
  try {
    const f = new File([file.blob], file.name, { type: file.type })
    if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [f] })) {
      await navigator.share({ files: [f] })
      return null
    }
  } catch (e) {
    if ((e as Error).name === 'AbortError') return null // user closed the share sheet
    // fall through to plain download
  }
  try {
    const url = URL.createObjectURL(file.blob)
    const a = document.createElement('a')
    a.href = url
    a.download = file.name
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
    return null
  } catch {
    return 'Could not download the file.'
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
