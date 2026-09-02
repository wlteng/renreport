export type AppRole = "admin" | "boss" | "manager" | "staff";

export type PermissionKey =
  | "manage_people"
  | "manage_roles"
  | "manage_departments"
  | "manage_permissions"
  | "manage_projects"
  | "submit_work"
  | "view_staff_feed"
  | "submit_expenses"
  | "view_expenses"
  | "approve_expenses"
  | "manage_compensation"
  | "view_audit_log";

export const ROLE_ORDER: AppRole[] = ["admin", "boss", "manager", "staff"];

export const ROLE_LABEL: Record<AppRole, string> = {
  admin: "Admin",
  boss: "Boss",
  manager: "Manager",
  staff: "Staff",
};

export const ROLE_DESCRIPTION: Record<AppRole, string> = {
  admin: "Full control of people, projects, permissions, expenses and compensation.",
  boss: "Oversees staff activity, projects and expense approvals.",
  manager: "Monitors staff activity and project expenses.",
  staff: "Submits project work logs and expenses.",
};

export function highestRole(roles: AppRole[]): AppRole {
  return ROLE_ORDER.find((role) => roles.includes(role)) ?? "staff";
}

const DEFAULT_PERMISSIONS: Record<AppRole, PermissionKey[]> = {
  admin: [
    "manage_people",
    "manage_roles",
    "manage_departments",
    "manage_permissions",
    "manage_projects",
    "submit_work",
    "view_staff_feed",
    "submit_expenses",
    "view_expenses",
    "approve_expenses",
    "manage_compensation",
    "view_audit_log",
  ],
  boss: ["manage_projects", "view_staff_feed", "view_expenses", "approve_expenses"],
  manager: ["view_staff_feed", "view_expenses"],
  staff: ["submit_work", "view_staff_feed", "submit_expenses"],
};

export function defaultPermissionsFor(roles: AppRole[]): PermissionKey[] {
  return [...new Set(roles.flatMap((role) => DEFAULT_PERMISSIONS[role]))];
}

export function hasCapability(
  permissions: PermissionKey[] | undefined,
  key: PermissionKey,
  roles: AppRole[] = [],
) {
  return (permissions ?? defaultPermissionsFor(roles)).includes(key);
}

export const can = {
  viewAllReports: (roles: AppRole[]) => defaultPermissionsFor(roles).includes("view_staff_feed"),
  viewTeamReports: (roles: AppRole[]) => defaultPermissionsFor(roles).includes("view_staff_feed"),
  manageProjects: (roles: AppRole[]) => defaultPermissionsFor(roles).includes("manage_projects"),
  manageProjectMembers: (roles: AppRole[]) =>
    defaultPermissionsFor(roles).includes("manage_projects"),
  administer: (roles: AppRole[]) => roles.includes("admin"),
  viewAudit: (roles: AppRole[]) => defaultPermissionsFor(roles).includes("manage_roles"),
  writeReports: (roles: AppRole[]) => defaultPermissionsFor(roles).includes("submit_work"),
};

export const REPORT_TYPES = [
  { value: "normal_activity", label: "Normal activity" },
  { value: "content_input", label: "Content input" },
  { value: "create_develop", label: "Create / develop" },
  { value: "study_research", label: "Study / research" },
  { value: "planning_brainstorm", label: "Planning / brainstorm" },
  { value: "analysis", label: "Analysis" },
  { value: "meeting", label: "Meeting" },
  { value: "support", label: "Support" },
  { value: "site_operations", label: "Site operations" },
  { value: "exploration", label: "Exploration" },
  { value: "extraction", label: "Extraction" },
  { value: "processing", label: "Processing" },
  { value: "logistics", label: "Logistics" },
  { value: "maintenance", label: "Maintenance" },
  { value: "safety", label: "Safety" },
  { value: "administration", label: "Administration" },
  { value: "other", label: "Other" },
] as const;

export type ReportType = (typeof REPORT_TYPES)[number]["value"];

export const REPORT_TYPE_LABEL: Record<string, string> = {
  content_input: "Content input",
  create_develop: "Create / develop",
  study_research: "Study / research",
  planning_brainstorm: "Planning / brainstorm",
  analysis: "Analysis",
  meeting: "Meeting",
  support: "Support",
  other: "Other",
  ...Object.fromEntries(REPORT_TYPES.map((type) => [type.value, type.label])),
};

export const WORK_STATUS_LABEL: Record<string, string> = {
  completed: "Completed",
  in_progress: "In progress",
  blocked: "Blocked",
};
