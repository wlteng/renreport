import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";

import { PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { useMe } from "@/hooks/useSession";
import { useMyReports, usePeople, useProjects, useVisibleReports } from "@/hooks/useData";
import { can, highestRole, ROLE_DESCRIPTION, ROLE_LABEL, REPORT_TYPE_LABEL } from "@/lib/roles";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Home — JJ Report" },
      { name: "description", content: "Your reporting overview for the week." },
      { property: "og:title", content: "Home — JJ Report" },
      { property: "og:description", content: "Your reporting overview for the week." },
    ],
  }),
  component: Dashboard,
});

function isoDaysAgo(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
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
  const { user, profile, roles } = useMe();
  const role = roles.length ? highestRole(roles) : null;
  const mine = useMyReports(user?.id);
  const people = usePeople();
  const projects = useProjects();
  const week = useVisibleReports({ from: isoDaysAgo(6) });

  const myWeek = useMemo(
    () => (mine.data ?? []).filter((r) => r.report_date >= isoDaysAgo(6)),
    [mine.data],
  );
  const myHours = myWeek.reduce((s, r) => s + Number(r.hours_spent), 0);
  const oversight = role ? can.viewTeamReports(roles) : false;
  const teamHours = (week.data ?? []).reduce((s, r) => s + Number(r.hours_spent), 0);
  const reportedToday = new Set(
    (week.data ?? [])
      .filter((r) => r.report_date === new Date().toISOString().slice(0, 10))
      .map((r) => r.user_id),
  );
  const missingToday = (people.data ?? []).filter(
    (p) => p.is_active && !reportedToday.has(p.id),
  ).length;

  return (
    <>
      <PageHeader
        title={`Hello, ${profile?.full_name?.split(" ")[0] || "there"}`}
        subtitle={role ? ROLE_DESCRIPTION[role] : "Waiting for a role to be assigned."}
        action={
          <Button asChild>
            <Link to="/reports/new">Write today's report</Link>
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Your role" value={role ? ROLE_LABEL[role] : "—"} />
        <Stat label="Your entries (7d)" value={String(myWeek.length)} />
        <Stat label="Your hours (7d)" value={myHours.toFixed(1)} />
        {oversight ? (
          <Stat
            label="Not reported today"
            value={String(missingToday)}
            hint={`${people.data?.length ?? 0} people on record`}
          />
        ) : (
          <Stat label="Projects" value={String(projects.data?.length ?? 0)} />
        )}
      </div>

      {oversight ? (
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <Stat label="Team entries (7d)" value={String(week.data?.length ?? 0)} />
          <Stat label="Team hours (7d)" value={teamHours.toFixed(1)} />
          <Stat label="Active projects" value={String(projects.data?.length ?? 0)} />
        </div>
      ) : null}

      <section className="mt-10">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Your recent entries</h2>
          <Link to="/reports" className="text-xs text-muted-foreground hover:text-foreground">
            View all
          </Link>
        </div>
        <div className="logbook-card divide-y divide-border">
          {(mine.data ?? []).slice(0, 6).map((r) => (
            <div key={r.id} className="flex items-start gap-4 px-5 py-4">
              <div className="w-20 shrink-0 text-xs text-muted-foreground">{r.report_date}</div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{r.title}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {REPORT_TYPE_LABEL[r.report_type]} · {Number(r.hours_spent).toFixed(1)}h
                </p>
              </div>
            </div>
          ))}
          {!mine.isLoading && (mine.data ?? []).length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-muted-foreground">
              No entries yet. Your first report starts the log.
            </p>
          ) : null}
        </div>
      </section>
    </>
  );
}
