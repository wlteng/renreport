CREATE OR REPLACE FUNCTION public.protect_project_owner()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.owner_id IS NULL THEN
      NEW.owner_id := auth.uid();
    ELSIF NEW.owner_id <> auth.uid() AND NOT public.has_role(auth.uid(), 'admin') THEN
      RAISE EXCEPTION 'A project creator cannot assign a different owner';
    END IF;
  ELSIF NEW.owner_id IS DISTINCT FROM OLD.owner_id
    AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only an admin can transfer project ownership';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_projects_set_owner ON public.projects;
CREATE TRIGGER trg_projects_set_owner
BEFORE INSERT ON public.projects
FOR EACH ROW EXECUTE FUNCTION public.protect_project_owner();

DROP TRIGGER IF EXISTS trg_projects_protect_owner ON public.projects;
CREATE TRIGGER trg_projects_protect_owner
BEFORE UPDATE OF owner_id ON public.projects
FOR EACH ROW EXECUTE FUNCTION public.protect_project_owner();

DROP POLICY IF EXISTS project_members_manage ON public.project_members;
CREATE POLICY project_members_manage ON public.project_members
FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.projects AS project
    WHERE project.id = project_members.project_id
      AND (
        project.owner_id = auth.uid()
        OR public.has_role(auth.uid(), 'admin')
      )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.projects AS project
    WHERE project.id = project_members.project_id
      AND (
        project.owner_id = auth.uid()
        OR public.has_role(auth.uid(), 'admin')
      )
  )
);

COMMENT ON POLICY project_members_manage ON public.project_members IS
  'Only the project creator or an admin can assign and remove project staff.';
