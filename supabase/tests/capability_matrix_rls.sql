-- Run after supabase/seed.sql. The transaction rolls back all test writes.
BEGIN;
SET LOCAL ROLE authenticated;

DO $$
DECLARE
  persona RECORD;
  expected_submit BOOLEAN;
  expected_feed BOOLEAN;
  expected_audit BOOLEAN;
  expected_matrix_write BOOLEAN;
  can_see_own BOOLEAN;
  can_see_other BOOLEAN;
  visible_audit_count INTEGER;
  affected_rows INTEGER;
  insert_failed BOOLEAN;
  inserted_report_id UUID;
BEGIN
  FOR persona IN
    SELECT profile.id, profile.email, user_role.role
    FROM public.profiles AS profile
    JOIN public.user_roles AS user_role ON user_role.user_id = profile.id
    WHERE profile.id IN (
      '10000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000002',
      '10000000-0000-4000-8000-000000000003',
      '10000000-0000-4000-8000-000000000004'
    )
    ORDER BY profile.email
  LOOP
    PERFORM set_config('request.jwt.claim.sub', persona.id::text, true);
    PERFORM set_config(
      'request.jwt.claims',
      jsonb_build_object('sub', persona.id::text, 'role', 'authenticated')::text,
      true
    );

    expected_submit := public.has_permission(persona.id, 'submit_work');
    expected_feed := public.has_permission(persona.id, 'view_staff_feed');
    expected_audit := public.has_permission(persona.id, 'view_audit_log');
    expected_matrix_write := public.has_permission(persona.id, 'manage_permissions');

    SELECT EXISTS (
      SELECT 1 FROM public.reports WHERE user_id = persona.id
    ) INTO can_see_own;
    IF NOT can_see_own THEN
      RAISE EXCEPTION '% cannot read their own seeded report', persona.email;
    END IF;

    SELECT EXISTS (
      SELECT 1 FROM public.reports WHERE user_id <> persona.id
    ) INTO can_see_other;
    IF can_see_other IS DISTINCT FROM expected_feed THEN
      RAISE EXCEPTION '% report-feed access does not match view_staff_feed=%',
        persona.email, expected_feed;
    END IF;

    inserted_report_id := NULL;
    insert_failed := false;
    BEGIN
      INSERT INTO public.reports (
        user_id,
        project_id,
        report_date,
        report_type,
        title,
        content,
        hours_spent,
        work_status,
        shift
      )
      VALUES (
        persona.id,
        '30000000-0000-4000-8000-000000000001',
        CURRENT_DATE,
        'site_operations',
        'RLS capability test',
        'Temporary valid work log used by the automated capability-matrix test.',
        1,
        'completed',
        'day'
      )
      RETURNING id INTO inserted_report_id;
    EXCEPTION WHEN OTHERS THEN
      insert_failed := true;
    END;

    IF insert_failed = expected_submit THEN
      RAISE EXCEPTION '% report INSERT does not match submit_work=%',
        persona.email, expected_submit;
    END IF;

    IF inserted_report_id IS NOT NULL THEN
      DELETE FROM public.reports WHERE id = inserted_report_id;
    END IF;

    UPDATE public.reports
    SET title = title
    WHERE id = CASE persona.role
      WHEN 'admin'::public.app_role THEN '40000000-0000-4000-8000-000000000001'::uuid
      WHEN 'boss'::public.app_role THEN '40000000-0000-4000-8000-000000000002'::uuid
      WHEN 'manager'::public.app_role THEN '40000000-0000-4000-8000-000000000003'::uuid
      ELSE '40000000-0000-4000-8000-000000000004'::uuid
    END;
    GET DIAGNOSTICS affected_rows = ROW_COUNT;
    IF (affected_rows = 1) IS DISTINCT FROM expected_submit THEN
      RAISE EXCEPTION '% report UPDATE does not match submit_work=%',
        persona.email, expected_submit;
    END IF;

    SELECT count(*) INTO visible_audit_count FROM public.admin_audit_log;
    IF (visible_audit_count > 0) IS DISTINCT FROM expected_audit THEN
      RAISE EXCEPTION '% audit-log visibility does not match view_audit_log=%',
        persona.email, expected_audit;
    END IF;

    UPDATE public.role_permissions
    SET enabled = enabled
    WHERE role = 'staff'::public.app_role AND permission_key = 'submit_work';
    GET DIAGNOSTICS affected_rows = ROW_COUNT;
    IF (affected_rows = 1) IS DISTINCT FROM expected_matrix_write THEN
      RAISE EXCEPTION '% matrix write does not match manage_permissions=%',
        persona.email, expected_matrix_write;
    END IF;

    RAISE NOTICE 'PASS % (%) submit=% feed=% audit=% matrix=%',
      persona.email,
      persona.role,
      expected_submit,
      expected_feed,
      expected_audit,
      expected_matrix_write;
  END LOOP;
END;
$$;

ROLLBACK;

