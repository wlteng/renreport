import { Minus, Plus, RotateCcw, Users } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";

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
import type { ReportRow } from "@/hooks/useData";
import { useLanguage } from "@/lib/i18n";
import { personDisplayName, personInitials } from "@/lib/people";
import { reportImageUrl } from "@/lib/reportImages";
import { REPORT_TYPE_LABEL, WORK_STATUS_LABEL } from "@/lib/roles";
import { cn } from "@/lib/utils";
import {
  isGroupReport,
  participantsLabel,
  reportStamp,
  STATUS_TONE,
  type WorkLogPerson,
} from "@/lib/workLogs";

const ZOOM_LEVELS = [1, 1.5, 2, 3];

/** Minimal full-screen photo viewer with zoom in, zoom out and reset. */
export function ImageLightbox({ src, onClose }: { src: string | null; onClose: () => void }) {
  const { t } = useLanguage();
  const [zoom, setZoom] = useState(1);
  useEffect(() => setZoom(1), [src]);
  const step = (direction: 1 | -1) =>
    setZoom((current) => {
      const index = ZOOM_LEVELS.indexOf(current);
      return ZOOM_LEVELS[Math.min(ZOOM_LEVELS.length - 1, Math.max(0, index + direction))] ?? 1;
    });
  return (
    <Dialog
      open={src !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="block h-[100dvh] max-h-none w-screen max-w-none overflow-hidden rounded-none border-0 bg-black/95 p-0 shadow-none sm:p-0 [&>button]:right-3 [&>button]:top-3 [&>button]:z-10 [&>button]:rounded-full [&>button]:bg-black/60 [&>button]:p-2 [&>button]:text-white [&>button]:opacity-100">
        <DialogTitle className="sr-only">{t("Photo")}</DialogTitle>
        <DialogDescription className="sr-only">{t("Zoom in")}</DialogDescription>
        {src ? (
          <div className="h-full w-full overflow-auto">
            <div className="flex h-max min-h-full w-max min-w-full items-center justify-center">
              <img
                src={src}
                alt=""
                draggable={false}
                onDoubleClick={() => setZoom((current) => (current === 1 ? 2 : 1))}
                className={cn(
                  "select-none",
                  zoom === 1 ? "max-h-[100dvh] max-w-[100vw] object-contain" : "h-auto max-w-none",
                )}
                style={zoom === 1 ? undefined : { width: `${zoom * 100}vw` }}
              />
            </div>
          </div>
        ) : null}
        <div className="fixed bottom-[calc(env(safe-area-inset-bottom,0px)+16px)] left-1/2 z-10 flex -translate-x-1/2 items-center gap-1 rounded-full bg-black/60 p-1">
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="rounded-full text-white hover:bg-white/15 hover:text-white"
            aria-label={t("Zoom out")}
            disabled={zoom === ZOOM_LEVELS[0]}
            onClick={() => step(-1)}
          >
            <Minus />
          </Button>
          <span className="min-w-12 text-center text-xs font-medium tabular-nums text-white">
            {Math.round(zoom * 100)}%
          </span>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="rounded-full text-white hover:bg-white/15 hover:text-white"
            aria-label={t("Zoom in")}
            disabled={zoom === ZOOM_LEVELS[ZOOM_LEVELS.length - 1]}
            onClick={() => step(1)}
          >
            <Plus />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="rounded-full text-white hover:bg-white/15 hover:text-white"
            aria-label={t("Reset zoom")}
            disabled={zoom === 1}
            onClick={() => setZoom(1)}
          >
            <RotateCcw />
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Photos of a work log. A single photo is shown directly; several become
 * thumbnails. Every photo opens the lightbox.
 */
export function WorkLogImages({
  images,
  compact = false,
  onOpen,
}: {
  images: string[] | null | undefined;
  compact?: boolean;
  onOpen: (src: string) => void;
}) {
  const { t } = useLanguage();
  if (!images?.length) return null;
  const open = (image: string) => (event: { stopPropagation: () => void }) => {
    event.stopPropagation();
    onOpen(reportImageUrl(image));
  };
  if (images.length === 1) {
    const image = images[0]!;
    return (
      <button
        type="button"
        onClick={open(image)}
        aria-label={t("Photo")}
        className="block w-full overflow-hidden rounded-lg"
      >
        <img
          src={reportImageUrl(image)}
          alt=""
          className={cn("block h-auto object-contain", compact ? "max-h-56 max-w-full" : "w-full")}
        />
      </button>
    );
  }
  return (
    <div className="flex flex-wrap gap-2">
      {images.map((image) => (
        <button
          key={image}
          type="button"
          onClick={open(image)}
          aria-label={t("Photo")}
          className={cn("shrink-0 overflow-hidden rounded-md", compact ? "size-16" : "size-24")}
        >
          <img src={reportImageUrl(image)} alt="" className="size-full object-cover" />
        </button>
      ))}
    </div>
  );
}

/** Compact feed preview that opens the first attached photo in the lightbox. */
export function WorkLogThumbnail({
  images,
  onOpen,
}: {
  images: string[] | null | undefined;
  onOpen: (src: string) => void;
}) {
  const { t } = useLanguage();
  if (!images?.length) return null;
  const image = images[0]!;
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onOpen(reportImageUrl(image));
      }}
      aria-label={t("Photo")}
      className="relative size-14 shrink-0 overflow-hidden rounded-lg border border-border bg-muted transition-opacity hover:opacity-85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:size-16"
    >
      <img src={reportImageUrl(image)} alt="" className="size-full object-cover" />
      {images.length > 1 ? (
        <span className="absolute bottom-1 right-1 rounded-full bg-black/70 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white">
          +{images.length - 1}
        </span>
      ) : null}
    </button>
  );
}

