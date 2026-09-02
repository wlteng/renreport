-- Work logs can be edited or deleted for one hour after submission. After that
-- the author submits a new work log that supersedes the old one; the old log
-- stays as history on the corrected entry.

ALTER TABLE public.reports
  ADD COLUMN supersedes_report_id UUID REFERENCES public.reports(id) ON DELETE SET NULL,
  ADD CONSTRAINT reports_supersedes_not_self CHECK (
    supersedes_report_id IS NULL OR supersedes_report_id <> id
  );

CREATE UNIQUE INDEX reports_supersedes_report_id_key
  ON public.reports (supersedes_report_id)
  WHERE supersedes_report_id IS NOT NULL;

COMMENT ON COLUMN public.reports.supersedes_report_id IS
  'Earlier work log that this submission corrects. The earlier log stays as history.';

CREATE OR REPLACE FUNCTION public.report_edit_window()
RETURNS INTERVAL
LANGUAGE SQL
IMMUTABLE
AS $$
  SELECT INTERVAL '1 hour'
$$;

COMMENT ON FUNCTION public.report_edit_window() IS
  'How long after submission a work log may still be edited or deleted by its author.';

CREATE OR REPLACE FUNCTION public.can_correct_report(_user_id UUID, _report_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.reports AS prior
    WHERE prior.id = _report_id
      AND prior.user_id = _user_id
  )
$$;

REVOKE ALL ON FUNCTION public.can_correct_report(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_correct_report(UUID, UUID) TO authenticated, service_role;

COMMENT ON FUNCTION public.can_correct_report(UUID, UUID) IS
  'Only the author of a work log may submit a correction that supersedes it.';

-- Authors cannot move the edit window or re-point a correction after the fact.
CREATE OR REPLACE FUNCTION public.protect_report_immutable_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.created_at := OLD.created_at;
  NEW.user_id := OLD.user_id;
  NEW.supersedes_report_id := OLD.supersedes_report_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_reports_immutable_fields ON public.reports;
CREATE TRIGGER trg_reports_immutable_fields
  BEFORE UPDATE ON public.reports
  FOR EACH ROW EXECUTE FUNCTION public.protect_report_immutable_fields();

DROP POLICY IF EXISTS reports_insert_work ON public.reports;
CREATE POLICY reports_insert_work ON public.reports
FOR INSERT TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND project_id IS NOT NULL
  AND public.has_permission(auth.uid(), 'submit_work')
  AND EXISTS (
    SELECT 1 FROM public.profiles profile
    WHERE profile.id = auth.uid() AND profile.is_active
  )
  AND EXISTS (
    SELECT 1 FROM public.projects project
    WHERE project.id = reports.project_id AND project.status = 'active'
  )
  AND public.is_project_member(auth.uid(), reports.project_id)
  AND (
    reports.supersedes_report_id IS NULL
    OR public.can_correct_report(auth.uid(), reports.supersedes_report_id)
  )
);

DROP POLICY IF EXISTS reports_update_work ON public.reports;
CREATE POLICY reports_update_work ON public.reports
FOR UPDATE TO authenticated
USING (
  user_id = auth.uid()
  AND project_id IS NOT NULL
  AND public.has_permission(auth.uid(), 'submit_work')
  AND EXISTS (
    SELECT 1 FROM public.profiles profile
    WHERE profile.id = auth.uid() AND profile.is_active
  )
  AND public.is_project_member(auth.uid(), reports.project_id)
  AND reports.created_at > now() - public.report_edit_window()
)
WITH CHECK (
  user_id = auth.uid()
  AND project_id IS NOT NULL
  AND public.has_permission(auth.uid(), 'submit_work')
  AND EXISTS (
    SELECT 1 FROM public.profiles profile
    WHERE profile.id = auth.uid() AND profile.is_active
  )
  AND EXISTS (
    SELECT 1 FROM public.projects project
    WHERE project.id = reports.project_id AND project.status = 'active'
  )
  AND public.is_project_member(auth.uid(), reports.project_id)
);

DROP POLICY IF EXISTS reports_delete_work ON public.reports;
CREATE POLICY reports_delete_work ON public.reports
FOR DELETE TO authenticated
USING (
  user_id = auth.uid()
  AND public.has_permission(auth.uid(), 'submit_work')
  AND EXISTS (
    SELECT 1 FROM public.profiles profile
    WHERE profile.id = auth.uid() AND profile.is_active
  )
  AND reports.created_at > now() - public.report_edit_window()
);
