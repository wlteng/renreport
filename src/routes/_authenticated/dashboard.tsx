import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, type ReactNode } from "react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useMyReports, usePeople, useProjects, useVisibleReports } from "@/hooks/useData";
import { useMe } from "@/hooks/useSession";
import { todayForDateInput } from "@/lib/dates";
import { useLanguage } from "@/lib/i18n";
import { REPORT_TYPE_LABEL, WORK_STATUS_LABEL } from "@/lib/roles";

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
  return todayForDateInput(date);
}

function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone: string;
}) {
  const { t } = useLanguage();
  return (
    <div
      className={`logbook-card w-[50vw] max-w-52 shrink-0 snap-start border-transparent p-4 sm:w-auto sm:max-w-none sm:p-5 ${tone}`}
    >
      <p className="logbook-label">{t(label)}</p>
      <p className="mt-2 break-words text-xl font-semibold tracking-tight sm:text-2xl">{value}</p>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{t(hint)}</p> : null}
    </div>
  );
}

function StatRow({ children }: { children: ReactNode }) {
  return (
    <div className="-mr-4 flex snap-x snap-mandatory scroll-pl-4 gap-3 overflow-x-auto pb-2 pr-4 [scrollbar-width:none] sm:mr-0 sm:grid sm:grid-cols-3 sm:overflow-visible sm:pb-0 sm:pr-0 [&::-webkit-scrollbar]:hidden">
      {children}
    </div>
  );
}

function Dashboard() {
  const { user } = useMe();
  const { language, t } = useLanguage();
  const mine = useMyReports(user?.id);
  const people = usePeople();
  const projects = useProjects();
  const week = useVisibleReports({ from: isoDaysAgo(6) });

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
      .filter((report) => report.report_date === todayForDateInput())
      .map((report) => report.user_id),
  );
  const missingToday = (people.data ?? []).filter(
    (person) => person.is_active && !reportedToday.has(person.id),
  ).length;

  return (
    <Tabs defaultValue="mine">
      <TabsList className="grid w-full grid-cols-2">
        <TabsTrigger value="mine">{t("My tasks")}</TabsTrigger>
        <TabsTrigger value="team">{t("Team tasks")}</TabsTrigger>
      </TabsList>
      <TabsContent value="mine" className="mt-4">
        <StatRow>
          <Stat label="Your work logs (7d)" value={String(myWeek.length)} tone="bg-stat-gold" />
          <Stat label="Your hours (7d)" value={myHours.toFixed(1)} tone="bg-stat-teal" />
          <Stat label="Active projects" value={String(activeProjects)} tone="bg-stat-violet" />
        </StatRow>
        <section className="mt-8">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold">{t("Your recent project work")}</h2>
            <Link to="/reports" className="text-xs text-muted-foreground hover:text-foreground">
              {t("View all")}
            </Link>
          </div>
          <div className="logbook-card divide-y divide-border">
            {(mine.data ?? []).slice(0, 6).map((report) => (
              <div key={report.id} className="flex items-start gap-4 px-5 py-4">
                <div className="w-24 shrink-0 text-xs text-muted-foreground">
                  <span className="block">{report.report_date}</span>
                  {report.report_time ? <span>{report.report_time.slice(0, 5)}</span> : null}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{report.title}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {t(REPORT_TYPE_LABEL[report.report_type] ?? report.report_type)}
                    {report.activity_detail ? ` · ${report.activity_detail}` : ""} ·{" "}
                    {t(WORK_STATUS_LABEL[report.work_status] ?? report.work_status)} ·{" "}
                    {Number(report.hours_spent).toFixed(1)}h
                  </p>
                </div>
              </div>
            ))}
            {!mine.isLoading && (mine.data ?? []).length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-muted-foreground">
                {t("No work logs yet. Your first submission starts the operations record.")}
              </p>
            ) : null}
          </div>
        </section>
      </TabsContent>
      <TabsContent value="team" className="mt-4">
        <StatRow>
          <Stat
            label="Staff submissions (7d)"
            value={String(week.data?.length ?? 0)}
            tone="bg-stat-gold"
          />
          <Stat label="Reported hours (7d)" value={teamHours.toFixed(1)} tone="bg-stat-teal" />
          <Stat
            label="Not reported today"
            value={String(missingToday)}
            tone="bg-stat-copper"
            hint={
              language === "zh"
                ? `${(people.data ?? []).filter((person) => person.is_active).length} 名在职员工`
                : `${(people.data ?? []).filter((person) => person.is_active).length} active staff`
            }
          />
        </StatRow>
      </TabsContent>
    </Tabs>
  );
}
