/**
 * Local draft of an unsubmitted work log.
 *
 * The submit form saves what has been typed to localStorage so a closed tab,
 * a reload or a phone that swaps the app out never loses the work. The draft
 * is cleared the moment the log is actually submitted, so a new form always
 * starts empty.
 */

const STORAGE_PREFIX = "renreport:work-log-draft";

/** Drafts older than this are ignored and dropped. */
const DRAFT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export type WorkLogDraft = {
  date: string;
  time: string;
  projectId: string;
  type: string;
  activityDetail: string;
  workStatus: string;
  title: string;
  content: string;
  hours: string;
  durationUnit: string;
  outputQuantity: string;
  outputUnit: string;
  blockers: string;
  links: string;
  participantIds: string[];
  includeMe: boolean;
};

export type StoredWorkLogDraft = WorkLogDraft & { savedAt: string };

function storageKey(userId: string) {
  return `${STORAGE_PREFIX}:${userId}`;
}

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    // Private modes and locked-down browsers throw on access.
    return null;
  }
}

const TEXT_FIELDS = [
  "projectId",
  "activityDetail",
  "title",
  "content",
  "hours",
  "outputQuantity",
  "outputUnit",
  "blockers",
  "links",
] as const;

/** A draft is worth keeping only once something was actually filled in. */
export function isDraftWorthSaving(draft: WorkLogDraft) {
  return (
    TEXT_FIELDS.some((field) => draft[field].trim() !== "") ||
    draft.participantIds.length > 0 ||
    !draft.includeMe
  );
}

export function saveWorkLogDraft(userId: string, draft: WorkLogDraft) {
  const store = storage();
  if (!store) return;
  try {
    if (!isDraftWorthSaving(draft)) {
      store.removeItem(storageKey(userId));
      return;
    }
    const stored: StoredWorkLogDraft = { ...draft, savedAt: new Date().toISOString() };
    store.setItem(storageKey(userId), JSON.stringify(stored));
  } catch {
    // A full or unavailable store must never break the form.
  }
}

export function clearWorkLogDraft(userId: string) {
  const store = storage();
  if (!store) return;
  try {
    store.removeItem(storageKey(userId));
  } catch {
    // Nothing to do; the draft is discarded on the next successful save.
  }
}

/** The stored draft for this user, or null when there is none or it expired. */
export function loadWorkLogDraft(userId: string): StoredWorkLogDraft | null {
  const store = storage();
  if (!store) return null;
  let raw: string | null = null;
  try {
    raw = store.getItem(storageKey(userId));
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<StoredWorkLogDraft> | null;
    if (!parsed || typeof parsed !== "object") throw new Error("malformed draft");
    const savedAt = typeof parsed.savedAt === "string" ? parsed.savedAt : "";
    const savedTime = Date.parse(savedAt);
    if (!Number.isFinite(savedTime) || Date.now() - savedTime > DRAFT_MAX_AGE_MS) {
      clearWorkLogDraft(userId);
      return null;
    }
    const text = (value: unknown) => (typeof value === "string" ? value : "");
    const draft: StoredWorkLogDraft = {
      savedAt,
      date: text(parsed.date),
      time: text(parsed.time),
      projectId: text(parsed.projectId),
      type: text(parsed.type),
      activityDetail: text(parsed.activityDetail),
      workStatus: text(parsed.workStatus),
      title: text(parsed.title),
      content: text(parsed.content),
      hours: text(parsed.hours),
      durationUnit: text(parsed.durationUnit),
      outputQuantity: text(parsed.outputQuantity),
      outputUnit: text(parsed.outputUnit),
      blockers: text(parsed.blockers),
      links: text(parsed.links),
      participantIds: Array.isArray(parsed.participantIds)
        ? parsed.participantIds.filter((id): id is string => typeof id === "string")
        : [],
      includeMe: parsed.includeMe !== false,
    };
    if (!isDraftWorthSaving(draft)) {
      clearWorkLogDraft(userId);
      return null;
    }
    return draft;
  } catch {
    clearWorkLogDraft(userId);
    return null;
  }
}
