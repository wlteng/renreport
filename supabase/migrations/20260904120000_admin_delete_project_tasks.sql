-- To-do deletion is intentionally reserved for active administrators.
DROP POLICY IF EXISTS project_tasks_delete ON public.project_tasks;
DROP POLICY IF EXISTS project_tasks_delete_admin ON public.project_tasks;

CREATE POLICY project_tasks_delete_admin ON public.project_tasks
FOR DELETE
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  AND EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE profiles.id = auth.uid()
      AND profiles.is_active
  )
);

COMMENT ON POLICY project_tasks_delete_admin ON public.project_tasks IS
  'Only active administrators may permanently delete project to-do items.';
