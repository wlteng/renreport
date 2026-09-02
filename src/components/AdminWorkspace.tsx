import { Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  Building2,
  ChevronLeft,
  ChevronRight,
  ScrollText,
  ShieldCheck,
  Users,
} from "lucide-react";
import { useState, type ReactNode } from "react";

import { PageAccessAlert } from "@/components/PageAccessAlert";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export type AdminSection = "people" | "departments" | "permissions";

const ADMIN_NAVIGATION = [
  { id: "people", label: "People & roles", icon: Users },
  { id: "departments", label: "Departments", icon: Building2 },
  { id: "permissions", label: "Capabilities", icon: ShieldCheck },
] as const;

export function AdminWorkspace({
  activeSection,
  canViewAudit,
  children,
}: {
  activeSection: AdminSection | "audit";
  canViewAudit: boolean;
  children: ReactNode;
}) {
  const [expanded, setExpanded] = useState(true);
  const { t } = useLanguage();

  return (
    <div className="flex min-h-screen overflow-hidden bg-card">
      <aside
        aria-label={t("Admin navigation")}
        className={cn(
          "sticky top-0 flex h-screen w-16 shrink-0 flex-col border-r border-border bg-sidebar transition-[width] duration-200 sm:w-16",
          expanded && "sm:w-56",
        )}
      >
        <div
          className={cn(
            "flex h-16 items-center border-b border-sidebar-border px-3",
            expanded ? "justify-between" : "justify-center",
          )}
        >
          {expanded ? (
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <ShieldCheck className="size-4" />
              </div>
              <div className="hidden min-w-0 sm:block">
                <p className="truncate text-sm font-semibold">{t("Admin")}</p>
                <p className="truncate text-[10px] uppercase tracking-wider text-muted-foreground">
                  {t("Workspace")}
                </p>
              </div>
            </div>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={t(expanded ? "Collapse admin sidebar" : "Expand admin sidebar")}
            title={t(expanded ? "Collapse admin sidebar" : "Expand admin sidebar")}
            className="hidden size-8 shrink-0 sm:inline-flex"
            onClick={() => setExpanded((current) => !current)}
          >
            {expanded ? <ChevronLeft /> : <ChevronRight />}
          </Button>
        </div>

        <nav className="flex-1 space-y-1 p-2">
          {ADMIN_NAVIGATION.map((item) => {
            const Icon = item.icon;
            const active = activeSection === item.id;
            return (
              <Link
                key={item.id}
                to="/admin"
                search={{ section: item.id }}
                aria-current={active ? "page" : undefined}
                title={!expanded ? t(item.label) : undefined}
                className={cn(
                  "flex h-10 w-full items-center gap-3 rounded-lg px-3 text-sm transition-colors",
                  active
                    ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                    : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground",
                )}
              >
                <Icon className="size-4 shrink-0" />
                {expanded ? (
                  <span className="hidden truncate sm:block">{t(item.label)}</span>
                ) : null}
              </Link>
            );
          })}
          {canViewAudit ? (
            <Link
              to="/admin-audit"
              aria-current={activeSection === "audit" ? "page" : undefined}
              title={!expanded ? t("Audit log") : undefined}
              className={cn(
                "flex h-10 items-center gap-3 rounded-lg px-3 text-sm transition-colors",
                activeSection === "audit"
                  ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                  : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground",
              )}
            >
              <ScrollText className="size-4 shrink-0" />
              {expanded ? <span className="hidden truncate sm:block">{t("Audit log")}</span> : null}
            </Link>
          ) : null}
        </nav>

        <div className="border-t border-sidebar-border p-2">
          <Link
            to="/dashboard"
            title={!expanded ? t("Back to app") : undefined}
            className="flex h-10 items-center gap-3 rounded-lg px-3 text-sm text-muted-foreground transition-colors hover:bg-sidebar-accent/60 hover:text-foreground"
          >
            <ArrowLeft className="size-4 shrink-0" />
            {expanded ? <span className="hidden truncate sm:block">{t("Back to app")}</span> : null}
          </Link>
        </div>
      </aside>

      <main className="min-h-screen min-w-0 flex-1 bg-background p-4 sm:p-6">
        {children}
        <PageAccessAlert adminOnly />
      </main>
    </div>
  );
}
