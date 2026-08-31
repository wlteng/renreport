import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { UserPlus } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";

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
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/hooks/useSession";
import {
  useDepartments,
  useProjectMembers,
  useProjects,
  useStaffDirectory,
  useVisibleReports,
} from "@/hooks/useData";
import { hasCapability } from "@/lib/roles";
import { staffLoginLabel } from "@/lib/staffAuth";
import { firstValidationError, miningProjectSchema, projectMemberSchema } from "@/lib/validation";

export const Route = createFileRoute("/_authenticated/projects")({
  head: () => ({
    meta: [
      { title: "Mine projects — Ren Report" },
      { name: "description", content: "Mining operations, licensing and work activity." },
      { property: "og:title", content: "Mine projects — Ren Report" },
      { property: "og:description", content: "Mining operations and reporting activity." },
    ],
  }),
  component: ProjectsPage,
});

const methodLabel: Record<string, string> = {
  alluvial: "Alluvial",
  open_pit: "Open pit",
  underground: "Underground",
  exploration: "Exploration",
  other: "Other",
};
const licenseLabel: Record<string, string> = {
  licensed: "Licensed",
  in_process: "In process",
  expired: "Expired",
  unknown: "Unknown",
};

function ProjectsPage() {
  const { user, roles, permissions } = useMe();
  const projects = useProjects();
  const departments = useDepartments();
  const people = useStaffDirectory();
  const projectMembers = useProjectMembers();
  const recent = useVisibleReports({});
  const queryClient = useQueryClient();
  const editable = hasCapability(permissions, "manage_projects", roles);

  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [projectCode, setProjectCode] = useState("");
  const [legalName, setLegalName] = useState("");
  const [location, setLocation] = useState("");
  const [miningMethod, setMiningMethod] = useState("other");
  const [licenseStatus, setLicenseStatus] = useState("unknown");
  const [reserveKg, setReserveKg] = useState("");
  const [areaKm2, setAreaKm2] = useState("");
  const [description, setDescription] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [assignmentProjectId, setAssignmentProjectId] = useState<string | null>(null);
  const [staffSearch, setStaffSearch] = useState("");

  const assignmentProject = projects.data?.find((project) => project.id === assignmentProjectId);
  const assignedUserIds = useMemo(
    () =>
      new Set(
        (projectMembers.data ?? [])
          .filter((member) => member.project_id === assignmentProjectId)
          .map((member) => member.user_id),
      ),
    [assignmentProjectId, projectMembers.data],
  );
  const assignedPeople = useMemo(
    () => (people.data ?? []).filter((person) => assignedUserIds.has(person.id)),
    [assignedUserIds, people.data],
  );
  const availablePeople = useMemo(() => {
    const term = staffSearch.trim().toLocaleLowerCase();
    return (people.data ?? [])
      .filter((person) => {
        if (!person.is_active || assignedUserIds.has(person.id)) return false;
        if (!term) return true;
        return `${person.full_name ?? ""} ${person.email}`.toLocaleLowerCase().includes(term);
      })
      .slice(0, 20);
  }, [assignedUserIds, people.data, staffSearch]);

  const create = useMutation({
    mutationFn: async () => {
      const parsed = miningProjectSchema.safeParse({
        name,
        project_code: projectCode,
        legal_name: legalName,
        location,
        mining_method: miningMethod,
        license_status: licenseStatus,
        reserve_kg: reserveKg,
        area_km2: areaKm2,
        department_id: departmentId,
        description,
      });
      if (!parsed.success) throw new Error(firstValidationError(parsed.error));
      if (!user) throw new Error("Your session has expired");
      const input = parsed.data;
      const { error } = await supabase.from("projects").insert({
        ...input,
        owner_id: user.id,
        project_code: input.project_code ?? null,
        legal_name: input.legal_name ?? null,
        location: input.location ?? null,
        reserve_kg: input.reserve_kg ?? null,
        area_km2: input.area_km2 ?? null,
        department_id: input.department_id ?? null,
        description: input.description ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Mine operation created");
      setOpen(false);
      setName("");
      setProjectCode("");
      setLegalName("");
      setLocation("");
      setMiningMethod("other");
      setLicenseStatus("unknown");
      setReserveKg("");
      setAreaKm2("");
      setDescription("");
      setDepartmentId("");
      queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not create mine operation"),
  });

  const assignMember = useMutation({
    mutationFn: async (userId: string) => {
      const parsed = projectMemberSchema.safeParse({
        project_id: assignmentProjectId,
        user_id: userId,
      });
      if (!parsed.success) throw new Error(firstValidationError(parsed.error));
      const { error } = await supabase.from("project_members").insert(parsed.data);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Staff member assigned");
      setStaffSearch("");
      queryClient.invalidateQueries({ queryKey: ["project-members"] });
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not assign staff"),
  });

  const removeMember = useMutation({
    mutationFn: async (userId: string) => {
      const parsed = projectMemberSchema.safeParse({
        project_id: assignmentProjectId,
        user_id: userId,
      });
      if (!parsed.success) throw new Error(firstValidationError(parsed.error));
      const { error } = await supabase
        .from("project_members")
        .delete()
        .eq("project_id", parsed.data.project_id)
        .eq("user_id", parsed.data.user_id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Staff member removed");
      queryClient.invalidateQueries({ queryKey: ["project-members"] });
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not remove staff"),
  });

  const archive = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("projects").update({ status: "archived" }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Mine operation archived");
      queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not archive"),
  });

  const activity = (projectId: string) =>
    (recent.data ?? []).filter((report) => report.project_id === projectId);

  return (
    <>
      <PageHeader
        title="Mine projects"
        subtitle="Mining operations, licensing, reserves and reported site activity."
        action={
          editable ? <Button onClick={() => setOpen(true)}>New mine operation</Button> : undefined
        }
      />

      <Dialog open={open && editable} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>New mine operation</DialogTitle>
            <DialogDescription>
              Add the operating, licensing, reserve, and ownership details for a mine.
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
              <Field label="Operation name" id="pname">
                <Input id="pname" value={name} onChange={(event) => setName(event.target.value)} />
              </Field>
              <Field label="Project code" id="pcode">
                <Input
                  id="pcode"
                  value={projectCode}
                  onChange={(event) => setProjectCode(event.target.value)}
                  placeholder="Optional unique code"
                />
              </Field>
              <Field label="Legal name" id="plegal">
                <Input
                  id="plegal"
                  value={legalName}
                  onChange={(event) => setLegalName(event.target.value)}
                />
              </Field>
              <Field label="Location" id="plocation">
                <Input
                  id="plocation"
                  value={location}
                  onChange={(event) => setLocation(event.target.value)}
                />
              </Field>
              <Field label="Mining method" id="pmethod">
                <select
                  id="pmethod"
                  className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm"
                  value={miningMethod}
                  onChange={(event) => setMiningMethod(event.target.value)}
                >
                  {Object.entries(methodLabel).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="License status" id="plicense">
                <select
                  id="plicense"
                  className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm"
                  value={licenseStatus}
                  onChange={(event) => setLicenseStatus(event.target.value)}
                >
                  {Object.entries(licenseLabel).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Estimated reserve (kg)" id="preserve">
                <Input
                  id="preserve"
                  type="number"
                  min="0"
                  step="0.001"
                  value={reserveKg}
                  onChange={(event) => setReserveKg(event.target.value)}
                />
              </Field>
              <Field label="Area (km²)" id="parea">
                <Input
                  id="parea"
                  type="number"
                  min="0"
                  step="0.001"
                  value={areaKm2}
                  onChange={(event) => setAreaKm2(event.target.value)}
                />
              </Field>
              <Field label="Department" id="pdept">
                <select
                  id="pdept"
                  className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm"
                  value={departmentId}
                  onChange={(event) => setDepartmentId(event.target.value)}
                >
                  <option value="">None</option>
                  {(departments.data ?? []).map((department) => (
                    <option key={department.id} value={department.id}>
                      {department.name}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label="Description" id="pdesc">
              <Textarea
                id="pdesc"
                rows={3}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </Field>
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline">
                  Cancel
                </Button>
              </DialogClose>
              <Button type="submit" disabled={create.isPending}>
                {create.isPending ? "Creating…" : "Create operation"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!assignmentProject}
        onOpenChange={(nextOpen) => {
          if (nextOpen) return;
          setAssignmentProjectId(null);
          setStaffSearch("");
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Assign staff to {assignmentProject?.name}</DialogTitle>
            <DialogDescription>
              Search active staff by name or email. Only the project creator or an admin can change
              these assignments.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <p className="text-sm font-medium">Assigned staff</p>
            {projectMembers.error ? (
              <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                Could not load project assignments: {projectMembers.error.message}
              </p>
            ) : null}
            <div className="divide-y divide-border rounded-lg border border-border">
              {assignedPeople.map((person) => (
                <div
                  key={person.id}
                  className="flex items-center justify-between gap-3 px-3 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {person.full_name || staffLoginLabel(person.email)}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {staffLoginLabel(person.email)}
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="text-destructive hover:text-destructive"
                    disabled={removeMember.isPending}
                    onClick={() => removeMember.mutate(person.id)}
                  >
                    Remove
                  </Button>
                </div>
              ))}
              {!projectMembers.isLoading && assignedPeople.length === 0 ? (
                <p className="px-3 py-5 text-center text-sm text-muted-foreground">
                  No staff assigned yet.
                </p>
              ) : null}
            </div>
          </div>

          <div className="space-y-3 border-t border-border pt-4">
            <Field label="Find staff by name or email" id="staff-search">
              <Input
                id="staff-search"
                type="search"
                value={staffSearch}
                placeholder="Name or email address"
                onChange={(event) => setStaffSearch(event.target.value)}
              />
            </Field>
            {people.error ? (
              <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                Could not load staff: {people.error.message}
              </p>
            ) : null}
            <div className="max-h-64 divide-y divide-border overflow-y-auto rounded-lg border border-border">
              {availablePeople.map((person) => (
                <div
                  key={person.id}
                  className="flex items-center justify-between gap-3 px-3 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {person.full_name || staffLoginLabel(person.email)}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {staffLoginLabel(person.email)}
                      {person.job_title ? ` · ${person.job_title}` : ""}
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={assignMember.isPending}
                    onClick={() => assignMember.mutate(person.id)}
                  >
                    Assign
                  </Button>
                </div>
              ))}
              {!people.isLoading && availablePeople.length === 0 ? (
                <p className="px-3 py-5 text-center text-sm text-muted-foreground">
                  No matching unassigned staff.
                </p>
              ) : null}
            </div>
          </div>

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Done
              </Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {projects.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading mine projects…</p>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        {(projects.data ?? []).map((project) => {
          const items = activity(project.id);
          const hours = items.reduce((sum, report) => sum + Number(report.hours_spent), 0);
          const canManageStaff = project.owner_id === user?.id || roles.includes("admin");
          const assignedCount = (projectMembers.data ?? []).filter(
            (member) => member.project_id === project.id,
          ).length;
          const owner = people.data?.find((person) => person.id === project.owner_id);
          return (
            <article key={project.id} className="logbook-card p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="truncate text-sm font-semibold">{project.name}</h2>
                  <p className="logbook-label mt-1">
                    {project.project_code || "No code"} · {project.status}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {canManageStaff ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => setAssignmentProjectId(project.id)}
                    >
                      <UserPlus />
                      Staff
                    </Button>
                  ) : null}
                  {editable && project.status !== "archived" ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="text-muted-foreground hover:text-destructive"
                      onClick={() => archive.mutate(project.id)}
                    >
                      Archive
                    </Button>
                  ) : null}
                </div>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
                <Detail
                  label="Method"
                  value={methodLabel[project.mining_method] ?? project.mining_method}
                />
                <Detail
                  label="License"
                  value={licenseLabel[project.license_status] ?? project.license_status}
                />
                <Detail label="Location" value={project.location || "—"} />
                <Detail
                  label="Area"
                  value={
                    project.area_km2 === null
                      ? "—"
                      : `${Number(project.area_km2).toLocaleString()} km²`
                  }
                />
                <Detail
                  label="Reserve"
                  value={
                    project.reserve_kg === null
                      ? "—"
                      : `${Number(project.reserve_kg).toLocaleString()} kg`
                  }
                />
                <Detail label="Legal name" value={project.legal_name || "—"} />
              </div>
              {project.description ? (
                <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
                  {project.description}
                </p>
              ) : null}
              <p className="mt-4 text-xs text-muted-foreground">
                {items.length} work logs · {hours.toFixed(1)}h reported · {assignedCount} staff
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Created by {owner?.full_name || owner?.email || "Unknown user"}
              </p>
            </article>
          );
        })}
        {!projects.isLoading && (projects.data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No mine operations yet{editable ? " — create the first one." : "."}
          </p>
        ) : null}
      </div>
    </>
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

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="logbook-label">{label}</p>
      <p className="mt-1 text-muted-foreground">{value}</p>
    </div>
  );
}
