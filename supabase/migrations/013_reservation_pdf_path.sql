-- WanderWisely — Migration 013: Store the storage PATH of a reservation PDF
-- Run in Supabase SQL Editor (Dashboard > SQL Editor > New Query).
--
-- Why: 'reservation-pdfs' is a PRIVATE bucket (see 002), but the app was
-- storing a getPublicUrl() string in pdf_url. That URL carries no auth, so it
-- only ever worked while the bucket was (incorrectly) public — which also made
-- every confirmation document world-readable to anyone holding the link.
--
-- The fix mirrors trip_documents (008): store the storage path and download
-- through the authenticated client, rendering in the in-app viewer.
--
-- pdf_url is intentionally LEFT IN PLACE. The app backfills pdf_path from it on
-- first load of the Wallet (decoding the percent-encoding getPublicUrl applied)
-- and verifies each derived path against Storage before writing it. Drop the
-- column only once every row shows a pdf_path.

-- ============================================================
-- COLUMNS
-- ============================================================

ALTER TABLE reservations ADD COLUMN IF NOT EXISTS pdf_path text;

COMMENT ON COLUMN reservations.pdf_path IS
  'Path within the private reservation-pdfs bucket, e.g. "<uid>/1712345678_0_confirmation.pdf". Download via the authenticated client; never build a public URL from it.';

COMMENT ON COLUMN reservations.pdf_url IS
  'DEPRECATED (013): legacy public URL from a time when the bucket was public. Kept only as the backfill source for pdf_path. Do not read for display.';
