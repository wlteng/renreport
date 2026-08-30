-- Mining operations vertical slice: domain fields, capabilities, compensation, expenses, and RLS.

-- Extend the existing report type without removing legacy values.
ALTER TYPE public.report_type ADD VALUE IF NOT EXISTS 'site_operations';
ALTER TYPE public.report_type ADD VALUE IF NOT EXISTS 'exploration';
ALTER TYPE public.report_type ADD VALUE IF NOT EXISTS 'extraction';
ALTER TYPE public.report_type ADD VALUE IF NOT EXISTS 'processing';
ALTER TYPE public.report_type ADD VALUE IF NOT EXISTS 'logistics';
ALTER TYPE public.report_type ADD VALUE IF NOT EXISTS 'maintenance';
ALTER TYPE public.report_type ADD VALUE IF NOT EXISTS 'safety';
ALTER TYPE public.report_type ADD VALUE IF NOT EXISTS 'administration';

-- Normalize existing free text before adding stricter data-quality constraints.
UPDATE public.departments SET name = btrim(name), description = NULLIF(btrim(description), '');
UPDATE public.projects
SET name = btrim(name),
    description = NULLIF(btrim(description), ''),
    url = NULLIF(btrim(url), '');
UPDATE public.reports
SET title = btrim(title),
    content = btrim(content),
    blockers = NULLIF(btrim(blockers), ''),
    links = NULLIF(btrim(links), '');

ALTER TABLE public.departments
  ADD CONSTRAINT departments_name_nonblank CHECK (name = btrim(name) AND char_length(name) BETWEEN 1 AND 100),
  ADD CONSTRAINT departments_description_length CHECK (description IS NULL OR char_length(description) <= 1000);

ALTER TABLE public.projects
  ADD COLUMN project_code TEXT,
  ADD COLUMN legal_name TEXT,
  ADD COLUMN location TEXT,
  ADD COLUMN mining_method TEXT NOT NULL DEFAULT 'other',
  ADD COLUMN license_status TEXT NOT NULL DEFAULT 'unknown',
  ADD COLUMN reserve_kg NUMERIC(14,3),
  ADD COLUMN area_km2 NUMERIC(14,3),
  ADD CONSTRAINT projects_name_nonblank CHECK (name = btrim(name) AND char_length(name) BETWEEN 1 AND 120),
  ADD CONSTRAINT projects_code_nonblank CHECK (project_code IS NULL OR (project_code = btrim(project_code) AND char_length(project_code) BETWEEN 1 AND 40)),
  ADD CONSTRAINT projects_legal_name_length CHECK (legal_name IS NULL OR (legal_name = btrim(legal_name) AND char_length(legal_name) BETWEEN 1 AND 160)),
  ADD CONSTRAINT projects_location_length CHECK (location IS NULL OR (location = btrim(location) AND char_length(location) BETWEEN 1 AND 200)),
  ADD CONSTRAINT projects_description_length CHECK (description IS NULL OR char_length(description) <= 2000),
  ADD CONSTRAINT projects_mining_method_check CHECK (mining_method IN ('alluvial', 'open_pit', 'underground', 'exploration', 'other')),
  ADD CONSTRAINT projects_license_status_check CHECK (license_status IN ('licensed', 'in_process', 'expired', 'unknown')),
  ADD CONSTRAINT projects_reserve_nonnegative CHECK (reserve_kg IS NULL OR reserve_kg >= 0),
  ADD CONSTRAINT projects_area_nonnegative CHECK (area_km2 IS NULL OR area_km2 >= 0);
CREATE UNIQUE INDEX projects_project_code_unique ON public.projects (project_code) WHERE project_code IS NOT NULL;

