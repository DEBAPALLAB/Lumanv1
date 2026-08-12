"use client";

import { Minus, Square, X } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";

export function DesktopTitlebar({ children }: { children: ReactNode }) {
  const [isDesktop, setIsDesktop] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    const api = window.electronAPI;
    if (!api) return;

    setIsDesktop(true);
    api.window.isMaximized().then(setIsMaximized);
    return api.window.onMaximizeChange(setIsMaximized);
  }, []);

  if (!isDesktop) return children;

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <div className="flex h-8 w-full shrink-0 select-none items-center justify-between border-b border-border bg-background [-webkit-app-region:drag]">
        <span className="pl-3 text-xs text-muted-foreground">Luman</span>
        <div className="flex h-full [-webkit-app-region:no-drag]">
          <button
            type="button"
            aria-label="Minimize"
            onClick={() => window.electronAPI?.window.minimize()}
            className="flex h-full w-11 items-center justify-center hover:bg-muted"
          >
            <Minus className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            aria-label={isMaximized ? "Restore" : "Maximize"}
            onClick={() => window.electronAPI?.window.maximize()}
            className="flex h-full w-11 items-center justify-center hover:bg-muted"
          >
            <Square className="h-3 w-3" />
          </button>
          <button
            type="button"
            aria-label="Close"
            onClick={() => window.electronAPI?.window.close()}
            className="flex h-full w-11 items-center justify-center hover:bg-destructive hover:text-destructive-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      <div className="min-h-0 flex-1">{children}</div>
    </div>
  );
}
