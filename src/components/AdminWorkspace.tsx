import { Link } from "@tanstack/react-router";
import { Building2, ChevronLeft, ChevronRight, ScrollText, ShieldCheck, Users } from "lucide-react";
import { useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
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

  return (
    <div className="flex min-h-[calc(100vh-10rem)] overflow-hidden rounded-xl border border-border bg-card shadow-xs">
      <aside
        aria-label="Admin navigation"
        className={cn(
          "w-16 shrink-0 border-r border-border bg-sidebar transition-[width] duration-200 sm:w-16",
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
                <p className="truncate text-sm font-semibold">Admin</p>
                <p className="truncate text-[10px] uppercase tracking-wider text-muted-foreground">
                  Workspace
                </p>
              </div>
            </div>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={expanded ? "Collapse admin sidebar" : "Expand admin sidebar"}
            title={expanded ? "Collapse admin sidebar" : "Expand admin sidebar"}
            className="hidden size-8 shrink-0 sm:inline-flex"
            onClick={() => setExpanded((current) => !current)}
          >
            {expanded ? <ChevronLeft /> : <ChevronRight />}
          </Button>
        </div>

        <nav className="space-y-1 p-2">
          {ADMIN_NAVIGATION.map((item) => {
            const Icon = item.icon;
            const active = activeSection === item.id;
            return (
              <Link
                key={item.id}
                to="/admin"
                search={{ section: item.id }}
                aria-current={active ? "page" : undefined}
                title={!expanded ? item.label : undefined}
                className={cn(
                  "flex h-10 w-full items-center gap-3 rounded-lg px-3 text-sm transition-colors",
                  active
                    ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                    : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground",
                )}
              >
                <Icon className="size-4 shrink-0" />
                {expanded ? <span className="hidden truncate sm:block">{item.label}</span> : null}
              </Link>
            );
          })}
          {canViewAudit ? (
            <Link
              to="/admin-audit"
              aria-current={activeSection === "audit" ? "page" : undefined}
              title={!expanded ? "Audit log" : undefined}
              className={cn(
                "flex h-10 items-center gap-3 rounded-lg px-3 text-sm transition-colors",
                activeSection === "audit"
                  ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                  : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground",
              )}
            >
              <ScrollText className="size-4 shrink-0" />
              {expanded ? <span className="hidden truncate sm:block">Audit log</span> : null}
            </Link>
          ) : null}
        </nav>
      </aside>

      <section className="min-w-0 flex-1 bg-background p-4 sm:p-6">{children}</section>
    </div>
  );
}
