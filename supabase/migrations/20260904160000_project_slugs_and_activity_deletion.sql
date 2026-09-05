-- Give every project a stable, readable URL key and keep it immutable after creation.
ALTER TABLE public.projects ADD COLUMN slug TEXT;

CREATE OR REPLACE FUNCTION public.project_slug_base(value TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path = ''
AS $$
  SELECT left(
    trim(BOTH '-' FROM regexp_replace(lower(value), '[^[:alnum:]]+', '-', 'g')),
    80
  );
$$;

UPDATE public.projects
SET slug = concat(
  COALESCE(
    NULLIF(public.project_slug_base(COALESCE(NULLIF(btrim(project_code), ''), name)), ''),
    'project'
  ),
  '-',
  substring(id::text FROM 1 FOR 8)
);

ALTER TABLE public.projects
  ALTER COLUMN slug SET NOT NULL,
  ADD CONSTRAINT projects_slug_unique UNIQUE (slug),
  ADD CONSTRAINT projects_slug_format CHECK (
    slug = btrim(slug)
    AND char_length(slug) BETWEEN 3 AND 100
    AND slug !~ '^-|-$'
  );

CREATE OR REPLACE FUNCTION public.set_project_slug()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  base TEXT;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    NEW.slug := OLD.slug;
    RETURN NEW;
  END IF;

  base := public.project_slug_base(COALESCE(NULLIF(btrim(NEW.project_code), ''), NEW.name));
  NEW.slug := concat(COALESCE(NULLIF(base, ''), 'project'), '-', substring(NEW.id::text FROM 1 FOR 8));
  RETURN NEW;
END;
$$;

CREATE TRIGGER projects_set_slug
BEFORE INSERT OR UPDATE OF slug ON public.projects
FOR EACH ROW EXECUTE FUNCTION public.set_project_slug();

COMMENT ON COLUMN public.projects.slug IS
  'Immutable, human-readable project key used in application URLs.';

-- Synced GitHub events use a tombstone so a deleted item is not imported again.
ALTER TABLE public.project_git_events
  ADD COLUMN deleted_at TIMESTAMPTZ,
  ADD COLUMN deleted_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX idx_project_git_events_visible
  ON public.project_git_events (project_id, occurred_at DESC)
  WHERE deleted_at IS NULL;

COMMENT ON COLUMN public.project_git_events.deleted_at IS
  'Admin removal marker. Retained to prevent the sync job from recreating the event.';
