import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ImagePlus, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/hooks/useSession";
import { useActiveProjects, useProjectMembers } from "@/hooks/useData";
import { nowForTimeInput, todayForDateInput } from "@/lib/dates";
import { useLanguage } from "@/lib/i18n";
import {
  removeReportImages,
  REPORT_IMAGE_BUCKET,
  REPORT_IMAGE_LIMIT,
  REPORT_IMAGE_MAX_BYTES,
  REPORT_IMAGE_TYPES,
} from "@/lib/reportImages";
import { hasCapability, REPORT_TYPES, type ReportType } from "@/lib/roles";
import { cn } from "@/lib/utils";
import { firstValidationError, workLogSchema } from "@/lib/validation";

type ActivityExtraField = "detail" | "output" | "blockers" | "links";

const ACTIVITY_DETAIL_PLACEHOLDER: Partial<Record<ReportType, string>> = {
  content_input: "Content or source",
  create_develop: "Feature, page, or deliverable",
  study_research: "Research topic",
  planning_brainstorm: "Plan or objective",
  analysis: "Analysis subject",
  meeting: "Meeting purpose or participants",
  support: "Person or request supported",
  site_operations: "Site or work area",
  exploration: "Survey area or target",
  extraction: "Material or extraction area",
  processing: "Material or batch",
  logistics: "Route, vehicle, or shipment",
  maintenance: "Equipment or asset",
  safety: "Hazard, incident, or inspection",
  administration: "Document or administrative item",
  other: "Describe the activity",
};

const ACTIVITY_EXTRA_FIELDS: Partial<Record<ReportType, ActivityExtraField[]>> = {
  content_input: ["detail", "output", "links"],
  create_develop: ["detail", "links"],
  study_research: ["detail", "links"],
  planning_brainstorm: ["detail"],
  analysis: ["detail", "links"],
  meeting: ["detail"],
  support: ["detail", "blockers"],
  site_operations: ["detail", "output", "blockers"],
  exploration: ["detail", "output", "links"],
  extraction: ["detail", "output", "blockers", "links"],
  processing: ["detail", "output", "blockers", "links"],
  logistics: ["detail", "output", "blockers"],
  maintenance: ["detail", "blockers", "links"],
  safety: ["detail", "blockers", "links"],
  administration: ["detail", "links"],
  other: ["detail", "blockers"],
};

function activityExtraFieldCount(type: ReportType) {
  return (ACTIVITY_EXTRA_FIELDS[type] ?? []).reduce(
    (count, field) => count + (field === "output" ? 2 : 1),
    0,
  );
}

type PendingImage = { file: File; id: string; preview: string };
type DurationUnit = "days" | "hours" | "mins";

const IMAGE_EXTENSION: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export const Route = createFileRoute("/_authenticated/reports/new")({
  head: () => ({
    meta: [
      { title: "Submit work — Ren Report" },
      { name: "description", content: "Submit project work, hours, output and blockers." },
      { property: "og:title", content: "Submit work — Ren Report" },
      { property: "og:description", content: "Submit a project work log." },
    ],
  }),
  component: SubmitWork,
});

