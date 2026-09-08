-- A username is what staff sign in with, so two accounts must never share one.
-- Renaming from the admin panel checks this too; the index makes it certain.
CREATE UNIQUE INDEX IF NOT EXISTS profiles_username_unique
  ON public.profiles (username)
  WHERE username IS NOT NULL;