ALTER TABLE public.reports
  ADD COLUMN work_status TEXT NOT NULL DEFAULT 'completed',
  ADD COLUMN shift TEXT NOT NULL DEFAULT 'day',
  ADD COLUMN output_quantity NUMERIC(14,3),
  ADD COLUMN output_unit TEXT,
  ADD CONSTRAINT reports_title_nonblank CHECK (title = btrim(title) AND char_length(title) BETWEEN 1 AND 160),
  ADD CONSTRAINT reports_content_nonblank CHECK (content = btrim(content) AND char_length(content) BETWEEN 1 AND 10000),
  ADD CONSTRAINT reports_blockers_length CHECK (blockers IS NULL OR char_length(blockers) <= 2000),
  ADD CONSTRAINT reports_links_length CHECK (links IS NULL OR char_length(links) <= 2000),
  ADD CONSTRAINT reports_work_status_check CHECK (work_status IN ('completed', 'in_progress', 'blocked')),
  ADD CONSTRAINT reports_shift_check CHECK (shift IN ('day', 'night', 'other')),
  ADD CONSTRAINT reports_output_nonnegative CHECK (output_quantity IS NULL OR output_quantity >= 0),
  ADD CONSTRAINT reports_output_unit_check CHECK (output_unit IS NULL OR (output_unit = btrim(output_unit) AND char_length(output_unit) BETWEEN 1 AND 24));

-- Capability model. Policies consult these rows through has_permission.
CREATE TABLE public.permissions (
  key TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  description TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT permissions_key_format CHECK (key ~ '^[a-z][a-z0-9_]{1,63}$'),
  CONSTRAINT permissions_label_nonblank CHECK (label = btrim(label) AND char_length(label) BETWEEN 1 AND 80),
  CONSTRAINT permissions_description_nonblank CHECK (description = btrim(description) AND char_length(description) BETWEEN 1 AND 500)
);

CREATE TABLE public.role_permissions (
  role public.app_role NOT NULL,
  permission_key TEXT NOT NULL REFERENCES public.permissions(key) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (role, permission_key)
);

INSERT INTO public.permissions (key, label, description) VALUES
  ('manage_people', 'Manage people', 'Create staff accounts and update staff profiles or active status.'),
  ('manage_roles', 'Manage roles', 'Grant and revoke application roles and view the role audit trail.'),
  ('manage_departments', 'Manage departments', 'Create and update departments.'),
  ('manage_permissions', 'Manage permissions', 'Configure the role-to-capability matrix.'),
  ('manage_projects', 'Manage mine projects', 'Create and update mining operations.'),
  ('submit_work', 'Submit work', 'Create and maintain personal work logs.'),
  ('view_staff_feed', 'View staff activity', 'Read the all-staff work submission feed.'),
  ('submit_expenses', 'Submit expenses', 'Create and maintain personal project expenses.'),
  ('view_expenses', 'View all expenses', 'Read project expenses submitted by all staff.'),
  ('approve_expenses', 'Approve expenses', 'Approve or reject submitted project expenses.'),
  ('manage_compensation', 'Manage compensation', 'Read and update staff compensation records.')
ON CONFLICT (key) DO UPDATE SET label = EXCLUDED.label, description = EXCLUDED.description;

INSERT INTO public.role_permissions (role, permission_key, enabled)
SELECT 'admin'::public.app_role, key, true FROM public.permissions
ON CONFLICT (role, permission_key) DO UPDATE SET enabled = EXCLUDED.enabled;

INSERT INTO public.role_permissions (role, permission_key, enabled) VALUES
  ('boss', 'manage_projects', true),
  ('boss', 'view_staff_feed', true),
  ('boss', 'view_expenses', true),
  ('boss', 'approve_expenses', true),
  ('manager', 'view_staff_feed', true),
  ('manager', 'view_expenses', true),
  ('staff', 'submit_work', true),
  ('staff', 'view_staff_feed', true),
  ('staff', 'submit_expenses', true)
ON CONFLICT (role, permission_key) DO UPDATE SET enabled = EXCLUDED.enabled;

