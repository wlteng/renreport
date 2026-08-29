import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";

import { PageHeader } from "@/components/AppShell";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useMe } from "@/hooks/useSession";
import { usePeople, useProjects, useVisibleReports } from "@/hooks/useData";
import { can, REPORT_TYPES, REPORT_TYPE_LABEL } from "@/lib/roles";

export const Route = createFileRoute("/_authenticated/review")({
  head: () => ({
    meta: [
      { title: "Review — JJ Report" },
      {
        name: "description",
        content: "Read daily reports across the team, filtered by person, project, type and date.",
      },
      { property: "og:title", content: "Review — JJ Report" },
      { property: "og:description", content: "Read-only oversight of daily work reports." },
    ],
  }),
  component: Review,
});

function isoDaysAgo(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

function Review() {
  const { roles } = useMe();
  const people = usePeople();
  const projects = useProjects();

  const [from, setFrom] = useState(isoDaysAgo(13));
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));
  const [userId, setUserId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [type, setType] = useState("");

  const reports = useVisibleReports({ from, to, userId, projectId, type });

  const personName = (id: string) => {
    const p = (people.data ?? []).find((x) => x.id === id);
    return p?.full_name || p?.email || "Unknown";
  };
  const projectName = (id: string | null) =>
    id ? ((projects.data ?? []).find((p) => p.id === id)?.name ?? "—") : "—";

  const byPerson = useMemo(() => {
    const map = new Map<string, { entries: number; hours: number }>();
    for (const r of reports.data ?? []) {
      const cur = map.get(r.user_id) ?? { entries: 0, hours: 0 };
      cur.entries += 1;
      cur.hours += Number(r.hours_spent);
      map.set(r.user_id, cur);
    }
    return [...map.entries()].sort((a, b) => b[1].hours - a[1].hours);
  }, [reports.data]);

  const totalHours = (reports.data ?? []).reduce((s, r) => s + Number(r.hours_spent), 0);

  if (!can.viewTeamReports(roles)) {
    return (
      <div className="logbook-card p-10 text-center">
        <p className="text-sm text-muted-foreground">
          You don't have permission to review other people's reports.
        </p>
      </div>
    );
  }

  return (
    <>
      <PageHeader
        title="Review"
        subtitle={
          can.viewAllReports(roles)
            ? "Read-only view of every report in the company."
            : "Read-only view of reports from your department."
        }
      />

      <div className="logbook-card mb-6 grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-5">
        <div className="space-y-1.5">
          <Label htmlFor="from">From</Label>
          <Input id="from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="to">To</Label>
          <Input id="to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="person">Person</Label>
          <select
            id="person"
            className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
          >
            <option value="">Everyone</option>
            {(people.data ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.full_name || p.email}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="proj">Project</Label>
          <select
            id="proj"
            className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm"
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
          >
            <option value="">All projects</option>
            {(projects.data ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="wt">Work type</Label>
          <select
            id="wt"
            className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm"
            value={type}
            onChange={(e) => setType(e.target.value)}
          >
            <option value="">All types</option>
            {REPORT_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <div className="logbook-card p-5">
          <p className="logbook-label">Entries</p>
          <p className="mt-2 text-2xl font-semibold">{reports.data?.length ?? 0}</p>
        </div>
        <div className="logbook-card p-5">
          <p className="logbook-label">Hours</p>
          <p className="mt-2 text-2xl font-semibold">{totalHours.toFixed(1)}</p>
        </div>
        <div className="logbook-card p-5">
          <p className="logbook-label">People reporting</p>
          <p className="mt-2 text-2xl font-semibold">{byPerson.length}</p>
        </div>
      </div>

      {byPerson.length > 0 ? (
        <section className="mb-8">
          <h2 className="mb-3 text-sm font-semibold">By person</h2>
          <div className="logbook-card divide-y divide-border">
            {byPerson.map(([id, s]) => (
              <div key={id} className="flex items-center justify-between px-5 py-3 text-sm">
                <span>{personName(id)}</span>
                <span className="text-muted-foreground">
                  {s.entries} entries · {s.hours.toFixed(1)}h
                </span>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section>
        <h2 className="mb-3 text-sm font-semibold">Entries</h2>
        <div className="logbook-card divide-y divide-border">
          {(reports.data ?? []).map((r) => (
            <article key={r.id} className="px-5 py-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-sm font-medium">{r.title}</h3>
                <span className="text-xs text-muted-foreground">{r.report_date}</span>
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {personName(r.user_id)} · {REPORT_TYPE_LABEL[r.report_type]} ·{" "}
                {projectName(r.project_id)} · {Number(r.hours_spent).toFixed(1)}h
              </p>
              <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
                {r.content}
              </p>
              {r.blockers ? (
                <p className="mt-3 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
                  Blocker: {r.blockers}
                </p>
              ) : null}
            </article>
          ))}
          {!reports.isLoading && (reports.data ?? []).length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-muted-foreground">
              No reports match these filters.
            </p>
          ) : null}
        </div>
      </section>
    </>
  );
}
