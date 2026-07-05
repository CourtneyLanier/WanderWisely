-- WanderWisely — Migration 008: Uploadable files on trip documents
-- Lets a document carry an attached file (PDF or image, e.g. offline maps).
-- Run in Supabase SQL Editor (Dashboard > SQL Editor > New Query).

-- ============================================================
-- COLUMNS  (file metadata; the bytes live in Storage + the client's IndexedDB)
-- ============================================================

ALTER TABLE trip_documents ADD COLUMN IF NOT EXISTS file_path text;
ALTER TABLE trip_documents ADD COLUMN IF NOT EXISTS file_name text;
ALTER TABLE trip_documents ADD COLUMN IF NOT EXISTS file_type text;   -- mime type
ALTER TABLE trip_documents ADD COLUMN IF NOT EXISTS file_size int;    -- bytes

-- ============================================================
-- STORAGE BUCKET  (private; PDFs + common image formats, up to 25 MB)
-- ============================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'trip-documents',
  'trip-documents',
  false,
  26214400, -- 25 MB
  ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- Owner can upload files into their own folder (folder = user uid)
CREATE POLICY "Owner upload trip documents"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'trip-documents'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Owner can read their own files
CREATE POLICY "Owner read trip documents"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'trip-documents'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Owner can delete their own files
CREATE POLICY "Owner delete trip documents"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'trip-documents'
  AND (storage.foldername(name))[1] = auth.uid()::text
);