/** Overlapping avatars for a group work log, with a "+N" bubble past the first few. */
export function ParticipantAvatars({
  people,
  max = 3,
  className,
}: {
  people: WorkLogPerson[];
  max?: number;
  className?: string;
}) {
  const shown = people.slice(0, max);
  const rest = people.length - shown.length;
  return (
    <div className={cn("flex shrink-0 -space-x-2.5", className)}>
      {shown.map((person) => (
        <Avatar key={person.id} className="size-9 border-2 border-card">
          <AvatarImage src={person.avatar_url ?? undefined} alt="" />
          <AvatarFallback className="text-xs font-semibold">
            {personInitials(person.full_name, person.email)}
          </AvatarFallback>
        </Avatar>
      ))}
      {rest > 0 ? (
        <span className="grid size-9 shrink-0 place-items-center rounded-full border-2 border-card bg-muted text-[10px] font-semibold text-muted-foreground">
          +{rest}
        </span>
      ) : null}
    </div>
  );
}

export function ReportBadges({ report }: { report: ReportRow }) {
  const { t } = useLanguage();
  return (
    <div className="flex flex-wrap gap-2">
      <Badge className={STATUS_TONE[report.work_status]}>
        {t(WORK_STATUS_LABEL[report.work_status] ?? report.work_status)}
      </Badge>
      <Badge variant="outline">
        {t(REPORT_TYPE_LABEL[report.report_type] ?? report.report_type)}
        {report.activity_detail ? ` · ${report.activity_detail}` : ""}
      </Badge>
      <Badge variant="outline">{Number(report.hours_spent).toFixed(1)}h</Badge>
      {isGroupReport(report) ? (
        <Badge variant="outline" className="gap-1">
          <Users className="size-3" aria-hidden="true" />
          {participantsLabel((report.participant_ids ?? []).length, t)}
        </Badge>
      ) : null}
    </div>
  );
}

