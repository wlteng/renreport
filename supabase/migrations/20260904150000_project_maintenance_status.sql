-- Maintenance means the first release is complete while upgrades continue.
-- Unlike completed projects, maintenance projects still accept work and expenses.
ALTER TYPE public.project_status ADD VALUE IF NOT EXISTS 'maintenance' AFTER 'active';

DROP POLICY IF EXISTS expenses_insert_own ON public.expenses;
CREATE POLICY expenses_insert_own ON public.expenses
FOR INSERT TO authenticated
WITH CHECK (
  submitted_by = auth.uid()
  AND status IN ('draft', 'submitted')
  AND reviewed_by IS NULL
  AND reviewed_at IS NULL
  AND public.has_permission(auth.uid(), 'submit_expenses')
  AND EXISTS (
    SELECT 1 FROM public.profiles profile
    WHERE profile.id = auth.uid() AND profile.is_active
  )
  AND EXISTS (
    SELECT 1 FROM public.projects project
    WHERE project.id = expenses.project_id
      AND project.status::text IN ('active', 'maintenance')
  )
);

DROP POLICY IF EXISTS expenses_update_own ON public.expenses;
CREATE POLICY expenses_update_own ON public.expenses
FOR UPDATE TO authenticated
USING (
  submitted_by = auth.uid()
  AND status IN ('draft', 'submitted')
  AND public.has_permission(auth.uid(), 'submit_expenses')
  AND EXISTS (
    SELECT 1 FROM public.profiles profile
    WHERE profile.id = auth.uid() AND profile.is_active
  )
)
WITH CHECK (
  submitted_by = auth.uid()
  AND status IN ('draft', 'submitted')
  AND reviewed_by IS NULL
  AND reviewed_at IS NULL
  AND public.has_permission(auth.uid(), 'submit_expenses')
  AND EXISTS (
    SELECT 1 FROM public.profiles profile
    WHERE profile.id = auth.uid() AND profile.is_active
  )
  AND EXISTS (
    SELECT 1 FROM public.projects project
    WHERE project.id = expenses.project_id
      AND project.status::text IN ('active', 'maintenance')
  )
);

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
);
