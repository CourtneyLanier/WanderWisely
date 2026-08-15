// Confirmation PDFs attached to reservations.
//
// Bytes live in the PRIVATE 'reservation-pdfs' bucket (migration 002) and are
// mirrored into the local file cache so the Wallet works with no signal — the
// whole point of a wallet on a trip.
//
// History: this used to store a getPublicUrl() string in reservations.pdf_url.
// That URL carries no auth, so it only worked while the bucket was wrongly
// public, which also made every confirmation document readable by anyone with
// the link. Migration 013 adds pdf_path; backfillReservationPdfPaths() below
// derives it from the legacy URLs and verifies each one against Storage.

import { supabase } from '@/lib/supabase'
import type { Reservation } from '@/types'
import { putCachedFile } from '@/lib/fileCache'
import { ensureFileCached, removeStoredFile, type StoredFileRef } from '@/lib/storedFiles'

const BUCKET = 'reservation-pdfs'

/** Matches the bucket's own file_size_limit (migration 002). */
export const MAX_RESERVATION_PDF_BYTES = 10 * 1024 * 1024 // 10 MB

/**
 * Cap for PDFs sent to the parse-with-claude edge function. Lower than the
 * storage limit because the file is base64-encoded into the request body
 * (~4/3 inflation) — a property of the parse call, not of storage. Shared by
 * every caller that parses a PDF.
 */
export const MAX_PARSE_PDF_BYTES = 5 * 1024 * 1024 // 5 MB

/** Strip path separators / odd characters from a filename for use in a storage key. */
function safeName(name: string): string {
  return name.replace(/[^a-z0-9._-]+/gi, '_').replace(/^_+|_+$/g, '') || 'file.pdf'
}

/** Cache key for a reservation's PDF. Namespaced to avoid colliding with document ids. */
function cacheKey(reservationId: string): string {
  return `res:${reservationId}`
}

/**
 * Describe a reservation's PDF for the generic viewer/cache layer.
 * Returns null when the reservation has no stored path.
 *
 * Reservations don't carry file metadata columns the way trip_documents do, so
 * the display name comes from the path's basename and the size is unknown.
 */
export function reservationPdfRef(res: Reservation): StoredFileRef | null {
  if (!res.pdf_path) return null
  const base = res.pdf_path.slice(res.pdf_path.lastIndexOf('/') + 1)
  return {
    cacheKey: cacheKey(res.id),
    bucket: BUCKET,
    path: res.pdf_path,
    name: base || 'confirmation.pdf',
    type: 'application/pdf',
    size: null,
  }
}

/** Whether a reservation has a PDF we can actually open. */
export function hasReservationPdf(res: Reservation): boolean {
  return !!res.pdf_path
}

/**
 * Upload a confirmation PDF and return the storage path to save in
 * reservations.pdf_path.
 *
 * Pass `reservationId` when the row already exists (the Attach PDF action) —
 * the file then lands in a per-reservation folder and is cached locally right
 * away. The batch-upload flow parses files *before* inserting rows, so it
 * uploads without an id and relies on the offline prefetch to cache later.
 */
export async function uploadReservationPdf(file: File, reservationId?: string): Promise<string> {
  if (file.type !== 'application/pdf') {
    throw new Error('Please choose a PDF.')
  }
  if (file.size > MAX_RESERVATION_PDF_BYTES) {
    throw new Error(`${(file.size / 1024 / 1024).toFixed(1)} MB — over the 10 MB limit.`)
  }

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not signed in — please log in again.')

  // First folder segment must be the uid — the bucket's RLS policies key on it.
  const slug = reservationId ?? `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  const path = `${user.id}/${slug}/${safeName(file.name)}`
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { contentType: 'application/pdf', upsert: true })
  if (error) throw error

  if (reservationId) {
    await putCachedFile(cacheKey(reservationId), {
      blob: file,
      name: file.name,
      type: 'application/pdf',
    })
  }
  return path
}

/** Ensure a reservation's PDF is available offline. Safe to call repeatedly. */
export async function ensureReservationPdfCached(res: Reservation): Promise<boolean> {
  const ref = reservationPdfRef(res)
  return ref ? ensureFileCached(ref) : false
}

/** Delete a reservation's PDF from Storage and the local cache (best-effort). */
export async function removeReservationPdf(res: Reservation): Promise<void> {
  const ref = reservationPdfRef(res)
  if (ref) await removeStoredFile(ref)
}

// ─── legacy pdf_url → pdf_path backfill ──────────────────────────────────────

/**
 * Recover the storage path from a legacy public URL.
 *
 * getPublicUrl() ran the whole URL through encodeURI(), so a stored filename
 * with a space arrives here as "%20" — the raw object key has the space. Every
 * legacy path was built as `${uid}/${Date.now()}_${i}_${file.name}` with the
 * filename untouched, so decoding is required, not optional.
 *
 * Returns null if the URL doesn't look like one of ours.
 */
export function pdfPathFromLegacyUrl(url: string): string | null {
  const marker = `/${BUCKET}/`
  const i = url.indexOf(marker)
  if (i === -1) return null

  let tail = url.slice(i + marker.length)
  const q = tail.indexOf('?')
  if (q !== -1) tail = tail.slice(0, q) // strip any download/transform query
  if (!tail) return null

  try {
    return decodeURIComponent(tail)
  } catch {
    // A literal '%' in the filename makes this invalid encoding; the raw tail
    // is then the better guess. verifyPdfPath() is what decides either way.
    return tail
  }
}

/** Confirm an object actually exists at this path before we commit to it. */
export async function verifyPdfPath(path: string): Promise<boolean> {
  const slash = path.lastIndexOf('/')
  if (slash === -1) return false
  const folder = path.slice(0, slash)
  const base = path.slice(slash + 1)

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .list(folder, { limit: 100, search: base })
  if (error || !data) return false
  return data.some((f) => f.name === base)
}

export interface PdfBackfillResult {
  /** Rows that now have a verified pdf_path. */
  migrated: number
  /** Rows whose legacy URL could not be resolved to a real object. */
  unresolved: { id: string; label: string }[]
}

/**
 * One-time repair: give every legacy row a verified pdf_path.
 *
 * Runs on Wallet load and is a no-op once done. Deliberately verifies each
 * derived path against Storage rather than trusting the string transform —
 * a wrong path would look like a working button that fails on tap.
 */
export async function backfillReservationPdfPaths(
  rows: Reservation[]
): Promise<PdfBackfillResult> {
  const pending = rows.filter((r) => !r.pdf_path && r.pdf_url)
  const result: PdfBackfillResult = { migrated: 0, unresolved: [] }
  if (!pending.length) return result
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return result

  for (const res of pending) {
    const label = res.title || res.provider || 'Reservation'
    const path = pdfPathFromLegacyUrl(res.pdf_url!)
    if (!path || !(await verifyPdfPath(path))) {
      result.unresolved.push({ id: res.id, label })
      continue
    }
    const { error } = await supabase
      .from('reservations')
      .update({ pdf_path: path })
      .eq('id', res.id)
    if (error) result.unresolved.push({ id: res.id, label })
    else result.migrated++
  }
  return result
}
