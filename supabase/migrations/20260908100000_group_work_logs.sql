-- Group work logs: an admin can submit one work log on behalf of several
-- people. participant_ids lists everyone credited with the hours; NULL keeps
-- the log personal (credited to user_id alone). The admin may leave themselves
-- out of the list, so a group log does not have to credit its author.

ALTER TABLE public.reports
  ADD COLUMN IF NOT EXISTS participant_ids uuid[];

COMMENT ON COLUMN public.reports.participant_ids IS
  'People credited with this work log. NULL means the author alone.';

ALTER TABLE public.reports DROP CONSTRAINT IF EXISTS reports_participants_check;
ALTER TABLE public.reports ADD CONSTRAINT reports_participants_check CHECK (
  participant_ids IS NULL
  OR (
    cardinality(participant_ids) BETWEEN 1 AND 50
    AND array_position(participant_ids, NULL) IS NULL
  )
);

CREATE INDEX IF NOT EXISTS idx_reports_participants
  ON public.reports USING gin (participant_ids);

-- Participants must be distinct, existing profiles.
CREATE OR REPLACE FUNCTION public.validate_report_participants()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.participant_ids IS NULL THEN
    RETURN NEW;
  END IF;
  IF (SELECT count(DISTINCT participant) FROM unnest(NEW.participant_ids) AS participant)
     <> cardinality(NEW.participant_ids) THEN
    RAISE EXCEPTION 'Each participant can be listed only once';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM unnest(NEW.participant_ids) AS participant(id)
    WHERE NOT EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = participant.id)
  ) THEN
    RAISE EXCEPTION 'Unknown participant';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_reports_participants ON public.reports;
CREATE TRIGGER trg_reports_participants
BEFORE INSERT OR UPDATE OF participant_ids ON public.reports
FOR EACH ROW EXECUTE FUNCTION public.validate_report_participants();

-- Participants can read the logs they are credited on.
DROP POLICY IF EXISTS reports_read_feed ON public.reports;
CREATE POLICY reports_read_feed ON public.reports
FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR (participant_ids IS NOT NULL AND auth.uid() = ANY (participant_ids))
  OR (
    public.has_permission(auth.uid(), 'view_staff_feed')
    AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_active)
  )
  OR (project_id IS NOT NULL AND public.is_project_owner(auth.uid(), project_id))
);

-- Only admins can submit or keep a group log; everything else is unchanged.
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
    WHERE project.id = reports.project_id
      AND project.status::text IN ('active', 'maintenance')
  )
  AND public.is_project_member(auth.uid(), reports.project_id)
  AND (
    reports.supersedes_report_id IS NULL
    OR public.can_correct_report(auth.uid(), reports.supersedes_report_id)
  )
  AND (
    reports.participant_ids IS NULL
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
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
    WHERE project.id = reports.project_id
      AND project.status::text IN ('active', 'maintenance')
  )
  AND public.is_project_member(auth.uid(), reports.project_id)
  AND (
    reports.participant_ids IS NULL
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  )
);
