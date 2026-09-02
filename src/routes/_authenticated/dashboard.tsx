import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { PenLine, Pencil, Trash2 } from "lucide-react";
import { useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  useMyReports,
  usePeople,
  useProjects,
  useVisibleReports,
  type ReportRow,
} from "@/hooks/useData";
import { useMe } from "@/hooks/useSession";
import { todayForDateInput } from "@/lib/dates";
import { deleteRecord } from "@/lib/deleteRecord";
import { useLanguage, type AppLanguage } from "@/lib/i18n";
import { isWithinEditWindow } from "@/lib/reportEdits";
import { reportImageUrl } from "@/lib/reportImages";
import { hasCapability, REPORT_TYPE_LABEL, SHIFT_LABEL, WORK_STATUS_LABEL } from "@/lib/roles";
import { cn } from "@/lib/utils";

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

/** Badge tones per work status, drawn from the logbook stat palette. */
const STATUS_TONE: Record<string, string> = {
  completed: "border-transparent bg-stat-teal text-secondary-foreground",
  in_progress: "border-transparent bg-stat-gold text-foreground",
  blocked: "border-transparent bg-stat-copper text-accent-foreground",
};

function isoDaysAgo(days: number) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return todayForDateInput(date);
}

/** Drops work logs that a later correction has replaced, keeping only the latest version. */
function currentReports<T extends Pick<ReportRow, "id" | "supersedes_report_id">>(reports: T[]) {
  const superseded = new Set(
    reports.map((report) => report.supersedes_report_id).filter((id): id is string => !!id),
  );
  return reports.filter((report) => !superseded.has(report.id));
}

/** Earlier versions of a work log, newest first. */
function historyOf(report: ReportRow, all: ReportRow[]) {
  const byId = new Map(all.map((item) => [item.id, item]));
  const history: ReportRow[] = [];
  let cursor: ReportRow | undefined = report;
  while (cursor?.supersedes_report_id) {
    const previous = byId.get(cursor.supersedes_report_id);
    if (!previous || history.includes(previous)) break;
    history.push(previous);
    cursor = previous;
  }
  return history;
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

function reportMeta(report: ReportRow, projectName: string, t: (text: string) => string) {
  return [
    t(REPORT_TYPE_LABEL[report.report_type] ?? report.report_type) +
      (report.activity_detail ? ` · ${report.activity_detail}` : ""),
    projectName,
    t(SHIFT_LABEL[report.shift] ?? report.shift),
    `${Number(report.hours_spent).toFixed(1)}h`,
  ].join(" · ");
}

function reportStamp(report: ReportRow) {
  return `${report.report_date}${report.report_time ? ` ${report.report_time.slice(0, 5)}` : ""}`;
}

function WorkLogRow({
  report,
  projectName,
  onOpen,
}: {
  report: ReportRow;
  projectName: string;
  onOpen: () => void;
}) {
  const { t } = useLanguage();
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none sm:px-5 sm:py-4"
    >
      <span className="w-11 shrink-0 pt-0.5 text-xs font-semibold tabular-nums text-primary">
        {report.report_time ? report.report_time.slice(0, 5) : "—"}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-start justify-between gap-2">
          <span className="min-w-0 truncate text-sm font-medium text-foreground">
            {report.title}
          </span>
          <span className="flex shrink-0 gap-1.5">
            {report.supersedes_report_id ? (
              <Badge variant="outline">{t("Correction")}</Badge>
            ) : null}
            <Badge className={STATUS_TONE[report.work_status]}>
              {t(WORK_STATUS_LABEL[report.work_status] ?? report.work_status)}
            </Badge>
          </span>
        </span>
        <span className="mt-0.5 block truncate text-xs text-muted-foreground">
          {reportMeta(report, projectName, t)}
        </span>
        <span className="mt-1.5 line-clamp-2 block text-xs leading-relaxed text-muted-foreground">
          {report.content}
        </span>
      </span>
    </button>
  );
}

function ReportBadges({ report }: { report: ReportRow }) {
  const { t } = useLanguage();
  return (
    <div className="flex flex-wrap gap-2">
      <Badge className={STATUS_TONE[report.work_status]}>
        {t(WORK_STATUS_LABEL[report.work_status] ?? report.work_status)}
      </Badge>
      <Badge variant="outline">
        {t(REPORT_TYPE_LABEL[report.report_type] ?? report.report_type)}
        {report.activity_detail ? ` · ${report.activity_detail}` : ""}
      </Badge>
      <Badge variant="outline">{t(SHIFT_LABEL[report.shift] ?? report.shift)}</Badge>
      <Badge variant="outline">{Number(report.hours_spent).toFixed(1)}h</Badge>
    </div>
  );
}

