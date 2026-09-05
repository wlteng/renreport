-- Give profiles a real username column.
--
-- Until now a username only existed encoded inside a synthetic login address,
-- '<username>@staff.renreport.invalid', so it could never be changed and was
-- not queryable. This stores it properly while keeping account emails private.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS username TEXT;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_username_format;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_username_format CHECK (
    username IS NULL
    OR username ~ '^[a-z0-9][a-z0-9_-]{2,31}$'
  );

-- Case-insensitive uniqueness; NULL usernames stay unconstrained.
DROP INDEX IF EXISTS public.idx_profiles_username_unique;
CREATE UNIQUE INDEX idx_profiles_username_unique
  ON public.profiles (lower(username))
  WHERE username IS NOT NULL;

COMMENT ON COLUMN public.profiles.username IS
  'Short login handle. Immutable for the account holder; only an admin may change it.';

-- Backfill from the existing synthetic staff addresses.
UPDATE public.profiles
SET username = split_part(email, '@', 1)
WHERE username IS NULL
  AND email LIKE '%@staff.renreport.invalid'
  AND split_part(email, '@', 1) ~ '^[a-z0-9][a-z0-9_-]{2,31}$';

-- New accounts carry their username through auth metadata.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  role_count INTEGER;
  assigned public.app_role;
  requested_username TEXT;
BEGIN
  requested_username := lower(nullif(btrim(NEW.raw_user_meta_data->>'username'), ''));
  IF requested_username IS NOT NULL
     AND requested_username !~ '^[a-z0-9][a-z0-9_-]{2,31}$' THEN
    requested_username := NULL;
  END IF;

  INSERT INTO public.profiles (id, email, full_name, username)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name'),
    requested_username
  )
  ON CONFLICT (id) DO NOTHING;

  SELECT count(*) INTO role_count FROM public.user_roles;
  assigned := CASE WHEN role_count = 0 THEN 'admin'::public.app_role ELSE 'staff'::public.app_role END;

  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, assigned)
  ON CONFLICT (user_id, role) DO NOTHING;

  INSERT INTO public.staff_compensation (user_id) VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$;

-- A username is an identity, not a preference: only an admin may reassign one.
CREATE OR REPLACE FUNCTION public.protect_username()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.username IS DISTINCT FROM OLD.username
     AND auth.uid() IS NOT NULL
     AND NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Only an admin can change a username';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_protect_username ON public.profiles;
CREATE TRIGGER profiles_protect_username
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_username();

-- Sign-in needs to turn a username into the address Supabase Auth expects,
-- before any session exists. Only synthetic staff addresses are ever returned,
-- so this cannot be used to harvest real email addresses.
CREATE OR REPLACE FUNCTION public.login_email_for_username(p_username TEXT)
RETURNS TEXT
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT profile.email
  FROM public.profiles AS profile
  WHERE lower(profile.username) = lower(btrim(p_username))
    AND profile.email LIKE '%@staff.renreport.invalid'
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.login_email_for_username(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.login_email_for_username(TEXT) TO anon, authenticated;

-- Expose the handle through the directory so lists can show it.
DROP FUNCTION IF EXISTS public.people_directory();
CREATE FUNCTION public.people_directory()
RETURNS TABLE (
  id UUID,
  email TEXT,
  username TEXT,
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
    profile.username,
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

-- projects.slug is NOT NULL and filled by the BEFORE INSERT trigger
-- projects_set_slug, so inserts legitimately omit it. Without a default the
-- type generator marks slug as required on Insert, which makes every generated
-- types.ts reject the project-creation code. A default keeps the column
-- NOT NULL while letting callers leave it out; the trigger still overwrites it.
ALTER TABLE public.projects ALTER COLUMN slug SET DEFAULT '';
