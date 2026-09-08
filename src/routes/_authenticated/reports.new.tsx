import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { FilePenLine, ImagePlus, Play, Users, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { z } from "zod";

import { PageHeader } from "@/components/AppShell";
import { WorkLogVideoPoster } from "@/components/WorkLog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/hooks/useSession";
import {
  usePeople,
  useProjectMembers,
  useReport,
  useWorkEnabledProjects,
  type PersonRow,
} from "@/hooks/useData";
import { nowForTimeInput, todayForDateInput } from "@/lib/dates";
import { useLanguage } from "@/lib/i18n";
import { compressImage } from "@/lib/images";
import { personDisplayName, personInitials } from "@/lib/people";
import {
  removeReportImages,
  reportImageUrl,
  REPORT_IMAGE_BUCKET,
  REPORT_IMAGE_LIMIT,
  REPORT_IMAGE_MAX_BYTES,
  REPORT_IMAGE_TYPES,
} from "@/lib/reportImages";
import { isWithinEditWindow } from "@/lib/reportEdits";
import { hasCapability, REPORT_TYPES, type ReportType } from "@/lib/roles";
import { cn } from "@/lib/utils";
import { firstValidationError, workLogSchema } from "@/lib/validation";
import {
  formatDuration,
  looksLikeVideo,
  previewVideo,
  REPORT_VIDEO_LIMIT,
  REPORT_VIDEO_MAX_BYTES,
  videoExtension,
  videoMimeType,
  videoPosterCandidates,
  videoPosterPath,
} from "@/lib/videos";
import { durationUnitOf, durationValueOf, HOURS_PER_DAY, participantsLabel } from "@/lib/workLogs";
import {
  clearWorkLogDraft,
  loadWorkLogDraft,
  saveWorkLogDraft,
  type WorkLogDraft,
} from "@/lib/workLogDraft";

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
type PendingVideo = {
  file: File;
  id: string;
  mimeType: string;
  preview: string;
  poster: Blob | null;
  posterUrl: string | null;
  duration: number | null;
};
type DurationUnit = "days" | "hours" | "mins";
type FormMode = "new" | "edit" | "correct";

const IMAGE_EXTENSION: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/** Mirrors the reports_participants_check constraint in the database. */
const PARTICIPANT_LIMIT = 50;

/** Photos are re-encoded as WebP at this quality before upload. */
const PHOTO_QUALITY = 0.75;

// ?edit=<id> edits a work log; ?correct=<id> submits a correction; ?projectId=<id> preselects a project.
const submitWorkSearchSchema = z.object({
  edit: z.string().uuid().optional().catch(undefined),
  correct: z.string().uuid().optional().catch(undefined),
  projectId: z.string().uuid().optional().catch(undefined),
});

export const Route = createFileRoute("/_authenticated/reports/new")({
  validateSearch: (search: Record<string, unknown>) => submitWorkSearchSchema.parse(search),
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
  const projects = useWorkEnabledProjects();
  const projectMembers = useProjectMembers();
  const people = usePeople();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { edit: editId, correct: correctId, projectId: requestedProjectId } = Route.useSearch();
  const mode: FormMode = editId ? "edit" : correctId ? "correct" : "new";
  const sourceId = editId ?? correctId;
  const source = useReport(sourceId);
  const allowed = !!profile?.is_active && hasCapability(permissions, "submit_work", roles);
  // Only admins can submit one work log on behalf of several people.
  const isAdmin = roles.includes("admin");
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
  const shift = mode === "new" ? "day" : (source.data?.shift ?? "day");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [hours, setHours] = useState("");
  const [durationUnit, setDurationUnit] = useState<DurationUnit>("hours");
  const [outputQuantity, setOutputQuantity] = useState("");
  const [outputUnit, setOutputUnit] = useState("");
  const [blockers, setBlockers] = useState("");
  const [links, setLinks] = useState("");
  const [images, setImages] = useState<PendingImage[]>([]);
  const [existingImages, setExistingImages] = useState<string[]>([]);
  const [videos, setVideos] = useState<PendingVideo[]>([]);
  const [existingVideos, setExistingVideos] = useState<string[]>([]);
  const [isDraggingMedia, setIsDraggingMedia] = useState(false);
  const [uploadStep, setUploadStep] = useState<string | null>(null);
  // Team log participants other than the submitter, plus whether the submitter is included.
  const [participantIds, setParticipantIds] = useState<string[]>([]);
  const [includeMe, setIncludeMe] = useState(true);
  const [staffSearch, setStaffSearch] = useState("");
  const previewUrls = useRef(new Set<string>());
  const prefilled = useRef(false);
  // A new work log keeps a local draft until it is submitted.
  const draftRestored = useRef(false);
  const [draftSavedAt, setDraftSavedAt] = useState<string | null>(null);
  const activityDetailPlaceholder = ACTIVITY_DETAIL_PLACEHOLDER[type];
  const activityExtraFields = ACTIVITY_EXTRA_FIELDS[type] ?? [];
  const activityLabel = REPORT_TYPES.find((item) => item.value === type)?.label ?? type;
  const translatedActivityLabel = t(activityLabel);
  const hasSpecialFields = activityExtraFields.length > 0;
  const showActivityDetail = activityExtraFields.includes("detail");
  const showOutput = activityExtraFields.includes("output");
  const showBlockers = activityExtraFields.includes("blockers");
  const showLinks = activityExtraFields.includes("links");
  const requestedProjectIsAvailable = availableProjects.some(
    (project) => project.id === requestedProjectId,
  );
  const selectedProjectId =
    projectId ||
    (requestedProjectIsAvailable ? requestedProjectId : undefined) ||
    (availableProjects.length === 1 ? availableProjects[0]!.id : "");
  // A site visit can run for several days, so a log may record up to 31 days.
  const durationInput = {
    days: { max: "31", step: "0.5" },
    hours: { max: "744", step: "0.25" },
    mins: { max: "1440", step: "1" },
  }[durationUnit];

  const projectMemberIds = useMemo(
    () =>
      new Set(
        (projectMembers.data ?? [])
          .filter((member) => member.project_id === selectedProjectId)
          .map((member) => member.user_id),
      ),
    [projectMembers.data, selectedProjectId],
  );
  // Staff an admin can credit: active people other than themselves, assigned staff first.
  const selectableStaff = useMemo(() => {
    if (!isAdmin) return [];
    const term = staffSearch.trim().toLocaleLowerCase();
    return (people.data ?? [])
      .filter(
        (person) =>
          person.id !== userId && (person.is_active || participantIds.includes(person.id)),
      )
      .filter(
        (person) =>
          !term ||
          `${person.full_name ?? ""} ${person.email ?? ""} ${person.job_title ?? ""}`
            .toLocaleLowerCase()
            .includes(term),
      )
      .sort((a, b) => {
        const assigned = Number(projectMemberIds.has(b.id)) - Number(projectMemberIds.has(a.id));
        return assigned || (a.full_name ?? "").localeCompare(b.full_name ?? "");
      });
  }, [isAdmin, participantIds, people.data, projectMemberIds, staffSearch, userId]);
  const selectedPeople = useMemo(
    () =>
      participantIds
        .map((id) => (people.data ?? []).find((person) => person.id === id))
        .filter((person): person is PersonRow => !!person),
    [participantIds, people.data],
  );
  const assignedSelectable = useMemo(
    () =>
      (people.data ?? [])
        .filter(
          (person) => person.id !== userId && person.is_active && projectMemberIds.has(person.id),
        )
        .map((person) => person.id),
    [people.data, projectMemberIds, userId],
  );
  // Everyone credited on the log being saved; null keeps it a personal log.
  const groupParticipantIds =
    isAdmin && userId && (participantIds.length > 0 || !includeMe)
      ? [...(includeMe ? [userId] : []), ...participantIds]
      : null;

  useEffect(() => {
    const urls = previewUrls.current;
    return () => urls.forEach((url) => URL.revokeObjectURL(url));
  }, []);

  // Editing or correcting starts from the existing work log.
  useEffect(() => {
    const report = source.data;
    if (mode === "new" || !report || prefilled.current) return;
    prefilled.current = true;
    setDate(report.report_date);
    setTime(report.report_time ? report.report_time.slice(0, 5) : nowForTimeInput());
    setProjectId(report.project_id ?? "");
    setType(report.report_type);
    setActivityDetail(report.activity_detail ?? "");
    setWorkStatus(report.work_status);
    setTitle(report.title);
    setContent(report.content);
    // A log is edited in the unit it was entered in.
    setHours(String(durationValueOf(report)));
    setDurationUnit(durationUnitOf(report));
    setOutputQuantity(report.output_quantity === null ? "" : String(report.output_quantity));
    setOutputUnit(report.output_unit ?? "");
    setBlockers(report.blockers ?? "");
    setLinks(report.links ?? "");
    setExistingImages(report.image_urls ?? []);
    setExistingVideos(report.video_urls ?? []);
    const listed = report.participant_ids ?? [];
    setIncludeMe(listed.length === 0 || listed.includes(report.user_id));
    setParticipantIds(listed.filter((id) => id !== report.user_id));
  }, [mode, source.data]);

  // A draft left behind by an unsubmitted work log is restored once, on the empty form.
  useEffect(() => {
    if (mode !== "new" || !userId || draftRestored.current) return;
    draftRestored.current = true;
    const draft = loadWorkLogDraft(userId);
    if (!draft) return;
    if (draft.date) setDate(draft.date);
    if (draft.time) setTime(draft.time);
    setProjectId(draft.projectId);
    if (REPORT_TYPES.some((item) => item.value === draft.type)) setType(draft.type as ReportType);
    setActivityDetail(draft.activityDetail);
    if (draft.workStatus) setWorkStatus(draft.workStatus);
    setTitle(draft.title);
    setContent(draft.content);
    setHours(draft.hours);
    if (
      draft.durationUnit === "days" ||
      draft.durationUnit === "hours" ||
      draft.durationUnit === "mins"
    ) {
      setDurationUnit(draft.durationUnit);
    }
    setOutputQuantity(draft.outputQuantity);
    setOutputUnit(draft.outputUnit);
    setBlockers(draft.blockers);
    setLinks(draft.links);
    setParticipantIds(draft.participantIds);
    setIncludeMe(draft.includeMe);
    setDraftSavedAt(draft.savedAt);
  }, [mode, userId]);

  // Everything typed is kept locally so a reload or a closed tab loses nothing.
  useEffect(() => {
    if (mode !== "new" || !userId || !draftRestored.current) return;
    const draft: WorkLogDraft = {
      date,
      time,
      projectId,
      type,
      activityDetail,
      workStatus,
      title,
      content,
      hours,
      durationUnit,
      outputQuantity,
      outputUnit,
      blockers,
      links,
      participantIds,
      includeMe,
    };
    const timer = setTimeout(() => saveWorkLogDraft(userId, draft), 400);
    return () => clearTimeout(timer);
  }, [
    activityDetail,
    blockers,
    content,
    date,
    durationUnit,
    hours,
    includeMe,
    links,
    mode,
    outputQuantity,
    outputUnit,
    participantIds,
    projectId,
    time,
    title,
    type,
    userId,
    workStatus,
  ]);

  function discardDraft() {
    if (userId) clearWorkLogDraft(userId);
    setDraftSavedAt(null);
    setDate(todayForDateInput());
    setTime(nowForTimeInput());
    setProjectId("");
    setType("normal_activity");
    setActivityDetail("");
    setWorkStatus("completed");
    setTitle("");
    setContent("");
    setHours("");
    setDurationUnit("hours");
    setOutputQuantity("");
    setOutputUnit("");
    setBlockers("");
    setLinks("");
    setParticipantIds([]);
    setIncludeMe(true);
  }

  function trackPreview(url: string) {
    previewUrls.current.add(url);
    return url;
  }

  function releasePreview(url: string | null) {
    if (!url) return;
    URL.revokeObjectURL(url);
    previewUrls.current.delete(url);
  }

  async function addImages(files: File[]) {
    const valid = files.filter(
      (file) => REPORT_IMAGE_TYPES.has(file.type) && file.size <= REPORT_IMAGE_MAX_BYTES,
    );
    if (valid.length !== files.length) toast.error(t("Use JPG, PNG or WebP under 5 MB"));
    const available = REPORT_IMAGE_LIMIT - images.length - existingImages.length;
    if (valid.length > available) toast.error(t("You can add up to 5 images"));
    // Phone photos are downscaled and saved as WebP in the browser so uploads and the feed stay fast.
    const additions = await Promise.all(
      valid.slice(0, available).map(async (original) => {
        const file = await compressImage(original, { quality: PHOTO_QUALITY });
        return { file, preview: trackPreview(URL.createObjectURL(file)), id: crypto.randomUUID() };
      }),
    );
    setImages((current) => [...current, ...additions]);
  }

  async function addVideos(files: File[]) {
    const valid = files.filter(
      (file) => videoMimeType(file) !== null && file.size <= REPORT_VIDEO_MAX_BYTES,
    );
    if (valid.length !== files.length) toast.error(t("Use MP4, WebM or MOV under 50 MB"));
    const available = REPORT_VIDEO_LIMIT - videos.length - existingVideos.length;
    if (valid.length > available) toast.error(t("You can add up to 2 videos"));
    // Videos are uploaded as recorded; only a small poster frame is captured here.
    const additions = await Promise.all(
      valid.slice(0, available).map(async (file) => {
        const { duration, poster } = await previewVideo(file);
        return {
          file,
          id: crypto.randomUUID(),
          mimeType: videoMimeType(file)!,
          preview: trackPreview(URL.createObjectURL(file)),
          poster,
          posterUrl: poster ? trackPreview(URL.createObjectURL(poster)) : null,
          duration,
        };
      }),
    );
    setVideos((current) => [...current, ...additions]);
  }

  async function addFiles(files: FileList | File[]) {
    const candidates = Array.from(files);
    await Promise.all([
      addImages(candidates.filter((file) => !looksLikeVideo(file))),
      addVideos(candidates.filter(looksLikeVideo)),
    ]);
  }

  function removeImage(id: string) {
    setImages((current) => {
      const image = current.find((item) => item.id === id);
      if (image) releasePreview(image.preview);
      return current.filter((item) => item.id !== id);
    });
  }

  function removeVideo(id: string) {
    setVideos((current) => {
      const video = current.find((item) => item.id === id);
      if (video) {
        releasePreview(video.preview);
        releasePreview(video.posterUrl);
      }
      return current.filter((item) => item.id !== id);
    });
  }

  function toggleParticipant(id: string) {
    const selected = participantIds.includes(id);
    if (!selected && participantIds.length + (includeMe ? 1 : 0) >= PARTICIPANT_LIMIT) {
      toast.error(t("You can credit up to 50 people on one work log"));
      return;
    }
    setParticipantIds(
      selected ? participantIds.filter((item) => item !== id) : [...participantIds, id],
    );
  }

  function selectAssignedStaff() {
    setParticipantIds((current) =>
      [...new Set([...current, ...assignedSelectable])].slice(
        0,
        PARTICIPANT_LIMIT - (includeMe ? 1 : 0),
      ),
    );
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
              ? Number(hours) * HOURS_PER_DAY
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
      if (isAdmin && !includeMe && participantIds.length === 0) {
        throw new Error(t("Select at least one participant when you exclude yourself."));
      }
      if (mode !== "new" && !source.data) throw new Error(t("Work log not found."));
      const reportId = mode === "edit" && editId ? editId : crypto.randomUUID();
      const folder = `${user.id}/${reportId}`;
      const uploaded: string[] = [];
      const imagePaths: string[] = [];
      const videoPaths: string[] = [];
      const upload = async (path: string, body: Blob, contentType: string) => {
        const { error } = await supabase.storage
          .from(REPORT_IMAGE_BUCKET)
          .upload(path, body, { contentType, upsert: false });
        if (error) throw error;
        uploaded.push(path);
      };
      try {
        if (images.length) setUploadStep(t("Uploading photos…"));
        for (const image of images) {
          const path = `${folder}/${crypto.randomUUID()}.${IMAGE_EXTENSION[image.file.type]}`;
          await upload(path, image.file, image.file.type);
          imagePaths.push(path);
        }
        for (const [index, video] of videos.entries()) {
          setUploadStep(
            t("Uploading video {n} of {total}…")
              .replace("{n}", String(index + 1))
              .replace("{total}", String(videos.length)),
          );
          const path = `${folder}/${crypto.randomUUID()}.${videoExtension(video.mimeType)}`;
          await upload(path, video.file, video.mimeType);
          videoPaths.push(path);
          if (video.poster) {
            await upload(videoPosterPath(path, video.poster.type), video.poster, video.poster.type);
          }
        }
        if (mode === "correct") {
          // Each work log owns its files, so deleting one never breaks another.
          setUploadStep(t("Copying attachments…"));
          for (const path of existingImages) {
            const extension = path.split(".").pop() ?? "jpg";
            const copy = `${folder}/${crypto.randomUUID()}.${extension}`;
            const { error: copyError } = await supabase.storage
              .from(REPORT_IMAGE_BUCKET)
              .copy(path, copy);
            if (copyError) throw copyError;
            uploaded.push(copy);
            imagePaths.push(copy);
          }
          for (const path of existingVideos) {
            const extension = path.split(".").pop() ?? "mp4";
            const copy = `${folder}/${crypto.randomUUID()}.${extension}`;
            const { error: copyError } = await supabase.storage
              .from(REPORT_IMAGE_BUCKET)
              .copy(path, copy);
            if (copyError) throw copyError;
            uploaded.push(copy);
            videoPaths.push(copy);
            // The poster may be WebP or JPEG, or missing; copy whichever exists.
            const posterSources = videoPosterCandidates(path);
            const posterTargets = videoPosterCandidates(copy);
            for (const [index, posterSource] of posterSources.entries()) {
              const posterTarget = posterTargets[index];
              if (!posterTarget) continue;
              const { error: posterError } = await supabase.storage
                .from(REPORT_IMAGE_BUCKET)
                .copy(posterSource, posterTarget);
              if (!posterError) uploaded.push(posterTarget);
            }
          }
        }
        const allImages = mode === "correct" ? imagePaths : [...existingImages, ...imagePaths];
        const allVideos = mode === "correct" ? videoPaths : [...existingVideos, ...videoPaths];
        const record = {
          ...input,
          // The entered duration is kept as typed: five days is five days, not
          // 120 hours, because pay is counted per day for daily staff.
          duration_value: Number(hours),
          duration_unit: durationUnit,
          activity_detail: input.activity_detail ?? null,
          output_quantity: input.output_quantity ?? null,
          output_unit: input.output_unit ?? null,
          blockers: input.blockers ?? null,
          links: input.links ?? null,
          image_urls: allImages.length ? allImages : null,
          video_urls: allVideos.length ? allVideos : null,
          participant_ids: groupParticipantIds,
        };
        setUploadStep(null);
        if (mode === "edit") {
          const { error } = await supabase.from("reports").update(record).eq("id", reportId);
          if (error) throw error;
          // Only files that belong to this log are removed; a correction may share older ones.
          const ownFile = (path: string) => path.startsWith(`${folder}/`);
          const droppedImages = (source.data?.image_urls ?? []).filter(
            (path) => !existingImages.includes(path) && ownFile(path),
          );
          const droppedVideos = (source.data?.video_urls ?? []).filter(
            (path) => !existingVideos.includes(path) && ownFile(path),
          );
          await removeReportImages([
            ...droppedImages,
            ...droppedVideos,
            ...droppedVideos.flatMap(videoPosterCandidates),
          ]).catch(() => undefined);
        } else {
          const { error } = await supabase.from("reports").insert({
            ...record,
            id: reportId,
            user_id: user.id,
            supersedes_report_id: mode === "correct" ? (correctId ?? null) : null,
          });
          if (error) throw error;
        }
      } catch (error) {
        await removeReportImages(uploaded).catch(() => undefined);
        throw error;
      }
    },
    onSuccess: () => {
      // The work log is stored now, so the local draft must not reappear on the next form.
      if (userId) clearWorkLogDraft(userId);
      setDraftSavedAt(null);
      toast.success(
        mode === "edit"
          ? t("Work log updated")
          : mode === "correct"
            ? t("Correction submitted")
            : groupParticipantIds
              ? t("Team work log submitted")
              : t("Work log submitted"),
      );
      queryClient.invalidateQueries({ queryKey: ["my-reports"] });
      queryClient.invalidateQueries({ queryKey: ["visible-reports"] });
      if (sourceId) queryClient.invalidateQueries({ queryKey: ["report", sourceId] });
      navigate({ to: "/dashboard" });
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not submit work"),
    onSettled: () => setUploadStep(null),
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

  if (sourceId && source.isLoading) {
    return <p className="text-sm text-muted-foreground">{t("Loading work log…")}</p>;
  }

  if (sourceId && (!source.data || source.data.user_id !== user?.id)) {
    return (
      <div className="logbook-card p-10 text-center">
        <p className="text-sm text-muted-foreground">{t("Work log not found.")}</p>
      </div>
    );
  }

  if (mode === "edit" && source.data && !isWithinEditWindow(source.data.created_at)) {
    return (
      <>
        <PageHeader title="Edit work log" />
        <div className="logbook-card p-10 text-center">
          <p className="text-sm text-muted-foreground">
            {t("This work log is older than 1 hour and can only be corrected.")}
          </p>
          <Button
            className="mt-4"
            onClick={() =>
              navigate({ to: "/reports/new", search: { correct: source.data!.id }, replace: true })
            }
          >
            {t("Create corrected version")}
          </Button>
        </div>
      </>
    );
  }

  if (
    mode !== "new" &&
    source.data &&
    !availableProjects.some((project) => project.id === source.data?.project_id)
  ) {
    return (
      <>
        <PageHeader title={mode === "correct" ? "Create corrected version" : "Edit work log"} />
        <div className="logbook-card p-6 text-center sm:p-10">
          <FilePenLine className="mx-auto size-8 text-primary" aria-hidden="true" />
          <h2 className="mt-3 font-semibold">
            {mode === "correct"
              ? t("A corrected version cannot be created")
              : t("This work log cannot be edited")}
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {mode === "correct"
              ? t(
                  "This project must be active and assigned to you before you can create a corrected version.",
                )
              : t(
                  "This project must be active and assigned to you before you can edit this work log.",
                )}
          </p>
          <p className="mt-3 text-xs font-medium">
            {t("Original work log")}: {source.data.title} · {source.data.report_date}
          </p>
          <Button className="mt-5" onClick={() => navigate({ to: "/dashboard" })}>
            {t("Return to dashboard")}
          </Button>
        </div>
      </>
    );
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

  const removeTileButton = (label: string, onClick: () => void) => (
    <button
      type="button"
      aria-label={label}
      className="absolute right-1 top-1 grid size-7 place-items-center rounded-full bg-background/90 text-foreground"
      onClick={onClick}
    >
      <X className="size-4" aria-hidden="true" />
    </button>
  );

  return (
    <>
      <PageHeader
        title={
          mode === "edit"
            ? "Edit work log"
            : mode === "correct"
              ? "Create corrected version"
              : "Submit work log"
        }
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
      {mode === "correct" && source.data ? (
        <div
          role="status"
          className="mb-5 flex gap-3 rounded-xl border border-primary/25 bg-stat-gold/60 px-4 py-4"
        >
          <FilePenLine className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
          <div className="min-w-0">
            <p className="font-semibold">{t("You are creating a corrected version")}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {t(
                "The original work log is locked and stays unchanged in history. This form is prefilled from it; update what needs correcting, then submit the new version.",
              )}
            </p>
            <p className="mt-2 truncate text-xs font-medium">
              {t("Original work log")}: {source.data.title} · {source.data.report_date}
              {source.data.report_time ? ` ${source.data.report_time.slice(0, 5)}` : ""}
            </p>
          </div>
        </div>
      ) : mode === "edit" && source.data ? (
        <div className="mb-5 rounded-lg border border-border bg-stat-gold/60 px-4 py-3">
          <p className="text-sm font-medium">
            {t("Editing")}: {source.data.title}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {source.data.report_date}
            {source.data.report_time ? ` ${source.data.report_time.slice(0, 5)}` : ""} ·{" "}
            {t("Editable for 1 hour after submission.")}
          </p>
        </div>
      ) : mode === "new" && draftSavedAt ? (
        <div
          role="status"
          className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-stat-gold/60 px-4 py-3"
        >
          <div className="min-w-0">
            <p className="text-sm font-medium">{t("Unsubmitted draft restored")}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {t("Saved on this device and cleared once you submit.")}
            </p>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={discardDraft}>
            {t("Discard draft")}
          </Button>
        </div>
      ) : null}
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
          <Field label="Duration" id="hours">
            <Input
              id="hours"
              type="number"
              step={durationInput.step}
              min="0"
              max={durationInput.max}
              value={hours}
              onChange={(event) => setHours(event.target.value)}
              placeholder={t("Duration")}
              aria-describedby="duration-help"
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
          <p id="duration-help" className="col-span-2 text-xs text-muted-foreground">
            {durationUnit === "days"
              ? t("Enter how many days this work took, up to 31.")
              : t("Switch to days for work that ran over several days.")}
          </p>
        </div>
        {isAdmin ? (
          <section className="space-y-3 rounded-lg border border-border bg-muted/20 p-3">
            <div>
              <h2 className="flex flex-wrap items-center gap-1.5 text-sm font-semibold">
                <Users className="size-4 text-primary" aria-hidden="true" />
                {t("Participants")}
                {groupParticipantIds ? (
                  <Badge variant="outline">
                    {t("Team work log")} · {participantsLabel(groupParticipantIds.length, t)}
                  </Badge>
                ) : null}
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">
                {t(
                  "Select the staff who took part; each of them is credited with these hours. Leave the list empty for a personal log.",
                )}
              </p>
            </div>
            <label className="flex items-center justify-between gap-3 rounded-md border border-border bg-card px-3 py-2 text-sm">
              <span className="font-medium">{t("Include myself")}</span>
              <Switch checked={includeMe} onCheckedChange={setIncludeMe} />
            </label>
            {selectedPeople.length ? (
              <ul className="flex flex-wrap gap-1.5">
                {selectedPeople.map((person) => {
                  const name = personDisplayName(person, t("Unknown user"));
                  return (
                    <li key={person.id}>
                      <button
                        type="button"
                        onClick={() => toggleParticipant(person.id)}
                        aria-label={`${t("Remove")} ${name}`}
                        className="flex items-center gap-1.5 rounded-full border border-primary/25 bg-stat-teal py-0.5 pl-0.5 pr-2 text-xs font-medium text-primary"
                      >
                        <Avatar className="size-5">
                          <AvatarImage src={person.avatar_url ?? undefined} alt="" />
                          <AvatarFallback className="text-[9px] font-semibold">
                            {personInitials(person.full_name, person.email)}
                          </AvatarFallback>
                        </Avatar>
                        <span>{name}</span>
                        <X className="size-3" aria-hidden="true" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : null}
            <div className="flex gap-2">
              <Input
                value={staffSearch}
                onChange={(event) => setStaffSearch(event.target.value)}
                placeholder={t("Search staff")}
                aria-label={t("Search staff")}
              />
              <Button
                type="button"
                variant="outline"
                className="shrink-0"
                disabled={assignedSelectable.length === 0}
                onClick={selectAssignedStaff}
              >
                {t("Select assigned staff")}
              </Button>
            </div>
            <div className="max-h-64 divide-y divide-border overflow-y-auto rounded-md border border-border bg-card">
              {selectableStaff.map((person) => {
                const checked = participantIds.includes(person.id);
                const name = personDisplayName(person, t("Unknown user"));
                return (
                  <label
                    key={person.id}
                    className={cn(
                      "flex cursor-pointer items-center gap-3 px-3 py-2 text-sm transition-colors hover:bg-muted/60",
                      checked && "bg-stat-teal/50",
                    )}
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={() => toggleParticipant(person.id)}
                      aria-label={name}
                    />
                    <Avatar className="size-7 border border-border">
                      <AvatarImage src={person.avatar_url ?? undefined} alt="" />
                      <AvatarFallback className="text-[10px] font-semibold">
                        {personInitials(person.full_name, person.email)}
                      </AvatarFallback>
                    </Avatar>
                    <span className="min-w-0 flex-1 truncate">
                      {name}
                      {person.job_title ? (
                        <span className="text-muted-foreground"> · {person.job_title}</span>
                      ) : null}
                    </span>
                    {projectMemberIds.has(person.id) ? (
                      <Badge variant="outline" className="shrink-0">
                        {t("Assigned")}
                      </Badge>
                    ) : null}
                  </label>
                );
              })}
              {selectableStaff.length === 0 ? (
                <p className="px-3 py-4 text-center text-xs text-muted-foreground">
                  {people.isLoading ? t("Loading staff…") : t("No staff match your search.")}
                </p>
              ) : null}
            </div>
          </section>
        ) : null}
        <div
          className={cn(
            "rounded-lg border border-dashed border-border bg-muted/20 p-3 transition-colors",
            isDraggingMedia && "border-foreground bg-muted/50",
          )}
          onDragEnter={(event) => {
            event.preventDefault();
            setIsDraggingMedia(true);
          }}
          onDragOver={(event) => event.preventDefault()}
          onDragLeave={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node)) {
              setIsDraggingMedia(false);
            }
          }}
          onDrop={(event) => {
            event.preventDefault();
            setIsDraggingMedia(false);
            void addFiles(event.dataTransfer.files);
          }}
        >
          <label
            htmlFor="report-media"
            className="flex min-h-24 cursor-pointer flex-col items-center justify-center gap-1 rounded-md text-center"
          >
            <ImagePlus className="size-5 text-muted-foreground" aria-hidden="true" />
            <span className="text-sm font-medium">
              {t("Drag photos or videos here or tap to choose")}
            </span>
            <span className="text-xs text-muted-foreground">
              {t("JPG, PNG or WebP · Up to 5 · 5 MB each")}
            </span>
            <span className="text-xs text-muted-foreground">
              {t("MP4, WebM or MOV · Up to 2 · 50 MB each")}
            </span>
          </label>
          <input
            id="report-media"
            type="file"
            accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime"
            multiple
            className="sr-only"
            onChange={(event) => {
              if (event.target.files) void addFiles(event.target.files);
              event.target.value = "";
            }}
          />
          {existingImages.length || existingVideos.length ? (
            <div className="mt-3">
              <p className="mb-2 text-xs text-muted-foreground">{t("Existing attachments")}</p>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                {existingImages.map((path) => (
                  <div key={path} className="relative aspect-square overflow-hidden rounded-md">
                    <img src={reportImageUrl(path)} alt="" className="size-full object-cover" />
                    {removeTileButton(t("Remove image"), () =>
                      setExistingImages((current) => current.filter((item) => item !== path)),
                    )}
                  </div>
                ))}
                {existingVideos.map((path) => (
                  <div
                    key={path}
                    className="relative aspect-square overflow-hidden rounded-md bg-black"
                  >
                    <WorkLogVideoPoster path={path} className="size-full object-cover" />
                    <span className="pointer-events-none absolute inset-0 grid place-items-center">
                      <Play className="size-6 fill-current text-white" aria-hidden="true" />
                    </span>
                    {removeTileButton(t("Remove video"), () =>
                      setExistingVideos((current) => current.filter((item) => item !== path)),
                    )}
                  </div>
                ))}
              </div>
            </div>
          ) : null}
          {images.length || videos.length ? (
            <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-5">
              {images.map((image) => (
                <div key={image.id} className="relative aspect-square overflow-hidden rounded-md">
                  <img
                    src={image.preview}
                    alt={image.file.name}
                    className="size-full object-cover"
                  />
                  {removeTileButton(t("Remove image"), () => removeImage(image.id))}
                </div>
              ))}
              {videos.map((video) => (
                <div
                  key={video.id}
                  className="relative aspect-square overflow-hidden rounded-md bg-black"
                >
                  {video.posterUrl ? (
                    <img src={video.posterUrl} alt="" className="size-full object-cover" />
                  ) : (
                    <video
                      src={video.preview}
                      muted
                      playsInline
                      preload="metadata"
                      className="size-full object-cover"
                    />
                  )}
                  <span className="pointer-events-none absolute inset-0 grid place-items-center">
                    <Play className="size-6 fill-current text-white" aria-hidden="true" />
                  </span>
                  {video.duration !== null ? (
                    <span className="absolute bottom-1 left-1 rounded bg-black/70 px-1 py-0.5 text-[10px] font-medium tabular-nums text-white">
                      {formatDuration(video.duration)}
                    </span>
                  ) : null}
                  {removeTileButton(t("Remove video"), () => removeVideo(video.id))}
                </div>
              ))}
            </div>
          ) : null}
          <p className="mt-3 text-center text-xs text-muted-foreground">
            {t(
              "Photos are compressed to WebP in your browser before upload. Videos are uploaded as recorded.",
            )}
          </p>
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
        <div className="flex flex-wrap items-center justify-end gap-2">
          {uploadStep ? (
            <p className="mr-auto text-xs text-muted-foreground" role="status">
              {uploadStep}
            </p>
          ) : null}
          <Button type="button" variant="outline" onClick={() => navigate({ to: "/dashboard" })}>
            {t("Cancel")}
          </Button>
          <Button type="submit" disabled={save.isPending}>
            {save.isPending
              ? mode === "edit"
                ? t("Saving…")
                : t("Submitting…")
              : mode === "edit"
                ? t("Save changes")
                : mode === "correct"
                  ? t("Create corrected version")
                  : t("Submit work")}
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
