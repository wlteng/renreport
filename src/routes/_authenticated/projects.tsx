import { createFileRoute } from "@tanstack/react-router";
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
import { useDepartments, useProjects, useVisibleReports } from "@/hooks/useData";
import { can } from "@/lib/roles";

export const Route = createFileRoute("/_authenticated/projects")({
  head: () => ({
    meta: [
      { title: "Projects — JJ Report" },
      { name: "description", content: "Projects reports are logged against, with recent activity." },
      { property: "og:title", content: "Projects — JJ Report" },
      { property: "og:description", content: "Projects and their reporting activity." },
    ],
  }),
  component: ProjectsPage,
});

function ProjectsPage() {
  const { roles } = useMe();
  const projects = useProjects();
  const departments = useDepartments();
  const recent = useVisibleReports({});
  const queryClient = useQueryClient();
  const editable = can.manageProjects(roles);

  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [url, setUrl] = useState("");
  const [departmentId, setDepartmentId] = useState("");

  const create = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("projects").insert({
        name,
        description: description || null,
        url: url || null,
        department_id: departmentId || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Project created");
      setOpen(false);
      setName("");
      setDescription("");
      setUrl("");
      setDepartmentId("");
      queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not create project"),
  });

  const archive = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("projects").update({ status: "archived" }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Project archived");
      queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not archive"),
  });

  const activity = (projectId: string) =>
    (recent.data ?? []).filter((r) => r.project_id === projectId);

  return (
    <>
      <PageHeader
        title="Projects"
        subtitle="What the team reports against."
        action={
          editable ? (
            <Button onClick={() => setOpen((v) => !v)}>{open ? "Close" : "New project"}</Button>
          ) : undefined
        }
      />

      {open && editable ? (
        <form
          className="logbook-card mb-6 space-y-4 p-6"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate();
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="pname">Name</Label>
              <Input id="pname" value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="purl">URL</Label>
              <Input id="purl" value={url} onChange={(e) => setUrl(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pdept">Department</Label>
            <select
              id="pdept"
              className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm"
              value={departmentId}
              onChange={(e) => setDepartmentId(e.target.value)}
            >
              <option value="">None</option>
              {(departments.data ?? []).map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pdesc">Description</Label>
            <Textarea
              id="pdesc"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className="flex justify-end">
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? "Creating…" : "Create project"}
            </Button>
          </div>
        </form>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        {(projects.data ?? []).map((p) => {
          const items = activity(p.id);
          const hours = items.reduce((s, r) => s + Number(r.hours_spent), 0);
          return (
            <div key={p.id} className="logbook-card p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="truncate text-sm font-semibold">{p.name}</h2>
                  <p className="logbook-label mt-1">{p.status}</p>
                </div>
                {editable && p.status !== "archived" ? (
                  <button
                    onClick={() => archive.mutate(p.id)}
                    className="text-xs text-muted-foreground hover:text-destructive"
                  >
                    Archive
                  </button>
                ) : null}
              </div>
              {p.description ? (
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                  {p.description}
                </p>
              ) : null}
              <p className="mt-4 text-xs text-muted-foreground">
                {items.length} visible entries · {hours.toFixed(1)}h logged
              </p>
            </div>
          );
        })}
        {!projects.isLoading && (projects.data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No projects yet{editable ? " — create the first one." : "."}
          </p>
        ) : null}
      </div>
    </>
  );
}
