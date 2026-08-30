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

export type PersonRow = Pick<
  Tables<"profiles">,
  "id" | "email" | "full_name" | "job_title" | "department_id" | "is_active"
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

export function useActiveProjects() {
  return useQuery({
    queryKey: ["projects", "active"],
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

export function usePeople() {
  return useQuery({
    queryKey: ["people"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, email, full_name, job_title, department_id, is_active")
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
