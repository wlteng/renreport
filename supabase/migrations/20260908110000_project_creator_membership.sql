-- Whoever creates a project, and whoever owns it, is assigned to it
-- automatically, so they can submit work and expenses on it without an
-- extra assignment step. Runs as definer because the creator may not hold
-- the project_members manage policy.

CREATE OR REPLACE FUNCTION public.assign_project_principals()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  creator uuid := auth.uid();
BEGIN
  IF TG_OP = 'INSERT'
     AND creator IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.profiles WHERE id = creator) THEN
    INSERT INTO public.project_members (project_id, user_id)
    VALUES (NEW.id, creator)
    ON CONFLICT (project_id, user_id) DO NOTHING;
  END IF;

  IF NEW.owner_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.owner_id IS DISTINCT FROM OLD.owner_id)
     AND EXISTS (SELECT 1 FROM public.profiles WHERE id = NEW.owner_id) THEN
    INSERT INTO public.project_members (project_id, user_id)
    VALUES (NEW.id, NEW.owner_id)
    ON CONFLICT (project_id, user_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_projects_assign_principals ON public.projects;
CREATE TRIGGER trg_projects_assign_principals
AFTER INSERT OR UPDATE OF owner_id ON public.projects
FOR EACH ROW EXECUTE FUNCTION public.assign_project_principals();

-- Existing projects: make sure every owner is on their project.
INSERT INTO public.project_members (project_id, user_id)
SELECT project.id, project.owner_id
FROM public.projects AS project
WHERE project.owner_id IS NOT NULL
ON CONFLICT (project_id, user_id) DO NOTHING;
