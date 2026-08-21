import { apiError, apiSuccess } from "@/lib/api-response";
import { requireUser } from "@/lib/auth/session";
import { createOrgFile, getFileUsage, listOrgFiles } from "@/lib/db/org-files";
import { getUserMembership } from "@/lib/db/organizations";
import { put } from "@vercel/blob";

export const runtime = "nodejs";

const MAX_SIZE_BYTES = 100 * 1024 * 1024;

const KIND_BY_CONTENT_TYPE: { test: (contentType: string) => boolean; kind: "pdf" | "image" | "audio" | "video" }[] = [
  { test: (c) => c === "application/pdf", kind: "pdf" },
  { test: (c) => c.startsWith("image/"), kind: "image" },
  { test: (c) => c.startsWith("audio/"), kind: "audio" },
  { test: (c) => c.startsWith("video/"), kind: "video" },
];

/**
 * GET /api/org-files?organizationId=...
 *
 * Every file the caller's org has uploaded, plus the org's usage/limit so the
 * Files window can render "3 / 10" without a second request.
 */
export async function GET(req: Request) {
  try {
    const session = await requireUser();
    if (!session) return apiError("Unauthorized", 401);
    const { user } = session;

    const { searchParams } = new URL(req.url);
    const organizationId = searchParams.get("organizationId");
    if (!organizationId) return apiError("organizationId is required", 400);

    const membership = await getUserMembership(organizationId, user.id);
    if (!membership) return apiError("Not a member of this organization", 403);

    const [files, usage] = await Promise.all([listOrgFiles(organizationId), getFileUsage(organizationId)]);

    return apiSuccess({ files, usage });
  } catch (err) {
    console.error("GET /api/org-files failed", err);
    return apiError(err instanceof Error ? err.message : "Internal server error", 500);
  }
}

/**
 * POST /api/org-files
 * multipart/form-data: file, organizationId
 *
 * Uploads to Vercel Blob and records the metadata row. Enforces the org's
 * file_limit here rather than in a DB trigger — same pattern as the founder
 * claim in lib/db/organizations.ts, app-layer checks alongside RLS.
 */
export async function POST(req: Request) {
  try {
    const session = await requireUser();
    if (!session) return apiError("Unauthorized", 401);
    const { user } = session;

    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      return apiError("Missing BLOB_READ_WRITE_TOKEN. Don't forget to add that to your .env file.", 401);
    }

    const form = await req.formData();
    const file = form.get("file");
    const organizationId = form.get("organizationId");

    if (!(file instanceof File)) return apiError("file is required", 400);
    if (typeof organizationId !== "string" || !organizationId) return apiError("organizationId is required", 400);

    const membership = await getUserMembership(organizationId, user.id);
    if (!membership) return apiError("Not a member of this organization", 403);

    const usage = await getFileUsage(organizationId);
    if (usage.used >= usage.limit) {
      return apiError(`This organization has reached its file limit (${usage.limit}).`, 409);
    }

    const contentType = file.type || "application/octet-stream";
    const match = KIND_BY_CONTENT_TYPE.find((m) => m.test(contentType));
    if (!match) {
      return apiError("Only PDF, image, audio and video files are supported.", 415);
    }

    if (file.size > MAX_SIZE_BYTES) {
      return apiError("File too large. Max size is 100MB.", 413);
    }

    const blob = await put(`org-files/${organizationId}/${crypto.randomUUID()}-${file.name}`, file, {
      contentType,
      access: "public",
    });

    const record = await createOrgFile({
      organizationId,
      name: file.name,
      kind: match.kind,
      contentType,
      sizeBytes: file.size,
      blobUrl: blob.url,
      uploadedBy: user.id,
    });

    return apiSuccess(record, 201);
  } catch (err) {
    console.error("POST /api/org-files failed", err);
    return apiError(err instanceof Error ? err.message : "Internal server error", 500);
  }
}
