import { createFileRoute } from "@tanstack/react-router";
import { Filter } from "lucide-react";
import { useMemo, useState } from "react";

import { PageHeader } from "@/components/AppShell";
import { ImageLightbox, WorkLogDialog, WorkLogImages } from "@/components/WorkLog";
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
  currentReports,
  historyOf,
  reportMeta,
  reportStamp,
  rowKeyHandler,
  STATUS_TONE,
} from "@/lib/workLogs";

export const Route = createFileRoute("/_authenticated/review")({
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
  person,
  projectName,
  onOpen,
  onOpenImage,
}: {
  report: ReportRow;
  person: PersonRow | undefined;
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
      <Avatar className="mt-0.5 size-9 shrink-0 border border-border">
        <AvatarImage src={person?.avatar_url ?? undefined} alt="" />
        <AvatarFallback className="text-xs font-semibold">
          {personInitials(person?.full_name, person?.email)}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <span className="min-w-0 truncate text-sm font-medium text-foreground">
            {report.title}
          </span>
          <span className="flex shrink-0 items-center gap-1.5">
            {report.supersedes_report_id ? (
              <Badge variant="outline">{t("Correction")}</Badge>
            ) : null}
            <Badge className={STATUS_TONE[report.work_status]}>
              {t(WORK_STATUS_LABEL[report.work_status] ?? report.work_status)}
            </Badge>
          </span>
        </div>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          <span className="font-medium text-foreground/80">{displayName(person, t)}</span> ·{" "}
          {reportStamp(report)} · {reportMeta(report, projectName, t)}
        </p>
        <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
          {report.content}
        </p>
        {report.image_urls?.length ? (
          <div className="mt-2">
            <WorkLogImages images={report.image_urls} compact onOpen={onOpenImage} />
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Review() {
  const { profile, roles, permissions, loading } = useMe();
  const { t } = useLanguage();
  const people = usePeople();
  const projects = useProjects();
  const allowed = !!profile?.is_active && hasCapability(permissions, "view_staff_feed", roles);

  const [filtersOpen, setFiltersOpen] = useState(false);
  const [from, setFrom] = useState(isoDaysAgo(13));
  const [to, setTo] = useState(todayForDateInput);
  const [userId, setUserId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [type, setType] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);

  const reports = useVisibleReports({ from, to, userId, projectId, type });
  const all = useMemo(() => reports.data ?? [], [reports.data]);
  const current = useMemo(() => currentReports(all), [all]);
  const selected = selectedId ? (all.find((report) => report.id === selectedId) ?? null) : null;
  const history = useMemo(() => (selected ? historyOf(selected, all) : []), [selected, all]);

  const personById = (id: string) => (people.data ?? []).find((person) => person.id === id);
  const projectName = (id: string | null) =>
    id ? ((projects.data ?? []).find((p) => p.id === id)?.name ?? "—") : "—";

  const byPerson = useMemo(() => {
    const map = new Map<string, { entries: number; hours: number }>();
    for (const r of current) {
      const cur = map.get(r.user_id) ?? { entries: 0, hours: 0 };
      cur.entries += 1;
      cur.hours += Number(r.hours_spent);
      map.set(r.user_id, cur);
    }
    return [...map.entries()].sort((a, b) => b[1].hours - a[1].hours);
  }, [current]);

  const totalHours = current.reduce((s, r) => s + Number(r.hours_spent), 0);

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
                  setFrom(event.target.value);
                  if (to && event.target.value > to) setTo(event.target.value);
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
                  setTo(event.target.value);
                  if (from && event.target.value < from) setFrom(event.target.value);
                }}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="person">{t("Person")}</Label>
              <select
                id="person"
                className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm"
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
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
                onChange={(e) => setProjectId(e.target.value)}
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
                onChange={(e) => setType(e.target.value)}
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
              onClick={() => {
                setFrom(isoDaysAgo(13));
                setTo(todayForDateInput());
                setUserId("");
                setProjectId("");
                setType("");
              }}
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
          <p className="logbook-label">{t("Hours")}</p>
          <p className="mt-2 text-xl font-semibold sm:text-2xl">{totalHours.toFixed(1)}</p>
        </div>
        <div className="logbook-card min-w-[50%] snap-start border-transparent bg-stat-copper p-4 shadow-none sm:min-w-0 sm:p-5">
          <p className="logbook-label">{t("People reporting")}</p>
          <p className="mt-2 text-xl font-semibold sm:text-2xl">{byPerson.length}</p>
        </div>
      </div>

      {byPerson.length > 0 ? (
        <section className="mb-8">
          <h2 className="mb-3 text-sm font-semibold">{t("By person")}</h2>
          <div className="logbook-card divide-y divide-border">
            {byPerson.map(([id, s]) => {
              const person = personById(id);
              return (
                <div key={id} className="flex items-center gap-3 px-4 py-2.5 text-sm sm:px-5">
                  <Avatar className="size-7 border border-border">
                    <AvatarImage src={person?.avatar_url ?? undefined} alt="" />
                    <AvatarFallback className="text-[10px] font-semibold">
                      {personInitials(person?.full_name, person?.email)}
                    </AvatarFallback>
                  </Avatar>
                  <span className="min-w-0 flex-1 truncate">{displayName(person, t)}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {s.entries} {t("entries")} · {s.hours.toFixed(1)}h
                  </span>
                </div>
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
              person={personById(report.user_id)}
              projectName={projectName(report.project_id)}
              onOpen={() => setSelectedId(report.id)}
              onOpenImage={setLightbox}
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
        onClose={() => setSelectedId(null)}
        onOpenImage={setLightbox}
      />
      <ImageLightbox src={lightbox} onClose={() => setLightbox(null)} />
    </>
  );
}
