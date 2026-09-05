import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Code2,
  EllipsisVertical,
  ExternalLink,
  Factory,
  FolderKanban,
  Globe2,
  HardHat,
  Landmark,
  Archive,
  ArchiveRestore,
  Pencil,
  Pin,
  PinOff,
  Pickaxe,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/AppShell";
import { ProjectEditorDialog, type ProjectEditorValue } from "@/components/ProjectEditorDialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/hooks/useSession";
import {
  useDepartments,
  useProjectMembers,
  useProjects,
  useProjectTaskSummary,
  useStaffDirectory,
  useVisibleReports,
  type ProjectRow,
} from "@/hooks/useData";
import { hasCapability } from "@/lib/roles";
import { todayForDateInput } from "@/lib/dates";
import { useLanguage } from "@/lib/i18n";
import { personDisplayName, personInitials } from "@/lib/people";
import {
  PROJECT_CATEGORY_LABEL,
  PROJECT_STATUS_LABEL,
  PROJECT_STATUS_ORDER,
  PROJECT_STATUS_TONE,
  projectSlug,
} from "@/lib/projects";
import { cn } from "@/lib/utils";
import { currentReports } from "@/lib/workLogs";

const MAX_AVATARS = 5;
const PROJECT_PINS_STORAGE_KEY = "renreport.project-pins.v1";

function isoDaysAgo(days: number) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return todayForDateInput(date);
}

const PROJECT_CATEGORY_ICON: Record<string, LucideIcon> = {
  mine: Pickaxe,
  website: Globe2,
  software: Code2,
  construction: HardHat,
  investment: Landmark,
  operations: Factory,
  other: FolderKanban,
};

export const Route = createFileRoute("/_authenticated/projects/")({
  head: () => ({
    meta: [
      { title: "Projects — Ren Report" },
      { name: "description", content: "Projects, staffing, funding and work activity." },
      { property: "og:title", content: "Projects — Ren Report" },
      { property: "og:description", content: "Project operations and reporting activity." },
    ],
  }),
  component: ProjectsPage,
});

