// Generic fetch / cache / share logic for files kept in a PRIVATE Storage
// bucket. Bytes are downloaded through the authenticated client and mirrored
// into a local IndexedDB cache (see fileCache) so they open with no signal.
//
// Two callers today: trip documents (see docFiles.ts) and reservation
// confirmation PDFs (see reservationPdfs.ts). Neither builds a public URL —
// the buckets are private and a public URL against them carries no auth.

import { supabase } from '@/lib/supabase'
import {
  getCachedFile,
  putCachedFile,
  deleteCachedFile,
  type CachedFile,
} from '@/lib/fileCache'

/**
 * Everything needed to fetch, cache and display one stored file.
 *
 * `cacheKey` must be stable and globally unique across entity types — trip
 * documents use the bare document id (unchanged from before this was
 * generalized, so existing offline caches survive) and reservations use a
 * `res:<id>` prefix.
 */
export interface StoredFileRef {
  cacheKey: string
  bucket: string
  path: string
  name: string
  type: string
  size: number | null
}

/**
 * Ensure a file is cached locally. Downloads from Storage if online and not
 * already cached. Returns true if the file is available offline after the
 * call. Safe to call repeatedly (used for background prefetch).
 */
export async function ensureFileCached(ref: StoredFileRef): Promise<boolean> {
  if (!ref.path) return false
  const cached = await getCachedFile(ref.cacheKey)
  if (cached) return true
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return false

  const { data, error } = await supabase.storage.from(ref.bucket).download(ref.path)
  if (error || !data) return false
  await putCachedFile(ref.cacheKey, {
    blob: data,
    name: ref.name,
    type: ref.type || data.type || 'application/octet-stream',
  })
  return true
}

/**
 * Get a file's blob for in-app viewing. Prefers the local cached copy (works
 * offline); falls back to downloading from Storage. Throws with a user-facing
 * message on failure.
 *
 * Note: we deliberately do NOT window.open() blob URLs — popup blockers kill
 * that after async work, and it does nothing at all in the installed
 * (standalone) PWA. Files are shown in the in-app FileViewer instead.
 */
export async function getFileBlob(ref: StoredFileRef): Promise<CachedFile> {
  if (!ref.path) throw new Error('No file attached.')
  let cached = await getCachedFile(ref.cacheKey)
  if (!cached) {
    const ok = await ensureFileCached(ref)
    if (!ok) {
      throw new Error(
        navigator.onLine === false
          ? "This file hasn't been saved for offline use yet. Open it once while online."
          : 'Could not load the file. Please try again.'
      )
    }
    cached = await getCachedFile(ref.cacheKey)
  }
  if (!cached) throw new Error('Could not load the file.')
  return cached
}

/** Delete a stored file from Storage and the local cache (best-effort). */
export async function removeStoredFile(ref: StoredFileRef): Promise<void> {
  if (ref.path) {
    await supabase.storage.from(ref.bucket).remove([ref.path]).catch(() => {})
  }
  await deleteCachedFile(ref.cacheKey).catch(() => {})
}

/**
 * Hand an already-loaded file to the user: native share sheet on phones
 * (Save to Files, AirDrop, Mail, …), otherwise a plain download. Returns an
 * error message, or null on success / user-cancelled share.
 */
export async function shareOrDownloadFile(file: CachedFile): Promise<string | null> {
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

/** Human-readable file size. */
export function formatBytes(n: number | null): string {
  if (!n) return ''
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}
