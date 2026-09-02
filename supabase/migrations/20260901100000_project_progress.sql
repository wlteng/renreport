-- Project to-do items and achievement milestones.
CREATE TABLE public.project_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  assignee_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  due_date DATE,
  is_completed BOOLEAN NOT NULL DEFAULT false,
  completed_at TIMESTAMPTZ,
  created_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT project_tasks_title_check CHECK (
    title = btrim(title) AND char_length(title) BETWEEN 1 AND 160
  ),
  CONSTRAINT project_tasks_description_check CHECK (
    description IS NULL OR char_length(description) <= 2000
  ),
  CONSTRAINT project_tasks_completion_check CHECK (
    (is_completed AND completed_at IS NOT NULL)
    OR (NOT is_completed AND completed_at IS NULL)
  )
);

CREATE TABLE public.project_milestones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  target_date DATE,
  is_achieved BOOLEAN NOT NULL DEFAULT false,
  achieved_at TIMESTAMPTZ,
  created_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT project_milestones_title_check CHECK (
    title = btrim(title) AND char_length(title) BETWEEN 1 AND 160
  ),
  CONSTRAINT project_milestones_description_check CHECK (
    description IS NULL OR char_length(description) <= 2000
  ),
  CONSTRAINT project_milestones_achievement_check CHECK (
    (is_achieved AND achieved_at IS NOT NULL)
    OR (NOT is_achieved AND achieved_at IS NULL)
  )
);

CREATE INDEX idx_project_tasks_project_due
  ON public.project_tasks (project_id, is_completed, due_date);
CREATE INDEX idx_project_tasks_assignee
  ON public.project_tasks (assignee_id, is_completed);
CREATE INDEX idx_project_milestones_project_target
  ON public.project_milestones (project_id, is_achieved, target_date);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_tasks TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_milestones TO authenticated;
GRANT ALL ON public.project_tasks, public.project_milestones TO service_role;

ALTER TABLE public.project_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_milestones ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.can_manage_project_progress(_project_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.projects project
    JOIN public.profiles actor ON actor.id = auth.uid()
    WHERE project.id = _project_id
      AND actor.is_active
      AND (
        project.owner_id = auth.uid()
        OR public.has_permission(auth.uid(), 'manage_projects')
      )
  )
$$;

REVOKE ALL ON FUNCTION public.can_manage_project_progress(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_manage_project_progress(UUID) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.set_project_task_completion()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.completed_at := CASE WHEN NEW.is_completed THEN now() ELSE NULL END;
  ELSIF NEW.is_completed AND NOT OLD.is_completed THEN
    NEW.completed_at := now();
  ELSIF NEW.is_completed AND OLD.is_completed THEN
    NEW.completed_at := OLD.completed_at;
  ELSE
    NEW.completed_at := NULL;
  END IF;

  IF TG_OP = 'UPDATE'
    AND auth.uid() IS NOT NULL
    AND NOT public.can_manage_project_progress(OLD.project_id) THEN
    IF OLD.assignee_id IS DISTINCT FROM auth.uid() THEN
      RAISE EXCEPTION 'Only the assignee or a project manager can update this task';
    END IF;
    IF NEW.id IS DISTINCT FROM OLD.id
      OR NEW.project_id IS DISTINCT FROM OLD.project_id
      OR NEW.title IS DISTINCT FROM OLD.title
      OR NEW.description IS DISTINCT FROM OLD.description
      OR NEW.assignee_id IS DISTINCT FROM OLD.assignee_id
      OR NEW.due_date IS DISTINCT FROM OLD.due_date
      OR NEW.created_by IS DISTINCT FROM OLD.created_by
      OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION 'Task assignees can only change completion status';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.set_project_task_completion() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.set_project_milestone_achievement()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.achieved_at := CASE WHEN NEW.is_achieved THEN now() ELSE NULL END;
  ELSIF NEW.is_achieved AND NOT OLD.is_achieved THEN
    NEW.achieved_at := now();
  ELSIF NEW.is_achieved AND OLD.is_achieved THEN
    NEW.achieved_at := OLD.achieved_at;
  ELSE
    NEW.achieved_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.set_project_milestone_achievement()
  FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_project_tasks_completion
BEFORE INSERT OR UPDATE ON public.project_tasks
FOR EACH ROW EXECUTE FUNCTION public.set_project_task_completion();
CREATE TRIGGER trg_project_tasks_updated
BEFORE UPDATE ON public.project_tasks
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_project_milestones_achievement
BEFORE INSERT OR UPDATE ON public.project_milestones
FOR EACH ROW EXECUTE FUNCTION public.set_project_milestone_achievement();
CREATE TRIGGER trg_project_milestones_updated
BEFORE UPDATE ON public.project_milestones
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE POLICY project_tasks_read ON public.project_tasks
FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id));

CREATE POLICY project_tasks_insert ON public.project_tasks
FOR INSERT TO authenticated
WITH CHECK (
  created_by = auth.uid()
  AND public.can_manage_project_progress(project_id)
);

CREATE POLICY project_tasks_update_manager ON public.project_tasks
FOR UPDATE TO authenticated
USING (public.can_manage_project_progress(project_id))
WITH CHECK (public.can_manage_project_progress(project_id));

CREATE POLICY project_tasks_update_assignee ON public.project_tasks
FOR UPDATE TO authenticated
USING (assignee_id = auth.uid())
WITH CHECK (assignee_id = auth.uid());

CREATE POLICY project_tasks_delete ON public.project_tasks
FOR DELETE TO authenticated
USING (public.can_manage_project_progress(project_id));

CREATE POLICY project_milestones_read ON public.project_milestones
FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id));

CREATE POLICY project_milestones_insert ON public.project_milestones
FOR INSERT TO authenticated
WITH CHECK (
  created_by = auth.uid()
  AND public.can_manage_project_progress(project_id)
);

CREATE POLICY project_milestones_update ON public.project_milestones
FOR UPDATE TO authenticated
USING (public.can_manage_project_progress(project_id))
WITH CHECK (public.can_manage_project_progress(project_id));

CREATE POLICY project_milestones_delete ON public.project_milestones
FOR DELETE TO authenticated
USING (public.can_manage_project_progress(project_id));
