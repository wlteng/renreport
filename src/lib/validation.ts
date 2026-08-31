import { z } from "zod";

const trimmed = (min: number, max: number, label: string) =>
  z.string().trim().min(min, `${label} is required`).max(max, `${label} is too long`);

const optionalTrimmed = (max: number) =>
  z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    z.string().trim().max(max).optional(),
  );

const optionalNumber = (max: number) =>
  z.preprocess(
    (value) => (value === "" || value === null || value === undefined ? undefined : value),
    z.coerce.number().min(0).max(max).optional(),
  );

export const currencySchema = z.enum(["CNY", "RUB", "USD", "MYR"]);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a valid date");
const optionalUuid = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().uuid().optional(),
);

export const appRoleSchema = z.enum(["admin", "boss", "manager", "staff"]);
export const miningMethodSchema = z.enum([
  "alluvial",
  "open_pit",
  "underground",
  "exploration",
  "other",
]);
export const licenseStatusSchema = z.enum(["licensed", "in_process", "expired", "unknown"]);
export const miningReportTypeSchema = z.enum([
  "site_operations",
  "exploration",
  "extraction",
  "processing",
  "logistics",
  "maintenance",
  "safety",
  "administration",
]);
export const workStatusSchema = z.enum(["completed", "in_progress", "blocked"]);
export const shiftSchema = z.enum(["day", "night", "other"]);
export const expenseCategorySchema = z.enum([
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
]);
export const expenseStatusSchema = z.enum(["draft", "submitted", "approved", "rejected"]);
export const salaryTypeSchema = z.enum(["monthly", "hourly", "daily"]);

export const miningProjectSchema = z.object({
  name: trimmed(1, 120, "Project name"),
  project_code: optionalTrimmed(40),
  legal_name: optionalTrimmed(160),
  location: optionalTrimmed(200),
  mining_method: miningMethodSchema,
  license_status: licenseStatusSchema,
  reserve_kg: optionalNumber(99999999999.999),
  area_km2: optionalNumber(99999999999.999),
  department_id: optionalUuid,
  description: optionalTrimmed(2000),
});

export const workLogSchema = z
  .object({
    report_date: date,
    project_id: z.string().uuid("Choose an active mine project"),
    report_type: miningReportTypeSchema,
    work_status: workStatusSchema,
    shift: shiftSchema,
    title: trimmed(1, 160, "Task or headline"),
    content: trimmed(1, 10000, "Details"),
    hours_spent: z.coerce.number().min(0).max(24),
    output_quantity: optionalNumber(99999999999.999),
    output_unit: optionalTrimmed(24),
    blockers: optionalTrimmed(2000),
    links: optionalTrimmed(2000),
  })
  .refine((value) => value.output_quantity === undefined || !!value.output_unit, {
    message: "Add a unit for the output quantity",
    path: ["output_unit"],
  });

export const expenseSchema = z.object({
  project_id: z.string().uuid("Choose an active mine project"),
  expense_date: date,
  category: expenseCategorySchema,
  description: trimmed(1, 2000, "Description"),
  vendor: optionalTrimmed(160),
  amount: z.coerce.number().positive("Amount must be greater than zero").max(999999999999.99),
  currency: currencySchema,
  receipt_url: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    z.string().trim().url("Enter a valid receipt URL").max(2000).optional(),
  ),
  status: z.enum(["draft", "submitted"]),
});

export const departmentSchema = z.object({
  name: trimmed(1, 100, "Department name"),
  description: optionalTrimmed(1000),
});

export const personMutationSchema = z.object({
  user_id: z.string().uuid(),
  department_id: optionalUuid,
  is_active: z.boolean().optional(),
});

export const personDetailsSchema = z.object({
  user_id: z.string().uuid(),
  full_name: trimmed(1, 120, "Full name"),
  job_title: optionalTrimmed(120),
  resume: optionalTrimmed(5000),
});

export const roleMutationSchema = z.object({
  user_id: z.string().uuid(),
  role: appRoleSchema,
});

export const permissionMutationSchema = z.object({
  role: appRoleSchema,
  permission_key: z.string().regex(/^[a-z][a-z0-9_]{1,63}$/),
  enabled: z.boolean(),
});

export const compensationSchema = z.object({
  user_id: z.string().uuid(),
  salary_amount: z.coerce.number().min(0).max(999999999999.99),
  salary_type: salaryTypeSchema,
  currency: currencySchema,
  standard_hours: z.coerce.number().positive().max(744),
});

export const createStaffSchema = compensationSchema.omit({ user_id: true }).extend({
  full_name: trimmed(1, 120, "Full name"),
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(8, "Password must be at least 8 characters").max(128),
  job_title: optionalTrimmed(120),
  resume: optionalTrimmed(5000),
  department_id: optionalUuid,
  role: appRoleSchema,
});

export function firstValidationError(error: z.ZodError): string {
  const issue = error.issues[0];
  if (!issue) return "Please check the form and try again";
  const field = issue.path[0];
  return typeof field === "string"
    ? `${field.replaceAll("_", " ")}: ${issue.message}`
    : issue.message;
}