CREATE OR REPLACE FUNCTION public.has_permission(_user_id UUID, _permission_key TEXT)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.role_permissions rp ON rp.role = ur.role
    JOIN public.profiles p ON p.id = ur.user_id
    WHERE ur.user_id = _user_id
      AND rp.permission_key = _permission_key
      AND rp.enabled
      AND p.is_active
  )
$$;

REVOKE ALL ON FUNCTION public.has_permission(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_permission(UUID, TEXT) TO authenticated, service_role;
GRANT SELECT ON public.permissions, public.role_permissions TO authenticated;
GRANT ALL ON public.permissions, public.role_permissions TO service_role;
GRANT INSERT, UPDATE, DELETE ON public.role_permissions TO authenticated;
ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY permissions_read ON public.permissions FOR SELECT TO authenticated USING (true);
CREATE POLICY role_permissions_read ON public.role_permissions FOR SELECT TO authenticated USING (true);
CREATE POLICY role_permissions_manage ON public.role_permissions FOR ALL TO authenticated
  USING (public.has_permission(auth.uid(), 'manage_permissions'))
  WITH CHECK (public.has_permission(auth.uid(), 'manage_permissions'));

-- Admin is the recovery role. Its capabilities cannot be disabled through the API,
-- otherwise a single matrix edit could permanently lock every administrator out.
CREATE OR REPLACE FUNCTION public.protect_admin_permissions()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.role = 'admin' THEN
      RAISE EXCEPTION 'Admin permissions cannot be disabled';
    END IF;
    RETURN OLD;
  END IF;
  IF NEW.role = 'admin' AND NOT NEW.enabled THEN
    RAISE EXCEPTION 'Admin permissions cannot be disabled';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.protect_admin_permissions() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER trg_protect_admin_permissions
BEFORE INSERT OR UPDATE OR DELETE ON public.role_permissions
FOR EACH ROW EXECUTE FUNCTION public.protect_admin_permissions();

CREATE TRIGGER trg_role_permissions_updated
BEFORE UPDATE ON public.role_permissions
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Compensation is one-to-one with profiles and is never broadly readable.
CREATE TABLE public.staff_compensation (
  user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  salary_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  salary_type TEXT NOT NULL DEFAULT 'monthly',
  currency TEXT NOT NULL DEFAULT 'USD',
  standard_hours NUMERIC(6,2) NOT NULL DEFAULT 160,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT staff_compensation_amount_nonnegative CHECK (salary_amount >= 0),
  CONSTRAINT staff_compensation_type_check CHECK (salary_type IN ('monthly', 'hourly', 'daily')),
  CONSTRAINT staff_compensation_currency_check CHECK (currency ~ '^[A-Z]{3}$'),
  CONSTRAINT staff_compensation_hours_check CHECK (standard_hours > 0 AND standard_hours <= 744)
);

INSERT INTO public.staff_compensation (user_id)
SELECT id FROM public.profiles
ON CONFLICT (user_id) DO NOTHING;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff_compensation TO authenticated;
GRANT ALL ON public.staff_compensation TO service_role;
ALTER TABLE public.staff_compensation ENABLE ROW LEVEL SECURITY;
CREATE POLICY compensation_read ON public.staff_compensation FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_permission(auth.uid(), 'manage_compensation'));
CREATE POLICY compensation_manage ON public.staff_compensation FOR ALL TO authenticated
  USING (public.has_permission(auth.uid(), 'manage_compensation'))
  WITH CHECK (public.has_permission(auth.uid(), 'manage_compensation'));
CREATE TRIGGER trg_staff_compensation_updated
BEFORE UPDATE ON public.staff_compensation
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Keep first-user-admin semantics; audit is emitted by the existing user_roles trigger.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  role_count INTEGER;
  assigned public.app_role;
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name'))
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
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