function ReportBody({ report, compact = false }: { report: ReportRow; compact?: boolean }) {
  const { t } = useLanguage();
  const text = compact ? "text-xs" : "text-sm";
  return (
    <div className="space-y-3">
      <p className={cn("whitespace-pre-wrap leading-relaxed text-foreground/90", text)}>
        {report.content}
      </p>
      {report.output_quantity !== null ? (
        <p className="text-xs font-medium">
          {t("Output")}: {Number(report.output_quantity).toLocaleString()} {report.output_unit}
        </p>
      ) : null}
      {report.blockers ? (
        <p className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
          {t("Blocker")}: {report.blockers}
        </p>
      ) : null}
      {report.links ? (
        <p className="break-all text-xs text-muted-foreground">{report.links}</p>
      ) : null}
      {report.image_urls?.length ? (
        <div
          className={cn(
            "grid gap-2",
            compact ? "grid-cols-4 sm:grid-cols-6" : "grid-cols-3 sm:grid-cols-4",
          )}
        >
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
  );
}

function CorrectionLink({ reportId }: { reportId: string }) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [touchReady, setTouchReady] = useState(false);
  const pointerType = useRef<string | null>(null);
  const explanation = t(
    "More than 1 hour has passed, so this log can no longer be edited or deleted. Submit a correction instead.",
  );

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
              {t("Submit correction")}
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

function WorkLogDialog({
  report,
  history,
  projectName,
  canSubmitWork,
  deleting,
  onClose,
  onDelete,
}: {
  report: ReportRow | null;
  history: ReportRow[];
  projectName: string;
  canSubmitWork: boolean;
  deleting: boolean;
  onClose: () => void;
  onDelete: (report: ReportRow) => void;
}) {
  const { t } = useLanguage();
  const editable = report ? isWithinEditWindow(report.created_at) : false;
  return (
    <Dialog
      open={report !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        {report ? (
          <>
            <DialogHeader>
              <DialogTitle className="pr-6">{report.title}</DialogTitle>
              <DialogDescription>
                {reportStamp(report)} · {projectName}
                {history.length ? ` · ${t("Correction")}` : ""}
              </DialogDescription>
            </DialogHeader>
            <ReportBadges report={report} />
            <ReportBody report={report} />
            {history.length ? (
              <section className="space-y-3 border-t border-border pt-4">
                <h3 className="logbook-label">{t("History")}</h3>
                {history.map((previous) => (
                  <details
                    key={previous.id}
                    className="rounded-lg border border-border bg-muted/40 px-3 py-2"
                  >
                    <summary className="cursor-pointer text-xs">
                      <span className="font-medium text-foreground">{previous.title}</span>
                      <span className="text-muted-foreground">
                        {" "}
                        · {reportStamp(previous)} · {Number(previous.hours_spent).toFixed(1)}h ·{" "}
                        {t("Superseded")}
                      </span>
                    </summary>
                    <div className="mt-2">
                      <ReportBody report={previous} compact />
                    </div>
                  </details>
                ))}
              </section>
            ) : null}
            {canSubmitWork ? (
              <p className="text-xs text-muted-foreground">
                {editable
                  ? t("Editable for 1 hour after submission.")
                  : t(
                      "More than 1 hour has passed, so this log can no longer be edited or deleted. Submit a correction instead.",
                    )}
              </p>
            ) : null}
            <DialogFooter className="sm:justify-between">
              {canSubmitWork ? (
                <div className="flex flex-wrap gap-2">
                  {editable ? (
                    <>
                      <Button type="button" variant="outline" asChild>
                        <Link to="/reports/new" search={{ edit: report.id }}>
                          <Pencil />
                          {t("Edit")}
                        </Link>
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className="text-destructive hover:text-destructive"
                        disabled={deleting}
                        onClick={() => onDelete(report)}
                      >
                        <Trash2 />
                        {t("Delete")}
                      </Button>
                    </>
                  ) : (
                    <CorrectionLink reportId={report.id} />
                  )}
                </div>
              ) : (
                <span />
              )}
              <DialogClose asChild>
                <Button type="button">{t("Close")}</Button>
              </DialogClose>
            </DialogFooter>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function MyWorkSection({
  reports,
  canSubmitWork,
}: {
  reports: ReturnType<typeof useMyReports>;
  canSubmitWork: boolean;
}) {
  const { language, t } = useLanguage();
  const projects = useProjects();
  const queryClient = useQueryClient();
  const [visibleCount, setVisibleCount] = useState(RECENT_WORK_PAGE_SIZE);
  const [showExpandOptions, setShowExpandOptions] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

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
        canSubmitWork={canSubmitWork}
        deleting={remove.isPending}
        onClose={() => setSelectedId(null)}
        onDelete={(report) => remove.mutate(report)}
      />
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
