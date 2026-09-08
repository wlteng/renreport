-- Work logs can carry short videos next to photos. Videos are stored in the
-- same per-report folder as photos, so the existing storage policies and the
-- delete-record function already cover them. Only a WebP poster frame is
-- generated in the browser; the video keeps the phone's own MP4/WebM encoding.

ALTER TABLE public.reports
  ADD COLUMN IF NOT EXISTS video_urls text[];

ALTER TABLE public.reports DROP CONSTRAINT IF EXISTS reports_video_urls_check;
ALTER TABLE public.reports ADD CONSTRAINT reports_video_urls_check CHECK (
  video_urls IS NULL OR cardinality(video_urls) BETWEEN 1 AND 2
);

-- The bucket accepts videos up to 50 MB; photos stay small because the browser
-- compresses them before upload.
UPDATE storage.buckets
SET allowed_mime_types = ARRAY[
      'image/jpeg', 'image/png', 'image/webp',
      'video/mp4', 'video/webm', 'video/quicktime'
    ],
    file_size_limit = 52428800
WHERE id = 'report-images';
