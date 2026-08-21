"use client";

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

/**
 * Destructive-action confirmation, styled to match the OS shell (dock,
 * flyout, window chrome) rather than components/messaging/confirm-dialog.tsx,
 * whose colours belong to the messaging module's own palette.
 */
export function OsConfirmDialog({
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
          "max-w-sm gap-0 rounded-[13px] border-[2.5px] border-black p-0",
          "bg-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]",
          "dark:border-[#EDE7DD] dark:bg-[#211e1a] dark:shadow-[4px_4px_0px_0px_rgba(255,255,255,0.9)]",
        )}
      >
        <div className="px-5 pb-4 pt-5">
          <DialogTitle className="text-[15px] font-bold tracking-[-0.02em] text-black dark:text-[#EDE7DD]">
            {title}
          </DialogTitle>
          <p className="mt-1.5 text-[12.5px] leading-relaxed text-black/55 dark:text-[#EDE7DD]/55">{body}</p>
        </div>

        <div className="flex justify-end gap-2 border-t-[2px] border-black/10 px-5 py-3 dark:border-[#EDE7DD]/10">
          <button
            type="button"
            onClick={onCancel}
            className={cn(
              "rounded-[7px] px-3 py-1.5 text-[12px] font-semibold text-black/60",
              "transition-colors duration-150 hover:bg-black/[0.06]",
              "dark:text-[#EDE7DD]/60 dark:hover:bg-[#EDE7DD]/10",
            )}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={cn(
              "rounded-[7px] border-[2px] border-black px-3 py-1.5 text-[12px] font-bold text-white",
              "bg-red-500 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]",
              "transition-[transform,box-shadow] duration-150 hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none",
              "dark:border-[#EDE7DD] dark:shadow-[2px_2px_0px_0px_rgba(255,255,255,0.9)]",
            )}
          >
            {confirmLabel}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
