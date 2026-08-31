import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";

import { AdminWorkspace } from "@/components/AdminWorkspace";
import { PageHeader } from "@/components/AppShell";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAdminAuditLog, usePeople, useProjects } from "@/hooks/useData";
import { useMe } from "@/hooks/useSession";
import { hasCapability, ROLE_LABEL, type AppRole } from "@/lib/roles";

export const Route = createFileRoute("/_authenticated/admin-audit")({
  head: () => ({
    meta: [
      { title: "Audit log — Ren Report" },
      {
        name: "description",
        content: "Review report actions and role or capability changes.",
      },
      { property: "og:title", content: "Audit log — Ren Report" },
      { property: "og:description", content: "Mining operations administration audit trail." },
    ],
  }),
  component: AdminAuditPage,
});

const EVENT_LABEL: Record<string, string> = {
  report_created: "Report created",
  report_updated: "Report updated",
  report_deleted: "Report deleted",
  capability_enabled: "Capability enabled",
  capability_disabled: "Capability disabled",
  role_granted: "Role granted",
  role_revoked: "Role revoked",
};

const EVENT_FILTERS = [
  { value: "", label: "All actions" },
  { value: "report_created", label: "Report created" },
  { value: "report_updated", label: "Report updated" },
  { value: "report_deleted", label: "Report deleted" },
  { value: "capability_enabled", label: "Capability enabled" },
  { value: "capability_disabled", label: "Capability disabled" },
  { value: "role_granted", label: "Role granted" },
  { value: "role_revoked", label: "Role revoked" },
] as const;

function AdminAuditPage() {
  const { roles, permissions } = useMe();
  const people = usePeople();
  const projects = useProjects();
  const [eventType, setEventType] = useState("");
  const [actorId, setActorId] = useState("");
  const [search, setSearch] = useState("");
  const allowed = roles.includes("admin") && hasCapability(permissions, "view_audit_log", roles);
  const audit = useAdminAuditLog({ eventType, actorId }, allowed);

  const peopleById = useMemo(
    () => new Map((people.data ?? []).map((person) => [person.id, person])),
    [people.data],
  );
  const projectById = useMemo(
    () => new Map((projects.data ?? []).map((project) => [project.id, project])),
    [projects.data],
  );
  const filteredEntries = useMemo(() => {
    const term = search.trim().toLocaleLowerCase();
    if (!term) return audit.data ?? [];
    return (audit.data ?? []).filter((entry) => {
      const actor = entry.actor_id ? peopleById.get(entry.actor_id) : undefined;
      const target = entry.target_user_id ? peopleById.get(entry.target_user_id) : undefined;
      return [
        entry.summary,
        entry.permission_key,
        entry.role,
        actor?.full_name,
        actor?.email,
        target?.full_name,
        target?.email,
      ].some((value) => value?.toLocaleLowerCase().includes(term));
    });
  }, [audit.data, peopleById, search]);

  if (!allowed) {
    return (
      <div className="logbook-card p-10 text-center">
        <p className="text-sm text-muted-foreground">
          Your account does not have the audit-log capability.
        </p>
      </div>
    );
  }

  const personLabel = (id: string | null) => {
    if (!id) return "System";
    const person = peopleById.get(id);
    return person?.full_name || person?.email || id.slice(0, 8);
  };

  return (
    <AdminWorkspace activeSection="audit" canViewAudit>
      <PageHeader title="Audit log" />

      <div className="logbook-card mb-6 grid gap-4 p-5 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="audit-event">Action</Label>
          <select
            id="audit-event"
            className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm"
            value={eventType}
            onChange={(event) => setEventType(event.target.value)}
          >
            {EVENT_FILTERS.map((filter) => (
              <option key={filter.value || "all"} value={filter.value}>
                {filter.label}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="audit-actor">Actor</Label>
          <select
            id="audit-actor"
            className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm"
            value={actorId}
            onChange={(event) => setActorId(event.target.value)}
          >
            <option value="">Everyone</option>
            {(people.data ?? []).map((person) => (
              <option key={person.id} value={person.id}>
                {person.full_name || person.email}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="audit-search">Search</Label>
          <Input
            id="audit-search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Action, person, role…"
          />
        </div>
      </div>

      <div className="mb-3 flex items-center justify-between gap-3 text-sm">
        <h2 className="font-semibold">Recent actions</h2>
        <span className="text-xs text-muted-foreground">
          {filteredEntries.length} shown · newest first
        </span>
      </div>

      {audit.error ? (
        <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          Database policy rejected the audit request: {audit.error.message}
        </div>
      ) : null}

      <div className="logbook-card divide-y divide-border">
        {filteredEntries.map((entry) => {
          const project = entry.project_id ? projectById.get(entry.project_id) : undefined;
          const target = entry.target_user_id ? personLabel(entry.target_user_id) : undefined;
          return (
            <article key={entry.id} className="px-5 py-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium">
                      {EVENT_LABEL[entry.event_type] ?? entry.event_type}
                    </span>
                    <p className="text-sm font-medium">{entry.summary}</p>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Actor: {personLabel(entry.actor_id)}
                    {target ? ` · Target: ${target}` : ""}
                    {entry.role ? ` · Role: ${ROLE_LABEL[entry.role as AppRole]}` : ""}
                    {entry.permission_key ? ` · Capability: ${entry.permission_key}` : ""}
                    {project ? ` · Project: ${project.name}` : ""}
                  </p>
                </div>
                <time
                  dateTime={entry.created_at}
                  className="shrink-0 text-xs text-muted-foreground"
                >
                  {new Date(entry.created_at).toLocaleString()}
                </time>
              </div>
            </article>
          );
        })}
        {audit.isLoading ? (
          <p className="px-5 py-8 text-center text-sm text-muted-foreground">
            Loading audit actions…
          </p>
        ) : null}
        {!audit.isLoading && filteredEntries.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-muted-foreground">
            No audit actions match these filters.
          </p>
        ) : null}
      </div>
    </AdminWorkspace>
  );
}
