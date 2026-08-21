"use client";

import { OsConfirmDialog } from "@/components/os/os-confirm-dialog";
import { useDesktopActions } from "@/lib/os/window-store";
import { cn } from "@/lib/utils";
import { FileAudio, FileText, FileVideo, Image as ImageIcon, Loader2, Trash2, Upload } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type FileKind = "pdf" | "image" | "audio" | "video";

type OrgFile = {
  id: string;
  organization_id: string;
  name: string;
  kind: FileKind;
  content_type: string;
  size_bytes: number;
  blob_url: string;
  uploaded_by: string | null;
  created_at: string;
};

type Usage = { used: number; limit: number };

const KIND_ICON: Record<FileKind, typeof FileText> = {
  pdf: FileText,
  image: ImageIcon,
  audio: FileAudio,
  video: FileVideo,
};

const KIND_TINT: Record<FileKind, string> = {
  pdf: "#E8B4B8",
  image: "#8FB8AC",
  audio: "#C3A6D8",
  video: "#7FA5C4",
};

const ACCEPT = "application/pdf,image/*,audio/*,video/*";

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * The org's shared file library, open as a window.
 *
 * Files live in Vercel Blob (same pipeline as note image uploads); this
 * window is the browse/upload/open/delete surface for that library, capped
 * per organisation via organizations.file_limit (see migration 019).
 */
