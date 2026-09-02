CREATE OR REPLACE FUNCTION public.can_view_project(_user_id UUID, _project_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.projects AS project
    WHERE project.id = _project_id
      AND (
        project.owner_id = _user_id
        OR public.has_any_role(
          _user_id,
          ARRAY['admin', 'boss', 'manager']::public.app_role[]
        )
        OR EXISTS (
          SELECT 1
          FROM public.project_members AS membership
          WHERE membership.project_id = project.id
            AND membership.user_id = _user_id
        )
      )
  )
$$;

REVOKE ALL ON FUNCTION public.can_view_project(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_view_project(UUID, UUID) TO authenticated, service_role;

DROP POLICY IF EXISTS projects_read ON public.projects;
DROP POLICY IF EXISTS projects_read_scoped ON public.projects;
CREATE POLICY projects_read_scoped ON public.projects
FOR SELECT TO authenticated
USING (public.can_view_project(auth.uid(), id));

DROP POLICY IF EXISTS project_members_read ON public.project_members;
DROP POLICY IF EXISTS project_members_read_scoped ON public.project_members;
CREATE POLICY project_members_read_scoped ON public.project_members
FOR SELECT TO authenticated
USING (public.can_view_project(auth.uid(), project_id));

COMMENT ON FUNCTION public.can_view_project(UUID, UUID) IS
  'Managers see all projects; staff only see projects assigned to them.';