-- Edge-function grants run with the service role, so auth.uid() is empty there.
-- Preserve the initiating administrator from the granted_by field in that case.
CREATE OR REPLACE FUNCTION public.log_role_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.role_audit_log (target_user_id, role, action, actor_id)
    VALUES (NEW.user_id, NEW.role, 'granted', COALESCE(auth.uid(), NEW.granted_by));
    RETURN NEW;
  END IF;

  INSERT INTO public.role_audit_log (target_user_id, role, action, actor_id)
  VALUES (OLD.user_id, OLD.role, 'revoked', auth.uid());
  RETURN OLD;
END;
$$;
REVOKE ALL ON FUNCTION public.log_role_change() FROM PUBLIC, anon, authenticated;

-- Project expenses and review workflow.
CREATE TABLE public.expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE RESTRICT,
  submitted_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
  category TEXT NOT NULL,
  description TEXT NOT NULL,
  vendor TEXT,
  amount NUMERIC(14,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  receipt_url TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  reviewed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT expenses_category_check CHECK (category IN ('equipment', 'fuel', 'transport', 'supplies', 'contractor', 'salary', 'permit', 'accommodation', 'food', 'other')),
  CONSTRAINT expenses_description_nonblank CHECK (description = btrim(description) AND char_length(description) BETWEEN 1 AND 2000),
  CONSTRAINT expenses_vendor_length CHECK (vendor IS NULL OR (vendor = btrim(vendor) AND char_length(vendor) BETWEEN 1 AND 160)),
  CONSTRAINT expenses_amount_positive CHECK (amount > 0),
  CONSTRAINT expenses_currency_check CHECK (currency ~ '^[A-Z]{3}$'),
  CONSTRAINT expenses_receipt_length CHECK (receipt_url IS NULL OR char_length(receipt_url) <= 2000),
  CONSTRAINT expenses_status_check CHECK (status IN ('draft', 'submitted', 'approved', 'rejected')),
  CONSTRAINT expenses_review_state_check CHECK (
    (status IN ('draft', 'submitted') AND reviewed_by IS NULL AND reviewed_at IS NULL)
    OR (status IN ('approved', 'rejected') AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL)
  )
);

CREATE INDEX idx_expenses_submitter_date ON public.expenses (submitted_by, expense_date DESC);
CREATE INDEX idx_expenses_project_date ON public.expenses (project_id, expense_date DESC);
CREATE INDEX idx_expenses_status ON public.expenses (status, expense_date DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.expenses TO authenticated;
GRANT ALL ON public.expenses TO service_role;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.set_expense_review_metadata()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Service-role maintenance has no end-user identity and remains unrestricted.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  -- Submitters can edit only their own draft/submitted expense. Review metadata
  -- and ownership are always server controlled.
  IF OLD.submitted_by = auth.uid()
    AND OLD.status IN ('draft', 'submitted')
    AND NEW.status IN ('draft', 'submitted') THEN
    IF NEW.id IS DISTINCT FROM OLD.id
      OR NEW.submitted_by IS DISTINCT FROM OLD.submitted_by
      OR NEW.reviewed_by IS NOT NULL
      OR NEW.reviewed_at IS NOT NULL
      OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION 'Expense ownership and review metadata cannot be changed';
    END IF;
    NEW.reviewed_by := NULL;
    NEW.reviewed_at := NULL;
    RETURN NEW;
  END IF;

  -- Reviewers may only move another person's submitted expense to a terminal
  -- review state. All financial and ownership fields must stay unchanged.
  IF OLD.submitted_by <> auth.uid()
    AND OLD.status = 'submitted'
    AND NEW.status IN ('approved', 'rejected')
    AND public.has_permission(auth.uid(), 'approve_expenses') THEN
    IF NEW.id IS DISTINCT FROM OLD.id
      OR NEW.project_id IS DISTINCT FROM OLD.project_id
      OR NEW.submitted_by IS DISTINCT FROM OLD.submitted_by
      OR NEW.expense_date IS DISTINCT FROM OLD.expense_date
      OR NEW.category IS DISTINCT FROM OLD.category
      OR NEW.description IS DISTINCT FROM OLD.description
      OR NEW.vendor IS DISTINCT FROM OLD.vendor
      OR NEW.amount IS DISTINCT FROM OLD.amount
      OR NEW.currency IS DISTINCT FROM OLD.currency
      OR NEW.receipt_url IS DISTINCT FROM OLD.receipt_url
      OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION 'Reviewers can only approve or reject an expense';
    END IF;
    NEW.reviewed_by := auth.uid();
    NEW.reviewed_at := now();
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Invalid expense update or review transition';
END;
$$;
REVOKE ALL ON FUNCTION public.set_expense_review_metadata() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_expenses_review
BEFORE UPDATE ON public.expenses
FOR EACH ROW EXECUTE FUNCTION public.set_expense_review_metadata();
CREATE TRIGGER trg_expenses_updated
BEFORE UPDATE ON public.expenses
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE POLICY expenses_read ON public.expenses FOR SELECT TO authenticated
  USING (submitted_by = auth.uid() OR public.has_permission(auth.uid(), 'view_expenses'));
CREATE POLICY expenses_insert_own ON public.expenses FOR INSERT TO authenticated
  WITH CHECK (
    submitted_by = auth.uid()
    AND status IN ('draft', 'submitted')
    AND reviewed_by IS NULL
    AND reviewed_at IS NULL
    AND public.has_permission(auth.uid(), 'submit_expenses')
    AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_active)
    AND EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.status = 'active')
  );
