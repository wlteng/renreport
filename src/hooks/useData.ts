import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { useUser } from "@/hooks/useSession";
import type { Tables } from "@/integrations/supabase/types";
import type { AppRole, PermissionKey, ReportType } from "@/lib/roles";

export type Department = Tables<"departments">;
export type ProjectRow = Tables<"projects">;
export type ReportRow = Tables<"reports">;
export type ExpenseRow = Tables<"expenses">;
export type CompensationRow = Tables<"staff_compensation">;
export type PermissionRow = Tables<"permissions">;
export type RolePermissionRow = Tables<"role_permissions">;
export type AuditLogRow = Tables<"admin_audit_log">;
export type ProjectMemberRow = Tables<"project_members">;
export type ProjectTaskRow = Tables<"project_tasks">;
export type ProjectMilestoneRow = Tables<"project_milestones">;
export type ProjectGitEventRow = Tables<"project_git_events">;

type DirectoryProfile = Pick<
  Tables<"profiles">,
  "id" | "full_name" | "avatar_url" | "job_title" | "resume" | "department_id" | "is_active"
>;
export type PersonRow = DirectoryProfile & { email: string | null };
export type StaffDirectoryRow = Pick<
  PersonRow,
  "id" | "email" | "full_name" | "avatar_url" | "job_title" | "is_active"
>;

const PUBLIC_DIRECTORY_FIELDS =
  "id, full_name, avatar_url, job_title, resume, department_id, is_active" as const;

async function loadPeopleDirectory(): Promise<PersonRow[]> {
  const directory = await supabase.rpc("people_directory");
  if (!directory.error) return directory.data ?? [];

  // Keep the UI usable while the privacy migration is rolling out. The fallback
  // deliberately omits email, even if the older profiles policy still exposes it.
  if (
    directory.error.code !== "PGRST202" &&
    !directory.error.message.includes("people_directory")
  ) {
    throw directory.error;
  }
  const fallback = await supabase
    .from("profiles")
    .select(PUBLIC_DIRECTORY_FIELDS)
    .order("full_name", { nullsFirst: false });
  if (fallback.error) throw fallback.error;
  return (fallback.data ?? []).map((person) => ({ ...person, email: null }));
}

