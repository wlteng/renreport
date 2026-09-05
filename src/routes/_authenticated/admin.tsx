import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";

import { AdminWorkspace, type AdminSection } from "@/components/AdminWorkspace";
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
      search["section"] === "projects" ||
      search["section"] === "departments" ||
      search["section"] === "permissions"
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
  departments: "Departments",
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
  const [departmentOpen, setDepartmentOpen] = useState(false);
  const [deptName, setDeptName] = useState("");
  const [deptDescription, setDeptDescription] = useState("");

  const createDepartment = useMutation({
    mutationFn: async () => {
      const parsed = departmentSchema.safeParse({ name: deptName, description: deptDescription });
      if (!parsed.success) throw new Error(firstValidationError(parsed.error));
      const { error } = await supabase
        .from("departments")
        .insert({ name: parsed.data.name, description: parsed.data.description ?? null });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t("Department created"));
      setDepartmentOpen(false);
      setDeptName("");
      setDeptDescription("");
      queryClient.invalidateQueries({ queryKey: ["departments"] });
    },
    onError: (error) => showError(error, t),
  });

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
            <CreateStaff departments={departments.data ?? []} />
          ) : tab === "departments" ? (
            <Button onClick={() => setDepartmentOpen(true)}>{t("Add department")}</Button>
          ) : undefined
        }
      />

      {tab === "people" ? (
        <div className="space-y-4">
          {(people.data ?? []).map((person) => (
            <PersonCard
              key={`${person.id}-${compensation.data?.find((row) => row.user_id === person.id)?.updated_at ?? "pending"}`}
              person={person}
              held={(allRoles.data ?? []).filter((role) => role.user_id === person.id)}
              departments={departments.data ?? []}
              compensation={compensation.data?.find((row) => row.user_id === person.id)}
              canCompensate={canCompensate}
              currentUserId={user?.id}
            />
          ))}
        </div>
      ) : null}

      {tab === "projects" ? <AdminProjects /> : null}

      {tab === "departments" ? (
        <div className="space-y-6">
          <Dialog open={departmentOpen} onOpenChange={setDepartmentOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t("Add department")}</DialogTitle>
                <DialogDescription>
                  {t("Create a department for organizing staff and mine operations.")}
                </DialogDescription>
              </DialogHeader>
              <form
                className="space-y-4"
                onSubmit={(event) => {
                  event.preventDefault();
                  createDepartment.mutate();
                }}
              >
                <Field label="Department name" id="dname">
                  <Input
                    id="dname"
                    value={deptName}
                    onChange={(event) => setDeptName(event.target.value)}
                    placeholder={t("e.g. Mine operations")}
                  />
                </Field>
                <Field label="Description" id="ddesc">
                  <Textarea
                    id="ddesc"
                    rows={3}
                    value={deptDescription}
                    onChange={(event) => setDeptDescription(event.target.value)}
                  />
                </Field>
                <DialogFooter>
                  <DialogClose asChild>
                    <Button type="button" variant="outline">
                      {t("Cancel")}
                    </Button>
                  </DialogClose>
                  <Button type="submit" disabled={createDepartment.isPending}>
                    {createDepartment.isPending ? t("Adding…") : t("Add department")}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
          <div className="logbook-card divide-y divide-border">
            {(departments.data ?? []).map((department) => (
              <DepartmentCard
                key={department.id}
                department={department}
                staffCount={
                  (people.data ?? []).filter((person) => person.department_id === department.id)
                    .length
                }
              />
            ))}
            {!departments.isLoading && (departments.data ?? []).length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-muted-foreground">
                {t("No departments yet.")}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}

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

function PersonCard({
  person,
  held,
  departments,
  compensation,
  canCompensate,
  currentUserId,
}: {
  person: PersonRow;
  held: { id: string; user_id: string; role: AppRole }[];
  departments: Department[];
  compensation: CompensationRow | undefined;
  canCompensate: boolean;
  currentUserId: string | undefined;
}) {
  const queryClient = useQueryClient();
  const { t } = useLanguage();
  const [fullName, setFullName] = useState(person.full_name ?? "");
  const [jobTitle, setJobTitle] = useState(person.job_title ?? "");
  const [resume, setResume] = useState(person.resume ?? "");
  const [salary, setSalary] = useState(String(compensation?.salary_amount ?? 0));
  const [salaryType, setSalaryType] = useState(compensation?.salary_type ?? "monthly");
  const [currency, setCurrency] = useState(compensation?.currency ?? "USD");
  const [hours, setHours] = useState(String(compensation?.standard_hours ?? 160));
  const refreshPeople = () => queryClient.invalidateQueries({ queryKey: ["people"] });
  const refreshRoles = () => {
    queryClient.invalidateQueries({ queryKey: ["all-roles"] });
    queryClient.invalidateQueries({ queryKey: ["roles"] });
    queryClient.invalidateQueries({ queryKey: ["role-audit"] });
  };
  const profileMutation = useMutation({
    mutationFn: async (input: { user_id: string; department_id?: string; is_active?: boolean }) => {
      const parsed = personMutationSchema.safeParse(input);
      if (!parsed.success) throw new Error(firstValidationError(parsed.error));
      const update: { department_id?: string | null; is_active?: boolean } = {};
      if ("department_id" in input) update.department_id = parsed.data.department_id ?? null;
      if (parsed.data.is_active !== undefined) update.is_active = parsed.data.is_active;
      const { error } = await supabase
        .from("profiles")
        .update(update)
        .eq("id", parsed.data.user_id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t("Staff profile updated"));
      refreshPeople();
    },
    onError: (error) => showError(error, t),
  });
  const detailsMutation = useMutation({
    mutationFn: async () => {
      const parsed = personDetailsSchema.safeParse({
        user_id: person.id,
        full_name: fullName,
        job_title: jobTitle,
        resume,
      });
      if (!parsed.success) throw new Error(firstValidationError(parsed.error));
      const { error } = await supabase
        .from("profiles")
        .update({
          full_name: parsed.data.full_name,
          job_title: parsed.data.job_title ?? null,
          resume: parsed.data.resume ?? null,
        })
        .eq("id", parsed.data.user_id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t("Staff details updated"));
      refreshPeople();
    },
    onError: (error) => showError(error, t),
  });
  const roleMutation = useMutation({
    mutationFn: async ({ role, ownedId }: { role: AppRole; ownedId: string | undefined }) => {
      const parsed = roleMutationSchema.safeParse({ user_id: person.id, role });
      if (!parsed.success) throw new Error(firstValidationError(parsed.error));
      const result = ownedId
        ? await supabase.from("user_roles").delete().eq("id", ownedId)
        : await supabase
            .from("user_roles")
            .insert({ user_id: parsed.data.user_id, role: parsed.data.role });
      if (result.error) throw result.error;
    },
    onSuccess: () => {
      toast.success(t("Role updated"));
      refreshRoles();
    },
    onError: (error) => showError(error, t),
  });
  const saveCompensation = useMutation({
    mutationFn: async () => {
      const parsed = compensationSchema.safeParse({
        user_id: person.id,
        salary_amount: salary,
        salary_type: salaryType,
        currency,
        standard_hours: hours,
      });
      if (!parsed.success) throw new Error(firstValidationError(parsed.error));
      const { error } = await supabase.from("staff_compensation").upsert(parsed.data);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t("Compensation updated"));
      queryClient.invalidateQueries({ queryKey: ["compensation"] });
    },
    onError: (error) => showError(error, t),
  });
  return (
    <article className="logbook-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">{personDisplayName(person, t("Unknown user"))}</p>
          <p className="text-xs text-muted-foreground">
            {[person.email ? staffLoginLabel(person.email) : null, person.job_title]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        <button
          type="button"
          onClick={() =>
            profileMutation.mutate({ user_id: person.id, is_active: !person.is_active })
          }
          disabled={person.id === currentUserId || profileMutation.isPending}
          title={
            person.id === currentUserId ? t("You cannot deactivate your own account") : undefined
          }
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          {t(person.is_active ? "Deactivate" : "Reactivate")}
        </button>
      </div>
      <details className="mt-4 border-t border-border pt-4">
        <summary className="cursor-pointer text-xs font-medium">{t("Staff details")}</summary>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Field label="Full name" id={`name-${person.id}`}>
            <Input
              id={`name-${person.id}`}
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
            />
          </Field>
          <Field label="Job title" id={`job-${person.id}`}>
            <Input
              id={`job-${person.id}`}
              value={jobTitle}
              onChange={(event) => setJobTitle(event.target.value)}
            />
          </Field>
        </div>
        <div className="mt-3">
          <Field label="Résumé / mining experience" id={`resume-${person.id}`}>
            <Textarea
              id={`resume-${person.id}`}
              rows={5}
              maxLength={5000}
              value={resume}
              onChange={(event) => setResume(event.target.value)}
            />
          </Field>
        </div>
        <div className="mt-3 flex justify-end">
          <Button
            size="sm"
            type="button"
            onClick={() => detailsMutation.mutate()}
            disabled={detailsMutation.isPending}
          >
            {t("Save staff details")}
          </Button>
        </div>
      </details>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {ROLE_ORDER.map((role) => {
          const owned = held.find((item) => item.role === role);
          const cannotRemove =
            !!owned && (held.length === 1 || (person.id === currentUserId && role === "admin"));
          return (
            <button
              key={role}
              type="button"
              title={
                cannotRemove
                  ? t(
                      "Every staff member needs a role, and admins cannot revoke their own admin role",
                    )
                  : t(ROLE_DESCRIPTION[role])
              }
              onClick={() => roleMutation.mutate({ role, ownedId: owned?.id })}
              disabled={cannotRemove || roleMutation.isPending}
              className={
                owned
                  ? "rounded-full bg-primary px-3 py-1 text-xs font-medium text-primary-foreground disabled:opacity-50"
                  : "rounded-full border border-border px-3 py-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
              }
            >
              {t(ROLE_LABEL[role])}
            </button>
          );
        })}
      </div>
      <div className="mt-4 flex items-center gap-3">
        <Label className="logbook-label" htmlFor={`department-${person.id}`}>
          {t("Department")}
        </Label>
        <select
          id={`department-${person.id}`}
          className="h-10 rounded-md border border-input bg-card px-2 text-base sm:text-sm"
          value={person.department_id ?? ""}
          onChange={(event) =>
            profileMutation.mutate({ user_id: person.id, department_id: event.target.value })
          }
        >
          <option value="">{t("Unassigned")}</option>
          {departments.map((department) => (
            <option key={department.id} value={department.id}>
              {department.name}
            </option>
          ))}
        </select>
      </div>
      {canCompensate ? (
        <details className="mt-4 border-t border-border pt-4">
          <summary className="cursor-pointer text-xs font-medium">
            {t("Protected compensation")}
          </summary>
          <div className="mt-4 grid gap-3 sm:grid-cols-4">
            <Field label="Amount" id={`salary-${person.id}`}>
              <Input
                id={`salary-${person.id}`}
                type="number"
                min="0"
                step="0.01"
                value={salary}
                onChange={(event) => setSalary(event.target.value)}
              />
            </Field>
            <Field label="Type" id={`type-${person.id}`}>
              <select
                id={`type-${person.id}`}
                className="h-10 w-full rounded-md border border-input bg-card px-3 text-base sm:text-sm"
                value={salaryType}
                onChange={(event) =>
                  setSalaryType(event.target.value as "monthly" | "hourly" | "daily")
                }
              >
                <option value="monthly">{t("Monthly")}</option>
                <option value="hourly">{t("Hourly")}</option>
                <option value="daily">{t("Daily")}</option>
              </select>
            </Field>
            <Field label="Currency" id={`currency-${person.id}`}>
              <select
                id={`currency-${person.id}`}
                className="h-10 w-full rounded-md border border-input bg-card px-3 text-base sm:text-sm"
                value={currency}
                onChange={(event) => setCurrency(event.target.value)}
              >
                {CURRENCY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Standard monthly hours" id={`hours-${person.id}`}>
              <Input
                id={`hours-${person.id}`}
                type="number"
                min="0.25"
                max="744"
                step="0.25"
                value={hours}
                onChange={(event) => setHours(event.target.value)}
                aria-describedby={`hours-help-${person.id}`}
              />
              <p id={`hours-help-${person.id}`} className="text-xs text-muted-foreground">
                {t("Expected paid hours in a normal month; informational for now.")}
              </p>
            </Field>
          </div>
          <div className="mt-3 flex justify-end">
            <Button
              size="sm"
              onClick={() => saveCompensation.mutate()}
              disabled={saveCompensation.isPending}
            >
              {t("Save compensation")}
            </Button>
          </div>
        </details>
      ) : null}
    </article>
  );
}

function DepartmentCard({
  department,
  staffCount,
}: {
  department: Department;
  staffCount: number;
}) {
  const queryClient = useQueryClient();
  const { t } = useLanguage();
  const [name, setName] = useState(department.name);
  const [description, setDescription] = useState(department.description ?? "");
  const update = useMutation({
    mutationFn: async () => {
      const parsed = departmentSchema.safeParse({ name, description });
      if (!parsed.success) throw new Error(firstValidationError(parsed.error));
      const { error } = await supabase
        .from("departments")
        .update({ name: parsed.data.name, description: parsed.data.description ?? null })
        .eq("id", department.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t("Department updated"));
      queryClient.invalidateQueries({ queryKey: ["departments"] });
    },
    onError: (error) => showError(error, t),
  });

  return (
    <details className="px-5 py-3">
      <summary className="cursor-pointer text-sm">
        <span className="flex items-center justify-between gap-3">
          <span>{department.name}</span>
          <span className="text-xs text-muted-foreground">
            {staffCount} {t("staff")}
          </span>
        </span>
      </summary>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Field label="Department name" id={`department-name-${department.id}`}>
          <Input
            id={`department-name-${department.id}`}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </Field>
        <Field label="Description" id={`department-description-${department.id}`}>
          <Textarea
            id={`department-description-${department.id}`}
            rows={2}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        </Field>
      </div>
      <div className="mt-3 flex justify-end">
        <Button size="sm" type="button" onClick={() => update.mutate()} disabled={update.isPending}>
          {t("Save department")}
        </Button>
      </div>
    </details>
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