export function ReportBody({
  report,
  compact = false,
  onOpenImage,
}: {
  report: ReportRow;
  compact?: boolean;
  onOpenImage: (src: string) => void;
}) {
  const { t } = useLanguage();
  return (
    <div className="space-y-3">
      <p
        className={cn(
          "whitespace-pre-wrap leading-relaxed text-foreground/90",
          compact ? "text-xs" : "text-sm",
        )}
      >
        {report.content}
      </p>
      {report.output_quantity !== null ? (
        <p className="text-xs font-medium">
          {t("Output")}: {Number(report.output_quantity).toLocaleString()} {report.output_unit}
        </p>
      ) : null}
      {report.blockers ? (
        <p className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
          {t("Blocker")}: {report.blockers}
        </p>
      ) : null}
      {report.links ? (
        <p className="break-all text-xs text-muted-foreground">{report.links}</p>
      ) : null}
      <WorkLogImages images={report.image_urls} compact={compact} onOpen={onOpenImage} />
    </div>
  );
}

/** Details of one work log with its earlier versions, plus optional actions. */
export function WorkLogDialog({
  report,
  history,
  projectName,
  personName,
  participants,
  notice,
  actions,
  showCloseAction = true,
  onClose,
  onOpenImage,
}: {
  report: ReportRow | null;
  history: ReportRow[];
  projectName: string;
  personName?: string | undefined;
  /** Everyone credited on a group work log; omitted for a personal log. */
  participants?: WorkLogPerson[] | undefined;
  notice?: ReactNode;
  actions?: ReactNode;
  showCloseAction?: boolean;
  onClose: () => void;
  onOpenImage: (src: string) => void;
}) {
  const { t } = useLanguage();
  const contentRef = useRef<HTMLDivElement>(null);
  return (
    <Dialog
      open={report !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        ref={contentRef}
        tabIndex={-1}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          contentRef.current?.focus({ preventScroll: true });
        }}
        className="max-h-[90vh] overflow-y-auto focus:outline-none sm:max-w-lg"
      >
        {report ? (
          <>
            <DialogHeader>
              <DialogTitle className="pr-6">{report.title}</DialogTitle>
              <DialogDescription>
                {personName ? `${personName} · ` : ""}
                {reportStamp(report)} · {projectName}
                {history.length ? ` · ${t("Correction")}` : ""}
              </DialogDescription>
            </DialogHeader>
            <ReportBadges report={report} />
            {participants?.length ? (
              <section className="space-y-2">
                <h3 className="logbook-label">
                  {t("Participants")} · {participants.length}
                </h3>
                <ul className="flex flex-wrap gap-1.5">
                  {participants.map((person) => (
                    <li
                      key={person.id}
                      className="flex items-center gap-1.5 rounded-full border border-border bg-muted/40 py-0.5 pl-0.5 pr-2.5 text-xs"
                    >
                      <Avatar className="size-5">
                        <AvatarImage src={person.avatar_url ?? undefined} alt="" />
                        <AvatarFallback className="text-[9px] font-semibold">
                          {personInitials(person.full_name, person.email)}
                        </AvatarFallback>
                      </Avatar>
                      <span>{personDisplayName(person, t("Unknown user"))}</span>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
            <ReportBody report={report} onOpenImage={onOpenImage} />
            {history.length ? (
              <section className="space-y-3 border-t border-border pt-4">
                <h3 className="logbook-label">{t("History")}</h3>
                {history.map((previous) => (
                  <details
                    key={previous.id}
                    className="rounded-lg border border-border bg-muted/40 px-3 py-2"
                  >
                    <summary className="cursor-pointer text-xs">
                      <span className="font-medium text-foreground">{previous.title}</span>
                      <span className="text-muted-foreground">
                        {" "}
                        · {reportStamp(previous)} · {Number(previous.hours_spent).toFixed(1)}h ·{" "}
                        {t("Superseded")}
                      </span>
                    </summary>
                    <div className="mt-2">
                      <ReportBody report={previous} compact onOpenImage={onOpenImage} />
                    </div>
                  </details>
                ))}
              </section>
            ) : null}
            {notice}
            {actions || showCloseAction ? (
              <DialogFooter className="sm:justify-between">
                {actions ?? <span />}
                {showCloseAction ? (
                  <DialogClose asChild>
                    <Button type="button">{t("Close")}</Button>
                  </DialogClose>
                ) : null}
              </DialogFooter>
            ) : null}
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
