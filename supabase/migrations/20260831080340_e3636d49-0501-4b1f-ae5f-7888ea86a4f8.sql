-- Unified audit trail for reports, capability changes, and role changes.

INSERT INTO public.permissions (key, label, description)
VALUES (
  'view_audit_log',
  'View audit log',
  'Read report actions and role or capability changes with actor timestamps.'
)
ON CONFLICT (key) DO UPDATE
SET label = EXCLUDED.label,
    description = EXCLUDED.description;

-- Keep every role/capability combination explicit. This makes the admin matrix
-- deterministic and ensures every toggle is an RLS-protected UPDATE.
INSERT INTO public.role_permissions (role, permission_key, enabled)
SELECT seeded_role.role, permission.key, seeded_role.role = 'admin'::public.app_role
FROM unnest(enum_range(NULL::public.app_role)) AS seeded_role(role)
CROSS JOIN public.permissions AS permission
ON CONFLICT (role, permission_key) DO NOTHING;

UPDATE public.role_permissions
SET enabled = true
WHERE role = 'admin'::public.app_role
  AND permission_key = 'view_audit_log';

CREATE TABLE public.admin_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL,
  actor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  target_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  report_id UUID,
  project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  role public.app_role,
  permission_key TEXT REFERENCES public.permissions(key) ON DELETE SET NULL,
  summary TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT admin_audit_event_type_check CHECK (
    event_type IN (
      'report_created',
      'report_updated',
      'report_deleted',
      'capability_enabled',
      'capability_disabled',
      'role_granted',
      'role_revoked'
    )
  ),
  CONSTRAINT admin_audit_summary_nonblank CHECK (
    summary = btrim(summary) AND char_length(summary) BETWEEN 1 AND 500
  ),
  CONSTRAINT admin_audit_metadata_object CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE INDEX idx_admin_audit_created ON public.admin_audit_log (created_at DESC);
CREATE INDEX idx_admin_audit_actor ON public.admin_audit_log (actor_id, created_at DESC);
CREATE INDEX idx_admin_audit_report ON public.admin_audit_log (report_id, created_at DESC);
CREATE INDEX idx_admin_audit_event ON public.admin_audit_log (event_type, created_at DESC);

GRANT SELECT ON public.admin_audit_log TO authenticated;
GRANT ALL ON public.admin_audit_log TO service_role;
ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY admin_audit_read ON public.admin_audit_log FOR SELECT TO authenticated
  USING (
    public.has_permission(auth.uid(), 'view_audit_log')
    AND EXISTS (
      SELECT 1
      FROM public.profiles profile
      WHERE profile.id = auth.uid() AND profile.is_active
    )
  );

CREATE OR REPLACE FUNCTION public.log_report_audit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  report_row public.reports;
  audit_event TEXT;
BEGIN
  report_row := CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;

  IF TG_OP = 'UPDATE'
    AND (to_jsonb(NEW) - 'updated_at') = (to_jsonb(OLD) - 'updated_at') THEN
    RETURN NEW;
  END IF;

  audit_event := CASE TG_OP
    WHEN 'INSERT' THEN 'report_created'
    WHEN 'UPDATE' THEN 'report_updated'
    ELSE 'report_deleted'
  END;

  INSERT INTO public.admin_audit_log (
    event_type,
    actor_id,
    target_user_id,
    report_id,
    project_id,
    summary,
    metadata,
    created_at
  )
  VALUES (
    audit_event,
    COALESCE(auth.uid(), report_row.user_id),
    report_row.user_id,
    report_row.id,
    report_row.project_id,
    CASE TG_OP
      WHEN 'INSERT' THEN 'Created report: ' || report_row.title
      WHEN 'UPDATE' THEN 'Updated report: ' || report_row.title
      ELSE 'Deleted report: ' || report_row.title
    END,
    jsonb_build_object(
      'title', report_row.title,
      'report_date', report_row.report_date,
      'report_type', report_row.report_type,
      'work_status', report_row.work_status,
      'shift', report_row.shift
    ),
    CASE WHEN TG_OP = 'INSERT' THEN report_row.created_at ELSE now() END
  );

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

