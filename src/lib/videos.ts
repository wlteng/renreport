/**
 * Video attachments on work logs.
 *
 * Videos are not re-encoded in the browser: a phone already stores them as
 * H.264/HEVC MP4 or WebM, and re-encoding on the device would take about as
 * long as the clip itself. Only a small WebP poster frame is captured so feeds
 * stay light; the clip is uploaded as recorded, within the size limit below.
 */
export const REPORT_VIDEO_LIMIT = 2;
export const REPORT_VIDEO_MAX_BYTES = 50 * 1024 * 1024;

const VIDEO_MIME_BY_EXTENSION: Record<string, string> = {
  mp4: "video/mp4",
  m4v: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
};

const VIDEO_EXTENSION_BY_MIME: Record<string, string> = {
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
};

/** True for a file the form should treat as a video rather than a photo. */
export function looksLikeVideo(file: File) {
  return file.type.startsWith("video/") || /\.(mp4|m4v|webm|mov)$/i.test(file.name);
}

/** The MIME type to upload a video with, or null when the format is not supported. */
export function videoMimeType(file: File) {
  if (VIDEO_EXTENSION_BY_MIME[file.type]) return file.type;
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  return VIDEO_MIME_BY_EXTENSION[extension] ?? null;
}

export function videoExtension(mimeType: string) {
  return VIDEO_EXTENSION_BY_MIME[mimeType] ?? "mp4";
}

function withoutExtension(path: string) {
  return path.replace(/\.[^./]+$/, "");
}

/** Storage path for a poster frame stored next to its video. */
export function videoPosterPath(videoPath: string, posterType: string) {
  return `${withoutExtension(videoPath)}.poster.${posterType === "image/webp" ? "webp" : "jpg"}`;
}

/** Poster paths to try for a stored video, most likely first. */
export function videoPosterCandidates(videoPath: string) {
  return [videoPosterPath(videoPath, "image/webp"), videoPosterPath(videoPath, "image/jpeg")];
}

export function formatDuration(seconds: number | null) {
  if (seconds === null || !Number.isFinite(seconds)) return "";
  const total = Math.round(seconds);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

export type VideoPreview = { duration: number | null; poster: Blob | null };

/** Reads the clip length and captures one frame as a small poster image. */
export async function previewVideo(
  file: File,
  { maxSize = 640, quality = 0.7, timeoutMs = 10000 } = {},
): Promise<VideoPreview> {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return { duration: null, poster: null };
  }
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.src = url;
  try {
    const duration = await withTimeout(loadMetadata(video), timeoutMs);
    let poster: Blob | null = null;
    try {
      await withTimeout(seekTo(video, Math.min(0.5, duration / 2)), timeoutMs);
      poster = await captureFrame(video, maxSize, quality);
    } catch {
      poster = null;
    }
    return { duration: Number.isFinite(duration) ? duration : null, poster };
  } catch {
    return { duration: null, poster: null };
  } finally {
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(url);
  }
}

function loadMetadata(video: HTMLVideoElement) {
  return new Promise<number>((resolve, reject) => {
    video.onloadedmetadata = () => resolve(video.duration);
    video.onerror = () => reject(new Error("Could not read video"));
  });
}

function seekTo(video: HTMLVideoElement, time: number) {
  return new Promise<void>((resolve, reject) => {
    video.onseeked = () => resolve();
    video.onerror = () => reject(new Error("Could not read video"));
    video.currentTime = Number.isFinite(time) ? time : 0;
  });
}

async function captureFrame(video: HTMLVideoElement, maxSize: number, quality: number) {
  const width = video.videoWidth;
  const height = video.videoHeight;
  if (!width || !height) return null;
  const scale = Math.min(1, maxSize / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const context = canvas.getContext("2d");
  if (!context) return null;
  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  // Older Safari cannot encode WebP; a JPEG poster is the fallback.
  return (
    (await encode(canvas, "image/webp", quality)) ?? (await encode(canvas, "image/jpeg", quality))
  );
}

function encode(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob | null>((resolve) => {
    canvas.toBlob((blob) => resolve(blob && blob.type === type ? blob : null), type, quality);
  });
}

function withTimeout<T>(promise: Promise<T>, ms: number) {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error("Timed out")), ms);
    promise.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        window.clearTimeout(timer);
        reject(error);
      },
    );
  });
}
