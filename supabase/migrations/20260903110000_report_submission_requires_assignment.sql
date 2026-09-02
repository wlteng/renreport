CREATE OR REPLACE FUNCTION public.is_project_member(_user_id UUID, _project_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.project_members AS membership
    WHERE membership.project_id = _project_id
      AND membership.user_id = _user_id
  )
$$;

REVOKE ALL ON FUNCTION public.is_project_member(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_project_member(UUID, UUID) TO authenticated, service_role;

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

COMMENT ON FUNCTION public.is_project_member(UUID, UUID) IS
  'Checks direct project assignment. Every role, including admin, must be assigned before submitting work.';
