import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/hooks/useSession";
import { useDepartments, useProjects, useVisibleReports } from "@/hooks/useData";
import { hasCapability } from "@/lib/roles";
import { firstValidationError, miningProjectSchema } from "@/lib/validation";

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
  const { roles, permissions } = useMe();
  const projects = useProjects();
  const departments = useDepartments();
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
      const input = parsed.data;
      const { error } = await supabase.from("projects").insert({
        ...input,
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
          editable ? (
            <Button onClick={() => setOpen((value) => !value)}>
              {open ? "Close" : "New mine operation"}
            </Button>
          ) : undefined
        }
      />

      {open && editable ? (
        <form
          className="logbook-card mb-6 space-y-4 p-6"
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
          <div className="flex justify-end">
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? "Creating…" : "Create operation"}
            </Button>
          </div>
        </form>
      ) : null}

      {projects.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading mine projects…</p>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        {(projects.data ?? []).map((project) => {
          const items = activity(project.id);
          const hours = items.reduce((sum, report) => sum + Number(report.hours_spent), 0);
          return (
            <article key={project.id} className="logbook-card p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="truncate text-sm font-semibold">{project.name}</h2>
                  <p className="logbook-label mt-1">
                    {project.project_code || "No code"} · {project.status}
                  </p>
                </div>
                {editable && project.status !== "archived" ? (
                  <button
                    onClick={() => archive.mutate(project.id)}
                    className="text-xs text-muted-foreground hover:text-destructive"
                  >
                    Archive
                  </button>
                ) : null}
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
                {items.length} work logs · {hours.toFixed(1)}h reported
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
