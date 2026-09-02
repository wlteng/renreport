-- Ren Report local/staging demo data.
-- Never run this seed against production: it creates known test passwords.

INSERT INTO public.departments (id, name, description)
VALUES
  ('20000000-0000-4000-8000-000000000001', 'Executive', 'Mine ownership, governance and approvals.'),
  ('20000000-0000-4000-8000-000000000002', 'Mine Operations', 'Daily extraction, processing and site coordination.'),
  ('20000000-0000-4000-8000-000000000003', 'Geology & Safety', 'Exploration, sampling, compliance and safety controls.')
ON CONFLICT (id) DO UPDATE
SET name = EXCLUDED.name,
    description = EXCLUDED.description;

INSERT INTO auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  confirmation_token,
  recovery_token,
  email_change_token_new,
  email_change,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
VALUES
  (
    '00000000-0000-0000-0000-000000000000',
    '10000000-0000-4000-8000-000000000001',
    'authenticated',
    'authenticated',
    'admin@renreport.test',
    crypt('RenReport!2026', gen_salt('bf')),
    now(),
    '',
    '',
    '',
    '',
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Ariun Admin"}'::jsonb,
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '10000000-0000-4000-8000-000000000002',
    'authenticated',
    'authenticated',
    'boss@renreport.test',
    crypt('RenReport!2026', gen_salt('bf')),
    now(),
    '',
    '',
    '',
    '',
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Bat Boss"}'::jsonb,
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '10000000-0000-4000-8000-000000000003',
    'authenticated',
    'authenticated',
    'manager@renreport.test',
    crypt('RenReport!2026', gen_salt('bf')),
    now(),
    '',
    '',
    '',
    '',
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Munkh Manager"}'::jsonb,
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '10000000-0000-4000-8000-000000000004',
    'authenticated',
    'authenticated',
    'staff@renreport.test',
    crypt('RenReport!2026', gen_salt('bf')),
    now(),
    '',
    '',
    '',
    '',
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"王祥"}'::jsonb,
    now(),
    now()
  )
ON CONFLICT (id) DO UPDATE
SET email = EXCLUDED.email,
    encrypted_password = EXCLUDED.encrypted_password,
    email_confirmed_at = EXCLUDED.email_confirmed_at,
    confirmation_token = EXCLUDED.confirmation_token,
    recovery_token = EXCLUDED.recovery_token,
    email_change_token_new = EXCLUDED.email_change_token_new,
    email_change = EXCLUDED.email_change,
    raw_app_meta_data = EXCLUDED.raw_app_meta_data,
    raw_user_meta_data = EXCLUDED.raw_user_meta_data,
    updated_at = now();

INSERT INTO auth.identities (
  id,
  user_id,
  provider_id,
  identity_data,
  provider,
  last_sign_in_at,
  created_at,
  updated_at
)
SELECT
  seeded.id,
  seeded.id,
  seeded.id::text,
  jsonb_build_object('sub', seeded.id::text, 'email', seeded.email, 'email_verified', true),
  'email',
  now(),
  now(),
  now()
FROM (
  VALUES
    ('10000000-0000-4000-8000-000000000001'::uuid, 'admin@renreport.test'),
    ('10000000-0000-4000-8000-000000000002'::uuid, 'boss@renreport.test'),
    ('10000000-0000-4000-8000-000000000003'::uuid, 'manager@renreport.test'),
    ('10000000-0000-4000-8000-000000000004'::uuid, 'staff@renreport.test')
) AS seeded(id, email)
ON CONFLICT (provider_id, provider) DO UPDATE
SET identity_data = EXCLUDED.identity_data,
    updated_at = now();

INSERT INTO public.profiles (
  id,
  email,
  full_name,
  job_title,
  resume,
  department_id,
  is_active
)
VALUES
  (
    '10000000-0000-4000-8000-000000000001',
    'admin@renreport.test',
    'Ariun Admin',
    'System Administrator',
    NULL,
    '20000000-0000-4000-8000-000000000001',
    true
  ),
  (
    '10000000-0000-4000-8000-000000000002',
    'boss@renreport.test',
    'Bat Boss',
    'Mine Director',
    NULL,
    '20000000-0000-4000-8000-000000000001',
    true
  ),
  (
    '10000000-0000-4000-8000-000000000003',
    'manager@renreport.test',
    'Munkh Manager',
    'Operations Manager',
    NULL,
    '20000000-0000-4000-8000-000000000002',
    true
  ),
  (
    '10000000-0000-4000-8000-000000000004',
    'staff@renreport.test',
    '王祥',
    'Technical Specialist',
    E'技术人员王祥：就职于华兴集团负责菲律宾的矿。\n做地质勘探做了五年，矿山做了 16 年，干过矿山种类有金，铜，铁，煤，硫。',
    '20000000-0000-4000-8000-000000000003',
    true
  )
