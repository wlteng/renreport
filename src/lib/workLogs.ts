import type { KeyboardEvent } from "react";

import type { ReportRow } from "@/hooks/useData";
import { REPORT_TYPE_LABEL } from "@/lib/roles";

/** Badge tones per work status, drawn from the logbook stat palette. */
export const STATUS_TONE: Record<string, string> = {
  completed: "border-transparent bg-stat-teal text-secondary-foreground",
  in_progress: "border-transparent bg-stat-gold text-foreground",
  blocked: "border-transparent bg-stat-copper text-accent-foreground",
};

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

/** Hours a work log adds to a team total: every participant is credited in full. */
export function creditedHours(report: CreditedReport & Pick<ReportRow, "hours_spent">) {
  return Number(report.hours_spent) * reportParticipants(report).length;
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
    `${Number(report.hours_spent).toFixed(1)}h`,
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
