import { useMutation, useQueryClient } from "@tanstack/react-query";
import { FolderKanban, Pencil, Plus } from "lucide-react";
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
  type ProjectMemberRow,
  type ProjectRow,
} from "@/hooks/useData";
import { useMe } from "@/hooks/useSession";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/lib/i18n";
import {
  PROJECT_CATEGORY_LABEL,
  PROJECT_STATUS_LABEL,
  PROJECT_STATUS_ORDER,
  PROJECT_STATUS_TONE,
} from "@/lib/projects";
import { personDisplayName } from "@/lib/people";
import { cn } from "@/lib/utils";

const EMPTY_MEMBER_IDS: string[] = [];

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
      names.push(personDisplayName(person, t("Unknown user")));
      grouped.set(membership.project_id, names);
    }
    return grouped;
  }, [memberships.data, peopleById, t]);
  const editingMemberIds = useMemo(
    () =>
      editingProject
        ? (memberships.data ?? [])
            .filter((membership) => membership.project_id === editingProject.id)
            .map((membership) => membership.user_id)
        : EMPTY_MEMBER_IDS,
    [editingProject, memberships.data],
  );

  const refreshProjects = () => {
    queryClient.invalidateQueries({ queryKey: ["projects"] });
    queryClient.invalidateQueries({ queryKey: ["project-members"] });
  };
  const createProject = useMutation({
    mutationFn: async ({
      value,
      memberIds,
    }: {
      value: ProjectEditorValue;
      memberIds: string[];
    }) => {
      if (!user) throw new Error(t("Your session has expired"));
      const { data, error } = await supabase
        .from("projects")
        .insert({
          ...value,
          owner_id: value.owner_id ?? user.id,
        })
        .select("id")
        .single();
      if (error) throw error;
      const uniqueMemberIds = [...new Set(memberIds)];
      if (uniqueMemberIds.length > 0) {
        const { error: memberError } = await supabase.from("project_members").insert(
          uniqueMemberIds.map((userId) => ({
            project_id: data.id,
            user_id: userId,
          })),
        );
        if (memberError) {
          await supabase.from("projects").delete().eq("id", data.id);
          throw memberError;
        }
      }
    },
    onSuccess: () => {
      toast.success(t("Project created"));
      setCreateOpen(false);
      refreshProjects();
    },
    onError: (error) => showError(error, t),
  });
  const updateProject = useMutation({
    mutationFn: async ({
      value,
      memberIds,
    }: {
      value: ProjectEditorValue;
      memberIds: string[];
    }) => {
      if (!editingProject) throw new Error(t("Choose a project to edit"));
      const { error } = await supabase.from("projects").update(value).eq("id", editingProject.id);
      if (error) throw error;
      await syncProjectMembers(editingProject.id, memberIds, memberships.data ?? []);
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
          {t("Select a project row to edit every field without leaving the admin workspace.")}
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
        assignablePeople={people.data ?? []}
        initialMemberIds={EMPTY_MEMBER_IDS}
        showAdminFields
        pending={createProject.isPending}
        onSubmit={(value, memberIds) => createProject.mutate({ value, memberIds })}
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
        assignablePeople={people.data ?? []}
        initialMemberIds={editingMemberIds}
        showAdminFields
        pending={updateProject.isPending}
        onSubmit={(value, memberIds) => updateProject.mutate({ value, memberIds })}
      />

      {projects.error ? (
        <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {projects.error.message}
        </p>
      ) : null}
      {projects.isLoading ? (
        <p className="text-sm text-muted-foreground">{t("Loading projects…")}</p>
      ) : null}

      <div className="logbook-card overflow-x-auto">
        <table className="w-full min-w-[900px] text-sm">
          <thead>
            <tr className="border-b border-border text-left">
              <th className="px-4 py-3 font-medium">{t("Project")}</th>
              <th className="px-4 py-3 font-medium">{t("Category")}</th>
              <th className="px-4 py-3 font-medium">{t("Owner")}</th>
              <th className="px-4 py-3 font-medium">{t("Department")}</th>
              <th className="px-4 py-3 text-center font-medium">{t("Team")}</th>
              <th className="px-4 py-3 font-medium">{t("Starting fund")}</th>
              <th className="px-4 py-3 font-medium">{t("Status")}</th>
              <th className="px-4 py-3 font-medium">{t("Last updated")}</th>
              <th className="w-12 px-4 py-3">
                <span className="sr-only">{t("Edit project")}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {sortedProjects.map((project) => {
              const owner = project.owner_id ? peopleById.get(project.owner_id) : undefined;
              const department = project.department_id
                ? departmentsById.get(project.department_id)
                : undefined;
              const memberNames = membersByProject.get(project.id) ?? [];
              const category = project.category ?? "mine";
              const openEditor = () => setEditingProject(project);
              return (
                <tr
                  key={project.id}
                  role="button"
                  tabIndex={0}
                  aria-label={`${t("Edit project")}: ${project.name}`}
                  className={cn(
                    "cursor-pointer border-b border-border transition-colors last:border-0 hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                    project.status === "archived" && "opacity-70",
                  )}
                  onClick={openEditor}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter" && event.key !== " ") return;
                    event.preventDefault();
                    openEditor();
                  }}
                >
                  <td className="px-4 py-3.5">
                    <div className="flex min-w-0 items-center gap-3">
                      <span
                        className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted text-foreground"
                        style={
                          project.color ? { borderLeft: `3px solid ${project.color}` } : undefined
                        }
                      >
                        <FolderKanban className="size-4" aria-hidden="true" />
                      </span>
                      <div className="min-w-0">
                        <p className="max-w-56 truncate font-medium">{project.name}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {project.project_code || t("No code")}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3.5 text-muted-foreground">
                    {t(PROJECT_CATEGORY_LABEL[category] ?? category)}
                  </td>
                  <td className="max-w-48 truncate px-4 py-3.5 text-muted-foreground">
                    {owner ? personDisplayName(owner, t("Unknown user")) : t("Unknown user")}
                  </td>
                  <td className="px-4 py-3.5 text-muted-foreground">{department?.name || "—"}</td>
                  <td className="px-4 py-3.5 text-center text-muted-foreground">
                    {memberNames.length}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3.5 text-muted-foreground">
                    {project.fund_amount === null
                      ? t("Not set")
                      : formatMoney(project.fund_currency, Number(project.fund_amount))}
                  </td>
                  <td className="px-4 py-3.5">
                    <Badge className={PROJECT_STATUS_TONE[project.status] ?? ""}>
                      {t(PROJECT_STATUS_LABEL[project.status] ?? project.status)}
                    </Badge>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3.5 text-xs text-muted-foreground">
                    {formatDateTime(project.updated_at)}
                  </td>
                  <td className="px-4 py-3.5 text-muted-foreground">
                    <Pencil className="size-4" aria-hidden="true" />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!projects.isLoading && !projects.error && sortedProjects.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-muted-foreground">
            {t("No projects yet — create the first one.")}
          </p>
        ) : null}
      </div>
    </div>
  );
}

async function syncProjectMembers(
  projectId: string,
  memberIds: string[],
  memberships: ProjectMemberRow[],
) {
  const nextMemberIds = new Set(memberIds);
  const currentMemberships = memberships.filter(
    (membership) => membership.project_id === projectId,
  );
  const currentMemberIds = new Set(currentMemberships.map((membership) => membership.user_id));
  const memberIdsToAdd = [...nextMemberIds].filter((userId) => !currentMemberIds.has(userId));
  const membershipIdsToRemove = currentMemberships
    .filter((membership) => !nextMemberIds.has(membership.user_id))
    .map((membership) => membership.id);

  if (memberIdsToAdd.length > 0) {
    const { error } = await supabase.from("project_members").insert(
      memberIdsToAdd.map((userId) => ({
        project_id: projectId,
        user_id: userId,
      })),
    );
    if (error) throw error;
  }

  if (membershipIdsToRemove.length > 0) {
    const { error } = await supabase
      .from("project_members")
      .delete()
      .in("id", membershipIdsToRemove);
    if (error) throw error;
  }
}

function showError(error: unknown, t: (text: string) => string) {
  toast.error(error instanceof Error ? error.message : t("Something went wrong"));
}
