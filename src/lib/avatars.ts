import { supabase } from "@/integrations/supabase/client";
import { compressImage } from "@/lib/images";

export const AVATAR_BUCKET = "avatars";
export const AVATAR_ACCEPT = "image/jpeg,image/png,image/webp";
export const AVATAR_MAX_BYTES = 5 * 1024 * 1024;

const AVATAR_TYPES = new Set(AVATAR_ACCEPT.split(","));

export function isAllowedAvatar(file: File) {
  return AVATAR_TYPES.has(file.type) && file.size <= AVATAR_MAX_BYTES;
}

/** Compresses and stores an avatar in the profile owner's folder. */
export async function uploadAvatarFile(ownerId: string, original: File) {
  const file = await compressImage(original, { maxSize: 512, quality: 0.85 });
  const extension = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const path = `${ownerId}/${Date.now()}.${extension}`;
  const { error } = await supabase.storage
    .from(AVATAR_BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw error;
  const url = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path).data.publicUrl;
  return { path, url };
}
