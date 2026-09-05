import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { PenLine, Pencil, Trash2 } from "lucide-react";
import { useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";

import { ImageLightbox, WorkLogDialog, WorkLogThumbnail } from "@/components/WorkLog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  useMyReports,
  usePeople,
  useProjectMembers,
  useProjects,
  useVisibleReports,
  type ReportRow,
} from "@/hooks/useData";
import { useMe } from "@/hooks/useSession";
import { todayForDateInput } from "@/lib/dates";
import { deleteRecord } from "@/lib/deleteRecord";
import { useLanguage, type AppLanguage } from "@/lib/i18n";
import { isProjectWorkEnabled } from "@/lib/projects";
import { isWithinEditWindow } from "@/lib/reportEdits";
import { hasCapability, WORK_STATUS_LABEL } from "@/lib/roles";
import { currentReports, historyOf, reportMeta, rowKeyHandler, STATUS_TONE } from "@/lib/workLogs";

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

function dayLabel(date: string, language: AppLanguage, t: (text: string) => string) {
  const parts = date.split("-").map(Number);
  const year = parts[0] ?? 0;
  const month = parts[1] ?? 1;
  const day = parts[2] ?? 1;
  const local = new Date(year, month - 1, day);
  const short =
    language === "zh"
      ? `${month}月${day}日`
      : local.toLocaleDateString("en", { month: "short", day: "numeric" });
  if (date === todayForDateInput()) return `${t("Today")} · ${short}`;
  if (date === isoDaysAgo(1)) return `${t("Yesterday")} · ${short}`;
  return language === "zh"
    ? `${year}年${month}月${day}日`
    : local.toLocaleDateString("en", { year: "numeric", month: "short", day: "numeric" });
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
  onOpen,
  onOpenImage,
}: {
  report: ReportRow;
  projectName: string;
  onOpen: () => void;
  onOpenImage: (src: string) => void;
}) {
  const { t } = useLanguage();
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={rowKeyHandler(onOpen)}
      className="flex w-full cursor-pointer items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none sm:px-5 sm:py-4"
    >
      <span className="w-11 shrink-0 pt-0.5 text-xs font-semibold tabular-nums text-primary">
        {report.report_time ? report.report_time.slice(0, 5) : "—"}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="min-w-0 truncate text-sm font-medium text-foreground">
            {report.title}
          </span>
          <span className="flex shrink-0 items-center gap-1.5">
            <Badge className={STATUS_TONE[report.work_status]}>
              {t(WORK_STATUS_LABEL[report.work_status] ?? report.work_status)}
            </Badge>
            {report.supersedes_report_id ? (
              <Badge variant="outline">{t("Correction")}</Badge>
            ) : null}
          </span>
        </div>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          {reportMeta(report, projectName, t)}
        </p>
        <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
          {report.content}
        </p>
      </div>
      <WorkLogThumbnail images={report.image_urls} onOpen={onOpenImage} />
    </div>
  );
}

