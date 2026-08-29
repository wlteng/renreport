import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import type { AppRole, ReportType } from "@/lib/roles";

export type Department = { id: string; name: string; description: string | null };

export type ProjectRow = {
  id: string;
  name: string;
  description: string | null;
  status: "active" | "paused" | "completed" | "archived";
  url: string | null;
  owner_id: string | null;
  department_id: string | null;
};

export type ReportRow = {
  id: string;
  user_id: string;
  project_id: string | null;
  report_date: string;
  report_type: string;
  title: string;
  content: string;
  hours_spent: number;
  blockers: string | null;
  links: string | null;
  created_at: string;
};

export type PersonRow = {
  id: string;
  email: string;
  full_name: string | null;
  job_title: string | null;
  department_id: string | null;
  is_active: boolean;
};

export function useDepartments() {
  return useQuery({
    queryKey: ["departments"],
    queryFn: async () => {
      const { data, error } = await supabase.from("departments").select("*").order("name");
      if (error) throw error;
      return (data ?? []) as Department[];
    },
  });
}

export function useProjects() {
  return useQuery({
    queryKey: ["projects"],
    queryFn: async () => {
      const { data, error } = await supabase.from("projects").select("*").order("name");
      if (error) throw error;
      return (data ?? []) as ProjectRow[];
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
      return (data ?? []) as PersonRow[];
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
      return (data ?? []) as ReportRow[];
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
      let q = supabase.from("reports").select("*");
      if (filters.from) q = q.gte("report_date", filters.from);
      if (filters.to) q = q.lte("report_date", filters.to);
      if (filters.userId) q = q.eq("user_id", filters.userId);
      if (filters.projectId) q = q.eq("project_id", filters.projectId);
      if (filters.type) q = q.eq("report_type", filters.type as ReportType);
      const { data, error } = await q
        .order("report_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as ReportRow[];
    },
  });
}
