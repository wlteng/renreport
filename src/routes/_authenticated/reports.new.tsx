import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/hooks/useSession";
import { useActiveProjects } from "@/hooks/useData";
import { hasCapability, REPORT_TYPES } from "@/lib/roles";
import { firstValidationError, workLogSchema } from "@/lib/validation";

export const Route = createFileRoute("/_authenticated/reports/new")({
  head: () => ({
    meta: [
      { title: "Submit work — Ren Report" },
      { name: "description", content: "Submit mine work, shift, output and blockers." },
      { property: "og:title", content: "Submit work — Ren Report" },
      { property: "og:description", content: "Submit a mining operations work log." },
    ],
  }),
  component: SubmitWork,
});

function SubmitWork() {
  const { user, profile, roles, permissions } = useMe();
  const projects = useActiveProjects();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const allowed = !!profile?.is_active && hasCapability(permissions, "submit_work", roles);

  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [projectId, setProjectId] = useState("");
  const [type, setType] = useState("site_operations");
  const [workStatus, setWorkStatus] = useState("completed");
  const [shift, setShift] = useState("day");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [hours, setHours] = useState("1");
  const [outputQuantity, setOutputQuantity] = useState("");
  const [outputUnit, setOutputUnit] = useState("");
  const [blockers, setBlockers] = useState("");
  const [links, setLinks] = useState("");

  const save = useMutation({
    mutationFn: async () => {
      const parsed = workLogSchema.safeParse({
        report_date: date,
        project_id: projectId,
        report_type: type,
        work_status: workStatus,
        shift,
        title,
        content,
        hours_spent: hours,
        output_quantity: outputQuantity,
        output_unit: outputUnit,
        blockers,
        links,
      });
      if (!parsed.success) throw new Error(firstValidationError(parsed.error));
      if (!user) throw new Error("Your session has expired");
      const input = parsed.data;
      const { error } = await supabase.from("reports").insert({
        ...input,
        user_id: user.id,
        output_quantity: input.output_quantity ?? null,
        output_unit: input.output_unit ?? null,
        blockers: input.blockers ?? null,
        links: input.links ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Work log submitted");
      queryClient.invalidateQueries({ queryKey: ["my-reports"] });
      queryClient.invalidateQueries({ queryKey: ["visible-reports"] });
      navigate({ to: "/reports" });
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not submit work"),
  });

  if (!allowed) {
    return (
      <div className="logbook-card p-10 text-center">
        <p className="text-sm text-muted-foreground">
          Your account cannot submit work. It may be deactivated or missing the submit work
          capability.
        </p>
      </div>
    );
  }

  return (
    <>
      <PageHeader
        title="Submit work log"
        subtitle="Record the mine activity, shift, output and any blockers."
      />
      <form
        className="logbook-card space-y-5 p-6"
        onSubmit={(event) => {
          event.preventDefault();
          save.mutate();
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Date" id="date">
            <Input
              id="date"
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
            />
          </Field>
          <Field label="Mine project" id="project">
            <select
              id="project"
              className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm"
              value={projectId}
              onChange={(event) => setProjectId(event.target.value)}
            >
              <option value="">Choose an active project</option>
              {(projects.data ?? []).map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                  {project.project_code ? ` (${project.project_code})` : ""}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Activity" id="type">
            <select
              id="type"
              className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm"
              value={type}
              onChange={(event) => setType(event.target.value)}
            >
              {REPORT_TYPES.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Work status" id="status">
            <select
              id="status"
              className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm"
              value={workStatus}
              onChange={(event) => setWorkStatus(event.target.value)}
            >
              <option value="completed">Completed</option>
              <option value="in_progress">In progress</option>
              <option value="blocked">Blocked</option>
            </select>
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Shift" id="shift">
            <select
              id="shift"
              className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm"
              value={shift}
              onChange={(event) => setShift(event.target.value)}
            >
              <option value="day">Day</option>
              <option value="night">Night</option>
              <option value="other">Other</option>
            </select>
          </Field>
          <div className="sm:col-span-2">
            <Field label="Task / headline" id="title">
              <Input
                id="title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="What work was carried out?"
              />
            </Field>
          </div>
        </div>
        <Field label="Details" id="content">
          <Textarea
            id="content"
            value={content}
            onChange={(event) => setContent(event.target.value)}
            rows={7}
            placeholder="Work completed, observations, handover and next actions."
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Hours" id="hours">
            <Input
              id="hours"
              type="number"
              step="0.25"
              min="0"
              max="24"
              value={hours}
              onChange={(event) => setHours(event.target.value)}
            />
          </Field>
          <Field label="Output quantity" id="output">
            <Input
              id="output"
              type="number"
              step="0.001"
              min="0"
              value={outputQuantity}
              onChange={(event) => setOutputQuantity(event.target.value)}
              placeholder="Optional"
            />
          </Field>
          <Field label="Output unit" id="unit">
            <Input
              id="unit"
              value={outputUnit}
              onChange={(event) => setOutputUnit(event.target.value)}
              placeholder="kg, tonnes, metres…"
            />
          </Field>
        </div>
        <Field label="Blockers" id="blockers">
          <Textarea
            id="blockers"
            value={blockers}
            onChange={(event) => setBlockers(event.target.value)}
            rows={3}
            placeholder="Safety, equipment, access or supply blockers (optional)"
          />
        </Field>
        <Field label="Evidence / reference links" id="links">
          <Input
            id="links"
            value={links}
            onChange={(event) => setLinks(event.target.value)}
            placeholder="Photos, documents, permits or tickets"
          />
        </Field>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => navigate({ to: "/reports" })}>
            Cancel
          </Button>
          <Button type="submit" disabled={save.isPending}>
            {save.isPending ? "Submitting…" : "Submit work"}
          </Button>
        </div>
      </form>
    </>
  );
}

function Field({ label, id, children }: { label: string; id: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}