ON CONFLICT (id) DO UPDATE
SET email = EXCLUDED.email,
    full_name = EXCLUDED.full_name,
    job_title = EXCLUDED.job_title,
    resume = EXCLUDED.resume,
    department_id = EXCLUDED.department_id,
    is_active = EXCLUDED.is_active;

INSERT INTO public.user_roles (user_id, role, granted_by)
VALUES
  ('10000000-0000-4000-8000-000000000001', 'admin', '10000000-0000-4000-8000-000000000001'),
  ('10000000-0000-4000-8000-000000000002', 'boss', '10000000-0000-4000-8000-000000000001'),
  ('10000000-0000-4000-8000-000000000003', 'manager', '10000000-0000-4000-8000-000000000001'),
  ('10000000-0000-4000-8000-000000000004', 'staff', '10000000-0000-4000-8000-000000000001')
ON CONFLICT (user_id, role) DO UPDATE
SET granted_by = EXCLUDED.granted_by;

DELETE FROM public.user_roles
WHERE user_id IN (
  '10000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000002',
  '10000000-0000-4000-8000-000000000003',
  '10000000-0000-4000-8000-000000000004'
)
AND (user_id, role) NOT IN (
  ('10000000-0000-4000-8000-000000000001'::uuid, 'admin'::public.app_role),
  ('10000000-0000-4000-8000-000000000002'::uuid, 'boss'::public.app_role),
  ('10000000-0000-4000-8000-000000000003'::uuid, 'manager'::public.app_role),
  ('10000000-0000-4000-8000-000000000004'::uuid, 'staff'::public.app_role)
);

-- Canonical test matrix. All combinations exist, including disabled cells.
INSERT INTO public.role_permissions (role, permission_key, enabled)
SELECT
  seeded_role.role,
  permission.key,
  seeded_role.role = 'admin'::public.app_role
    OR (seeded_role.role = 'boss'::public.app_role AND permission.key IN (
      'manage_projects',
      'view_staff_feed',
      'view_expenses',
      'approve_expenses'
    ))
    OR (seeded_role.role = 'manager'::public.app_role AND permission.key IN (
      'view_staff_feed',
      'view_expenses'
    ))
    OR (seeded_role.role = 'staff'::public.app_role AND permission.key IN (
      'submit_work',
      'view_staff_feed',
      'submit_expenses'
    ))
FROM unnest(enum_range(NULL::public.app_role)) AS seeded_role(role)
CROSS JOIN public.permissions AS permission
ON CONFLICT (role, permission_key) DO UPDATE
SET enabled = EXCLUDED.enabled;

INSERT INTO public.staff_compensation (
  user_id,
  salary_amount,
  salary_type,
  currency,
  standard_hours
)
VALUES
  ('10000000-0000-4000-8000-000000000001', 4800, 'monthly', 'USD', 160),
  ('10000000-0000-4000-8000-000000000002', 4200, 'monthly', 'USD', 160),
  ('10000000-0000-4000-8000-000000000003', 3200, 'monthly', 'USD', 176),
  ('10000000-0000-4000-8000-000000000004', 18.50, 'hourly', 'USD', 176)
ON CONFLICT (user_id) DO UPDATE
SET salary_amount = EXCLUDED.salary_amount,
    salary_type = EXCLUDED.salary_type,
    currency = EXCLUDED.currency,
    standard_hours = EXCLUDED.standard_hours;

INSERT INTO public.projects (
  id,
  name,
  project_code,
  legal_name,
  description,
  category,
  fund_amount,
  fund_currency,
  status,
  color,
  owner_id,
  department_id,
  location,
  mining_method,
  license_status,
  reserve_kg,
  area_km2
)
VALUES (
  '30000000-0000-4000-8000-000000000001',
  'Zoloto Demo Mine',
  'ZLT-DEMO',
  'Zoloto Demonstration Mining LLC',
  'Safe demonstration project for validating the Ren Report logbook workflow.',
  'mine',
  250000.00,
  'USD',
  'active',
  '#b98b2f',
  '10000000-0000-4000-8000-000000000002',
  '20000000-0000-4000-8000-000000000002',
  'Buryatia, Russia',
  'alluvial',
  'licensed',
  185.250,
  12.800
)
ON CONFLICT (id) DO UPDATE
SET name = EXCLUDED.name,
    project_code = EXCLUDED.project_code,
    legal_name = EXCLUDED.legal_name,
    description = EXCLUDED.description,
    category = EXCLUDED.category,
    fund_amount = EXCLUDED.fund_amount,
    fund_currency = EXCLUDED.fund_currency,
    status = EXCLUDED.status,
    color = EXCLUDED.color,
    owner_id = EXCLUDED.owner_id,
    department_id = EXCLUDED.department_id,
    location = EXCLUDED.location,
    mining_method = EXCLUDED.mining_method,
    license_status = EXCLUDED.license_status,
    reserve_kg = EXCLUDED.reserve_kg,
    area_km2 = EXCLUDED.area_km2;

INSERT INTO public.project_members (project_id, user_id)
SELECT
  '30000000-0000-4000-8000-000000000001'::uuid,
  seeded.user_id
