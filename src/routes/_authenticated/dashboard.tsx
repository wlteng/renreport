import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";

import { PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { useMyReports, usePeople, useProjects, useVisibleReports } from "@/hooks/useData";
import { useMe } from "@/hooks/useSession";
import {
  hasCapability,
  highestRole,
  REPORT_TYPE_LABEL,
  ROLE_DESCRIPTION,
  ROLE_LABEL,
  WORK_STATUS_LABEL,
} from "@/lib/roles";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Home — Ren Report" },
      { name: "description", content: "Mining operations work and project overview." },
      { property: "og:title", content: "Home — Ren Report" },
      { property: "og:description", content: "Mining operations work and project overview." },
    ],
  }),
  component: Dashboard,
});

function isoDaysAgo(days: number) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().slice(0, 10);
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="logbook-card p-5">
      <p className="logbook-label">{label}</p>
      <p className="mt-2 text-2xl font-semibold tracking-tight">{value}</p>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function Dashboard() {
  const { user, profile, roles, permissions } = useMe();
  const role = roles.length ? highestRole(roles) : null;
  const mine = useMyReports(user?.id);
  const people = usePeople();
  const projects = useProjects();
  const week = useVisibleReports({ from: isoDaysAgo(6) });
  const canSubmit = !!profile?.is_active && hasCapability(permissions, "submit_work", roles);

  const myWeek = useMemo(
    () => (mine.data ?? []).filter((report) => report.report_date >= isoDaysAgo(6)),
    [mine.data],
  );
  const myHours = myWeek.reduce((sum, report) => sum + Number(report.hours_spent), 0);
  const teamHours = (week.data ?? []).reduce((sum, report) => sum + Number(report.hours_spent), 0);
  const activeProjects = (projects.data ?? []).filter(
    (project) => project.status === "active",
  ).length;
  const reportedToday = new Set(
    (week.data ?? [])
      .filter((report) => report.report_date === new Date().toISOString().slice(0, 10))
      .map((report) => report.user_id),
  );
  const missingToday = (people.data ?? []).filter(
    (person) => person.is_active && !reportedToday.has(person.id),
  ).length;

  return (
    <>
      <PageHeader
        title={`Hello, ${profile?.full_name?.split(" ")[0] || "there"}`}
        subtitle={role ? ROLE_DESCRIPTION[role] : "Waiting for a role to be assigned."}
        action={
          canSubmit ? (
            <Button asChild>
              <Link to="/reports/new">Submit today's work</Link>
            </Button>
          ) : undefined
        }
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Your role" value={role ? ROLE_LABEL[role] : "—"} />
        <Stat label="Your work logs (7d)" value={String(myWeek.length)} />
        <Stat label="Your hours (7d)" value={myHours.toFixed(1)} />
        <Stat label="Active mine projects" value={String(activeProjects)} />
      </div>
      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <Stat label="Staff submissions (7d)" value={String(week.data?.length ?? 0)} />
        <Stat label="Reported hours (7d)" value={teamHours.toFixed(1)} />
        <Stat
          label="Not reported today"
          value={String(missingToday)}
          hint={`${(people.data ?? []).filter((person) => person.is_active).length} active staff`}
        />
      </div>
      <section className="mt-10">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Your recent mine work</h2>
          <Link to="/reports" className="text-xs text-muted-foreground hover:text-foreground">
            View all
          </Link>
        </div>
        <div className="logbook-card divide-y divide-border">
          {(mine.data ?? []).slice(0, 6).map((report) => (
            <div key={report.id} className="flex items-start gap-4 px-5 py-4">
              <div className="w-20 shrink-0 text-xs text-muted-foreground">
                {report.report_date}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{report.title}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {REPORT_TYPE_LABEL[report.report_type]} · {WORK_STATUS_LABEL[report.work_status]}{" "}
                  · {Number(report.hours_spent).toFixed(1)}h
                </p>
              </div>
            </div>
          ))}
          {!mine.isLoading && (mine.data ?? []).length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-muted-foreground">
              No work logs yet. Your first submission starts the operations record.
            </p>
          ) : null}
        </div>
      </section>
    </>
  );
}
