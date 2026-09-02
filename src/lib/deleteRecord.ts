import { FunctionsHttpError } from "@supabase/supabase-js";

import { supabase } from "@/integrations/supabase/client";

export type DeleteRecordKind = "report" | "project";

export type DeleteRecordResult = {
  deleted: boolean;
  files: number;
  reports?: number;
};

/**
 * Deletes a work log or a whole project through the delete-record edge function,
 * which removes the database rows and every photo stored for them together.
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
