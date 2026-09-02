import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  Banknote,
  CheckCircle2,
  Circle,
  Clock3,
  ExternalLink,
  Flag,
  GitCommitHorizontal,
  ListTodo,
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
} from "@/hooks/useData";
import { useMe } from "@/hooks/useSession";
import { supabase } from "@/integrations/supabase/client";
import { CURRENCY_OPTIONS } from "@/lib/currencies";
import { todayForDateInput } from "@/lib/dates";
import { deleteRecord } from "@/lib/deleteRecord";
import { useLanguage } from "@/lib/i18n";
import { reportImageUrl } from "@/lib/reportImages";
import {
  LICENSE_STATUS_LABEL,
  MINING_METHOD_LABEL,
  PROJECT_CATEGORY_LABEL,
  PROJECT_CATEGORY_OPTIONS,
  PROJECT_LEGAL_NAME_LABEL,
  PROJECT_LOCATION_LABEL,
  PROJECT_URL_LABEL,
} from "@/lib/projects";
import { hasCapability, REPORT_TYPE_LABEL } from "@/lib/roles";
import { staffLoginLabel } from "@/lib/staffAuth";
import {
  firstValidationError,
  projectMemberSchema,
  projectMilestoneSchema,
  projectSchema,
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
  const [settingsName, setSettingsName] = useState("");
  const [settingsCategory, setSettingsCategory] = useState("mine");
  const [settingsProjectCode, setSettingsProjectCode] = useState("");
  const [settingsLegalName, setSettingsLegalName] = useState("");
  const [settingsLocation, setSettingsLocation] = useState("");
  const [settingsMiningMethod, setSettingsMiningMethod] = useState("other");
  const [settingsLicenseStatus, setSettingsLicenseStatus] = useState("unknown");
  const [settingsReserveKg, setSettingsReserveKg] = useState("");
  const [settingsAreaKm2, setSettingsAreaKm2] = useState("");
  const [settingsUrl, setSettingsUrl] = useState("");
  const [settingsRepositoryUrl, setSettingsRepositoryUrl] = useState("");
  const [settingsDepartmentId, setSettingsDepartmentId] = useState("");
  const [settingsDescription, setSettingsDescription] = useState("");
  const [settingsFund, setSettingsFund] = useState("");
  const [settingsCurrency, setSettingsCurrency] = useState("USD");
  const [taskOpen, setTaskOpen] = useState(false);
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDescription, setTaskDescription] = useState("");
  const [taskAssignee, setTaskAssignee] = useState("");
  const [taskDueDate, setTaskDueDate] = useState("");
  const [milestoneOpen, setMilestoneOpen] = useState(false);
  const [milestoneTitle, setMilestoneTitle] = useState("");
  const [milestoneDescription, setMilestoneDescription] = useState("");
  const [milestoneTargetDate, setMilestoneTargetDate] = useState(todayForDateInput);
  const [expenseOpen, setExpenseOpen] = useState(false);
  const [staffOpen, setStaffOpen] = useState(false);
  const [staffSearch, setStaffSearch] = useState("");

  const rawProject = projects.data?.find((item) => item.id === projectId);
  const staffRestricted = roles.length === 1 && roles[0] === "staff";
  const staffAssigned = (memberships.data ?? []).some(
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
    () => (reports.data ?? []).reduce((sum, report) => sum + Number(report.hours_spent), 0),
    [reports.data],
  );
  const activityItems = useMemo(
    () =>
      [
        ...(reports.data ?? []).map((report) => ({
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

  const category = project?.category ?? "mine";
  const legalNameLabel = PROJECT_LEGAL_NAME_LABEL[category] ?? "Legal name";
  const locationLabel = PROJECT_LOCATION_LABEL[category];
  const urlLabel = PROJECT_URL_LABEL[category];
  const settingsLegalNameLabel = PROJECT_LEGAL_NAME_LABEL[settingsCategory] ?? "Legal name";
  const settingsLocationLabel = PROJECT_LOCATION_LABEL[settingsCategory];
  const settingsUrlLabel = PROJECT_URL_LABEL[settingsCategory];
  const fundCurrency = project?.fund_currency ?? "USD";
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
    (roles.includes("admin") || hasCapability(permissions, "manage_projects", roles));
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
      if (!user) throw new Error("Sign in again before creating a task");
      const parsed = projectTaskSchema.safeParse({
        project_id: projectId,
        title: taskTitle,
        description: taskDescription,
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
      toast.success("Task added");
      setTaskOpen(false);
      setTaskTitle("");
      setTaskDescription("");
      setTaskAssignee("");
      setTaskDueDate("");
      queryClient.invalidateQueries({ queryKey: ["project-tasks", projectId] });
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not add the task"),
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
      toast.success(variables.isCompleted ? "Task completed" : "Task reopened");
      queryClient.invalidateQueries({ queryKey: ["project-tasks", projectId] });
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not update the task"),
  });

  const createMilestone = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Sign in again before creating a milestone");
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
      toast.success("Milestone added");
      setMilestoneOpen(false);
      setMilestoneTitle("");
      setMilestoneDescription("");
      setMilestoneTargetDate(todayForDateInput());
      queryClient.invalidateQueries({ queryKey: ["project-milestones", projectId] });
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not add the milestone"),
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
      toast.success(variables.isAchieved ? "Milestone achieved" : "Milestone reopened");
      queryClient.invalidateQueries({ queryKey: ["project-milestones", projectId] });
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not update the milestone"),
  });

  const updateSettings = useMutation({
    mutationFn: async () => {
      const parsed = projectSchema.safeParse({
        name: settingsName,
        category: settingsCategory,
        project_code: settingsProjectCode,
        legal_name: settingsLegalName,
        location: settingsLocation,
        mining_method: settingsMiningMethod,
        license_status: settingsLicenseStatus,
        reserve_kg: settingsReserveKg,
        area_km2: settingsAreaKm2,
        url: settingsUrl,
        repository_url: settingsRepositoryUrl,
        department_id: settingsDepartmentId,
        description: settingsDescription,
        fund_amount: settingsFund,
        fund_currency: settingsCurrency,
      });
      if (!parsed.success) throw new Error(firstValidationError(parsed.error));
      const input = parsed.data;
      const { error } = await supabase
        .from("projects")
        .update({
          name: input.name,
          category: input.category,
          project_code: input.project_code ?? null,
          legal_name: input.legal_name ?? null,
          location: PROJECT_LOCATION_LABEL[input.category] ? (input.location ?? null) : null,
          mining_method: input.category === "mine" ? input.mining_method : "other",
          license_status: input.category === "mine" ? input.license_status : "unknown",
          reserve_kg: input.category === "mine" ? (input.reserve_kg ?? null) : null,
          area_km2: input.category === "mine" ? (input.area_km2 ?? null) : null,
          url: PROJECT_URL_LABEL[input.category] ? (input.url ?? null) : null,
          repository_url: input.category === "website" ? (input.repository_url ?? null) : null,
          department_id: input.department_id ?? null,
          description: input.description ?? null,
          fund_amount: input.fund_amount ?? null,
          fund_currency: input.fund_currency,
        })
        .eq("id", projectId);
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

  function openSettings() {
    if (!project) return;
    setSettingsName(project.name);
    setSettingsCategory(project.category ?? "mine");
    setSettingsProjectCode(project.project_code ?? "");
    setSettingsLegalName(project.legal_name ?? "");
    setSettingsLocation(project.location ?? "");
    setSettingsMiningMethod(project.mining_method ?? "other");
    setSettingsLicenseStatus(project.license_status ?? "unknown");
    setSettingsReserveKg(project.reserve_kg === null ? "" : String(project.reserve_kg ?? ""));
    setSettingsAreaKm2(project.area_km2 === null ? "" : String(project.area_km2 ?? ""));
    setSettingsUrl(project.url ?? "");
    setSettingsRepositoryUrl(project.repository_url ?? "");
    setSettingsDepartmentId(project.department_id ?? "");
    setSettingsDescription(project.description ?? "");
    setSettingsFund(project.fund_amount === null ? "" : String(project.fund_amount ?? ""));
    setSettingsCurrency(project.fund_currency ?? "USD");
    setSettingsOpen(true);
  }

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
              <Button type="button" size="sm" variant="outline" onClick={openSettings}>
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
            <Badge variant={project.status === "active" ? "default" : "secondary"}>
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

      <Dialog open={settingsOpen && canManageProject} onOpenChange={setSettingsOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{t("Edit project")}</DialogTitle>
            <DialogDescription>
              {t("Update the project details, category and starting fund.")}
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              updateSettings.mutate();
            }}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Project name" id="settings-name">
                <Input
                  id="settings-name"
                  value={settingsName}
                  onChange={(event) => setSettingsName(event.target.value)}
                />
              </Field>
              <Field label="Category" id="settings-category">
                <select
                  id="settings-category"
                  className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm"
                  value={settingsCategory}
                  onChange={(event) => setSettingsCategory(event.target.value)}
                >
                  {PROJECT_CATEGORY_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {t(option.label)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Project code" id="settings-project-code">
                <Input
                  id="settings-project-code"
                  value={settingsProjectCode}
                  onChange={(event) => setSettingsProjectCode(event.target.value)}
                />
              </Field>
              <Field label={settingsLegalNameLabel} id="settings-legal-name">
                <Input
                  id="settings-legal-name"
                  value={settingsLegalName}
                  onChange={(event) => setSettingsLegalName(event.target.value)}
                />
              </Field>
              {settingsLocationLabel ? (
                <Field label={settingsLocationLabel} id="settings-location">
                  <Input
                    id="settings-location"
                    value={settingsLocation}
                    onChange={(event) => setSettingsLocation(event.target.value)}
                  />
                </Field>
              ) : null}
              {settingsCategory === "mine" ? (
                <>
                  <Field label="Mining method" id="settings-mining-method">
                    <select
                      id="settings-mining-method"
                      className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm"
                      value={settingsMiningMethod}
                      onChange={(event) => setSettingsMiningMethod(event.target.value)}
                    >
                      {Object.entries(MINING_METHOD_LABEL).map(([value, label]) => (
                        <option key={value} value={value}>
                          {t(label)}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="License status" id="settings-license-status">
                    <select
                      id="settings-license-status"
                      className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm"
                      value={settingsLicenseStatus}
                      onChange={(event) => setSettingsLicenseStatus(event.target.value)}
                    >
                      {Object.entries(LICENSE_STATUS_LABEL).map(([value, label]) => (
                        <option key={value} value={value}>
                          {t(label)}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Estimated reserve (kg)" id="settings-reserve">
                    <Input
                      id="settings-reserve"
                      type="number"
                      min="0"
                      step="0.001"
                      value={settingsReserveKg}
                      onChange={(event) => setSettingsReserveKg(event.target.value)}
                    />
                  </Field>
                  <Field label="Area (km²)" id="settings-area">
                    <Input
                      id="settings-area"
                      type="number"
                      min="0"
                      step="0.001"
                      value={settingsAreaKm2}
                      onChange={(event) => setSettingsAreaKm2(event.target.value)}
                    />
                  </Field>
                </>
              ) : null}
              {settingsUrlLabel ? (
                <Field label={settingsUrlLabel} id="settings-project-url">
                  <Input
                    id="settings-project-url"
                    type="url"
                    inputMode="url"
                    autoCapitalize="none"
                    spellCheck={false}
                    value={settingsUrl}
                    placeholder="https://example.com"
                    onChange={(event) => setSettingsUrl(event.target.value)}
                  />
                </Field>
              ) : null}
              {settingsCategory === "website" ? (
                <Field label="Git repository URL" id="settings-repository-url">
                  <Input
                    id="settings-repository-url"
                    type="url"
                    inputMode="url"
                    autoCapitalize="none"
                    spellCheck={false}
                    value={settingsRepositoryUrl}
                    placeholder="https://github.com/owner/repository"
                    onChange={(event) => setSettingsRepositoryUrl(event.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    {t("Public GitHub repositories only. Commits appear in project Activity.")}
                  </p>
                </Field>
              ) : null}
              <Field label="Department" id="settings-department">
                <select
                  id="settings-department"
                  className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm"
                  value={settingsDepartmentId}
                  onChange={(event) => setSettingsDepartmentId(event.target.value)}
                >
                  <option value="">{t("None")}</option>
                  {(departments.data ?? []).map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Starting fund" id="settings-fund">
                <Input
                  id="settings-fund"
                  type="number"
                  min="0"
                  step="0.01"
                  value={settingsFund}
                  placeholder="Not set"
                  onChange={(event) => setSettingsFund(event.target.value)}
                />
              </Field>
              <Field label="Currency" id="settings-currency">
                <select
                  id="settings-currency"
                  className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm"
                  value={settingsCurrency}
                  onChange={(event) => setSettingsCurrency(event.target.value)}
                >
                  {CURRENCY_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {t(option.label)}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label="Description" id="settings-description">
              <Textarea
                id="settings-description"
                rows={3}
                value={settingsDescription}
                onChange={(event) => setSettingsDescription(event.target.value)}
              />
            </Field>
            <p className="text-xs leading-relaxed text-muted-foreground">
              {t(
                "Current fund equals the starting fund minus non-rejected expenses in this currency. Expenses in other currencies are listed but are not converted.",
              )}
            </p>
            <DialogFooter className="flex-row gap-2 sm:gap-0">
              <DialogClose asChild>
                <Button type="button" variant="outline" className="flex-1 sm:flex-none">
                  {t("Cancel")}
                </Button>
              </DialogClose>
              <Button
                type="submit"
                className="flex-1 sm:flex-none"
                disabled={updateSettings.isPending}
              >
                {updateSettings.isPending ? t("Saving…") : t("Save project")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

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
            <Field label="Task title" id="task-title">
              <Input
                id="task-title"
                value={taskTitle}
                maxLength={160}
                autoFocus
                onChange={(event) => setTaskTitle(event.target.value)}
              />
            </Field>
            <Field label="Details" id="task-description">
              <Textarea
                id="task-description"
                value={taskDescription}
                maxLength={2000}
                rows={4}
                onChange={(event) => setTaskDescription(event.target.value)}
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Assign to" id="task-assignee">
                <select
                  id="task-assignee"
                  className="h-10 w-full rounded-md border border-input bg-card px-3 pr-10 text-sm"
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
        <SummaryCard
          icon={Banknote}
          label="Current fund"
          value={currentFundLabel}
          tone="bg-stat-teal"
        />
        <SummaryCard
          icon={Users}
          label="Assigned staff"
          value={String(assignedPeople.length)}
          tone="bg-stat-gold"
        />
        <SummaryCard
          icon={Clock3}
          label="Work logs"
          value={`${reports.data?.length ?? 0} · ${totalHours.toFixed(1)}h`}
          tone="bg-stat-violet"
        />
        <SummaryCard
          icon={ReceiptText}
          label="Visible expenses"
          value={expenseTotals || "—"}
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
          <Card>
            <CardHeader>
              <CardTitle>{t("Project overview")}</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-x-6 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
                <ProjectField
                  label="Category"
                  value={t(PROJECT_CATEGORY_LABEL[category] ?? category)}
                />
                <ProjectField label={legalNameLabel} value={project.legal_name || "—"} />
                <ProjectField label="Project code" value={project.project_code || "—"} />
                {locationLabel ? (
                  <ProjectField label={locationLabel} value={project.location || "—"} />
                ) : null}
                <ProjectField label="Department" value={department?.name || "—"} />
                <ProjectField
                  label="Owner"
                  value={
                    owner?.full_name ||
                    (owner?.email ? staffLoginLabel(owner.email) : "Unknown user")
                  }
                />
                {category === "mine" ? (
                  <>
                    <ProjectField
                      label="Mining method"
                      value={t(MINING_METHOD_LABEL[project.mining_method] ?? project.mining_method)}
                    />
                    <ProjectField
                      label="License status"
                      value={t(
                        LICENSE_STATUS_LABEL[project.license_status] ?? project.license_status,
                      )}
                    />
                    <ProjectField
                      label="Area"
                      value={
                        project.area_km2 === null
                          ? "—"
                          : `${Number(project.area_km2).toLocaleString()} km²`
                      }
                    />
                    <ProjectField
                      label="Estimated reserve"
                      value={
                        project.reserve_kg === null
                          ? "—"
                          : `${Number(project.reserve_kg).toLocaleString()} kg`
                      }
                    />
                  </>
                ) : null}
                {urlLabel ? (
                  <div>
                    <dt className="logbook-label">{t(urlLabel)}</dt>
                    <dd className="mt-1 text-sm text-muted-foreground">
                      {project.url ? (
                        <a
                          href={project.url}
                          target="_blank"
                          rel="noreferrer"
                          className="break-all underline underline-offset-4 hover:text-foreground"
                        >
                          {project.url}
                        </a>
                      ) : (
                        "—"
                      )}
                    </dd>
                  </div>
                ) : null}
                {category === "website" ? (
                  <div>
                    <dt className="logbook-label">{t("Git repository URL")}</dt>
                    <dd className="mt-1 text-sm text-muted-foreground">
                      {project.repository_url ? (
                        <a
                          href={project.repository_url}
                          target="_blank"
                          rel="noreferrer"
                          className="break-all underline underline-offset-4 hover:text-foreground"
                        >
                          {project.repository_url}
                        </a>
                      ) : (
                        "—"
                      )}
                    </dd>
                  </div>
                ) : null}
                <ProjectField
                  label="Starting fund"
                  value={
                    project.fund_amount === null || project.fund_amount === undefined
                      ? "Not set"
                      : formatMoney(fundCurrency, Number(project.fund_amount))
                  }
                />
                <ProjectField
                  label="Committed expenses"
                  value={
                    canViewAllExpenses ? formatMoney(fundCurrency, committedExpenses) : "Restricted"
                  }
                />
                <ProjectField label="Created" value={formatDateTime(project.created_at)} />
                <ProjectField label="Last updated" value={formatDateTime(project.updated_at)} />
              </dl>
              <div className="mt-6 border-t border-border pt-5">
                <p className="logbook-label">{t("Description")}</p>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
                  {project.description || t("No project description yet.")}
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="progress" className="space-y-4">
          <Card>
            <CardContent className="p-5">
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
              <Progress value={taskProgress} className="mt-4" aria-label="Project task progress" />
            </CardContent>
          </Card>

          <div className="grid items-start gap-4 xl:grid-cols-2">
            <Card>
              <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
                <CardTitle className="flex items-center gap-2">
                  <ListTodo className="size-5" />
                  {t("To-do list")}
                </CardTitle>
                {canManageProject ? (
                  <Button type="button" size="sm" onClick={() => setTaskOpen(true)}>
                    <Plus />
                    {t("Add to-do")}
                  </Button>
                ) : null}
              </CardHeader>
              <CardContent className="space-y-3">
                {tasks.error ? (
                  <InlineError message={progressErrorMessage(tasks.error, "to-do list")} />
                ) : null}
                {(tasks.data ?? []).map((task) => {
                  const assignee = task.assignee_id ? peopleById.get(task.assignee_id) : undefined;
                  const canToggle = canManageProject || task.assignee_id === user?.id;
                  return (
                    <article
                      key={task.id}
                      className="flex items-start gap-3 rounded-xl border border-border p-4"
                    >
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="-ml-2 -mt-2 shrink-0"
                        aria-label={task.is_completed ? "Reopen task" : "Complete task"}
                        title={
                          canToggle
                            ? task.is_completed
                              ? "Reopen task"
                              : "Complete task"
                            : "Only the assignee or a project manager can change this task"
                        }
                        disabled={!canToggle || toggleTask.isPending}
                        onClick={() =>
                          toggleTask.mutate({ id: task.id, isCompleted: !task.is_completed })
                        }
                      >
                        {task.is_completed ? <CheckCircle2 className="text-primary" /> : <Circle />}
                      </Button>
                      <div className="min-w-0 flex-1">
                        <h3
                          className={
                            task.is_completed
                              ? "text-sm font-medium text-muted-foreground line-through"
                              : "text-sm font-medium"
                          }
                        >
                          {task.title}
                        </h3>
                        {task.description ? (
                          <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
                            {task.description}
                          </p>
                        ) : null}
                        <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
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
                    </article>
                  );
                })}
                {tasks.isLoading ? (
                  <p className="text-sm text-muted-foreground">{t("Loading to-dos…")}</p>
                ) : null}
                {!tasks.isLoading && !tasks.error && (tasks.data ?? []).length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t("No project to-dos yet.")}</p>
                ) : null}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
                <CardTitle className="flex items-center gap-2">
                  <Flag className="size-5" />
                  {t("Achievement milestones")}
                </CardTitle>
                {canManageProject ? (
                  <Button type="button" size="sm" variant="outline" onClick={openMilestoneDialog}>
                    <Plus />
                    {t("Add milestone")}
                  </Button>
                ) : null}
              </CardHeader>
              <CardContent className="space-y-3">
                {milestones.error ? (
                  <InlineError
                    message={progressErrorMessage(milestones.error, "achievement milestones")}
                  />
                ) : null}
                {(milestones.data ?? []).map((milestone) => (
                  <article key={milestone.id} className="rounded-xl border border-border p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-start gap-3">
                        <div
                          className={`mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full ${
                            milestone.is_achieved
                              ? "bg-primary text-primary-foreground"
                              : "bg-secondary text-secondary-foreground"
                          }`}
                        >
                          {milestone.is_achieved ? (
                            <Trophy className="size-4" />
                          ) : (
                            <Flag className="size-4" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <h3 className="text-sm font-medium">{milestone.title}</h3>
                          {milestone.description ? (
                            <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
                              {milestone.description}
                            </p>
                          ) : null}
                        </div>
                      </div>
                      <Badge variant={milestone.is_achieved ? "default" : "outline"}>
                        {t(milestone.is_achieved ? "Achieved" : "Target")}
                      </Badge>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
                      <p className="text-xs text-muted-foreground">
                        {milestone.is_achieved && milestone.achieved_at
                          ? `${t("Achieved")} ${formatDate(milestone.achieved_at)}`
                          : milestone.target_date
                            ? `${t("Target")} ${formatDate(milestone.target_date)}`
                            : t("No target date")}
                      </p>
                      {canManageProject ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          disabled={toggleMilestone.isPending}
                          onClick={() =>
                            toggleMilestone.mutate({
                              id: milestone.id,
                              isAchieved: !milestone.is_achieved,
                            })
                          }
                        >
                          {t(milestone.is_achieved ? "Reopen" : "Mark achieved")}
                        </Button>
                      ) : null}
                    </div>
                  </article>
                ))}
                {milestones.isLoading ? (
                  <p className="text-sm text-muted-foreground">{t("Loading milestones…")}</p>
                ) : null}
                {!milestones.isLoading &&
                !milestones.error &&
                (milestones.data ?? []).length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    {t("No achievement milestones yet.")}
                  </p>
                ) : null}
              </CardContent>
            </Card>
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
                return (
                  <article key={`report-${item.id}`} className="py-5 first:pt-0 last:pb-0">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h2 className="text-sm font-semibold">{report.title}</h2>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {formatDate(report.report_date)}
                          {report.report_time ? ` · ${report.report_time.slice(0, 5)}` : ""} ·{" "}
                          {author?.full_name || "Unknown staff"} · {report.shift} shift
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {t(REPORT_TYPE_LABEL[report.report_type] ?? report.report_type)}
                          {report.activity_detail ? ` · ${report.activity_detail}` : ""}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">
                          {t(STATUS_LABEL[report.work_status] ?? report.work_status)}
                        </Badge>
                        <span className="text-sm font-medium">{Number(report.hours_spent)}h</span>
                      </div>
                    </div>
                    <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
                      {report.content}
                    </p>
                    {report.output_quantity !== null ? (
                      <p className="mt-2 text-xs text-muted-foreground">
                        {t("Output")}: {Number(report.output_quantity).toLocaleString()}{" "}
                        {report.output_unit}
                      </p>
                    ) : null}
                    {report.blockers ? (
                      <p className="mt-2 text-xs text-destructive">
                        {t("Blockers")}: {report.blockers}
                      </p>
                    ) : null}
                    {report.links ? (
                      <p className="mt-2 break-all text-xs text-muted-foreground">
                        {t("Links")}: {report.links}
                      </p>
                    ) : null}
                    {report.image_urls?.length ? (
                      <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-5">
                        {report.image_urls.map((image, index) => (
                          <a
                            key={`${image}-${index}`}
                            href={reportImageUrl(image)}
                            target="_blank"
                            rel="noreferrer"
                            className="aspect-square overflow-hidden rounded-md"
                          >
                            <img
                              src={reportImageUrl(image)}
                              alt={`${t("Image")} ${index + 1}`}
                              className="size-full object-cover"
                            />
                          </a>
                        ))}
                      </div>
                    ) : null}
                  </article>
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
