import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/hooks/useSession";
import { useMyReports, useProjects } from "@/hooks/useData";
import { REPORT_TYPE_LABEL } from "@/lib/roles";

export const Route = createFileRoute("/_authenticated/reports/")({
  head: () => ({
    meta: [
      { title: "My log — JJ Report" },
      { name: "description", content: "Every report you have written, newest first." },
      { property: "og:title", content: "My log — JJ Report" },
      { property: "og:description", content: "Your personal daily work log." },
    ],
  }),
  component: MyLog,
});

function MyLog() {
  const { user } = useMe();
  const reports = useMyReports(user?.id);
  const projects = useProjects();
  const queryClient = useQueryClient();

  const projectName = (id: string | null) =>
    id ? ((projects.data ?? []).find((p) => p.id === id)?.name ?? "—") : "—";

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("reports").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Entry deleted");
      queryClient.invalidateQueries({ queryKey: ["my-reports"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not delete"),
  });

  const grouped = new Map<string, typeof reports.data>();
  for (const r of reports.data ?? []) {
    const list = grouped.get(r.report_date) ?? [];
    list.push(r);
    grouped.set(r.report_date, list);
  }

  return (
    <>
      <PageHeader
        title="My log"
        subtitle="Everything you have written, grouped by day."
        action={
          <Button asChild>
            <Link to="/reports/new">New entry</Link>
          </Button>
        }
      />

      {reports.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (reports.data ?? []).length === 0 ? (
        <div className="logbook-card p-10 text-center">
          <p className="text-sm text-muted-foreground">Your log is empty.</p>
          <Button asChild className="mt-4">
            <Link to="/reports/new">Write the first entry</Link>
          </Button>
        </div>
      ) : (
        <div className="space-y-6">
          {[...grouped.entries()].map(([date, items]) => (
            <section key={date}>
              <div className="mb-2 flex items-baseline justify-between">
                <h2 className="logbook-label">{date}</h2>
                <span className="text-xs text-muted-foreground">
                  {(items ?? []).reduce((s, r) => s + Number(r.hours_spent), 0).toFixed(1)}h
                </span>
              </div>
              <div className="logbook-card divide-y divide-border">
                {(items ?? []).map((r) => (
                  <article key={r.id} className="px-5 py-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="text-sm font-medium">{r.title}</h3>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {REPORT_TYPE_LABEL[r.report_type]} · {projectName(r.project_id)} ·{" "}
                          {Number(r.hours_spent).toFixed(1)}h
                        </p>
                      </div>
                      <button
                        onClick={() => remove.mutate(r.id)}
                        className="text-muted-foreground transition-colors hover:text-destructive"
                        aria-label="Delete entry"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                    <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
                      {r.content}
                    </p>
                    {r.blockers ? (
                      <p className="mt-3 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
                        Blocker: {r.blockers}
                      </p>
                    ) : null}
                    {r.links ? (
                      <p className="mt-2 break-all text-xs text-muted-foreground">{r.links}</p>
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
