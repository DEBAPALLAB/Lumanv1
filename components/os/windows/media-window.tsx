"use client";

import { cn } from "@/lib/utils";
import { PdfViewer } from "./pdf-viewer";

export type MediaKind = "pdf" | "image" | "audio" | "video";

/**
 * One file, open as its own desktop window.
 *
 * A window rather than an overlay inside the Files browser: a file you are
 * reading is a document you are working with, and the desktop already knows
 * how to keep several of those open, tiled, minimised and side by side. An
 * overlay would make "read this PDF while writing a note" impossible without
 * closing the thing you were reading.
 *
 * The window frame supplies the title bar and the close control, so this
 * renders only the content.
 */
export function MediaWindow({
  url,
  name,
  kind,
  fileId,
  userId,
  displayName,
}: {
  url: string;
  name: string;
  kind: MediaKind;
  /** The org_files row id, for annotations. Null disables them. */
  fileId: string | null;
  userId: string | null;
  displayName: string;
}) {
  // The PDF viewer owns its own toolbar and scroll container, so it fills the
  // window directly rather than sitting inside the scroll wrapper the other
  // kinds share.
  if (kind === "pdf") {
    return <PdfViewer url={url} name={name} fileId={fileId} userId={userId} displayName={displayName} />;
  }

  return (
    <div className={cn("h-full w-full overflow-auto bg-black/[0.02] os-scroll dark:bg-black/20")}>
      {kind === "image" && (
        <div className="flex h-full items-center justify-center p-4">
          <img src={url} alt={name} className="max-h-full max-w-full rounded-[8px] object-contain" />
        </div>
      )}

      {kind === "audio" && (
        <div className="flex h-full items-center justify-center p-6">
          {/* biome-ignore lint/a11y/useMediaCaption: user-uploaded file with no caption track available */}
          <audio src={url} controls autoPlay className="w-full max-w-md">
            <a href={url}>{name}</a>
          </audio>
        </div>
      )}

      {kind === "video" && (
        <div className="flex h-full items-center justify-center p-2">
          {/* biome-ignore lint/a11y/useMediaCaption: user-uploaded file with no caption track available */}
          <video src={url} controls autoPlay className="max-h-full max-w-full rounded-[8px]">
            <a href={url}>{name}</a>
          </video>
        </div>
      )}
    </div>
  );
}
