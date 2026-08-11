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
  onMenuAction: (callback: (action: string) => void) => () => void;
};

declare global {
  interface Window {
    electronAPI?: LumanDesktopAPI;
  }
}
