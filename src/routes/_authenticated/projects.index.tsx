import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Code2,
  Factory,
  FolderKanban,
  Globe2,
  HardHat,
  Landmark,
  Pickaxe,
  type LucideIcon,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/AppShell";
import { ProjectEditorDialog, type ProjectEditorValue } from "@/components/ProjectEditorDialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
} from "@/hooks/useData";
import { hasCapability } from "@/lib/roles";
import { todayForDateInput } from "@/lib/dates";
import { useLanguage } from "@/lib/i18n";
import { personInitials } from "@/lib/people";
import {
  PROJECT_CATEGORY_LABEL,
  PROJECT_STATUS_LABEL,
  PROJECT_STATUS_ORDER,
  PROJECT_STATUS_TONE,
} from "@/lib/projects";
import { cn } from "@/lib/utils";
import { currentReports } from "@/lib/workLogs";

const MAX_AVATARS = 5;

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
  const editable = hasCapability(permissions, "manage_projects", roles);

  const [open, setOpen] = useState(false);

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
        (PROJECT_STATUS_ORDER[left.status] ?? 9) - (PROJECT_STATUS_ORDER[right.status] ?? 9) ||
        left.name.localeCompare(right.name),
    );
  }, [projectMembers.data, projects.data, staffRestricted, user]);
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
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("projects").update({ status: "archived" }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t("Project archived"));
      queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : t("Could not archive")),
  });

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

      {projects.isLoading ? (
        <p className="text-sm text-muted-foreground">{t("Loading projects…")}</p>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        {visibleProjects.map((project) => {
          const projectCategory = project.category ?? "mine";
          const CategoryIcon = PROJECT_CATEGORY_ICON[projectCategory] ?? FolderKanban;
          const weekly = recentByProject.get(project.id) ?? { entries: 0, hours: 0 };
          const tasks = tasksByProject.get(project.id);
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
                params={{ projectId: project.id }}
                aria-label={`Open ${project.name}`}
                className="absolute inset-0 z-0 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              />
              <div className="pointer-events-none relative z-10 flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-muted text-foreground">
                    <CategoryIcon className="size-5" aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <h2 className="truncate text-sm font-semibold group-hover:underline">
                      {project.name}
                    </h2>
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
                  {editable && project.status !== "archived" ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="text-muted-foreground hover:text-destructive"
                      onClick={() => archive.mutate(project.id)}
                    >
                      {t("Archive")}
                    </Button>
                  ) : null}
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
                          title={person.full_name || person.email}
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
