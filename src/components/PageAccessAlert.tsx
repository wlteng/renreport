import { useLocation } from "@tanstack/react-router";
import { ShieldCheck } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { roleHasPermission, useRolePermissions } from "@/hooks/useData";
import { useLanguage } from "@/lib/i18n";
import {
  defaultPermissionsFor,
  ROLE_LABEL,
  ROLE_ORDER,
  type AppRole,
  type PermissionKey,
} from "@/lib/roles";

function pageCapability(pathname: string): PermissionKey | null {
  if (pathname === "/reports/new") return "submit_work";
  if (pathname === "/review") return "view_staff_feed";
  return null;
}

type AccessRule = { roles: AppRole[]; detail: string };

function pageScope(pathname: string): AccessRule[] {
  if (pathname === "/projects" || pathname.startsWith("/projects/")) {
    return [
      { roles: ["staff"], detail: "See only projects assigned to them." },
      { roles: ["admin", "boss", "manager"], detail: "See all projects." },
      {
        roles: ["admin"],
        detail: "Can edit every project and manage project staff assignments.",
      },
    ];
  }
  if (pathname === "/reports/new") {
    return [
      {
        roles: ROLE_ORDER,
        detail: "Can submit work only to assigned active projects.",
      },
    ];
  }
  if (pathname === "/review") {
    return [
      {
        roles: ROLE_ORDER,
        detail: "Can view the staff feed only when the capability is enabled.",
      },
    ];
  }
  if (pathname === "/expenses") {
    return [
      { roles: ["staff"], detail: "See their own expenses and submit to active projects." },
      {
        roles: ["manager"],
        detail: "Can see all expenses when the view-expenses capability is enabled.",
      },
      {
        roles: ["admin", "boss"],
        detail: "Can review another person's submitted expenses when approval is enabled.",
      },
    ];
  }
  if (pathname === "/profile") {
    return [
      { roles: ROLE_ORDER, detail: "Can update only their own profile." },
      { roles: ["admin"], detail: "Manage staff accounts from the admin workspace." },
    ];
  }
  return [{ roles: ROLE_ORDER, detail: "Content follows each account's assigned capabilities." }];
}

export function PageAccessAlert({ adminOnly = false }: { adminOnly?: boolean }) {
  const location = useLocation();
  const rolePermissions = useRolePermissions();
  const { t } = useLanguage();
  const capability = adminOnly ? null : pageCapability(location.pathname);
  const scope: AccessRule[] = adminOnly
    ? [{ roles: ["admin"], detail: "Only admins can use this workspace." }]
    : pageScope(location.pathname);
  const roles: AppRole[] = adminOnly
    ? ["admin"]
    : capability
      ? ROLE_ORDER.filter((role) =>
          rolePermissions.data
            ? roleHasPermission(rolePermissions.data, role, capability)
            : defaultPermissionsFor([role]).includes(capability),
        )
      : ROLE_ORDER;
  const visibleScope = scope
    .map((rule) => ({ ...rule, roles: rule.roles.filter((role) => roles.includes(role)) }))
    .filter((rule) => rule.roles.length > 0);

  return (
    <Alert className="mt-10 bg-muted/40">
      <ShieldCheck />
      <AlertTitle>{t("Page access")}</AlertTitle>
      <AlertDescription>
        <p>
          {t("Available to")}:{" "}
          {roles.length
            ? roles.map((role) => t(ROLE_LABEL[role])).join(" · ")
            : t("No roles configured")}
        </p>
        <div className="mt-2 divide-y divide-border/70 border-t border-border/70">
          {visibleScope.map((rule) => (
            <div
              key={`${rule.roles.join("-")}-${rule.detail}`}
              className="grid gap-1 py-2 sm:grid-cols-[12rem_1fr]"
            >
              <p className="font-medium text-foreground">
                {rule.roles.map((role) => t(ROLE_LABEL[role])).join(" · ")}
              </p>
              <p className="text-muted-foreground">{t(rule.detail)}</p>
            </div>
          ))}
        </div>
      </AlertDescription>
    </Alert>
  );
}
