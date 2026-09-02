import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  useMyReports,
  usePeople,
  useProjects,
  useVisibleReports,
  type ReportRow,
} from "@/hooks/useData";
import { useMe } from "@/hooks/useSession";
import { supabase } from "@/integrations/supabase/client";
import { todayForDateInput } from "@/lib/dates";
import { useLanguage } from "@/lib/i18n";
import { removeReportImages, reportImageUrl } from "@/lib/reportImages";
import { hasCapability, REPORT_TYPE_LABEL, SHIFT_LABEL, WORK_STATUS_LABEL } from "@/lib/roles";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Home — Ren Report" },
      {
        name: "description",
        content: "Your work logs, team activity and project overview.",
      },
      { property: "og:title", content: "Home — Ren Report" },
      {
        property: "og:description",
        content: "Your work logs, team activity and project overview.",
      },
    ],
  }),
  component: Dashboard,
});

/** How many of the newest work logs are shown before the reader asks for more. */
const RECENT_WORK_PAGE_SIZE = 6;

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

function WorkLogRow({
  report,
  projectName,
  onDelete,
}: {
  report: ReportRow;
  projectName: string;
  onDelete: () => void;
}) {
  const { t } = useLanguage();
  return (
    <article className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-start sm:gap-4">
      <div className="flex shrink-0 gap-2 text-xs text-muted-foreground sm:w-24 sm:flex-col sm:gap-0">
        <span>{report.report_date}</span>
        {report.report_time ? <span>{report.report_time.slice(0, 5)}</span> : null}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-sm font-medium">{report.title}</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {t(REPORT_TYPE_LABEL[report.report_type] ?? report.report_type)}
              {report.activity_detail ? ` · ${report.activity_detail}` : ""} · {projectName} ·{" "}
              {t(WORK_STATUS_LABEL[report.work_status] ?? report.work_status)} ·{" "}
              {t(SHIFT_LABEL[report.shift] ?? report.shift)} ·{" "}
              {Number(report.hours_spent).toFixed(1)}h
            </p>
          </div>
          <button
            type="button"
            onClick={onDelete}
            className="shrink-0 text-muted-foreground transition-colors hover:text-destructive"
            aria-label={t("Delete work log")}
          >
            <Trash2 className="size-4" />
          </button>
        </div>
        <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
          {report.content}
        </p>
        {report.output_quantity !== null ? (
          <p className="mt-2 text-xs font-medium">
            {t("Output")}: {Number(report.output_quantity).toLocaleString()} {report.output_unit}
          </p>
        ) : null}
        {report.blockers ? (
          <p className="mt-3 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
            {t("Blocker")}: {report.blockers}
          </p>
        ) : null}
        {report.links ? (
          <p className="mt-2 break-all text-xs text-muted-foreground">{report.links}</p>
        ) : null}
        {report.image_urls?.length ? (
          <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-5">
            {report.image_urls.map((image) => (
              <a
                key={image}
                href={reportImageUrl(image)}
                target="_blank"
                rel="noreferrer"
                className="aspect-square overflow-hidden rounded-md"
              >
                <img src={reportImageUrl(image)} alt="" className="size-full object-cover" />
              </a>
            ))}
          </div>
        ) : null}
      </div>
    </article>
  );
}

function MyWorkSection({
  reports,
  canSubmitWork,
}: {
  reports: ReturnType<typeof useMyReports>;
  canSubmitWork: boolean;
}) {
  const { t } = useLanguage();
  const projects = useProjects();
  const queryClient = useQueryClient();
  const [visibleCount, setVisibleCount] = useState(RECENT_WORK_PAGE_SIZE);
  const [showExpandOptions, setShowExpandOptions] = useState(false);

  const all = reports.data ?? [];
  const visible = all.slice(0, visibleCount);
  const hasMore = all.length > visibleCount;
  const projectName = (id: string | null) =>
    id ? (projects.data?.find((project) => project.id === id)?.name ?? "—") : "—";

  const remove = useMutation({
    mutationFn: async ({ id, imagePaths }: { id: string; imagePaths: string[] }) => {
      const { error } = await supabase.from("reports").delete().eq("id", id);
      if (error) throw error;
      await removeReportImages(imagePaths);
    },
    onSuccess: () => {
      toast.success(t("Work log deleted"));
      queryClient.invalidateQueries({ queryKey: ["my-reports"] });
      queryClient.invalidateQueries({ queryKey: ["visible-reports"] });
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not delete work log"),
  });

  return (
    <section className="mt-8">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold">{t("Your recent project work")}</h2>
        {canSubmitWork ? (
          <Button asChild size="sm">
            <Link to="/reports/new">{t("Submit work")}</Link>
          </Button>
        ) : null}
      </div>
      <div className="logbook-card divide-y divide-border">
        {visible.map((report) => (
          <WorkLogRow
            key={report.id}
            report={report}
            projectName={projectName(report.project_id)}
            onDelete={() => remove.mutate({ id: report.id, imagePaths: report.image_urls ?? [] })}
          />
        ))}
        {reports.isLoading ? (
          <p className="px-5 py-8 text-center text-sm text-muted-foreground">
            {t("Loading your work…")}
          </p>
        ) : null}
        {!reports.isLoading && all.length === 0 ? (
          <div className="px-5 py-8 text-center">
            <p className="text-sm text-muted-foreground">
              {t("No work logs yet. Your first submission starts the operations record.")}
            </p>
            {canSubmitWork ? (
              <Button asChild className="mt-4">
                <Link to="/reports/new">{t("Submit your first work log")}</Link>
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
      {hasMore ? (
        <div className="mt-3">
          {showExpandOptions ? (
            <div className="grid grid-cols-2 gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => setVisibleCount((count) => count + RECENT_WORK_PAGE_SIZE)}
              >
                {t("Show more")}
              </Button>
              <Button type="button" variant="outline" onClick={() => setVisibleCount(all.length)}>
                {t("Show all")}
              </Button>
            </div>
          ) : (
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => setShowExpandOptions(true)}
            >
              {t("View all")}
            </Button>
          )}
        </div>
      ) : null}
    </section>
  );
}

function Dashboard() {
  const { user, roles, permissions } = useMe();
  const { language, t } = useLanguage();
  const mine = useMyReports(user?.id);
  const people = usePeople();
  const projects = useProjects();
  const week = useVisibleReports({ from: isoDaysAgo(6) });
  const canSubmitWork = hasCapability(permissions, "submit_work", roles);

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
        <MyWorkSection reports={mine} canSubmitWork={canSubmitWork} />
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