/** Correction button that explains the locked edit window; on touch screens the first tap shows the note. */
function CorrectionLink({ reportId, disabled }: { reportId: string; disabled: boolean }) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [touchReady, setTouchReady] = useState(false);
  const pointerType = useRef<string | null>(null);
  const explanation = t(
    "This original log is locked after 1 hour. Open a prefilled form to create a corrected version; the original stays unchanged in history.",
  );
  const unavailable = t(
    "This project must be active and assigned to you before you can create a corrected version.",
  );

  if (disabled) {
    return (
      <TooltipProvider delayDuration={200}>
        <Tooltip>
          <TooltipTrigger asChild>
            <span tabIndex={0} role="button" aria-disabled="true" aria-label={unavailable}>
              <Button type="button" variant="outline" disabled>
                <PenLine />
                {t("Create corrected version")}
              </Button>
            </span>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-72 text-pretty px-3 py-2 leading-relaxed">
            {unavailable}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip
        open={open}
        onOpenChange={(nextOpen) => {
          setOpen(nextOpen);
          if (!nextOpen) setTouchReady(false);
        }}
      >
        <TooltipTrigger asChild>
          <Button type="button" variant="outline" asChild>
            <Link
              to="/reports/new"
              search={{ correct: reportId }}
              onPointerDown={(event) => {
                pointerType.current = event.pointerType;
              }}
              onKeyDown={() => {
                pointerType.current = "keyboard";
              }}
              onClick={(event) => {
                if (pointerType.current === "touch" && !touchReady) {
                  event.preventDefault();
                  setTouchReady(true);
                  setOpen(true);
                }
              }}
            >
              <PenLine />
              {t("Create corrected version")}
            </Link>
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-72 text-pretty px-3 py-2 leading-relaxed">
          {explanation}
          <span className="mt-1 hidden font-medium [@media(pointer:coarse)]:block">
            {t("Tap again on mobile to continue.")}
          </span>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function MyWorkSection({
  reports,
  canSubmitWork,
  assignedActiveProjectIds,
}: {
  reports: ReturnType<typeof useMyReports>;
  canSubmitWork: boolean;
  assignedActiveProjectIds: ReadonlySet<string>;
}) {
  const { language, t } = useLanguage();
  const projects = useProjects();
  const queryClient = useQueryClient();
  const [visibleCount, setVisibleCount] = useState(RECENT_WORK_PAGE_SIZE);
  const [showExpandOptions, setShowExpandOptions] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);

  const all = useMemo(() => reports.data ?? [], [reports.data]);
  const current = useMemo(() => currentReports(all), [all]);
  const hasMore = current.length > visibleCount;
  const days = useMemo(() => {
    const grouped = new Map<string, ReportRow[]>();
    for (const report of current.slice(0, visibleCount)) {
      const list = grouped.get(report.report_date) ?? [];
      list.push(report);
      grouped.set(report.report_date, list);
    }
    return [...grouped.entries()].map(([date, items]) => ({
      date,
      items,
      hours: current
        .filter((report) => report.report_date === date)
        .reduce((sum, report) => sum + Number(report.hours_spent), 0),
    }));
  }, [current, visibleCount]);
  const selected = selectedId ? (all.find((report) => report.id === selectedId) ?? null) : null;
  const history = useMemo(() => (selected ? historyOf(selected, all) : []), [selected, all]);
  const editable = selected ? isWithinEditWindow(selected.created_at) : false;
  const projectName = (id: string | null) =>
    id ? (projects.data?.find((project) => project.id === id)?.name ?? "—") : "—";

  const remove = useMutation({
    // The edge function deletes the row and every photo stored for it.
    mutationFn: (report: ReportRow) => deleteRecord("report", report.id),
    onSuccess: () => {
      toast.success(t("Work log deleted"));
      setSelectedId(null);
      queryClient.invalidateQueries({ queryKey: ["my-reports"] });
      queryClient.invalidateQueries({ queryKey: ["visible-reports"] });
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : t("Could not delete work log")),
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
      <div className="space-y-4">
        {days.map((day) => (
          <div key={day.date} className="logbook-card overflow-hidden">
            <div className="flex items-center justify-between gap-3 bg-secondary px-4 py-2.5 sm:px-5">
              <h3 className="text-xs font-semibold uppercase tracking-[0.08em] text-secondary-foreground">
                {dayLabel(day.date, language, t)}
              </h3>
              <span className="rounded-full bg-card/80 px-2.5 py-0.5 text-xs font-semibold tabular-nums text-secondary-foreground">
                {day.hours.toFixed(1)}h
              </span>
            </div>
            <div className="divide-y divide-border">
              {day.items.map((report) => (
                <WorkLogRow
                  key={report.id}
                  report={report}
                  projectName={projectName(report.project_id)}
                  onOpen={() => setSelectedId(report.id)}
                  onOpenImage={setLightbox}
                />
              ))}
            </div>
          </div>
        ))}
        {reports.isLoading ? (
          <p className="logbook-card px-5 py-8 text-center text-sm text-muted-foreground">
            {t("Loading your work…")}
          </p>
        ) : null}
        {!reports.isLoading && current.length === 0 ? (
          <div className="logbook-card px-5 py-8 text-center">
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
              <Button
                type="button"
                variant="outline"
                onClick={() => setVisibleCount(current.length)}
              >
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
      <WorkLogDialog
        report={selected}
        history={history}
        projectName={projectName(selected?.project_id ?? null)}
        onClose={() => setSelectedId(null)}
        onOpenImage={setLightbox}
        notice={
          canSubmitWork ? (
            <p className="text-xs text-muted-foreground">
              {editable
                ? t("Editable for 1 hour after submission.")
                : t(
                    "More than 1 hour has passed, so this log can no longer be edited or deleted. Submit a correction instead.",
                  )}
            </p>
          ) : null
        }
        actions={
          canSubmitWork && selected ? (
            <div className="flex flex-wrap gap-2">
              {editable ? (
                <>
                  <Button type="button" variant="outline" asChild>
                    <Link to="/reports/new" search={{ edit: selected.id }}>
                      <Pencil />
                      {t("Edit")}
                    </Link>
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="text-destructive hover:text-destructive"
                    disabled={remove.isPending}
                    onClick={() => remove.mutate(selected)}
                  >
                    <Trash2 />
                    {t("Delete")}
                  </Button>
                </>
              ) : (
                <CorrectionLink
                  reportId={selected.id}
                  disabled={
                    !selected.project_id || !assignedActiveProjectIds.has(selected.project_id)
                  }
                />
              )}
            </div>
          ) : null
        }
      />
      <ImageLightbox src={lightbox} onClose={() => setLightbox(null)} />
    </section>
  );
}

function Dashboard() {
  const { user, roles, permissions } = useMe();
  const { language, t } = useLanguage();
  const mine = useMyReports(user?.id);
  const people = usePeople();
  const projects = useProjects();
  const projectMembers = useProjectMembers();
  const week = useVisibleReports({ from: isoDaysAgo(6) });
  const canSubmitWork = hasCapability(permissions, "submit_work", roles);
  const assignedActiveProjectIds = useMemo(() => {
    const activeProjectIds = new Set(
      (projects.data ?? [])
        .filter((project) => isProjectWorkEnabled(project.status))
        .map((project) => project.id),
    );
    return new Set(
      (projectMembers.data ?? [])
        .filter((member) => member.user_id === user?.id && activeProjectIds.has(member.project_id))
        .map((member) => member.project_id),
    );
  }, [projectMembers.data, projects.data, user?.id]);

  const myWeek = useMemo(
    () => currentReports(mine.data ?? []).filter((report) => report.report_date >= isoDaysAgo(6)),
    [mine.data],
  );
  const teamWeek = useMemo(() => currentReports(week.data ?? []), [week.data]);
  const myHours = myWeek.reduce((sum, report) => sum + Number(report.hours_spent), 0);
  const teamHours = teamWeek.reduce((sum, report) => sum + Number(report.hours_spent), 0);
  const activeProjects = (projects.data ?? []).filter(
    (project) => project.status === "active",
  ).length;
  const reportedToday = new Set(
    teamWeek
      .filter((report) => report.report_date === todayForDateInput())
      .map((report) => report.user_id),
  );
  const missingToday = (people.data ?? []).filter(
    (person) => person.is_active && !reportedToday.has(person.id),
  ).length;

  return (
    <Tabs defaultValue="mine">
      <TabsList className="grid h-9 w-full grid-cols-2 p-0">
        <TabsTrigger value="mine" className="h-9">
          {t("My tasks")}
        </TabsTrigger>
        <TabsTrigger value="team" className="h-9">
          {t("Team tasks")}
        </TabsTrigger>
      </TabsList>
      <TabsContent value="mine" className="mt-4">
        <StatRow>
          <Stat label="Your work logs (7d)" value={String(myWeek.length)} tone="bg-stat-gold" />
          <Stat label="Your hours (7d)" value={myHours.toFixed(1)} tone="bg-stat-teal" />
          <Stat label="Active projects" value={String(activeProjects)} tone="bg-stat-violet" />
        </StatRow>
        <MyWorkSection
          reports={mine}
          canSubmitWork={canSubmitWork}
          assignedActiveProjectIds={assignedActiveProjectIds}
        />
      </TabsContent>
      <TabsContent value="team" className="mt-4">
        <StatRow>
          <Stat
            label="Staff submissions (7d)"
            value={String(teamWeek.length)}
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
