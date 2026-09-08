import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Filter } from "lucide-react";
import { useMemo, useState } from "react";
import { z } from "zod";

import { PageHeader } from "@/components/AppShell";
import {
  MediaLightbox,
  ParticipantAvatars,
  WorkLogDialog,
  WorkLogThumbnail,
  type LightboxGallery,
} from "@/components/WorkLog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  usePeople,
  useProjects,
  useVisibleReports,
  type PersonRow,
  type ReportRow,
} from "@/hooks/useData";
import { useMe } from "@/hooks/useSession";
import { todayForDateInput } from "@/lib/dates";
import { useLanguage } from "@/lib/i18n";
import { personInitials } from "@/lib/people";
import { hasCapability, REPORT_TYPES, WORK_STATUS_LABEL } from "@/lib/roles";
import {
  addDuration,
  creditedDuration,
  durationOf,
  EMPTY_DURATION,
  formatDurationTotal,
  type DurationTotal,
  currentReports,
  historyOf,
  isGroupReport,
  participantsLabel,
  participantsOf,
  reportMeta,
  reportParticipants,
  reportStamp,
  rowKeyHandler,
  STATUS_TONE,
  type WorkLogPerson,
} from "@/lib/workLogs";

// Filters live in the URL so a filtered view can be bookmarked or shared.
const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .optional()
  .catch(undefined);
const reviewSearchSchema = z.object({
  from: isoDate,
  to: isoDate,
  person: z.string().uuid().optional().catch(undefined),
  project: z.string().uuid().optional().catch(undefined),
  type: z.string().max(40).optional().catch(undefined),
});
type ReviewSearch = z.infer<typeof reviewSearchSchema>;

export const Route = createFileRoute("/_authenticated/review")({
  validateSearch: (search: Record<string, unknown>) => reviewSearchSchema.parse(search),
  head: () => ({
    meta: [
      { title: "Staff activity — Ren Report" },
      {
        name: "description",
        content: "Read daily reports across the team, filtered by person, project, type and date.",
      },
      { property: "og:title", content: "Staff activity — Ren Report" },
      { property: "og:description", content: "All-staff project work submission feed." },
    ],
  }),
  component: Review,
});

function isoDaysAgo(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return todayForDateInput(d);
}

function displayName(person: PersonRow | undefined, t: (text: string) => string) {
  return person?.full_name || person?.email || t("Unknown user");
}

function FeedRow({
  report,
  replaces,
  person,
  participants,
  projectName,
  onOpen,
  onOpenMedia,
}: {
  report: ReportRow;
  replaces: ReportRow | undefined;
  person: PersonRow | undefined;
  /** Everyone credited on a team log; undefined for a personal log. */
  participants: WorkLogPerson[] | undefined;
  projectName: string;
  onOpen: () => void;
  onOpenMedia: (gallery: LightboxGallery) => void;
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
      {participants ? (
        <ParticipantAvatars people={participants} className="mt-0.5" />
      ) : (
        <Avatar className="mt-0.5 size-9 shrink-0 border border-border">
          <AvatarImage src={person?.avatar_url ?? undefined} alt="" />
          <AvatarFallback className="text-xs font-semibold">
            {personInitials(person?.full_name, person?.email)}
          </AvatarFallback>
        </Avatar>
      )}
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
          <span className="font-medium text-foreground/80">{displayName(person, t)}</span>
          {participants
            ? ` · ${t("Team")} · ${participantsLabel(participants.length, t)}`
            : ""} · {reportStamp(report)} · {reportMeta(report, projectName, t)}
        </p>
        {replaces ? (
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {t("Replaces")}: {reportStamp(replaces)} · {replaces.title}
          </p>
        ) : null}
        <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
          {report.content}
        </p>
      </div>
      <WorkLogThumbnail
        images={report.image_urls}
        videos={report.video_urls}
        onOpen={onOpenMedia}
      />
    </div>
  );
}

