-- Keep account email addresses private while preserving the staff directory.
-- Admins may read every email; everyone else may read only their own email.

CREATE OR REPLACE FUNCTION public.people_directory()
RETURNS TABLE (
  id UUID,
  email TEXT,
  full_name TEXT,
  avatar_url TEXT,
  job_title TEXT,
  resume TEXT,
  department_id UUID,
  is_active BOOLEAN
)
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    profile.id,
    CASE
      WHEN profile.id = auth.uid()
        OR public.has_role(auth.uid(), 'admin'::public.app_role)
      THEN profile.email
      ELSE NULL
    END AS email,
    profile.full_name,
    profile.avatar_url,
    profile.job_title,
    profile.resume,
    profile.department_id,
    profile.is_active
  FROM public.profiles AS profile
  WHERE auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.profiles AS viewer
      WHERE viewer.id = auth.uid() AND viewer.is_active
    )
  ORDER BY profile.full_name NULLS LAST, profile.email;
$$;

REVOKE ALL ON FUNCTION public.people_directory() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.people_directory() TO authenticated;

DROP POLICY IF EXISTS profiles_read ON public.profiles;
DROP POLICY IF EXISTS profiles_read_own_or_admin ON public.profiles;
CREATE POLICY profiles_read_own_or_admin ON public.profiles
FOR SELECT TO authenticated
USING (id = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role));
