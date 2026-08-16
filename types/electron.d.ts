/**
 * Shape of the IPC bridge exposed by the Electron preload script.
 * Undefined on the web build - always feature-detect before use.
 */
export type LumanDesktopAPI = {
  isDesktop: boolean;
  window: {
    minimize: () => Promise<void>;
    maximize: () => Promise<void>;
    close: () => Promise<void>;
    isMaximized: () => Promise<boolean>;
    onMaximizeChange: (callback: (isMaximized: boolean) => void) => () => void;
  };
  app: {
    getVersion: () => Promise<string>;
    getPlatform: () => string;
  };
  notification: {
    show: (title: string, body?: string) => Promise<void>;
  };
  shell: {
    openExternal: (url: string) => Promise<void>;
  };
  screen: {
    getSources: () => Promise<DesktopCaptureSource[]>;
    /** Nominates the source the next getDisplayMedia() call should resolve to. */
    selectSource: (sourceId: string) => Promise<boolean>;
    cancelSelection: () => Promise<void>;
  };
  onMenuAction: (callback: (action: string) => void) => () => void;
};

/** One shareable screen or window, as offered by the native picker. */
export type DesktopCaptureSource = {
  id: string;
  name: string;
  kind: "screen" | "window";
  /** Data URL preview, or null when the source could not be thumbnailed. */
  thumbnail: string | null;
  appIcon: string | null;
};

declare global {
  interface Window {
    electronAPI?: LumanDesktopAPI;
  }
}
