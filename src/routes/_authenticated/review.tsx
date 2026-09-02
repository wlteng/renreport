import { createFileRoute } from "@tanstack/react-router";
import { Filter } from "lucide-react";
import { useMemo, useState } from "react";

import { PageHeader } from "@/components/AppShell";
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
import { usePeople, useProjects, useVisibleReports } from "@/hooks/useData";
import { useMe } from "@/hooks/useSession";
import { todayForDateInput } from "@/lib/dates";
import { useLanguage } from "@/lib/i18n";
import { reportImageUrl } from "@/lib/reportImages";
import {
  hasCapability,
  REPORT_TYPES,
  REPORT_TYPE_LABEL,
  SHIFT_LABEL,
  WORK_STATUS_LABEL,
} from "@/lib/roles";

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

  if (loading) {
    return <p className="text-sm text-muted-foreground">Checking staff activity access…</p>;
  }

  if (!allowed) {
    return (
      <div className="logbook-card p-10 text-center">
        <p className="text-sm text-muted-foreground">
          Your role does not have the View staff activity capability. An admin can enable it in the
          capability matrix.
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
          <p className="mt-2 text-xl font-semibold sm:text-2xl">{reports.data?.length ?? 0}</p>
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

      {reports.isLoading ? (
        <p className="mb-4 text-sm text-muted-foreground">Loading staff activity…</p>
      ) : null}

      <section>
        <h2 className="mb-3 text-sm font-semibold">Entries</h2>
        <div className="logbook-card divide-y divide-border">
          {(reports.data ?? []).map((r) => (
            <article key={r.id} className="px-5 py-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-sm font-medium">{r.title}</h3>
                <span className="text-xs text-muted-foreground">
                  {r.report_date}
                  {r.report_time ? ` · ${r.report_time.slice(0, 5)}` : ""}
                </span>
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {personName(r.user_id)} · {REPORT_TYPE_LABEL[r.report_type]}
                {r.activity_detail ? ` · ${r.activity_detail}` : ""} · {projectName(r.project_id)} ·{" "}
                {WORK_STATUS_LABEL[r.work_status]} · {SHIFT_LABEL[r.shift]} ·{" "}
                {Number(r.hours_spent).toFixed(1)}h
              </p>
              <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
                {r.content}
              </p>
              {r.output_quantity !== null ? (
                <p className="mt-2 text-xs font-medium">
                  Output: {Number(r.output_quantity).toLocaleString()} {r.output_unit}
                </p>
              ) : null}
              {r.blockers ? (
                <p className="mt-3 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
                  Blocker: {r.blockers}
                </p>
              ) : null}
              {r.image_urls?.length ? (
                <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-5">
                  {r.image_urls.map((image) => (
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
