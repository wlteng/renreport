import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, BarChart3, Filter } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/AppShell";
import { ExpenseDialog } from "@/components/ExpenseDialog";
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
import { useExpenses, usePeople, useProjects } from "@/hooks/useData";
import { useMe } from "@/hooks/useSession";
import { supabase } from "@/integrations/supabase/client";
import { hasCapability } from "@/lib/roles";
import { useLanguage } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/expenses")({
  validateSearch: (search: Record<string, unknown>) => ({
    create: search["create"] === true || search["create"] === "true" ? true : undefined,
    report: search["report"] === true || search["report"] === "true" ? true : undefined,
    projectId: typeof search["projectId"] === "string" ? search["projectId"] : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Expenses — Ren Report" },
      { name: "description", content: "Submit and review mining project expenses." },
      { property: "og:title", content: "Expenses — Ren Report" },
      { property: "og:description", content: "Mining project expense submissions and approvals." },
    ],
  }),
  component: ExpensesPage,
});

const statusLabel: Record<string, string> = {
  draft: "Draft",
  submitted: "Submitted",
  approved: "Approved",
  rejected: "Rejected",
};

function monthRange(month: string) {
  if (!month) return { from: "", to: "" };
  const year = Number(month.slice(0, 4));
  const monthNumber = Number(month.slice(5, 7));
  const lastDay = new Date(year, monthNumber, 0).getDate();
  return { from: `${month}-01`, to: `${month}-${String(lastDay).padStart(2, "0")}` };
}

function monthOptions() {
  const now = new Date();
  return Array.from({ length: 36 }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() - index, 1);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
  });
}

