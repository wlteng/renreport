import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useActiveProjects, useExpenses, usePeople, useProjects } from "@/hooks/useData";
import { useMe } from "@/hooks/useSession";
import { supabase } from "@/integrations/supabase/client";
import { hasCapability } from "@/lib/roles";
import { expenseSchema, firstValidationError } from "@/lib/validation";

export const Route = createFileRoute("/_authenticated/expenses")({
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

const categories = [
  "equipment",
  "fuel",
  "transport",
  "supplies",
  "contractor",
  "salary",
  "permit",
  "accommodation",
  "food",
  "other",
] as const;
const statusLabel: Record<string, string> = {
  draft: "Draft",
  submitted: "Submitted",
  approved: "Approved",
  rejected: "Rejected",
};

function ExpensesPage() {
  const { user, profile, roles, permissions } = useMe();
  const projects = useProjects();
  const activeProjects = useActiveProjects();
  const people = usePeople();
  const queryClient = useQueryClient();
  const canSubmit = !!profile?.is_active && hasCapability(permissions, "submit_expenses", roles);
  const canViewAll = hasCapability(permissions, "view_expenses", roles);
  const canApprove = !!profile?.is_active && hasCapability(permissions, "approve_expenses", roles);

  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [filterProject, setFilterProject] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const expenses = useExpenses({
    from,
    to,
    projectId: filterProject,
    status: filterStatus as "" | "draft" | "submitted" | "approved" | "rejected",
  });

  const [projectId, setProjectId] = useState("");
  const [expenseDate, setExpenseDate] = useState(new Date().toISOString().slice(0, 10));
  const [category, setCategory] = useState("fuel");
  const [description, setDescription] = useState("");
  const [vendor, setVendor] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [receiptUrl, setReceiptUrl] = useState("");
  const [status, setStatus] = useState("submitted");

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["expenses"] });
  const submit = useMutation({
    mutationFn: async () => {
      const parsed = expenseSchema.safeParse({
        project_id: projectId,
        expense_date: expenseDate,
        category,
        description,
        vendor,
        amount,
        currency,
        receipt_url: receiptUrl,
        status,
      });
      if (!parsed.success) throw new Error(firstValidationError(parsed.error));
      if (!user) throw new Error("Your session has expired");
      const input = parsed.data;
      const { error } = await supabase.from("expenses").insert({
        ...input,
        submitted_by: user.id,
        vendor: input.vendor ?? null,
        receipt_url: input.receipt_url ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(status === "draft" ? "Expense saved as draft" : "Expense submitted");
      setOpen(false);
      setProjectId("");
      setDescription("");
      setVendor("");
      setAmount("");
      setReceiptUrl("");
      refresh();
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not save expense"),
  });

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

  return (
    <>
      <PageHeader
        title="Expenses"
        subtitle={
          canViewAll
            ? "Project expense submissions across mining operations."
            : "Your mining project expense submissions."
        }
        action={
          canSubmit ? (
            <Button onClick={() => setOpen((value) => !value)}>
              {open ? "Close" : "New expense"}
            </Button>
          ) : undefined
        }
      />
      {open && canSubmit ? (
        <form
          className="logbook-card mb-6 space-y-4 p-6"
          onSubmit={(event) => {
            event.preventDefault();
            submit.mutate();
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Mine project" id="eproject">
              <select
                id="eproject"
                className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm"
                value={projectId}
                onChange={(event) => setProjectId(event.target.value)}
              >
                <option value="">Choose a project</option>
                {(activeProjects.data ?? []).map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Expense date" id="edate">
              <Input
                id="edate"
                type="date"
                value={expenseDate}
                onChange={(event) => setExpenseDate(event.target.value)}
              />
            </Field>
            <Field label="Category" id="ecategory">
              <select
                id="ecategory"
                className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm capitalize"
                value={category}
                onChange={(event) => setCategory(event.target.value)}
              >
                {categories.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Save as" id="estatus">
              <select
                id="estatus"
                className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm"
                value={status}
                onChange={(event) => setStatus(event.target.value)}
              >
                <option value="submitted">Submitted</option>
                <option value="draft">Draft</option>
              </select>
            </Field>
          </div>
          <Field label="Description" id="edescription">
            <Textarea
              id="edescription"
              rows={3}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Vendor" id="evendor">
              <Input
                id="evendor"
                value={vendor}
                onChange={(event) => setVendor(event.target.value)}
              />
            </Field>
            <Field label="Amount" id="eamount">
              <Input
                id="eamount"
                type="number"
                min="0.01"
                step="0.01"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
              />
            </Field>
            <Field label="Currency" id="ecurrency">
              <Input
                id="ecurrency"
                maxLength={3}
                value={currency}
                onChange={(event) => setCurrency(event.target.value.toUpperCase())}
              />
            </Field>
            <Field label="Receipt URL" id="ereceipt">
              <Input
                id="ereceipt"
                type="url"
                value={receiptUrl}
                onChange={(event) => setReceiptUrl(event.target.value)}
              />
            </Field>
          </div>
          <div className="flex justify-end">
            <Button type="submit" disabled={submit.isPending}>
              {submit.isPending ? "Saving…" : status === "draft" ? "Save draft" : "Submit expense"}
            </Button>
          </div>
        </form>
      ) : null}

      <div className="logbook-card mb-6 grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="From" id="efrom">
          <Input
            id="efrom"
            type="date"
            value={from}
            onChange={(event) => setFrom(event.target.value)}
          />
        </Field>
        <Field label="To" id="eto">
          <Input id="eto" type="date" value={to} onChange={(event) => setTo(event.target.value)} />
        </Field>
        <Field label="Project" id="efilter-project">
          <select
            id="efilter-project"
            className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm"
            value={filterProject}
            onChange={(event) => setFilterProject(event.target.value)}
          >
            <option value="">All projects</option>
            {(projects.data ?? []).map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Status" id="efilter-status">
          <select
            id="efilter-status"
            className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm"
            value={filterStatus}
            onChange={(event) => setFilterStatus(event.target.value)}
          >
            <option value="">All statuses</option>
            {Object.entries(statusLabel).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Summary label="Visible expenses" value={String(expenses.data?.length ?? 0)} />
        <Summary label="Total value" value={total} />
        <Summary label="Awaiting review" value={String(submitted)} />
      </div>
      {expenses.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading expenses…</p>
      ) : null}
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
                <p className="mt-1 text-xs text-muted-foreground">{statusLabel[expense.status]}</p>
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
                  Delete draft
                </Button>
              ) : null}
              {canApprove && expense.status === "submitted" && expense.submitted_by !== user?.id ? (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => review.mutate({ id: expense.id, status: "rejected" })}
                  >
                    Reject
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => review.mutate({ id: expense.id, status: "approved" })}
                  >
                    Approve
                  </Button>
                </>
              ) : null}
            </div>
          </article>
        ))}
        {!expenses.isLoading && (expenses.data ?? []).length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-muted-foreground">
            No expenses match these filters.
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
function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="logbook-card p-5">
      <p className="logbook-label">{label}</p>
      <p className="mt-2 text-2xl font-semibold">{value}</p>
    </div>
  );
}