export function useDepartments() {
  return useQuery({
    queryKey: ["departments"],
    queryFn: async () => {
      const { data, error } = await supabase.from("departments").select("*").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useProjects() {
  return useQuery({
    queryKey: ["projects"],
    queryFn: async () => {
      const { data, error } = await supabase.from("projects").select("*").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useWorkEnabledProjects(enabled = true) {
  return useQuery({
    queryKey: ["projects", "work-enabled"],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projects")
        .select("*")
        .in("status", ["active", "maintenance"])
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useProjectMembers() {
  return useQuery({
    queryKey: ["project-members"],
    queryFn: async () => {
      const { data, error } = await supabase.from("project_members").select("*");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useProjectTasks(projectId: string | undefined) {
  return useQuery({
    queryKey: ["project-tasks", projectId],
    enabled: !!projectId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("project_tasks")
        .select("*")
        .eq("project_id", projectId!)
        .order("is_completed")
        .order("due_date", { ascending: true, nullsFirst: false })
        .order("created_at");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useProjectMilestones(projectId: string | undefined) {
  return useQuery({
    queryKey: ["project-milestones", projectId],
    enabled: !!projectId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("project_milestones")
        .select("*")
        .eq("project_id", projectId!)
        .order("is_achieved")
        .order("target_date", { ascending: true, nullsFirst: false })
        .order("created_at");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useProjectGitEvents(
  projectId: string | undefined,
  repositoryUrl: string | null | undefined,
  enabled: boolean,
) {
  return useQuery({
    queryKey: ["project-git-events", projectId, repositoryUrl],
    enabled: enabled && !!projectId && !!repositoryUrl,
    staleTime: 5 * 60 * 1000,
    refetchOnMount: "always",
    retry: false,
    queryFn: async () => {
      const sync = await supabase.functions.invoke("sync-project-github", {
        body: { projectId: projectId! },
      });
      const loadEvents = (hideDeleted: boolean) => {
        let query = supabase.from("project_git_events").select("*").eq("project_id", projectId!);
        if (hideDeleted) query = query.is("deleted_at", null);
        return query.order("occurred_at", { ascending: false }).limit(50);
      };
      let { data, error } = await loadEvents(true);
      // Keeps the page usable while the new migration is rolling out.
      if (error?.code === "42703" || error?.message.includes("deleted_at")) {
        ({ data, error } = await loadEvents(false));
      }
      if (error) throw error;
      return {
        events: data ?? [],
        syncError: sync.error ? "Could not refresh GitHub activity." : null,
      };
    },
  });
}

/** Completion counts for every visible project's to-do list, for the projects overview. */
export function useProjectTaskSummary() {
  return useQuery({
    queryKey: ["project-tasks", "summary"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("project_tasks")
        .select("project_id, is_completed");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function usePeople() {
  const { user } = useUser();
  return useQuery({
    queryKey: ["people", user?.id],
    enabled: !!user,
    queryFn: async () => {
      return loadPeopleDirectory();
    },
  });
}

export function useStaffDirectory() {
  const { user } = useUser();
  return useQuery({
    queryKey: ["people", "directory", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const data = await loadPeopleDirectory();
      return data.map(
        ({ resume: _resume, department_id: _departmentId, ...person }) => person,
      ) as StaffDirectoryRow[];
    },
  });
}

export function useAllRoles() {
  return useQuery({
    queryKey: ["all-roles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("user_roles").select("id, user_id, role");
      if (error) throw error;
      return (data ?? []) as { id: string; user_id: string; role: AppRole }[];
    },
  });
}

export function usePermissions() {
  return useQuery({
    queryKey: ["permissions"],
    queryFn: async () => {
      const { data, error } = await supabase.from("permissions").select("*").order("label");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useRolePermissions() {
  return useQuery({
    queryKey: ["role-permissions"],
    queryFn: async () => {
      const { data, error } = await supabase.from("role_permissions").select("*");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export type AuditLogFilters = {
  eventType?: string;
  actorId?: string;
};

export function useAdminAuditLog(filters: AuditLogFilters, enabled: boolean) {
  return useQuery({
    queryKey: ["admin-audit", filters],
    enabled,
    queryFn: async () => {
      let query = supabase.from("admin_audit_log").select("*");
      if (filters.eventType) query = query.eq("event_type", filters.eventType);
      if (filters.actorId) query = query.eq("actor_id", filters.actorId);
      const { data, error } = await query.order("created_at", { ascending: false }).limit(250);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useCompensation(enabled: boolean) {
  return useQuery({
    queryKey: ["compensation"],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase.from("staff_compensation").select("*");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useMyCompensation(userId: string | undefined) {
  return useQuery({
    queryKey: ["compensation", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("staff_compensation")
        .select("*")
        .eq("user_id", userId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export function useMyReports(userId: string | undefined) {
  return useQuery({
    queryKey: ["my-reports", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reports")
        .select("*")
        .eq("user_id", userId!)
        .order("report_date", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useReport(id: string | undefined) {
  return useQuery({
    queryKey: ["report", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reports")
        .select("*")
        .eq("id", id!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export type ReportFilters = {
  from?: string;
  to?: string;
  userId?: string;
  projectId?: string;
  type?: string;
};

export function useVisibleReports(filters: ReportFilters, enabled = true) {
  return useQuery({
    queryKey: ["visible-reports", filters],
    enabled,
    queryFn: async () => {
      let query = supabase.from("reports").select("*");
      if (filters.from) query = query.gte("report_date", filters.from);
      if (filters.to) query = query.lte("report_date", filters.to);
      if (filters.userId) query = query.eq("user_id", filters.userId);
      if (filters.projectId) query = query.eq("project_id", filters.projectId);
      if (filters.type) query = query.eq("report_type", filters.type as ReportType);
      const { data, error } = await query
        .order("report_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export type ExpenseFilters = {
  from?: string;
  to?: string;
  projectId?: string;
  status?: ExpenseRow["status"] | "";
};

export function useExpenses(filters: ExpenseFilters, enabled = true) {
  return useQuery({
    queryKey: ["expenses", filters],
    enabled,
    queryFn: async () => {
      let query = supabase.from("expenses").select("*");
      if (filters.from) query = query.gte("expense_date", filters.from);
      if (filters.to) query = query.lte("expense_date", filters.to);
      if (filters.projectId) query = query.eq("project_id", filters.projectId);
      if (filters.status) query = query.eq("status", filters.status);
      const { data, error } = await query
        .order("expense_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function roleHasPermission(
  rows: RolePermissionRow[],
  role: AppRole,
  permission: PermissionKey,
) {
  return rows.some((row) => row.role === role && row.permission_key === permission && row.enabled);
}