function SubmitWork() {
  const { user, profile, roles, permissions } = useMe();
  const { t } = useLanguage();
  const projects = useActiveProjects();
  const projectMembers = useProjectMembers();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const allowed = !!profile?.is_active && hasCapability(permissions, "submit_work", roles);
  const userId = user?.id;
  const availableProjects = useMemo(() => {
    const activeProjects = projects.data ?? [];
    if (!userId) return [];
    const assignedProjectIds = new Set(
      (projectMembers.data ?? [])
        .filter((member) => member.user_id === userId)
        .map((member) => member.project_id),
    );
    return activeProjects.filter((project) => assignedProjectIds.has(project.id));
  }, [projectMembers.data, projects.data, userId]);

  const [date, setDate] = useState(todayForDateInput);
  const [time, setTime] = useState(nowForTimeInput);
  const [projectId, setProjectId] = useState("");
  const [type, setType] = useState<ReportType>("normal_activity");
  const [activityDetail, setActivityDetail] = useState("");
  const [workStatus, setWorkStatus] = useState("completed");
  const shift = "day";
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [hours, setHours] = useState("");
  const [durationUnit, setDurationUnit] = useState<DurationUnit>("hours");
  const [outputQuantity, setOutputQuantity] = useState("");
  const [outputUnit, setOutputUnit] = useState("");
  const [blockers, setBlockers] = useState("");
  const [links, setLinks] = useState("");
  const [images, setImages] = useState<PendingImage[]>([]);
  const [isDraggingImage, setIsDraggingImage] = useState(false);
  const previewUrls = useRef(new Set<string>());
  const activityDetailPlaceholder = ACTIVITY_DETAIL_PLACEHOLDER[type];
  const activityExtraFields = ACTIVITY_EXTRA_FIELDS[type] ?? [];
  const activityLabel = REPORT_TYPES.find((item) => item.value === type)?.label ?? type;
  const translatedActivityLabel = t(activityLabel);
  const hasSpecialFields = activityExtraFields.length > 0;
  const showActivityDetail = activityExtraFields.includes("detail");
  const showOutput = activityExtraFields.includes("output");
  const showBlockers = activityExtraFields.includes("blockers");
  const showLinks = activityExtraFields.includes("links");
  const selectedProjectId =
    projectId || (availableProjects.length === 1 ? availableProjects[0]!.id : "");
  const durationInput = {
    days: { max: "1", step: "0.25" },
    hours: { max: "24", step: "0.25" },
    mins: { max: "1440", step: "1" },
  }[durationUnit];

  useEffect(() => {
    const urls = previewUrls.current;
    return () => urls.forEach((url) => URL.revokeObjectURL(url));
  }, []);

  function addImages(files: FileList | File[]) {
    const candidates = Array.from(files);
    const valid = candidates.filter(
      (file) => REPORT_IMAGE_TYPES.has(file.type) && file.size <= REPORT_IMAGE_MAX_BYTES,
    );
    if (valid.length !== candidates.length) toast.error(t("Use JPG, PNG or WebP under 5 MB"));
    const available = REPORT_IMAGE_LIMIT - images.length;
    if (valid.length > available) toast.error(t("You can add up to 5 images"));
    const additions = valid.slice(0, available).map((file) => {
      const preview = URL.createObjectURL(file);
      previewUrls.current.add(preview);
      return { file, preview, id: crypto.randomUUID() };
    });
    setImages((current) => [...current, ...additions]);
  }

  function removeImage(id: string) {
    setImages((current) => {
      const image = current.find((item) => item.id === id);
      if (image) {
        URL.revokeObjectURL(image.preview);
        previewUrls.current.delete(image.preview);
      }
      return current.filter((item) => item.id !== id);
    });
  }

  const save = useMutation({
    mutationFn: async () => {
      const parsed = workLogSchema.safeParse({
        report_date: date,
        report_time: time,
        project_id: selectedProjectId,
        report_type: type,
        activity_detail: showActivityDetail ? activityDetail : "",
        work_status: workStatus,
        shift,
        title,
        content,
        hours_spent:
          hours === ""
            ? ""
            : durationUnit === "days"
              ? Number(hours) * 24
              : durationUnit === "mins"
                ? Number(hours) / 60
                : hours,
        output_quantity: showOutput ? outputQuantity : "",
        output_unit: showOutput ? outputUnit : "",
        blockers: showBlockers ? blockers : "",
        links: showLinks ? links : "",
      });
      if (!parsed.success) throw new Error(firstValidationError(parsed.error));
      if (!user) throw new Error("Your session has expired");
      const input = parsed.data;
      if (!availableProjects.some((project) => project.id === input.project_id)) {
        throw new Error(t("You must be assigned to this active project before submitting work."));
      }
      const reportId = crypto.randomUUID();
      const imagePaths: string[] = [];
      try {
        for (const image of images) {
          const path = `${user.id}/${reportId}/${crypto.randomUUID()}.${IMAGE_EXTENSION[image.file.type]}`;
          const { error: uploadError } = await supabase.storage
            .from(REPORT_IMAGE_BUCKET)
            .upload(path, image.file, { contentType: image.file.type, upsert: false });
          if (uploadError) throw uploadError;
          imagePaths.push(path);
        }
        const { error } = await supabase.from("reports").insert({
          ...input,
          id: reportId,
          user_id: user.id,
          activity_detail: input.activity_detail ?? null,
          output_quantity: input.output_quantity ?? null,
          output_unit: input.output_unit ?? null,
          blockers: input.blockers ?? null,
          links: input.links ?? null,
          image_urls: imagePaths.length ? imagePaths : null,
        });
        if (error) throw error;
      } catch (error) {
        await removeReportImages(imagePaths).catch(() => undefined);
        throw error;
      }
    },
    onSuccess: () => {
      toast.success("Work log submitted");
      queryClient.invalidateQueries({ queryKey: ["my-reports"] });
      queryClient.invalidateQueries({ queryKey: ["visible-reports"] });
      navigate({ to: "/dashboard" });
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

  if (projects.isLoading || projectMembers.isLoading) {
    return <p className="text-sm text-muted-foreground">{t("Loading assigned projects…")}</p>;
  }

  if (availableProjects.length === 0) {
    return (
      <>
        <PageHeader title="Submit work log" />
        <div className="logbook-card p-10 text-center">
          <p className="text-sm text-muted-foreground">
            {t("You must be assigned to an active project before submitting work.")}
          </p>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Submit work log"
        action={
          <select
            id="status"
            aria-label={t("Work status")}
            className={cn(
              "h-10 w-32 shrink-0 rounded-full border px-4 text-base font-semibold transition-colors sm:w-44 sm:text-sm",
              workStatus === "completed" && "border-primary/25 bg-stat-teal text-primary",
              workStatus === "in_progress" && "border-[#d7bc58] bg-stat-gold text-[#705b10]",
              workStatus === "blocked" && "border-[#dfaa91] bg-stat-copper text-[#8c3f25]",
            )}
            value={workStatus}
            onChange={(event) => setWorkStatus(event.target.value)}
          >
            <option value="completed">{t("Completed")}</option>
            <option value="in_progress">{t("In progress")}</option>
            <option value="blocked">{t("Blocked")}</option>
          </select>
        }
      />
      <form
        className="space-y-5 [&_input]:shadow-none [&_textarea]:shadow-none sm:rounded-xl sm:border sm:border-border sm:bg-card sm:p-6 sm:shadow-card"
        onSubmit={(event) => {
          event.preventDefault();
          save.mutate();
        }}
      >
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Field label="Date" id="date">
            <Input
              id="date"
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
            />
          </Field>
          <Field label="Time" id="time">
            <Input
              id="time"
              type="time"
              value={time}
              onChange={(event) => setTime(event.target.value)}
            />
          </Field>
          <div className="col-span-2 lg:col-span-1">
            <Field label="Project" id="project">
              <select
                id="project"
                className="h-10 w-full rounded-md border border-input bg-card px-3 text-base sm:text-sm"
                value={selectedProjectId}
                onChange={(event) => setProjectId(event.target.value)}
              >
                <option value="">{t("Choose an active project")}</option>
                {availableProjects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                    {project.project_code ? ` (${project.project_code})` : ""}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <div className="col-span-2 lg:col-span-1">
            <Field label="Activity" id="type">
              <select
                id="type"
                className="h-10 w-full rounded-md border border-input bg-card px-3 text-base sm:text-sm"
                value={type}
                onChange={(event) => {
                  const nextType = event.target.value as ReportType;
                  setType(nextType);
                  setActivityDetail("");
                  setOutputQuantity("");
                  setOutputUnit("");
                  setBlockers("");
                  setLinks("");
                }}
              >
                {REPORT_TYPES.map((item) => (
                  <option key={item.value} value={item.value}>
                    {t(item.label)} ({activityExtraFieldCount(item.value)})
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </div>

        <Field label="Task / headline" id="title">
          <Input
            id="title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder={t("Title")}
          />
        </Field>
        <Field label="Details" id="content">
          <Textarea
            id="content"
            value={content}
            onChange={(event) => setContent(event.target.value)}
            rows={7}
            placeholder={t("Work description")}
          />
        </Field>
        <div className="grid grid-cols-[minmax(0,1fr)_8rem] gap-3 sm:max-w-md">
          <Field label="Hours" id="hours">
            <Input
              id="hours"
              type="number"
              step={durationInput.step}
              min="0"
              max={durationInput.max}
              value={hours}
              onChange={(event) => setHours(event.target.value)}
              placeholder={t("Duration")}
            />
          </Field>
          <select
            id="duration-unit"
            aria-label={t("Duration unit")}
            className="h-10 w-full rounded-md border border-input bg-card px-3 text-base sm:text-sm"
            value={durationUnit}
            onChange={(event) => setDurationUnit(event.target.value as DurationUnit)}
          >
            <option value="days">{t("Days")}</option>
            <option value="hours">{t("Hours")}</option>
            <option value="mins">{t("Mins")}</option>
          </select>
        </div>
        <div
          className={cn(
            "rounded-lg border border-dashed border-border bg-muted/20 p-3 transition-colors",
            isDraggingImage && "border-foreground bg-muted/50",
          )}
          onDragEnter={(event) => {
            event.preventDefault();
            setIsDraggingImage(true);
          }}
          onDragOver={(event) => event.preventDefault()}
          onDragLeave={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node)) {
              setIsDraggingImage(false);
            }
          }}
          onDrop={(event) => {
            event.preventDefault();
            setIsDraggingImage(false);
            addImages(event.dataTransfer.files);
          }}
        >
          <label
            htmlFor="report-images"
            className="flex min-h-24 cursor-pointer flex-col items-center justify-center gap-1 rounded-md text-center"
          >
            <ImagePlus className="size-5 text-muted-foreground" aria-hidden="true" />
            <span className="text-sm font-medium">{t("Drag images here or tap to choose")}</span>
            <span className="text-xs text-muted-foreground">
              {t("JPG, PNG or WebP · Up to 5 · 5 MB each")}
            </span>
          </label>
          <input
            id="report-images"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            className="sr-only"
            onChange={(event) => {
              if (event.target.files) addImages(event.target.files);
              event.target.value = "";
            }}
          />
          {images.length ? (
            <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-5">
              {images.map((image) => (
                <div key={image.id} className="relative aspect-square overflow-hidden rounded-md">
                  <img
                    src={image.preview}
                    alt={image.file.name}
                    className="size-full object-cover"
                  />
                  <button
                    type="button"
                    aria-label={t("Remove image")}
                    className="absolute right-1 top-1 grid size-7 place-items-center rounded-full bg-background/90 text-foreground"
                    onClick={() => removeImage(image.id)}
                  >
                    <X className="size-4" aria-hidden="true" />
                  </button>
                </div>
              ))}
            </div>
          ) : null}
        </div>
        {hasSpecialFields ? (
          <section className="space-y-4">
            <h2 className="w-full py-1 text-center text-sm font-semibold">
              {translatedActivityLabel === activityLabel
                ? `------- ${activityLabel} -------`
                : `------- ${translatedActivityLabel} / ${activityLabel} -------`}
            </h2>
            {showActivityDetail && activityDetailPlaceholder ? (
              <Input
                id="activity-detail"
                aria-label={t(activityDetailPlaceholder)}
                value={activityDetail}
                onChange={(event) => setActivityDetail(event.target.value)}
                placeholder={t(activityDetailPlaceholder)}
              />
            ) : null}
            {showOutput ? (
              <div className="grid grid-cols-2 gap-4">
                <Field label="Output quantity" id="output">
                  <Input
                    id="output"
                    type="number"
                    step="0.001"
                    min="0"
                    value={outputQuantity}
                    onChange={(event) => setOutputQuantity(event.target.value)}
                    placeholder={t("Output quantity (optional)")}
                  />
                </Field>
                <Field label="Output unit" id="unit">
                  <Input
                    id="unit"
                    value={outputUnit}
                    onChange={(event) => setOutputUnit(event.target.value)}
                    placeholder={t("Output unit: kg, tonnes, metres…")}
                  />
                </Field>
              </div>
            ) : null}
            {showBlockers ? (
              <Field label="Blockers" id="blockers">
                <Textarea
                  id="blockers"
                  value={blockers}
                  onChange={(event) => setBlockers(event.target.value)}
                  rows={3}
                  placeholder={t("Safety, equipment, access or supply blockers (optional)")}
                />
              </Field>
            ) : null}
            {showLinks ? (
              <Field label="Evidence / reference links" id="links">
                <Input
                  id="links"
                  value={links}
                  onChange={(event) => setLinks(event.target.value)}
                  placeholder={t("Photos, documents, permits or tickets")}
                />
              </Field>
            ) : null}
          </section>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => navigate({ to: "/dashboard" })}>
            {t("Cancel")}
          </Button>
          <Button type="submit" disabled={save.isPending}>
            {save.isPending ? t("Submitting…") : t("Submit work")}
          </Button>
        </div>
      </form>
    </>
  );
}

function Field({ label, id, children }: { label: string; id: string; children: ReactNode }) {
  const { t } = useLanguage();
  return (
    <div>
      <Label htmlFor={id} className="sr-only">
        {t(label)}
      </Label>
      {children}
    </div>
  );
}
