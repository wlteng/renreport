-- Multi-day work logs and admin-only staff notes.
--
-- 1. A site visit can run for several days, so a work log may record more than
--    24 hours. The cap becomes 744 hours (31 days), the longest month.
-- 2. Admins keep a private note on each staff member. Only admins can read it.

ALTER TABLE public.reports DROP CONSTRAINT IF EXISTS reports_hours_spent_check;
ALTER TABLE public.reports
  ALTER COLUMN hours_spent TYPE NUMERIC(6, 2),
  ADD CONSTRAINT reports_hours_spent_check
    CHECK (hours_spent >= 0 AND hours_spent <= 744);

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS admin_notes TEXT;

-- The directory gains the note, blanked for everyone except admins.
DROP FUNCTION IF EXISTS public.people_directory();
CREATE FUNCTION public.people_directory()
RETURNS TABLE (
  id UUID,
  email TEXT,
  full_name TEXT,
  avatar_url TEXT,
  job_title TEXT,
  resume TEXT,
  admin_notes TEXT,
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
    CASE
      WHEN public.has_role(auth.uid(), 'admin'::public.app_role)
      THEN profile.admin_notes
      ELSE NULL
    END AS admin_notes,
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
