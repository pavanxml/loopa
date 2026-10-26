/**
 * Object storage service — interface + swappable implementation.
 *
 * Per the product spec: media never lives in the relational DB, only its
 * key/URL does (see `post_media.storageKey` / `.url`). This interface is
 * the seam between the app and whichever provider backs it.
 *
 * Local implementation: private disk under UPLOAD_DIR or .data/uploads. It includes
 * a real thumbnail/probe pipeline, not a stub:
 *   - Images: resized via `sharp` to a JPEG thumbnail, with true pixel
 *     dimensions read from the file.
 *   - Videos: poster-frame thumbnail via the system `ffmpeg` binary plus
 *     real duration/dimensions from `ffprobe`. If ffmpeg isn't installed
 *     on the host, uploads still succeed — they come back without a
 *     thumbnail/duration (logged) rather than failing over an optional feature.
 *
 * Production: implement the same interface against S3 / R2 / GCS (presigned
 * PUT URLs, plus a queued worker for thumbnailing instead of doing it inline
 * on the request) and swap the export at the bottom of this file.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import sharp from "sharp";

export interface UploadResult {
  storageKey: string;
  url: string;
  thumbnailUrl?: string;
  width?: number;
  height?: number;
  durationMs?: number;
}

export interface StorageService {
  upload(input: { buffer: Buffer; mimeType: string; kind: "image" | "video" }): Promise<UploadResult>;
  delete(storageKey: string): Promise<void>;
}

const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const ALLOWED_VIDEO_TYPES = new Set(["video/mp4", "video/webm", "video/quicktime"]);
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_VIDEO_BYTES = 25 * 1024 * 1024;
const THUMBNAIL_MAX_DIMENSION = 480;

export class MediaValidationError extends Error {}

/** Runs a command, resolving stdout — or null if the binary is missing/fails. Never throws. */
function runCommand(bin: string, args: string[]): Promise<string | null> {
  return new Promise((resolve) => {
    const child = spawn(bin, args, { windowsHide: true });
    const timer = setTimeout(() => { child.kill(); resolve(null); }, 15000);
    let stdout = "";
    child.stdout?.on("data", (d) => (stdout += d.toString()));
    child.on("error", () => { clearTimeout(timer); resolve(null); });
    child.on("close", (code) => { clearTimeout(timer); resolve(code === 0 ? stdout : null); });
  });
}

class LocalDiskStorage implements StorageService {
  private uploadsDir = path.resolve(process.env.UPLOAD_DIR ?? ".data/uploads");

  async upload({ buffer, mimeType, kind }: { buffer: Buffer; mimeType: string; kind: "image" | "video" }) {
    const allowed = kind === "image" ? ALLOWED_IMAGE_TYPES : ALLOWED_VIDEO_TYPES;
    if (!allowed.has(mimeType)) {
      throw new MediaValidationError(`Unsupported ${kind} type: ${mimeType}`);
    }
    const maxBytes = kind === "image" ? MAX_IMAGE_BYTES : MAX_VIDEO_BYTES;
    if (buffer.byteLength > maxBytes) {
      throw new MediaValidationError(`File exceeds ${maxBytes / (1024 * 1024)}MB limit`);
    }

    if (kind === "image") {
      try {
        buffer = await sharp(buffer, { limitInputPixels: 40_000_000 }).rotate().resize(4096,4096,{fit:"inside",withoutEnlargement:true}).jpeg({quality:88}).toBuffer();
        mimeType = "image/jpeg";
      } catch { throw new MediaValidationError("This file is not a supported, valid image."); }
    } else {
      const mp4 = buffer.subarray(4,8).toString() === "ftyp";
      const webm = buffer.subarray(0,4).equals(Buffer.from([0x1a,0x45,0xdf,0xa3]));
      if ((mimeType === "video/webm" && !webm) || (mimeType !== "video/webm" && !mp4)) throw new MediaValidationError("Video contents do not match the file type.");
    }
    await fs.mkdir(this.uploadsDir, { recursive: true });
    const ext = mimeType.split("/")[1] ?? "bin";
    const storageKey = `${kind}/${randomUUID()}.${ext}`;
    const fullPath = path.join(this.uploadsDir, storageKey);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, buffer);

    const result: UploadResult = { storageKey, url: `/api/media/${storageKey}` };
    if (kind === "image") await this.processImage(buffer, storageKey, result);
    else await this.processVideo(fullPath, storageKey, result);
    return result;
  }

  private async processImage(buffer: Buffer, storageKey: string, result: UploadResult): Promise<void> {
    try {
      const meta = await sharp(buffer).metadata();
      result.width = meta.width;
      result.height = meta.height;

      const thumbBuffer = await sharp(buffer)
        .resize(THUMBNAIL_MAX_DIMENSION, THUMBNAIL_MAX_DIMENSION, { fit: "inside", withoutEnlargement: true })
        .jpeg({ quality: 72 })
        .toBuffer();

      const thumbKey = storageKey.replace(/\.\w+$/, "_thumb.jpg");
      await fs.writeFile(path.join(this.uploadsDir, thumbKey), thumbBuffer);
      result.thumbnailUrl = `/api/media/${thumbKey}`;
    } catch (err) {
      // A malformed-but-mime-valid image shouldn't fail the upload — the
      // original is saved; just skip the thumbnail.
      console.error("[storage] image thumbnail generation failed:", (err as Error).message);
    }
  }

  private async processVideo(fullPath: string, storageKey: string, result: UploadResult): Promise<void> {
    const probe = await runCommand("ffprobe", [
      "-v", "error", "-select_streams", "v:0",
      "-show_entries", "stream=width,height:format=duration",
      "-of", "csv=p=0", fullPath,
    ]);
    if (probe === null) {
      console.error("[storage] ffprobe unavailable — video saved without duration/dimensions/thumbnail");
      return;
    }

    const lines = probe.trim().split("\n");
    const [w, h] = (lines[0] ?? "").split(",").map(Number);
    const duration = parseFloat(lines[1] ?? "0");
    if (w) result.width = w;
    if (h) result.height = h;
    if (duration > 0) result.durationMs = Math.round(duration * 1000);

    const thumbKey = storageKey.replace(/\.\w+$/, "_thumb.jpg");
    const thumbPath = path.join(this.uploadsDir, thumbKey);
    // Frame 10% in, not frame zero (often black).
    const seek = duration > 1 ? (duration * 0.1).toFixed(2) : "0";

    const out = await runCommand("ffmpeg", [
      "-y", "-ss", seek, "-i", fullPath, "-frames:v", "1",
      "-vf", `scale='min(${THUMBNAIL_MAX_DIMENSION},iw)':-2`, "-q:v", "4", thumbPath,
    ]);
    if (out !== null) result.thumbnailUrl = `/api/media/${thumbKey}`;
    else console.error("[storage] ffmpeg unavailable — video saved without a poster thumbnail");
  }

  async delete(storageKey: string) {
    if (!/^(image|video)\/[a-f0-9-]+\.[a-z0-9]+$/.test(storageKey)) throw new MediaValidationError("Invalid storage key");
    const thumb = storageKey.replace(/\.\w+$/, "_thumb.jpg");
    await Promise.all([
      fs.rm(path.join(this.uploadsDir, storageKey), { force: true }),
      fs.rm(path.join(this.uploadsDir, thumb), { force: true }),
    ]);
  }
}

export const storageService: StorageService = new LocalDiskStorage();
