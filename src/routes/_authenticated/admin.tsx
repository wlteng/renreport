import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";

import { AdminWorkspace, type AdminSection } from "@/components/AdminWorkspace";
import { AdminPeople, DepartmentsDialog } from "@/components/AdminPeople";
import { AdminProjects } from "@/components/AdminProjects";
import { PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  useAllRoles,
  useCompensation,
  useDepartments,
  usePeople,
  usePermissions,
  useRolePermissions,
  roleHasPermission,
  type CompensationRow,
  type Department,
  type PersonRow,
} from "@/hooks/useData";
import { useMe } from "@/hooks/useSession";
import { supabase } from "@/integrations/supabase/client";
import { CURRENCY_OPTIONS } from "@/lib/currencies";
import { useLanguage } from "@/lib/i18n";
import { personDisplayName } from "@/lib/people";
import {
  hasCapability,
  ROLE_DESCRIPTION,
  ROLE_LABEL,
  ROLE_ORDER,
  type AppRole,
  type PermissionKey,
} from "@/lib/roles";
import {
  compensationSchema,
  createStaffSchema,
  departmentSchema,
  firstValidationError,
  permissionMutationSchema,
  personDetailsSchema,
  personMutationSchema,
  roleMutationSchema,
} from "@/lib/validation";
import { staffLoginLabel } from "@/lib/staffAuth";

export const Route = createFileRoute("/_authenticated/admin")({
  validateSearch: (search: Record<string, unknown>): { section: AdminSection } => ({
    section:
      search["section"] === "projects" || search["section"] === "permissions"
        ? search["section"]
        : "people",
  }),
  head: () => ({
    meta: [
      { title: "Admin — Ren Report" },
      {
        name: "description",
        content: "Manage projects, mining staff, departments, permissions and audit records.",
      },
      { property: "og:title", content: "Admin — Ren Report" },
      { property: "og:description", content: "Mining operations administration." },
    ],
  }),
  component: AdminPage,
});

const ADMIN_PAGE_TITLE: Record<AdminSection, string> = {
  people: "People & roles",
  projects: "Projects",
  permissions: "Capabilities",
};

