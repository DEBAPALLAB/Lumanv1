"use client";

import { Laptop, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

export function ThemeToggle() {
  const { setTheme, theme } = useTheme();
  // next-themes can't know the persisted theme until after mount (it reads
  // localStorage client-side only), so `theme` is undefined during SSR and
  // on the client's first render. Rendering against it before mount causes
  // a hydration mismatch — gate the active-state styling on mount instead.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const activeTheme = mounted ? theme : undefined;

  return (
    <div className="flex items-center gap-2">
      {/* Mode Toggle */}
      <div className="flex items-center border rounded-lg p-1">
        <button
          type="button"
          onClick={() => setTheme("light")}
          className={`p-1.5 rounded-md transition-colors ${
            activeTheme === "light" ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted/50"
          }`}
          title="Light Mode"
        >
          <Sun className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => setTheme("system")}
          className={`p-1.5 rounded-md transition-colors ${
            activeTheme === "system" ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted/50"
          }`}
          title="System Mode"
        >
          <Laptop className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => setTheme("dark")}
          className={`p-1.5 rounded-md transition-colors ${
            activeTheme === "dark" ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted/50"
          }`}
          title="Dark Mode"
        >
          <Moon className="h-4 w-4" />
        </button>
      </div>

    </div>
  );
}
