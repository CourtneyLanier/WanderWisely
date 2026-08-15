// Recovering a storage path from a legacy public URL is the one step of the
// pdf_url → pdf_path migration that can silently produce a plausible-but-wrong
// answer, so it's pinned here. The real backfill also verifies each result
// against Storage before committing it (see backfillReservationPdfPaths).

import { describe, it, expect, beforeAll, vi } from 'vitest'

let pdfPathFromLegacyUrl: (url: string) => string | null

beforeAll(async () => {
  // The module pulls in the Supabase client, which throws without these.
  vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co')
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'test-anon-key')
  ;({ pdfPathFromLegacyUrl } = await import('@/lib/reservationPdfs'))
})

const BASE = 'https://example.supabase.co/storage/v1/object/public/reservation-pdfs'
const UID = '11111111-2222-3333-4444-555555555555'

describe('pdfPathFromLegacyUrl', () => {
  it('pulls the path out of a plain URL', () => {
    expect(pdfPathFromLegacyUrl(`${BASE}/${UID}/1712345678_0_confirmation.pdf`))
      .toBe(`${UID}/1712345678_0_confirmation.pdf`)
  })

  // getPublicUrl() ran the whole URL through encodeURI(); the object key itself
  // has the raw space. Downloaded confirmations very often have spaces.
  it('decodes a percent-encoded space back to the real object key', () => {
    expect(pdfPathFromLegacyUrl(`${BASE}/${UID}/1712345678_0_Marriott%20Confirmation.pdf`))
      .toBe(`${UID}/1712345678_0_Marriott Confirmation.pdf`)
  })

  it('decodes multi-byte characters', () => {
    expect(pdfPathFromLegacyUrl(`${BASE}/${UID}/caf%C3%A9.pdf`))
      .toBe(`${UID}/café.pdf`)
  })

  it('leaves characters encodeURI never escaped alone', () => {
    expect(pdfPathFromLegacyUrl(`${BASE}/${UID}/a,b&c=d+e.pdf`))
      .toBe(`${UID}/a,b&c=d+e.pdf`)
  })

  it('strips a download/transform query string', () => {
    expect(pdfPathFromLegacyUrl(`${BASE}/${UID}/file.pdf?download=true`))
      .toBe(`${UID}/file.pdf`)
  })

  it('falls back to the raw tail when the encoding is invalid', () => {
    // A literal '%' in a filename makes decodeURIComponent throw; the raw tail
    // is the better guess, and verifyPdfPath() is what settles it either way.
    expect(pdfPathFromLegacyUrl(`${BASE}/${UID}/100%_refund.pdf`))
      .toBe(`${UID}/100%_refund.pdf`)
  })

  it('returns null for a URL from some other bucket', () => {
    expect(pdfPathFromLegacyUrl(
      'https://example.supabase.co/storage/v1/object/public/trip-documents/x/y.pdf'
    )).toBeNull()
  })

  it('returns null when there is no path after the bucket', () => {
    expect(pdfPathFromLegacyUrl(`${BASE}/`)).toBeNull()
  })
})
