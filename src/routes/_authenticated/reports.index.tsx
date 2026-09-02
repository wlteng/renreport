import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/hooks/useSession";
import { useMyReports, useProjects } from "@/hooks/useData";
import { useLanguage } from "@/lib/i18n";
import { removeReportImages, reportImageUrl } from "@/lib/reportImages";
import { REPORT_TYPE_LABEL, SHIFT_LABEL, WORK_STATUS_LABEL } from "@/lib/roles";

export const Route = createFileRoute("/_authenticated/reports/")({
  head: () => ({
    meta: [
      { title: "My work — Ren Report" },
      { name: "description", content: "Your submitted project work logs, newest first." },
      { property: "og:title", content: "My work — Ren Report" },
      { property: "og:description", content: "Your personal project work log." },
    ],
  }),
  component: MyWork,
});

function MyWork() {
  const { user } = useMe();
  const { t } = useLanguage();
  const reports = useMyReports(user?.id);
  const projects = useProjects();
  const queryClient = useQueryClient();
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

  const grouped = new Map<string, typeof reports.data>();
  for (const report of reports.data ?? []) {
    const list = grouped.get(report.report_date) ?? [];
    list.push(report);
    grouped.set(report.report_date, list);
  }

  return (
    <>
      <PageHeader
        title="My work"
        action={
          <Button asChild>
            <Link to="/reports/new">{t("Submit work")}</Link>
          </Button>
        }
      />
      {reports.isLoading ? (
        <p className="text-sm text-muted-foreground">{t("Loading your work…")}</p>
      ) : (reports.data ?? []).length === 0 ? (
        <div className="logbook-card p-10 text-center">
          <p className="text-sm text-muted-foreground">
            {t("You have not submitted any work logs.")}
          </p>
          <Button asChild className="mt-4">
            <Link to="/reports/new">{t("Submit your first work log")}</Link>
          </Button>
        </div>
      ) : (
        <div className="space-y-6">
          {[...grouped.entries()].map(([date, items]) => (
            <section key={date}>
              <div className="mb-2 flex items-baseline justify-between">
                <h2 className="logbook-label">{date}</h2>
                <span className="text-xs text-muted-foreground">
                  {(items ?? [])
                    .reduce((sum, report) => sum + Number(report.hours_spent), 0)
                    .toFixed(1)}
                  h
                </span>
              </div>
              <div className="logbook-card divide-y divide-border">
                {(items ?? []).map((report) => (
                  <article key={report.id} className="px-5 py-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="text-sm font-medium">{report.title}</h3>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {report.report_time ? `${report.report_time.slice(0, 5)} · ` : ""}
                          {t(REPORT_TYPE_LABEL[report.report_type] ?? report.report_type)}
                          {report.activity_detail ? ` · ${report.activity_detail}` : ""} ·{" "}
                          {projectName(report.project_id)} ·{" "}
                          {t(WORK_STATUS_LABEL[report.work_status] ?? report.work_status)} ·{" "}
                          {t(SHIFT_LABEL[report.shift] ?? report.shift)} ·{" "}
                          {Number(report.hours_spent).toFixed(1)}h
                        </p>
                      </div>
                      <button
                        onClick={() =>
                          remove.mutate({ id: report.id, imagePaths: report.image_urls ?? [] })
                        }
                        className="text-muted-foreground transition-colors hover:text-destructive"
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
                        {t("Output")}: {Number(report.output_quantity).toLocaleString()}{" "}
                        {report.output_unit}
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
                            <img
                              src={reportImageUrl(image)}
                              alt=""
                              className="size-full object-cover"
                            />
                          </a>
                        ))}
                      </div>
                    ) : null}
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
