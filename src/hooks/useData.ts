import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
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

export type PersonRow = Pick<
  Tables<"profiles">,
  | "id"
  | "email"
  | "full_name"
  | "avatar_url"
  | "job_title"
  | "resume"
  | "department_id"
  | "is_active"
>;
export type StaffDirectoryRow = Pick<
  Tables<"profiles">,
  "id" | "email" | "full_name" | "avatar_url" | "job_title" | "is_active"
>;

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

export function useActiveProjects(enabled = true) {
  return useQuery({
    queryKey: ["projects", "active"],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projects")
        .select("*")
        .eq("status", "active")
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

export function useProjectTasks(projectId: string) {
  return useQuery({
    queryKey: ["project-tasks", projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("project_tasks")
        .select("*")
        .eq("project_id", projectId)
        .order("is_completed")
        .order("due_date", { ascending: true, nullsFirst: false })
        .order("created_at");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useProjectMilestones(projectId: string) {
  return useQuery({
    queryKey: ["project-milestones", projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("project_milestones")
        .select("*")
        .eq("project_id", projectId)
        .order("is_achieved")
        .order("target_date", { ascending: true, nullsFirst: false })
        .order("created_at");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useProjectGitEvents(
  projectId: string,
  repositoryUrl: string | null | undefined,
  enabled: boolean,
) {
  return useQuery({
    queryKey: ["project-git-events", projectId, repositoryUrl],
    enabled: enabled && !!repositoryUrl,
    staleTime: 5 * 60 * 1000,
    refetchOnMount: "always",
    retry: false,
    queryFn: async () => {
      const sync = await supabase.functions.invoke("sync-project-github", {
        body: { projectId },
      });
      const { data, error } = await supabase
        .from("project_git_events")
        .select("*")
        .eq("project_id", projectId)
        .order("occurred_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return {
        events: data ?? [],
        syncError: sync.error ? "Could not refresh GitHub activity." : null,
      };
    },
  });
}

export function usePeople() {
  return useQuery({
    queryKey: ["people"],
    queryFn: async () => {
      const withResume = await supabase
        .from("profiles")
        .select("id, email, full_name, avatar_url, job_title, resume, department_id, is_active")
        .order("full_name", { nullsFirst: false });
      if (!withResume.error) return withResume.data ?? [];
      if (!withResume.error.message.includes("profiles.resume")) throw withResume.error;

      const fallback = await supabase
        .from("profiles")
        .select("id, email, full_name, avatar_url, job_title, department_id, is_active")
        .order("full_name", { nullsFirst: false });
      if (fallback.error) throw fallback.error;
      return (fallback.data ?? []).map((person) => ({ ...person, resume: null }));
    },
  });
}

export function useStaffDirectory() {
  return useQuery({
    queryKey: ["people", "directory"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, email, full_name, avatar_url, job_title, is_active")
        .order("full_name", { nullsFirst: false });
      if (error) throw error;
      return data ?? [];
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

export function useVisibleReports(filters: ReportFilters) {
  return useQuery({
    queryKey: ["visible-reports", filters],
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

export function useExpenses(filters: ExpenseFilters) {
  return useQuery({
    queryKey: ["expenses", filters],
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
