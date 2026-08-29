import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/hooks/useSession";
import { useAllRoles, useDepartments, usePeople } from "@/hooks/useData";
import { can, ROLE_DESCRIPTION, ROLE_LABEL, ROLE_ORDER, type AppRole } from "@/lib/roles";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({
    meta: [
      { title: "Admin — JJ Report" },
      {
        name: "description",
        content: "Manage people, roles, departments and review the role audit trail.",
      },
      { property: "og:title", content: "Admin — JJ Report" },
      { property: "og:description", content: "People, roles, departments and audit trail." },
    ],
  }),
  component: AdminPage,
});

function useAudit(enabled: boolean) {
  return useQuery({
    queryKey: ["role-audit"],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("role_audit_log")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data ?? [];
    },
  });
}

function AdminPage() {
  const { user, roles } = useMe();
  const isAdmin = can.administer(roles);
  const people = usePeople();
  const allRoles = useAllRoles();
  const departments = useDepartments();
  const audit = useAudit(can.viewAudit(roles));
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<"people" | "departments" | "audit">("people");
  const [deptName, setDeptName] = useState("");

  const refreshRoles = () => {
    queryClient.invalidateQueries({ queryKey: ["all-roles"] });
    queryClient.invalidateQueries({ queryKey: ["roles"] });
    queryClient.invalidateQueries({ queryKey: ["role-audit"] });
  };

  const grant = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: AppRole }) => {
      const { error } = await supabase.from("user_roles").insert({
        user_id: userId,
        role,
        granted_by: user!.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Role granted");
      refreshRoles();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not grant role"),
  });

  const revoke = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("user_roles").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Role revoked");
      refreshRoles();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not revoke role"),
  });

  const setDepartment = useMutation({
    mutationFn: async ({ userId, deptId }: { userId: string; deptId: string }) => {
      const { error } = await supabase
        .from("profiles")
        .update({ department_id: deptId || null })
        .eq("id", userId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Department updated");
      queryClient.invalidateQueries({ queryKey: ["people"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not update"),
  });

  const toggleActive = useMutation({
    mutationFn: async ({ userId, active }: { userId: string; active: boolean }) => {
      const { error } = await supabase
        .from("profiles")
        .update({ is_active: active })
        .eq("id", userId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Updated");
      queryClient.invalidateQueries({ queryKey: ["people"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not update"),
  });

  const createDept = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("departments").insert({ name: deptName });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Department created");
      setDeptName("");
      queryClient.invalidateQueries({ queryKey: ["departments"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not create"),
  });

  if (!isAdmin) {
    return (
      <div className="logbook-card p-10 text-center">
        <p className="text-sm text-muted-foreground">Admins only.</p>
      </div>
    );
  }

  const rolesOf = (userId: string) => (allRoles.data ?? []).filter((r) => r.user_id === userId);
  const personName = (id: string) => {
    const p = (people.data ?? []).find((x) => x.id === id);
    return p?.full_name || p?.email || id.slice(0, 8);
  };

  return (
    <>
      <PageHeader title="Admin" subtitle="People, roles, departments and the role audit trail." />

      <div className="mb-6 flex gap-1 rounded-lg border border-border bg-secondary p-1 text-sm">
        {(["people", "departments", "audit"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={
              tab === t
                ? "flex-1 rounded-md bg-card px-3 py-1.5 font-medium capitalize shadow-xs"
                : "flex-1 rounded-md px-3 py-1.5 capitalize text-muted-foreground"
            }
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "people" ? (
        <div className="space-y-4">
          {(people.data ?? []).map((p) => {
            const held = rolesOf(p.id);
            return (
              <div key={p.id} className="logbook-card p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold">{p.full_name || p.email}</p>
                    <p className="text-xs text-muted-foreground">
                      {p.email}
                      {p.job_title ? ` · ${p.job_title}` : ""}
                    </p>
                  </div>
                  <button
                    onClick={() => toggleActive.mutate({ userId: p.id, active: !p.is_active })}
                    className="text-xs text-muted-foreground hover:text-foreground"
                  >
                    {p.is_active ? "Deactivate" : "Reactivate"}
                  </button>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-2">
                  {ROLE_ORDER.map((role) => {
                    const owned = held.find((h) => h.role === role);
                    return (
                      <button
                        key={role}
                        title={ROLE_DESCRIPTION[role]}
                        onClick={() =>
                          owned
                            ? revoke.mutate(owned.id)
                            : grant.mutate({ userId: p.id, role })
                        }
                        className={
                          owned
                            ? "rounded-full bg-primary px-3 py-1 text-xs font-medium text-primary-foreground"
                            : "rounded-full border border-border px-3 py-1 text-xs text-muted-foreground hover:text-foreground"
                        }
                      >
                        {ROLE_LABEL[role]}
                      </button>
                    );
                  })}
                </div>

                <div className="mt-4 flex items-center gap-3">
                  <span className="logbook-label">Department</span>
                  <select
                    className="h-9 rounded-md border border-input bg-card px-2 text-sm"
                    value={p.department_id ?? ""}
                    onChange={(e) =>
                      setDepartment.mutate({ userId: p.id, deptId: e.target.value })
                    }
                  >
                    <option value="">Unassigned</option>
                    {(departments.data ?? []).map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            );
          })}
        </div>
      ) : null}

      {tab === "departments" ? (
        <div className="space-y-6">
          <form
            className="logbook-card flex flex-wrap items-end gap-3 p-5"
            onSubmit={(e) => {
              e.preventDefault();
              createDept.mutate();
            }}
          >
            <div className="min-w-52 flex-1 space-y-1.5">
              <Label htmlFor="dname">New department</Label>
              <Input
                id="dname"
                value={deptName}
                onChange={(e) => setDeptName(e.target.value)}
                placeholder="e.g. Marketing"
                required
              />
            </div>
            <Button type="submit" disabled={createDept.isPending}>
              Add
            </Button>
          </form>

          <div className="logbook-card divide-y divide-border">
            {(departments.data ?? []).map((d) => (
              <div key={d.id} className="flex items-center justify-between px-5 py-3 text-sm">
                <span>{d.name}</span>
                <span className="text-xs text-muted-foreground">
                  {(people.data ?? []).filter((p) => p.department_id === d.id).length} people
                </span>
              </div>
            ))}
            {(departments.data ?? []).length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-muted-foreground">
                No departments yet. Managers see reports from their own department.
              </p>
            ) : null}
          </div>
        </div>
      ) : null}

      {tab === "audit" ? (
        <div className="logbook-card divide-y divide-border">
          {(audit.data ?? []).map((a) => (
            <div key={a.id} className="flex items-center justify-between px-5 py-3 text-sm">
              <span>
                {ROLE_LABEL[a.role as AppRole]} {a.action} — {personName(a.target_user_id)}
              </span>
              <span className="text-xs text-muted-foreground">
                {new Date(a.created_at).toLocaleString()}
                {a.actor_id ? ` · by ${personName(a.actor_id)}` : ""}
              </span>
            </div>
          ))}
          {!audit.isLoading && (audit.data ?? []).length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-muted-foreground">
              No role changes recorded yet.
            </p>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
