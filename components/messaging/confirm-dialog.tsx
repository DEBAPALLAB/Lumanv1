"use client";

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { FOCUS_RING, FRAME } from "./chrome";

/**
 * Destructive-action confirmation.
 *
 * Replaces window.confirm(), which cannot be styled, blocks the main thread,
 * and in the desktop build renders as a Chromium dialog that looks nothing
 * like the app around it.
 */
export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onCancel()}>
      <DialogContent
        className={cn(
          "max-w-sm gap-0 rounded-[10px] border-[3px] p-0",
          FRAME,
          "bg-white dark:bg-zinc-900",
          "shadow-[5px_5px_0px_0px_rgba(0,0,0,1)] dark:shadow-[5px_5px_0px_0px_rgba(255,255,255,1)]",
        )}
      >
        <div className="px-5 pb-4 pt-5">
          <DialogTitle className="text-[16px] font-bold tracking-[-0.02em] text-black dark:text-stone-100">
            {title}
          </DialogTitle>
          <p className="mt-1.5 text-[13px] leading-relaxed text-black/55 dark:text-stone-100/55">{body}</p>
        </div>

        <div
          className={cn(
            "flex justify-end gap-2 border-t-[2px] px-5 py-3",
            "border-black/10 dark:border-stone-100/10",
          )}
        >
          <button
            type="button"
            onClick={onCancel}
            className={cn(
              "rounded-[6px] border-[2px] px-3 py-1.5 text-[12px] font-semibold",
              "border-transparent text-black/60 dark:text-stone-100/60",
              "transition-colors duration-150 hover:bg-black/[0.05] dark:hover:bg-stone-100/[0.07]",
              FOCUS_RING,
            )}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={cn(
              "rounded-[6px] border-[2px] px-3 py-1.5 text-[12px] font-bold",
              FRAME,
              "bg-red-500 text-white",
              "shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] dark:shadow-[2px_2px_0px_0px_rgba(255,255,255,1)]",
              "transition-[transform,box-shadow] duration-150 hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px]",
              FOCUS_RING,
            )}
          >
            {confirmLabel}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
