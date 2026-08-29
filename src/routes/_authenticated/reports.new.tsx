import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/hooks/useSession";
import { useProjects } from "@/hooks/useData";
import { REPORT_TYPES, type ReportType } from "@/lib/roles";

export const Route = createFileRoute("/_authenticated/reports/new")({
  head: () => ({
    meta: [
      { title: "Write a report — JJ Report" },
      { name: "description", content: "Log today's work: project, hours, progress and blockers." },
      { property: "og:title", content: "Write a report — JJ Report" },
      { property: "og:description", content: "Log today's work in seconds." },
    ],
  }),
  component: NewReport,
});

function NewReport() {
  const { user } = useMe();
  const projects = useProjects();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [projectId, setProjectId] = useState("");
  const [type, setType] = useState<string>("create_develop");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [hours, setHours] = useState("1");
  const [blockers, setBlockers] = useState("");
  const [links, setLinks] = useState("");

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("reports").insert({
        user_id: user!.id,
        project_id: projectId || null,
        report_date: date,
        report_type: type as ReportType,
        title,
        content,
        hours_spent: Number(hours || 0),
        blockers: blockers || null,
        links: links || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Report saved");
      queryClient.invalidateQueries({ queryKey: ["my-reports"] });
      queryClient.invalidateQueries({ queryKey: ["visible-reports"] });
      navigate({ to: "/reports" });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not save"),
  });

  return (
    <>
      <PageHeader title="Write a report" subtitle="One entry per block of work. Keep it factual." />

      <form
        className="logbook-card space-y-5 p-6"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="date">Date</Label>
            <Input
              id="date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="project">Project</Label>
            <select
              id="project"
              className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm"
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
            >
              <option value="">No project</option>
              {(projects.data ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="type">Work type</Label>
            <select
              id="type"
              className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm"
              value={type}
              onChange={(e) => setType(e.target.value)}
            >
              {REPORT_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="title">Headline</Label>
          <Input
            id="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="What did you work on?"
            required
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="content">Details</Label>
          <Textarea
            id="content"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={7}
            placeholder="What you did, what changed, what's next."
            required
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="hours">Hours spent</Label>
            <Input
              id="hours"
              type="number"
              step="0.25"
              min="0"
              max="24"
              value={hours}
              onChange={(e) => setHours(e.target.value)}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="links">Links</Label>
            <Input
              id="links"
              value={links}
              onChange={(e) => setLinks(e.target.value)}
              placeholder="Docs, PRs, files"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="blockers">Blockers</Label>
          <Textarea
            id="blockers"
            value={blockers}
            onChange={(e) => setBlockers(e.target.value)}
            rows={3}
            placeholder="Anything stopping you (optional)"
          />
        </div>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => navigate({ to: "/reports" })}>
            Cancel
          </Button>
          <Button type="submit" disabled={save.isPending}>
            {save.isPending ? "Saving…" : "Save report"}
          </Button>
        </div>
      </form>
    </>
  );
}
