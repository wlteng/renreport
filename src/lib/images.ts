/**
 * Downscales a photo in the browser before upload so phone pictures stay
 * small. Returns the original file when the browser cannot encode, when the
 * picture is already small, or when re-encoding would not save anything.
 */
export async function compressImage(
  file: File,
  { maxSize = 1600, quality = 0.82 }: { maxSize?: number; quality?: number } = {},
): Promise<File> {
  if (typeof window === "undefined" || typeof createImageBitmap !== "function") return file;
  try {
    // "from-image" applies the EXIF rotation so landscape phone shots stay upright.
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size <= 600 * 1024) {
      bitmap.close();
      return file;
    }
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) {
      bitmap.close();
      return file;
    }
    context.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    const blob =
      (await encode(canvas, "image/webp", quality)) ??
      (await encode(canvas, "image/jpeg", quality));
    if (!blob || blob.size >= file.size) return file;
    const extension = blob.type === "image/webp" ? "webp" : "jpg";
    const name = `${file.name.replace(/\.[^.]+$/, "") || "photo"}.${extension}`;
    return new File([blob], name, { type: blob.type, lastModified: Date.now() });
  } catch {
    return file;
  }
}

function encode(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob | null>((resolve) => {
    canvas.toBlob((blob) => resolve(blob && blob.type === type ? blob : null), type, quality);
  });
}
