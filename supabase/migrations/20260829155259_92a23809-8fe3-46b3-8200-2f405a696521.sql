REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.log_role_change() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.protect_last_admin() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.has_any_role(uuid, public.app_role[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.my_department() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.user_department(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_view_reports_of(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_any_role(uuid, public.app_role[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.my_department() TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_department(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_view_reports_of(uuid) TO authenticated;