FROM (
  VALUES
    ('10000000-0000-4000-8000-000000000001'::uuid),
    ('10000000-0000-4000-8000-000000000002'::uuid),
    ('10000000-0000-4000-8000-000000000003'::uuid),
    ('10000000-0000-4000-8000-000000000004'::uuid)
) AS seeded(user_id)
ON CONFLICT (project_id, user_id) DO NOTHING;

INSERT INTO public.project_tasks (
  id,
  project_id,
  title,
  description,
  assignee_id,
  due_date,
  is_completed,
  completed_at,
  created_by
)
VALUES
  (
    '50000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000001',
    'Confirm the next exploration grid',
    'Review the survey data and agree the next drilling coordinates.',
    '10000000-0000-4000-8000-000000000003',
    CURRENT_DATE + 7,
    false,
    NULL,
    '10000000-0000-4000-8000-000000000002'
  ),
  (
    '50000000-0000-4000-8000-000000000002',
    '30000000-0000-4000-8000-000000000001',
    'Complete the weekly safety inspection',
    'Record the inspection findings in the project work log.',
    '10000000-0000-4000-8000-000000000004',
    CURRENT_DATE - 1,
    true,
    now() - interval '1 day',
    '10000000-0000-4000-8000-000000000002'
  )
ON CONFLICT (id) DO UPDATE
SET title = EXCLUDED.title,
    description = EXCLUDED.description,
    assignee_id = EXCLUDED.assignee_id,
    due_date = EXCLUDED.due_date,
    is_completed = EXCLUDED.is_completed,
    completed_at = EXCLUDED.completed_at;

INSERT INTO public.project_milestones (
  id,
  project_id,
  title,
  description,
  target_date,
  is_achieved,
  achieved_at,
  created_by
)
VALUES
  (
    '60000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000001',
    'Exploration permit confirmed',
    'All documents approved for the current exploration area.',
    CURRENT_DATE - 14,
    true,
    now() - interval '12 days',
    '10000000-0000-4000-8000-000000000002'
  ),
  (
    '60000000-0000-4000-8000-000000000002',
    '30000000-0000-4000-8000-000000000001',
    'First production sample',
    'Recover and document the first verified production sample.',
    CURRENT_DATE + 30,
    false,
    NULL,
    '10000000-0000-4000-8000-000000000002'
  )
ON CONFLICT (id) DO UPDATE
SET title = EXCLUDED.title,
    description = EXCLUDED.description,
    target_date = EXCLUDED.target_date,
    is_achieved = EXCLUDED.is_achieved,
    achieved_at = EXCLUDED.achieved_at;

INSERT INTO public.reports (
  id,
  user_id,
  project_id,
  report_date,
  report_type,
  title,
  content,
  hours_spent,
  blockers,
  work_status,
  shift,
  output_quantity,
  output_unit
)
VALUES
  (
    '40000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000001',
    CURRENT_DATE - 3,
    'administration',
    'Access and compliance review',
    'Reviewed active accounts, mine permissions, and the weekly compliance checklist.',
    2.5,
    NULL,
    'completed',
    'day',
    NULL,
    NULL
  ),
  (
    '40000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000002',
    '30000000-0000-4000-8000-000000000001',
    CURRENT_DATE - 2,
    'planning_brainstorm',
    'Weekly production direction',
    'Recorded the approved weekly plan as an imported management note for feed validation.',
    1.0,
    NULL,
    'completed',
    'day',
    NULL,
    NULL
  ),
  (
    '40000000-0000-4000-8000-000000000003',
    '10000000-0000-4000-8000-000000000003',
    '30000000-0000-4000-8000-000000000001',
    CURRENT_DATE - 1,
    'site_operations',
    'Shift handover inspection',
    'Imported the operations handover and confirmed the wash plant was ready for the next shift.',
    1.5,
    'Replacement hose due within two days.',
    'in_progress',
    'day',
    NULL,
    NULL
  ),
  (
    '40000000-0000-4000-8000-000000000004',
    '10000000-0000-4000-8000-000000000004',
    '30000000-0000-4000-8000-000000000001',
    CURRENT_DATE,
    'extraction',
    'Completed test-pit extraction',
    'Excavated and processed the scheduled test-pit material, then completed equipment clean-down.',
    8.0,
    NULL,
    'completed',
    'day',
    42.750,
    'tonnes'
  )
ON CONFLICT (id) DO UPDATE
SET user_id = EXCLUDED.user_id,
    project_id = EXCLUDED.project_id,
    report_date = EXCLUDED.report_date,
    report_type = EXCLUDED.report_type,
    title = EXCLUDED.title,
    content = EXCLUDED.content,
    hours_spent = EXCLUDED.hours_spent,
    blockers = EXCLUDED.blockers,
    work_status = EXCLUDED.work_status,
    shift = EXCLUDED.shift,
    output_quantity = EXCLUDED.output_quantity,
    output_unit = EXCLUDED.output_unit;
