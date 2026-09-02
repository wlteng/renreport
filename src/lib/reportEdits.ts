/**
 * Authors may edit or delete a work log for this long after submitting it.
 * Mirrors public.report_edit_window() in the database.
 */
export const REPORT_EDIT_WINDOW_MS = 60 * 60 * 1000;

export function isWithinEditWindow(createdAt: string, now = Date.now()) {
  return now - new Date(createdAt).getTime() < REPORT_EDIT_WINDOW_MS;
}
