import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ExternalLink, FolderKanban, Pencil, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { ProjectEditorDialog, type ProjectEditorValue } from "@/components/ProjectEditorDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  useDepartments,
  usePeople,
  useProjectMembers,
  useProjects,
  type ProjectRow,
} from "@/hooks/useData";
import { useMe } from "@/hooks/useSession";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/lib/i18n";
import {
  LICENSE_STATUS_LABEL,
  MINING_METHOD_LABEL,
  PROJECT_CATEGORY_LABEL,
  PROJECT_STATUS_LABEL,
  PROJECT_STATUS_ORDER,
  PROJECT_STATUS_TONE,
} from "@/lib/projects";
import { staffLoginLabel } from "@/lib/staffAuth";
import { cn } from "@/lib/utils";

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatMoney(currency: string, amount: number) {
  return `${currency} ${amount.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function AdminProjects() {
  const { user } = useMe();
  const { t } = useLanguage();
  const projects = useProjects();
  const departments = useDepartments();
  const people = usePeople();
  const memberships = useProjectMembers();
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<ProjectRow | undefined>();

  const sortedProjects = useMemo(
    () =>
      [...(projects.data ?? [])].sort(
        (left, right) =>
          (PROJECT_STATUS_ORDER[left.status] ?? 9) - (PROJECT_STATUS_ORDER[right.status] ?? 9) ||
          left.name.localeCompare(right.name),
      ),
    [projects.data],
  );
  const peopleById = useMemo(
    () => new Map((people.data ?? []).map((person) => [person.id, person])),
    [people.data],
  );
  const departmentsById = useMemo(
    () => new Map((departments.data ?? []).map((department) => [department.id, department])),
    [departments.data],
  );
  const membersByProject = useMemo(() => {
    const grouped = new Map<string, string[]>();
    for (const membership of memberships.data ?? []) {
      const person = peopleById.get(membership.user_id);
      if (!person) continue;
      const names = grouped.get(membership.project_id) ?? [];
      names.push(person.full_name || staffLoginLabel(person.email));
      grouped.set(membership.project_id, names);
    }
    return grouped;
  }, [memberships.data, peopleById]);

  const refreshProjects = () => queryClient.invalidateQueries({ queryKey: ["projects"] });
  const createProject = useMutation({
    mutationFn: async (value: ProjectEditorValue) => {
      if (!user) throw new Error(t("Your session has expired"));
      const { error } = await supabase.from("projects").insert({
        ...value,
        owner_id: value.owner_id ?? user.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t("Project created"));
      setCreateOpen(false);
      refreshProjects();
    },
    onError: (error) => showError(error, t),
  });
  const updateProject = useMutation({
    mutationFn: async (value: ProjectEditorValue) => {
      if (!editingProject) throw new Error(t("Choose a project to edit"));
      const { error } = await supabase.from("projects").update(value).eq("id", editingProject.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t("Project updated"));
      setEditingProject(undefined);
      refreshProjects();
    },
    onError: (error) => showError(error, t),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4">
        <p className="text-sm text-muted-foreground">
          {t("Admins can create projects, transfer ownership and edit every project field.")}
        </p>
        <Button type="button" onClick={() => setCreateOpen(true)}>
          <Plus />
          {t("New project")}
        </Button>
      </div>

      <ProjectEditorDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        defaultOwnerId={user?.id}
        departments={departments.data ?? []}
        people={people.data ?? []}
        showAdminFields
        pending={createProject.isPending}
        onSubmit={(value) => createProject.mutate(value)}
      />
      <ProjectEditorDialog
        open={!!editingProject}
        onOpenChange={(open) => {
          if (!open) setEditingProject(undefined);
        }}
        project={editingProject}
        defaultOwnerId={user?.id}
        departments={departments.data ?? []}
        people={people.data ?? []}
        showAdminFields
        pending={updateProject.isPending}
        onSubmit={(value) => updateProject.mutate(value)}
      />

      {projects.error ? (
        <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {projects.error.message}
        </p>
      ) : null}
      {projects.isLoading ? (
        <p className="text-sm text-muted-foreground">{t("Loading projects…")}</p>
      ) : null}

      <div className="space-y-4">
        {sortedProjects.map((project) => {
          const owner = project.owner_id ? peopleById.get(project.owner_id) : undefined;
          const department = project.department_id
            ? departmentsById.get(project.department_id)
            : undefined;
          const memberNames = membersByProject.get(project.id) ?? [];
          const category = project.category ?? "mine";
          return (
            <article
              key={project.id}
              className={cn(
                "logbook-card group relative isolate cursor-pointer p-5 transition-[transform,box-shadow] hover:-translate-y-0.5 hover:shadow-raise",
                project.status === "archived" && "opacity-75",
              )}
            >
              <Link
                to="/projects/$projectId"
                params={{ projectId: project.id }}
                aria-label={`${t("Open full project")}: ${project.name}`}
                className="absolute inset-0 z-0 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              />
              <div className="pointer-events-none relative z-10 flex flex-wrap items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-3">
                  <span
                    className="grid size-10 shrink-0 place-items-center rounded-lg bg-muted text-foreground"
                    style={project.color ? { borderLeft: `4px solid ${project.color}` } : undefined}
                  >
                    <FolderKanban className="size-5" aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <h2 className="text-base font-semibold group-hover:underline">
                      {project.name}
                    </h2>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t(PROJECT_CATEGORY_LABEL[category] ?? category)}
                      {project.project_code ? ` · ${project.project_code}` : ""}
                    </p>
                  </div>
                </div>
                <div className="pointer-events-auto flex items-center gap-2">
                  <Badge className={PROJECT_STATUS_TONE[project.status] ?? ""}>
                    {t(PROJECT_STATUS_LABEL[project.status] ?? project.status)}
                  </Badge>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setEditingProject(project)}
                  >
                    <Pencil />
                    {t("Edit")}
                  </Button>
                  <Button asChild type="button" size="sm" variant="outline">
                    <Link to="/projects/$projectId" params={{ projectId: project.id }}>
                      <ExternalLink />
                      {t("Manage")}
                    </Link>
                  </Button>
                </div>
              </div>

              <dl className="pointer-events-none relative z-10 mt-5 grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
                <Info
                  label="Owner"
                  value={
                    owner
                      ? [owner.full_name, staffLoginLabel(owner.email)].filter(Boolean).join(" · ")
                      : "—"
                  }
                />
                <Info label="Department" value={department?.name || "—"} />
                <Info
                  label="Assigned staff"
                  value={
                    memberNames.length ? `${memberNames.length} · ${memberNames.join(", ")}` : "0"
                  }
                />
                <Info
                  label="Starting fund"
                  value={
                    project.fund_amount === null
                      ? t("Not set")
                      : formatMoney(project.fund_currency, Number(project.fund_amount))
                  }
                />
                <Info label="Legal name" value={project.legal_name || "—"} />
                <Info label="Location" value={project.location || "—"} />
                <Info
                  label="Mining method"
                  value={
                    category === "mine"
                      ? t(MINING_METHOD_LABEL[project.mining_method] ?? project.mining_method)
                      : "—"
                  }
                />
                <Info
                  label="License status"
                  value={
                    category === "mine"
                      ? t(LICENSE_STATUS_LABEL[project.license_status] ?? project.license_status)
                      : "—"
                  }
                />
                <Info
                  label="Estimated reserve"
                  value={
                    project.reserve_kg === null
                      ? "—"
                      : `${Number(project.reserve_kg).toLocaleString()} kg`
                  }
                />
                <Info
                  label="Area"
                  value={
                    project.area_km2 === null
                      ? "—"
                      : `${Number(project.area_km2).toLocaleString()} km²`
                  }
                />
                <Info label="Website URL" value={project.url || "—"} breakWords />
                <Info label="Git repository URL" value={project.repository_url || "—"} breakWords />
                <Info label="Project color" value={project.color || "—"} />
                <Info label="Created" value={formatDateTime(project.created_at)} />
                <Info label="Last updated" value={formatDateTime(project.updated_at)} />
                <Info label="Project ID" value={project.id} breakWords />
              </dl>
              <div className="pointer-events-none relative z-10 mt-5 border-t border-border pt-4">
                <p className="logbook-label">{t("Description")}</p>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
                  {project.description || t("No project description yet.")}
                </p>
              </div>
            </article>
          );
        })}
        {!projects.isLoading && !projects.error && sortedProjects.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border px-5 py-10 text-center text-sm text-muted-foreground">
            {t("No projects yet — create the first one.")}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function Info({
  label,
  value,
  breakWords = false,
}: {
  label: string;
  value: string;
  breakWords?: boolean;
}) {
  const { t } = useLanguage();
  return (
    <div>
      <dt className="logbook-label">{t(label)}</dt>
      <dd className={cn("mt-1 text-sm text-muted-foreground", breakWords && "break-all")}>
        {value}
      </dd>
    </div>
  );
}

function showError(error: unknown, t: (text: string) => string) {
  toast.error(error instanceof Error ? error.message : t("Something went wrong"));
}
