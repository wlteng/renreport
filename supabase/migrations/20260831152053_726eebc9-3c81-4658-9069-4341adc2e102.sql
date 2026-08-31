ALTER TABLE public.profiles
ADD COLUMN resume TEXT,
ADD CONSTRAINT profiles_resume_length
CHECK (resume IS NULL OR char_length(resume) BETWEEN 1 AND 5000);

COMMENT ON COLUMN public.profiles.resume IS
  'Staff employment history, mining experience, qualifications, and other résumé details.';