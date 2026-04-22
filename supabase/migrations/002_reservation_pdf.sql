-- Add pdf_url to reservations for storing uploaded confirmation PDFs
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS pdf_url text;

-- Storage bucket for reservation PDFs
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'reservation-pdfs',
  'reservation-pdfs',
  false,
  10485760, -- 10 MB
  ARRAY['application/pdf']
)
ON CONFLICT (id) DO NOTHING;

-- Owner can upload PDFs into their own folder (folder = user uid)
CREATE POLICY "Owner upload reservation PDFs"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'reservation-pdfs'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Owner can read their own PDFs
CREATE POLICY "Owner read reservation PDFs"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'reservation-pdfs'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Owner can delete their own PDFs
CREATE POLICY "Owner delete reservation PDFs"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'reservation-pdfs'
  AND (storage.foldername(name))[1] = auth.uid()::text
);
