ALTER TABLE public.projects
  ADD COLUMN repository_url TEXT;

ALTER TABLE public.projects
  ADD CONSTRAINT projects_repository_url_check CHECK (
    repository_url IS NULL
    OR (
      repository_url = btrim(repository_url)
      AND char_length(repository_url) BETWEEN 1 AND 2048
    )
  );

COMMENT ON COLUMN public.projects.repository_url IS
  'Optional public GitHub repository used to import Website project commit activity.';

CREATE TABLE public.project_git_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'github',
  repository_full_name TEXT NOT NULL,
  external_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  author_name TEXT,
  event_url TEXT,
  occurred_at TIMESTAMPTZ NOT NULL,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT project_git_events_provider_check CHECK (provider = 'github'),
  CONSTRAINT project_git_events_external_id_check CHECK (
    external_id = btrim(external_id) AND char_length(external_id) BETWEEN 1 AND 160
  ),
  CONSTRAINT project_git_events_repository_check CHECK (
    repository_full_name = btrim(repository_full_name)
    AND char_length(repository_full_name) BETWEEN 3 AND 260
  ),
  CONSTRAINT project_git_events_title_check CHECK (
    title = btrim(title) AND char_length(title) BETWEEN 1 AND 500
  ),
  CONSTRAINT project_git_events_description_check CHECK (
    description IS NULL OR char_length(description) <= 10000
  ),
  UNIQUE (project_id, provider, external_id)
);

CREATE INDEX idx_project_git_events_project_occurred
  ON public.project_git_events (project_id, occurred_at DESC);

GRANT SELECT ON public.project_git_events TO authenticated;
GRANT ALL ON public.project_git_events TO service_role;

ALTER TABLE public.project_git_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY project_git_events_read ON public.project_git_events
FOR SELECT TO authenticated
USING (public.can_view_project(auth.uid(), project_id));
