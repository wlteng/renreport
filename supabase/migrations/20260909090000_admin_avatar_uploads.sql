-- Let admins upload profile photos for staff while keeping every object inside
-- the selected profile owner's folder. Existing self-upload behavior remains.
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS avatar_path TEXT;

UPDATE storage.buckets
SET file_size_limit = 5242880
WHERE id = 'avatars';

DROP POLICY IF EXISTS avatars_insert ON storage.objects;

CREATE POLICY avatars_insert ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'avatars'
  AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      AND EXISTS (
        SELECT 1
        FROM public.profiles AS profile
        WHERE profile.id::text = (storage.foldername(name))[1]
      )
    )
  )
);
