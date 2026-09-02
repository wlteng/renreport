import { supabase } from "@/integrations/supabase/client";

export const REPORT_IMAGE_BUCKET = "report-images";
export const REPORT_IMAGE_LIMIT = 5;
export const REPORT_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const REPORT_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export function reportImageUrl(pathOrUrl: string) {
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  return supabase.storage.from(REPORT_IMAGE_BUCKET).getPublicUrl(pathOrUrl).data.publicUrl;
}

export async function removeReportImages(paths: string[]) {
  const storedPaths = paths.filter((path) => !/^https?:\/\//i.test(path));
  if (!storedPaths.length) return;
  const { error } = await supabase.storage.from(REPORT_IMAGE_BUCKET).remove(storedPaths);
  if (error) throw error;
}
