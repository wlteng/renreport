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

/** A photo or video of a work log, ready for the full-screen viewer. */
export type LightboxMedia = { kind: "image" | "video"; src: string; path: string };

/** The photos and videos of a work log, in the order they are shown. */
export function galleryMedia(
  images: string[] | null | undefined,
  videos: string[] | null | undefined,
): LightboxMedia[] {
  return [
    ...(images ?? []).map((path) => ({ kind: "image" as const, src: reportImageUrl(path), path })),
    ...(videos ?? []).map((path) => ({ kind: "video" as const, src: reportImageUrl(path), path })),
  ];
}
