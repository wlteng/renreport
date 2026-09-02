ALTER TYPE public.report_type ADD VALUE IF NOT EXISTS 'normal_activity';

ALTER TABLE public.reports
  ADD COLUMN IF NOT EXISTS report_time TIME NOT NULL DEFAULT (LOCALTIME(0)),
  ADD COLUMN IF NOT EXISTS activity_detail TEXT;

ALTER TABLE public.reports
  DROP CONSTRAINT IF EXISTS reports_activity_detail_check;

ALTER TABLE public.reports
  ADD CONSTRAINT reports_activity_detail_check CHECK (
    activity_detail IS NULL
    OR (
      activity_detail = btrim(activity_detail)
      AND char_length(activity_detail) BETWEEN 1 AND 500
    )
  );

COMMENT ON COLUMN public.reports.report_time IS 'Local time when the reported activity occurred.';
COMMENT ON COLUMN public.reports.activity_detail IS 'Optional activity-specific context collected from the work-log form.';