REVOKE ALL ON FUNCTION public.log_report_audit() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_reports_audit
AFTER INSERT OR UPDATE OR DELETE ON public.reports
FOR EACH ROW EXECUTE FUNCTION public.log_report_audit();

CREATE OR REPLACE FUNCTION public.log_capability_audit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  permission_row public.role_permissions;
  audit_event TEXT;
BEGIN
  permission_row := CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;

  IF TG_OP = 'UPDATE' AND NEW.enabled IS NOT DISTINCT FROM OLD.enabled THEN
    RETURN NEW;
  END IF;

  audit_event := CASE
    WHEN TG_OP = 'DELETE' OR NOT permission_row.enabled THEN 'capability_disabled'
    ELSE 'capability_enabled'
  END;

  INSERT INTO public.admin_audit_log (
    event_type,
    actor_id,
    role,
    permission_key,
    summary,
    metadata
  )
  VALUES (
    audit_event,
    auth.uid(),
    permission_row.role,
    permission_row.permission_key,
    CASE
      WHEN audit_event = 'capability_enabled'
        THEN 'Enabled ' || permission_row.permission_key || ' for ' || permission_row.role::text
      ELSE 'Disabled ' || permission_row.permission_key || ' for ' || permission_row.role::text
    END,
    jsonb_build_object('enabled', audit_event = 'capability_enabled')
  );

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

REVOKE ALL ON FUNCTION public.log_capability_audit() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_role_permissions_audit
AFTER INSERT OR UPDATE OR DELETE ON public.role_permissions
FOR EACH ROW EXECUTE FUNCTION public.log_capability_audit();

CREATE OR REPLACE FUNCTION public.log_unified_role_audit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  role_row public.user_roles;
  audit_event TEXT;
BEGIN
  role_row := CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  audit_event := CASE WHEN TG_OP = 'INSERT' THEN 'role_granted' ELSE 'role_revoked' END;

  INSERT INTO public.admin_audit_log (
    event_type,
    actor_id,
    target_user_id,
    role,
    summary
  )
  VALUES (
    audit_event,
    COALESCE(auth.uid(), role_row.granted_by),
    role_row.user_id,
    role_row.role,
    CASE
      WHEN TG_OP = 'INSERT' THEN 'Granted ' || role_row.role::text || ' role'
      ELSE 'Revoked ' || role_row.role::text || ' role'
    END
  );

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

REVOKE ALL ON FUNCTION public.log_unified_role_audit() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_user_roles_unified_audit
AFTER INSERT OR DELETE ON public.user_roles
FOR EACH ROW EXECUTE FUNCTION public.log_unified_role_audit();

-- Make reports that pre-date this migration visible in the audit timeline.
INSERT INTO public.admin_audit_log (
  event_type,
  actor_id,
  target_user_id,
  report_id,
  project_id,
  summary,
  metadata,
  created_at
)
SELECT
  'report_created',
  report.user_id,
  report.user_id,
  report.id,
  report.project_id,
  'Created report: ' || report.title,
  jsonb_build_object(
    'title', report.title,
    'report_date', report.report_date,
    'report_type', report.report_type,
    'work_status', report.work_status,
    'shift', report.shift,
    'backfilled', true
  ),
  report.created_at
FROM public.reports AS report;

-- Preserve the existing role audit history in the unified stream.
INSERT INTO public.admin_audit_log (
  event_type,
  actor_id,
  target_user_id,
  role,
  summary,
  metadata,
  created_at
)
SELECT
  CASE WHEN legacy.action = 'granted' THEN 'role_granted' ELSE 'role_revoked' END,
  actor.id,
  target.id,
  legacy.role,
  CASE
    WHEN legacy.action = 'granted' THEN 'Granted ' || legacy.role::text || ' role'
    ELSE 'Revoked ' || legacy.role::text || ' role'
  END,
  jsonb_build_object('legacy_audit_id', legacy.id),
  legacy.created_at
FROM public.role_audit_log AS legacy
LEFT JOIN public.profiles AS actor ON actor.id = legacy.actor_id
LEFT JOIN public.profiles AS target ON target.id = legacy.target_user_id;