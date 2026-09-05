import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";

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
import { useWorkEnabledProjects } from "@/hooks/useData";
import { useMe } from "@/hooks/useSession";
import { supabase } from "@/integrations/supabase/client";
import { CURRENCY_OPTIONS } from "@/lib/currencies";
import { todayForDateInput } from "@/lib/dates";
import { useLanguage } from "@/lib/i18n";
import { expenseSchema, firstValidationError } from "@/lib/validation";

const EXPENSE_CATEGORIES = [
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

type ExpenseDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultProjectId?: string;
  defaultProjectName?: string;
  lockProject?: boolean;
};

export function ExpenseDialog({
  open,
  onOpenChange,
  defaultProjectId = "",
  defaultProjectName,
  lockProject = false,
}: ExpenseDialogProps) {
  const { user } = useMe();
  const { t } = useLanguage();
  const workEnabledProjects = useWorkEnabledProjects(!lockProject);
  const queryClient = useQueryClient();
  const [projectId, setProjectId] = useState(defaultProjectId);
  const [expenseDate, setExpenseDate] = useState(todayForDateInput);
  const [category, setCategory] = useState("fuel");
  const [description, setDescription] = useState("");
  const [vendor, setVendor] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [receiptUrl, setReceiptUrl] = useState("");
  const [status, setStatus] = useState("submitted");

  function resetForm() {
    setProjectId(defaultProjectId);
    setExpenseDate(todayForDateInput());
    setCategory("fuel");
    setDescription("");
    setVendor("");
    setAmount("");
    setCurrency("USD");
    setReceiptUrl("");
    setStatus("submitted");
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) resetForm();
    onOpenChange(nextOpen);
  }

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
      toast.success(t(status === "draft" ? "Expense saved as draft" : "Expense submitted"));
      handleOpenChange(false);
      queryClient.invalidateQueries({ queryKey: ["expenses"] });
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not save expense"),
  });

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>{t("New expense")}</DialogTitle>
          <DialogDescription>
            {t("Record a project cost and submit it for review, or save it as a draft.")}
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            submit.mutate();
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <ExpenseField label={t("Project")} id="eproject">
              {lockProject ? (
                <Input id="eproject" value={defaultProjectName ?? t("Selected project")} disabled />
              ) : (
                <select
                  id="eproject"
                  className="h-10 w-full rounded-md border border-input bg-card px-3 pr-10 text-sm"
                  value={projectId}
                  onChange={(event) => setProjectId(event.target.value)}
                >
                  <option value="">{t("Choose a project")}</option>
                  {(workEnabledProjects.data ?? []).map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </select>
              )}
            </ExpenseField>
            <ExpenseField label={t("Expense date")} id="edate">
              <Input
                id="edate"
                type="date"
                value={expenseDate}
                onChange={(event) => setExpenseDate(event.target.value)}
              />
            </ExpenseField>
            <ExpenseField label={t("Category")} id="ecategory">
              <select
                id="ecategory"
                className="h-10 w-full rounded-md border border-input bg-card px-3 pr-10 text-sm capitalize"
                value={category}
                onChange={(event) => setCategory(event.target.value)}
              >
                {EXPENSE_CATEGORIES.map((item) => (
                  <option key={item} value={item}>
                    {t(item)}
                  </option>
                ))}
              </select>
            </ExpenseField>
            <ExpenseField label={t("Save as")} id="estatus">
              <select
                id="estatus"
                className="h-10 w-full rounded-md border border-input bg-card px-3 pr-10 text-sm"
                value={status}
                onChange={(event) => setStatus(event.target.value)}
              >
                <option value="submitted">{t("Submitted")}</option>
                <option value="draft">{t("Draft")}</option>
              </select>
            </ExpenseField>
          </div>
          <ExpenseField label={t("Description")} id="edescription">
            <Textarea
              id="edescription"
              rows={3}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </ExpenseField>
          <div className="grid gap-4 sm:grid-cols-2">
            <ExpenseField label={t("Vendor")} id="evendor">
              <Input
                id="evendor"
                value={vendor}
                onChange={(event) => setVendor(event.target.value)}
              />
            </ExpenseField>
            <ExpenseField label={t("Amount")} id="eamount">
              <Input
                id="eamount"
                type="number"
                min="0.01"
                step="0.01"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
              />
            </ExpenseField>
            <ExpenseField label={t("Currency")} id="ecurrency">
              <select
                id="ecurrency"
                className="h-10 w-full rounded-md border border-input bg-card px-3 pr-10 text-sm"
                value={currency}
                onChange={(event) => setCurrency(event.target.value)}
              >
                {CURRENCY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </ExpenseField>
            <ExpenseField label={t("Receipt URL")} id="ereceipt">
              <Input
                id="ereceipt"
                type="url"
                value={receiptUrl}
                onChange={(event) => setReceiptUrl(event.target.value)}
              />
            </ExpenseField>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                {t("Cancel")}
              </Button>
            </DialogClose>
            <Button type="submit" disabled={submit.isPending}>
              {submit.isPending
                ? t("Saving…")
                : status === "draft"
                  ? t("Save draft")
                  : t("Submit expense")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ExpenseField({ label, id, children }: { label: string; id: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}
