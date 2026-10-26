import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { newId } from "@/lib/id";
import { requireUser } from "@/lib/session";
import { checkRateLimit } from "@/lib/rateLimit";
import { ok, fail, handleError, ApiError } from "@/lib/api";
import { storageService, MediaValidationError } from "@/services/storage";
export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  try {
    const viewer = await requireUser();
    if (!(await checkRateLimit(`uploads:${viewer.sub}`, 20, 60000)).allowed)
      return fail("rate_limited", "Please wait before uploading again.", 429);
    const max = 26 * 1024 * 1024,
      reader = request.body?.getReader();
    if (!reader) throw new ApiError("invalid_upload", "Select a file.", 400);
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > max) {
        await reader.cancel();
        throw new ApiError(
          "file_too_large",
          "Maximum video size is 25 MB; images 10 MB.",
          413,
        );
      }
      chunks.push(value);
    }
    const parsed = new Request(request.url, {
      method: "POST",
      headers: { "Content-Type": request.headers.get("content-type") ?? "" },
      body: Buffer.concat(chunks),
    });
    let form: FormData;
    try {
      form = await parsed.formData();
    } catch {
      throw new ApiError(
        "invalid_upload",
        "Send a multipart file upload.",
        400,
      );
    }
    const file = form.get("file");
    if (!(file instanceof File) || form.getAll("file").length !== 1)
      throw new ApiError("invalid_upload", "Upload one file at a time.", 400);
    const kind = file.type.startsWith("image/") ? "image" : "video";
    const result = await storageService.upload({
      buffer: Buffer.from(await file.arrayBuffer()),
      mimeType: file.type,
      kind,
    });
    try {
      db.prepare(
        `INSERT INTO uploads(id,userId,storageKey,url,kind,mimeType,size,createdAt) VALUES(?,?,?,?,?,?,?,?)`,
      ).run(
        newId(),
        viewer.sub,
        result.storageKey,
        result.url,
        kind,
        kind === "image" ? "image/jpeg" : file.type,
        file.size,
        new Date().toISOString(),
      );
    } catch (error) {
      await storageService.delete(result.storageKey);
      throw error;
    }
    return ok({ ...result, kind }, 201);
  } catch (error) {
    if (error instanceof MediaValidationError)
      return fail("invalid_media", error.message, 422);
    return handleError(error);
  }
}
