-- Deleting a project removes everything recorded under it; only admins may do it.
-- Photos in the report-images bucket are removed by the delete-record edge function.
ALTER TABLE public.reports DROP CONSTRAINT reports_project_id_fkey;
ALTER TABLE public.reports
  ADD CONSTRAINT reports_project_id_fkey
  FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;

ALTER TABLE public.expenses DROP CONSTRAINT expenses_project_id_fkey;
ALTER TABLE public.expenses
  ADD CONSTRAINT expenses_project_id_fkey
  FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;

DROP POLICY IF EXISTS projects_manage ON public.projects;

CREATE POLICY projects_insert_manage ON public.projects
FOR INSERT TO authenticated
WITH CHECK (
  public.has_permission(auth.uid(), 'manage_projects')
  AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_active)
);

CREATE POLICY projects_update_manage ON public.projects
FOR UPDATE TO authenticated
USING (
  public.has_permission(auth.uid(), 'manage_projects')
  AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_active)
)
WITH CHECK (
  public.has_permission(auth.uid(), 'manage_projects')
  AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_active)
);

CREATE POLICY projects_delete_admin ON public.projects
FOR DELETE TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_active)
);

COMMENT ON POLICY projects_delete_admin ON public.projects IS
  'Only admins delete projects. Work logs, expenses, tasks, milestones, members and git events cascade.';
