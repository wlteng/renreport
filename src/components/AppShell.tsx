import { useQueryClient } from "@tanstack/react-query";
import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import {
  BarChart3,
  Home,
  Languages,
  LogOut,
  Pickaxe,
  ReceiptText,
  Settings,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { PageAccessAlert } from "@/components/PageAccessAlert";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useMe } from "@/hooks/useSession";
import { supabase } from "@/integrations/supabase/client";
import {
  hasCapability,
  highestRole,
  ROLE_LABEL,
  type AppRole,
  type PermissionKey,
} from "@/lib/roles";
import { personInitials } from "@/lib/people";
import { staffLoginLabel } from "@/lib/staffAuth";
import { useLanguage } from "@/lib/i18n";
import { cn } from "@/lib/utils";

type NavItem = { to: string; label: string; icon: LucideIcon };

function navItemsFor(
  roles: AppRole[],
  permissions: PermissionKey[] | undefined,
  t: (text: string) => string,
): NavItem[] {
  const items: NavItem[] = [{ to: "/dashboard", label: t("Home"), icon: Home }];
  if (hasCapability(permissions, "view_staff_feed", roles)) {
    items.push({ to: "/review", label: t("Staff activity"), icon: BarChart3 });
  }
  items.push({ to: "/projects", label: t("Projects"), icon: Pickaxe });
  items.push({ to: "/expenses", label: t("Expenses"), icon: ReceiptText });
  return items;
}

export function PageHeader({ title, action }: { title: string; action?: ReactNode }) {
  const { t } = useLanguage();
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">{t(title)}</h1>
      </div>
      {action}
    </header>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { profile, roles, permissions } = useMe();
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { language, setLanguage, t } = useLanguage();
  const items = navItemsFor(roles, permissions, t);

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
      <aside className="fixed inset-y-0 left-0 hidden w-60 flex-col border-r border-border bg-sidebar px-3 py-5 lg:flex">
        <div className="px-3 pb-6">
          <div className="flex items-center gap-2 text-base font-semibold tracking-tight">
            <img src="/icons/icon-192.png" alt="" className="size-8 rounded-lg" />
            {t("Ren Report")}
          </div>
          <div className="logbook-label mt-1">
            {roles.length ? t(ROLE_LABEL[highestRole(roles)]) : "—"}
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
                  ? "bg-sidebar-accent font-medium text-sidebar-primary"
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
            {profile?.full_name || (profile?.email ? staffLoginLabel(profile.email) : null)}
          </div>
        </div>
      </aside>

      <header className="sticky top-0 z-40 flex min-h-[calc(4rem+env(safe-area-inset-top,0px))] items-center justify-between border-b border-border bg-card/90 pb-0 pl-[max(1rem,env(safe-area-inset-left,0px))] pr-[max(1rem,env(safe-area-inset-right,0px))] pt-[env(safe-area-inset-top,0px)] backdrop-blur lg:ml-60 lg:px-10">
        <div className="flex items-center gap-2 text-sm font-semibold tracking-tight lg:hidden">
          <img src="/icons/icon-192.png" alt="" className="size-7 rounded-md" />
          {t("Ren Report")}
        </div>
        <div className="hidden text-sm text-muted-foreground lg:block">
          {t("Mining operations logbook")}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={t("Open profile menu")}
              className="flex items-center gap-2 rounded-full outline-none ring-offset-background transition-opacity hover:opacity-80 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <Avatar className="size-9 border border-border">
                <AvatarImage src={profile?.avatar_url ?? undefined} alt="" />
                <AvatarFallback className="text-xs font-semibold">
                  {personInitials(profile?.full_name, profile?.email)}
                </AvatarFallback>
              </Avatar>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            <DropdownMenuLabel className="font-normal">
              <p className="truncate text-sm font-medium text-foreground">
                {profile?.full_name || t("Your account")}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {profile?.email ? staffLoginLabel(profile.email) : null}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {roles.length ? t(ROLE_LABEL[highestRole(roles)]) : t("No role assigned")}
              </p>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {roles.includes("admin") ? (
              <DropdownMenuItem asChild>
                <Link to="/admin" search={{ section: "people" }}>
                  <Users />
                  {t("Admin workspace")}
                </Link>
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuItem asChild>
              <Link to="/profile">
                <Settings />
                {t("Profile")}
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <Languages />
                {t("Language")}
              </DropdownMenuSubTrigger>
              <DropdownMenuPortal>
                <DropdownMenuSubContent>
                  <DropdownMenuRadioGroup
                    value={language}
                    onValueChange={(value) => {
                      if (value === "en" || value === "zh") setLanguage(value);
                    }}
                  >
                    <DropdownMenuRadioItem value="en">English</DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="zh">中文</DropdownMenuRadioItem>
                  </DropdownMenuRadioGroup>
                </DropdownMenuSubContent>
              </DropdownMenuPortal>
            </DropdownMenuSub>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:bg-destructive/10 focus:text-destructive"
              onSelect={() => void signOut()}
            >
              <LogOut />
              {t("Sign out")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      <main className="pb-28 pl-[max(1rem,env(safe-area-inset-left,0px))] pr-[max(1rem,env(safe-area-inset-right,0px))] pt-6 lg:ml-60 lg:px-10 lg:pb-12">
        <div className="mx-auto w-full max-w-5xl">
          {children}
          {location.pathname !== "/theme-preview" ? <PageAccessAlert /> : null}
        </div>
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-40 flex items-stretch gap-1 overflow-x-auto border-t border-border bg-card pb-[calc(env(safe-area-inset-bottom,0px)+8px)] pl-[max(0.25rem,env(safe-area-inset-left,0px))] pr-[max(0.25rem,env(safe-area-inset-right,0px))] pt-2 lg:hidden">
        {items.map((item) => (
          <Link
            key={item.to}
            to={item.to}
            className={cn(
              "flex min-w-20 flex-1 flex-col items-center gap-1 px-2 py-1 text-[10px] transition-colors",
              isActive(item.to) ? "text-primary" : "text-muted-foreground",
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
