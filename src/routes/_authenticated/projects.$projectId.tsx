import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  Banknote,
  Building2,
  CalendarDays,
  CheckCircle2,
  Circle,
  Clock3,
  ExternalLink,
  Flag,
  FolderKanban,
  GitCommitHorizontal,
  ListTodo,
  MapPin,
  Plus,
  ReceiptText,
  Settings2,
  Trash2,
  Trophy,
  UserPlus,
  Users,
} from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/AppShell";
import { ExpenseDialog } from "@/components/ExpenseDialog";
import { ProjectEditorDialog, type ProjectEditorValue } from "@/components/ProjectEditorDialog";
import { ImageLightbox, WorkLogDialog, WorkLogImages } from "@/components/WorkLog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  useDepartments,
  useExpenses,
  useProjectMilestones,
  useProjectGitEvents,
  useProjectMembers,
  useProjectTasks,
  useProjects,
  useStaffDirectory,
  useVisibleReports,
  type ProjectTaskRow,
  type StaffDirectoryRow,
} from "@/hooks/useData";
import { useMe } from "@/hooks/useSession";
import { supabase } from "@/integrations/supabase/client";
import { todayForDateInput } from "@/lib/dates";
import { deleteRecord } from "@/lib/deleteRecord";
import { useLanguage } from "@/lib/i18n";
import { personInitials } from "@/lib/people";
import {
  LICENSE_STATUS_LABEL,
  MINING_METHOD_LABEL,
  PROJECT_CATEGORY_LABEL,
  PROJECT_LEGAL_NAME_LABEL,
  PROJECT_LOCATION_LABEL,
  PROJECT_STATUS_TONE,
  PROJECT_URL_LABEL,
} from "@/lib/projects";
import { hasCapability, WORK_STATUS_LABEL } from "@/lib/roles";
import { staffLoginLabel } from "@/lib/staffAuth";
import {
  currentReports,
  historyOf,
  reportMeta,
  reportStamp,
  rowKeyHandler,
  STATUS_TONE,
} from "@/lib/workLogs";
import {
  firstValidationError,
  projectMemberSchema,
  projectMilestoneSchema,
  projectTaskSchema,
} from "@/lib/validation";

export const Route = createFileRoute("/_authenticated/projects/$projectId")({
  head: () => ({
    meta: [
      { title: "Project — Ren Report" },
      {
        name: "description",
        content:
          "Project details, to-do progress, milestones, staff, work activity, expenses and current fund.",
      },
    ],
  }),
  component: ProjectDetailPage,
});

const STATUS_LABEL: Record<string, string> = {
  active: "Active",
  paused: "Paused",
  completed: "Completed",
  archived: "Archived",
  draft: "Draft",
  submitted: "Submitted",
  approved: "Approved",
  rejected: "Rejected",
  completed_work: "Completed",
  in_progress: "In progress",
  blocked: "Blocked",
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}

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

