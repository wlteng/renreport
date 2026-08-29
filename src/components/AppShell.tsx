import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  BarChart3,
  FileText,
  FolderKanban,
  Home,
  LogOut,
  PenLine,
  Settings,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { can, highestRole, ROLE_LABEL, type AppRole } from "@/lib/roles";
import { useMe } from "@/hooks/useSession";

type NavItem = { to: string; label: string; icon: LucideIcon };

export function navItemsFor(roles: AppRole[]): NavItem[] {
  const items: NavItem[] = [{ to: "/dashboard", label: "Home", icon: Home }];
  items.push({ to: "/reports/new", label: "Write", icon: PenLine });
  items.push({ to: "/reports", label: "My log", icon: FileText });
  if (can.viewTeamReports(roles)) items.push({ to: "/review", label: "Review", icon: BarChart3 });
  items.push({ to: "/projects", label: "Projects", icon: FolderKanban });
  if (can.administer(roles)) items.push({ to: "/admin", label: "Admin", icon: Users });
  items.push({ to: "/profile", label: "Profile", icon: Settings });
  return items;
}

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
        {subtitle ? <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p> : null}
      </div>
      {action}
    </header>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { profile, roles } = useMe();
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const items = navItemsFor(roles);

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  const isActive = (to: string) =>
    to === "/dashboard" ? location.pathname === to : location.pathname.startsWith(to);

  return (
    <div className="min-h-screen bg-background">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 hidden w-60 flex-col border-r border-border bg-sidebar px-3 py-5 lg:flex">
        <div className="px-3 pb-6">
          <div className="text-base font-semibold tracking-tight">JJ Report</div>
          <div className="logbook-label mt-1">
            {roles.length ? ROLE_LABEL[highestRole(roles)] : "—"}
          </div>
        </div>
        <nav className="flex flex-1 flex-col gap-0.5">
          {items.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                isActive(item.to)
                  ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                  : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground",
              )}
            >
              <item.icon className="size-4" />
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="border-t border-sidebar-border pt-3">
          <div className="truncate px-3 pb-2 text-xs text-muted-foreground">
            {profile?.full_name || profile?.email}
          </div>
          <button
            onClick={signOut}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-sidebar-accent/60 hover:text-foreground"
          >
            <LogOut className="size-4" />
            Sign out
          </button>
        </div>
      </aside>

      {/* Mobile top bar */}
      <div className="sticky top-0 z-40 flex items-center justify-between border-b border-border bg-card/90 px-4 py-3 backdrop-blur lg:hidden">
        <div className="text-sm font-semibold tracking-tight">JJ Report</div>
        <button
          onClick={signOut}
          className="text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          Sign out
        </button>
      </div>

      <main className="px-4 pb-28 pt-6 lg:ml-60 lg:px-10 lg:pb-12">
        <div className="mx-auto w-full max-w-5xl">{children}</div>
      </main>

      {/* Mobile bottom nav */}
      <nav className="fixed inset-x-0 bottom-0 z-40 flex items-stretch justify-around border-t border-border bg-card px-1 pb-[calc(env(safe-area-inset-bottom,0px)+8px)] pt-2 lg:hidden">
        {items.slice(0, 5).map((item) => (
          <Link
            key={item.to}
            to={item.to}
            className={cn(
              "flex min-w-0 flex-col items-center gap-1 px-2 py-1 text-[10px] transition-colors",
              isActive(item.to) ? "text-foreground" : "text-muted-foreground",
            )}
          >
            <item.icon className="size-5" />
            <span className="truncate">{item.label}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}
