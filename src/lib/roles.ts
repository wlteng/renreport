export type AppRole = "admin" | "boss" | "manager" | "staff";

export const ROLE_ORDER: AppRole[] = ["admin", "boss", "manager", "staff"];

export const ROLE_LABEL: Record<AppRole, string> = {
  admin: "Admin",
  boss: "Boss",
  manager: "Manager",
  staff: "Staff",
};

export const ROLE_DESCRIPTION: Record<AppRole, string> = {
  admin: "Full control: people, roles, departments, projects, audit trail.",
  boss: "Read-only oversight of every report, person and project.",
  manager: "Reads reports from their own department and manages project members.",
  staff: "Writes and manages their own daily reports.",
};

export function highestRole(roles: AppRole[]): AppRole {
  return ROLE_ORDER.find((r) => roles.includes(r)) ?? "staff";
}

export const can = {
  viewAllReports: (roles: AppRole[]) => roles.includes("admin") || roles.includes("boss"),
  viewTeamReports: (roles: AppRole[]) =>
    roles.includes("admin") || roles.includes("boss") || roles.includes("manager"),
  manageProjects: (roles: AppRole[]) => roles.includes("admin") || roles.includes("boss"),
  manageProjectMembers: (roles: AppRole[]) =>
    roles.includes("admin") || roles.includes("boss") || roles.includes("manager"),
  administer: (roles: AppRole[]) => roles.includes("admin"),
  viewAudit: (roles: AppRole[]) => roles.includes("admin") || roles.includes("boss"),
  writeReports: (roles: AppRole[]) => roles.length > 0,
};

export const REPORT_TYPES = [
  { value: "content_input", label: "Content input" },
  { value: "create_develop", label: "Create / develop" },
  { value: "study_research", label: "Study / research" },
  { value: "planning_brainstorm", label: "Planning / brainstorm" },
  { value: "analysis", label: "Analysis" },
  { value: "meeting", label: "Meeting" },
  { value: "support", label: "Support" },
  { value: "other", label: "Other" },
] as const;

export type ReportType = (typeof REPORT_TYPES)[number]["value"];

export const REPORT_TYPE_LABEL: Record<string, string> = Object.fromEntries(
  REPORT_TYPES.map((t) => [t.value, t.label]),
);