CREATE POLICY expenses_update_own ON public.expenses FOR UPDATE TO authenticated
  USING (
    submitted_by = auth.uid()
    AND status IN ('draft', 'submitted')
    AND public.has_permission(auth.uid(), 'submit_expenses')
    AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_active)
  )
  WITH CHECK (
    submitted_by = auth.uid()
    AND status IN ('draft', 'submitted')
    AND reviewed_by IS NULL
    AND reviewed_at IS NULL
    AND public.has_permission(auth.uid(), 'submit_expenses')
    AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_active)
    AND EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.status = 'active')
  );
CREATE POLICY expenses_review ON public.expenses FOR UPDATE TO authenticated
  USING (
    public.has_permission(auth.uid(), 'approve_expenses')
    AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_active)
  )
  WITH CHECK (
    public.has_permission(auth.uid(), 'approve_expenses')
    AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_active)
  );
CREATE POLICY expenses_delete_draft ON public.expenses FOR DELETE TO authenticated
  USING (
    submitted_by = auth.uid()
    AND status = 'draft'
    AND public.has_permission(auth.uid(), 'submit_expenses')
    AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_active)
  );

-- Replace legacy role-based policies with capability-based policies.
DROP POLICY IF EXISTS departments_admin_write ON public.departments;
CREATE POLICY departments_manage ON public.departments FOR ALL TO authenticated
  USING (public.has_permission(auth.uid(), 'manage_departments'))
  WITH CHECK (public.has_permission(auth.uid(), 'manage_departments'));

DROP POLICY IF EXISTS profiles_admin_update ON public.profiles;
DROP POLICY IF EXISTS profiles_admin_delete ON public.profiles;
DROP POLICY IF EXISTS profiles_update_own ON public.profiles;
CREATE POLICY profiles_update_own ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid() AND is_active)
  WITH CHECK (id = auth.uid());
CREATE POLICY profiles_manage_update ON public.profiles FOR UPDATE TO authenticated
  USING (
    public.has_permission(auth.uid(), 'manage_people')
    AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_active)
  )
  WITH CHECK (
    public.has_permission(auth.uid(), 'manage_people')
    AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_active)
  );
