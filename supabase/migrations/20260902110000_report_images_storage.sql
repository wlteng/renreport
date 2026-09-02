INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'report-images',
  'report-images',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS report_images_read ON storage.objects;
DROP POLICY IF EXISTS report_images_insert ON storage.objects;
DROP POLICY IF EXISTS report_images_delete ON storage.objects;

CREATE POLICY report_images_read ON storage.objects
FOR SELECT TO authenticated
USING (bucket_id = 'report-images');

CREATE POLICY report_images_insert ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'report-images'
  AND (storage.foldername(name))[1] = auth.uid()::text
  AND public.has_permission(auth.uid(), 'submit_work')
);

CREATE POLICY report_images_delete ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'report-images'
  AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR public.has_role(auth.uid(), 'admin')
  )
);