function ProjectsPage() {
  const { user, roles, permissions } = useMe();
  const { language, t } = useLanguage();
  const projects = useProjects();
  const departments = useDepartments();
  const people = useStaffDirectory();
  const projectMembers = useProjectMembers();
  const recent = useVisibleReports({ from: isoDaysAgo(6) });
  const taskSummary = useProjectTaskSummary();
  const queryClient = useQueryClient();
  const canManageAll = hasCapability(permissions, "manage_projects", roles);
  const canManageOwn = hasCapability(permissions, "manage_own_projects", roles);
  // Creating is allowed for both; editing a given card depends on ownership below.
  const editable = canManageAll || canManageOwn;

  const [open, setOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<ProjectRow | undefined>();
  const [pinnedProjectIds, setPinnedProjectIds] = useState<string[]>([]);
  const pinStorageKey = user ? `${PROJECT_PINS_STORAGE_KEY}:${user.id}` : null;

  useEffect(() => {
    if (!pinStorageKey) {
      setPinnedProjectIds([]);
      return;
    }
    try {
      const stored = JSON.parse(window.localStorage.getItem(pinStorageKey) ?? "[]");
      setPinnedProjectIds(
        Array.isArray(stored)
          ? stored.filter((value): value is string => typeof value === "string")
          : [],
      );
    } catch {
      setPinnedProjectIds([]);
    }
  }, [pinStorageKey]);

  const pinnedProjectIdSet = useMemo(() => new Set(pinnedProjectIds), [pinnedProjectIds]);

  const staffRestricted = roles.length === 1 && roles[0] === "staff";
  const visibleProjects = useMemo(() => {
    const allProjects = projects.data ?? [];
    const assignedProjectIds = new Set(
      (projectMembers.data ?? [])
        .filter((member) => member.user_id === user?.id)
        .map((member) => member.project_id),
    );
    const listed =
      !staffRestricted || !user
        ? allProjects
        : allProjects.filter(
            (project) => project.owner_id === user.id || assignedProjectIds.has(project.id),
          );
    return [...listed].sort(
      (left, right) =>
        Number(pinnedProjectIdSet.has(right.id)) - Number(pinnedProjectIdSet.has(left.id)) ||
        (PROJECT_STATUS_ORDER[left.status] ?? 9) - (PROJECT_STATUS_ORDER[right.status] ?? 9) ||
        left.name.localeCompare(right.name),
    );
  }, [pinnedProjectIdSet, projectMembers.data, projects.data, staffRestricted, user]);
  const peopleById = useMemo(
    () => new Map((people.data ?? []).map((person) => [person.id, person])),
    [people.data],
  );
  const recentByProject = useMemo(() => {
    const map = new Map<string, { entries: number; hours: number }>();
    for (const report of currentReports(recent.data ?? [])) {
      if (!report.project_id) continue;
      const current = map.get(report.project_id) ?? { entries: 0, hours: 0 };
      current.entries += 1;
      current.hours += Number(report.hours_spent);
      map.set(report.project_id, current);
    }
    return map;
  }, [recent.data]);
  const tasksByProject = useMemo(() => {
    const map = new Map<string, { done: number; total: number }>();
    for (const task of taskSummary.data ?? []) {
      const current = map.get(task.project_id) ?? { done: 0, total: 0 };
      current.total += 1;
      if (task.is_completed) current.done += 1;
      map.set(task.project_id, current);
    }
    return map;
  }, [taskSummary.data]);

  const create = useMutation({
    mutationFn: async (value: ProjectEditorValue) => {
      if (!user) throw new Error("Your session has expired");
      const { error } = await supabase.from("projects").insert({
        ...value,
        owner_id: user.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t("Project created"));
      setOpen(false);
      queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : t("Could not create project")),
  });

  const archive = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "active" | "archived" }) => {
      const { error } = await supabase.from("projects").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      toast.success(t(variables.status === "archived" ? "Project archived" : "Project restored"));
      queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : t("Could not update project")),
  });

  const update = useMutation({
    mutationFn: async (value: ProjectEditorValue) => {
      if (!editingProject) throw new Error(t("Choose a project to edit"));
      const { error } = await supabase.from("projects").update(value).eq("id", editingProject.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t("Project updated"));
      setEditingProject(undefined);
      queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : t("Could not update project")),
  });

  function togglePin(projectId: string) {
    const wasPinned = pinnedProjectIdSet.has(projectId);
    const next = wasPinned
      ? pinnedProjectIds.filter((id) => id !== projectId)
      : [projectId, ...pinnedProjectIds];
    setPinnedProjectIds(next);
    if (pinStorageKey) {
      try {
        window.localStorage.setItem(pinStorageKey, JSON.stringify(next));
      } catch {
        // The visual pin still works for the current session when storage is unavailable.
      }
    }
    toast.success(t(wasPinned ? "Project unpinned" : "Project pinned"));
  }

  return (
    <>
      <PageHeader
        title="Projects"
        action={
          editable ? <Button onClick={() => setOpen(true)}>{t("New project")}</Button> : undefined
        }
      />

      <ProjectEditorDialog
        open={open && editable}
        onOpenChange={setOpen}
        defaultOwnerId={user?.id}
        departments={departments.data ?? []}
        pending={create.isPending}
        onSubmit={(value) => create.mutate(value)}
      />
      <ProjectEditorDialog
        open={!!editingProject && editable}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setEditingProject(undefined);
        }}
        project={editingProject}
        defaultOwnerId={user?.id}
        departments={departments.data ?? []}
        pending={update.isPending}
        onSubmit={(value) => update.mutate(value)}
      />

      {projects.isLoading ? (
        <p className="text-sm text-muted-foreground">{t("Loading projects…")}</p>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        {visibleProjects.map((project) => {
          const projectCategory = project.category ?? "mine";
          const CategoryIcon = PROJECT_CATEGORY_ICON[projectCategory] ?? FolderKanban;
          const weekly = recentByProject.get(project.id) ?? { entries: 0, hours: 0 };
          const tasks = tasksByProject.get(project.id);
          const isPinned = pinnedProjectIdSet.has(project.id);
          const canEditThis = canManageAll || (canManageOwn && project.owner_id === user?.id);
          const members = (projectMembers.data ?? [])
            .filter((member) => member.project_id === project.id)
            .map((member) => peopleById.get(member.user_id))
            .filter((person): person is NonNullable<typeof person> => !!person);
          return (
            <article
              key={project.id}
              className={cn(
                "logbook-card group relative isolate cursor-pointer p-5 transition-[transform,box-shadow] hover:-translate-y-0.5 hover:shadow-raise",
                project.status === "archived" && "opacity-70",
              )}
            >
              <Link
                to="/projects/$projectId"
                params={{ projectId: projectSlug(project) }}
                search={{ tab: "overview" }}
                aria-label={`${t("Open project")}: ${project.name}`}
                className="absolute inset-0 z-0 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              />
              <div className="pointer-events-none relative z-10 flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-muted text-foreground">
                    <CategoryIcon className="size-5" aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <div className="flex min-w-0 items-center gap-1.5">
                      <h2 className="truncate text-sm font-semibold group-hover:underline">
                        {project.name}
                      </h2>
                      {isPinned ? (
                        <Pin
                          className="size-3.5 shrink-0 fill-current text-primary"
                          aria-hidden="true"
                        />
                      ) : null}
                    </div>
                    <p className="logbook-label mt-1">
                      {t(PROJECT_CATEGORY_LABEL[projectCategory] ?? projectCategory)}
                      {project.project_code ? ` · ${project.project_code}` : ""}
                    </p>
                  </div>
                </div>
                <div className="pointer-events-auto flex shrink-0 items-center gap-1">
                  <Badge className={PROJECT_STATUS_TONE[project.status] ?? ""}>
                    {t(PROJECT_STATUS_LABEL[project.status] ?? project.status)}
                  </Badge>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="size-8 text-muted-foreground"
                        aria-label={`${t("Project actions")}: ${project.name}`}
                      >
                        <EllipsisVertical aria-hidden="true" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="min-w-44">
                      <DropdownMenuItem asChild>
                        <Link
                          to="/projects/$projectId"
                          params={{ projectId: projectSlug(project) }}
                          search={{ tab: "overview" }}
                        >
                          <ExternalLink />
                          {t("Open project")}
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => togglePin(project.id)}>
                        {isPinned ? <PinOff /> : <Pin />}
                        {t(isPinned ? "Unpin project" : "Pin project")}
                      </DropdownMenuItem>
                      {canEditThis ? (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onSelect={() => setEditingProject(project)}>
                            <Pencil />
                            {t("Edit project")}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className={
                              project.status === "archived"
                                ? undefined
                                : "text-destructive focus:text-destructive"
                            }
                            disabled={archive.isPending}
                            onSelect={() =>
                              archive.mutate({
                                id: project.id,
                                status: project.status === "archived" ? "active" : "archived",
                              })
                            }
                          >
                            {project.status === "archived" ? <ArchiveRestore /> : <Archive />}
                            {t(project.status === "archived" ? "Restore project" : "Archive")}
                          </DropdownMenuItem>
                        </>
                      ) : null}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
              {project.description ? (
                <p className="pointer-events-none relative z-10 mt-3 line-clamp-2 text-sm leading-relaxed text-muted-foreground">
                  {project.description}
                </p>
              ) : null}
              <div className="pointer-events-none relative z-10 mt-4 flex items-center justify-between gap-3">
                {members.length ? (
                  <div className="flex items-center gap-2">
                    <div className="flex -space-x-2">
                      {members.slice(0, MAX_AVATARS).map((person) => (
                        <Avatar
                          key={person.id}
                          className="size-7 border-2 border-card"
                          title={personDisplayName(person, t("Unknown user"))}
                        >
                          <AvatarImage src={person.avatar_url ?? undefined} alt="" />
                          <AvatarFallback className="text-[10px] font-semibold">
                            {personInitials(person.full_name, person.email)}
                          </AvatarFallback>
                        </Avatar>
                      ))}
                      {members.length > MAX_AVATARS ? (
                        <span className="grid size-7 place-items-center rounded-full border-2 border-card bg-muted text-[10px] font-semibold">
                          +{members.length - MAX_AVATARS}
                        </span>
                      ) : null}
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {language === "zh" ? `${members.length} 名员工` : `${members.length} staff`}
                    </span>
                  </div>
                ) : (
                  <span className="text-xs text-muted-foreground">
                    {t("No staff assigned yet.")}
                  </span>
                )}
                <div className="shrink-0 text-right text-xs text-muted-foreground">
                  <p>
                    {t("Last 7 days")}: {weekly.entries} {t("entries")} · {weekly.hours.toFixed(1)}h
                  </p>
                  {tasks && tasks.total > 0 ? (
                    <p className="mt-0.5">
                      {t("To-do list")}: {tasks.done}/{tasks.total}
                    </p>
                  ) : null}
                </div>
              </div>
              {tasks && tasks.total > 0 ? (
                <Progress
                  value={(tasks.done / tasks.total) * 100}
                  className="pointer-events-none relative z-10 mt-3 h-1.5"
                />
              ) : null}
            </article>
          );
        })}
        {!projects.isLoading && visibleProjects.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {language === "zh"
              ? staffRestricted
                ? "尚未分配任何项目。"
                : editable
                  ? "尚无项目 — 请创建第一个项目。"
                  : "尚无项目。"
              : staffRestricted
                ? "No projects assigned to you."
                : `No projects yet${editable ? " — create the first one." : "."}`}
          </p>
        ) : null}
      </div>
    </>
  );
}