CREATE POLICY profiles_manage_delete ON public.profiles FOR DELETE TO authenticated
  USING (
    public.has_permission(auth.uid(), 'manage_people')
    AND id <> auth.uid()
    AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_active)
  );

CREATE OR REPLACE FUNCTION public.protect_profile_access_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;
  IF auth.uid() IS NOT NULL AND NEW.email IS DISTINCT FROM OLD.email THEN
    RAISE EXCEPTION 'Profile email is managed by the authentication service';
  END IF;
  IF NEW.id = auth.uid() AND NEW.is_active IS DISTINCT FROM OLD.is_active AND NOT NEW.is_active THEN
    RAISE EXCEPTION 'You cannot deactivate your own account';
  END IF;
  IF (NEW.is_active IS DISTINCT FROM OLD.is_active OR NEW.department_id IS DISTINCT FROM OLD.department_id)
    AND NOT public.has_permission(auth.uid(), 'manage_people') THEN
    RAISE EXCEPTION 'Only people managers can change department or active status';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.protect_profile_access_fields() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER trg_protect_profile_access_fields
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.protect_profile_access_fields();

DROP POLICY IF EXISTS roles_read_self ON public.user_roles;
DROP POLICY IF EXISTS roles_admin_insert ON public.user_roles;
DROP POLICY IF EXISTS roles_admin_delete ON public.user_roles;
CREATE POLICY roles_read ON public.user_roles FOR SELECT TO authenticated USING (true);
CREATE POLICY roles_manage_insert ON public.user_roles FOR INSERT TO authenticated
  WITH CHECK (public.has_permission(auth.uid(), 'manage_roles'));
CREATE POLICY roles_manage_delete ON public.user_roles FOR DELETE TO authenticated
  USING (public.has_permission(auth.uid(), 'manage_roles'));

DROP POLICY IF EXISTS audit_read ON public.role_audit_log;
CREATE POLICY audit_read ON public.role_audit_log FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'manage_roles'));

DROP POLICY IF EXISTS projects_admin_write ON public.projects;
CREATE POLICY projects_manage ON public.projects FOR ALL TO authenticated
  USING (
    public.has_permission(auth.uid(), 'manage_projects')
    AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_active)
  )
  WITH CHECK (
    public.has_permission(auth.uid(), 'manage_projects')
    AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_active)
  );

DROP POLICY IF EXISTS project_members_admin_write ON public.project_members;
CREATE POLICY project_members_manage ON public.project_members FOR ALL TO authenticated
  USING (public.has_permission(auth.uid(), 'manage_projects'))
  WITH CHECK (public.has_permission(auth.uid(), 'manage_projects'));

DROP POLICY IF EXISTS reports_read_scoped ON public.reports;
DROP POLICY IF EXISTS reports_insert_own ON public.reports;
DROP POLICY IF EXISTS reports_update_own ON public.reports;
DROP POLICY IF EXISTS reports_delete_own_or_admin ON public.reports;
CREATE POLICY reports_read_feed ON public.reports FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR (
      public.has_permission(auth.uid(), 'view_staff_feed')
      AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_active)
    )
  );
CREATE POLICY reports_insert_work ON public.reports FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND public.has_permission(auth.uid(), 'submit_work')
    AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_active)
    AND (project_id IS NULL OR EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.status = 'active'))
  );
CREATE POLICY reports_update_work ON public.reports FOR UPDATE TO authenticated
  USING (
    user_id = auth.uid()
    AND public.has_permission(auth.uid(), 'submit_work')
    AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_active)
  )
  WITH CHECK (
    user_id = auth.uid()
    AND public.has_permission(auth.uid(), 'submit_work')
    AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_active)
    AND (project_id IS NULL OR EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.status = 'active'))
  );
CREATE POLICY reports_delete_work ON public.reports FOR DELETE TO authenticated
  USING (
    user_id = auth.uid()
    AND public.has_permission(auth.uid(), 'submit_work')
    AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_active)
  );