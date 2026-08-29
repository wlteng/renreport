-- ENUMS
CREATE TYPE public.app_role AS ENUM ('admin', 'boss', 'manager', 'staff');
CREATE TYPE public.project_status AS ENUM ('active', 'paused', 'completed', 'archived');
CREATE TYPE public.report_type AS ENUM ('content_input', 'create_develop', 'study_research', 'planning_brainstorm', 'analysis', 'meeting', 'support', 'other');

-- DEPARTMENTS
CREATE TABLE public.departments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.departments TO authenticated;
GRANT ALL ON public.departments TO service_role;
ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;

-- PROFILES
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  avatar_url TEXT,
  job_title TEXT,
  phone TEXT,
  department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- USER ROLES
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  granted_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- ROLE AUDIT LOG
CREATE TABLE public.role_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  target_user_id UUID NOT NULL,
  role public.app_role NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('granted', 'revoked')),
  actor_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.role_audit_log TO authenticated;
GRANT ALL ON public.role_audit_log TO service_role;
ALTER TABLE public.role_audit_log ENABLE ROW LEVEL SECURITY;

-- PROJECTS
CREATE TABLE public.projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  status public.project_status NOT NULL DEFAULT 'active',
  color TEXT,
  url TEXT,
  owner_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.projects TO authenticated;
GRANT ALL ON public.projects TO service_role;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

-- PROJECT MEMBERS
CREATE TABLE public.project_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_members TO authenticated;
GRANT ALL ON public.project_members TO service_role;
ALTER TABLE public.project_members ENABLE ROW LEVEL SECURITY;

-- REPORTS
CREATE TABLE public.reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  report_date DATE NOT NULL DEFAULT CURRENT_DATE,
  report_type public.report_type NOT NULL DEFAULT 'other',
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  hours_spent NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (hours_spent >= 0 AND hours_spent <= 24),
  blockers TEXT,
  links TEXT,
  image_urls TEXT[],
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_reports_user_date ON public.reports (user_id, report_date DESC);
CREATE INDEX idx_reports_date ON public.reports (report_date DESC);
CREATE INDEX idx_reports_project ON public.reports (project_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reports TO authenticated;
GRANT ALL ON public.reports TO service_role;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

-- HELPERS
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION public.has_any_role(_user_id UUID, _roles public.app_role[])
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = ANY(_roles))
$$;

CREATE OR REPLACE FUNCTION public.my_department()
RETURNS UUID LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT department_id FROM public.profiles WHERE id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION public.user_department(_user_id UUID)
RETURNS UUID LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT department_id FROM public.profiles WHERE id = _user_id
$$;

CREATE OR REPLACE FUNCTION public.can_view_reports_of(_author UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    _author = auth.uid()
    OR public.has_any_role(auth.uid(), ARRAY['admin','boss']::public.app_role[])
    OR (
      public.has_role(auth.uid(), 'manager')
      AND public.user_department(_author) IS NOT NULL
      AND public.user_department(_author) = public.my_department()
    )
$$;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_projects_updated BEFORE UPDATE ON public.projects FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_reports_updated BEFORE UPDATE ON public.reports FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- NEW USER HANDLING: profile + first user is admin
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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

  INSERT INTO public.role_audit_log (target_user_id, role, action, actor_id)
  VALUES (NEW.id, assigned, 'granted', NEW.id);

  RETURN NEW;
END; $$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ROLE CHANGE AUDIT
CREATE OR REPLACE FUNCTION public.log_role_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.role_audit_log (target_user_id, role, action, actor_id)
    VALUES (NEW.user_id, NEW.role, 'granted', auth.uid());
    RETURN NEW;
  ELSE
    INSERT INTO public.role_audit_log (target_user_id, role, action, actor_id)
    VALUES (OLD.user_id, OLD.role, 'revoked', auth.uid());
    RETURN OLD;
  END IF;
END; $$;

CREATE TRIGGER trg_role_insert_audit AFTER INSERT ON public.user_roles FOR EACH ROW EXECUTE FUNCTION public.log_role_change();
CREATE TRIGGER trg_role_delete_audit AFTER DELETE ON public.user_roles FOR EACH ROW EXECUTE FUNCTION public.log_role_change();

-- GUARD: an admin cannot remove their own admin role, and the last admin cannot be removed
CREATE OR REPLACE FUNCTION public.protect_last_admin()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE admin_count INTEGER;
BEGIN
  IF OLD.role = 'admin' THEN
    SELECT count(*) INTO admin_count FROM public.user_roles WHERE role = 'admin';
    IF admin_count <= 1 THEN
      RAISE EXCEPTION 'Cannot remove the last remaining admin';
    END IF;
    IF OLD.user_id = auth.uid() THEN
      RAISE EXCEPTION 'Admins cannot revoke their own admin role';
    END IF;
  END IF;
  RETURN OLD;
END; $$;

CREATE TRIGGER trg_protect_last_admin BEFORE DELETE ON public.user_roles FOR EACH ROW EXECUTE FUNCTION public.protect_last_admin();

-- POLICIES: departments
CREATE POLICY "departments_read" ON public.departments FOR SELECT TO authenticated USING (true);
CREATE POLICY "departments_admin_write" ON public.departments FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- POLICIES: profiles
CREATE POLICY "profiles_read" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid()) WITH CHECK (id = auth.uid());
CREATE POLICY "profiles_admin_update" ON public.profiles FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "profiles_admin_delete" ON public.profiles FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') AND id <> auth.uid());

-- POLICIES: user_roles
CREATE POLICY "roles_read_self" ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_any_role(auth.uid(), ARRAY['admin','boss','manager']::public.app_role[]));
CREATE POLICY "roles_admin_insert" ON public.user_roles FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "roles_admin_delete" ON public.user_roles FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- POLICIES: role_audit_log (read-only, admins and bosses)
CREATE POLICY "audit_read" ON public.role_audit_log FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','boss']::public.app_role[]));

-- POLICIES: projects
CREATE POLICY "projects_read" ON public.projects FOR SELECT TO authenticated USING (true);
CREATE POLICY "projects_admin_write" ON public.projects FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','boss']::public.app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','boss']::public.app_role[]));

-- POLICIES: project members
CREATE POLICY "project_members_read" ON public.project_members FOR SELECT TO authenticated USING (true);
CREATE POLICY "project_members_admin_write" ON public.project_members FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','boss','manager']::public.app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','boss','manager']::public.app_role[]));

-- POLICIES: reports
CREATE POLICY "reports_read_scoped" ON public.reports FOR SELECT TO authenticated
  USING (public.can_view_reports_of(user_id));
CREATE POLICY "reports_insert_own" ON public.reports FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "reports_update_own" ON public.reports FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "reports_delete_own_or_admin" ON public.reports FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));