export function FilesWindow({ orgId }: { orgId: string | null }) {
  const actions = useDesktopActions();
  const [files, setFiles] = useState<OrgFile[] | null>(null);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<OrgFile | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    if (!orgId) return;
    const res = await fetch(`/api/org-files?organizationId=${orgId}`);
    if (!res.ok) {
      setError("Could not load files.");
      return;
    }
    const body = (await res.json()) as { files: OrgFile[]; usage: Usage };
    setFiles(body.files);
    setUsage(body.usage);
  }, [orgId]);

  useEffect(() => {
    void load();
  }, [load]);

  const atLimit = usage ? usage.used >= usage.limit : false;

  /**
   * Opens one file as its own desktop window.
   *
   * Sized per kind rather than from the store's single default: a PDF is read
   * in a tall column, a video is watched in a wide one, and opening either at
   * the other's proportions wastes most of the window. Deduped on the file id,
   * so clicking the same file twice raises the window already showing it.
   */
  const openFile = useCallback(
    (file: OrgFile) => {
      const rect =
        file.kind === "video" || file.kind === "image"
          ? { x: 180, y: 90, width: 900, height: 620 }
          : file.kind === "audio"
            ? { x: 220, y: 200, width: 520, height: 200 }
            : { x: 200, y: 70, width: 760, height: 680 };

      actions.open({
        kind: "media",
        title: file.name,
        payload: { url: file.blob_url, name: file.name, kind: file.kind, fileId: file.id },
        dedupeKey: `media:${file.id}`,
        rect,
      });
    },
    [actions],
  );

  const handleUpload = useCallback(
    async (fileList: FileList | null) => {
      if (!fileList || fileList.length === 0 || !orgId) return;
      const file = fileList[0];

      setUploading(true);
      setUploadError(null);
      try {
        const form = new FormData();
        form.append("file", file);
        form.append("organizationId", orgId);

        const res = await fetch("/api/org-files", { method: "POST", body: form });
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          throw new Error(body?.error ?? "Upload failed");
        }

        const record = (await res.json()) as OrgFile;
        setFiles((prev) => [record, ...(prev ?? [])]);
        setUsage((prev) => (prev ? { ...prev, used: prev.used + 1 } : prev));
      } catch (err) {
        setUploadError(err instanceof Error ? err.message : "Upload failed");
      } finally {
        setUploading(false);
        if (inputRef.current) inputRef.current.value = "";
      }
    },
    [orgId],
  );

  async function handleConfirmDelete() {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/org-files/${pendingDelete.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");
      setFiles((prev) => (prev ?? []).filter((f) => f.id !== pendingDelete.id));
      setUsage((prev) => (prev ? { ...prev, used: Math.max(0, prev.used - 1) } : prev));
      // The blob is gone, so a window still showing it would render a broken
      // frame until the user noticed and closed it themselves.
      actions.close(`media:${pendingDelete.id}`);
      setPendingDelete(null);
    } catch {
      // Dialog stays open with the item selected so the user can retry.
    } finally {
      setDeleting(false);
    }
  }

  const grouped = useMemo(() => {
    if (!files) return [];
    const order: FileKind[] = ["pdf", "image", "audio", "video"];
    return order
      .map((kind) => ({ kind, items: files.filter((f) => f.kind === kind) }))
      .filter((g) => g.items.length > 0);
  }, [files]);

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-6 text-center">
        <p className="text-[13px] font-semibold text-black/55 dark:text-[#EDE7DD]/55">{error}</p>
      </div>
    );
  }

  if (!files || !usage) return <GridSkeleton />;

  return (
    <div
      className="flex h-full flex-col bg-white dark:bg-[#211e1a]"
      onDragOver={(e) => {
        e.preventDefault();
        if (!atLimit) setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        if (!atLimit) void handleUpload(e.dataTransfer.files);
      }}
    >
      {/* Storage indicator up top, always visible — the cap is the first thing
          that should register, since it is what decides whether "Upload" does
          anything. */}
      <div className="shrink-0 px-4 pb-2 pt-3.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] font-bold tabular-nums text-black/55 dark:text-[#EDE7DD]/55">
            {usage.used} / {usage.limit} files
          </span>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={uploading || atLimit}
            aria-label="Upload file"
            className={cn(
              "flex items-center gap-1.5 rounded-[7px] border-[2px] border-black px-2.5 py-1",
              "text-[11px] font-bold text-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]",
              "transition-[transform,box-shadow] duration-150",
              "dark:border-[#EDE7DD] dark:shadow-[2px_2px_0px_0px_rgba(255,255,255,0.9)]",
              atLimit || uploading
                ? "cursor-not-allowed bg-black/[0.06] text-black/30 shadow-none dark:bg-[#EDE7DD]/[0.06] dark:text-[#EDE7DD]/30"
                : "bg-[#FBBF24] hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none",
            )}
          >
            {uploading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2.5} />
            ) : (
              <Upload className="h-3.5 w-3.5" strokeWidth={2.5} />
            )}
            {uploading ? "Uploading…" : "Upload"}
          </button>
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT}
            className="hidden"
            onChange={(e) => void handleUpload(e.target.files)}
          />
        </div>

        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-black/[0.07] dark:bg-[#EDE7DD]/[0.1]">
          <div
            className={cn("h-full rounded-full transition-[width]", atLimit ? "bg-[#E8B4B8]" : "bg-[#FBBF24]")}
            style={{ width: `${Math.min(100, (usage.used / Math.max(1, usage.limit)) * 100)}%` }}
          />
        </div>

        {atLimit && (
          <p className="mt-1.5 text-[10.5px] font-medium text-[#B4636A] dark:text-[#E8B4B8]">
            File limit reached. Delete a file to upload another.
          </p>
        )}
        {uploadError && (
          <p className="mt-1.5 text-[10.5px] font-medium text-[#B4636A] dark:text-[#E8B4B8]">{uploadError}</p>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 os-scroll">
        {files.length === 0 ? (
          <div
            className={cn(
              "flex h-full flex-col items-center justify-center rounded-[12px] py-12 text-center transition-colors",
              dragOver && "bg-black/[0.03] dark:bg-[#EDE7DD]/[0.05]",
            )}
          >
            <div className="flex h-11 w-11 items-center justify-center rounded-[12px] bg-black/[0.05] dark:bg-[#EDE7DD]/[0.08]">
              <Upload className="h-5 w-5 text-black/30 dark:text-[#EDE7DD]/30" strokeWidth={2} />
            </div>
            <p className="mt-3 text-[13px] font-semibold text-black/50 dark:text-[#EDE7DD]/50">No files uploaded yet</p>
            <p className="mt-1 text-[11.5px] text-black/35 dark:text-[#EDE7DD]/35">
              Drag a PDF, image, audio or video file here, or click Upload.
            </p>
          </div>
        ) : (
          <div
            className={cn(
              "space-y-4 rounded-[12px] transition-colors",
              dragOver && "bg-black/[0.03] dark:bg-[#EDE7DD]/[0.05]",
            )}
          >
            {grouped.map(({ kind, items }) => (
              <section key={kind}>
                <h3 className="mb-1.5 px-1 text-[9.5px] font-bold uppercase tracking-[0.1em] text-black/35 dark:text-[#EDE7DD]/35">
                  {kind === "pdf" ? "PDFs" : `${kind}s`}
                </h3>
                <div className="grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(150px,1fr))]">
                  {items.map((file) => {
                    const Icon = KIND_ICON[file.kind];
                    return (
                      <div key={file.id} className="group/card relative">
                        <button
                          type="button"
                          onClick={() => openFile(file)}
                          className={cn(
                            "flex h-[92px] w-full flex-col rounded-[10px] p-3 text-left",
                            "bg-black/[0.035] ring-1 ring-inset ring-black/[0.06]",
                            "transition-[background-color,transform] duration-150",
                            "hover:-translate-y-0.5 hover:bg-black/[0.06]",
                            "dark:bg-[#EDE7DD]/[0.06] dark:ring-[#EDE7DD]/[0.08] dark:hover:bg-[#EDE7DD]/[0.1]",
                          )}
                        >
                          <Icon
                            className="mb-2 h-4 w-4 shrink-0"
                            style={{ color: KIND_TINT[file.kind] }}
                            strokeWidth={2.25}
                          />
                          <span className="line-clamp-2 flex-1 pr-5 text-[12.5px] font-semibold leading-snug text-black dark:text-[#EDE7DD]">
                            {file.name}
                          </span>
                          <span className="mt-1.5 text-[10px] tabular-nums text-black/30 dark:text-[#EDE7DD]/30">
                            {formatSize(file.size_bytes)}
                          </span>
                        </button>

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setPendingDelete(file);
                          }}
                          aria-label={`Delete ${file.name}`}
                          className={cn(
                            "absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-[6px]",
                            "text-black/30 opacity-0 transition-[opacity,background-color,color] duration-150",
                            "hover:bg-red-500/10 hover:text-red-500",
                            "group-hover/card:opacity-100 focus-visible:opacity-100",
                            "dark:text-[#EDE7DD]/30",
                          )}
                        >
                          <Trash2 className="h-3.5 w-3.5" strokeWidth={2.5} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>

      <OsConfirmDialog
        open={pendingDelete !== null}
        title="Delete this file?"
        body={`"${pendingDelete?.name}" will be removed for everyone in this organization. This can't be undone.`}
        confirmLabel={deleting ? "Deleting…" : "Delete"}
        onConfirm={handleConfirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}

function GridSkeleton() {
  return (
    <div className="grid gap-2 p-4 [grid-template-columns:repeat(auto-fill,minmax(150px,1fr))]" aria-hidden="true">
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <div
          key={i}
          className="h-[92px] rounded-[10px] bg-black/[0.05] animate-skeleton dark:bg-[#EDE7DD]/[0.07]"
          style={{ animationDelay: `${i * 70}ms` }}
        />
      ))}
    </div>
  );
}