function Review() {
  const { profile, roles, permissions, loading } = useMe();
  const { t } = useLanguage();
  const people = usePeople();
  const projects = useProjects();
  const allowed = !!profile?.is_active && hasCapability(permissions, "view_staff_feed", roles);

  const search = Route.useSearch();
  const navigate = useNavigate();
  const from = search.from ?? isoDaysAgo(13);
  const to = search.to ?? todayForDateInput();
  const userId = search.person ?? "";
  const projectId = search.project ?? "";
  const type = search.type ?? "";
  const setFilters = (patch: Partial<ReviewSearch>) =>
    navigate({ to: "/review", search: { ...search, ...patch }, replace: true });
  const resetFilters = () => navigate({ to: "/review", search: {}, replace: true });

  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<LightboxGallery | null>(null);

  const reports = useVisibleReports({ from, to, userId, projectId, type });
  const all = useMemo(() => reports.data ?? [], [reports.data]);
  const byId = useMemo(() => new Map(all.map((report) => [report.id, report])), [all]);
  const current = useMemo(() => currentReports(all), [all]);
  const selected = selectedId ? (byId.get(selectedId) ?? null) : null;
  const history = useMemo(() => (selected ? historyOf(selected, all) : []), [selected, all]);

  const peopleById = useMemo(
    () => new Map((people.data ?? []).map((person) => [person.id, person])),
    [people.data],
  );
  const personById = (id: string) => peopleById.get(id);
  const projectName = (id: string | null) =>
    id ? ((projects.data ?? []).find((p) => p.id === id)?.name ?? "—") : "—";
  const participantsFor = (report: ReportRow) =>
    isGroupReport(report) ? participantsOf(report, peopleById) : undefined;

  // A team log counts once for every person credited on it.
  const byPerson = useMemo(() => {
    const map = new Map<string, { entries: number; duration: DurationTotal }>();
    for (const r of current) {
      for (const id of reportParticipants(r)) {
        const cur = map.get(id) ?? { entries: 0, duration: EMPTY_DURATION };
        cur.entries += 1;
        cur.duration = addDuration(cur.duration, durationOf(r));
        map.set(id, cur);
      }
    }
    // Days weigh more than hours, so a day counts as a working day of hours.
    const weight = (value: DurationTotal) => value.days * 8 + value.hours;
    return [...map.entries()].sort((a, b) => weight(b[1].duration) - weight(a[1].duration));
  }, [current]);

  const totalTime = current.reduce(
    (total, r) => addDuration(total, creditedDuration(r)),
    EMPTY_DURATION,
  );

  if (loading) {
    return <p className="text-sm text-muted-foreground">{t("Checking staff activity access…")}</p>;
  }

  if (!allowed) {
    return (
      <div className="logbook-card p-10 text-center">
        <p className="text-sm text-muted-foreground">
          {t(
            "Your role does not have the View staff activity capability. An admin can enable it in the capability matrix.",
          )}
        </p>
      </div>
    );
  }

  return (
    <>
      <PageHeader
        title="Staff activity"
        action={
          <Button
            type="button"
            size="icon"
            variant="outline"
            aria-label={t("Filter staff activity")}
            onClick={() => setFiltersOpen(true)}
          >
            <Filter />
          </Button>
        }
      />

      <Dialog open={filtersOpen} onOpenChange={setFiltersOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("Filter staff activity")}</DialogTitle>
            <DialogDescription className="sr-only">
              {t("Filter reports by date, person, project and work type.")}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="from">{t("From")}</Label>
              <Input
                id="from"
                type="date"
                value={from}
                onChange={(event) => {
                  const value = event.target.value;
                  void setFilters({ from: value, ...(to && value > to ? { to: value } : {}) });
                }}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="to">{t("To")}</Label>
              <Input
                id="to"
                type="date"
                value={to}
                onChange={(event) => {
                  const value = event.target.value;
                  void setFilters({ to: value, ...(from && value < from ? { from: value } : {}) });
                }}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="person">{t("Person")}</Label>
              <select
                id="person"
                className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm"
                value={userId}
                onChange={(e) => void setFilters({ person: e.target.value || undefined })}
              >
                <option value="">{t("Everyone")}</option>
                {(people.data ?? []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.full_name || p.email}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="proj">{t("Project")}</Label>
              <select
                id="proj"
                className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm"
                value={projectId}
                onChange={(e) => void setFilters({ project: e.target.value || undefined })}
              >
                <option value="">{t("All projects")}</option>
                {(projects.data ?? []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="wt">{t("Work type")}</Label>
              <select
                id="wt"
                className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm"
                value={type}
                onChange={(e) => void setFilters({ type: e.target.value || undefined })}
              >
                <option value="">{t("All types")}</option>
                {REPORT_TYPES.map((reportType) => (
                  <option key={reportType.value} value={reportType.value}>
                    {t(reportType.label)}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              className="flex-1 sm:flex-none"
              onClick={() => void resetFilters()}
            >
              {t("Reset")}
            </Button>
            <DialogClose asChild>
              <Button type="button" className="flex-1 sm:flex-none">
                {t("Done")}
              </Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="-mr-4 mb-6 flex snap-x snap-mandatory scroll-pl-4 gap-3 overflow-x-auto pb-2 pr-4 [scrollbar-width:none] sm:mr-0 sm:grid sm:grid-cols-3 sm:overflow-visible sm:pb-0 sm:pr-0 [&::-webkit-scrollbar]:hidden">
        <div className="logbook-card min-w-[50%] snap-start border-transparent bg-stat-gold p-4 shadow-none sm:min-w-0 sm:p-5">
          <p className="logbook-label">{t("Entries")}</p>
          <p className="mt-2 text-xl font-semibold sm:text-2xl">{current.length}</p>
        </div>
        <div className="logbook-card min-w-[50%] snap-start border-transparent bg-stat-teal p-4 shadow-none sm:min-w-0 sm:p-5">
          <p className="logbook-label">{t("Time")}</p>
          <p className="mt-2 text-xl font-semibold sm:text-2xl">{formatDurationTotal(totalTime)}</p>
        </div>
        <div className="logbook-card min-w-[50%] snap-start border-transparent bg-stat-copper p-4 shadow-none sm:min-w-0 sm:p-5">
          <p className="logbook-label">{t("People reporting")}</p>
          <p className="mt-2 text-xl font-semibold sm:text-2xl">{byPerson.length}</p>
        </div>
      </div>

      {byPerson.length > 0 ? (
        <section className="mb-8">
          <h2 className="mb-3 text-sm font-semibold">{t("By person")}</h2>
          {/* A horizontal slider: one person keeps a card's width instead of
              stretching across the page. */}
          <div className="-mr-4 flex snap-x snap-mandatory scroll-pl-4 gap-3 overflow-x-auto pb-2 pr-4 [scrollbar-width:none] sm:mr-0 sm:pr-0 [&::-webkit-scrollbar]:hidden">
            {byPerson.map(([id, s]) => {
              const person = personById(id);
              return (
                <article
                  key={id}
                  className="logbook-card flex w-48 shrink-0 snap-start items-center gap-3 p-3 sm:w-56 sm:p-4"
                >
                  <Avatar className="size-10 border border-border">
                    <AvatarImage src={person?.avatar_url ?? undefined} alt="" />
                    <AvatarFallback className="text-xs font-semibold">
                      {personInitials(person?.full_name, person?.email)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{displayName(person, t)}</p>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {s.entries} {t("entries")} · {formatDurationTotal(s.duration)}
                    </p>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      ) : null}

      {reports.isLoading ? (
        <p className="mb-4 text-sm text-muted-foreground">{t("Loading staff activity…")}</p>
      ) : null}

      <section>
        <h2 className="mb-3 text-sm font-semibold">{t("Entries")}</h2>
        <div className="logbook-card divide-y divide-border">
          {current.map((report) => (
            <FeedRow
              key={report.id}
              report={report}
              replaces={
                report.supersedes_report_id ? byId.get(report.supersedes_report_id) : undefined
              }
              person={personById(report.user_id)}
              participants={participantsFor(report)}
              projectName={projectName(report.project_id)}
              onOpen={() => setSelectedId(report.id)}
              onOpenMedia={setLightbox}
            />
          ))}
          {!reports.isLoading && current.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-muted-foreground">
              {t("No reports match these filters.")}
            </p>
          ) : null}
        </div>
      </section>

      <WorkLogDialog
        report={selected}
        history={history}
        projectName={projectName(selected?.project_id ?? null)}
        personName={selected ? displayName(personById(selected.user_id), t) : undefined}
        participants={selected ? participantsFor(selected) : undefined}
        showCloseAction={false}
        onClose={() => setSelectedId(null)}
        onOpenMedia={setLightbox}
      />
      <MediaLightbox gallery={lightbox} onClose={() => setLightbox(null)} />
    </>
  );
}
