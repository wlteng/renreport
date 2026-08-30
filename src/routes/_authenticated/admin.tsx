import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({
    meta: [
      { title: "Admin — Ren Report" },
      {
        name: "description",
        content: "Manage mining staff, departments, permissions and audit records.",
      },
      { property: "og:title", content: "Admin — Ren Report" },
      { property: "og:description", content: "Mining operations administration." },
    ],
  }),
  component: AdminPage,
});

function useAudit(enabled: boolean) {
  return useQuery({
    queryKey: ["role-audit"],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("role_audit_log")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data ?? [];
    },
  });
}

function AdminPage() {
  const { user, roles, permissions: myPermissions } = useMe();
  const people = usePeople();
  const allRoles = useAllRoles();
  const departments = useDepartments();
  const permissions = usePermissions();
  const rolePermissions = useRolePermissions();
  const canCompensate = hasCapability(myPermissions, "manage_compensation", roles);
  const compensation = useCompensation(canCompensate);
  const audit = useAudit(hasCapability(myPermissions, "manage_roles", roles));
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<"people" | "departments" | "permissions" | "audit">("people");
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
      toast.success("Department created");
      setDeptName("");
      setDeptDescription("");
      queryClient.invalidateQueries({ queryKey: ["departments"] });
    },
    onError: showError,
  });

  const setPermission = useMutation({
    mutationFn: async (input: {
      role: AppRole;
      permission_key: PermissionKey;
      enabled: boolean;
    }) => {
      const parsed = permissionMutationSchema.safeParse(input);
      if (!parsed.success) throw new Error(firstValidationError(parsed.error));
      const { error } = await supabase
        .from("role_permissions")
        .upsert(parsed.data, { onConflict: "role,permission_key" });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Permission updated");
      queryClient.invalidateQueries({ queryKey: ["role-permissions"] });
      queryClient.invalidateQueries({ queryKey: ["my-permissions"] });
    },
    onError: showError,
  });

  if (!roles.includes("admin"))
    return (
      <div className="logbook-card p-10 text-center">
        <p className="text-sm text-muted-foreground">Admins only.</p>
      </div>
    );

  const personName = (id: string) => {
    const person = people.data?.find((item) => item.id === id);
    return person?.full_name || person?.email || id.slice(0, 8);
  };

  return (
    <>
      <PageHeader
        title="Admin"
        subtitle="Staff accounts, departments, capabilities, compensation and role audit."
      />
      <div className="mb-6 flex gap-1 rounded-lg border border-border bg-secondary p-1 text-sm">
        {(["people", "departments", "permissions", "audit"] as const).map((item) => (
          <button
            key={item}
            onClick={() => setTab(item)}
            className={
              tab === item
                ? "flex-1 rounded-md bg-card px-3 py-1.5 font-medium capitalize shadow-xs"
                : "flex-1 rounded-md px-3 py-1.5 capitalize text-muted-foreground"
            }
          >
            {item}
          </button>
        ))}
      </div>

      {tab === "people" ? (
        <div className="space-y-6">
          <CreateStaff departments={departments.data ?? []} />
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
        </div>
      ) : null}

      {tab === "departments" ? (
        <div className="space-y-6">
          <form
            className="logbook-card space-y-4 p-5"
            onSubmit={(event) => {
              event.preventDefault();
              createDepartment.mutate();
            }}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Department name" id="dname">
                <Input
                  id="dname"
                  value={deptName}
                  onChange={(event) => setDeptName(event.target.value)}
                  placeholder="e.g. Mine operations"
                />
              </Field>
              <Field label="Description" id="ddesc">
                <Textarea
                  id="ddesc"
                  rows={2}
                  value={deptDescription}
                  onChange={(event) => setDeptDescription(event.target.value)}
                />
              </Field>
            </div>
            <div className="flex justify-end">
              <Button type="submit" disabled={createDepartment.isPending}>
                Add department
              </Button>
            </div>
          </form>
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
                No departments yet.
              </p>
            ) : null}
          </div>
        </div>
      ) : null}

      {tab === "permissions" ? (
        <div className="space-y-4">
          <div className="rounded-lg border border-border bg-muted px-4 py-3 text-sm text-muted-foreground">
            This matrix controls UI capability cues, but database policies enforce every protected
            operation. Removing your own permission-management capability can lock this screen until
            another authorized administrator restores it.
          </div>
          <div className="logbook-card overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-4 py-3 text-left font-medium">Capability</th>
                  {ROLE_ORDER.map((role) => (
                    <th key={role} className="px-4 py-3 text-center font-medium">
                      {ROLE_LABEL[role]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(permissions.data ?? []).map((permission) => (
                  <tr key={permission.key} className="border-b border-border last:border-0">
                    <td className="px-4 py-3">
                      <p className="font-medium">{permission.label}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {permission.description}
                      </p>
                    </td>
                    {ROLE_ORDER.map((role) => {
                      const enabled = roleHasPermission(
                        rolePermissions.data ?? [],
                        role,
                        permission.key as PermissionKey,
                      );
                      return (
                        <td key={role} className="px-4 py-3 text-center">
                          <input
                            type="checkbox"
                            checked={enabled}
                            disabled={role === "admin" || setPermission.isPending}
                            onChange={() =>
                              setPermission.mutate({
                                role,
                                permission_key: permission.key as PermissionKey,
                                enabled: !enabled,
                              })
                            }
                            aria-label={`${permission.label} for ${ROLE_LABEL[role]}`}
                            title={
                              role === "admin" ? "Admin capabilities are always enabled" : undefined
                            }
                          />
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

      {tab === "audit" ? (
        <div className="logbook-card divide-y divide-border">
          {(audit.data ?? []).map((entry) => (
            <div
              key={entry.id}
              className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm"
            >
              <span>
                {ROLE_LABEL[entry.role as AppRole]} {entry.action} —{" "}
                {personName(entry.target_user_id)}
              </span>
              <span className="text-xs text-muted-foreground">
                {new Date(entry.created_at).toLocaleString()}
                {entry.actor_id ? ` · by ${personName(entry.actor_id)}` : ""}
              </span>
            </div>
          ))}
          {!audit.isLoading && (audit.data ?? []).length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-muted-foreground">
              No role changes recorded yet.
            </p>
          ) : null}
        </div>
      ) : null}
    </>
  );
}

function CreateStaff({ departments }: { departments: Department[] }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    full_name: "",
    email: "",
    password: "",
    job_title: "",
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
      toast.success("Staff account created");
      setOpen(false);
      setForm({
        full_name: "",
        email: "",
        password: "",
        job_title: "",
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
    onError: showError,
  });
  return (
    <section className="logbook-card p-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold">Staff accounts</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Create a confirmed account with its role and protected compensation record.
          </p>
        </div>
        <Button variant="outline" onClick={() => setOpen((value) => !value)}>
          {open ? "Close" : "Add staff account"}
        </Button>
      </div>
      {open ? (
        <form
          className="mt-5 space-y-4 border-t border-border pt-5"
          onSubmit={(event) => {
            event.preventDefault();
            create.mutate();
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Full name" id="sname">
              <Input
                id="sname"
                value={form.full_name}
                onChange={(event) => update("full_name", event.target.value)}
              />
            </Field>
            <Field label="Email" id="semail">
              <Input
                id="semail"
                type="email"
                value={form.email}
                onChange={(event) => update("email", event.target.value)}
              />
            </Field>
            <Field label="Temporary password" id="spass">
              <Input
                id="spass"
                type="password"
                value={form.password}
                onChange={(event) => update("password", event.target.value)}
              />
            </Field>
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
                className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm"
                value={form.department_id}
                onChange={(event) => update("department_id", event.target.value)}
              >
                <option value="">Unassigned</option>
                {departments.map((department) => (
                  <option key={department.id} value={department.id}>
                    {department.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Role" id="srole">
              <select
                id="srole"
                className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm"
                value={form.role}
                onChange={(event) => update("role", event.target.value)}
              >
                {ROLE_ORDER.map((role) => (
                  <option key={role} value={role}>
                    {ROLE_LABEL[role]}
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
                className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm"
                value={form.salary_type}
                onChange={(event) => update("salary_type", event.target.value)}
              >
                <option value="monthly">Monthly</option>
                <option value="hourly">Hourly</option>
                <option value="daily">Daily</option>
              </select>
            </Field>
            <Field label="Currency" id="scurrency">
              <Input
                id="scurrency"
                maxLength={3}
                value={form.currency}
                onChange={(event) => update("currency", event.target.value.toUpperCase())}
              />
            </Field>
            <Field label="Standard hours" id="shours">
              <Input
                id="shours"
                type="number"
                min="0.01"
                max="744"
                step="0.25"
                value={form.standard_hours}
                onChange={(event) => update("standard_hours", event.target.value)}
              />
            </Field>
          </div>
          <div className="flex justify-end">
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? "Creating…" : "Create staff account"}
            </Button>
          </div>
        </form>
      ) : null}
    </section>
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
  const [fullName, setFullName] = useState(person.full_name ?? "");
  const [jobTitle, setJobTitle] = useState(person.job_title ?? "");
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
      toast.success("Staff profile updated");
      refreshPeople();
    },
    onError: showError,
  });
  const detailsMutation = useMutation({
    mutationFn: async () => {
      const parsed = personDetailsSchema.safeParse({
        user_id: person.id,
        full_name: fullName,
        job_title: jobTitle,
      });
      if (!parsed.success) throw new Error(firstValidationError(parsed.error));
      const { error } = await supabase
        .from("profiles")
        .update({
          full_name: parsed.data.full_name,
          job_title: parsed.data.job_title ?? null,
        })
        .eq("id", parsed.data.user_id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Staff details updated");
      refreshPeople();
    },
    onError: showError,
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
      toast.success("Role updated");
      refreshRoles();
    },
    onError: showError,
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
      toast.success("Compensation updated");
      queryClient.invalidateQueries({ queryKey: ["compensation"] });
    },
    onError: showError,
  });
  return (
    <article className="logbook-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">{person.full_name || person.email}</p>
          <p className="text-xs text-muted-foreground">
            {person.email}
            {person.job_title ? ` · ${person.job_title}` : ""}
          </p>
        </div>
        <button
          type="button"
          onClick={() =>
            profileMutation.mutate({ user_id: person.id, is_active: !person.is_active })
          }
          disabled={person.id === currentUserId || profileMutation.isPending}
          title={person.id === currentUserId ? "You cannot deactivate your own account" : undefined}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          {person.is_active ? "Deactivate" : "Reactivate"}
        </button>
      </div>
      <details className="mt-4 border-t border-border pt-4">
        <summary className="cursor-pointer text-xs font-medium">Staff details</summary>
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
        <div className="mt-3 flex justify-end">
          <Button
            size="sm"
            type="button"
            onClick={() => detailsMutation.mutate()}
            disabled={detailsMutation.isPending}
          >
            Save staff details
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
                  ? "Every staff member needs a role, and admins cannot revoke their own admin role"
                  : ROLE_DESCRIPTION[role]
              }
              onClick={() => roleMutation.mutate({ role, ownedId: owned?.id })}
              disabled={cannotRemove || roleMutation.isPending}
              className={
                owned
                  ? "rounded-full bg-primary px-3 py-1 text-xs font-medium text-primary-foreground disabled:opacity-50"
                  : "rounded-full border border-border px-3 py-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
              }
            >
              {ROLE_LABEL[role]}
            </button>
          );
        })}
      </div>
      <div className="mt-4 flex items-center gap-3">
        <Label className="logbook-label" htmlFor={`department-${person.id}`}>
          Department
        </Label>
        <select
          id={`department-${person.id}`}
          className="h-9 rounded-md border border-input bg-card px-2 text-sm"
          value={person.department_id ?? ""}
          onChange={(event) =>
            profileMutation.mutate({ user_id: person.id, department_id: event.target.value })
          }
        >
          <option value="">Unassigned</option>
          {departments.map((department) => (
            <option key={department.id} value={department.id}>
              {department.name}
            </option>
          ))}
        </select>
      </div>
      {canCompensate ? (
        <details className="mt-4 border-t border-border pt-4">
          <summary className="cursor-pointer text-xs font-medium">Protected compensation</summary>
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
                className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm"
                value={salaryType}
                onChange={(event) =>
                  setSalaryType(event.target.value as "monthly" | "hourly" | "daily")
                }
              >
                <option value="monthly">Monthly</option>
                <option value="hourly">Hourly</option>
                <option value="daily">Daily</option>
              </select>
            </Field>
            <Field label="Currency" id={`currency-${person.id}`}>
              <Input
                id={`currency-${person.id}`}
                maxLength={3}
                value={currency}
                onChange={(event) => setCurrency(event.target.value.toUpperCase())}
              />
            </Field>
            <Field label="Standard hours" id={`hours-${person.id}`}>
              <Input
                id={`hours-${person.id}`}
                type="number"
                min="0.01"
                max="744"
                step="0.25"
                value={hours}
                onChange={(event) => setHours(event.target.value)}
              />
            </Field>
          </div>
          <div className="mt-3 flex justify-end">
            <Button
              size="sm"
              onClick={() => saveCompensation.mutate()}
              disabled={saveCompensation.isPending}
            >
              Save compensation
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
      toast.success("Department updated");
      queryClient.invalidateQueries({ queryKey: ["departments"] });
    },
    onError: showError,
  });

  return (
    <details className="px-5 py-3">
      <summary className="cursor-pointer text-sm">
        <span className="flex items-center justify-between gap-3">
          <span>{department.name}</span>
          <span className="text-xs text-muted-foreground">{staffCount} staff</span>
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
          Save department
        </Button>
      </div>
    </details>
  );
}

function Field({ label, id, children }: { label: string; id: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}
function showError(error: unknown) {
  toast.error(error instanceof Error ? error.message : "Operation failed");
}
