import { createFileRoute, Outlet, redirect, useLocation } from "@tanstack/react-router";

import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session?.user) throw redirect({ to: "/auth" });
    return { user: data.session.user };
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const location = useLocation();
  const isAdminRoute = location.pathname === "/admin" || location.pathname === "/admin-audit";

  if (isAdminRoute) return <Outlet />;

  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}
