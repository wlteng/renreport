import { FunctionsHttpError } from "@supabase/supabase-js";

import { supabase } from "@/integrations/supabase/client";

export type DeleteRecordKind = "report" | "project" | "git_event";

export type DeleteRecordResult = {
  deleted: boolean;
  files: number;
  reports?: number;
};

/**
 * Deletes a work log, hides a synced GitHub event, or deletes a whole project
 * through the delete-record edge function. Stored work-log photos are cleaned up too.
 */
export async function deleteRecord(kind: DeleteRecordKind, id: string) {
  const { data, error } = await supabase.functions.invoke("delete-record", { body: { kind, id } });
  if (error) {
    let message = error.message;
    if (error instanceof FunctionsHttpError) {
      const body = (await error.context.json().catch(() => null)) as { error?: string } | null;
      if (body?.error) message = body.error;
    }
    throw new Error(message);
  }
  const result = data as (DeleteRecordResult & { error?: string }) | null;
  if (!result || result.error) throw new Error(result?.error ?? "Could not delete");
  return result;
}