function ExpensesPage() {
  const search = Route.useSearch();
  const { user, profile, roles, permissions } = useMe();
  const { language, t } = useLanguage();
  const projects = useProjects();
  const people = usePeople();
  const queryClient = useQueryClient();
  const canSubmit = !!profile?.is_active && hasCapability(permissions, "submit_expenses", roles);
  const canViewAll = hasCapability(permissions, "view_expenses", roles);
  const canApprove = !!profile?.is_active && hasCapability(permissions, "approve_expenses", roles);
  const expenseMonths = useMemo(
    () =>
      monthOptions().map((value) => ({
        value,
        label: new Intl.DateTimeFormat(language === "zh" ? "zh-CN" : "en", {
          month: "long",
          year: "numeric",
        }).format(new Date(`${value}-01T00:00:00`)),
      })),
    [language],
  );

  const [open, setOpen] = useState(search.create ?? false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [month, setMonth] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [filterProject, setFilterProject] = useState(search.projectId ?? "");
  const [filterStatus, setFilterStatus] = useState("");
  const selectedMonth = monthRange(month);
  const expenses = useExpenses({
    from: selectedMonth.from || from,
    to: selectedMonth.to || to,
    projectId: filterProject,
    status: filterStatus as "" | "draft" | "submitted" | "approved" | "rejected",
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["expenses"] });

  const review = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "approved" | "rejected" }) => {
      const { error } = await supabase.from("expenses").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      toast.success(`Expense ${variables.status}`);
      refresh();
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not review expense"),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("expenses").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Draft deleted");
      refresh();
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not delete draft"),
  });

  const projectName = (id: string) =>
    projects.data?.find((project) => project.id === id)?.name ?? "Unknown project";
  const personName = (id: string) =>
    people.data?.find((person) => person.id === id)?.full_name ||
    people.data?.find((person) => person.id === id)?.email ||
    "Unknown staff";
  const totalsByCurrency = new Map<string, number>();
  for (const expense of expenses.data ?? []) {
    totalsByCurrency.set(
      expense.currency,
      (totalsByCurrency.get(expense.currency) ?? 0) + Number(expense.amount),
    );
  }
  const total =
    [...totalsByCurrency.entries()]
      .map(
        ([currencyCode, value]) =>
          `${currencyCode} ${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}`,
      )
      .join(" · ") || "—";
  const submitted = (expenses.data ?? []).filter(
    (expense) => expense.status === "submitted",
  ).length;
  const reportTitle = month
    ? new Intl.DateTimeFormat(language === "zh" ? "zh-CN" : "en", {
        month: "long",
        year: "numeric",
      }).format(new Date(`${month}-01T00:00:00`))
    : t("All months");

  return (
    <>
      {search.report ? (
        <Button asChild variant="ghost" className="mb-4 -ml-3">
          <Link
            to="/expenses"
            search={{ create: undefined, report: undefined, projectId: search.projectId }}
          >
            <ArrowLeft />
            {t("Expenses")}
          </Link>
        </Button>
      ) : null}
      <PageHeader
        title={search.report ? "Expense report" : "Expenses"}
        action={
          <div className="flex items-center gap-2">
            {!search.report ? (
              <Button asChild type="button" size="icon" variant="outline">
                <Link
                  to="/expenses"
                  search={{ create: undefined, projectId: search.projectId, report: true }}
                  aria-label={t("Expense report")}
                >
                  <BarChart3 />
                </Link>
              </Button>
            ) : null}
            <Button
              type="button"
              size="icon"
              variant="outline"
              aria-label={t("Filter expenses")}
              onClick={() => setFiltersOpen(true)}
            >
              <Filter />
            </Button>
            {!search.report && canSubmit ? (
              <Button onClick={() => setOpen(true)}>{t("New expense")}</Button>
            ) : null}
          </div>
        }
      />
      <ExpenseDialog
        open={!search.report && open && canSubmit}
        onOpenChange={setOpen}
        defaultProjectId={search.projectId ?? ""}
      />

      <Dialog open={filtersOpen} onOpenChange={setFiltersOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("Filter expenses")}</DialogTitle>
            <DialogDescription className="sr-only">
              {t("Filter expenses by month, date, project and status.")}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Month" id="expense-month">
              <select
                id="expense-month"
                className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm"
                value={month}
                onChange={(event) => {
                  setMonth(event.target.value);
                  if (event.target.value) {
                    setFrom("");
                    setTo("");
                  }
                }}
              >
                <option value="">{t("All months")}</option>
                {expenseMonths.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Project" id="efilter-project">
              <select
                id="efilter-project"
                className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm"
                value={filterProject}
                onChange={(event) => setFilterProject(event.target.value)}
              >
                <option value="">{t("All projects")}</option>
                {(projects.data ?? []).map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="From" id="efrom">
              <Input
                id="efrom"
                type="date"
                value={from}
                onChange={(event) => {
                  setFrom(event.target.value);
                  setMonth("");
                  if (to && event.target.value > to) setTo(event.target.value);
                }}
              />
            </Field>
            <Field label="To" id="eto">
              <Input
                id="eto"
                type="date"
                value={to}
                onChange={(event) => {
                  setTo(event.target.value);
                  setMonth("");
                  if (from && event.target.value < from) setFrom(event.target.value);
                }}
              />
            </Field>
            <div className="sm:col-span-2">
              <Field label="Status" id="efilter-status">
                <select
                  id="efilter-status"
                  className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm"
                  value={filterStatus}
                  onChange={(event) => setFilterStatus(event.target.value)}
                >
                  <option value="">{t("All statuses")}</option>
                  {Object.entries(statusLabel).map(([value, label]) => (
                    <option key={value} value={value}>
                      {t(label)}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          </div>
          <DialogFooter className="flex-row gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              className="flex-1 sm:flex-none"
              onClick={() => {
                setMonth("");
                setFrom("");
                setTo("");
                setFilterProject("");
                setFilterStatus("");
              }}
            >
              {t("Reset")}
            </Button>
            <DialogClose asChild>
              <Button type="button" className="flex-1 sm:flex-none">
                {t("Done")}
              </Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {search.report ? (
        <>
          <p className="mb-3 text-sm text-muted-foreground">{reportTitle}</p>
          <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
            <Summary
              label="Visible expenses"
              value={String(expenses.data?.length ?? 0)}
              tone="bg-stat-gold"
            />
            <Summary label="Total value" value={total} tone="bg-stat-teal" />
            <Summary label="Awaiting review" value={String(submitted)} tone="bg-stat-copper" />
          </div>
        </>
      ) : null}
      {expenses.isLoading ? (
        <p className="text-sm text-muted-foreground">{t("Loading expenses…")}</p>
      ) : null}
      {!search.report ? (
        <div className="logbook-card divide-y divide-border">
          {(expenses.data ?? []).map((expense) => (
            <article key={expense.id} className="px-5 py-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-sm font-medium">{expense.description}</h2>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {projectName(expense.project_id)} · {expense.category} · {expense.expense_date}
                    {canViewAll ? ` · ${personName(expense.submitted_by)}` : ""}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold">
                    {expense.currency}{" "}
                    {Number(expense.amount).toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t(statusLabel[expense.status] ?? expense.status)}
                  </p>
                </div>
              </div>
              {expense.vendor || expense.receipt_url ? (
                <p className="mt-3 break-all text-xs text-muted-foreground">
                  {expense.vendor ? `Vendor: ${expense.vendor}` : ""}
                  {expense.vendor && expense.receipt_url ? " · " : ""}
                  {expense.receipt_url}
                </p>
              ) : null}
              <div className="mt-3 flex flex-wrap justify-end gap-2">
                {expense.status === "draft" && expense.submitted_by === user?.id ? (
                  <Button size="sm" variant="outline" onClick={() => remove.mutate(expense.id)}>
                    {t("Delete draft")}
                  </Button>
                ) : null}
                {canApprove &&
                expense.status === "submitted" &&
                expense.submitted_by !== user?.id ? (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => review.mutate({ id: expense.id, status: "rejected" })}
                    >
                      {t("Reject")}
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => review.mutate({ id: expense.id, status: "approved" })}
                    >
                      {t("Approve")}
                    </Button>
                  </>
                ) : null}
              </div>
            </article>
          ))}
          {!expenses.isLoading && (expenses.data ?? []).length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-muted-foreground">
              {t("No expenses match these filters.")}
            </p>
          ) : null}
        </div>
      ) : null}
    </>
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
function Summary({ label, value, tone }: { label: string; value: string; tone: string }) {
  const { t } = useLanguage();
  return (
    <div className={`logbook-card min-w-0 border-transparent p-4 sm:p-5 ${tone}`}>
      <p className="logbook-label">{t(label)}</p>
      <p className="mt-2 break-words text-xl font-semibold sm:text-2xl">{value}</p>
    </div>
  );
}
