import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Building2 } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
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
import { Textarea } from "@/components/ui/textarea";
import type { CompensationRow, Department, PersonRow } from "@/hooks/useData";
import { supabase } from "@/integrations/supabase/client";
import { CURRENCY_OPTIONS } from "@/lib/currencies";
import { useLanguage } from "@/lib/i18n";
import { personDisplayName, personInitials } from "@/lib/people";
import { ROLE_DESCRIPTION, ROLE_LABEL, ROLE_ORDER, type AppRole } from "@/lib/roles";
import { staffLoginLabel } from "@/lib/staffAuth";
import { cn } from "@/lib/utils";
import {
  compensationSchema,
  departmentSchema,
  firstValidationError,
  personDetailsSchema,
  personMutationSchema,
  roleMutationSchema,
} from "@/lib/validation";

type HeldRole = { id: string; user_id: string; role: AppRole };

function showError(error: unknown, t: (text: string) => string) {
  toast.error(error instanceof Error ? error.message : t("Operation failed"));
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

/**
 * Staff directory, one row per person. The avatar opens everything that can be
 * edited about that person, so the list itself stays scannable.
 */
export function AdminPeople({
  people,
  isLoading,
  roles,
  departments,
  compensation,
  canCompensate,
  currentUserId,
}: {
  people: PersonRow[];
  isLoading: boolean;
  roles: HeldRole[];
  departments: Department[];
  compensation: CompensationRow[];
  canCompensate: boolean;
  currentUserId: string | undefined;
}) {
  const { t } = useLanguage();
  const [openPersonId, setOpenPersonId] = useState<string | null>(null);
  const departmentName = (id: string | null) =>
    departments.find((department) => department.id === id)?.name ?? t("Unassigned");
  const openPerson = people.find((person) => person.id === openPersonId) ?? null;

  return (
    <>
      <div className="logbook-card divide-y divide-border">
        {people.map((person) => {
          const held = roles.filter((role) => role.user_id === person.id);
          return (
            <div key={person.id} className="flex items-center gap-3 px-4 py-3">
              <button
                type="button"
                onClick={() => setOpenPersonId(person.id)}
                aria-label={`${t("Edit")} ${personDisplayName(person, t("Unknown user"))}`}
                title={t("Open staff details")}
                className="shrink-0 rounded-full outline-none ring-offset-background transition-opacity hover:opacity-80 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <Avatar className="size-10 border border-border">
                  <AvatarImage src={person.avatar_url ?? undefined} alt="" />
                  <AvatarFallback className="text-xs font-semibold">
                    {personInitials(person.full_name, person.email)}
                  </AvatarFallback>
                </Avatar>
              </button>
              <button
                type="button"
                onClick={() => setOpenPersonId(person.id)}
                className="min-w-0 flex-1 text-left"
              >
                <p
                  className={cn(
                    "truncate text-sm font-semibold",
                    !person.is_active && "text-muted-foreground line-through",
                  )}
                >
                  {personDisplayName(person, t("Unknown user"))}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {[
                    person.email ? staffLoginLabel(person.email) : null,
                    person.job_title,
                    departmentName(person.department_id),
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </button>
              <div className="hidden shrink-0 flex-wrap justify-end gap-1 sm:flex">
                {held.map((role) => (
                  <Badge key={role.id} variant="outline">
                    {t(ROLE_LABEL[role.role])}
                  </Badge>
                ))}
                {person.is_active ? null : (
                  <Badge variant="outline" className="text-muted-foreground">
                    {t("Inactive")}
                  </Badge>
                )}
              </div>
            </div>
          );
        })}
        {!isLoading && people.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-muted-foreground">
            {t("No staff yet.")}
          </p>
        ) : null}
      </div>
      <PersonDialog
        key={openPerson?.id ?? "none"}
        person={openPerson}
        held={openPerson ? roles.filter((role) => role.user_id === openPerson.id) : []}
        departments={departments}
        compensation={compensation.find((row) => row.user_id === openPerson?.id)}
        canCompensate={canCompensate}
        currentUserId={currentUserId}
        onClose={() => setOpenPersonId(null)}
      />
    </>
  );
}

/** Everything an admin can change about one staff member. */
function PersonDialog({
  person,
  held,
  departments,
  compensation,
  canCompensate,
  currentUserId,
  onClose,
}: {
  person: PersonRow | null;
  held: HeldRole[];
  departments: Department[];
  compensation: CompensationRow | undefined;
  canCompensate: boolean;
  currentUserId: string | undefined;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const { t } = useLanguage();
  const [fullName, setFullName] = useState(person?.full_name ?? "");
  const [jobTitle, setJobTitle] = useState(person?.job_title ?? "");
  const [resume, setResume] = useState(person?.resume ?? "");
  const [adminNotes, setAdminNotes] = useState(person?.admin_notes ?? "");
  const [salary, setSalary] = useState(String(compensation?.salary_amount ?? 0));
  const [salaryType, setSalaryType] = useState(compensation?.salary_type ?? "monthly");
  const [currency, setCurrency] = useState(compensation?.currency ?? "USD");
  const [hours, setHours] = useState(String(compensation?.standard_hours ?? 160));

  useEffect(() => {
    setSalary(String(compensation?.salary_amount ?? 0));
    setSalaryType(compensation?.salary_type ?? "monthly");
    setCurrency(compensation?.currency ?? "USD");
    setHours(String(compensation?.standard_hours ?? 160));
  }, [compensation]);

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
      if (!person) throw new Error(t("Operation failed"));
      const parsed = personDetailsSchema.safeParse({
        user_id: person.id,
        full_name: fullName,
        job_title: jobTitle,
        resume,
        admin_notes: adminNotes,
      });
      if (!parsed.success) throw new Error(firstValidationError(parsed.error));
      const { error } = await supabase
        .from("profiles")
        .update({
          full_name: parsed.data.full_name,
          job_title: parsed.data.job_title ?? null,
          resume: parsed.data.resume ?? null,
          admin_notes: parsed.data.admin_notes ?? null,
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
      if (!person) throw new Error(t("Operation failed"));
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
      if (!person) throw new Error(t("Operation failed"));
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
    <Dialog
      open={person !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        {person ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-3 pr-6">
                <Avatar className="size-10 border border-border">
                  <AvatarImage src={person.avatar_url ?? undefined} alt="" />
                  <AvatarFallback className="text-xs font-semibold">
                    {personInitials(person.full_name, person.email)}
                  </AvatarFallback>
                </Avatar>
                <span className="min-w-0 truncate">
                  {personDisplayName(person, t("Unknown user"))}
                </span>
              </DialogTitle>
              <DialogDescription>
                {[person.email ? staffLoginLabel(person.email) : null, person.job_title]
                  .filter(Boolean)
                  .join(" · ") || t("Staff details")}
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-3 sm:grid-cols-2">
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
            <Field label="Résumé / mining experience" id={`resume-${person.id}`}>
              <Textarea
                id={`resume-${person.id}`}
                rows={4}
                maxLength={5000}
                value={resume}
                onChange={(event) => setResume(event.target.value)}
              />
            </Field>
            <Field label="Admin note" id={`notes-${person.id}`}>
              <Textarea
                id={`notes-${person.id}`}
                rows={4}
                maxLength={5000}
                value={adminNotes}
                onChange={(event) => setAdminNotes(event.target.value)}
                placeholder={t("Only admins can read this note.")}
                aria-describedby={`notes-help-${person.id}`}
              />
              <p id={`notes-help-${person.id}`} className="text-xs text-muted-foreground">
                {t("Only admins can read this note.")}
              </p>
            </Field>
            <div className="flex justify-end">
              <Button
                size="sm"
                type="button"
                onClick={() => detailsMutation.mutate()}
                disabled={detailsMutation.isPending}
              >
                {t("Save staff details")}
              </Button>
            </div>

            <section className="space-y-2 border-t border-border pt-4">
              <h3 className="logbook-label">{t("Roles")}</h3>
              <div className="flex flex-wrap items-center gap-2">
                {ROLE_ORDER.map((role) => {
                  const owned = held.find((item) => item.role === role);
                  const cannotRemove =
                    !!owned &&
                    (held.length === 1 || (person.id === currentUserId && role === "admin"));
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
            </section>

            <section className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
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
              <button
                type="button"
                onClick={() =>
                  profileMutation.mutate({ user_id: person.id, is_active: !person.is_active })
                }
                disabled={person.id === currentUserId || profileMutation.isPending}
                title={
                  person.id === currentUserId
                    ? t("You cannot deactivate your own account")
                    : undefined
                }
                className="ml-auto text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
              >
                {t(person.is_active ? "Deactivate" : "Reactivate")}
              </button>
            </section>

            {canCompensate ? (
              <section className="space-y-3 border-t border-border pt-4">
                <h3 className="logbook-label">{t("Protected compensation")}</h3>
                <div className="grid gap-3 sm:grid-cols-2">
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
                <div className="flex justify-end">
                  <Button
                    size="sm"
                    onClick={() => saveCompensation.mutate()}
                    disabled={saveCompensation.isPending}
                  >
                    {t("Save compensation")}
                  </Button>
                </div>
              </section>
            ) : null}

            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline">
                  {t("Close")}
                </Button>
              </DialogClose>
            </DialogFooter>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

/**
 * Departments are a category of staff, so they are managed from this page in a
 * dialog rather than on a page of their own.
 */
export function DepartmentsDialog({
  departments,
  people,
}: {
  departments: Department[];
  people: PersonRow[];
}) {
  const queryClient = useQueryClient();
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [editing, setEditing] = useState<Department | null>(null);

  const reset = () => {
    setEditing(null);
    setName("");
    setDescription("");
  };

  const save = useMutation({
    mutationFn: async () => {
      const parsed = departmentSchema.safeParse({ name, description });
      if (!parsed.success) throw new Error(firstValidationError(parsed.error));
      const values = { name: parsed.data.name, description: parsed.data.description ?? null };
      const { error } = editing
        ? await supabase.from("departments").update(values).eq("id", editing.id)
        : await supabase.from("departments").insert(values);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t(editing ? "Department updated" : "Department created"));
      reset();
      queryClient.invalidateQueries({ queryKey: ["departments"] });
    },
    onError: (error) => showError(error, t),
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" variant="outline">
          <Building2 />
          {t("Departments")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("Departments")}</DialogTitle>
          <DialogDescription>
            {t("Create a department for organizing staff and mine operations.")}
          </DialogDescription>
        </DialogHeader>
        <ul className="divide-y divide-border rounded-lg border border-border">
          {departments.map((department) => (
            <li key={department.id} className="flex items-center gap-3 px-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{department.name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {people.filter((person) => person.department_id === department.id).length}{" "}
                  {t("staff")}
                  {department.description ? ` · ${department.description}` : ""}
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setEditing(department);
                  setName(department.name);
                  setDescription(department.description ?? "");
                }}
              >
                {t("Edit")}
              </Button>
            </li>
          ))}
          {departments.length === 0 ? (
            <li className="px-3 py-6 text-center text-sm text-muted-foreground">
              {t("No departments yet.")}
            </li>
          ) : null}
        </ul>
        <form
          className="space-y-4 border-t border-border pt-4"
          onSubmit={(event) => {
            event.preventDefault();
            save.mutate();
          }}
        >
          <p className="text-sm font-medium">{t(editing ? "Edit department" : "Add department")}</p>
          <Field label="Department name" id="department-name">
            <Input
              id="department-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={t("e.g. Mine operations")}
            />
          </Field>
          <Field label="Description" id="department-description">
            <Textarea
              id="department-description"
              rows={2}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </Field>
          <DialogFooter className="sm:justify-between">
            {editing ? (
              <Button type="button" variant="outline" onClick={reset}>
                {t("Cancel")}
              </Button>
            ) : (
              <span />
            )}
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? t("Saving…") : t(editing ? "Save department" : "Add department")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
