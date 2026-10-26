import { api } from "./apiClient";
export interface UploadedFile {
  url: string;
  kind: "image" | "video";
  thumbnailUrl?: string;
  width?: number;
  height?: number;
  durationMs?: number;
}
export async function uploadMedia(file: File): Promise<UploadedFile> {
  const max = file.type.startsWith("image/") ? 10 : 25;
  if (file.size > max * 1024 * 1024)
    throw new Error(`Maximum file size is ${max} MB.`);
  await api.get("/api/auth/me");
  const form = new FormData();
  form.append("file", file);
  const response = await fetch("/api/uploads", {
    method: "POST",
    body: form,
    credentials: "include",
    headers: { "X-Loopa-Request": "1" },
  });
  const json = await response.json();
  if (!response.ok || !json.ok)
    throw new Error(json.error?.message ?? "Upload failed. Please try again.");
  return json.data as UploadedFile;
}
