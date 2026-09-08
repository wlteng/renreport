import type { KeyboardEvent } from "react";

import type { ReportRow } from "@/hooks/useData";
import { REPORT_TYPE_LABEL } from "@/lib/roles";

/** Badge tones per work status, drawn from the logbook stat palette. */
export const STATUS_TONE: Record<string, string> = {
  completed: "border-transparent bg-stat-teal text-secondary-foreground",
  in_progress: "border-transparent bg-stat-gold text-foreground",
  blocked: "border-transparent bg-stat-copper text-accent-foreground",
};

/** Hours in a day, used when a duration has to be normalized to hours. */
export const HOURS_PER_DAY = 24;

export type DurationUnit = "days" | "hours" | "mins";

/** The duration fields of a work log, as they were entered. */
type TimedReport = Pick<ReportRow, "hours_spent" | "duration_value" | "duration_unit">;

export function durationUnitOf(report: TimedReport): DurationUnit {
  return report.duration_unit === "days" || report.duration_unit === "mins"
    ? report.duration_unit
    : "hours";
}

/** The number as it was typed, falling back to the hours of an older log. */
export function durationValueOf(report: TimedReport) {
  const value = Number(report.duration_value);
  return Number.isFinite(value) && value > 0 ? value : Number(report.hours_spent);
}

/**
 * Duration of a work log in the unit it was entered in. A five day site visit
 * reads as five days, never as 120 hours, because pay is counted per day.
 */
export function formatWorkDuration(report: TimedReport) {
  const value = durationValueOf(report);
  const rounded = Number.isInteger(value) ? String(value) : value.toFixed(1);
  const unit = durationUnitOf(report);
  return unit === "days" ? `${rounded}d` : unit === "mins" ? `${rounded}m` : `${rounded}h`;
}

/** Days and hours of a work log kept apart, since the two are never added. */
export type DurationTotal = { days: number; hours: number };

export function durationOf(report: TimedReport): DurationTotal {
  const unit = durationUnitOf(report);
  const value = durationValueOf(report);
  if (unit === "days") return { days: value, hours: 0 };
  return { days: 0, hours: unit === "mins" ? value / 60 : value };
}

export function addDuration(total: DurationTotal, next: DurationTotal): DurationTotal {
  return { days: total.days + next.days, hours: total.hours + next.hours };
}

export const EMPTY_DURATION: DurationTotal = { days: 0, hours: 0 };

/** A total as "3d · 12.5h", dropping whichever half is zero. */
export function formatDurationTotal(total: DurationTotal) {
  const parts: string[] = [];
  if (total.days > 0) {
    parts.push(`${Number.isInteger(total.days) ? total.days : total.days.toFixed(1)}d`);
  }
  if (total.hours > 0 || parts.length === 0) parts.push(`${total.hours.toFixed(1)}h`);
  return parts.join(" · ");
}

/** The directory fields needed to show a person on a work log. */
export type WorkLogPerson = {
  id: string;
  full_name: string | null;
  email: string | null;
  avatar_url: string | null;
};

type CreditedReport = Pick<ReportRow, "user_id" | "participant_ids">;

/** A group log lists several people; a personal log credits its author alone. */
export function isGroupReport(report: Pick<ReportRow, "participant_ids">) {
  return (report.participant_ids?.length ?? 0) > 0;
}

/** Everyone credited with the hours of a work log. */
export function reportParticipants(report: CreditedReport): string[] {
  return report.participant_ids?.length ? report.participant_ids : [report.user_id];
}

/** Whether the hours of a work log count toward this person's own record. */
export function reportCreditsUser(report: CreditedReport, userId: string | undefined) {
  return !!userId && reportParticipants(report).includes(userId);
}

/** Time a work log adds to a team total: every participant is credited in full. */
export function creditedDuration(report: CreditedReport & TimedReport): DurationTotal {
  const people = reportParticipants(report).length;
  const own = durationOf(report);
  return { days: own.days * people, hours: own.hours * people };
}

/** Directory entries for everyone credited on a work log; unknown ids still count. */
export function participantsOf<P extends WorkLogPerson>(
  report: CreditedReport,
  peopleById: ReadonlyMap<string, P>,
): WorkLogPerson[] {
  return reportParticipants(report).map(
    (id) => peopleById.get(id) ?? { id, full_name: null, email: null, avatar_url: null },
  );
}

/** "3 people" / "3 人" for a group work log. */
export function participantsLabel(count: number, t: (text: string) => string) {
  return `${count} ${t("people")}`;
}

/** Drops work logs that a later correction has replaced, keeping only the latest version. */
export function currentReports<T extends Pick<ReportRow, "id" | "supersedes_report_id">>(
  reports: T[],
) {
  const superseded = new Set(
    reports.map((report) => report.supersedes_report_id).filter((id): id is string => !!id),
  );
  return reports.filter((report) => !superseded.has(report.id));
}

/** Earlier versions of a work log, newest first. */
export function historyOf(report: ReportRow, all: ReportRow[]) {
  const byId = new Map(all.map((item) => [item.id, item]));
  const history: ReportRow[] = [];
  let cursor: ReportRow | undefined = report;
  while (cursor?.supersedes_report_id) {
    const previous = byId.get(cursor.supersedes_report_id);
    if (!previous || history.includes(previous)) break;
    history.push(previous);
    cursor = previous;
  }
  return history;
}

export function reportStamp(report: ReportRow) {
  return `${report.report_date}${report.report_time ? ` ${report.report_time.slice(0, 5)}` : ""}`;
}

export function reportMeta(
  report: ReportRow,
  projectName: string,
  t: (text: string) => string,
  personName?: string,
) {
  return [
    ...(personName ? [personName] : []),
    t(REPORT_TYPE_LABEL[report.report_type] ?? report.report_type) +
      (report.activity_detail ? ` · ${report.activity_detail}` : ""),
    projectName,
    formatWorkDuration(report),
  ].join(" · ");
}

/** Keyboard activation for list rows that act like buttons but contain buttons. */
export function rowKeyHandler(onOpen: () => void) {
  return (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onOpen();
    }
  };
}