function AdminPage() {
  const { user, roles, permissions: myPermissions } = useMe();
  const { t } = useLanguage();
  const people = usePeople();
  const allRoles = useAllRoles();
  const departments = useDepartments();
  const permissions = usePermissions();
  const rolePermissions = useRolePermissions();
  const canCompensate = hasCapability(myPermissions, "manage_compensation", roles);
  const compensation = useCompensation(canCompensate);
  const queryClient = useQueryClient();
  const { section: tab } = Route.useSearch();
  const [matrixResult, setMatrixResult] = useState<
    { status: "accepted" | "rejected"; message: string } | undefined
  >();
  const setPermission = useMutation({
    mutationFn: async (input: {
      role: AppRole;
      permission_key: PermissionKey;
      enabled: boolean;
    }) => {
      const parsed = permissionMutationSchema.safeParse(input);
      if (!parsed.success) throw new Error(firstValidationError(parsed.error));
      const { data, error } = await supabase
        .from("role_permissions")
        .upsert(parsed.data, { onConflict: "role,permission_key" })
        .select("role, permission_key, enabled")
        .single();
      if (error) throw new Error(`${t("Database policy rejected the change")}: ${error.message}`);
      if (
        data.role !== parsed.data.role ||
        data.permission_key !== parsed.data.permission_key ||
        data.enabled !== parsed.data.enabled
      ) {
        throw new Error(t("Database validation returned an unexpected capability value"));
      }
      return data;
    },
    onSuccess: (saved) => {
      const message = `${t(ROLE_LABEL[saved.role as AppRole])} · ${t(saved.permission_key)} ${t(saved.enabled ? "enabled" : "disabled")}`;
      setMatrixResult({ status: "accepted", message: `${t("RLS accepted")}: ${message}` });
      toast.success(t("Capability saved after database validation"));
      queryClient.invalidateQueries({ queryKey: ["role-permissions"] });
      queryClient.invalidateQueries({ queryKey: ["my-permissions"] });
      queryClient.invalidateQueries({ queryKey: ["admin-audit"] });
    },
    onError: (error) => {
      const message =
        error instanceof Error ? error.message : t("Database policy rejected the change");
      setMatrixResult({ status: "rejected", message });
      toast.error(message);
    },
  });

  if (!roles.includes("admin"))
    return (
      <div className="logbook-card p-10 text-center">
        <p className="text-sm text-muted-foreground">{t("Admins only.")}</p>
      </div>
    );

  return (
    <AdminWorkspace
      activeSection={tab}
      canViewAudit={hasCapability(myPermissions, "view_audit_log", roles)}
    >
      <PageHeader
        title={ADMIN_PAGE_TITLE[tab]}
        action={
          tab === "people" ? (
            <div className="flex flex-wrap items-center gap-2">
              <DepartmentsDialog departments={departments.data ?? []} people={people.data ?? []} />
              <CreateStaff departments={departments.data ?? []} />
            </div>
          ) : undefined
        }
      />

      {tab === "people" ? (
        <AdminPeople
          people={people.data ?? []}
          isLoading={people.isLoading}
          roles={allRoles.data ?? []}
          departments={departments.data ?? []}
          compensation={compensation.data ?? []}
          canCompensate={canCompensate}
          currentUserId={user?.id}
        />
      ) : null}

      {tab === "projects" ? <AdminProjects /> : null}

      {tab === "permissions" ? (
        <div className="space-y-4">
          <div className="rounded-lg border border-border bg-muted px-4 py-3 text-sm text-muted-foreground">
            {t(
              "Every toggle is saved through Supabase row-level security and confirmed from the row the database returns. Admin capabilities stay enabled as the recovery baseline.",
            )}
          </div>
          {matrixResult ? (
            <div
              aria-live="polite"
              className={
                matrixResult.status === "accepted"
                  ? "rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-300"
                  : "rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
              }
            >
              {matrixResult.message}
            </div>
          ) : null}
          <div className="logbook-card overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-4 py-3 text-left font-medium">{t("Capability")}</th>
                  {ROLE_ORDER.map((role) => (
                    <th key={role} className="px-4 py-3 text-center font-medium">
                      {t(ROLE_LABEL[role])}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(permissions.data ?? []).map((permission) => (
                  <tr key={permission.key} className="border-b border-border last:border-0">
                    <td className="px-4 py-3">
                      <p className="font-medium">{t(permission.label)}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {t(permission.description)}
                      </p>
                    </td>
                    {ROLE_ORDER.map((role) => {
                      const enabled = roleHasPermission(
                        rolePermissions.data ?? [],
                        role,
                        permission.key as PermissionKey,
                      );
                      const isSaving =
                        setPermission.isPending &&
                        setPermission.variables?.role === role &&
                        setPermission.variables.permission_key === permission.key;
                      return (
                        <td key={role} className="px-4 py-3 text-center">
                          <div className="flex flex-col items-center gap-1">
                            <Switch
                              checked={enabled}
                              disabled={role === "admin" || setPermission.isPending}
                              onCheckedChange={(checked) =>
                                setPermission.mutate({
                                  role,
                                  permission_key: permission.key as PermissionKey,
                                  enabled: checked,
                                })
                              }
                              aria-label={`${t(permission.label)} · ${t(ROLE_LABEL[role])}`}
                              title={
                                role === "admin"
                                  ? t("Admin capabilities are always enabled")
                                  : undefined
                              }
                            />
                            <span className="text-[10px] text-muted-foreground">
                              {isSaving ? t("Checking RLS…") : enabled ? t("On") : t("Off")}
                            </span>
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </AdminWorkspace>
  );
}

function CreateStaff({ departments }: { departments: Department[] }) {
  const queryClient = useQueryClient();
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    full_name: "",
    username: "",
    password: "",
    job_title: "",
    resume: "",
    department_id: "",
    role: "staff",
    salary_amount: "0",
    salary_type: "monthly",
    currency: "USD",
    standard_hours: "160",
  });
  const update = (key: keyof typeof form, value: string) =>
    setForm((current) => ({ ...current, [key]: value }));
  const create = useMutation({
    mutationFn: async () => {
      const parsed = createStaffSchema.safeParse(form);
      if (!parsed.success) throw new Error(firstValidationError(parsed.error));
      const { data, error } = await supabase.functions.invoke("admin-create-user", {
        body: parsed.data,
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
    },
    onSuccess: () => {
      toast.success(t("Staff added"));
      setOpen(false);
      setForm({
        full_name: "",
        username: "",
        password: "",
        job_title: "",
        resume: "",
        department_id: "",
        role: "staff",
        salary_amount: "0",
        salary_type: "monthly",
        currency: "USD",
        standard_hours: "160",
      });
      queryClient.invalidateQueries({ queryKey: ["people"] });
      queryClient.invalidateQueries({ queryKey: ["all-roles"] });
      queryClient.invalidateQueries({ queryKey: ["compensation"] });
    },
    onError: (error) => showError(error, t),
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>{t("Add staff")}</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("Add staff")}</DialogTitle>
          <DialogDescription>
            {t("Create a staff login. Employment details are optional.")}
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            create.mutate();
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Display name" id="sname">
              <Input
                id="sname"
                autoFocus
                value={form.full_name}
                onChange={(event) => update("full_name", event.target.value)}
                required
              />
            </Field>
            <Field label="Username" id="susername">
              <Input
                id="susername"
                value={form.username}
                onChange={(event) => update("username", event.target.value.toLowerCase())}
                autoCapitalize="none"
                autoCorrect="off"
                autoComplete="off"
                minLength={3}
                required
              />
            </Field>
            <Field label="Password" id="spass">
              <Input
                id="spass"
                type="password"
                value={form.password}
                onChange={(event) => update("password", event.target.value)}
                autoComplete="new-password"
                minLength={8}
                required
              />
            </Field>
          </div>

          <details className="rounded-md border border-border p-4">
            <summary className="cursor-pointer text-sm font-medium">
              {t("Optional employment details")}
            </summary>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field label="Job title" id="stitle">
                <Input
                  id="stitle"
                  value={form.job_title}
                  onChange={(event) => update("job_title", event.target.value)}
                />
              </Field>
              <Field label="Department" id="sdept">
                <select
                  id="sdept"
                  className="h-10 w-full rounded-md border border-input bg-card px-3 text-base sm:text-sm"
                  value={form.department_id}
                  onChange={(event) => update("department_id", event.target.value)}
                >
                  <option value="">{t("Unassigned")}</option>
                  {departments.map((department) => (
                    <option key={department.id} value={department.id}>
                      {department.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Salary" id="ssalary">
                <Input
                  id="ssalary"
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.salary_amount}
                  onChange={(event) => update("salary_amount", event.target.value)}
                />
              </Field>
              <Field label="Salary type" id="stype">
                <select
                  id="stype"
                  className="h-10 w-full rounded-md border border-input bg-card px-3 text-base sm:text-sm"
                  value={form.salary_type}
                  onChange={(event) => update("salary_type", event.target.value)}
                >
                  <option value="monthly">{t("Monthly")}</option>
                  <option value="hourly">{t("Hourly")}</option>
                  <option value="daily">{t("Daily")}</option>
                </select>
              </Field>
              <Field label="Currency" id="scurrency">
                <select
                  id="scurrency"
                  className="h-10 w-full rounded-md border border-input bg-card px-3 text-base sm:text-sm"
                  value={form.currency}
                  onChange={(event) => update("currency", event.target.value)}
                >
                  {CURRENCY_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Standard monthly hours" id="shours">
                <Input
                  id="shours"
                  type="number"
                  min="0.25"
                  max="744"
                  step="0.25"
                  value={form.standard_hours}
                  onChange={(event) => update("standard_hours", event.target.value)}
                />
              </Field>
              <div className="sm:col-span-2">
                <Field label="Résumé / mining experience" id="sresume">
                  <Textarea
                    id="sresume"
                    rows={4}
                    maxLength={5000}
                    placeholder={t(
                      "Employment history, mine types, technical experience, and qualifications",
                    )}
                    value={form.resume}
                    onChange={(event) => update("resume", event.target.value)}
                  />
                </Field>
              </div>
            </div>
          </details>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                {t("Cancel")}
              </Button>
            </DialogClose>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? t("Adding…") : t("Add staff")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, id, children }: { label: string; id: string; children: ReactNode }) {
  const { t } = useLanguage();
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{t(label)}</Label>
      {children}
    </div>
  );
}
function showError(error: unknown, t: (text: string) => string) {
  toast.error(error instanceof Error ? error.message : t("Operation failed"));
}
