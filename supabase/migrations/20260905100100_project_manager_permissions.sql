-- Managers create their own projects and fully edit the ones they own.
-- General managers keep the previous manager behaviour (see all projects, staff feed, expenses).

INSERT INTO public.permissions (key, label, description)
VALUES (
  'manage_own_projects',
  'Manage own projects',
  'Create projects and fully edit the projects they own, including tasks, milestones and staff assignments.'
)
ON CONFLICT (key) DO UPDATE SET label = EXCLUDED.label, description = EXCLUDED.description;

-- Matrix rows for the new role and the new capability. Existing rows are left as they are.
INSERT INTO public.role_permissions (role, permission_key, enabled)
SELECT
  role_value,
  permission.key,
  CASE
    WHEN role_value = 'admin' THEN true
    WHEN role_value = 'boss' AND permission.key = 'manage_own_projects' THEN true
    WHEN role_value = 'manager'
      AND permission.key IN ('manage_own_projects', 'submit_work', 'submit_expenses') THEN true
    ELSE false
  END
FROM unnest(enum_range(NULL::public.app_role)) AS role_value
CROSS JOIN public.permissions AS permission
ON CONFLICT (role, permission_key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.is_project_owner(_user_id UUID, _project_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.projects AS project
    WHERE project.id = _project_id AND project.owner_id = _user_id
  )
$$;
REVOKE ALL ON FUNCTION public.is_project_owner(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_project_owner(UUID, UUID) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.can_manage_project(_project_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.projects AS project
    JOIN public.profiles AS actor ON actor.id = auth.uid()
    WHERE project.id = _project_id
      AND actor.is_active
      AND (
        public.has_permission(auth.uid(), 'manage_projects')
        OR (
          project.owner_id = auth.uid()
          AND public.has_permission(auth.uid(), 'manage_own_projects')
        )
      )
  )
$$;
REVOKE ALL ON FUNCTION public.can_manage_project(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_manage_project(UUID) TO authenticated, service_role;

COMMENT ON FUNCTION public.can_manage_project(UUID) IS
  'Project managers with manage_projects edit any project; managers with manage_own_projects edit the projects they own.';

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
          ARRAY['admin', 'boss', 'general_manager']::public.app_role[]
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

COMMENT ON FUNCTION public.can_view_project(UUID, UUID) IS
  'Admins, bosses and general managers see all projects; managers and staff see projects they own or are assigned to.';

CREATE OR REPLACE FUNCTION public.can_view_reports_of(_author UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    _author = auth.uid()
    OR public.has_any_role(auth.uid(), ARRAY['admin','boss']::public.app_role[])
    OR (
      public.has_role(auth.uid(), 'general_manager')
      AND public.user_department(_author) IS NOT NULL
      AND public.user_department(_author) = public.my_department()
    )
$$;

DROP POLICY IF EXISTS projects_insert_manage ON public.projects;
CREATE POLICY projects_insert_manage ON public.projects
FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_active)
  AND (
    public.has_permission(auth.uid(), 'manage_projects')
    OR (public.has_permission(auth.uid(), 'manage_own_projects') AND owner_id = auth.uid())
  )
);

DROP POLICY IF EXISTS projects_update_manage ON public.projects;
CREATE POLICY projects_update_manage ON public.projects
FOR UPDATE TO authenticated
USING (public.can_manage_project(id))
WITH CHECK (public.can_manage_project(id));

-- Project owners see the work logs and expenses recorded on their projects.
DROP POLICY IF EXISTS reports_read_feed ON public.reports;
CREATE POLICY reports_read_feed ON public.reports
FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR (
    public.has_permission(auth.uid(), 'view_staff_feed')
    AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_active)
  )
  OR (project_id IS NOT NULL AND public.is_project_owner(auth.uid(), project_id))
);

DROP POLICY IF EXISTS expenses_read ON public.expenses;
CREATE POLICY expenses_read ON public.expenses
FOR SELECT TO authenticated
USING (
  submitted_by = auth.uid()
  OR public.has_permission(auth.uid(), 'view_expenses')
  OR public.is_project_owner(auth.uid(), project_id)
);
