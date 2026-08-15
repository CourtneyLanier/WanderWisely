// Upload / fetch logic for files attached to trip documents.
// Bytes live in the private 'trip-documents' Storage bucket AND in a local
// IndexedDB cache (see fileCache) so they open offline.
//
// The fetch/cache/share machinery is generic and shared with reservation
// confirmation PDFs — see storedFiles.ts. This module holds only what is
// specific to trip documents.

import { supabase } from '@/lib/supabase'
import type { TripDocument } from '@/types'
import { putCachedFile } from '@/lib/fileCache'
import {
  ensureFileCached,
  getFileBlob,
  removeStoredFile,
  type StoredFileRef,
} from '@/lib/storedFiles'
import type { CachedFile } from '@/lib/fileCache'

// Re-exported so document callers keep a single import site.
export { shareOrDownloadFile, formatBytes } from '@/lib/storedFiles'

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
 * Describe a document's attached file for the generic viewer/cache layer.
 * Returns null when the document has no file.
 *
 * The cache key is the bare document id — unchanged from before this was
 * generalized, so files cached by earlier builds still resolve offline.
 */
export function docFileRef(doc: TripDocument): StoredFileRef | null {
  if (!doc.file_path) return null
  return {
    cacheKey: doc.id,
    bucket: BUCKET,
    path: doc.file_path,
    name: doc.file_name ?? 'file',
    type: doc.file_type ?? '',
    size: doc.file_size ?? null,
  }
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
  await putCachedFile(docId, { blob: file, name: file.name, type: file.type })

  return { file_path: path, file_name: file.name, file_type: file.type, file_size: file.size }
}

/** Ensure a document's file is available offline. See ensureFileCached. */
export async function ensureDocFileCached(doc: TripDocument): Promise<boolean> {
  const ref = docFileRef(doc)
  return ref ? ensureFileCached(ref) : false
}

/** Get a document's file blob for in-app viewing. See getFileBlob. */
export async function getDocFileBlob(doc: TripDocument): Promise<CachedFile> {
  const ref = docFileRef(doc)
  if (!ref) throw new Error('No file attached.')
  return getFileBlob(ref)
}

/** Delete a document's file from Storage and the local cache (best-effort). */
export async function removeDocFile(doc: TripDocument): Promise<void> {
  const ref = docFileRef(doc)
  if (ref) await removeStoredFile(ref)
}