function ProjectDetailPage() {
  const { projectId } = Route.useParams();
  const { user, profile, roles, permissions } = useMe();
  const { language, t } = useLanguage();
  const projects = useProjects();
  const departments = useDepartments();
  const people = useStaffDirectory();
  const memberships = useProjectMembers();
  const tasks = useProjectTasks(projectId);
  const milestones = useProjectMilestones(projectId);
  const reports = useVisibleReports({ projectId });
  const expenses = useExpenses({ projectId });
  const queryClient = useQueryClient();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [taskOpen, setTaskOpen] = useState(false);
  const [taskDescription, setTaskDescription] = useState("");
  const [taskAssignee, setTaskAssignee] = useState("");
  const [taskDueDate, setTaskDueDate] = useState("");
  const [deleteTaskId, setDeleteTaskId] = useState<string | null>(null);
  const [milestoneOpen, setMilestoneOpen] = useState(false);
  const [selectedMilestoneId, setSelectedMilestoneId] = useState<string | null>(null);
  const [milestoneTitle, setMilestoneTitle] = useState("");
  const [milestoneDescription, setMilestoneDescription] = useState("");
  const [milestoneTargetDate, setMilestoneTargetDate] = useState(todayForDateInput);
  const [expenseOpen, setExpenseOpen] = useState(false);
  const [staffOpen, setStaffOpen] = useState(false);
  const [staffSearch, setStaffSearch] = useState("");

  const rawProject = projects.data?.find((item) => item.id === projectId);
  const staffRestricted = roles.length === 1 && roles[0] === "staff";
  const staffAssigned =
    rawProject?.owner_id === user?.id ||
    (memberships.data ?? []).some(
      (membership) => membership.project_id === projectId && membership.user_id === user?.id,
    );
  const project = rawProject && (!staffRestricted || staffAssigned) ? rawProject : undefined;
  const gitEvents = useProjectGitEvents(
    projectId,
    project?.repository_url,
    project?.category === "website",
  );
  const peopleById = useMemo(
    () => new Map((people.data ?? []).map((person) => [person.id, person])),
    [people.data],
  );
  const assignedUserIds = useMemo(
    () =>
      new Set(
        (memberships.data ?? [])
          .filter((membership) => membership.project_id === projectId)
          .map((membership) => membership.user_id),
      ),
    [memberships.data, projectId],
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
  const totalHours = useMemo(
    () =>
      currentReports(reports.data ?? []).reduce(
        (sum, report) => sum + Number(report.hours_spent),
        0,
      ),
    [reports.data],
  );
  const selectedReport = useMemo(
    () =>
      selectedReportId
        ? ((reports.data ?? []).find((report) => report.id === selectedReportId) ?? null)
        : null,
    [reports.data, selectedReportId],
  );
  const selectedHistory = useMemo(
    () => (selectedReport ? historyOf(selectedReport, reports.data ?? []) : []),
    [reports.data, selectedReport],
  );
  const activityItems = useMemo(
    () =>
      [
        ...currentReports(reports.data ?? []).map((report) => ({
          kind: "report" as const,
          id: report.id,
          occurredAt: `${report.report_date}T${report.report_time || "00:00"}`,
          report,
        })),
        ...(gitEvents.data?.events ?? []).map((event) => ({
          kind: "git" as const,
          id: event.id,
          occurredAt: event.occurred_at,
          event,
        })),
      ].sort(
        (left, right) => new Date(right.occurredAt).getTime() - new Date(left.occurredAt).getTime(),
      ),
    [gitEvents.data?.events, reports.data],
  );
  const completedTaskCount = useMemo(
    () => (tasks.data ?? []).filter((task) => task.is_completed).length,
    [tasks.data],
  );
  const openTasks = useMemo(
    () => (tasks.data ?? []).filter((task) => !task.is_completed),
    [tasks.data],
  );
  const completedTasks = useMemo(
    () => (tasks.data ?? []).filter((task) => task.is_completed),
    [tasks.data],
  );
  const selectedMilestone = useMemo(
    () =>
      selectedMilestoneId
        ? ((milestones.data ?? []).find((milestone) => milestone.id === selectedMilestoneId) ??
          null)
        : null,
    [milestones.data, selectedMilestoneId],
  );
  const achievedMilestoneCount = useMemo(
    () => (milestones.data ?? []).filter((milestone) => milestone.is_achieved).length,
    [milestones.data],
  );
  const taskProgress = tasks.data?.length
    ? Math.round((completedTaskCount / tasks.data.length) * 100)
    : 0;
  const expenseTotals = useMemo(() => {
    const totals = new Map<string, number>();
    for (const expense of expenses.data ?? []) {
      totals.set(expense.currency, (totals.get(expense.currency) ?? 0) + Number(expense.amount));
    }
    return [...totals.entries()]
      .map(([currency, amount]) => formatMoney(currency, amount))
      .join(" · ");
  }, [expenses.data]);
  const hasVisibleExpenses = (expenses.data?.length ?? 0) > 0;

  const category = project?.category ?? "mine";
  const legalNameLabel = PROJECT_LEGAL_NAME_LABEL[category] ?? "Legal name";
  const locationLabel = PROJECT_LOCATION_LABEL[category];
  const urlLabel = PROJECT_URL_LABEL[category];
  const fundCurrency = project?.fund_currency ?? "USD";
  const expenseTotalLabel = expenseTotals || formatMoney(fundCurrency, 0);
  const committedExpenses = useMemo(
    () =>
      (expenses.data ?? []).reduce(
        (total, expense) =>
          expense.currency === fundCurrency && expense.status !== "rejected"
            ? total + Number(expense.amount)
            : total,
        0,
      ),
    [expenses.data, fundCurrency],
  );
  const currentFund =
    project?.fund_amount === null || project?.fund_amount === undefined
      ? null
      : Number(project.fund_amount) - committedExpenses;
  const canManageProject =
    !!profile?.is_active &&
    (roles.includes("admin") ||
      hasCapability(permissions, "manage_projects", roles) ||
      (!!user &&
        project?.owner_id === user.id &&
        hasCapability(permissions, "manage_own_projects", roles)));
  const canManageStaff =
    !!profile?.is_active && !!user && (project?.owner_id === user.id || roles.includes("admin"));
  const canDeleteProject = !!profile?.is_active && roles.includes("admin");
  const navigate = useNavigate();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const deleteProject = useMutation({
    mutationFn: () => deleteRecord("project", projectId),
    onSuccess: () => {
      toast.success(t("Project deleted"));
      setDeleteOpen(false);
      queryClient.invalidateQueries();
      navigate({ to: "/projects", replace: true });
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : t("Could not delete project")),
  });
  const canViewAllExpenses = hasCapability(permissions, "view_expenses", roles);
  const canSubmitExpenses =
    !!profile?.is_active && hasCapability(permissions, "submit_expenses", roles);
  const currentFundLabel =
    currentFund === null
      ? "Not set"
      : canViewAllExpenses
        ? formatMoney(fundCurrency, currentFund)
        : "Restricted";

  const assignMember = useMutation({
    mutationFn: async (userId: string) => {
      const parsed = projectMemberSchema.safeParse({ project_id: projectId, user_id: userId });
      if (!parsed.success) throw new Error(firstValidationError(parsed.error));
      const { error } = await supabase.from("project_members").insert(parsed.data);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t("Staff member assigned"));
      setStaffSearch("");
      queryClient.invalidateQueries({ queryKey: ["project-members"] });
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : t("Could not assign staff")),
  });

  const removeMember = useMutation({
    mutationFn: async (userId: string) => {
      const parsed = projectMemberSchema.safeParse({ project_id: projectId, user_id: userId });
      if (!parsed.success) throw new Error(firstValidationError(parsed.error));
      const { error } = await supabase
        .from("project_members")
        .delete()
        .eq("project_id", parsed.data.project_id)
        .eq("user_id", parsed.data.user_id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t("Staff member removed"));
      queryClient.invalidateQueries({ queryKey: ["project-members"] });
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : t("Could not remove staff")),
  });

  const createTask = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error(t("Sign in again before creating a task"));
      const description = taskDescription.trim();
      const parsed = projectTaskSchema.safeParse({
        project_id: projectId,
        title: description.slice(0, 160),
        description,
        assignee_id: taskAssignee,
        due_date: taskDueDate,
      });
      if (!parsed.success) throw new Error(firstValidationError(parsed.error));
      const { error } = await supabase.from("project_tasks").insert({
        ...parsed.data,
        description: parsed.data.description ?? null,
        assignee_id: parsed.data.assignee_id ?? null,
        due_date: parsed.data.due_date ?? null,
        created_by: user.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t("Task added"));
      setTaskOpen(false);
      setTaskDescription("");
      setTaskAssignee("");
      setTaskDueDate("");
      queryClient.invalidateQueries({ queryKey: ["project-tasks", projectId] });
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : t("Could not add the task")),
  });

  const toggleTask = useMutation({
    mutationFn: async ({ id, isCompleted }: { id: string; isCompleted: boolean }) => {
      const { error } = await supabase
        .from("project_tasks")
        .update({ is_completed: isCompleted })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      toast.success(t(variables.isCompleted ? "Task completed" : "Task reopened"));
      queryClient.invalidateQueries({ queryKey: ["project-tasks", projectId] });
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : t("Could not update the task")),
  });

  const deleteTask = useMutation({
    mutationFn: async () => {
      if (!roles.includes("admin")) throw new Error(t("Only admins can delete to-dos"));
      if (!deleteTaskId) throw new Error(t("Choose a to-do to delete"));
      const { error } = await supabase
        .from("project_tasks")
        .delete()
        .eq("id", deleteTaskId)
        .eq("project_id", projectId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t("To-do deleted"));
      setDeleteTaskId(null);
      queryClient.invalidateQueries({ queryKey: ["project-tasks", projectId] });
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : t("Could not delete the to-do")),
  });

  const createMilestone = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error(t("Sign in again before creating a milestone"));
      const parsed = projectMilestoneSchema.safeParse({
        project_id: projectId,
        title: milestoneTitle,
        description: milestoneDescription,
        target_date: milestoneTargetDate,
      });
      if (!parsed.success) throw new Error(firstValidationError(parsed.error));
      const { error } = await supabase.from("project_milestones").insert({
        ...parsed.data,
        description: parsed.data.description ?? null,
        target_date: parsed.data.target_date ?? null,
        created_by: user.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t("Milestone added"));
      setMilestoneOpen(false);
      setMilestoneTitle("");
      setMilestoneDescription("");
      setMilestoneTargetDate(todayForDateInput());
      queryClient.invalidateQueries({ queryKey: ["project-milestones", projectId] });
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : t("Could not add the milestone")),
  });

  const toggleMilestone = useMutation({
    mutationFn: async ({ id, isAchieved }: { id: string; isAchieved: boolean }) => {
      const { error } = await supabase
        .from("project_milestones")
        .update({ is_achieved: isAchieved })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      toast.success(t(variables.isAchieved ? "Milestone achieved" : "Milestone reopened"));
      queryClient.invalidateQueries({ queryKey: ["project-milestones", projectId] });
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : t("Could not update the milestone")),
  });

  const updateSettings = useMutation({
    mutationFn: async (value: ProjectEditorValue) => {
      const { error } = await supabase.from("projects").update(value).eq("id", projectId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t("Project updated"));
      setSettingsOpen(false);
      queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : t("Could not update project")),
  });

  function openMilestoneDialog() {
    setMilestoneTargetDate(todayForDateInput());
    setMilestoneOpen(true);
  }

  if (projects.isLoading || (staffRestricted && memberships.isLoading)) {
    return <p className="text-sm text-muted-foreground">{t("Loading project…")}</p>;
  }

  if (projects.error) {
    return (
      <Alert variant="destructive">
        <AlertTitle>{t("Could not load the project")}</AlertTitle>
        <AlertDescription>{projects.error.message}</AlertDescription>
      </Alert>
    );
  }

  if (!project) {
    return (
      <div className="space-y-4">
        <Button asChild variant="ghost">
          <Link to="/projects">
            <ArrowLeft />
            {t("Projects")}
          </Link>
        </Button>
        <Alert>
          <AlertTitle>{t("Project not found")}</AlertTitle>
          <AlertDescription>
            {t("This project may have been removed or is not visible to your account.")}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const owner = project.owner_id ? peopleById.get(project.owner_id) : undefined;
  const department = departments.data?.find((item) => item.id === project.department_id);
  const hasIdentityDetails = Boolean(
    project.legal_name || project.project_code || department || owner,
  );
  const hasOperationsDetails = Boolean(
    (locationLabel && project.location) ||
    (category === "mine" &&
      (project.mining_method !== "other" ||
        project.license_status !== "unknown" ||
        project.area_km2 !== null ||
        project.reserve_kg !== null)),
  );

  return (
    <>
      <Button asChild variant="ghost" className="mb-4 -ml-3">
        <Link to="/projects">
          <ArrowLeft />
          {t("Projects")}
        </Link>
      </Button>

      <PageHeader
        title={project.name}
        action={
          <div className="flex items-center gap-2">
            {canManageProject ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setSettingsOpen(true)}
              >
                <Settings2 />
                {t("Edit project")}
              </Button>
            ) : null}
            {canDeleteProject ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="text-destructive hover:text-destructive"
                onClick={() => setDeleteOpen(true)}
              >
                <Trash2 />
                {t("Delete project")}
              </Button>
            ) : null}
            <Badge className={PROJECT_STATUS_TONE[project.status] ?? ""}>
              {t(STATUS_LABEL[project.status] ?? project.status)}
            </Badge>
          </div>
        }
      />

      <AlertDialog open={deleteOpen && canDeleteProject} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("Delete this project?")}</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="block font-medium text-foreground">{project.name}</span>
              {t(
                "This permanently removes the project together with its work logs and photos, expenses, tasks, milestones, staff assignments and GitHub activity. This cannot be undone.",
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteProject.isPending}>{t("Cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteProject.isPending}
              onClick={(event) => {
                event.preventDefault();
                deleteProject.mutate();
              }}
            >
              {deleteProject.isPending ? t("Deleting…") : t("Delete project")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <WorkLogDialog
        report={selectedReport}
        history={selectedHistory}
        projectName={project.name}
        personName={
          selectedReport
            ? peopleById.get(selectedReport.user_id)?.full_name || t("Unknown user")
            : undefined
        }
        onClose={() => setSelectedReportId(null)}
        onOpenImage={setLightbox}
      />
      <ImageLightbox src={lightbox} onClose={() => setLightbox(null)} />

      <ProjectEditorDialog
        open={settingsOpen && canManageProject}
        onOpenChange={setSettingsOpen}
        project={project}
        defaultOwnerId={user?.id}
        departments={departments.data ?? []}
        people={people.data ?? []}
        showAdminFields={roles.includes("admin")}
        pending={updateSettings.isPending}
        onSubmit={(value) => updateSettings.mutate(value)}
      />

      <Dialog open={taskOpen && canManageProject} onOpenChange={setTaskOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("Add to-do")}</DialogTitle>
            <DialogDescription>
              {t("Assign a clear project task to a staff member, with an optional due date.")}
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              createTask.mutate();
            }}
          >
            <Field label="To-do description" id="task-description">
              <Textarea
                id="task-description"
                value={taskDescription}
                maxLength={2000}
                rows={5}
                autoFocus
                onChange={(event) => setTaskDescription(event.target.value)}
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Assign to" id="task-assignee">
                <select
                  id="task-assignee"
                  className="h-10 w-full rounded-md border border-input bg-card px-3 pr-10 text-base sm:text-sm"
                  value={taskAssignee}
                  onChange={(event) => setTaskAssignee(event.target.value)}
                >
                  <option value="">{t("Unassigned")}</option>
                  {assignedPeople.map((person) => (
                    <option key={person.id} value={person.id}>
                      {person.full_name || staffLoginLabel(person.email)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Due date" id="task-due-date">
                <Input
                  id="task-due-date"
                  type="date"
                  value={taskDueDate}
                  onChange={(event) => setTaskDueDate(event.target.value)}
                />
              </Field>
            </div>
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline">
                  {t("Cancel")}
                </Button>
              </DialogClose>
              <Button type="submit" disabled={createTask.isPending}>
                {createTask.isPending ? t("Adding…") : t("Add to-do")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={milestoneOpen && canManageProject} onOpenChange={setMilestoneOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("Add milestone")}</DialogTitle>
            <DialogDescription>
              {t("Record a significant target. The target completion date defaults to today.")}
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              createMilestone.mutate();
            }}
          >
            <Field label="Milestone title" id="milestone-title">
              <Input
                id="milestone-title"
                value={milestoneTitle}
                maxLength={160}
                autoFocus
                onChange={(event) => setMilestoneTitle(event.target.value)}
              />
            </Field>
            <Field label="Details" id="milestone-description">
              <Textarea
                id="milestone-description"
                value={milestoneDescription}
                maxLength={2000}
                rows={4}
                onChange={(event) => setMilestoneDescription(event.target.value)}
              />
            </Field>
            <Field label="Target completion date" id="milestone-target-date">
              <Input
                id="milestone-target-date"
                type="date"
                value={milestoneTargetDate}
                onChange={(event) => setMilestoneTargetDate(event.target.value)}
              />
            </Field>
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline">
                  {t("Cancel")}
                </Button>
              </DialogClose>
              <Button type="submit" disabled={createMilestone.isPending}>
                {createMilestone.isPending ? t("Adding…") : t("Add milestone")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!deleteTaskId && roles.includes("admin")}
        onOpenChange={(open) => {
          if (!open) setDeleteTaskId(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("Delete this to-do?")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("This permanently removes the to-do. This cannot be undone.")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteTask.isPending}>{t("Cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteTask.isPending}
              onClick={(event) => {
                event.preventDefault();
                deleteTask.mutate();
              }}
            >
              {deleteTask.isPending ? t("Deleting…") : t("Delete to-do")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog
        open={!!selectedMilestone}
        onOpenChange={(open) => {
          if (!open) setSelectedMilestoneId(null);
        }}
      >
        <DialogContent className="sm:max-w-lg">
          {selectedMilestone ? (
            <>
              <DialogHeader>
                <div className="mb-2 flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                  {selectedMilestone.is_achieved ? (
                    <Trophy className="size-5" aria-hidden="true" />
                  ) : (
                    <Flag className="size-5" aria-hidden="true" />
                  )}
                </div>
                <DialogTitle>{selectedMilestone.title}</DialogTitle>
                <DialogDescription>
                  {t(selectedMilestone.is_achieved ? "Achieved milestone" : "Milestone target")}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
                  {selectedMilestone.description || t("No milestone details provided.")}
                </p>
                <div className="rounded-xl bg-muted/60 p-4">
                  <p className="logbook-label">
                    {t(selectedMilestone.is_achieved ? "Achieved date" : "Target date")}
                  </p>
                  <p className="mt-1 text-sm font-medium">
                    {selectedMilestone.is_achieved && selectedMilestone.achieved_at
                      ? formatDate(selectedMilestone.achieved_at)
                      : selectedMilestone.target_date
                        ? formatDate(selectedMilestone.target_date)
                        : t("No target date")}
                  </p>
                </div>
              </div>
              <DialogFooter>
                {canManageProject ? (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={toggleMilestone.isPending}
                    onClick={() =>
                      toggleMilestone.mutate({
                        id: selectedMilestone.id,
                        isAchieved: !selectedMilestone.is_achieved,
                      })
                    }
                  >
                    {t(selectedMilestone.is_achieved ? "Reopen" : "Mark achieved")}
                  </Button>
                ) : null}
                <DialogClose asChild>
                  <Button type="button">{t("Done")}</Button>
                </DialogClose>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog
        open={staffOpen && canManageStaff}
        onOpenChange={(nextOpen) => {
          setStaffOpen(nextOpen);
          if (!nextOpen) setStaffSearch("");
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("Add staff")}</DialogTitle>
            <DialogDescription>
              {t("Only the project creator or an admin can change staff assignments.")}
            </DialogDescription>
          </DialogHeader>
          <Field label="Find staff by name or email" id="project-staff-search">
            <Input
              id="project-staff-search"
              type="search"
              value={staffSearch}
              placeholder={t("Name or email address")}
              onChange={(event) => setStaffSearch(event.target.value)}
            />
          </Field>
          <div className="max-h-72 divide-y divide-border overflow-y-auto rounded-lg border border-border">
            {availablePeople.map((person) => (
              <div key={person.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
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
                  {t("Assign")}
                </Button>
              </div>
            ))}
            {!people.isLoading && availablePeople.length === 0 ? (
              <p className="px-3 py-5 text-center text-sm text-muted-foreground">
                {t("No matching unassigned staff.")}
              </p>
            ) : null}
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                {t("Done")}
              </Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ExpenseDialog
        open={expenseOpen && canSubmitExpenses}
        onOpenChange={setExpenseOpen}
        defaultProjectId={projectId}
        defaultProjectName={project.name}
        lockProject
      />

      <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        {currentFund !== null ? (
          <SummaryCard
            icon={Banknote}
            label="Current fund"
            value={currentFundLabel}
            tone="bg-stat-teal"
          />
        ) : null}
        {assignedPeople.length > 0 ? (
          <SummaryCard
            icon={Users}
            label="Assigned staff"
            value={String(assignedPeople.length)}
            tone="bg-stat-gold"
          />
        ) : null}
        {(reports.data?.length ?? 0) > 0 ? (
          <SummaryCard
            icon={Clock3}
            label="Work logs"
            value={`${reports.data?.length ?? 0} · ${totalHours.toFixed(1)}h`}
            tone="bg-stat-violet"
          />
        ) : null}
        <SummaryCard
          icon={ReceiptText}
          label="Total expenses"
          value={expenseTotalLabel}
          tone="bg-stat-copper"
        />
      </div>

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList className="flex h-auto w-full justify-start gap-1 overflow-x-auto [scrollbar-width:none] sm:grid sm:grid-cols-5 sm:overflow-visible [&::-webkit-scrollbar]:hidden">
          <TabsTrigger value="overview" className="shrink-0">
            {t("Overview")}
          </TabsTrigger>
          <TabsTrigger value="progress" className="shrink-0">
            {t("Progress")} ({completedTaskCount}/{tasks.data?.length ?? 0})
          </TabsTrigger>
          <TabsTrigger value="staff" className="shrink-0">
            {t("Staff")} ({assignedPeople.length})
          </TabsTrigger>
          <TabsTrigger value="activity" className="shrink-0">
            {t("Activity")} ({activityItems.length})
          </TabsTrigger>
          <TabsTrigger value="expenses" className="shrink-0">
            {t("Expenses")} ({expenses.data?.length ?? 0})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <div className="overflow-hidden rounded-2xl bg-card shadow-sm">
            <div className="relative overflow-hidden bg-gradient-to-br from-primary/15 via-card to-stat-gold/60 p-6 sm:p-8">
              <div
                className="absolute inset-x-0 top-0 h-1"
                style={{ backgroundColor: project.color || "hsl(var(--primary))" }}
              />
              <div className="flex flex-wrap items-start justify-between gap-5">
                <div className="flex min-w-0 items-start gap-4">
                  <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-sm">
                    <FolderKanban className="size-6" aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="secondary">
                        {t(PROJECT_CATEGORY_LABEL[category] ?? category)}
                      </Badge>
                      {project.project_code ? (
                        <span className="text-xs font-medium text-muted-foreground">
                          {project.project_code}
                        </span>
                      ) : null}
                    </div>
                    <h2 className="mt-3 text-xl font-semibold tracking-tight sm:text-2xl">
                      {project.legal_name || project.name}
                    </h2>
                    {project.description ? (
                      <p className="mt-2 max-w-3xl whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
                        {project.description}
                      </p>
                    ) : null}
                  </div>
                </div>
                <Badge className={PROJECT_STATUS_TONE[project.status] ?? ""}>
                  {t(STATUS_LABEL[project.status] ?? project.status)}
                </Badge>
              </div>
            </div>

            <div className="grid gap-4 p-4 sm:p-6 lg:grid-cols-2">
              {hasIdentityDetails ? (
                <OverviewGroup icon={Building2} title="Ownership & identity">
                  {project.legal_name ? (
                    <ProjectField label={legalNameLabel} value={project.legal_name} />
                  ) : null}
                  {project.project_code ? (
                    <ProjectField label="Project code" value={project.project_code} />
                  ) : null}
                  {department ? <ProjectField label="Department" value={department.name} /> : null}
                  {owner ? (
                    <ProjectField
                      label="Project creator"
                      value={owner.full_name || staffLoginLabel(owner.email)}
                    />
                  ) : null}
                </OverviewGroup>
              ) : null}

              {hasOperationsDetails ? (
                <OverviewGroup icon={MapPin} title="Operations">
                  {locationLabel && project.location ? (
                    <ProjectField label={locationLabel} value={project.location} />
                  ) : null}
                  {category === "mine" && project.mining_method !== "other" ? (
                    <ProjectField
                      label="Mining method"
                      value={t(MINING_METHOD_LABEL[project.mining_method] ?? project.mining_method)}
                    />
                  ) : null}
                  {category === "mine" && project.license_status !== "unknown" ? (
                    <ProjectField
                      label="License status"
                      value={t(
                        LICENSE_STATUS_LABEL[project.license_status] ?? project.license_status,
                      )}
                    />
                  ) : null}
                  {category === "mine" && project.area_km2 !== null ? (
                    <ProjectField
                      label="Area"
                      value={`${Number(project.area_km2).toLocaleString()} km²`}
                    />
                  ) : null}
                  {category === "mine" && project.reserve_kg !== null ? (
                    <ProjectField
                      label="Estimated reserve"
                      value={`${Number(project.reserve_kg).toLocaleString()} kg`}
                    />
                  ) : null}
                </OverviewGroup>
              ) : null}

              <OverviewGroup icon={Banknote} title="Funding">
                {project.fund_amount !== null ? (
                  <>
                    <ProjectField
                      label="Starting fund"
                      value={formatMoney(fundCurrency, Number(project.fund_amount))}
                    />
                    {canViewAllExpenses && committedExpenses > 0 ? (
                      <ProjectField
                        label="Committed expenses"
                        value={formatMoney(fundCurrency, committedExpenses)}
                      />
                    ) : null}
                    <ProjectField label="Current fund" value={currentFundLabel} />
                    <ProjectField label="Currency" value={fundCurrency} />
                  </>
                ) : null}
                <ProjectField label="Total expenses" value={expenseTotalLabel} />
              </OverviewGroup>

              <OverviewGroup icon={CalendarDays} title="Links & timeline">
                {urlLabel && project.url ? (
                  <ProjectLinkField label={urlLabel} value={project.url} />
                ) : null}
                {category === "website" && project.repository_url ? (
                  <ProjectLinkField label="Git repository URL" value={project.repository_url} />
                ) : null}
                <ProjectField label="Created" value={formatDateTime(project.created_at)} />
                <ProjectField label="Last updated" value={formatDateTime(project.updated_at)} />
              </OverviewGroup>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="progress" className="space-y-4">
          <div className="rounded-2xl bg-card p-5 shadow-sm">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="logbook-label">{t("To-do progress")}</p>
                <p className="mt-1 text-2xl font-semibold">
                  {taskProgress}% {t("complete")}
                </p>
              </div>
              <p className="text-sm text-muted-foreground">
                {language === "zh"
                  ? `已完成 ${completedTaskCount}/${tasks.data?.length ?? 0} 项任务 · 已达成 ${achievedMilestoneCount}/${milestones.data?.length ?? 0} 个里程碑`
                  : `${completedTaskCount} of ${tasks.data?.length ?? 0} tasks completed · ${achievedMilestoneCount} of ${milestones.data?.length ?? 0} milestones achieved`}
              </p>
            </div>
            <Progress
              value={taskProgress}
              className="mt-4"
              aria-label={t("Project task progress")}
            />
          </div>

          <div className="grid items-start gap-4 xl:grid-cols-2">
            <section className="rounded-2xl bg-card p-5 shadow-sm">
              <div className="flex flex-row flex-wrap items-center justify-between gap-3">
                <h2 className="flex items-center gap-2 text-base font-semibold">
                  <ListTodo className="size-5" />
                  {t("To-do list")}
                </h2>
                {canManageProject ? (
                  <Button type="button" size="sm" onClick={() => setTaskOpen(true)}>
                    <Plus />
                    {t("Add to-do")}
                  </Button>
                ) : null}
              </div>
              <div className="mt-4">
                {tasks.error ? (
                  <InlineError message={progressErrorMessage(tasks.error, "to-do list")} />
                ) : null}
                {tasks.isLoading ? (
                  <p className="text-sm text-muted-foreground">{t("Loading to-dos…")}</p>
                ) : null}
                {!tasks.isLoading && !tasks.error ? (
                  <Tabs defaultValue="open" className="space-y-4">
                    <TabsList className="grid w-full grid-cols-2">
                      <TabsTrigger value="open">
                        {t("To do")} ({openTasks.length})
                      </TabsTrigger>
                      <TabsTrigger value="completed">
                        {t("Completed")} ({completedTasks.length})
                      </TabsTrigger>
                    </TabsList>
                    <TabsContent value="open">
                      <ProjectTaskList
                        items={openTasks}
                        peopleById={peopleById}
                        userId={user?.id}
                        canManage={canManageProject}
                        canDelete={roles.includes("admin")}
                        pending={toggleTask.isPending || deleteTask.isPending}
                        emptyMessage="No open to-dos."
                        onToggle={(task) =>
                          toggleTask.mutate({ id: task.id, isCompleted: !task.is_completed })
                        }
                        onDelete={setDeleteTaskId}
                      />
                    </TabsContent>
                    <TabsContent value="completed">
                      <ProjectTaskList
                        items={completedTasks}
                        peopleById={peopleById}
                        userId={user?.id}
                        canManage={canManageProject}
                        canDelete={roles.includes("admin")}
                        pending={toggleTask.isPending || deleteTask.isPending}
                        emptyMessage="No completed to-dos."
                        onToggle={(task) =>
                          toggleTask.mutate({ id: task.id, isCompleted: !task.is_completed })
                        }
                        onDelete={setDeleteTaskId}
                      />
                    </TabsContent>
                  </Tabs>
                ) : null}
              </div>
            </section>

            <section className="rounded-2xl bg-card p-5 shadow-sm">
              <div className="flex flex-row flex-wrap items-center justify-between gap-3">
                <h2 className="flex items-center gap-2 text-base font-semibold">
                  <Flag className="size-5" />
                  {t("Achievement milestones")}
                </h2>
                {canManageProject ? (
                  <Button type="button" size="sm" variant="outline" onClick={openMilestoneDialog}>
                    <Plus />
                    {t("Add milestone")}
                  </Button>
                ) : null}
              </div>
              <div className="mt-4">
                {milestones.error ? (
                  <InlineError
                    message={progressErrorMessage(milestones.error, "achievement milestones")}
                  />
                ) : null}
                <div className="space-y-1">
                  {(milestones.data ?? []).map((milestone) => (
                    <button
                      key={milestone.id}
                      type="button"
                      className="flex w-full items-center gap-3 py-3 text-left transition-colors first:pt-0 last:pb-0 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      onClick={() => setSelectedMilestoneId(milestone.id)}
                    >
                      <span
                        className={`flex size-9 shrink-0 items-center justify-center rounded-full ${
                          milestone.is_achieved
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {milestone.is_achieved ? (
                          <Trophy className="size-4" aria-hidden="true" />
                        ) : (
                          <Flag className="size-4" aria-hidden="true" />
                        )}
                      </span>
                      <span className="min-w-0 truncate text-sm font-medium">
                        {milestone.title}
                      </span>
                    </button>
                  ))}
                </div>
                {milestones.isLoading ? (
                  <p className="py-3 text-sm text-muted-foreground">{t("Loading milestones…")}</p>
                ) : null}
                {!milestones.isLoading &&
                !milestones.error &&
                (milestones.data ?? []).length === 0 ? (
                  <p className="py-3 text-sm text-muted-foreground">
                    {t("No achievement milestones yet.")}
                  </p>
                ) : null}
              </div>
            </section>
          </div>
        </TabsContent>

        <TabsContent value="staff">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-3">
              <CardTitle>{t("Assigned staff")}</CardTitle>
              {canManageStaff ? (
                <Button type="button" size="sm" onClick={() => setStaffOpen(true)}>
                  <UserPlus />
                  {t("Add staff")}
                </Button>
              ) : null}
            </CardHeader>
            <CardContent className="divide-y divide-border">
              {memberships.error || people.error ? (
                <InlineError message={memberships.error?.message ?? people.error?.message ?? ""} />
              ) : null}
              {assignedPeople.map((person) => (
                <div
                  key={person.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-4 first:pt-0 last:pb-0"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium">
                      {person.full_name || staffLoginLabel(person.email)}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {staffLoginLabel(person.email)}
                      {person.job_title ? ` · ${person.job_title}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={person.is_active ? "outline" : "secondary"}>
                      {t(person.is_active ? "Active" : "Inactive")}
                    </Badge>
                    {canManageStaff ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="text-destructive hover:text-destructive"
                        disabled={removeMember.isPending}
                        onClick={() => removeMember.mutate(person.id)}
                      >
                        {t("Remove")}
                      </Button>
                    ) : null}
                  </div>
                </div>
              ))}
              {!memberships.isLoading && assignedPeople.length === 0 ? (
                <p className="py-4 text-sm text-muted-foreground">{t("No staff assigned yet.")}</p>
              ) : null}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="activity">
          <Card>
            <CardHeader>
              <CardTitle>{t("Project activity")}</CardTitle>
              <p className="text-sm text-muted-foreground">
                {project.repository_url
                  ? t("Work submissions and recent public GitHub commits, newest first.")
                  : t("Work submitted for this project and visible to your account.")}
              </p>
            </CardHeader>
            <CardContent className="divide-y divide-border">
              {reports.error ? <InlineError message={reports.error.message} /> : null}
              {gitEvents.error ? <InlineError message={gitEvents.error.message} /> : null}
              {gitEvents.data?.syncError ? (
                <InlineError message={t(gitEvents.data.syncError)} />
              ) : null}
              {gitEvents.isLoading ? (
                <p className="pb-4 text-sm text-muted-foreground">
                  {t("Refreshing GitHub activity…")}
                </p>
              ) : null}
              {activityItems.map((item) => {
                if (item.kind === "git") {
                  const event = item.event;
                  return (
                    <article key={`git-${item.id}`} className="py-5 first:pt-0 last:pb-0">
                      <div className="flex items-start gap-3">
                        <span className="mt-0.5 rounded-full bg-stat-teal p-2 text-primary">
                          <GitCommitHorizontal className="size-4" aria-hidden="true" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div className="min-w-0">
                              <h2 className="text-sm font-semibold">{event.title}</h2>
                              <p className="mt-1 text-xs text-muted-foreground">
                                {formatDateTime(event.occurred_at)} ·{" "}
                                {event.author_name || "GitHub"}
                              </p>
                            </div>
                            <Badge variant="outline">{t("Git commit")}</Badge>
                          </div>
                          {event.description ? (
                            <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
                              {event.description}
                            </p>
                          ) : null}
                          {event.event_url ? (
                            <a
                              href={event.event_url}
                              target="_blank"
                              rel="noreferrer"
                              className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-primary underline-offset-4 hover:underline"
                            >
                              {event.external_id.slice(0, 7)}
                              <ExternalLink className="size-3" aria-hidden="true" />
                            </a>
                          ) : (
                            <span className="mt-3 block text-xs text-muted-foreground">
                              {event.external_id.slice(0, 7)}
                            </span>
                          )}
                        </div>
                      </div>
                    </article>
                  );
                }

                const report = item.report;
                const author = peopleById.get(report.user_id);
                const open = () => setSelectedReportId(report.id);
                return (
                  <div
                    key={`report-${item.id}`}
                    role="button"
                    tabIndex={0}
                    onClick={open}
                    onKeyDown={rowKeyHandler(open)}
                    className="flex cursor-pointer items-start gap-3 py-4 text-left first:pt-0 last:pb-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <Avatar className="mt-0.5 size-9 shrink-0 border border-border">
                      <AvatarImage src={author?.avatar_url ?? undefined} alt="" />
                      <AvatarFallback className="text-xs font-semibold">
                        {personInitials(author?.full_name, author?.email)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <span className="min-w-0 truncate text-sm font-medium text-foreground">
                          {report.title}
                        </span>
                        <span className="flex shrink-0 items-center gap-1.5">
                          {report.supersedes_report_id ? (
                            <Badge variant="outline">{t("Correction")}</Badge>
                          ) : null}
                          <Badge className={STATUS_TONE[report.work_status]}>
                            {t(WORK_STATUS_LABEL[report.work_status] ?? report.work_status)}
                          </Badge>
                        </span>
                      </div>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        <span className="font-medium text-foreground/80">
                          {author?.full_name || author?.email || t("Unknown user")}
                        </span>{" "}
                        · {reportStamp(report)} · {reportMeta(report, project.name, t)}
                      </p>
                      <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                        {report.content}
                      </p>
                      {report.image_urls?.length ? (
                        <div className="mt-2">
                          <WorkLogImages images={report.image_urls} compact onOpen={setLightbox} />
                        </div>
                      ) : null}
                    </div>
                  </div>
                );
              })}
              {!reports.isLoading && !gitEvents.isLoading && activityItems.length === 0 ? (
                <p className="py-4 text-sm text-muted-foreground">
                  {project.repository_url
                    ? t("No project activity yet.")
                    : t("No staff submissions for this project.")}
                </p>
              ) : null}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="expenses">
          <Card>
            <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
              <div>
                <CardTitle>{t("Created expenses")}</CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">
                  {t("Current fund")}: {currentFundLabel}
                </p>
              </div>
              {canSubmitExpenses ? (
                <Button type="button" size="sm" onClick={() => setExpenseOpen(true)}>
                  {t("New expense")}
                </Button>
              ) : (
                <Button asChild size="sm" variant="outline">
                  <Link to="/expenses" search={{ create: undefined, report: undefined, projectId }}>
                    {t("Open expenses")}
                  </Link>
                </Button>
              )}
            </CardHeader>
            <CardContent className="divide-y divide-border">
              {expenses.error ? <InlineError message={expenses.error.message} /> : null}
              {(expenses.data ?? []).map((expense) => {
                const submitter = peopleById.get(expense.submitted_by);
                return (
                  <article
                    key={expense.id}
                    className="flex flex-wrap items-start justify-between gap-4 py-4 first:pt-0 last:pb-0"
                  >
                    <div className="min-w-0 flex-1">
                      <h2 className="text-sm font-medium">{expense.description}</h2>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {formatDate(expense.expense_date)} · {expense.category} ·{" "}
                        {submitter?.full_name || "Unknown staff"}
                      </p>
                      {expense.vendor ? (
                        <p className="mt-2 text-xs text-muted-foreground">
                          {t("Vendor")}: {expense.vendor}
                        </p>
                      ) : null}
                      {expense.receipt_url ? (
                        <a
                          href={expense.receipt_url}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-2 inline-block text-xs font-medium underline underline-offset-4"
                        >
                          {t("View receipt")}
                        </a>
                      ) : null}
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold">
                        {formatMoney(expense.currency, Number(expense.amount))}
                      </p>
                      <Badge className="mt-2" variant="outline">
                        {t(STATUS_LABEL[expense.status] ?? expense.status)}
                      </Badge>
                    </div>
                  </article>
                );
              })}
              {!expenses.isLoading && !expenses.error && (expenses.data ?? []).length === 0 ? (
                <p className="py-4 text-sm text-muted-foreground">{t("No visible expenses.")}</p>
              ) : null}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </>
  );
}

function SummaryCard({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof Users;
  label: string;
  value: string;
  tone: string;
}) {
  const { t } = useLanguage();
  return (
    <Card className={`border-transparent ${tone}`}>
      <CardContent className="flex items-start justify-between gap-3 p-4 sm:p-5">
        <div className="min-w-0">
          <p className="logbook-label">{t(label)}</p>
          <p className="mt-2 break-words text-lg font-semibold">{t(value)}</p>
        </div>
        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-secondary text-secondary-foreground">
          <Icon className="size-4" />
        </div>
      </CardContent>
    </Card>
  );
}

function ProjectField({ label, value }: { label: string; value: string }) {
  const { t } = useLanguage();
  return (
    <div>
      <dt className="logbook-label">{t(label)}</dt>
      <dd className="mt-1 text-sm text-muted-foreground">{t(value)}</dd>
    </div>
  );
}

function ProjectLinkField({ label, value }: { label: string; value: string | null }) {
  const { t } = useLanguage();
  return (
    <div>
      <dt className="logbook-label">{t(label)}</dt>
      <dd className="mt-1 text-sm text-muted-foreground">
        {value ? (
          <a
            href={value}
            target="_blank"
            rel="noreferrer"
            className="break-all underline underline-offset-4 hover:text-foreground"
          >
            {value}
          </a>
        ) : (
          "—"
        )}
      </dd>
    </div>
  );
}

function OverviewGroup({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof Users;
  title: string;
  children: ReactNode;
}) {
  const { t } = useLanguage();
  return (
    <section className="rounded-2xl bg-muted/45 p-5">
      <h3 className="flex items-center gap-2 text-sm font-semibold">
        <span className="flex size-8 items-center justify-center rounded-lg bg-card text-primary shadow-sm">
          <Icon className="size-4" aria-hidden="true" />
        </span>
        {t(title)}
      </h3>
      <dl className="mt-5 grid gap-x-5 gap-y-4 sm:grid-cols-2">{children}</dl>
    </section>
  );
}

function ProjectTaskList({
  items,
  peopleById,
  userId,
  canManage,
  canDelete,
  pending,
  emptyMessage,
  onToggle,
  onDelete,
}: {
  items: ProjectTaskRow[];
  peopleById: Map<string, StaffDirectoryRow>;
  userId: string | undefined;
  canManage: boolean;
  canDelete: boolean;
  pending: boolean;
  emptyMessage: string;
  onToggle: (task: ProjectTaskRow) => void;
  onDelete: (taskId: string) => void;
}) {
  const { language, t } = useLanguage();

  if (items.length === 0) {
    return <p className="py-3 text-sm text-muted-foreground">{t(emptyMessage)}</p>;
  }

  return (
    <div className="space-y-1">
      {items.map((task) => {
        const assignee = task.assignee_id ? peopleById.get(task.assignee_id) : undefined;
        const canToggle = canManage || task.assignee_id === userId;
        const actionLabel = task.is_completed ? t("Reopen task") : t("Complete task");
        return (
          <article key={task.id} className="flex items-start gap-2 py-3 first:pt-0 last:pb-0">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="-ml-2 -mt-1 shrink-0"
              aria-label={actionLabel}
              title={
                canToggle
                  ? actionLabel
                  : t("Only the assignee or a project manager can change this task")
              }
              disabled={!canToggle || pending}
              onClick={() => onToggle(task)}
            >
              {task.is_completed ? <CheckCircle2 className="text-primary" /> : <Circle />}
            </Button>
            <div className="min-w-0 flex-1">
              <p
                className={
                  task.is_completed
                    ? "whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground line-through"
                    : "whitespace-pre-wrap text-sm leading-relaxed"
                }
              >
                {task.description || task.title}
              </p>
              <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span>
                  {assignee
                    ? language === "zh"
                      ? `已分配给 ${assignee.full_name || staffLoginLabel(assignee.email)}`
                      : `Assigned to ${assignee.full_name || staffLoginLabel(assignee.email)}`
                    : t("Unassigned")}
                </span>
                {task.due_date ? (
                  <span>
                    {language === "zh" ? "截止" : "Due"} {formatDate(task.due_date)}
                  </span>
                ) : null}
                {task.completed_at ? (
                  <span>
                    {t("Completed")} {formatDate(task.completed_at)}
                  </span>
                ) : null}
              </div>
            </div>
            {canDelete ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="-mr-2 -mt-1 shrink-0 text-muted-foreground hover:text-destructive"
                aria-label={t("Delete to-do")}
                title={t("Delete to-do")}
                disabled={pending}
                onClick={() => onDelete(task.id)}
              >
                <Trash2 />
              </Button>
            ) : null}
          </article>
        );
      })}
    </div>
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

function InlineError({ message }: { message: string }) {
  return (
    <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
      {message}
    </p>
  );
}

function progressErrorMessage(error: { message: string }, area: string) {
  const missingProgressTables =
    error.message.includes("project_tasks") ||
    error.message.includes("project_milestones") ||
    error.message.includes("schema cache");
  return missingProgressTables
    ? `Apply the latest Supabase migration to enable the project ${area}.`
    : error.message;
}
